const socket = io();

let myUsername = "";

// ── DOM refs ────────────────────────────────────────────────────────────────
const joinScreen = document.getElementById("join-screen");
const chatScreen = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username-input");
const emailInput = document.getElementById("email-input"); // Add reference for email
const passwordInput = document.getElementById("password-input");
const joinBtn = document.getElementById("join-btn");
const registerBtn = document.getElementById("register-btn"); // Add reference for register button
const messages = document.getElementById("messages");
const msgInput = document.getElementById("msg-input");
const sendBtn = document.getElementById("send-btn");
const userList = document.getElementById("user-list");
const onlineCount = document.getElementById("online-count");
const typingEl = document.getElementById("typing-indicator");
const myNameBadge = document.getElementById("my-name-badge");
const loginError = document.getElementById("login-error"); // Assuming you add an element with this ID for errors

// ── Join ────────────────────────────────────────────────────────────────────
async function doJoin(){

    try {
        if(!usernameInput || !passwordInput) {
            console.error("Error: One or more required elements not found");
        }
        else {
            const name = usernameInput.value.trim();
            if (!name) { usernameInput.focus(); return; }
            myUsername = name;
            socket.emit("join", name, passwordInput.value); // No need to trim password here
        }
    } catch (e) {
        console.error("Error initializing socket connection:", e);
    }
}

async function doRegister() {
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!username || !email || !password) {
        loginError.textContent = "Username, email, and password are required.";
        loginError.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        });

        const result = await response.json();

        if (response.ok) {
            loginError.style.color = 'green'; // Success message
            loginError.textContent = result.message;
            loginError.style.display = 'block';
        } else {
            loginError.style.color = 'red'; // Error message
            loginError.textContent = result.message;
            loginError.style.display = 'block';
        }
    } catch (error) {
        loginError.textContent = "Failed to connect to the server.";
        loginError.style.display = 'block';
    }
}

if (joinBtn) joinBtn.addEventListener("click", doJoin);
if (registerBtn) registerBtn.addEventListener("click", doRegister);
usernameInput.addEventListener("keydown", e => { if (e.key === "Enter") doJoin(); });
passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") doJoin(); });

// ── Helpers ─────────────────────────────────────────────────────────────────
function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name) {
    return name.slice(0, 2).toUpperCase();
}

function addSystemMsg(text) {
    const div = document.createElement("div");
    div.className = "sys-msg";
    div.innerHTML = `<span>${text}</span>`;
    messages.appendChild(div);
    scrollBottom();
}

function addMessage({ username, text, timestamp }) {
    const isMe = username === myUsername;
    const row = document.createElement("div");
    row.className = `msg-row ${isMe ? "me" : "other"}`;

    const avatar = `<div class="avatar">${getInitials(username)}</div>`;
    const senderLabel = isMe ? "" : `<div class="sender-name">${username}</div>`;

    row.innerHTML = `
      ${avatar}
      <div class="bubble-wrap">
        ${senderLabel}
        <div class="bubble">
          ${escapeHtml(text)}
          <span class="time">${formatTime(timestamp)}</span>
        </div>
      </div>
    `;
    messages.appendChild(row);
    scrollBottom();
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function updateUserList(users) {
    userList.innerHTML = "";
    users.forEach(u => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="dot"></span>${escapeHtml(u)}${u === myUsername ? " <span style='color:var(--muted);font-size:.7rem'>(you)</span>" : ""}`;
        userList.appendChild(li);
    });
}

// ── Socket events ────────────────────────────────────────────────────────────
socket.on("auth_failed", (message) => {
    myUsername = ""; // Reset username on failure
    // Show an error message to the user
    loginError.style.color = 'red';
    if (loginError) {
        loginError.textContent = message;
        loginError.style.display = 'block';
    }
    alert(`Login Failed: ${message}`); // Simple alert as a fallback
});

socket.on("user_joined", ({ username, onlineCount: count, users }) => {
    onlineCount.textContent = count;
    updateUserList(users);
    if (username === myUsername) { // This is me joining
        joinScreen.classList.add("hidden");
        setTimeout(() => chatScreen.classList.add("visible"), 100);
        myNameBadge.textContent = `you: ${username}`;
    } else { // Someone else joined
        addSystemMsg(`${username} joined the room`);
    }
});

socket.on("user_left", ({ username, onlineCount: count, users }) => {
    onlineCount.textContent = count;
    updateUserList(users);
    addSystemMsg(`${username} left the room`);
});

socket.on("chat_message", (msg) => addMessage(msg));
socket.on("chat_history", (messages) => {
  messages.forEach(msg => addMessage(msg));
});

// ── Typing indicator ─────────────────────────────────────────────────────────
let typingUsers = new Set();
let typingTimeout;

socket.on("typing", ({ username, isTyping }) => {
    if (isTyping) typingUsers.add(username);
    else typingUsers.delete(username);
    renderTyping();
});

function renderTyping() {
    if (typingUsers.size === 0) {
        typingEl.textContent = "";
    } else if (typingUsers.size === 1) {
        typingEl.textContent = `${[...typingUsers][0]} is typing…`;
    } else {
        typingEl.textContent = `${typingUsers.size} people are typing…`;
    }
}


// ── Send message ─────────────────────────────────────────────────────────────
let isTyping = false;

function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !myUsername) return;
    socket.emit("chat_message", text);
    msgInput.value = "";
    msgInput.style.height = "auto";
    // Stop typing
    if (isTyping) {
        isTyping = false;
        socket.emit("typing", false);
    }
}

sendBtn.addEventListener("click", sendMessage);

msgInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
msgInput.addEventListener("input", () => {
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, 100) + "px";

    // Typing indicator
    if (!isTyping && msgInput.value.trim()) {
        isTyping = true;
        socket.emit("typing", true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            socket.emit("typing", false);
        }
    }, 1500);
    if (!msgInput.value.trim() && isTyping) {
        isTyping = false;
        socket.emit("typing", false);
    }
});