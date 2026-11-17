const chat = document.getElementById("chat");
const inp = document.getElementById("inp");
const sendBtn = document.getElementById("sendBtn");
const voiceToggle = document.getElementById("voiceToggle");
const lblSilent = document.getElementById("lblSilent");
const lblVoice = document.getElementById("lblVoice");
const statusText = document.getElementById("statusText");
const robotMouth = document.getElementById("robotMouth");
const fileInp = document.getElementById("fileInp");
const attachBtn = document.getElementById("attachBtn");
const clearBtn = document.getElementById("clearBtn");
const micBtn = document.getElementById("micBtn");

let mouthTimer = null;
let currentAudio = null;

function setStatus(t) { if (statusText) statusText.textContent = t; }

const BOT_ICON = `<svg class="mini-bot" width="32" height="32" viewBox="0 0 140 140" fill="none"><line x1="62" y1="36" x2="62" y2="52" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="62" cy="28" r="10" fill="#00c2ff"/><path d="M92 32 L102 18" stroke="#ec4899" stroke-width="6" stroke-linecap="round"/><path d="M106 44 L120 36" stroke="#ec4899" stroke-width="6" stroke-linecap="round"/><rect x="22" y="52" width="80" height="62" rx="31" fill="#0a0b10" stroke="#fff" stroke-width="8"/><path d="M39 78 Q46 69 53 78" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M71 78 Q78 69 85 78" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/><rect x="49" y="88" width="26" height="14" rx="4" fill="#2dd4bf"/></svg>`;

function addMsg(role, text) {
    if (!chat) return;
    if (role === "u") {
        const d = document.createElement("div");
        d.className = "msg-user";
        d.textContent = text;
        chat.appendChild(d);
    } else {
        const row = document.createElement("div");
        row.className = "msg-row-ai";
        row.innerHTML = BOT_ICON + `<div class="ai-bubble"><div class="ai-title">TURBOAI CORE</div><div class="ai-text"></div></div>`;
        row.querySelector(".ai-text").textContent = text;
        chat.appendChild(row);
    }
    chat.scrollTop = chat.scrollHeight;
}

function animateMouth(on) {
    if (!robotMouth) return;
    if (on) {
        if (mouthTimer) clearInterval(mouthTimer);
        mouthTimer = setInterval(() => {
            const h = Math.floor(Math.random() * 14) + 6;
            robotMouth.setAttribute("height", h);
            robotMouth.setAttribute("y", 95 - Math.floor(h / 2));
        }, 100);
    } else {
        clearInterval(mouthTimer);
        mouthTimer = null;
        robotMouth.setAttribute("height", "15");
        robotMouth.setAttribute("y", "88");
    }
}

async function speakText(text) {
    if (!voiceToggle || !voiceToggle.checked) return;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setStatus("СИНТЕЗ ГОЛОСА...");

    // 1. Если вы зашли с домашнего ПК и запущен F5-TTS, озвучиваем вашим голосом
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 1200);
        const localRes = await fetch("http://127.0.0", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: ctrl.signal
        });
        clearTimeout(tid);
        if (localRes.ok) {
            const blob = await localRes.blob();
            const url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            currentAudio.onplay = () => { setStatus("ГОВОРЮ..."); animateMouth(true); };
            currentAudio.onended = () => { setStatus("СИСТЕМА ГОТОВА"); animateMouth(false); URL.revokeObjectURL(url); };
            await currentAudio.play();
            return;
        }
    } catch (e) {}

    // 2. Иначе озвучиваем низким мужским баритоном с сервера BotHost
    try {
        const res = await fetch("/api/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            currentAudio.onplay = () => { setStatus("ГОВОРЮ..."); animateMouth(true); };
            currentAudio.onended = () => { setStatus("СИСТЕМА ГОТОВА"); animateMouth(false); URL.revokeObjectURL(url); };
            await currentAudio.play();
        }
    } catch (e) {
        setStatus("СИСТЕМА ГОТОВА");
    }
}

async function sendMessage(custom = null) {
    if (!inp) return;
    const text = (custom !== null ? custom : inp.value).trim();
    if (!text) return;
    if (custom === null) inp.value = "";
    addMsg("u", text);
    setStatus("ДУМАЮ...");
    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        addMsg("a", data.reply);
        setStatus("СИСТЕМА ГОТОВА");
        await speakText(data.reply);
    } catch (e) {
        addMsg("a", "Ошибка соединения с сервером.");
        setStatus("ОШИБКА СЕТИ");
    }
}

if (sendBtn) sendBtn.onclick = () => sendMessage();
if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

if (voiceToggle) voiceToggle.onchange = () => {
    if (voiceToggle.checked) {
        if (lblSilent) lblSilent.classList.remove("on");
        if (lblVoice) lblVoice.classList.add("on");
        speakText("Голосовой режим включён.");
    } else {
        if (lblVoice) lblVoice.classList.remove("on");
        if (lblSilent) lblSilent.classList.add("on");
        if (currentAudio) currentAudio.pause();
        animateMouth(false);
        setStatus("РЕЖИМ ТЕКСТА");
    }
};

if (attachBtn && fileInp) {
    attachBtn.onclick = () => fileInp.click();
    fileInp.onchange = async () => {
        if (!fileInp.files || !fileInp.files.length) return;
        const f = fileInp.files[0];
        addMsg("u", "📎 " + f.name);
        setStatus("ЗАГРУЗКА ФАЙЛА...");
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        addMsg("a", data.reply);
        setStatus("СИСТЕМА ГОТОВА");
        fileInp.value = "";
    };
}

if (clearBtn) clearBtn.onclick = async () => {
    await fetch("/api/clear", { method: "POST" });
    if (chat) chat.innerHTML = "";
    addMsg("a", "Память диалога очищена.");
};

if (micBtn && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    micBtn.onclick = () => { micBtn.classList.add("recording"); setStatus("СЛУШАЮ..."); rec.start(); };
    rec.onresult = (e) => sendMessage(e.results[0][0].transcript);
    rec.onend = () => { micBtn.classList.remove("recording"); setStatus("СИСТЕМА ГОТОВА"); };
    rec.onerror = () => { micBtn.classList.remove("recording"); setStatus("ОШИБКА МИКРОФОНА"); };
}
