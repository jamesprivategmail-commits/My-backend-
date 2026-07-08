require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initSchema } = require('./db');
const { requireAuth, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

// ---------- AUTH ----------

app.post('/api/register', async (req, res) => {
  const { username, email, password, display_name } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const password_hash = bcrypt.hashSync(password, 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [username, email, password_hash, display_name || username]
    );
    const user = rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user: publicUser(user), token });
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation
      return res.status(409).json({ error: 'username or email already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE username = $1 OR email = $1',
    [username]
  );
  const user = rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: publicUser(user), token });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  res.json({ user: publicUser(rows[0]) });
});

app.patch('/api/me', requireAuth, async (req, res) => {
  const { display_name, bio } = req.body;
  const { rows } = await pool.query(
    `UPDATE users SET display_name = COALESCE($1, display_name), bio = COALESCE($2, bio)
     WHERE id = $3 RETURNING *`,
    [display_name, bio, req.userId]
  );
  res.json({ user: publicUser(rows[0]) });
});

// ---------- POSTS ----------

app.post('/api/posts', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id`,
    [req.userId, content.trim()]
  );
  const { rows: postRows } = await pool.query(
    `SELECT posts.*, users.username, users.display_name
     FROM posts JOIN users ON users.id = posts.user_id
     WHERE posts.id = $1`,
    [rows[0].id]
  );
  res.status(201).json({ post: postRows[0] });
});

app.get('/api/posts', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT posts.*, users.username, users.display_name,
           (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) AS comment_count
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
    LIMIT 100
  `);
  res.json({ posts: rows });
});

app.get('/api/posts/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT posts.*, users.username, users.display_name
     FROM posts JOIN users ON users.id = posts.user_id
     WHERE posts.id = $1`,
    [req.params.id]
  );
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'post not found' });

  const { rows: comments } = await pool.query(
    `SELECT comments.*, users.username, users.display_name
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE comments.post_id = $1
     ORDER BY comments.created_at ASC`,
    [req.params.id]
  );

  res.json({ post, comments });
});

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'post not found' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'not your post' });
  await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---------- LIKES ----------

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  await pool.query(
    `INSERT INTO likes (post_id, user_id) VALUES ($1, $2)
     ON CONFLICT (post_id, user_id) DO NOTHING`,
    [req.params.id, req.userId]
  );
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM likes WHERE post_id = $1', [req.params.id]);
  res.json({ like_count: Number(rows[0].c) });
});

app.delete('/api/posts/:id/like', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM likes WHERE post_id = $1', [req.params.id]);
  res.json({ like_count: Number(rows[0].c) });
});

// ---------- COMMENTS ----------

app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
    [req.params.id, req.userId, content.trim()]
  );
  res.status(201).json({ comment: rows[0] });
});

// ---------- health check ----------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db not reachable' });
  }
});

// ---------- startup ----------
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
