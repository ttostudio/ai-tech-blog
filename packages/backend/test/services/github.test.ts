import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCommits, fetchIssues, fetchPullRequests } from '../../src/services/github.js';

const MOCK_COMMIT = {
  sha: 'abc123def456',
  html_url: 'https://github.com/owner/repo/commit/abc123def456',
  commit: {
    message: 'feat: add new feature\n\nDetailed description here.',
  },
};

const MOCK_ISSUE = {
  number: 42,
  title: 'Bug fix for authentication',
  body: 'Steps to reproduce...',
  html_url: 'https://github.com/owner/repo/issues/42',
};

const MOCK_PR = {
  number: 10,
  title: 'Add pipeline API',
  body: 'This PR adds the pipeline API endpoints.',
  html_url: 'https://github.com/owner/repo/pull/10',
};

describe('github service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UT-401: fetchCommits', () => {
    it('正常レスポンスをパースできる', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [MOCK_COMMIT],
      } as Response);

      const items = await fetchCommits({ repo: 'owner/repo' });

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('feat: add new feature');
      expect(items[0].sourceRef).toBe('abc123def456');
      expect(items[0].sourceUrl).toBe('https://github.com/owner/repo/commit/abc123def456');
      expect(items[0].sourceType).toBe('commit');
    });

    it('複数行コミットメッセージの最初の行をタイトルにする', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [MOCK_COMMIT],
      } as Response);

      const items = await fetchCommits({ repo: 'owner/repo' });
      expect(items[0].title).toBe('feat: add new feature');
      expect(items[0].description).toBe('Detailed description here.');
    });
  });

  describe('UT-402: fetchIssues', () => {
    it('正常レスポンスをパースできる', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [MOCK_ISSUE],
      } as Response);

      const items = await fetchIssues({ repo: 'owner/repo' });

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Bug fix for authentication');
      expect(items[0].sourceRef).toBe('issue#42');
      expect(items[0].sourceType).toBe('issue');
    });

    it('PRs（pull_request フィールドあり）はフィルタリングされる', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [
          MOCK_ISSUE,
          { ...MOCK_ISSUE, number: 99, pull_request: { url: 'https://...' } },
        ],
      } as Response);

      const items = await fetchIssues({ repo: 'owner/repo' });
      expect(items).toHaveLength(1);
    });
  });

  describe('UT-403: fetchPullRequests', () => {
    it('正常レスポンスをパースできる', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [MOCK_PR],
      } as Response);

      const items = await fetchPullRequests({ repo: 'owner/repo' });

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Add pipeline API');
      expect(items[0].sourceRef).toBe('pr#10');
      expect(items[0].sourceType).toBe('pull_request');
    });
  });

  describe('UT-404: エラーハンドリング', () => {
    it('GitHub API 4xx でエラーを throw する', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(fetchCommits({ repo: 'owner/repo' })).rejects.toThrow('GitHub API error: 403');
    });
  });

  describe('UT-405: タイムアウト', () => {
    it('fetch に AbortSignal が渡される', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

      await fetchCommits({ repo: 'owner/repo' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/owner/repo/commits'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
