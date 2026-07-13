// Nova Tech -- chat proxy backend
//
// Purpose: the frontend (index.html) can't safely call Anthropic's API directly
// once it's hosted publicly -- that would expose your API key to anyone
// who opens dev tools. This tiny server sits in between: the frontend calls THIS
// server, and this server (which holds the real key privately) calls Anthropic.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors()); // allow your hosted frontend to call this server
app.use(express.json());

const { ANTHROPIC_API_KEY, PORT = 3001 } = process.env;

app.post("/api/chat", async (req, res) => {
  try {
    const { system, messages, max_tokens } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: max_tokens || 4096,
        system: system || "",
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(response.status).json({ error: "Upstream API error" });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/", (req, res) => res.send("Nova Tech chat proxy is running."));

app.listen(PORT, () => console.log(`Nova Tech proxy listening on port ${PORT}`));