import { describe, it, expect } from 'vitest';

// Test the health endpoint logic directly
describe('GET /api/health', () => {
  it('returns healthy status', async () => {
    // Import the route handler
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.version).toBe('1.0.0');
    expect(data.timestamp).toBeTruthy();
    expect(typeof data.uptime).toBe('number');
    expect(data.database).toBe('demo_mode');
  });
});
