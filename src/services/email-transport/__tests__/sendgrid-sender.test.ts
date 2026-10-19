import { describe, expect, it } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';
import { createSendGridSender, SENDGRID_SEND_URL } from '../sendgrid-sender.js';

const EMAIL: OutgoingEmail = {
  to: 'sam@example.com',
  subject: 'Hi',
  text: 'text',
  html: '<b>html</b>',
  kind: 'transactional',
};
const CONFIG = { apiKey: 'SG.key', from: 'noreply@ferni.ai', fromName: 'Ferni' };

function recorder(status = 202) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return new Response(status === 202 ? '' : '{"errors":[{"message":"account blocked"}]}', {
      status,
      headers: { 'x-message-id': 'sg-1' },
    });
  }) as typeof fetch;
  const body = (i = 0): Record<string, unknown> =>
    JSON.parse(String(calls[i]?.init.body)) as Record<string, unknown>;
  return { calls, fetchImpl, body };
}

describe('sendgrid sender', () => {
  it('builds the v3 request: from, reply-to, text before html, unsubscribe headers, attachments, tracking', async () => {
    const r = recorder();
    const res = await createSendGridSender(CONFIG, { fetch: r.fetchImpl }).send({
      ...EMAIL,
      kind: 'bulk',
      replyTo: 'hello@ferni.ai',
      unsubscribe: { url: 'https://ferni.ai/u' },
      attachments: [{ filename: 'a.mp3', content: 'QUJD', contentType: 'audio/mpeg' }],
      tags: ['newsletter'],
      metadata: { userId: 'u1' },
      tracking: { opens: true },
    });
    expect(res).toEqual({ ok: true, provider: 'sendgrid', status: 202, messageId: 'sg-1' });
    expect(r.calls[0]?.url).toBe(SENDGRID_SEND_URL);
    expect((r.calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer SG.key'
    );
    const body = r.body();
    expect(body.personalizations).toEqual([{ to: [{ email: 'sam@example.com' }] }]);
    expect(body.from).toEqual({ email: 'noreply@ferni.ai', name: 'Ferni' });
    expect(body.reply_to).toEqual({ email: 'hello@ferni.ai' });
    expect((body.content as Array<{ type: string }>).map((c) => c.type)).toEqual([
      'text/plain',
      'text/html',
    ]);
    expect(body.headers).toEqual({
      'List-Unsubscribe': '<https://ferni.ai/u>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(body.attachments).toEqual([
      { content: 'QUJD', filename: 'a.mp3', type: 'audio/mpeg', disposition: 'attachment' },
    ]);
    expect(body.categories).toEqual(['newsletter']);
    expect(body.custom_args).toEqual({ userId: 'u1' });
    expect(body.tracking_settings).toEqual({
      open_tracking: { enable: true },
      click_tracking: { enable: false },
    });
  });

  it('keeps a per-message from address and display name (existing voice@ / alerts@ senders)', async () => {
    const r = recorder();
    await createSendGridSender(CONFIG, { fetch: r.fetchImpl }).send({
      ...EMAIL,
      from: 'voice@ferni.ai',
      fromName: 'Maya',
    });
    expect(r.body().from).toEqual({ email: 'voice@ferni.ai', name: 'Maya' });
  });

  it('refuses bulk mail without an unsubscribe target, without calling out', async () => {
    const r = recorder();
    const res = await createSendGridSender(CONFIG, { fetch: r.fetchImpl }).send({
      ...EMAIL,
      kind: 'bulk',
    });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/unsubscribe/) });
    expect(r.calls).toHaveLength(0);
  });

  it('reports the 401 a blocked account returns, without throwing', async () => {
    const r = recorder(401);
    const res = await createSendGridSender(CONFIG, { fetch: r.fetchImpl }).send(EMAIL);
    expect(res).toMatchObject({ ok: false, provider: 'sendgrid', status: 401, retryable: false });
    expect(res.error).toMatch(/^SendGrid 401/);
  });

  it('marks 429 and 5xx as retryable', async () => {
    for (const status of [429, 503]) {
      const res = await createSendGridSender(CONFIG, { fetch: recorder(status).fetchImpl }).send(
        EMAIL
      );
      expect(res).toMatchObject({ ok: false, status, retryable: true });
    }
  });

  it('is unconfigured without an API key and does not call out', async () => {
    const r = recorder();
    const sender = createSendGridSender({ ...CONFIG, apiKey: '' }, { fetch: r.fetchImpl });
    expect(sender.isConfigured()).toBe(false);
    expect(await sender.send(EMAIL)).toMatchObject({
      ok: false,
      error: 'SENDGRID_API_KEY is not set',
    });
    expect(r.calls).toHaveLength(0);
  });
});

describe('sendgrid sender: no recipient addresses in errors', () => {
  it('redacts addresses SendGrid echoes back, so the result is safe to log', async () => {
    const fetchImpl = (async () =>
      new Response(
        '{"errors":[{"message":"Does not contain a valid address: sam.o-neil+x@example.co.uk"}]}',
        {
          status: 400,
        }
      )) as typeof fetch;
    const res = await createSendGridSender(CONFIG, { fetch: fetchImpl }).send({
      ...EMAIL,
      to: 'sam.o-neil+x@example.co.uk',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('[address]');
    expect(JSON.stringify(res)).not.toContain('@');
  });

  it('redacts addresses in a thrown network error', async () => {
    const fetchImpl = (async () => {
      throw new Error('socket hang up while sending to sam@example.com');
    }) as typeof fetch;
    const res = await createSendGridSender(CONFIG, { fetch: fetchImpl }).send(EMAIL);
    expect(JSON.stringify(res)).not.toContain('@');
  });
});
