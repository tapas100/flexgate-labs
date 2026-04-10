'use strict';
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE || '0.5');

let requestCount = 0;
let failureCount = 0;

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'flaky-service' }));

app.get('/flaky', (req, res) => {
  requestCount++;
  const shouldFail = Math.random() < FAILURE_RATE;
  if (shouldFail) {
    failureCount++;
    const errorType = Math.random();
    if (errorType < 0.33) {
      return res.status(500).json({ error: 'Internal Server Error', requestCount, failureCount });
    } else if (errorType < 0.66) {
      return res.status(503).json({ error: 'Service Unavailable', requestCount, failureCount });
    } else {
      // Simulate a timeout by hanging
      setTimeout(() => {
        res.status(504).json({ error: 'Gateway Timeout (simulated)', requestCount, failureCount });
      }, 6000);
      return;
    }
  }
  res.json({ status: 'ok', message: 'flaky-service responded successfully', requestCount, failureCount });
});

app.get('/flaky/stats', (_req, res) => {
  res.json({ requestCount, failureCount, failureRate: FAILURE_RATE });
});

app.post('/flaky/reset', (_req, res) => {
  requestCount = 0;
  failureCount = 0;
  res.json({ message: 'Stats reset' });
});

app.listen(PORT, () => console.log(`flaky-service running on port ${PORT} with failure rate ${FAILURE_RATE}`));
