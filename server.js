const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://stitchhvk_db_user:MMx9ZoNRrU6TfCpW@cluster0.ifqzp21.mongodb.net/battleRoyale?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: String,
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  vbucks: { type: Number, default: 1000 },
  inventory: Array,
  friends: Array,
  stats: {
    kills: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    matches: { type: Number, default: 0 }
  },
  settings: Object,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Routes API
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: 'Utilisateur existe déjà' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, email });
    await user.save();
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ token, user: { username: user.username, level: user.level, vbucks: user.vbucks } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Utilisateur non trouvé' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Mot de passe incorrect' });
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { 
        username: user.username, 
        level: user.level, 
        xp: user.xp,
        vbucks: user.vbucks,
        inventory: user.inventory,
        friends: user.friends,
        stats: user.stats
      } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/update', async (req, res) => {
  try {
    const { username, updates } = req.body;
    const user = await User.findOneAndUpdate({ username }, { $set: updates }, { new: true });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO
const activePlayers = new Map();

io.on('connection', (socket) => {
  console.log('🎮 Player connected:', socket.id);
  
  socket.on('player:join', (data) => {
    activePlayers.set(socket.id, { username: data.username, position: { x: 0, y: 0, z: 0 }, health: 100, shield: 0 });
    socket.broadcast.emit('player:joined', { id: socket.id, ...data });
  });
  
  socket.on('player:move', (position) => {
    const player = activePlayers.get(socket.id);
    if (player) {
      player.position = position;
      socket.broadcast.emit('player:moved', { id: socket.id, position });
    }
  });
  
  socket.on('player:shoot', (data) => {
    socket.broadcast.emit('player:shot', { id: socket.id, ...data });
  });
  
  socket.on('disconnect', () => {
    activePlayers.delete(socket.id);
    socket.broadcast.emit('player:left', { id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));