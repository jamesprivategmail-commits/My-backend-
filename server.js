// Nova WhatsApp Bot — Meta Cloud API + AI provider bridge
// Deploy target: Render (Web Service)

import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// ---------- Config (set these as Environment Variables on Render) ----------
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;       // any string you choose, used to verify the webhook with Meta
const WA_TOKEN = process.env.WA_ACCESS_TOKEN;            // permanent/temp token from Meta App dashboard
const WA_PHONE_ID = process.env.WA_PHONE_NUMBER_ID;      // Phone number ID from Meta App dashboard

const AI_PROVIDER = process.env.AI_PROVIDER || 'cohere';   // which provider to use (see PROVIDERS below)
const AI_API_KEY = process.env.AI_API_KEY;               // your key for that provider
const AI_MODEL = process.env.AI_MODEL || 'command-a-03-2025'; // Cohere's flagship chat model

const SYSTEM_PROMPT = process.env.NOVA_SYSTEM_PROMPT ||
  "You are Nova, a helpful, friendly AI assistant chatting with someone over WhatsApp. Keep replies concise and conversational.";

// ---------- AI providers (OpenAI-compatible chat/completions format) ----------
const PROVIDERS = {
  cohere:     { url: 'https://api.cohere.ai/compatibility/v1/chat/completions' },
  openai:     { url: 'https://api.openai.com/v1/chat/completions' },
  groq:       { url: 'https://api.groq.com/openai/v1/chat/completions' },
  mistral:    { url: 'https://api.mistral.ai/v1/chat/completions' },
  deepseek:   { url: 'https://api.deepseek.com/v1/chat/completions' },
  together:   { url: 'https://api.together.xyz/v1/chat/completions' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions' },
  cerebras:   { url: 'https://api.cerebras.ai/v1/chat/completions' },
  xai:        { url: 'https://api.x.ai/v1/chat/completions' },
  gemini:     { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
};

// Simple in-memory per-user conversation history (resets on server restart)
// For production, swap this for a real database (Render Postgres, Redis, etc.)
const conversations = new Map();

function getHistory(userId) {
  if (!conversations.has(userId)) {
    conversations.set(userId, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }
  return conversations.get(userId);
}

async function askAI(userId, userText) {
  const provider = PROVIDERS[AI_PROVIDER];
  if (!provider) throw new Error(`Unknown AI_PROVIDER: ${AI_PROVIDER}`);

  const history = getHistory(userId);
  history.push({ role: 'user', content: userText });

  // keep context small
  const trimmed = [history[0], ...history.slice(-12)];

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: trimmed,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI provider error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a reply.";
  history.push({ role: 'assistant', content: reply });
  return reply;
}

// ---------- WhatsApp send ----------
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      text: { body: text },
    }),
  });
  if (!res.ok) {
    console.error('WhatsApp send failed:', await res.text());
  }
}

// ---------- Webhook verification (Meta calls this once when you set up the webhook) ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ---------- Webhook receiver (Meta posts incoming messages here) ----------
app.post('/webhook', async (req, res) => {
  // Always respond 200 fast so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return; // could be a status update, not a message

    const from = message.from; // sender's WhatsApp number
    const text = message.text?.body;

    if (!text) return; // ignore non-text messages for now (images, audio, etc.)

    console.log(`Message from ${from}: ${text}`);

    const reply = await askAI(from, text);
    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error('Error handling webhook:', err);
  }
});

app.get('/', (req, res) => {
  res.send('Nova WhatsApp bot is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nova WhatsApp bot listening on port ${PORT}`));