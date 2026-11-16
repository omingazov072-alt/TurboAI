import os
import subprocess
import sys

pkgs = ["fastapi", "uvicorn", "python-multipart", "requests", "edge-tts", "pypdf", "python-docx", "pyTelegramBotAPI"]
subprocess.check_call([sys.executable, "-m", "pip", "install", *pkgs])

import threading
import telebot
import uvicorn
from app import app

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
SITE_URL = "https://sslip.io"

def run_tg_bot():
    if not BOT_TOKEN:
        return
    bot = telebot.TeleBot(BOT_TOKEN)

    @bot.message_handler(commands=["start"])
    def start_msg(message):
        bot.send_message(message.chat.id, f"Привет! Веб-версия TurboAI доступна по ссылке:\n{SITE_URL}")

    bot.infinity_polling(skip_pending=True)

if __name__ == "__main__":
    threading.Thread(target=run_tg_bot, daemon=True).start()
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
