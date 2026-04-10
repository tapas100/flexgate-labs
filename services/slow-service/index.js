'use strict';
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const DELAY_MS = parseInt(process.env.DELAY_MS || '3000', 10);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'slow-service' }));

app.get('/slow', (req, res) => {
  const delay = parseInt(req.query.delay || String(DELAY_MS), 10);
  setTimeout(() => {
    res.json({
      status: 'ok',
      message: `slow-service responded after ${delay}ms`,
      delayMs: delay,
    });
  }, delay);
});

app.get('/slow/instant', (_req, res) => {
  res.json({ status: 'ok', message: 'instant response', delayMs: 0 });
});

app.listen(PORT, () => console.log(`slow-service running on port ${PORT} with delay ${DELAY_MS}ms`));
