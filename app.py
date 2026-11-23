import asyncio
import base64
import io
import json
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List

import edge_tts
import requests
import uvicorn
from docx import Document
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pypdf import PdfReader
from pptx import Presentation

ROUTER_API_KEY = os.getenv(
    "ROUTER_API_KEY",
    "sk-0BMWXzCc7x51aGbStSG83eZUOnNoeecc9EZTWDlxZcGvKLMp",
)
API_URL = os.getenv("ROUTER_API_URL", "https://routerapi.ru/api/v1/chat/completions")
CHAT_MODELS = tuple(
    model.strip()
    for model in os.getenv(
        "ROUTER_MODELS",
        "google/gemini-2.5-flash,openai/gpt-4o,gpt-4o-mini",
    ).split(",")
    if model.strip()
)
IMAGE_MODELS = tuple(
    model.strip()
    for model in os.getenv(
        "ROUTER_IMAGE_MODELS",
        "google/gemini-2.5-flash-image,google/gemini-3.1-flash-image",
    ).split(",")
    if model.strip()
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GEN_DIR = os.path.join(BASE_DIR, "generated")
os.makedirs(GEN_DIR, exist_ok=True)

MONTHS_RU = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]

now = datetime.now()
SYSTEM_PROMPT = (
    "Ты — TurboAI, универсальный ИИ-ассистент. "
    "Отвечай точно, ясно и по существу на естественном русском языке. "
    "Для задач и кода сначала дай рабочее решение, затем краткие пояснения. "
    "Внимательно анализируй загруженные документы и изображения. "
    "Если пользователь загрузил изображение, опиши его содержимое и ответь на вопрос по нему. "
    f"Сегодня {now.day} {MONTHS_RU[now.month - 1]} {now.year} года."
)

DEFAULT_CHAT_ID = "default"
chat_sessions: Dict[str, Dict[str, Any]] = {}


class CompletionError(RuntimeError):
    pass


class UserMessage(BaseModel):
    text: str
    chatId: str = DEFAULT_CHAT_ID


class SpeechMessage(BaseModel):
    text: str


class ClearMessage(BaseModel):
    chatId: str = DEFAULT_CHAT_ID


def safe_chat_id(chat_id: str | None) -> str:
    value = (chat_id or DEFAULT_CHAT_ID).strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise HTTPException(status_code=422, detail="Некорректный идентификатор чата")
    return value


def get_session(chat_id: str | None) -> Dict[str, Any]:
    key = safe_chat_id(chat_id)
    if key not in chat_sessions:
        if len(chat_sessions) >= 200:
            oldest = next(iter(chat_sessions))
            chat_sessions.pop(oldest, None)
        chat_sessions[key] = {
            "history": [{"role": "system", "content": SYSTEM_PROMPT}],
            "image": None,
        }
    return chat_sessions[key]


def clean(text: str) -> str:
    if not isinstance(text, str):
        return "Готово."
    return text.replace("*", "").replace("#", "").replace("`", "").strip() or "Готово."


def extract_text_from_api(data: Any) -> str:
    if isinstance(data, list):
        data = next(iter(data), {})
    if not isinstance(data, dict):
        return str(data).strip()
    if "error" in data:
        error = data["error"]
        message = error.get("message", str(error)) if isinstance(error, dict) else str(error)
        raise CompletionError(str(message))
    choices = data.get("choices") or []
    first = next(iter(choices), {}) if isinstance(choices, list) else choices
    message = first.get("message", {}) if isinstance(first, dict) else {}
    if isinstance(message, list):
        message = next(iter(message), {})
    content = message.get("content") if isinstance(message, dict) else message
    if isinstance(content, list):
        return "".join(
            str(part.get("text", "")) if isinstance(part, dict) else str(part)
            for part in content
        ).strip()
    if not content and isinstance(message, dict):
        content = message.get("reasoning_content")
    return str(content or "").strip()


def response_error(response: requests.Response) -> str:
    try:
        payload = response.json()
        error = payload.get("error", payload) if isinstance(payload, dict) else payload
        if isinstance(error, dict):
            return str(error.get("message") or error.get("code") or error)[:350]
        return str(error)[:350]
    except (ValueError, TypeError):
        return response.text.strip()[:350] or "Пустой ответ провайдера"


def request_completion(
    messages: List[Dict[str, Any]],
    models: tuple[str, ...] = CHAT_MODELS,
    timeout: int = 45,
    max_tokens: int = 1800,
) -> tuple[str, str]:
    if not ROUTER_API_KEY:
        raise CompletionError("Не настроен ROUTER_API_KEY. Добавьте ключ в переменные окружения.")

    errors: list[str] = []
    status_codes: list[int] = []
    for model in models:
        try:
            response = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {ROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "messages": messages, "max_tokens": max_tokens},
                timeout=timeout,
            )
            if response.status_code == 200:
                text = extract_text_from_api(response.json()).strip()
                if text:
                    return text, model
                errors.append(f"{model}: пустой ответ")
                continue

            status_codes.append(response.status_code)
            detail = response_error(response)
            errors.append(f"{model} ({response.status_code}): {detail}")
            if response.status_code == 401:
                break
        except requests.RequestException as exc:
            errors.append(f"{model}: {type(exc).__name__}")
        except (ValueError, CompletionError) as exc:
            errors.append(f"{model}: {str(exc)[:250]}")

    if 401 in status_codes:
        raise CompletionError("API-ключ отклонён (401). Проверьте ROUTER_API_KEY.")
    if 403 in status_codes:
        raise CompletionError(
            "Провайдер запретил доступ к модели (403). Проверьте тариф, лимит и доступ к выбранной модели. "
            + (errors[-1] if errors else "")
        )
    if status_codes and all(code == 404 for code in status_codes):
        raise CompletionError(
            "Настроенные модели не найдены (404). Обновите ROUTER_MODELS по каталогу RouterAPI."
        )
    if 429 in status_codes:
        raise CompletionError("Превышен лимит запросов (429). Подождите немного и повторите.")
    raise CompletionError("Не удалось получить ответ модели. " + (errors[-1] if errors else "Проверьте сеть."))


def is_image_request(text: str) -> bool:
    lowered = text.lower().replace("ё", "е")
    nouns = r"(?:изображени\w*|картин\w*|афиш\w*|постер\w*|баннер\w*|логотип\w*|облож\w*|иллюстраци\w*)"
    patterns = [
        r"\b(?:сгенерир\w*|нарису\w*|изобрази\w*)\b",
        rf"\b(?:сдела\w*|созда\w*|придума\w*|разработа\w*)\s+(?:мне\s+)?{nouns}\b",
        rf"\b{nouns}\s+(?:по\s+описанию|для|на\s+тему)\b",
    ]
    return any(re.search(pattern, lowered) for pattern in patterns)


def save_generated_image(url: str) -> str:
    extension = ".png"
    if url.startswith("data:"):
        header, encoded = url.split(",", 1)
        mime = header[5:].split(";", 1)[0].lower()
        extension = {"image/jpeg": ".jpg", "image/webp": ".webp"}.get(mime, ".png")
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as exc:
            raise CompletionError("Модель вернула повреждённые данные изображения") from exc
    elif url.startswith("https://") or url.startswith("http://"):
        try:
            image_response = requests.get(url, timeout=60)
            image_response.raise_for_status()
        except requests.RequestException as exc:
            raise CompletionError("Не удалось скачать готовое изображение") from exc
        raw = image_response.content
        mime = image_response.headers.get("Content-Type", "").split(";", 1)[0].lower()
        extension = {"image/jpeg": ".jpg", "image/webp": ".webp"}.get(mime, ".png")
    else:
        raise CompletionError("Модель вернула неподдерживаемый формат изображения")

    if not raw or len(raw) > 25 * 1024 * 1024:
        raise CompletionError("Получено пустое или слишком большое изображение")
    filename = f"image_{uuid.uuid4().hex[:12]}{extension}"
    with open(os.path.join(GEN_DIR, filename), "wb") as file:
        file.write(raw)
    return f"/generated/{filename}"


def generate_image(prompt: str, image_data: str | None = None) -> str:
    if not ROUTER_API_KEY:
        raise CompletionError("Не настроен ROUTER_API_KEY. Добавьте ключ в переменные окружения.")

    content: Any = prompt
    if image_data:
        content = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_data}},
        ]
    errors: list[str] = []
    for model in IMAGE_MODELS:
        try:
            response = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {ROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": content}],
                    "modalities": ["text", "image"],
                },
                timeout=150,
            )
            if response.status_code != 200:
                errors.append(f"{model} ({response.status_code}): {response_error(response)}")
                if response.status_code == 401:
                    break
                continue
            data = response.json()
            choices = data.get("choices") or []
            message = choices[0].get("message", {}) if choices else {}
            images = message.get("images") or []
            for item in images:
                url = (item.get("image_url") or {}).get("url") or item.get("url")
                if url:
                    return save_generated_image(url)
            content_parts = message.get("content")
            if isinstance(content_parts, list):
                for part in content_parts:
                    if isinstance(part, dict) and part.get("type") in ("image_url", "output_image"):
                        url = (part.get("image_url") or {}).get("url") or part.get("url")
                        if url:
                            return save_generated_image(url)
            errors.append(f"{model}: ответ не содержит изображения")
        except requests.RequestException as exc:
            errors.append(f"{model}: {type(exc).__name__}")
        except (ValueError, KeyError, IndexError, CompletionError) as exc:
            errors.append(f"{model}: {str(exc)[:220]}")

    raise CompletionError(
        "Не удалось создать изображение. " + (errors[-1] if errors else "Проверьте соединение.")
    )


@app.get("/")
async def index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/script.js")
async def script():
    return FileResponse(os.path.join(BASE_DIR, "script.js"))


@app.get("/generated/{filename}")
async def get_generated(filename: str):
    if filename != os.path.basename(filename):
        raise HTTPException(status_code=400, detail="Некорректное имя файла")
    path = os.path.join(GEN_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(path)


@app.post("/api/clear")
async def clear(msg: ClearMessage | None = None):
    chat_id = safe_chat_id(msg.chatId if msg else DEFAULT_CHAT_ID)
    chat_sessions.pop(chat_id, None)
    return {"status": "ok"}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), chatId: str = Form(DEFAULT_CHAT_ID)):
    session = get_session(chatId)
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файл больше 15 МБ")
    ext = os.path.splitext(file.filename or "")[1].lower()

    if ext in [".jpg", ".jpeg", ".png", ".webp"]:
        mime = {
            ".png": "image/png",
            ".webp": "image/webp",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }[ext]
        session["image"] = f"data:{mime};base64," + base64.b64encode(raw).decode("utf-8")
        return {"message": f"Фото «{file.filename}» загружено. Задайте по нему вопрос."}

    try:
        text = ""
        if ext == ".pdf":
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:6])
        elif ext == ".docx":
            document = Document(io.BytesIO(raw))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {exc}") from exc

    session["history"].append({"role": "user", "content": f"Файл {file.filename}:\n{text[:6000]}"})
    return {"message": f"Документ «{file.filename}» прочитан. Можете задавать вопросы."}


async def synthesize_speech(text: str) -> bytes:
    communicate = edge_tts.Communicate(
        text,
        voice="ru-RU-DmitryNeural",
        pitch="-15Hz",
        rate="-2%",
    )
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)


@app.post("/api/tts")
@app.post("/api/speak")
async def speak(msg: SpeechMessage):
    cleaned_text = re.sub(r"\s+", " ", clean(msg.text)).strip()
    audio = None
    errors: list[Exception] = []
    for attempt in range(3):
        try:
            audio = await asyncio.wait_for(synthesize_speech(cleaned_text[:1200]), timeout=35)
            if audio:
                break
        except Exception as exc:
            errors.append(exc)
        if attempt < 2:
            await asyncio.sleep(0.8 * (attempt + 1))

    if not audio:
        if errors and isinstance(errors[-1], (TimeoutError, asyncio.TimeoutError)):
            raise HTTPException(status_code=504, detail="Сервис озвучки не ответил вовремя. Повторите запрос.")
        detail = str(errors[-1])[:180] if errors else "Сервис вернул пустое аудио"
        raise HTTPException(
            status_code=502,
            detail=(
                "Голосовой сервис Microsoft недоступен на сервере. "
                "Для BotHost проверьте внешний доступ к API и повторите деплой. "
                f"Причина: {detail}"
            ),
        )

    filename = f"tts_{uuid.uuid4().hex[:12]}.mp3"
    with open(os.path.join(GEN_DIR, filename), "wb") as file:
        file.write(audio)
    return {"audioUrl": f"/generated/{filename}", "voice": "ru-RU-DmitryNeural"}


def build_presentation(topic: str) -> tuple[str, list, dict]:
    prompt = (
        f"Создай структуру презентации из 5 слайдов на русском языке по запросу: {topic}. "
        "Учти пожелания пользователя по цветовой палитре. Не используй квадратные скобки-заглушки. "
        "Верни СТРОГО JSON-объект без markdown-обёрток: "
        '{"bg": "#0f1320", "accent": "#b8f345", "text": "#ebf0ff", "slides": ['
        '{"title": "Заголовок", "bullets": ["Тезис 1", "Тезис 2", "Тезис 3"], '
        '"img_prompt": "short english visual description"}]}'
    )
    raw, _ = request_completion(
        [{"role": "user", "content": prompt}],
        models=("google/gemini-2.5-flash", "openai/gpt-4o", "gpt-4o-mini"),
        max_tokens=2400,
    )
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise CompletionError("Модель не вернула JSON структуры слайдов")
    presentation = json.loads(raw[start:end])
    slides_data = presentation.get("slides") or []
    if not slides_data:
        raise CompletionError("Модель вернула пустую презентацию")
    palette = {
        "bg": presentation.get("bg", "#0f1320"),
        "accent": presentation.get("accent", "#b8f345"),
        "text": presentation.get("text", "#ebf0ff"),
    }

    prs = Presentation()
    layout = prs.slide_layouts[1]
    for item in slides_data:
        slide = prs.slides.add_slide(layout)
        if slide.shapes.title:
            slide.shapes.title.text = str(item.get("title", ""))
        body = next((shape for idx, shape in enumerate(slide.placeholders) if idx == 1), None)
        if body and body.has_text_frame:
            body.text = "\n".join(str(bullet) for bullet in (item.get("bullets") or []))

    filename = f"presentation_{uuid.uuid4().hex[:8]}.pptx"
    prs.save(os.path.join(GEN_DIR, filename))
    return f"/generated/{filename}", slides_data, palette


@app.post("/api/chat")
async def chat(msg: UserMessage):
    session = get_session(msg.chatId)
    text = msg.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Введите сообщение")

    if is_image_request(text):
        image_data = session["image"]
        session["image"] = None
        try:
            image_url = await asyncio.to_thread(generate_image, text, image_data)
            reply = "Готово — создал изображение по вашему описанию."
            session["history"].append({"role": "user", "content": text})
            session["history"].append({"role": "assistant", "content": reply})
            return {
                "ok": True,
                "reply": reply,
                "imageUrl": image_url,
                "downloadUrl": image_url,
                "chatTitle": "Генерация изображения",
            }
        except CompletionError as exc:
            return {"ok": False, "reply": str(exc)}

    if any(word in text.lower() for word in ["презентац", "призентац", "слайд"]):
        try:
            pptx_url, slides_data, palette = await asyncio.to_thread(build_presentation, text)
            reply = f"Готово! Собрал презентацию из {len(slides_data)} слайдов."
            session["history"].append({"role": "assistant", "content": reply})
            return {
                "ok": True,
                "reply": reply,
                "pptxUrl": pptx_url,
                "slides": slides_data,
                "palette": palette,
                "chatTitle": "Презентация",
            }
        except Exception as exc:
            return {"ok": False, "reply": f"Не удалось создать презентацию. {exc}"}

    content: Any = text
    if session["image"]:
        content = [
            {"type": "text", "text": text},
            {"type": "image_url", "image_url": {"url": session["image"]}},
        ]
        session["image"] = None

    session["history"].append({"role": "user", "content": content})
    history = session["history"]
    try:
        reply, model = await asyncio.to_thread(request_completion, history[-12:])
        reply = clean(reply)
    except CompletionError as exc:
        history.pop()
        return {"ok": False, "reply": str(exc)}

    history.append({"role": "assistant", "content": reply})
    chat_title = None
    if len(history) <= 3:
        try:
            title_prompt = (
                "Придумай короткое название чата (2-4 слова) по сообщению пользователя. "
                "Верни ТОЛЬКО название без кавычек и точек.\n"
                f"Сообщение: {text}"
            )
            title, _ = await asyncio.to_thread(
                request_completion,
                [{"role": "user", "content": title_prompt}],
                ("google/gemini-2.5-flash", "gpt-4o-mini"),
                12,
                30,
            )
            chat_title = title.strip(" \"'.\n")[:40] or None
        except (CompletionError, requests.RequestException):
            pass

    return {"ok": True, "reply": reply, "chatTitle": chat_title, "model": model}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
