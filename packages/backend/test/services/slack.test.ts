import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifySlack } from '../../src/services/slack.js';

describe('slack notification', () => {
  const originalEnv = process.env.SLACK_WEBHOOK_URL;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.SLACK_WEBHOOK_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it('skips notification when SLACK_WEBHOOK_URL is not set', async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    await notifySlack('Test Article', 'http://localhost:3100/articles/test');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends POST to webhook URL with article info', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifySlack('New AI Feature', 'http://localhost:3100/articles/new-ai-feature');

    expect(fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.text).toContain('New AI Feature');
    expect(body.text).toContain('http://localhost:3100/articles/new-ai-feature');
  });

  it('handles fetch errors gracefully', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    // Should not throw
    await notifySlack('Test', 'http://localhost:3100/articles/test');
  });

  it('handles non-ok response gracefully', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

    // Should not throw
    await notifySlack('Test', 'http://localhost:3100/articles/test');
  });
});
