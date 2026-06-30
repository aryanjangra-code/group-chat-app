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
const User = require('./models/User'); 
const verifyUserLogin = require('./verifyuser');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("📦 Connected to MongoDB Atlas");
    } catch (err) {
        console.error("❌ Database connection error:", err.message);
        process.exit(1);
    }
};

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const authResult = await verifyUserLogin(username, password);

    if (authResult.success) {
        res.status(200).json({ message: authResult.message, userId: authResult.userId });
    } else {
        res.status(401).json({ message: authResult.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).json({ message: 'Username or email already exists' });
        }

        const newUser = new User({
            username,
            email,
            password
        });

        await newUser.save();

        res.status(201).json({ message: 'User registered successfully! You can now log in.' });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: error.message || 'An internal server error occurred' });
    }
});

// Track online users
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on("join", async (username, password) => {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      socket.emit("auth_failed", "Username and password are required.");
      return;
    }

    const authResult = await verifyUserLogin(trimmed, password);

    if (!authResult.success) {
      socket.emit("auth_failed", authResult.message);
      return;
    }

    const isUsernameTaken = [...onlineUsers.values()].some(user => user.toLowerCase() === trimmed.toLowerCase());
    if (isUsernameTaken) {
      socket.emit("auth_failed", `Username "${trimmed}" is already in use.`);
      return;
    }

    onlineUsers.set(socket.id, trimmed);

    try {
      const chatHistory = await Message.find().sort({ timestamp: -1 }).limit(50);
      
      socket.emit("chat_history", chatHistory.reverse());
    } catch (err) {
      console.error("⚠️ Failed to load history:", err);
    }

    io.emit("user_joined", {
      username: trimmed,
      onlineCount: onlineUsers.size,
      users: [...onlineUsers.values()],
    });

    console.log(`👤 ${trimmed} joined  (${onlineUsers.size} online)`);
  });

  socket.on("chat_message", async (text) => {
    const username = onlineUsers.get(socket.id);
    if (!username || !text.trim()) return;

    const msgData = {
      username,
      text: text.trim().slice(0, 500),
    };

    try {
      const savedMsg = await Message.create(msgData);
      
      io.emit("chat_message", savedMsg);
      console.log(`💬 [${username}]: ${savedMsg.text}`);
    } catch (err) {
      console.error("⚠️ Failed to save message:", err);
    }
  });

  socket.on("typing", (isTyping) => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;
    socket.broadcast.emit("typing", { username, isTyping });
  });

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

const startServer = async () => {
  await connectDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n🚀 Chat server running → http://localhost:${PORT}\n`);
  });
};

startServer();