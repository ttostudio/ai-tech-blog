import type { TopicSourceType } from '@ai-tech-blog/shared';

const GITHUB_API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 30_000;

export interface GitHubTopicItem {
  title: string;
  description: string | null;
  sourceType: TopicSourceType;
  sourceRepo: string;
  sourceRef: string;
  sourceUrl: string;
  sourceData: Record<string, unknown>;
}

export interface FetchOptions {
  repo: string;
  since?: string;
  limit?: number;
  token?: string;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const tok = token ?? process.env.GITHUB_TOKEN;
  if (tok) {
    headers['Authorization'] = `Bearer ${tok}`;
  }
  return headers;
}

async function githubFetch(url: string, token?: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(token),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCommits(opts: FetchOptions): Promise<GitHubTopicItem[]> {
  const { repo, since, limit = 20, token } = opts;
  const params = new URLSearchParams({ per_page: String(limit) });
  if (since) params.set('since', since);

  const data = (await githubFetch(
    `${GITHUB_API_BASE}/repos/${repo}/commits?${params}`,
    token,
  )) as Array<Record<string, unknown>>;

  return data.map((commit) => {
    const commitData = commit['commit'] as Record<string, unknown>;
    const message = (commitData?.['message'] as string) ?? '';
    const firstLine = message.split('\n')[0].trim();
    const sha = commit['sha'] as string;
    const htmlUrl = commit['html_url'] as string;

    return {
      title: firstLine,
      description: message.includes('\n') ? message.slice(firstLine.length).trim() || null : null,
      sourceType: 'commit' as TopicSourceType,
      sourceRepo: repo,
      sourceRef: sha,
      sourceUrl: htmlUrl,
      sourceData: commit as Record<string, unknown>,
    };
  });
}

export async function fetchIssues(opts: FetchOptions): Promise<GitHubTopicItem[]> {
  const { repo, since, limit = 20, token } = opts;
  const params = new URLSearchParams({ state: 'closed', per_page: String(limit) });
  if (since) params.set('since', since);

  const data = (await githubFetch(
    `${GITHUB_API_BASE}/repos/${repo}/issues?${params}`,
    token,
  )) as Array<Record<string, unknown>>;

  // Filter out pull requests (GitHub returns PRs in issues endpoint too)
  return data
    .filter((issue) => !issue['pull_request'])
    .map((issue) => ({
      title: issue['title'] as string,
      description: (issue['body'] as string | null) ?? null,
      sourceType: 'issue' as TopicSourceType,
      sourceRepo: repo,
      sourceRef: `issue#${issue['number']}`,
      sourceUrl: issue['html_url'] as string,
      sourceData: issue as Record<string, unknown>,
    }));
}

export async function fetchPullRequests(opts: FetchOptions): Promise<GitHubTopicItem[]> {
  const { repo, limit = 20, token } = opts;
  const params = new URLSearchParams({ state: 'closed', per_page: String(limit) });

  const data = (await githubFetch(
    `${GITHUB_API_BASE}/repos/${repo}/pulls?${params}`,
    token,
  )) as Array<Record<string, unknown>>;

  return data.map((pr) => ({
    title: pr['title'] as string,
    description: (pr['body'] as string | null) ?? null,
    sourceType: 'pull_request' as TopicSourceType,
    sourceRepo: repo,
    sourceRef: `pr#${pr['number']}`,
    sourceUrl: pr['html_url'] as string,
    sourceData: pr as Record<string, unknown>,
  }));
}
