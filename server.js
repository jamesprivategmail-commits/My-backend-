const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// 1. DATABASE CONNECTION
const pool = new Pool({
  connectionString: "postgresql://scalingmybackend_user:jOq5h9N3czeLeMxq6mWIYqBogrli195o@dpg-d970tjeq1p3s73874r40-a.oregon-postgres.render.com/scalingmybackend",
  ssl: { rejectUnauthorized: false } // Important for Render
});

// 2. CREATE TABLES IF THEY DON'T EXIST
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender VARCHAR(50) NOT NULL,
      receiver VARCHAR(50),
      message TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("Tables ready ✅");
}
createTables();

const JWT_SECRET = "supersecretkey123"; // Later put this in Environment Variables

// 3. AUTH ROUTES
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO users(username, password) VALUES($1, $2)', [username, hashed]);
    res.json({ message: "User created" });
  } catch (e) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ username }, JWT_SECRET);
  res.json({ token });
});

// 4. MESSAGES API
app.get('/messages/:user', async (req, res) => {
  const { user } = req.params;
  const result = await pool.query(
    'SELECT * FROM messages WHERE receiver = $1 OR sender = $1 ORDER BY timestamp ASC', 
    [user]
  );
  res.json(result.rows);
});

// 5. SOCKET.IO FOR REAL-TIME
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('sendMessage', async (data) => {
    const { sender, receiver, message } = data;
    await pool.query(
      'INSERT INTO messages(sender, receiver, message) VALUES($1, $2, $3)',
      [sender, receiver, message]
    );
    io.emit('newMessage', data); // Send to everyone
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));