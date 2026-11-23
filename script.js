const chat = document.getElementById("chat");
const inp = document.getElementById("inp");
const sendBtn = document.getElementById("sendBtn");
const voiceToggle = document.getElementById("voiceToggle");
const voiceLabel = document.getElementById("voiceLabel");
const statusText = document.getElementById("statusText");
const botPanel = document.getElementById("botPanel");
const robotMouth = document.getElementById("robotMouth");
const fileInp = document.getElementById("fileInp");
const attachBtn = document.getElementById("attachBtn");
const micBtn = document.getElementById("micBtn");
const petSpeak = document.getElementById("petSpeak");
const player = document.getElementById("voicePlayer");
const toast = document.getElementById("toast");
const attachmentPreview = document.getElementById("attachmentPreview");
const chatList = document.getElementById("chatList");
const newChatBtn = document.getElementById("newChatBtn");
const sidebar = document.getElementById("sidebar");
const sidebarClose = document.getElementById("sidebarClose");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const menuBtn = document.getElementById("menuBtn");

const STORAGE_KEY = "turboai_chats_v2";
const WELCOME_TEXT = "Привет! Я TurboAI. Могу ответить на вопрос, разобрать фото или документ, создать презентацию и нарисовать изображение по описанию.";
let mouthTimer = null;
let speechGeneration = 0;
let busy = false;
let toastTimer = null;
let pendingAttachment = null;
let renamingId = null;
let storageWarningShown = false;

const BOT_ICON = `<svg class="mini-bot" width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="9" width="30" height="25" rx="10" stroke="currentColor" stroke-width="1.7"/><path d="M20 9V4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="20" cy="4" r="2" fill="currentColor"/><path d="M12 19h5m6 0h5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M15 27h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const SPEAKER_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 10v4h4l5 4V6l-5 4H5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M17 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const FILE_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 2h7l5 5v15H7V2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 2v6h5M10 13h6m-6 4h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v11H9l-4 3V5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l3.5-.7L19 7.8 16.2 5 4.7 16.5 4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replaceAll("-", "");
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createChatData(title = "Новый чат") {
    return { id: makeId(), title, messages: [], updatedAt: Date.now() };
}

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!saved || !Array.isArray(saved.chats)) throw new Error("empty");
        const chats = saved.chats.filter(item => item && typeof item.id === "string" && Array.isArray(item.messages));
        if (!chats.length) throw new Error("empty");
        return {
            chats,
            activeId: chats.some(item => item.id === saved.activeId) ? saved.activeId : chats[0].id
        };
    } catch {
        const first = createChatData();
        return { chats: [first], activeId: first.id };
    }
}

let appState = loadState();

function activeChat() {
    return appState.chats.find(item => item.id === appState.activeId) || appState.chats[0];
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch {
        if (!storageWarningShown) {
            storageWarningShown = true;
            showToast("Локальная память браузера заполнена. Старые чаты могут не сохраниться после перезагрузки.");
        }
    }
}

function setStatus(text, state = "idle") {
    statusText.textContent = text;
    botPanel.dataset.state = state;
}

function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
}

function setSidebar(open) {
    sidebar.classList.toggle("open", open);
    sidebarBackdrop.classList.toggle("visible", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) sidebarClose.focus();
}

function animateMouth(on) {
    clearInterval(mouthTimer);
    mouthTimer = null;
    if (on) {
        mouthTimer = setInterval(() => {
            const height = Math.floor(Math.random() * 23) + 8;
            robotMouth.setAttribute("height", String(height));
            robotMouth.setAttribute("y", String(151 - height / 2));
            robotMouth.setAttribute("rx", String(Math.min(7, height / 2)));
        }, 90);
    } else {
        robotMouth.setAttribute("height", "12");
        robotMouth.setAttribute("y", "145");
        robotMouth.setAttribute("rx", "6");
    }
}

function stopSpeech() {
    speechGeneration += 1;
    player.pause();
    player.removeAttribute("src");
    player.load();
    animateMouth(false);
}

async function speakText(text, force = false) {
    if (!text || (!force && !voiceToggle.checked)) return;
    const requestId = ++speechGeneration;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    player.pause();
    animateMouth(false);
    setStatus("Создаю голос…");

    try {
        const response = await fetch("/api/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Сервер озвучки недоступен");
        if (!data.audioUrl) throw new Error("Сервер не вернул ссылку на аудио");
        if (requestId !== speechGeneration) return;

        player.src = data.audioUrl;
        player.load();
        await player.play();
    } catch (error) {
        if (requestId !== speechGeneration) return;
        animateMouth(false);
        if (error.name === "NotAllowedError") {
            setStatus("Нажмите кнопку ещё раз");
            showToast("Браузер заблокировал автозапуск. Нажмите кнопку динамика у ответа.");
        } else if (error.name !== "AbortError" || !controller.signal.aborted) {
            setStatus("Голос недоступен");
            showToast(error.name === "AbortError" ? "Сервис озвучки отвечает слишком долго. Повторите запрос." : error.message || "Не удалось воспроизвести аудио");
        } else {
            setStatus("Голос недоступен");
            showToast("Сервис озвучки отвечает слишком долго. Повторите запрос.");
        }
    } finally {
        clearTimeout(timeout);
    }
}

player.addEventListener("playing", () => {
    setStatus("Говорю", "speaking");
    animateMouth(true);
});
player.addEventListener("timeupdate", () => {
    if (player.currentTime > 0 && !player.paused && botPanel.dataset.state !== "speaking") {
        setStatus("Говорю", "speaking");
        animateMouth(true);
    }
});
player.addEventListener("ended", () => {
    animateMouth(false);
    setStatus(voiceToggle.checked ? "Озвучка включена" : "Готов к диалогу");
});
player.addEventListener("pause", () => animateMouth(false));
player.addEventListener("error", () => {
    if (!player.getAttribute("src")) return;
    animateMouth(false);
    setStatus("Ошибка воспроизведения");
    showToast("Аудио не загрузилось. Проверьте соединение и повторите.");
});

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function fileExtension(name) {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop().toUpperCase() : "ФАЙЛ";
}

function createAttachmentCard(attachment, inMessage = false) {
    const card = document.createElement("div");
    card.className = inMessage ? "message-attachment" : "attachment-card";

    if (attachment.isImage && inMessage && attachment.url) {
        const image = document.createElement("img");
        image.className = "message-image";
        image.src = attachment.url;
        image.alt = attachment.name;
        card.appendChild(image);
    }

    const row = document.createElement("div");
    row.className = "attachment-row";
    if (attachment.isImage && !inMessage) {
        const image = document.createElement("img");
        image.className = "attachment-thumb";
        image.src = attachment.url;
        image.alt = "Предпросмотр изображения";
        row.appendChild(image);
    } else if (!attachment.isImage || !attachment.url) {
        const icon = document.createElement("div");
        icon.className = "attachment-file-icon";
        icon.innerHTML = FILE_ICON;
        row.appendChild(icon);
    }

    const info = document.createElement("div");
    info.className = "attachment-info";
    const name = document.createElement("div");
    name.className = "attachment-name";
    name.textContent = attachment.name;
    name.title = attachment.name;
    const size = document.createElement("div");
    size.className = "attachment-size";
    size.textContent = `${fileExtension(attachment.name)} · ${formatBytes(attachment.size)}${inMessage ? "" : " · Готово к отправке"}`;
    info.append(name, size);
    row.appendChild(info);

    if (!inMessage) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "attachment-remove";
        remove.title = "Удалить вложение";
        remove.setAttribute("aria-label", `Удалить вложение ${attachment.name}`);
        remove.innerHTML = CLOSE_ICON;
        remove.addEventListener("click", removePendingAttachment);
        row.appendChild(remove);
    }
    card.appendChild(row);
    return card;
}

function renderAttachmentPreview() {
    attachmentPreview.replaceChildren();
    if (!pendingAttachment) {
        attachmentPreview.hidden = true;
        return;
    }
    attachmentPreview.appendChild(createAttachmentCard(pendingAttachment));
    attachmentPreview.hidden = false;
}

function removePendingAttachment() {
    if (pendingAttachment?.url?.startsWith("blob:")) URL.revokeObjectURL(pendingAttachment.url);
    pendingAttachment = null;
    renderAttachmentPreview();
    inp.focus();
}

function setPendingAttachment(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
        showToast("Файл больше 15 МБ. Выберите файл меньшего размера.");
        return;
    }
    const extension = `.${fileExtension(file.name).toLowerCase()}`;
    const allowed = [".pdf", ".docx", ".txt", ".md", ".jpg", ".jpeg", ".png", ".webp"];
    if (!allowed.includes(extension)) {
        showToast("Поддерживаются PDF, DOCX, TXT, MD, JPG, PNG и WebP.");
        return;
    }
    removePendingAttachment();
    pendingAttachment = {
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        isImage: file.type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp"].includes(extension)
    };
    renderAttachmentPreview();
}

async function makeMessageAttachment(attachment) {
    if (!attachment) return null;
    const result = {
        name: attachment.name,
        size: attachment.size,
        isImage: attachment.isImage,
        url: null
    };
    if (attachment.isImage) result.url = await createPersistentPreview(attachment.file);
    return result;
}

function createPersistentPreview(file) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, 420 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext("2d");
            context.fillStyle = "#111510";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.76));
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        image.src = url;
    });
}

async function uploadAttachment(attachment, chatId) {
    const formData = new FormData();
    formData.append("file", attachment.file);
    formData.append("chatId", chatId);
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Не удалось загрузить файл");
    return data;
}

function addMsg(role, text, options = {}) {
    if (role === "u") {
        const message = document.createElement("div");
        message.className = "msg-user";
        if (options.attachment) message.appendChild(createAttachmentCard(options.attachment, true));
        if (text) {
            const content = document.createElement("div");
            content.className = "user-text";
            content.textContent = text;
            message.appendChild(content);
        }
        chat.appendChild(message);
    } else {
        const row = document.createElement("div");
        row.className = `msg-row-ai${options.error ? " msg-error" : ""}`;
        row.innerHTML = `${BOT_ICON}<div class="ai-bubble"><div class="ai-meta"></div><div class="ai-text"></div></div>`;
        row.querySelector(".ai-text").textContent = text;
        const bubble = row.querySelector(".ai-bubble");
        const meta = row.querySelector(".ai-meta");
        if (!options.error && !options.loading) {
            const speakButton = document.createElement("button");
            speakButton.className = "speak-msg";
            speakButton.type = "button";
            speakButton.title = "Озвучить ответ";
            speakButton.setAttribute("aria-label", "Озвучить ответ");
            speakButton.innerHTML = SPEAKER_ICON;
            speakButton.addEventListener("click", () => speakText(text, true));
            meta.appendChild(speakButton);
        }
        if (options.imageUrl) {
            const image = document.createElement("img");
            image.className = "generated-image";
            image.src = options.imageUrl;
            image.alt = "Изображение, созданное TurboAI";
            bubble.appendChild(image);
            const link = document.createElement("a");
            link.className = "download-link";
            link.href = options.downloadUrl || options.imageUrl;
            link.setAttribute("download", "");
            link.textContent = "Скачать изображение";
            bubble.appendChild(link);
        }
        if (options.pptxUrl) {
            const link = document.createElement("a");
            link.className = "download-link";
            link.href = options.pptxUrl;
            link.setAttribute("download", "");
            link.textContent = "Скачать презентацию";
            bubble.appendChild(link);
        }
        chat.appendChild(row);
    }
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
}

function renderMessages() {
    chat.replaceChildren();
    const current = activeChat();
    if (!current.messages.length) {
        addMsg("a", WELCOME_TEXT);
        return;
    }
    for (const message of current.messages) {
        addMsg(message.role === "user" ? "u" : "a", message.text || "", message);
    }
    chat.scrollTop = chat.scrollHeight;
}

function renderChatList() {
    chatList.replaceChildren();
    for (const item of appState.chats) {
        const row = document.createElement("div");
        row.className = `chat-item${item.id === appState.activeId ? " active" : ""}`;
        row.dataset.chatId = item.id;
        if (renamingId === item.id) {
            const input = document.createElement("input");
            input.className = "rename-input";
            input.value = item.title;
            input.maxLength = 48;
            input.setAttribute("aria-label", "Новое название чата");
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    finishRename(true);
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    finishRename(false);
                }
            });
            input.addEventListener("blur", () => finishRename(true));
            row.appendChild(input);
            chatList.appendChild(row);
            requestAnimationFrame(() => { input.focus(); input.select(); });
            continue;
        }

        const select = document.createElement("button");
        select.type = "button";
        select.className = "chat-select";
        select.title = item.title;
        select.innerHTML = CHAT_ICON;
        const name = document.createElement("span");
        name.className = "chat-name";
        name.textContent = item.title;
        select.appendChild(name);
        select.addEventListener("click", () => switchChat(item.id));

        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "chat-action";
        rename.title = "Переименовать чат";
        rename.setAttribute("aria-label", `Переименовать чат ${item.title}`);
        rename.innerHTML = EDIT_ICON;
        rename.addEventListener("click", () => startRename(item.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "chat-action delete";
        remove.title = "Удалить чат";
        remove.setAttribute("aria-label", `Удалить чат ${item.title}`);
        remove.innerHTML = TRASH_ICON;
        remove.addEventListener("click", () => deleteChat(item.id));
        row.append(select, rename, remove);
        chatList.appendChild(row);
    }
}

function renderAll() {
    renderChatList();
    renderMessages();
}

function startRename(chatId) {
    if (busy) {
        showToast("Дождитесь завершения текущего запроса.");
        return;
    }
    renamingId = chatId;
    renderChatList();
}

function finishRename(commit) {
    if (!renamingId) return;
    const item = appState.chats.find(entry => entry.id === renamingId);
    const input = chatList.querySelector(".rename-input");
    if (item && commit && input?.value.trim()) item.title = input.value.trim().slice(0, 48);
    renamingId = null;
    saveState();
    renderChatList();
}

function switchChat(chatId) {
    if (chatId === appState.activeId) {
        setSidebar(false);
        return;
    }
    if (busy) {
        showToast("Дождитесь завершения текущего запроса.");
        return;
    }
    stopSpeech();
    removePendingAttachment();
    appState.activeId = chatId;
    renamingId = null;
    saveState();
    renderAll();
    setSidebar(false);
    setStatus(voiceToggle.checked ? "Озвучка включена" : "Готов к диалогу");
    inp.focus();
}

function newChat() {
    if (busy) {
        showToast("Дождитесь завершения текущего запроса.");
        return;
    }
    stopSpeech();
    removePendingAttachment();
    const item = createChatData();
    appState.chats.unshift(item);
    appState.activeId = item.id;
    renamingId = null;
    saveState();
    renderAll();
    setSidebar(false);
    setStatus("Готов к диалогу");
    inp.focus();
}

async function deleteChat(chatId) {
    if (busy) {
        showToast("Дождитесь завершения текущего запроса.");
        return;
    }
    const item = appState.chats.find(entry => entry.id === chatId);
    if (!item || !window.confirm(`Удалить чат «${item.title}»?`)) return;
    stopSpeech();
    const index = appState.chats.findIndex(entry => entry.id === chatId);
    appState.chats.splice(index, 1);
    if (!appState.chats.length) appState.chats.push(createChatData());
    if (appState.activeId === chatId) {
        appState.activeId = appState.chats[Math.min(index, appState.chats.length - 1)].id;
        removePendingAttachment();
    }
    renamingId = null;
    saveState();
    renderAll();
    setSidebar(false);
    try {
        await fetch("/api/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId })
        });
    } catch {
        // Локальный чат уже удалён; серверная сессия исчезнет при перезапуске.
    }
}

function appendMessage(message) {
    const current = activeChat();
    current.messages.push(message);
    if (current.messages.length > 80) current.messages.splice(0, current.messages.length - 80);
    current.updatedAt = Date.now();
    saveState();
}

function showTyping() {
    const row = document.createElement("div");
    row.className = "msg-row-ai";
    row.id = "typingRow";
    row.innerHTML = `${BOT_ICON}<div class="ai-bubble"><div class="typing" aria-label="Формирую ответ"><i></i><i></i><i></i></div></div>`;
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
}

function hideTyping() {
    document.getElementById("typingRow")?.remove();
}

function setBusy(value) {
    busy = value;
    sendBtn.disabled = value;
    attachBtn.disabled = value;
    newChatBtn.disabled = value;
    inp.setAttribute("aria-busy", String(value));
}

async function sendMessage(custom = null) {
    if (busy) return;
    const text = (custom !== null ? custom : inp.value).trim();
    const attachment = pendingAttachment;
    if (!text && !attachment) return;

    const chatId = activeChat().id;
    if (custom === null) {
        inp.value = "";
        inp.style.height = "auto";
    }
    pendingAttachment = null;
    renderAttachmentPreview();
    setBusy(true);

    try {
        const storedAttachment = await makeMessageAttachment(attachment);
        const userMessage = { role: "user", text, attachment: storedAttachment };
        appendMessage(userMessage);
        addMsg("u", text, userMessage);
        if (attachment?.url?.startsWith("blob:")) URL.revokeObjectURL(attachment.url);

        const current = activeChat();
        if (current.title === "Новый чат") {
            current.title = (text || attachment?.name || "Новый чат").slice(0, 38);
            saveState();
            renderChatList();
        }

        let uploadData = null;
        if (attachment) {
            setStatus("Загружаю вложение…");
            uploadData = await uploadAttachment(attachment, chatId);
        }

        if (text) {
            showTyping();
            const imageRequest = /сгенер|нарису|изображени|картин|афиш|постер|баннер|логотип|обложк/i.test(text);
            setStatus(imageRequest ? "Создаю изображение…" : "Формирую ответ…", "thinking");
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, chatId })
            });
            const data = await response.json().catch(() => ({}));
            hideTyping();
            if (!response.ok) throw new Error(data.detail || "Ошибка соединения с сервером");
            const assistantMessage = {
                role: "assistant",
                text: data.reply || "Пустой ответ модели",
                error: data.ok === false,
                imageUrl: data.imageUrl || null,
                downloadUrl: data.downloadUrl || null,
                pptxUrl: data.pptxUrl || null
            };
            appendMessage(assistantMessage);
            addMsg("a", assistantMessage.text, assistantMessage);
            if (data.chatTitle && activeChat().messages.filter(message => message.role === "user").length === 1 && activeChat().title === text.slice(0, 38)) {
                activeChat().title = data.chatTitle;
                saveState();
            }
            renderChatList();
            setStatus("Готов к диалогу");
            if (data.ok !== false) await speakText(data.reply);
        } else {
            const assistantMessage = { role: "assistant", text: uploadData?.message || "Файл загружен" };
            appendMessage(assistantMessage);
            addMsg("a", assistantMessage.text);
            setStatus("Готов к диалогу");
        }
    } catch (error) {
        hideTyping();
        const assistantMessage = { role: "assistant", text: error.message || "Ошибка соединения с сервером.", error: true };
        appendMessage(assistantMessage);
        addMsg("a", assistantMessage.text, assistantMessage);
        setStatus("Ошибка отправки");
    } finally {
        setBusy(false);
        inp.focus();
    }
}

sendBtn.addEventListener("click", () => sendMessage());
newChatBtn.addEventListener("click", newChat);
menuBtn.addEventListener("click", () => setSidebar(true));
sidebarClose.addEventListener("click", () => { setSidebar(false); menuBtn.focus(); });
sidebarBackdrop.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && sidebar.classList.contains("open")) setSidebar(false);
});
window.matchMedia("(min-width: 901px)").addEventListener("change", event => {
    if (event.matches) setSidebar(false);
});

inp.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});
inp.addEventListener("input", () => {
    inp.style.height = "auto";
    inp.style.height = `${Math.min(inp.scrollHeight, 120)}px`;
});

document.addEventListener("paste", event => {
    const file = Array.from(event.clipboardData?.files || [])[0];
    if (!file) return;
    event.preventDefault();
    if (busy) {
        showToast("Дождитесь завершения текущего запроса.");
        return;
    }
    setPendingAttachment(file);
    inp.focus();
});

voiceToggle.addEventListener("change", () => {
    voiceLabel.textContent = voiceToggle.checked ? "Голос включён" : "Озвучка";
    if (voiceToggle.checked) {
        speakText("Голосовой режим включён.", true);
    } else {
        stopSpeech();
        setStatus("Готов к диалогу");
    }
});

petSpeak.addEventListener("click", () => {
    speakText("Привет! Голос работает, а мой рот движется вместе с речью.", true);
});

attachBtn.addEventListener("click", () => fileInp.click());
fileInp.addEventListener("change", () => {
    if (busy) return;
    setPendingAttachment(fileInp.files?.[0]);
    fileInp.value = "";
    inp.focus();
});

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.interimResults = false;
    micBtn.addEventListener("click", () => {
        if (busy) return;
        try {
            micBtn.classList.add("recording");
            setStatus("Слушаю…");
            recognition.start();
        } catch {
            micBtn.classList.remove("recording");
            showToast("Микрофон уже активен или недоступен");
        }
    });
    recognition.addEventListener("result", event => sendMessage(event.results[0][0].transcript));
    recognition.addEventListener("end", () => {
        micBtn.classList.remove("recording");
        if (!busy) setStatus("Готов к диалогу");
    });
    recognition.addEventListener("error", () => {
        micBtn.classList.remove("recording");
        setStatus("Ошибка микрофона");
        showToast("Разрешите доступ к микрофону в настройках браузера");
    });
} else {
    micBtn.hidden = true;
}

saveState();
renderAll();
setStatus("Готов к диалогу");
inp.focus();
