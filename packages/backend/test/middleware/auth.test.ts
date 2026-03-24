import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../../src/middleware/auth.js';

function makeReply() {
  const reply = {
    _code: 200,
    _body: undefined as unknown,
    code(statusCode: number) {
      this._code = statusCode;
      return this;
    },
    send(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return reply;
}

function makeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

describe('requireAuth middleware', () => {
  const originalEnv = process.env.API_SECRET_KEY;

  beforeEach(() => {
    delete process.env.API_SECRET_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.API_SECRET_KEY = originalEnv;
    } else {
      delete process.env.API_SECRET_KEY;
    }
  });

  it('API_SECRET_KEY 未設定の場合は 401 を返す', async () => {
    const req = makeRequest({ authorization: 'Bearer somekey' });
    const reply = makeReply();

    await requireAuth(req, reply as unknown as FastifyReply);

    expect(reply._code).toBe(401);
    expect((reply._body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('Authorization ヘッダーなしの場合は 401 を返す', async () => {
    process.env.API_SECRET_KEY = 'secret123';
    const req = makeRequest({});
    const reply = makeReply();

    await requireAuth(req, reply as unknown as FastifyReply);

    expect(reply._code).toBe(401);
    expect((reply._body as { error: { message: string } }).error.message).toContain(
      'Authorization header is required',
    );
  });

  it('Bearer スキーム以外の場合は 401 を返す', async () => {
    process.env.API_SECRET_KEY = 'secret123';
    const req = makeRequest({ authorization: 'Basic dXNlcjpwYXNz' });
    const reply = makeReply();

    await requireAuth(req, reply as unknown as FastifyReply);

    expect(reply._code).toBe(401);
    expect((reply._body as { error: { message: string } }).error.message).toContain('Bearer');
  });

  it('不正なトークンの場合は 401 を返す', async () => {
    process.env.API_SECRET_KEY = 'secret123';
    const req = makeRequest({ authorization: 'Bearer wrongkey' });
    const reply = makeReply();

    await requireAuth(req, reply as unknown as FastifyReply);

    expect(reply._code).toBe(401);
    expect((reply._body as { error: { message: string } }).error.message).toContain('Invalid API key');
  });

  it('正しいトークンの場合は何も返さず通過する', async () => {
    process.env.API_SECRET_KEY = 'secret123';
    const req = makeRequest({ authorization: 'Bearer secret123' });
    const reply = makeReply();

    const result = await requireAuth(req, reply as unknown as FastifyReply);

    expect(result).toBeUndefined();
    expect(reply._code).toBe(200);
  });

  it('Bearer スキームは大文字小文字を区別しない', async () => {
    process.env.API_SECRET_KEY = 'secret123';
    const req = makeRequest({ authorization: 'BEARER secret123' });
    const reply = makeReply();

    const result = await requireAuth(req, reply as unknown as FastifyReply);

    expect(result).toBeUndefined();
    expect(reply._code).toBe(200);
  });
});
