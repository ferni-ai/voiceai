/**
 * CALL_KNOWS_RECENT_TEXTS: "Ferni texted me, then I rang, and he didn't know"
 * (Seth, 2026-10-19). Setup reads the texts sent lately once, bounded, and
 * both the call-start instructions and the greeting's facts carry them.
 */
import { describe, expect, it, vi } from 'vitest';
import type { StoredCheckin } from '../../../services/outreach/checkin-replies.js';
import type { RecentTextsStore } from '../../../services/outreach/recent-texts.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
  source: 'understudy',
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));

const { recentTextsBlock, sentWhen, takeRecentTextFacts } =
  await import('../recent-texts-awareness.js');
const { textSnippet } = await import('../../../services/outreach/recent-texts.js');
const { directedGreeting } = await import('../greeting-direction.js');
const { rememberCallerRecognition, rememberDispatchIdentity } =
  await import('../../voice-agent-entry/caller-recognition.js');
// The production owner check, as job-executor.ts registers it.
await import('../../voice-agent-entry/recent-texts-owner-register.js');

const NOW = new Date('2026-10-19T16:00:00Z');
const HOUR = 3_600_000;
const ON = { CALL_KNOWS_RECENT_TEXTS: 'on' };
const ago = (h: number): string => new Date(NOW.getTime() - h * HOUR).toISOString();
const BODY = 'Hey Sam, just a nudge to call the dentist before 5 today about moving Thursday';

function record(over: Partial<StoredCheckin> = {}): StoredCheckin {
  return {
    id: 'r1',
    userId: 'u1',
    sessionId: 's0',
    sentAt: ago(2),
    question: BODY,
    status: 'sent',
    phoneLast4: '4567',
    phoneHash: 'h',
    kind: 'reminder',
    ...over,
  };
}

function store(records: StoredCheckin[], replied: string[] = []): RecentTextsStore {
  return {
    forUser: vi.fn(async () => records),
    hasReply: vi.fn(async (id: string) => replied.includes(id)),
  };
}

const deps = (s: RecentTextsStore, env: Record<string, string> = ON) => ({
  store: s,
  env,
  now: () => NOW,
});

/** A signed-in app call: the dispatch named the account (web_auth), not a phone. */
async function webBlock(sessionId: string, d: ReturnType<typeof deps>): Promise<string> {
  rememberDispatchIdentity(sessionId, 'web_auth', '{}');
  return recentTextsBlock(sessionId, 'u1', 'UTC', false, d);
}

interface Request {
  facts: Record<string, string>;
}
const lastFacts = (): Record<string, string> =>
  (directedText.mock.calls.at(-1)?.[1] as unknown as Request).facts;

describe('recent texts at call start', () => {
  it('a text 2 h ago is a fact with its kind and snippet, and the greeting has it', async () => {
    const block = await webBlock('rt-1', deps(store([record()])));
    expect(block).toContain(
      'You texted them about 2 hours ago (a reminder: "Hey Sam, just a nudge'
    );
    expect(block).toContain("They haven't replied. If it fits, ask whether they saw it");
    await directedGreeting('rt-1', 'ferni', { userId: 'voice-eval-rt1', userName: 'Sam' });
    expect(lastFacts()['a text you sent them before this call']).toContain('a reminder: "Hey Sam');
  });

  it('a text with a reply says they replied', async () => {
    const block = await webBlock('rt-2', deps(store([record()], ['r1'])));
    expect(block).toContain('They replied.');
    expect(block).not.toContain("haven't replied");
  });

  it('leaves out a text sent for them to someone else', async () => {
    const s = store([record({ kind: 'on-behalf', question: 'Hi Mike, Sam asked me to text you' })]);
    expect(await webBlock('rt-3', deps(s))).toBe('');
    expect(takeRecentTextFacts('rt-3')).toEqual({});
  });

  it('leaves out a text sent 7 h ago', async () => {
    const s = store([record({ sentAt: ago(7) })]);
    expect(await webBlock('rt-4', deps(s))).toBe('');
  });

  it('flag off: nothing is read and the greeting has no text fact', async () => {
    const s = store([record()]);
    expect(await webBlock('rt-5', deps(s, {}))).toBe('');
    expect(s.forUser).not.toHaveBeenCalled();
    await directedGreeting('rt-5', 'ferni', { userId: 'voice-eval-rt5' });
    expect(lastFacts()['a text you sent them before this call']).toBeUndefined();
  });

  it('a slow store gives no fact within the bound and the call goes on', async () => {
    const slow: RecentTextsStore = {
      forUser: vi.fn(
        async () =>
          new Promise<StoredCheckin[]>((resolve) => {
            setTimeout(() => resolve([record()]), 5000);
          })
      ),
      hasReply: vi.fn(async () => false),
    };
    const started = Date.now();
    expect(await webBlock('rt-6', deps(slow))).toBe('');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(slow.forUser).toHaveBeenCalled();
  });

  it('a failing store gives no fact and does not throw', async () => {
    const failing: RecentTextsStore = {
      forUser: vi.fn(async () => {
        throw new Error('firestore down');
      }),
      hasReply: vi.fn(async () => false),
    };
    expect(await webBlock('rt-7', deps(failing))).toBe('');
  });
});

describe('only a proven owner on the line hears about their texts', () => {
  const phoneBlock = async (sessionId: string, s: RecentTextsStore): Promise<string> =>
    recentTextsBlock(sessionId, 'u1', 'UTC', true, deps(s));

  it('a phone caller recognised as maybe or stranger: nothing read, nothing kept', async () => {
    for (const status of ['maybe', 'stranger'] as const) {
      const s = store([record()]);
      rememberCallerRecognition(`ph-${status}`, { status, attestation: 'none' });
      expect(await phoneBlock(`ph-${status}`, s)).toBe('');
      expect(s.forUser).not.toHaveBeenCalled();
      expect(takeRecentTextFacts(`ph-${status}`)).toEqual({});
    }
  });

  it('a phone session with no recognition: nothing read', async () => {
    const s = store([record()]);
    expect(await phoneBlock('ph-none', s)).toBe('');
    expect(s.forUser).not.toHaveBeenCalled();
  });

  it("a call Ferni placed to the owner's number (dispatch names the account): nothing read", async () => {
    const s = store([record()]);
    rememberDispatchIdentity('ph-placed', 'firebase', '{"type":"proactive_outreach"}');
    expect(await phoneBlock('ph-placed', s)).toBe('');
    expect(s.forUser).not.toHaveBeenCalled();
  });

  it('an app session the dispatch did not authenticate: nothing read', async () => {
    const s = store([record()]);
    expect(await recentTextsBlock('web-anon', 'u1', 'UTC', false, deps(s))).toBe('');
    expect(s.forUser).not.toHaveBeenCalled();
  });

  it('a recognised (known) phone caller and a signed-in app call both get the facts', async () => {
    rememberCallerRecognition('ph-known', { status: 'known', attestation: 'A', userId: 'u1' });
    expect(await phoneBlock('ph-known', store([record()]))).toContain('a reminder');
    expect(await webBlock('web-auth', deps(store([record()])))).toContain('a reminder');
  });
});

describe('what Ferni is told about a text', () => {
  it('relative time reads in their zone', () => {
    const now = new Date('2026-10-19T05:00:00Z'); // 01:00 in New York
    const sent = new Date('2026-10-19T02:00:00Z'); // 22:00 the night before there
    expect(sentWhen(sent, now, 'America/New_York')).toBe('about 3 hours ago, last night');
    expect(sentWhen(sent, now, 'UTC')).toBe('about 3 hours ago');
    expect(sentWhen(new Date(ago(2)), NOW, 'America/New_York')).toBe(
      'about 2 hours ago, this morning'
    );
  });

  it('the snippet has no numbers, em dashes or ellipses and stops near 100 chars', () => {
    const s = textSnippet(`Call Mike on +1 (555) 123-4567 — he said so… ${'word '.repeat(40)}`);
    expect(s).not.toMatch(/\d{3}|—|–|…|\.\./);
    expect(s).toContain('a number');
    expect(s.length).toBeLessThanOrEqual(100);
  });
});
