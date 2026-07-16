const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '2127';
const DATA_FILE = path.join(__dirname, 'tickets.json');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

function loadTickets() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveTickets(tickets) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2));
}

function genTicketId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return 'NT-' + n;
}

function uniqueTicketId(tickets) {
  let id;
  do {
    id = genTicketId();
  } while (tickets.some(t => t.id === id));
  return id;
}

function checkPin(req) {
  const pin = req.query.pin || (req.body && req.body.pin);
  return pin === ADMIN_PIN;
}

app.post('/api/tickets', (req, res) => {
  const { name, contact, message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  const tickets = loadTickets();
  const id = uniqueTicketId(tickets);
  const now = new Date().toISOString();
  const ticket = {
    id,
    name: (name || 'Anonymous').trim(),
    contact: (contact || '').trim(),
    message: message.trim(),
    reply: '',
    status: 'open',
    created_at: now,
    replied_at: ''
  };
  tickets.push(ticket);
  saveTickets(tickets);
  res.json({ id });
});

app.get('/api/stats', (req, res) => {
  const tickets = loadTickets();
  const open = tickets.filter(t => t.status === 'open').length;
  const replied = tickets.filter(t => t.status === 'replied').length;
  res.json({ open, replied, total: open + replied });
});

app.get('/api/tickets/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const tickets = loadTickets();
  const ticket = tickets.find(t => t.id === id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  res.json(ticket);
});

app.get('/api/tickets', (req, res) => {
  if (!checkPin(req)) return res.status(401).json({ error: 'Incorrect PIN.' });
  const tickets = loadTickets().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(tickets);
});

app.patch('/api/tickets/:id', (req, res) => {
  if (!checkPin(req)) return res.status(401).json({ error: 'Incorrect PIN.' });
  const id = req.params.id.toUpperCase();
  const { reply } = req.body || {};
  if (!reply || !reply.trim()) return res.status(400).json({ error: 'Reply cannot be empty.' });

  const tickets = loadTickets();
  const ticket = tickets.find(t => t.id === id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  ticket.reply = reply.trim();
  ticket.status = 'replied';
  ticket.replied_at = new Date().toISOString();
  saveTickets(tickets);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Nova Tech Support server running on port ${PORT}`);
});