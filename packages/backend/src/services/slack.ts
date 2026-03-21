export async function notifySlack(articleTitle: string, articleUrl: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('SLACK_WEBHOOK_URL not set, skipping notification');
    return;
  }

  const payload = {
    text: `New article published: *${articleTitle}*\n${articleUrl}`,
    unfurl_links: false,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Slack notification failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('Slack notification error:', err);
  }
}
