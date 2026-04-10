'use strict';
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3005;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook-hmac-secret-xyz';

const receivedWebhooks = [];

function verifySignature(payload, signature) {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  return `sha256=${expected}` === signature;
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'webhook-receiver' }));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  if (signature && !verifySignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const entry = { id: Date.now(), receivedAt: new Date().toISOString(), payload: req.body };
  receivedWebhooks.push(entry);
  console.log('Webhook received:', JSON.stringify(entry));
  res.status(200).json({ received: true, id: entry.id });
});

app.get('/webhook/received', (_req, res) => {
  res.json({ count: receivedWebhooks.length, webhooks: receivedWebhooks });
});

app.delete('/webhook/received', (_req, res) => {
  receivedWebhooks.length = 0;
  res.json({ message: 'Cleared all received webhooks' });
});

app.listen(PORT, () => console.log(`webhook-receiver running on port ${PORT}`));
