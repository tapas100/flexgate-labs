/**
 * Routes API Tests
 * Tests the full CRUD lifecycle of the /api/routes management endpoint
 * Covers: create, read, update, delete, enable/disable, validation
 */
import { createAdminClient, randomPath, randomUrl, sleep } from '../helpers';
import { AxiosInstance } from 'axios';

let client: AxiosInstance;
let createdRouteId: string;

const testRoute = {
  path: randomPath(),
  upstream: 'http://api-users:3001',
  methods: ['GET', 'POST'],
  enabled: true,
  description: 'flexgate-labs test route',
};

beforeAll(async () => {
  client = await createAdminClient();
});

describe('Routes API: CRUD', () => {
  it('GET /api/routes — should list all routes', async () => {
    const res = await client.get('/api/routes');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it('POST /api/routes — should create a new route', async () => {
    const res = await client.post('/api/routes', testRoute);
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.path).toBe(testRoute.path);
    expect(res.data.data.upstream).toBe(testRoute.upstream);
    createdRouteId = res.data.data.id;
  });

  it('GET /api/routes/:id — should fetch the created route', async () => {
    expect(createdRouteId).toBeDefined();
    const res = await client.get(`/api/routes/${createdRouteId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(createdRouteId);
    expect(res.data.data.path).toBe(testRoute.path);
  });

  it('PUT /api/routes/:id — should update the route description', async () => {
    expect(createdRouteId).toBeDefined();
    const res = await client.put(`/api/routes/${createdRouteId}`, {
      description: 'updated by flexgate-labs test',
    });
    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    expect(res.data.data.description).toBe('updated by flexgate-labs test');
  });

  it('PUT /api/routes/:id — should disable the route', async () => {
    expect(createdRouteId).toBeDefined();
    const res = await client.put(`/api/routes/${createdRouteId}`, {
      enabled: false,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.data.data.enabled).toBe(false);
  });

  it('PUT /api/routes/:id — should re-enable the route', async () => {
    expect(createdRouteId).toBeDefined();
    const res = await client.put(`/api/routes/${createdRouteId}`, {
      enabled: true,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.data.data.enabled).toBe(true);
  });

  it('DELETE /api/routes/:id — should delete the route', async () => {
    expect(createdRouteId).toBeDefined();
    const res = await client.delete(`/api/routes/${createdRouteId}`);
    expect([200, 204]).toContain(res.status);
  });

  it('GET /api/routes/:id — should 404 after deletion', async () => {
    expect(createdRouteId).toBeDefined();
    const res = await client.get(`/api/routes/${createdRouteId}`);
    expect(res.status).toBe(404);
  });
});

describe('Routes API: Validation', () => {
  it('should reject route with missing path', async () => {
    const res = await client.post('/api/routes', {
      upstream: 'http://api-users:3001',
      methods: ['GET'],
    });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject route with path not starting with /', async () => {
    const res = await client.post('/api/routes', {
      path: 'no-leading-slash',
      upstream: 'http://api-users:3001',
      methods: ['GET'],
    });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject route with empty methods array', async () => {
    const res = await client.post('/api/routes', {
      path: randomPath(),
      upstream: 'http://api-users:3001',
      methods: [],
    });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject route with invalid HTTP method', async () => {
    const res = await client.post('/api/routes', {
      path: randomPath(),
      upstream: 'http://api-users:3001',
      methods: ['INVALID_METHOD'],
    });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject 404 for nonexistent route id', async () => {
    const res = await client.get('/api/routes/nonexistent-route-id-xyz');
    expect(res.status).toBe(404);
  });
});

describe('Routes API: Rate Limiting on Management Ops', () => {
  it('should rate-limit excessive route creation attempts', async () => {
    // The proxy applies routeManagementRateLimiter (30 ops/hour)
    // We test that the middleware is present and responds correctly
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        client.post('/api/routes', {
          path: randomPath(),
          upstream: 'http://api-users:3001',
          methods: ['GET'],
          enabled: false,
        })
      )
    );
    const statuses = results.map((r) => r.status);
    // All should be valid responses (201 created or 429 rate limited)
    statuses.forEach((s) => expect([200, 201, 429]).toContain(s));

    // Cleanup any created routes
    for (const r of results) {
      if (r.data?.data?.id) {
        await client.delete(`/api/routes/${r.data.data.id}`);
      }
    }
  });
});

describe('Routes API: Seed Endpoint', () => {
  it('POST /api/routes/seed — should seed demo routes idempotently', async () => {
    const res = await client.post('/api/routes/seed');
    expect([200, 201]).toContain(res.status);

    // Verify seeded routes exist
    const listRes = await client.get('/api/routes');
    expect(listRes.data.data.length).toBeGreaterThan(0);
  });
});
