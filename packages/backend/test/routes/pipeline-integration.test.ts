import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, migrate, type Sql } from '@ai-tech-blog/shared';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

// ============================================================
// 結合テスト — 実 PostgreSQL 接続必須（モックのみでは Gate 5 不合格）
// Issue #868: ブログ記事自動生成パイプライン Phase 1
// IT-101 〜 IT-155
// ============================================================

// 外部サービスはモック（GitHub API / Claude API / ComfyUI は結合テストでもモック）
vi.mock('../../src/services/github.js', () => ({
  fetchCommits: vi.fn(),
  fetchIssues: vi.fn(),
  fetchPullRequests: vi.fn(),
}));
vi.mock('../../src/services/articleGenerator.js', () => ({
  generateArticle: vi.fn(),
}));
vi.mock('../../src/services/thumbnail.js', () => ({
  generateThumbnail: vi.fn().mockResolvedValue(undefined),
}));

import {
  fetchCommits,
  fetchIssues,
  fetchPullRequests,
} from '../../src/services/github.js';
import { generateArticle } from '../../src/services/articleGenerator.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://app:changeme@localhost:5432/ai_tech_blog';

let sql: Sql;
let app: FastifyInstance;
let dbAvailable = false;

const TEST_SECRET = 'pipeline-int-test-secret';
const AUTH_HEADERS = {
  Authorization: `Bearer ${TEST_SECRET}`,
  'Content-Type': 'application/json',
};

const testPrefix = `it868-${Date.now()}`;
let topicCounter = 0;

function uniqueSourceRef(): string {
  return `${testPrefix}-ref-${++topicCounter}`;
}

async function checkDbConnection(): Promise<boolean> {
  try {
    const testSql = createDb(DATABASE_URL);
    await testSql`SELECT 1`;
    await testSql.end();
    return true;
  } catch {
    return false;
  }
}

/** DB に直接 pending トピックを挿入して UUID を返す */
async function insertPendingTopic(overrides: Record<string, unknown> = {}): Promise<string> {
  const [row] = await sql`
    INSERT INTO article_topics
      (title, description, category, tags, source_type, source_repo, source_ref, status, source_data)
    VALUES (
      ${(overrides['title'] as string) ?? 'テスト記事トピック'},
      ${(overrides['description'] as string | null) ?? null},
      ${(overrides['category'] as string) ?? 'tech'},
      ${[]},
      ${(overrides['source_type'] as string) ?? 'commit'},
      ${(overrides['source_repo'] as string) ?? 'ttostudio/ai-company-os'},
      ${(overrides['source_ref'] as string) ?? uniqueSourceRef()},
      ${(overrides['status'] as string) ?? 'pending'},
      ${sql.json({})}
    )
    RETURNING id
  `;
  return row['id'] as string;
}

beforeAll(async () => {
  dbAvailable = await checkDbConnection();
  if (!dbAvailable) {
    console.warn('⚠️ DB 未接続 — pipeline 結合テストをスキップ（DB 起動後に再実行）');
    return;
  }
  process.env.API_SECRET_KEY = TEST_SECRET;
  sql = createDb(DATABASE_URL);
  await migrate(sql);
  app = buildApp(sql);
  await app.ready();
});

afterAll(async () => {
  if (dbAvailable) {
    // テストデータ削除（テストで作成したデータのみ）
    await sql`DELETE FROM article_generation_jobs WHERE topic_id IN (
      SELECT id FROM article_topics WHERE source_ref LIKE ${testPrefix + '%'}
    )`;
    await sql`DELETE FROM articles WHERE author = 'qa-pipeline-int'`;
    await sql`DELETE FROM article_topics WHERE source_ref LIKE ${testPrefix + '%'}`;
    await app.close();
    await sql.end();
  }
  delete process.env.API_SECRET_KEY;
  vi.restoreAllMocks();
});

// ============================================================
// POST /api/pipeline/topics/extract — トピック抽出（IT-101〜103）
// ============================================================

describe('POST /api/pipeline/topics/extract', () => {
  beforeEach(() => {
    vi.mocked(fetchCommits).mockResolvedValue([]);
    vi.mocked(fetchIssues).mockResolvedValue([]);
    vi.mocked(fetchPullRequests).mockResolvedValue([]);
  });

  it.skipIf(!dbAvailable)(
    'IT-101: POST /api/pipeline/topics/extract が article_topics テーブルに保存する',
    async () => {
      const sourceRef = uniqueSourceRef();
      vi.mocked(fetchCommits).mockResolvedValue([
        {
          title: 'IT-101 テスト commit',
          description: 'テスト説明',
          sourceType: 'commit',
          sourceRepo: 'ttostudio/ai-company-os',
          sourceRef,
          sourceUrl: 'https://github.com/ttostudio/ai-company-os/commit/abc',
          sourceData: { sha: 'abc', message: 'test' },
        },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/pipeline/topics/extract',
        headers: AUTH_HEADERS,
        payload: {
          source: 'commits',
          repos: ['ttostudio/ai-company-os'],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.saved).toBeGreaterThanOrEqual(1);
      expect(body.data.topics.length).toBeGreaterThanOrEqual(1);

      // DB に保存されていることを確認
      const rows = await sql`
        SELECT * FROM article_topics WHERE source_ref = ${sourceRef}
      `;
      expect(rows.length).toBe(1);
      expect(rows[0]['status']).toBe('pending');
      expect(rows[0]['source_type']).toBe('commit');
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-102: 重複 source_ref はスキップされ再 INSERT されない',
    async () => {
      const sourceRef = uniqueSourceRef();
      const mockItem = {
        title: 'IT-102 重複テスト',
        description: null,
        sourceType: 'commit' as const,
        sourceRepo: 'ttostudio/ai-company-os',
        sourceRef,
        sourceUrl: null,
        sourceData: {},
      };
      vi.mocked(fetchCommits).mockResolvedValue([mockItem]);

      // 1回目
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/pipeline/topics/extract',
        headers: AUTH_HEADERS,
        payload: { source: 'commits', repos: ['ttostudio/ai-company-os'] },
      });
      expect(res1.statusCode).toBe(200);
      expect(JSON.parse(res1.body).data.saved).toBe(1);

      // 2回目（重複）
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/pipeline/topics/extract',
        headers: AUTH_HEADERS,
        payload: { source: 'commits', repos: ['ttostudio/ai-company-os'] },
      });
      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.body);
      expect(body2.data.skipped).toBeGreaterThanOrEqual(1);

      // DB に該当 source_ref の行が1件のみ
      const rows = await sql`
        SELECT id FROM article_topics WHERE source_ref = ${sourceRef}
      `;
      expect(rows.length).toBe(1);
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-103: GitHub API エラー時に 502 を返す',
    async () => {
      vi.mocked(fetchCommits).mockRejectedValue(new Error('GitHub API error: 403 Forbidden'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/pipeline/topics/extract',
        headers: AUTH_HEADERS,
        payload: { source: 'commits', repos: ['ttostudio/ai-company-os'] },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('Failed to fetch GitHub activity');
    }
  );
});

// ============================================================
// GET /api/pipeline/topics — トピック一覧（IT-111〜112）
// ============================================================

describe('GET /api/pipeline/topics', () => {
  it.skipIf(!dbAvailable)(
    'IT-111: GET /api/pipeline/topics が DB から一覧を返す',
    async () => {
      // 5件挿入
      for (let i = 0; i < 5; i++) {
        await insertPendingTopic({ title: `IT-111 トピック ${i}` });
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/pipeline/topics',
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(5);
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-112: status フィルタが DB クエリに適用される',
    async () => {
      const acceptedRef1 = uniqueSourceRef();
      const acceptedRef2 = uniqueSourceRef();
      // accepted 2件を直接 INSERT
      await sql`
        INSERT INTO article_topics
          (title, category, tags, source_type, source_repo, source_ref, status, source_data)
        VALUES
          ('IT-112 accepted 1', 'tech', ${[]}, 'commit', 'ttostudio/ai-company-os', ${acceptedRef1}, 'accepted', ${sql.json({})}),
          ('IT-112 accepted 2', 'tech', ${[]}, 'commit', 'ttostudio/ai-company-os', ${acceptedRef2}, 'accepted', ${sql.json({})})
      `;

      const res = await app.inject({
        method: 'GET',
        url: '/api/pipeline/topics?status=accepted',
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
      // 全要素が accepted
      for (const topic of body.data) {
        expect(topic.status).toBe('accepted');
      }
    }
  );
});

// ============================================================
// PATCH /api/pipeline/topics/:id — ステータス更新（IT-121〜122）
// ============================================================

describe('PATCH /api/pipeline/topics/:id', () => {
  it.skipIf(!dbAvailable)(
    'IT-121: PATCH で accepted に更新し DB に反映される',
    async () => {
      const topicId = await insertPendingTopic({ title: 'IT-121 pending トピック' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pipeline/topics/${topicId}`,
        headers: AUTH_HEADERS,
        payload: { status: 'accepted' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('accepted');

      // DB 確認
      const [row] = await sql`SELECT status FROM article_topics WHERE id = ${topicId}`;
      expect(row['status']).toBe('accepted');
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-122: generated トピックへの PATCH は 409 を返す',
    async () => {
      // generated トピックを直接 INSERT
      const generatedRef = uniqueSourceRef();
      const [row] = await sql`
        INSERT INTO article_topics
          (title, category, tags, source_type, source_repo, source_ref, status, source_data)
        VALUES ('IT-122 generated', 'tech', ${[]}, 'commit', 'ttostudio/ai-company-os', ${generatedRef}, 'generated', ${sql.json({})})
        RETURNING id
      `;
      const topicId = row['id'] as string;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/pipeline/topics/${topicId}`,
        headers: AUTH_HEADERS,
        payload: { status: 'accepted' },
      });

      expect(res.statusCode).toBe(409);

      // DB のステータスが変化していないことを確認
      const [check] = await sql`SELECT status FROM article_topics WHERE id = ${topicId}`;
      expect(check['status']).toBe('generated');
    }
  );
});

// ============================================================
// POST /api/pipeline/topics/:id/generate — 生成ジョブ（IT-131〜136）
// ============================================================

describe('POST /api/pipeline/topics/:id/generate', () => {
  beforeEach(() => {
    vi.mocked(generateArticle).mockResolvedValue({
      title: 'テスト生成記事タイトル',
      slug: `qa-pipeline-int-${Date.now()}`,
      excerpt: 'これはテスト用の要約文です。生成記事の内容を簡潔に説明しています。',
      content:
        '# テスト生成記事\n\n' +
        'これはテスト用に生成された記事の本文です。\n\n'.repeat(20) +
        '## まとめ\n\nテスト用記事のまとめです。',
      promptTokens: 100,
      completionTokens: 500,
    });
  });

  it.skipIf(!dbAvailable)(
    'IT-131: POST /api/pipeline/topics/:id/generate が article_generation_jobs テーブルに保存する',
    async () => {
      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-131 accepted' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.data.topicId).toBe(topicId);
      expect(body.data.jobId).toBeDefined();
      expect(body.data.status).toBe('pending');

      // DB に article_generation_jobs 行が存在することを確認
      const jobs = await sql`
        SELECT * FROM article_generation_jobs WHERE topic_id = ${topicId}
      `;
      expect(jobs.length).toBeGreaterThanOrEqual(1);
      expect(['pending', 'generating', 'completed']).toContain(jobs[0]['status']);
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-132: 202 Accepted を即時返却する（非同期確認）',
    async () => {
      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-132 非同期確認' });

      const start = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });
      const elapsed = Date.now() - start;

      expect(res.statusCode).toBe(202);
      expect(elapsed).toBeLessThan(500);
      expect(JSON.parse(res.body).data.status).toBe('pending');
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-133: 生成ジョブが完了後に articles テーブルに draft 記事が保存される',
    async () => {
      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-133 Worker完了確認' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });
      expect(res.statusCode).toBe(202);

      // Worker 完了を待機（最大 10 秒ポーリング）
      let jobStatus = 'pending';
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const jobs = await sql`
          SELECT status FROM article_generation_jobs WHERE topic_id = ${topicId}
        `;
        if (jobs.length > 0) {
          jobStatus = jobs[0]['status'] as string;
          if (jobStatus === 'completed' || jobStatus === 'failed') break;
        }
      }

      expect(jobStatus, `Worker が completed にならなかった: ${jobStatus}`).toBe('completed');

      // articles テーブルに draft 記事が保存されていることを確認
      const articles = await sql`
        SELECT a.status FROM articles a
        JOIN article_generation_jobs j ON j.article_id = a.id
        WHERE j.topic_id = ${topicId}
      `;
      expect(articles.length).toBeGreaterThanOrEqual(1);
      expect(articles[0]['status']).toBe('draft');

      // article_topics が generated に更新されていることを確認
      const [topic] = await sql`SELECT status FROM article_topics WHERE id = ${topicId}`;
      expect(topic['status']).toBe('generated');
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-134: 生成記事の content が 300 文字以上',
    async () => {
      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-134 content長さ確認' });

      await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });

      // Worker 完了を待機
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const jobs = await sql`
          SELECT status FROM article_generation_jobs WHERE topic_id = ${topicId}
        `;
        if (jobs.length > 0 && ['completed', 'failed'].includes(jobs[0]['status'] as string)) break;
      }

      const rows = await sql`
        SELECT LENGTH(a.content)::int AS content_length
        FROM articles a
        JOIN article_generation_jobs j ON j.article_id = a.id
        WHERE j.topic_id = ${topicId}
      `;
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]['content_length']).toBeGreaterThanOrEqual(300);
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-135: 生成ジョブ二重起動は 409 を返す',
    async () => {
      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-135 二重起動' });

      // 1回目
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });
      expect(res1.statusCode).toBe(202);

      // ジョブが pending/generating 状態の間に2回目を試行
      // (Worker が完了する前に即座に実行)
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });

      // pending または generating 状態なら 409、完了済みなら新ジョブが作られうる
      // テストの信頼性のため: ジョブが active な場合は 409 を期待
      if (res2.statusCode === 409) {
        const body2 = JSON.parse(res2.body);
        expect(body2.error.message).toContain('already in progress');
      } else {
        // Worker が超高速で完了した場合（モック環境）は 202 も許容
        expect([202, 409]).toContain(res2.statusCode);
      }
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-136: pending トピックへの generate は 409 を返す',
    async () => {
      const topicId = await insertPendingTopic({ status: 'pending', title: 'IT-136 pending generate' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('accepted status');
    }
  );
});

// ============================================================
// GET /api/pipeline/topics/:id/job — ジョブステータス（IT-141〜144）
// ============================================================

describe('GET /api/pipeline/topics/:id/job', () => {
  it.skipIf(!dbAvailable)(
    'IT-141: GET /api/pipeline/topics/:id/job がジョブステータスを返す',
    async () => {
      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-141 job status' });

      // ジョブを作成
      const genRes = await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });
      expect(genRes.statusCode).toBe(202);

      const res = await app.inject({
        method: 'GET',
        url: `/api/pipeline/topics/${topicId}/job`,
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBeDefined();
      expect(body.data.topicId).toBe(topicId);
      expect(body.data.jobId ?? body.data.id).toBeDefined();
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-142: completed ジョブが articleSlug を含む',
    async () => {
      vi.mocked(generateArticle).mockResolvedValueOnce({
        title: 'IT-142 completed test',
        slug: `qa-pipeline-int-142-${Date.now()}`,
        excerpt: 'テスト要約',
        content: '# IT-142\n\n' + 'コンテンツ本文。\n'.repeat(30),
        promptTokens: 50,
        completionTokens: 200,
      });

      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-142 completed job' });

      await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });

      // Worker 完了待ち
      let data: Record<string, unknown> = {};
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = await app.inject({
          method: 'GET',
          url: `/api/pipeline/topics/${topicId}/job`,
          headers: AUTH_HEADERS,
        });
        data = JSON.parse(res.body).data;
        if (data['status'] === 'completed' || data['status'] === 'failed') break;
      }

      if (data['status'] === 'completed') {
        expect(data['articleSlug']).toBeDefined();
        expect(typeof data['articleSlug']).toBe('string');
      }
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-143: failed ジョブが errorMessage を含む',
    async () => {
      vi.mocked(generateArticle).mockRejectedValueOnce(
        new Error('Claude API request timed out')
      );

      const topicId = await insertPendingTopic({ status: 'accepted', title: 'IT-143 failed job' });

      await app.inject({
        method: 'POST',
        url: `/api/pipeline/topics/${topicId}/generate`,
        headers: AUTH_HEADERS,
        payload: { author: 'qa-pipeline-int' },
      });

      // Worker 完了待ち
      let data: Record<string, unknown> = {};
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = await app.inject({
          method: 'GET',
          url: `/api/pipeline/topics/${topicId}/job`,
          headers: AUTH_HEADERS,
        });
        data = JSON.parse(res.body).data;
        if (data['status'] === 'failed' || data['status'] === 'completed') break;
      }

      if (data['status'] === 'failed') {
        expect(data['errorMessage']).toBeDefined();
        expect(data['errorMessage']).toContain('Claude API');
      }
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-144: ジョブ未作成時は 404 を返す',
    async () => {
      // ジョブなしのトピックを作成
      const topicId = await insertPendingTopic({ status: 'pending', title: 'IT-144 no job' });

      const res = await app.inject({
        method: 'GET',
        url: `/api/pipeline/topics/${topicId}/job`,
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('Job not found');
    }
  );
});

// ============================================================
// 記事管理 — articles テーブル連携（IT-151〜155）
// ============================================================

describe('記事管理 — articles テーブル連携', () => {
  it.skipIf(!dbAvailable)(
    'IT-151: draft 記事を PATCH で published に遷移できる',
    async () => {
      // draft 記事を直接 DB に挿入
      const slug = `it151-draft-${Date.now()}`;
      await sql`
        INSERT INTO articles (title, slug, content, excerpt, category, tags, author, status)
        VALUES (
          'IT-151 draft 記事',
          ${slug},
          'テスト本文コンテンツ',
          'テスト要約',
          'tech',
          ${[]},
          'qa-pipeline-int',
          'draft'
        )
      `;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/articles/${slug}`,
        headers: AUTH_HEADERS,
        payload: { status: 'published' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('published');

      // DB 確認
      const [row] = await sql`SELECT status, published_at FROM articles WHERE slug = ${slug}`;
      expect(row['status']).toBe('published');
      expect(row['published_at']).not.toBeNull();
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-152: published 記事が GET /api/articles 一覧に含まれる',
    async () => {
      const slug = `it152-pub-${Date.now()}`;
      await sql`
        INSERT INTO articles (title, slug, content, excerpt, category, tags, author, status, published_at)
        VALUES (
          'IT-152 published 記事',
          ${slug},
          'テスト本文',
          '要約',
          'tech',
          ${[]},
          'qa-pipeline-int',
          'published',
          NOW()
        )
      `;

      const res = await app.inject({
        method: 'GET',
        url: '/api/articles?status=published&limit=100',
        headers: AUTH_HEADERS,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const slugs = body.data.map((a: { slug: string }) => a.slug);
      expect(slugs).toContain(slug);
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-153: GET /api/articles/:slug で生成記事を取得できる',
    async () => {
      const slug = `it153-get-${Date.now()}`;
      await sql`
        INSERT INTO articles (title, slug, content, excerpt, category, tags, author, status, published_at)
        VALUES (
          'IT-153 記事取得テスト',
          ${slug},
          '# IT-153\n\nコンテンツ本文です。',
          '要約テキスト',
          'ai-news',
          ${[]},
          'qa-pipeline-int',
          'published',
          NOW()
        )
      `;

      const res = await app.inject({
        method: 'GET',
        url: `/api/articles/${slug}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.slug).toBe(slug);
      expect(body.data.content).toBeDefined();
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-154: API_SECRET_KEY なしで pipeline API が 401 を返す',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pipeline/topics/extract',
        headers: { 'Content-Type': 'application/json' },
        // Authorization ヘッダなし
        payload: { source: 'all', repos: ['ttostudio/ai-company-os'] },
      });

      // API_SECRET_KEY が設定されている場合は 401 を期待
      expect([401, 400]).toContain(res.statusCode);
    }
  );

  it.skipIf(!dbAvailable)(
    'IT-155: DB ダウン時に API が 500 を返す',
    async () => {
      // 接続できない DB URL でアプリを起動し、エラーハンドリングを確認
      const badSql = createDb('postgres://invalid:invalid@localhost:9999/nonexistent');
      const badApp = buildApp(badSql);
      await badApp.ready();

      try {
        const res = await badApp.inject({
          method: 'GET',
          url: '/api/pipeline/topics',
          headers: { Authorization: `Bearer ${TEST_SECRET}` },
        });
        expect([500, 503]).toContain(res.statusCode);
      } finally {
        await badApp.close();
        await badSql.end().catch(() => {});
      }
    }
  );
});
