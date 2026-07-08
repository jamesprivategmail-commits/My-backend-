const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// MIDDLEWARE - this one makes login work
app.use(cors()); 
app.use(express.json());

// CONNECT TO MONGODB
// IMPORTANT: Replace with your own MongoDB Atlas URL
mongoose.connect('YOUR_MONGODB_URL_HERE')
.then(() => console.log('MongoDB Connected'))
.catch(err => console.log(err));

// USER MODEL
const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model('User', UserSchema);

// MESSAGE MODEL
const MessageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// ROUTES

// REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error" });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "User not found" });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });
    
    const token = jwt.sign({ id: user._id }, 'secretkey');
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ message: "Error" });
  }
});

// GET ALL MESSAGES
app.get('/api/messages', async (req, res) => {
  const messages = await Message.find().sort({ time: 1 }).limit(50);
  res.json(messages);
});

// SEND MESSAGE
app.post('/api/messages', async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, 'secretkey');
    const user = await User.findById(decoded.id);
    
    const message = new Message({ username: user.username, text: req.body.text });
    await message.save();
    res.json({ message: "Message sent" });
  } catch (err) {
    res.status(401).json({ message: "Not authorized" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));