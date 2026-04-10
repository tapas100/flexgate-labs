import axios, { AxiosInstance } from 'axios';

// FlexGate proxy runs on port 3000 (behind HAProxy on 8080 in prod, direct on 3000 in dev)
export const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
export const API_KEY = process.env.FLEXGATE_API_KEY || 'test-api-key-12345';
export const ADMIN_KEY = process.env.FLEXGATE_ADMIN_KEY || 'admin-key-secret-99';
export const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
export const DEMO_EMAIL = process.env.DEMO_EMAIL || 'admin@flexgate.dev';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';

let _authToken: string | null = null;

/**
 * Authenticate via DEMO_MODE and cache the token for the test session
 */
export async function getAuthToken(): Promise<string | null> {
  if (_authToken) return _authToken;
  try {
    const res = await axios.post(
      `${GATEWAY_URL}/api/auth/login`,
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      { validateStatus: () => true, timeout: 5000 }
    );
    if (res.status === 200 && res.data?.token) {
      _authToken = res.data.token;
      return _authToken;
    }
  } catch { /* auth not configured — tests will run unauthenticated */ }
  return null;
}

/**
 * Create an admin API client (Bearer token auth)
 */
export async function createAdminClient(): Promise<AxiosInstance> {
  const token = await getAuthToken();
  return axios.create({
    baseURL: GATEWAY_URL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    validateStatus: () => true,
  });
}

/**
 * Create a plain proxy client (API key auth — legacy path)
 */
export function createClient(apiKey?: string): AxiosInstance {
  return axios.create({
    baseURL: GATEWAY_URL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey ?? API_KEY,
    },
    validateStatus: () => true,
  });
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateCorrelationId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function randomPath(): string {
  return `/test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function randomUrl(): string {
  return `https://httpbin.org/anything/${Date.now()}`;
}
