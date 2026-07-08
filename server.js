const express = require('express');
const app = express();
app.use(express.json()); // to read JSON data

const users = {}; // temporary storage

app.get("/", (req, res) => {
  res.json({ message: "Backend is live from scaling-fiesta" });
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;
  users[username] = password;
  res.json({ status: "User created" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (users[username] === password) {
    res.json({ status: "Login success" });
  } else {
    res.status(401).json({ status: "Login failed" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));