#!/usr/bin/env npx tsx
/**
 * 自動記事生成スクリプト
 * GitHub PR/Issue の情報から AI Tech Blog の記事を自動生成する
 *
 * Usage:
 *   npx tsx scripts/generate-article.ts --repo ttostudio/ai-company-os --pr 809 --category claude-code
 *   npx tsx scripts/generate-article.ts --repo ttostudio/ai-company-os --pr 809 --dry-run
 */

import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// --- 設定 ---
const BLOG_API_URL = process.env.BLOG_API_URL ?? 'http://localhost:3100/api';
const VALID_CATEGORIES = ['claude-code', 'ai-hacks', 'ai-news', 'tech'] as const;

// --- 引数パース ---
interface CliArgs {
  repo: string;
  pr?: number;
  issue?: number;
  since?: string;
  category: string;
  author: string;
  status: 'draft' | 'published';
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: Partial<CliArgs> = { author: 'ttoClaw', status: 'draft', dryRun: false, category: 'tech' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo': result.repo = args[++i]; break;
      case '--pr': result.pr = parseInt(args[++i], 10); break;
      case '--issue': result.issue = parseInt(args[++i], 10); break;
      case '--since': result.since = args[++i]; break;
      case '--category': result.category = args[++i]; break;
      case '--author': result.author = args[++i]; break;
      case '--status': result.status = args[++i] as 'draft' | 'published'; break;
      case '--dry-run': result.dryRun = true; break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!result.repo) {
    console.error('Error: --repo is required (e.g., --repo ttostudio/ai-company-os)');
    process.exit(1);
  }

  // Validate repo format
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(result.repo)) {
    console.error('Error: --repo must be in owner/repo format');
    process.exit(1);
  }

  if (result.pr !== undefined && (isNaN(result.pr) || result.pr <= 0)) {
    console.error('Error: --pr must be a positive integer');
    process.exit(1);
  }

  if (result.issue !== undefined && (isNaN(result.issue) || result.issue <= 0)) {
    console.error('Error: --issue must be a positive integer');
    process.exit(1);
  }

  if (result.pr !== undefined && result.issue !== undefined) {
    console.error('Error: --pr and --issue are mutually exclusive');
    process.exit(1);
  }

  if (!VALID_CATEGORIES.includes(result.category as typeof VALID_CATEGORIES[number])) {
    console.error(`Error: --category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    process.exit(1);
  }

  return result as CliArgs;
}

// --- GitHub API ---
async function githubFetch(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const remaining = res.headers.get('X-RateLimit-Remaining');
  if (remaining && parseInt(remaining, 10) < 100) {
    console.warn(`Warning: GitHub API rate limit low (${remaining} remaining)`);
    await new Promise((r) => setTimeout(r, 60_000));
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${body}`);
  }

  return res.json();
}

interface PrInfo {
  title: string;
  body: string;
  labels: { name: string }[];
  head: { sha: string; ref: string };
  merged_at: string | null;
}

interface IssueInfo {
  title: string;
  body: string;
  labels: { name: string }[];
}

interface CommitInfo {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
}

interface FileInfo {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

async function fetchPrContext(repo: string, pr: number) {
  const prInfo = (await githubFetch(`/repos/${repo}/pulls/${pr}`)) as PrInfo;
  const commits = (await githubFetch(`/repos/${repo}/pulls/${pr}/commits?per_page=20`)) as CommitInfo[];
  const files = (await githubFetch(`/repos/${repo}/pulls/${pr}/files`)) as FileInfo[];

  return {
    type: 'PR' as const,
    title: prInfo.title,
    body: prInfo.body ?? '',
    labels: prInfo.labels.map((l) => l.name),
    commits: commits.map((c) => `${c.sha.slice(0, 7)}: ${c.commit.message.split('\n')[0]}`),
    files: files.slice(0, 10).map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`),
  };
}

async function fetchIssueContext(repo: string, issue: number) {
  const issueInfo = (await githubFetch(`/repos/${repo}/issues/${issue}`)) as IssueInfo;

  return {
    type: 'Issue' as const,
    title: issueInfo.title,
    body: issueInfo.body ?? '',
    labels: issueInfo.labels.map((l) => l.name),
    commits: [] as string[],
    files: [] as string[],
  };
}

// --- Claude CLI ---
function execClaudePrompt(promptText: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const tmpPath = join(tmpdir(), `prompt-${randomUUID()}.txt`);
    try {
      await writeFile(tmpPath, promptText, 'utf-8');

      execFile(
        'claude',
        ['--print', '--no-conversation', '--model', 'claude-sonnet-4-6', `$(cat "${tmpPath}")`],
        { shell: '/bin/bash', maxBuffer: 1024 * 1024, timeout: 300_000 },
        async (err, stdout, stderr) => {
          try { await unlink(tmpPath); } catch {}
          if (err) return reject(new Error(`Claude CLI error: ${err.message}\n${stderr}`));
          resolve(stdout.trim());
        },
      );
    } catch (err) {
      try { await unlink(tmpPath); } catch {}
      reject(err);
    }
  });
}

// --- 品質スコアリング ---
interface ScoreDetail {
  criterion: string;
  score: number;
  max: number;
  note?: string;
}

interface ScoreResult {
  score: number;
  details: ScoreDetail[];
}

export function scoreArticle(article: {
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
}): ScoreResult {
  const details: ScoreDetail[] = [];

  // 文字数: 3000-8000 → 10点
  const charCount = article.content.length;
  const charScore = charCount >= 3000 && charCount <= 8000 ? 10
    : charCount >= 1500 && charCount < 3000 ? 5
    : charCount > 8000 && charCount <= 12000 ? 7
    : 0;
  details.push({
    criterion: '文字数',
    score: charScore,
    max: 10,
    note: `${charCount}文字 (目標: 3000-8000)`,
  });

  // H2 見出し数: 3個以上 → 10点
  const h2Count = (article.content.match(/^## /gm) ?? []).length;
  const h2Score = h2Count >= 3 ? 10 : h2Count === 2 ? 7 : h2Count === 1 ? 3 : 0;
  details.push({
    criterion: 'H2見出し数',
    score: h2Score,
    max: 10,
    note: `${h2Count}個 (目標: 3個以上)`,
  });

  // コードブロック: 1個以上 → 10点
  const codeBlockCount = (article.content.match(/```/g) ?? []).length / 2;
  const codeScore = codeBlockCount >= 1 ? 10 : 0;
  details.push({
    criterion: 'コードブロック',
    score: codeScore,
    max: 10,
    note: `${Math.floor(codeBlockCount)}個 (目標: 1個以上)`,
  });

  // title長: 30-60文字 → 10点
  const titleLen = article.title.length;
  const titleScore = titleLen >= 30 && titleLen <= 60 ? 10
    : titleLen >= 20 && titleLen < 30 ? 7
    : titleLen > 60 && titleLen <= 80 ? 7
    : titleLen > 0 ? 3
    : 0;
  details.push({
    criterion: 'タイトル長',
    score: titleScore,
    max: 10,
    note: `${titleLen}文字 (目標: 30-60文字)`,
  });

  // excerpt長: 100-200文字 → 10点
  const excerptLen = article.excerpt.length;
  const excerptScore = excerptLen >= 100 && excerptLen <= 200 ? 10
    : excerptLen >= 50 && excerptLen < 100 ? 5
    : excerptLen > 200 && excerptLen <= 300 ? 7
    : excerptLen > 0 ? 3
    : 0;
  details.push({
    criterion: 'excerpt長',
    score: excerptScore,
    max: 10,
    note: `${excerptLen}文字 (目標: 100-200文字)`,
  });

  // tags数: 3-7個 → 10点
  const tagCount = article.tags.length;
  const tagScore = tagCount >= 3 && tagCount <= 7 ? 10
    : tagCount === 2 || tagCount === 8 ? 7
    : tagCount >= 1 ? 3
    : 0;
  details.push({
    criterion: 'タグ数',
    score: tagScore,
    max: 10,
    note: `${tagCount}個 (目標: 3-7個)`,
  });

  // 導入段落: 最初のH2前にテキストが存在するか
  const firstH2Index = article.content.indexOf('\n## ');
  const intro = firstH2Index > 0 ? article.content.slice(0, firstH2Index).trim() : '';
  const introScore = intro.length >= 50 ? 10 : intro.length > 0 ? 5 : 0;
  details.push({
    criterion: '導入段落',
    score: introScore,
    max: 10,
    note: intro.length > 0 ? `${intro.length}文字` : 'なし',
  });

  // まとめ段落: まとめ/おわりに/conclusion を含む見出しが存在するか
  const hasSummary = /^## .*(まとめ|おわりに|conclusion|まとめと|終わりに)/im.test(article.content);
  const summaryScore = hasSummary ? 10 : 0;
  details.push({
    criterion: 'まとめ段落',
    score: summaryScore,
    max: 10,
    note: hasSummary ? 'あり' : 'なし',
  });

  const totalScore = details.reduce((sum, d) => sum + d.score, 0);
  return { score: totalScore, details };
}

// --- スラッグ生成 ---
function generateSlug(prNumber: number | undefined, issueNumber: number | undefined, title: string): string {
  const prefix = prNumber ? `pr-${prNumber}` : issueNumber ? `issue-${issueNumber}` : '';
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const slug = prefix ? `${prefix}-${titleSlug}` : titleSlug;
  return slug.replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '').slice(0, 100);
}

// --- メイン ---
async function main() {
  const args = parseArgs();
  console.log(`\n=== AI Tech Blog 記事自動生成 ===`);
  console.log(`Repository: ${args.repo}`);
  if (args.pr) console.log(`PR: #${args.pr}`);
  if (args.issue) console.log(`Issue: #${args.issue}`);
  console.log(`Category: ${args.category}`);
  console.log(`Dry run: ${args.dryRun}\n`);

  // 1. GitHub 情報取得
  console.log('GitHub から情報を取得中...');
  const context = args.pr
    ? await fetchPrContext(args.repo, args.pr)
    : args.issue
      ? await fetchIssueContext(args.repo, args.issue)
      : null;

  if (!context) {
    console.error('Error: --pr or --issue is required');
    process.exit(1);
  }

  // 2. Claude CLI でコンテンツ生成
  const promptText = `あなたは AI Tech Blog のシニアテクニカルライターです。
エンジニア向けのわかりやすく実践的な記事を日本語で書いてください。

以下の GitHub ${context.type} 情報を元に、AI Tech Blog の記事を生成してください。

## ${context.type} 情報
タイトル: ${context.title}
説明: ${context.body}
ラベル: ${context.labels.join(', ')}

## コミット履歴
${context.commits.join('\n')}

## 主な変更ファイル
${context.files.join('\n')}

## 記事構成の必須要件
1. **導入段落（H2前）**: 読者の課題・背景を説明し、この記事で何が得られるかを明示（50文字以上）
2. **H2見出し**: 3個以上設ける（例: 背景・課題 / 解決策・実装 / 結果・考察 / まとめ）
3. **コードブロック**: 実際のコード・コマンドを1つ以上含める
4. **まとめセクション**: 最後に「## まとめ」または「## おわりに」を必ず記述

## SEO要件
- title: 30〜60文字で検索されやすいキーワードを含める
- excerpt: 100〜200文字で記事の価値を端的に伝える
- tags: 3〜7個、具体的な技術キーワードを含める

## 品質基準
- 本文: 3000〜8000文字（詳細な解説・実例を含めて充実させること）
- 技術的正確さ: コードサンプルは実際に動作する内容にする
- 読者視点: なぜその実装を選んだか、どう応用できるかを説明する

## 出力形式 (JSON)
必ず以下のJSON形式のみを出力してください（余計なテキストなし）:
{
  "title": "記事タイトル（30〜60文字）",
  "excerpt": "記事の概要（100〜200文字）",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "content": "Markdown形式の記事本文（導入段落 + H2見出し3個以上 + コードブロック1個以上 + まとめ、3000〜8000文字）"
}`;

  console.log('Claude CLI で記事を生成中...');
  let articleData: { title: string; excerpt: string; tags: string[]; content: string };

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const output = await execClaudePrompt(promptText);
      // Extract JSON from output (may have surrounding text)
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in Claude output');
      articleData = JSON.parse(jsonMatch[0]);
      break;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(`Failed after ${MAX_RETRIES} attempts:`, err);
        process.exit(1);
      }
      console.warn(`Attempt ${attempt} failed, retrying...`);
    }
  }

  // Sanitize
  const title = articleData!.title.replace(/<[^>]*>/g, '').slice(0, 500);
  const content = articleData!.content.replace(/<[^>]*>/g, '').slice(0, 10000);
  const excerpt = (articleData!.excerpt ?? '').slice(0, 1000);
  const tags = (articleData!.tags ?? [])
    .map((t: string) => t.trim())
    .filter((t: string) => t.length > 0)
    .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i)
    .slice(0, 10);

  const slug = generateSlug(args.pr, args.issue, title);

  const article = {
    title,
    slug,
    content,
    excerpt,
    category: args.category,
    tags,
    author: args.author,
    status: args.status,
  };

  // 品質スコアリング
  const scoreResult = scoreArticle({ title, content, excerpt, tags });
  console.log(`\n=== 品質スコア: ${scoreResult.score}/80 ${scoreResult.score >= 60 ? '✓ PASS' : '✗ FAIL'} ===`);
  for (const d of scoreResult.details) {
    const mark = d.score === d.max ? '✓' : d.score > 0 ? '△' : '✗';
    console.log(`  ${mark} ${d.criterion}: ${d.score}/${d.max}${d.note ? ` (${d.note})` : ''}`);
  }
  console.log('');

  if (scoreResult.score < 60 && !args.dryRun) {
    console.warn('Warning: 品質スコアが60点未満です。記事をdraftとして保存します。');
    article.status = 'draft';
  }

  // 3. dry-run or 投稿
  if (args.dryRun) {
    console.log('\n=== Dry Run 出力 ===\n');
    console.log(JSON.stringify(article, null, 2));
    process.exit(0);
  }

  // slug 重複チェック
  const checkRes = await fetch(`${BLOG_API_URL}/articles/${slug}`);
  if (checkRes.ok) {
    console.log(`Skipped: slug "${slug}" already exists`);
    process.exit(0);
  }

  // 投稿
  console.log('記事を投稿中...');
  const postRes = await fetch(`${BLOG_API_URL}/articles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.API_SECRET_KEY ? { Authorization: `Bearer ${process.env.API_SECRET_KEY}` } : {}),
    },
    body: JSON.stringify(article),
  });

  if (!postRes.ok) {
    const body = await postRes.text();
    console.error(`POST failed: ${postRes.status} ${body}`);
    process.exit(1);
  }

  const result = (await postRes.json()) as { data: { id: string; slug: string } };
  console.log(`\n記事を投稿しました: ${result.data.slug}`);
  console.log(`URL: ${BLOG_API_URL.replace('/api', '')}/articles/${result.data.slug}`);

  // サムネイル生成キック
  console.log('サムネイル生成をリクエスト中...');
  await fetch(`${BLOG_API_URL}/articles/${result.data.slug}/thumbnail`, { method: 'POST' });
  console.log('完了');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
