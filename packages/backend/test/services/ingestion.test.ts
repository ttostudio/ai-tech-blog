import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeContentHash, parseNewsItems } from '../../src/services/ingestion.js';
import type { TtoClawNewsPayload, InsertNewsItem } from '@ai-tech-blog/shared';

describe('ingestion service', () => {
  describe('computeContentHash', () => {
    it('returns consistent SHA-256 hash for same input', () => {
      const hash1 = computeContentHash('https://example.com', 'Test Title');
      const hash2 = computeContentHash('https://example.com', 'Test Title');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('returns different hashes for different inputs', () => {
      const hash1 = computeContentHash('https://a.com', 'Title A');
      const hash2 = computeContentHash('https://b.com', 'Title B');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('parseNewsItems', () => {
    it('parses ttoClaw payload into InsertNewsItem array', () => {
      const payload: TtoClawNewsPayload = {
        items: [
          {
            channel: 'claude-code-news',
            title: 'Claude Code v2 Released',
            url: 'https://example.com/claude-v2',
            summary: 'Major update to Claude Code',
            postedAt: '2026-03-21T00:00:00Z',
            metadata: { source: 'twitter' },
          },
        ],
      };

      const result = parseNewsItems(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual<InsertNewsItem>({
        sourceChannel: 'claude-code-news',
        title: 'Claude Code v2 Released',
        url: 'https://example.com/claude-v2',
        summary: 'Major update to Claude Code',
        rawData: { source: 'twitter', postedAt: '2026-03-21T00:00:00Z' },
        contentHash: computeContentHash('https://example.com/claude-v2', 'Claude Code v2 Released'),
      });
    });

    it('handles empty items array', () => {
      const result = parseNewsItems({ items: [] });
      expect(result).toEqual([]);
    });

    it('handles items with empty url', () => {
      const payload: TtoClawNewsPayload = {
        items: [
          {
            channel: 'sns-trendy-ai-hacks',
            title: 'AI Tip',
            url: '',
            summary: 'A cool tip',
            postedAt: '2026-03-21T00:00:00Z',
            metadata: {},
          },
        ],
      };

      const result = parseNewsItems(payload);
      expect(result[0].url).toBeNull();
    });

    it('parses multiple items', () => {
      const payload: TtoClawNewsPayload = {
        items: [
          { channel: 'claude-code-news', title: 'Item 1', url: 'https://a.com', summary: 'S1', postedAt: '2026-03-21T00:00:00Z', metadata: {} },
          { channel: 'claude-code-news', title: 'Item 2', url: 'https://b.com', summary: 'S2', postedAt: '2026-03-21T01:00:00Z', metadata: {} },
          { channel: 'sns-trendy-ai-hacks', title: 'Item 3', url: 'https://c.com', summary: 'S3', postedAt: '2026-03-21T02:00:00Z', metadata: {} },
        ],
      };

      const result = parseNewsItems(payload);
      expect(result).toHaveLength(3);
      expect(result[0].sourceChannel).toBe('claude-code-news');
      expect(result[2].sourceChannel).toBe('sns-trendy-ai-hacks');
    });
  });
});
