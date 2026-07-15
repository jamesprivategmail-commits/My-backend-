const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '2127';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- database ----------
const db = new Database(path.join(__dirname, 'tickets.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    name TEXT,
    contact TEXT,
    message TEXT,
    reply TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    created_at TEXT,
    replied_at TEXT
  )
`);

function genTicketId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return 'NT-' + n;
}

function uniqueTicketId() {
  let id;
  do {
    id = genTicketId();
  } while (db.prepare('SELECT 1 FROM tickets WHERE id = ?').get(id));
  return id;
}

function checkPin(req) {
  const pin = req.query.pin || (req.body && req.body.pin);
  return pin === ADMIN_PIN;
}

// ---------- routes ----------

// create a ticket (public)
app.post('/api/tickets', (req, res) => {
  const { name, contact, message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  const id = uniqueTicketId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tickets (id, name, contact, message, reply, status, created_at, replied_at)
    VALUES (?, ?, ?, ?, '', 'open', ?, '')
  `).run(id, (name || 'Anonymous').trim(), (contact || '').trim(), message.trim(), now);

  res.json({ id });
});

// public stats
app.get('/api/stats', (req, res) => {
  const open = db.prepare(`SELECT COUNT(*) c FROM tickets WHERE status = 'open'`).get().c;
  const replied = db.prepare(`SELECT COUNT(*) c FROM tickets WHERE status = 'replied'`).get().c;
  res.json({ open, replied, total: open + replied });
});

// check a single ticket (public — anyone with the ID can view it)
app.get('/api/tickets/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  res.json(ticket);
});

// list all tickets (admin only)
app.get('/api/tickets', (req, res) => {
  if (!checkPin(req)) return res.status(401).json({ error: 'Incorrect PIN.' });
  const tickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();
  res.json(tickets);
});

// reply to a ticket (admin only)
app.patch('/api/tickets/:id', (req, res) => {
  if (!checkPin(req)) return res.status(401).json({ error: 'Incorrect PIN.' });
  const id = req.params.id.toUpperCase();
  const { reply } = req.body || {};
  if (!reply || !reply.trim()) return res.status(400).json({ error: 'Reply cannot be empty.' });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const now = new Date().toISOString();
  db.prepare(`UPDATE tickets SET reply = ?, status = 'replied', replied_at = ? WHERE id = ?`)
    .run(reply.trim(), now, id);

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Nova Tech Support server running on port ${PORT}`);
});