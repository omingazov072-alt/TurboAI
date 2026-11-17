import json
import uuid
import base64
import io
import os
import edge_tts
import requests
import uvicorn
from datetime import datetime, timedelta, timezone
from pptx import Presentation
from docx import Document
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from pypdf import PdfReader

ROUTER_API_KEY = "sk-afmU377JD3dwSC11FaD9cFmha1BWOmIQ0BtAulJx5ENtkoAo"
API_URL = "https://" + "routerapi.ru/api/v1/chat/completions"
MODEL_NAME = "gemini-2.5-flash"

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT = (
    "Ты — универсальная нейросеть и умный наставник TurboAI со всеми энциклопедическими знаниями, "
    "владеющая литературой, биографиями исторических личностей, науками, актуальной погодой и дизайном презентаций.\n"
    "ПРАВИЛА РАБОТЫ:\n"
    "1. РЕЖИМ РЕПЕТИТОРА (ЗАДАЧИ И ПРИМЕРЫ): Никогда не давай готовый ответ сразу, чтобы пользователь не мог просто списать. "
    "Сначала дай нужную формулу (или правило), объясни смысл переменных и первый шаг решения. "
    "Если пользователь прислал своё решение и ошибся — мягко укажи конкретное место ошибки, объясни почему так нельзя и помоги исправить.\n"
    "2. ЛИТЕРАТУРА И БИОГРАФИИ: Делай структурные, глубокие пересказы книг, анализ героев и тем, "
    "а также увлекательно рассказывай биографии великих людей с ключевыми датами и фактами.\n"
    "3. ОБЩЕНИЕ И ПОГОДА: Отвечай на чистом русском языке, чётко, дружелюбно и по делу."
)
chat_history = [{"role": "system", "content": SYSTEM_PROMPT}]
uploaded_image_b64 = None

class UserMessage(BaseModel):
    text: str

@app.get("/")
async def index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/script.js")
async def script():
    return FileResponse(os.path.join(BASE_DIR, "script.js"))

@app.post("/api/clear")
async def clear():
    global chat_history, uploaded_image_b64
    chat_history = [{"role": "system", "content": SYSTEM_PROMPT}]
    uploaded_image_b64 = None
    return {"status": "ok"}

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    global uploaded_image_b64
    raw = await file.read()
    ext = os.path.splitext(file.filename)[1].lower()
    if ext in [".jpg", ".jpeg", ".png", ".webp"]:
        mime = "image/png" if ext == ".png" else "image/jpeg"
        uploaded_image_b64 = f"data:{mime};base64," + base64.b64encode(raw).decode("utf-8")
        return {"reply": f"Фото «{file.filename}» загружено. Задайте по нему вопрос."}
    text = ""
    if ext == ".pdf":
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(p.extract_text() or "" for p in reader.pages[:6])
    elif ext == ".docx":
        doc = Document(io.BytesIO(raw))
        text = "\n".join(p.text for p in doc.paragraphs)
    else:
        text = raw.decode("utf-8", errors="ignore")
    chat_history.append({"role": "user", "content": f"Файл {file.filename}:\n{text[:6000]}"})
    return {"reply": f"Документ «{file.filename}» прочитан. Можете задавать вопросы."}

@app.post("/api/speak")
async def speak(msg: UserMessage):
    clean = msg.text.replace("*", "").replace("#", "").replace("`", "").strip() or "Готово."
    communicate = edge_tts.Communicate(clean[:700], voice="ru-RU-DmitryNeural", pitch="-15Hz", rate="-2%")
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return Response(content=bytes(audio), media_type="audio/mpeg")
def build_presentation(topic: str):
    prompt = (
        f"Создай структуру презентации из 5 слайдов на русском языке по запросу: {topic}. "
        f"Учти пожелания пользователя по цветовой палитре (если цвета не указаны, выбери стильную палитру сам). "
        f"Верни СТРОГО JSON-объект без markdown-обёрток: "
        f'{{"bg": "#0f1320", "accent": "#38e8ff", "text": "#ebf0ff", "slides": ['
        f'{{"title": "Заголовок", "bullets": ["Тезис 1", "Тезис 2", "Тезис 3"], "img_prompt": "short english visual description"}}]}}'
    )
    res = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {ROUTER_API_KEY}", "Content-Type": "application/json"},
        json={"model": "gemini-2.5-pro", "messages": [{"role": "user", "content": prompt}]},
        timeout=35
    )
    raw = res.json()["choices"][0]["message"]["content"]
    clean_json = raw[raw.find("{"):raw.rfind("}") + 1]
    pres_obj = json.loads(clean_json)
    slides_data = pres_obj.get("slides", [])
    palette = {
        "bg": pres_obj.get("bg", "#0f1320"),
        "accent": pres_obj.get("accent", "#38e8ff"),
        "text": pres_obj.get("text", "#ebf0ff")
    }

    prs = Presentation()
    for item in slides_data:
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = str(item.get("title", ""))
        slide.placeholders[1].text = "\n".join(str(b) for b in item.get("bullets", []))

    pptx_name = f"presentation_{uuid.uuid4().hex[:8]}.pptx"
    prs.save(os.path.join(GEN_DIR, pptx_name))
    return f"/generated/{pptx_name}", slides_data, palette

@app.post("/api/chat")
async def chat(msg: UserMessage):
    global uploaded_image_b64
    reply = ""
    if any(w in msg.text.lower() for w in ["презентацию", "призентации", "слайд"]):                   try:
             pptx_url, slides_data, palette = build_presentation(msg.text)
             reply = f"Готово! Собрал презентацию из {len(slides_data)} слайдов:"
            chat_history.append({"role": "assistant", "content": reply})
             return {"reply": reply, "pptxUrl": pptx_url, "slides": slides_data, "palette": palette}
        except Exception as e:
            return {"reply": f"Ошибка генерации слайдов: {e}"}


    content = msg.text
    if uploaded_image_b64:
        content = [
            {"type": "text", "text": msg.text},
            {"type": "image_url", "image_url": {"url": uploaded_image_b64}}
        ]
        uploaded_image_b64 = None
    chat_history.append({"role": "user", "content": content})
    try:
        models = ["gemini-2.5-pro", "gpt-4o", "deepseek-r1", "gemini-2.5-flash"]
        res = None
        for m in models:
            r = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {ROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={"model": m, "messages": chat_history[-12:]},
                timeout=30
            )
            if r.status_code == 200 and r.text.strip():
                res = r
                break
        if res is None:
            return {"reply": f"Все модели временно заняты (код {r.status_code}). Попробуйте ещё раз."}
            data = res.json()
            if "error" in data:
                reply = f"Ошибка RouterAPI: {data['error'].get('message', str(data['error']))}"
            else:
                reply = data.get("choices", [{}])[0].get("message", {}).get("content") or "Нет ответа."
    except Exception as err:
        reply = f"Ошибка связи с сервером: {err}"
    chat_history.append({"role": "assistant", "content": reply})
    return {"reply": reply}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
