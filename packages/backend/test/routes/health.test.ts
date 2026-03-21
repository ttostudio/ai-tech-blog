import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

function createMockSql(healthy = true) {
  const fn = vi.fn();
  if (healthy) {
    fn.mockResolvedValue([{ '?column?': 1 }]);
  } else {
    fn.mockRejectedValue(new Error('Connection refused'));
  }
  // Tagged template literal handler
  const handler = (strings: TemplateStringsArray, ..._values: unknown[]) => {
    return fn(strings.join(''));
  };
  // Make it callable as both function and tagged template
  return new Proxy(handler, {
    apply(_target, _thisArg, args) {
      return fn(args[0]?.join?.('') ?? args[0]);
    },
    get(_target, prop) {
      if (prop === 'json') return (v: unknown) => v;
      return undefined;
    },
  });
}

describe('GET /api/health', () => {
  it('returns ok when database is healthy', async () => {
    const mockSql = createMockSql(true);
    const app = buildApp(mockSql as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.services.database).toBe('ok');
  });

  it('returns error when database is down', async () => {
    const mockSql = createMockSql(false);
    const app = buildApp(mockSql as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('error');
    expect(body.services.database).toBe('error');
  });
});
