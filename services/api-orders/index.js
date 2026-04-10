'use strict';
const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'flexgate',
  user: process.env.POSTGRES_USER || 'flexgate',
  password: process.env.POSTGRES_PASSWORD || 'flexgate_secret',
});

const memoryStore = new Map();

async function listOrders() {
  try {
    const res = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
    return res.rows;
  } catch {
    return [...memoryStore.values()];
  }
}

async function getOrder(id) {
  try {
    const res = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return res.rows[0] || null;
  } catch {
    return memoryStore.get(id) || null;
  }
}

async function createOrder(data) {
  const id = uuidv4();
  const order = { id, ...data, status: 'pending', created_at: new Date().toISOString() };
  try {
    await pool.query(
      'INSERT INTO orders (id, user_id, item, amount, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, data.user_id, data.item, data.amount, order.status, order.created_at]
    );
  } catch {
    memoryStore.set(id, order);
  }
  return order;
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-orders' }));

// Root-level aliases — used when proxied via app.use('/orders', proxy) which strips prefix
app.get('/', async (_req, res) => {
  try {
    const orders = await listOrders();
    res.json({ orders, count: orders.length });
  } catch { res.status(500).json({ error: 'Failed to fetch orders' }); }
});

app.get('/:id([0-9a-f-]{36})', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch { res.status(500).json({ error: 'Failed to fetch order' }); }
});

app.post('/', async (req, res) => {
  const { user_id, item, amount } = req.body;
  if (!user_id || !item || amount === undefined) {
    return res.status(400).json({ error: 'user_id, item, and amount are required' });
  }
  try {
    const order = await createOrder({ user_id, item, amount });
    res.status(201).json(order);
  } catch { res.status(500).json({ error: 'Failed to create order' }); }
});

// Original /orders/* paths (used for direct service access)
app.get('/orders', async (_req, res) => {
  try {
    const orders = await listOrders();
    res.json({ orders, count: orders.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.post('/orders', async (req, res) => {
  const { user_id, item, amount } = req.body;
  if (!user_id || !item || amount === undefined) {
    return res.status(400).json({ error: 'user_id, item, and amount are required' });
  }
  try {
    const order = await createOrder({ user_id, item, amount });
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.listen(PORT, () => console.log(`api-orders running on port ${PORT}`));
