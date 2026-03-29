import { describe, it, expect } from 'vitest';
import { generateSlug } from '../../src/utils/slug.js';

describe('generateSlug', () => {
  it('UT-601: 英数字と日本語混合タイトルをスラグに変換する', () => {
    const slug = generateSlug('Claude Code 入門ガイド');
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/);
    expect(slug).toContain('claude');
    expect(slug).toContain('code');
  });

  it('UT-602: 特殊文字を除去する', () => {
    const slug = generateSlug('Hello! World? #2026');
    expect(slug).toBe('hello-world-2026');
  });

  it('UT-603: 連続スペースを単一ハイフンに正規化する', () => {
    const slug = generateSlug('a  b   c');
    expect(slug).toBe('a-b-c');
  });

  it('UT-604: 先頭・末尾のハイフンを除去する', () => {
    const slug = generateSlug('-hello-');
    expect(slug).toBe('hello');
  });

  it('UT-605: 最大長 64 文字に制限する', () => {
    const long = 'a'.repeat(65);
    const slug = generateSlug(long);
    expect(slug.length).toBeLessThanOrEqual(64);
  });

  it('アンダースコアはハイフンに変換される', () => {
    const slug = generateSlug('hello_world');
    expect(slug).toBe('hello-world');
  });

  it('連続ハイフンは単一に正規化される', () => {
    const slug = generateSlug('a--b---c');
    expect(slug).toBe('a-b-c');
  });
});
