const express = require('express');
const path = require('path');
const pool = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '2127';

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

function genTicketId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return 'NT-' + n;
}

async function uniqueTicketId() {
  let id;
  let exists = true;
  while (exists) {
    id = genTicketId();
    const { rows } = await pool.query('SELECT 1 FROM tickets WHERE id = $1', [id]);
    exists = rows.length > 0;
  }
  return id;
}

function checkPin(req) {
  const pin = req.query.pin || (req.body && req.body.pin);
  return pin === ADMIN_PIN;
}

app.post('/api/tickets', async (req, res) => {
  try {
    const { name, contact, message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    const id = await uniqueTicketId();
    await pool.query(
      `INSERT INTO tickets (id, name, contact, message, status)
       VALUES ($1, $2, $3, $4, 'open')`,
      [id, (name || 'Anonymous').trim(), (contact || '').trim(), message.trim()]
    );
    res.json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong saving your message.' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*) FROM tickets GROUP BY status`
    );
    let open = 0, replied = 0;
    for (const r of rows) {
      if (r.status === 'open') open = Number(r.count);
      if (r.status === 'replied') replied = Number(r.count);
    }
    res.json({ open, replied, total: open + replied });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

app.get('/api/tickets/:id', async (req, res) => {
  try {
    const id = req.params.id.toUpperCase();
    const { rows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found.' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load ticket.' });
  }
});

app.get('/api/tickets', async (req, res) => {
  if (!checkPin(req)) return res.status(401).json({ error: 'Incorrect PIN.' });
  try {
    const { rows } = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load tickets.' });
  }
});

app.patch('/api/tickets/:id', async (req, res) => {
  if (!checkPin(req)) return res.status(401).json({ error: 'Incorrect PIN.' });
  try {
    const id = req.params.id.toUpperCase();
    const { reply } = req.body || {};
    if (!reply || !reply.trim()) return res.status(400).json({ error: 'Reply cannot be empty.' });

    const { rows } = await pool.query(
      `UPDATE tickets SET reply = $1, status = 'replied', replied_at = now()
       WHERE id = $2 RETURNING *`,
      [reply.trim(), id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save reply.' });
  }
});

app.listen(PORT, () => {
  console.log(`Nova Tech Support server running on port ${PORT}`);
});