/**
 * "Mom texts back and Ferni answers" — thread logic plus the real inbound
 * Twilio webhook (signed request → TwiML reply), with Firestore and the LLM
 * swapped for in-memory fakes.
 */
import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactThread, ThreadMessage, ThreadStore } from '../contact-sms-conversation.js';

function memoryStore() {
  const threads = new Map<string, ContactThread>();
  const messages = new Map<string, ThreadMessage[]>();
  const notes: Array<{ userId: string; body: string; flagged: boolean }> = [];
  const store: ThreadStore = {
    get: async (p) => threads.get(p) ?? null,
    upsert: async (p, t) => void threads.set(p, { ...(threads.get(p) as ContactThread), ...t } as ContactThread),
    recent: async (p, n) => (messages.get(p) ?? []).slice(-n),
    append: async (p, m) => void messages.set(p, [...(messages.get(p) ?? []), m]),
    notifyUser: async (userId, note) => void notes.push({ userId, body: note.body, flagged: note.flagged }),
  };
  return { store, threads, messages, notes };
}

const mem = vi.hoisted(() => ({ current: null as null | { store: unknown } }));
const generate = vi.hoisted(() =>
  vi.fn(async (_system: string, _transcript: string) => 'That sounds lovely! How did the garden turn out?')
);
vi.mock('../contact-sms-conversation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contact-sms-conversation.js')>();
  return {
    ...actual,
    firestoreThreadStore: () => mem.current?.store ?? null,
    geminiReplyGenerator: generate,
  };
});

const convo = await import('../contact-sms-conversation.js');
const { handleInboundSMSWebhook } = await import('../webhooks/twilio-webhooks.js');

describe('contact SMS conversation', () => {
  beforeEach(() => generate.mockClear());

  it('normalises numbers to E.164', () => {
    expect(convo.toE164('(555) 123-4567')).toBe('+15551234567');
    expect(convo.toE164('1-555-123-4567')).toBe('+15551234567');
    expect(convo.toE164('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('replies in persona to a contact Ferni texted, with the thread as context', async () => {
    const { store, messages, notes } = memoryStore();
    await convo.recordOutboundText(store, {
      phone: '(555) 123-4567', userId: 'alice', contactName: 'Mom', userName: 'Alice', personaId: 'maya-santos',
      body: 'Hi! Alice wanted me to say she is thinking of you.',
    });
    const reply = await convo.handleContactReply(store, generate, '+15551234567', 'Aw, tell her I finished the garden!');

    expect(reply).toBe('That sounds lovely! How did the garden turn out?');
    const [system, transcript] = generate.mock.calls[0];
    expect(system).toContain('You are Maya');
    expect(system).toContain('on behalf of Alice');
    expect(transcript).toContain('Maya: Hi! Alice wanted me');
    expect(transcript).toContain('Mom: Aw, tell her I finished the garden!');
    expect(messages.get('+15551234567')?.map((m) => m.from)).toEqual(['ferni', 'contact', 'ferni']);
    expect(notes).toEqual([{ userId: 'alice', body: 'Aw, tell her I finished the garden!', flagged: false }]);
  });

  it('ignores numbers Ferni never texted and leaves STOP/HELP to Twilio', async () => {
    const { store } = memoryStore();
    expect(await convo.handleContactReply(store, generate, '+15550001111', 'who is this?')).toBeNull();
    await convo.recordOutboundText(store, { phone: '5551234567', userId: 'a', contactName: 'Mom', body: 'hi' });
    expect(await convo.handleContactReply(store, generate, '+15551234567', 'STOP')).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers crisis language safely and flags it for the user', async () => {
    const { store, notes, threads } = memoryStore();
    await convo.recordOutboundText(store, { phone: '5551234567', userId: 'alice', contactName: 'Mom', userName: 'Alice', body: 'hi' });
    const reply = await convo.handleContactReply(store, generate, '5551234567', 'honestly I want to die some days');
    expect(reply).toContain('988');
    expect(generate).not.toHaveBeenCalled();
    expect(notes[0]).toMatchObject({ userId: 'alice', flagged: true });
    expect(threads.get('+15551234567')?.flagged).toBe(true);
  });

  it('caps replies per day but still passes messages to the user', async () => {
    const { store, notes } = memoryStore();
    await convo.recordOutboundText(store, { phone: '5551234567', userId: 'alice', contactName: 'Mom', body: 'hi' });
    const day = new Date('2026-09-29T12:00:00Z');
    await store.upsert('+15551234567', { repliesDate: '2026-09-29', repliesToday: convo.MAX_REPLIES_PER_DAY });
    expect(await convo.handleContactReply(store, generate, '5551234567', 'one more', day)).toBeNull();
    expect(notes).toHaveLength(1);
  });
});

describe('inbound Twilio webhook → contact reply (end to end)', () => {
  it('a signed text from mom returns a TwiML reply from Ferni', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    const m = memoryStore();
    mem.current = { store: m.store };
    await convo.recordOutboundText(m.store, { phone: '5551234567', userId: 'alice', contactName: 'Mom', userName: 'Alice', body: 'Thinking of you!' });

    const url = 'https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound';
    const payload = { MessageSid: 'SM1', AccountSid: 'AC1', From: '+15551234567', To: '+15550000000', Body: 'Thank you sweetheart', NumMedia: '0' };
    const data = url + Object.keys(payload).sort().map((k) => k + payload[k as keyof typeof payload]).join('');
    const signature = createHmac('sha1', 'secret').update(data).digest('base64');

    const result = await handleInboundSMSWebhook(payload as never, signature, [url]);
    expect(result.success).toBe(true);
    expect(result.twiml).toContain('<Message>That sounds lovely! How did the garden turn out?</Message>');

    const forged = await handleInboundSMSWebhook(payload as never, 'forged', [url]);
    expect(forged).toEqual({ success: false });
  });
});
