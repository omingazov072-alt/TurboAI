import os
import subprocess
import sys

pkgs = ["fastapi", "uvicorn", "python-multipart", "requests", "edge-tts", "pypdf", "python-docx", "python-pptx"]
subprocess.check_call([sys.executable, "-m", "pip", "install", *pkgs])

import uvicorn
from app import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
