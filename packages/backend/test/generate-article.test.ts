import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = resolve(process.cwd(), 'scripts/generate-article.ts');

describe('scripts/generate-article.ts', () => {
  it('--repo 未指定でエラー終了する', async () => {
    try {
      await execFileAsync('npx', ['tsx', SCRIPT_PATH], {
        timeout: 15_000,
      });
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string; code: number };
      expect(e.stderr).toContain('--repo is required');
    }
  });

  it('不正な --repo フォーマットでエラー終了する', async () => {
    try {
      await execFileAsync('npx', ['tsx', SCRIPT_PATH, '--repo', 'invalid-format'], {
        timeout: 15_000,
      });
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string };
      expect(e.stderr).toContain('owner/repo format');
    }
  });

  it('GITHUB_TOKEN 未設定で --pr 指定時にエラー終了する', async () => {
    try {
      await execFileAsync('npx', ['tsx', SCRIPT_PATH, '--repo', 'owner/repo', '--pr', '1'], {
        timeout: 15_000,
        env: { ...process.env, GITHUB_TOKEN: '' },
      });
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string };
      expect(e.stderr).toContain('GITHUB_TOKEN');
    }
  });

  it('--pr と --issue の同時指定でエラー終了する', async () => {
    try {
      await execFileAsync('npx', ['tsx', SCRIPT_PATH, '--repo', 'owner/repo', '--pr', '1', '--issue', '2'], {
        timeout: 15_000,
      });
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string };
      expect(e.stderr).toContain('mutually exclusive');
    }
  });

  it('不正な --category でエラー終了する', async () => {
    try {
      await execFileAsync('npx', ['tsx', SCRIPT_PATH, '--repo', 'owner/repo', '--pr', '1', '--category', 'invalid-cat'], {
        timeout: 15_000,
      });
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string };
      expect(e.stderr).toContain('--category must be one of');
    }
  });
});
