/**
 * "Forget that" on the proactive texts and notes (FORGET_EVERY_READER): a promise, a missed
 * reminder or a pondered note about a forgotten topic is skipped, never sent with a hole, and
 * one about anything else still goes. Off, every one goes as before. No topic source at all
 * skips them (a privacy request fails closed). A check that throws skips only what it guards:
 * the other triggers still go. Firestore is in memory; fictional caller only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  topics: ['Biscuit'] as string[] | null,
  checkBreaks: false,
}));

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(h.docs),
}));
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => h.topics,
}));
// The forget read itself throwing, past its own timeout and fallback.
vi.mock('../../../../memory/recall/forget-topics-source.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../memory/recall/forget-topics-source.js')>(); // prettier-ignore
  return {
    ...real,
    topicsWithin: (...args: Parameters<typeof real.topicsWithin>) =>
      h.checkBreaks ? Promise.reject(new Error('forget read broke')) : real.topicsWithin(...args),
  };
});
vi.mock('../../../human-transfer/crisis-signals.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../human-transfer/crisis-signals.js')>()),
  hadCrisisWithin: async () => false,
}));
vi.mock('../../../platform/cohort-flags.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/cohort-flags.js')>()),
  flagForUser: async () => undefined,
}));

const { collectTriggers } = await import('../triggers.js');
const { ponderedTriggers } = await import('../pondered-triggers.js');
const { resetForgetTopicsSource } =
  await import('../../../../memory/recall/forget-topics-source.js');

const USER = 'member-forget-out';
const U = `bogle_users/${USER}`;
const HOUR = 3600_000;
const NOW = new Date('2026-11-10T19:00:00Z');

function seedPromisesAndReminders(): void {
  const promise = { type: 'check_in', outcome: 'open', commitment: 'check in' };
  const madeAt = new Date(NOW.getTime() - 48 * HOUR).toISOString();
  h.docs.set(`${U}/ferni_commitments/p1`, { ...promise, madeAt, relatedTopic: "Biscuit's vet visit" }); // prettier-ignore
  h.docs.set(`${U}/ferni_commitments/p2`, { ...promise, madeAt, relatedTopic: 'the Denver move' });
  const at = new Date(NOW.getTime() - HOUR).toISOString();
  h.docs.set(`${U}/reminders/r1`, { status: 'missed', scheduledFor: at, message: 'Call the vet about Biscuit' }); // prettier-ignore
  h.docs.set(`${U}/reminders/r2`, { status: 'missed', scheduledFor: at, message: 'Book movers for Denver' }); // prettier-ignore
}

async function texts(kind: 'promise' | 'reminder'): Promise<string[]> {
  const triggers = await collectTriggers(USER, { now: NOW, localHour: 15 });
  return triggers.filter((t) => t.kind === kind).map((t) => t.text);
}

// A call two days back: the caller's lines, and a follow-up from the pondering pass on each.
const START = Date.parse('2026-11-08T20:00:00Z');
const END = START + 15 * 60_000;
function seedPondered(
  followUps: Array<{ text: string; when: string }>,
  biscuitLine = 'I take Biscuit to the vet appointment on Tuesday'
): void {
  h.docs.set(`${U}/predictive_intelligence/pondering`, {
    followUps: followUps.map((f) => ({ ...f, basis: 's1' })),
    thinkingOf: [],
  });
  h.docs.set(`${U}/summaries/s1`, { sessionId: `session-x-${START}`, timestamp: new Date(END).toISOString() }); // prettier-ignore
  const conv = `${U}/conversations/conv_${START + 900}_ab`;
  h.docs.set(conv, { turnCount: 2 });
  h.docs.set(`${conv}/turns/t0`, { role: 'user', content: biscuitLine });
  h.docs.set(`${conv}/turns/t1`, { role: 'user', content: 'I sign the Denver lease on Tuesday' });
}
const BISCUIT_Q = 'How did the vet appointment go?';
const DENVER_Q = 'How did signing the Denver lease go?';

async function notes(): Promise<string[]> {
  const triggers = await ponderedTriggers(USER, { name: 'Robin' }, NOW, 'Etc/UTC');
  return triggers.map((t) => `${t.text} | ${t.reason}`);
}

beforeEach(() => {
  h.docs.clear();
  h.topics = ['Biscuit'];
  h.checkBreaks = false;
  resetForgetTopicsSource();
  vi.stubEnv('OUTREACH_PONDERED_NOTES', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('FORGET_EVERY_READER on', () => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', 'on'));

  it('skips the promise check-in about a forgotten topic; the other promise still goes', async () => {
    seedPromisesAndReminders();
    const said = await texts('promise');
    expect(said).toEqual([
      "Hey, it's Ferni. I said I'd check in about the Denver move. How's it going?",
    ]);
  });

  it('skips a forgotten promise even when its topic is too long to quote', async () => {
    const madeAt = new Date(NOW.getTime() - 48 * HOUR).toISOString();
    const long = `Biscuit and ${'the long story of the yard '.repeat(4)}`;
    h.docs.set(`${U}/ferni_commitments/p3`, { type: 'check_in', outcome: 'open', commitment: 'check in', madeAt, relatedTopic: long }); // prettier-ignore
    expect(await texts('promise')).toEqual([]);
  });

  it('skips the missed-reminder text about a forgotten topic; the other reminder still goes', async () => {
    seedPromisesAndReminders();
    const said = await texts('reminder');
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('Book movers for Denver');
  });

  it('with no topic source at all, sends no promise or reminder text (fails closed)', async () => {
    h.topics = null;
    seedPromisesAndReminders();
    expect(await texts('promise')).toEqual([]);
    expect(await texts('reminder')).toEqual([]);
  });

  it('leaves out a pondered note about a topic forgotten since; the other note still goes', async () => {
    // Same day: unchecked, the Biscuit note would take the one-a-day slot (see the off case).
    const biscuitNote = "How did Biscuit's clinic appointment go?";
    seedPondered(
      [
        { text: biscuitNote, when: '2026-11-10' },
        { text: DENVER_Q, when: '2026-11-10' },
      ],
      'I have the clinic appointment on Tuesday'
    );
    const said = await notes();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('Denver lease');
    expect(said.join('\n')).not.toMatch(/biscuit/i);
  });

  it('when the check itself throws, skips promises and reminders; other triggers still go', async () => {
    h.checkBreaks = true;
    seedPromisesAndReminders();
    const worldDue = [{ factId: 'f1', text: 'the garden show, today' }];
    const triggers = await collectTriggers(USER, { now: NOW, localHour: 15, worldDue });
    expect(triggers.map((t) => t.kind)).toEqual(['world_due']);
  });

  it('when the check itself throws, sends no pondered note and does not throw', async () => {
    h.checkBreaks = true;
    seedPondered([{ text: DENVER_Q, when: '2026-11-10' }]);
    expect(await notes()).toEqual([]);
  });

  it("never quotes the caller's line about a forgotten topic in a pondered note", async () => {
    // The note's own words don't name Biscuit; the only line that grounds it does.
    seedPondered([{ text: BISCUIT_Q, when: '2026-11-10' }]);
    expect(await notes()).toEqual([]);
  });
});

describe('FORGET_EVERY_READER off: unchanged', () => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', 'off'));

  it('sends every promise, reminder and pondered note as before', async () => {
    seedPromisesAndReminders();
    expect(await texts('promise')).toEqual([
      "Hey, it's Ferni. I said I'd check in about Biscuit's vet visit. How's it going?",
      "Hey, it's Ferni. I said I'd check in about the Denver move. How's it going?",
    ]);
    expect((await texts('reminder')).join('\n')).toContain('Call the vet about Biscuit');
    seedPondered([{ text: BISCUIT_Q, when: '2026-11-10' }]);
    expect((await notes()).join('\n')).toContain('I take Biscuit to the vet appointment');
  });

  it('a Biscuit note takes the day before the Denver one, as before', async () => {
    const biscuitNote = "How did Biscuit's clinic appointment go?";
    seedPondered(
      [
        { text: biscuitNote, when: '2026-11-10' },
        { text: DENVER_Q, when: '2026-11-10' },
      ],
      'I have the clinic appointment on Tuesday'
    );
    const said = await notes();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("Biscuit's clinic appointment");
  });
});
