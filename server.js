const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Track online users: { socketId -> username }
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // ── JOIN ────────────────────────────────────────────────────────────────────
  socket.on("join", (username) => {
    const trimmed = username.trim().slice(0, 20);
    if (!trimmed) return;

    onlineUsers.set(socket.id, trimmed);

    // Tell everyone this user joined
    io.emit("user_joined", {
      username: trimmed,
      onlineCount: onlineUsers.size,
      users: [...onlineUsers.values()],
    });

    console.log(`👤 ${trimmed} joined  (${onlineUsers.size} online)`);
  });

  // ── CHAT MESSAGE ────────────────────────────────────────────────────────────
  socket.on("chat_message", (text) => {
    const username = onlineUsers.get(socket.id);
    if (!username || !text.trim()) return;

    const message = {
      id: Date.now(),
      username,
      text: text.trim().slice(0, 500),
      timestamp: new Date().toISOString(),
    };

    // Broadcast to ALL (including sender)
    io.emit("chat_message", message);
    console.log(`💬 [${username}]: ${message.text}`);
  });

  // ── TYPING INDICATOR ────────────────────────────────────────────────────────
  socket.on("typing", (isTyping) => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;
    // Broadcast to everyone EXCEPT the sender
    socket.broadcast.emit("typing", { username, isTyping });
  });

  // ── DISCONNECT ──────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const username = onlineUsers.get(socket.id);
    if (username) {
      onlineUsers.delete(socket.id);
      io.emit("user_left", {
        username,
        onlineCount: onlineUsers.size,
        users: [...onlineUsers.values()],
      });
      console.log(`👋 ${username} left  (${onlineUsers.size} online)`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Chat server running → http://localhost:${PORT}\n`);
});
