import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'admin@flexgate.dev';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';

async function run() {
  console.log('🌱 Seeding flexgate-labs test data...\n');

  // 1. Authenticate
  let token: string | null = null;
  if (DEMO_PASSWORD) {
    try {
      const loginRes = await axios.post(`${GATEWAY_URL}/api/auth/login`, {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      }, { validateStatus: () => true });
      if (loginRes.status === 200) {
        token = loginRes.data.token;
        console.log('✅ Authenticated');
      }
    } catch { /* ignore */ }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // 2. Seed demo routes via built-in /api/routes/seed
  try {
    const seedRes = await axios.post(`${GATEWAY_URL}/api/routes/seed`, {}, {
      headers, validateStatus: () => true,
    });
    if (seedRes.status === 200 || seedRes.status === 201) {
      console.log('✅ Demo routes seeded');
    } else {
      console.warn(`⚠️  Route seed returned ${seedRes.status}`);
    }
  } catch (err: any) {
    console.error('❌ Route seed failed:', err.message);
  }

  // 3. Create test routes for flexgate-labs services
  const testRoutes = [
    { path: '/users', upstream: 'http://api-users:3001', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'api-users service' },
    { path: '/orders', upstream: 'http://api-orders:3002', methods: ['GET', 'POST'], description: 'api-orders service' },
    { path: '/flaky', upstream: 'http://flaky-service:3003', methods: ['GET', 'POST'], description: 'flaky-service (circuit breaker testing)' },
    { path: '/slow', upstream: 'http://slow-service:3004', methods: ['GET'], description: 'slow-service (timeout testing)' },
  ];

  for (const route of testRoutes) {
    try {
      const res = await axios.post(`${GATEWAY_URL}/api/routes`, route, {
        headers, validateStatus: () => true,
      });
      if (res.status === 200 || res.status === 201) {
        console.log(`✅ Route created: ${route.path} → ${route.upstream}`);
      } else if (res.status === 409) {
        console.log(`ℹ️  Route already exists: ${route.path}`);
      } else {
        console.warn(`⚠️  Route ${route.path} returned ${res.status}`);
      }
    } catch (err: any) {
      console.error(`❌ Route ${route.path} failed:`, err.message);
    }
  }

  // 4. Seed some test users via api-users directly
  const usersToCreate = [
    { name: 'Alice Admin', email: 'alice@flexgate-test.dev' },
    { name: 'Bob Builder', email: 'bob@flexgate-test.dev' },
    { name: 'Charlie Chaos', email: 'charlie@flexgate-test.dev' },
  ];

  for (const user of usersToCreate) {
    try {
      const res = await axios.post('http://localhost:3001/users', user, {
        validateStatus: () => true,
      });
      if (res.status === 201) {
        console.log(`✅ User created: ${user.email}`);
      }
    } catch { /* ignore */ }
  }

  console.log('\n✅ Seed complete!\n');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
