import base64
import io
import os
import edge_tts
import requests
import uvicorn
from docx import Document
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from pypdf import PdfReader

ROUTER_API_KEY = "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"

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT = "Ты — продвинутый ИИ-ассистент TurboAI уровня Google Gemini. Отвечай на чистом русском языке, умно, структурированно и по делу."
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
    ext = os.path.splitext(file.filename).lower()
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

@app.post("/api/chat")
async def chat(msg: UserMessage):
    global uploaded_image_b64
    content = msg.text
    if uploaded_image_b64:
        content = [
            {"type": "text", "text": msg.text},
            {"type": "image_url", "image_url": {"url": uploaded_image_b64}}
        ]
        uploaded_image_b64 = None
    chat_history.append({"role": "user", "content": content})
    try:
        res = requests.post(
            "https://routerapi.ru",
            headers={
                "Authorization": f"Bearer {ROUTER_API_KEY}",
                "Content-Type": "application/json"
            },
            json={"model": "gemini-2.5-flash", "messages": chat_history[-12:]},
            timeout=25
        )
        data = res.json()
        if "error" in data:
            reply = f"Ошибка RouterAPI: {data['error'].get('message', str(data['error']))}"
        else:
            reply = data.get("choices", [{}])[0].get("message", {}).get("content") or "Нет ответа."
    except Exception as e:
        reply = f"Ошибка связи с сервером: {e}"
    chat_history.append({"role": "assistant", "content": reply})
    return {"reply": reply}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
