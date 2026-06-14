require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const Message = require('./models/Message');

// Connect to MongoDB using the URI from your .env file
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("📦 Connected to MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ Database connection error:", err.message);
    process.exit(1); // Kills the server if the DB fails to connect
  });

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Track online users: { socketId -> username }
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // ── JOIN ────────────────────────────────────────────────────────────────────
  socket.on("join", async (username) => {
    const trimmed = username.trim().slice(0, 20);
    if (!trimmed) return;

    onlineUsers.set(socket.id, trimmed);

    try {
      // Fetch the last 50 messages from the database
      const chatHistory = await Message.find().sort({ timestamp: -1 }).limit(50);
      
      // Send history ONLY to the user who just joined (reverse so oldest is at the top)
      socket.emit("chat_history", chatHistory.reverse());
    } catch (err) {
      console.error("⚠️ Failed to load history:", err);
    }

    // Tell everyone this user joined
    io.emit("user_joined", {
      username: trimmed,
      onlineCount: onlineUsers.size,
      users: [...onlineUsers.values()],
    });

    console.log(`👤 ${trimmed} joined  (${onlineUsers.size} online)`);
  });

  // ── CHAT MESSAGE ────────────────────────────────────────────────────────────
  socket.on("chat_message", async (text) => {
    const username = onlineUsers.get(socket.id);
    if (!username || !text.trim()) return;

    const msgData = {
      username,
      text: text.trim().slice(0, 500),
    };

    try {
      // 1. Save message to MongoDB
      const savedMsg = await Message.create(msgData);
      
      // 2. Broadcast the SAVED message (which has the MongoDB timestamp) to ALL
      io.emit("chat_message", savedMsg);
      console.log(`💬 [${username}]: ${savedMsg.text}`);
    } catch (err) {
      console.error("⚠️ Failed to save message:", err);
    }
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