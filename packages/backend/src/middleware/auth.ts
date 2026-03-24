import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Bearer Token 認証ミドルウェア
 * 環境変数 API_SECRET_KEY が設定されている場合、
 * Authorization: Bearer <key> ヘッダーを検証する。
 * API_SECRET_KEY が未設定の場合は全リクエストを拒否する。
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secretKey = process.env.API_SECRET_KEY;

  if (!secretKey) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'API authentication is not configured' },
    });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authorization header is required' },
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authorization header must be Bearer <token>' },
    });
  }

  const token = parts[1];
  if (token !== secretKey) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  }
}
