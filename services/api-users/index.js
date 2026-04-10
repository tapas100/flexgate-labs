'use strict';
const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'flexgate',
  user: process.env.POSTGRES_USER || 'flexgate',
  password: process.env.POSTGRES_PASSWORD || 'flexgate_secret',
});

// In-memory fallback store when Postgres is unavailable
const memoryStore = new Map();

async function getUser(id) {
  try {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  } catch {
    return memoryStore.get(id) || null;
  }
}

async function listUsers() {
  try {
    const res = await pool.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 100');
    return res.rows;
  } catch {
    return [...memoryStore.values()];
  }
}

async function createUser(data) {
  const id = uuidv4();
  const user = { id, ...data, created_at: new Date().toISOString() };
  try {
    await pool.query(
      'INSERT INTO users (id, name, email, created_at) VALUES ($1, $2, $3, $4)',
      [id, data.name, data.email, user.created_at]
    );
  } catch {
    memoryStore.set(id, user);
  }
  return user;
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-users' }));

// Root-level aliases — used when proxied via app.use('/users', proxy) which strips prefix
app.get('/', async (_req, res) => {
  const users = await listUsers();
  res.json({ users, total: users.length });
});

app.get('/:id([0-9a-f-]{36})', async (req, res) => {
  const user = await getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const user = await createUser({ name, email });
  res.status(201).json(user);
});

app.put('/:id([0-9a-f-]{36})', async (req, res) => {
  const existing = await getUser(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const updated = { ...existing, ...req.body, id: req.params.id };
  try {
    await pool.query('UPDATE users SET name=$1, email=$2 WHERE id=$3', [
      updated.name, updated.email, updated.id,
    ]);
  } catch {
    memoryStore.set(updated.id, updated);
  }
  res.json(updated);
});

app.delete('/:id([0-9a-f-]{36})', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  } catch {
    memoryStore.delete(req.params.id);
  }
  res.status(204).send();
});

// Original /users/* paths (used for direct service access)
app.get('/users', async (_req, res) => {
  const users = await listUsers();
  res.json({ users, total: users.length });
});

app.get('/users/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const user = await createUser({ name, email });
  res.status(201).json(user);
});

app.put('/users/:id', async (req, res) => {
  const existing = await getUser(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const updated = { ...existing, ...req.body, id: req.params.id };
  try {
    await pool.query('UPDATE users SET name=$1, email=$2 WHERE id=$3', [
      updated.name, updated.email, updated.id,
    ]);
  } catch {
    memoryStore.set(updated.id, updated);
  }
  res.json(updated);
});

app.delete('/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  } catch {
    memoryStore.delete(req.params.id);
  }
  res.status(204).send();
});

// Wildcard route test endpoint
app.get('/users/:id/profile/:section', async (req, res) => {
  const user = await getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user, section: req.params.section });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`api-users listening on :${PORT}`));
