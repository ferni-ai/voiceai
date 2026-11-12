/**
 * The freshness gate at send time, through the real brief run: what the person
 * already dealt with stays out, safety items never do, and an unreadable source
 * means the brief goes as it would have. Fictional items only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '../../../follow-through/index.js';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';

const runLines = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const logger = (): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn((fields: Record<string, unknown>, msg?: string) => {
      if (msg === 'MORNING_BRIEF_RUN') runLines.push(fields);
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger(),
  });
  return { ...(await importOriginal<object>()), createLogger: logger };
});

const { runMorningBriefs } = await import('../brief-job.js');
type Deps = Parameters<typeof runMorningBriefs>[0];
type DayItems = Awaited<ReturnType<Deps['readDay']>>;

const OWNER = 'uid-owner';
const EIGHT_AM = new Date('2026-10-18T13:05:00Z'); // 08:05 in Chicago
const HOURS = (n: number) => new Date(EIGHT_AM.getTime() - n * 3_600_000).toISOString();

const PLANTS = { store: 'reminders', ref: 'r1', version: '2026-10-18T20:00:00.000Z' } as const;
const DENTIST = { store: 'tasks', ref: 't1', version: '2026-10-10T00:00:00Z' } as const;
const CHECK_IN = { store: 'reminders', ref: 'r9', version: '2026-10-18T22:00:00.000Z', kind: 'crisis_follow_up' } as const; // prettier-ignore

function day(withSafety = false): DayItems {
  return {
    events: [],
    reminders: ['Water the ferns', ...(withSafety ? ['Check in with Ferni tonight'] : [])],
    tasks: ['Book the dentist'],
    commitments: [],
    refs: { reminders: [PLANTS, ...(withSafety ? [CHECK_IN] : [])], tasks: [DENTIST], commitments: [] }, // prettier-ignore
  } as DayItems;
}

const followUp = (over: Partial<FollowUp>): FollowUp => ({
  id: 'f1',
  userId: OWNER,
  kind: 'reminder',
  text: 'Water the ferns',
  dueAt: null,
  zone: 'America/Chicago',
  repeat: null,
  source: { store: 'reminders', ref: 'r1' },
  status: 'open',
  surfaced: [],
  createdAt: HOURS(400),
  updatedAt: HOURS(400),
  ...over, // prettier-ignore
});

interface Facts {
  current?: Map<string, string> | 'throws';
  ledger?: FollowUp[] | null;
  mentions?: Array<{ store: string; ref: string; at: string; version?: string }>;
}

const versions = (...refs: Array<{ store: string; ref: string; version: string }>) =>
  new Map(refs.map((r) => [`${r.store}:${r.ref}`, r.version]));

function deps(d: DayItems, facts: Facts, env: Record<string, string> = {}) {
  const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
  const consume = vi.fn(async () => undefined);
  const dep: Deps = {
    env: { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: OWNER, ...env },
    cohortUsers: async () => [],
    userDoc: async () => ({ contactInfo: { timezone: 'America/Chicago' }, name: 'Sam Tester' }),
    readDay: async () => d,
    claims: { claim: async () => true, release: async () => undefined },
    freshness: {
      current: async () => {
        if (facts.current === 'throws') throw new Error('UNAVAILABLE');
        return facts.current ?? versions(PLANTS, DENTIST, CHECK_IN);
      },
      ledger: async () => (facts.ledger === undefined ? [] : facts.ledger),
      mentions: async () => facts.mentions ?? [],
      consume,
    },
    sendText,
    sendPush: vi.fn(async () => false),
  };
  return { dep, sendText, consume, body: () => sendText.mock.calls[0]?.[0].body ?? null };
}

beforeEach(() => {
  runLines.length = 0;
});

describe('freshness gate', () => {
  it('lists both items when nothing says they were dealt with (the baseline)', async () => {
    const { dep, body } = deps(day(), {});
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).toContain('Water the ferns');
    expect(body()).toContain('Book the dentist');
  });

  it('(a) a source edited after it was read is left out at send', async () => {
    const edited = { ...DENTIST, version: '2026-10-18T12:59:00Z' };
    const { dep, body } = deps(day(), { current: versions(PLANTS, edited) });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).toContain('Water the ferns');
    expect(body()).not.toContain('Book the dentist');
    expect(runLines[0].dropped).toEqual({ 'source-changed': 1 });
  });

  it('(a) a source closed or deleted since it was read is left out', async () => {
    const { dep, body } = deps(day(), { current: versions(DENTIST) });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).not.toContain('Water the ferns');
    expect(runLines[0].dropped).toEqual({ 'source-closed': 1 });
  });

  it('(b) a closed follow-up keeps its reminder out, even with the reminder still pending', async () => {
    const { dep, body } = deps(day(), { ledger: [followUp({ status: 'done', closedAt: HOURS(200) })] }); // prettier-ignore
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).not.toContain('Water the ferns');
    expect(runLines[0].dropped).toEqual({ 'ledger-closed': 1 });
  });

  it('(b) raised 10 h ago is left out; raised 3 days ago is listed', async () => {
    const recent = deps(day(), { ledger: [followUp({ status: 'surfaced', surfaced: [{ at: HOURS(10), via: 'text' }] })] }); // prettier-ignore
    await runMorningBriefs(recent.dep, EIGHT_AM);
    expect(recent.body()).not.toContain('Water the ferns');
    const old = deps(day(), { ledger: [followUp({ status: 'surfaced', surfaced: [{ at: HOURS(72), via: 'text' }] })] }); // prettier-ignore
    await runMorningBriefs(old.dep, EIGHT_AM);
    expect(old.body()).toContain('Water the ferns');
  });

  it('(c) talked about since: left out once, and the mention is spent after the send', async () => {
    const mention = { store: 'tasks', ref: 't1', at: HOURS(12), version: DENTIST.version };
    const { dep, body, consume } = deps(day(), { mentions: [mention] });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).not.toContain('Book the dentist');
    expect(consume).toHaveBeenCalledWith(OWNER, [{ store: 'tasks', ref: 't1' }]);
  });

  it('(c) a mention from before the item last changed does not count', async () => {
    const mention = { store: 'tasks', ref: 't1', at: HOURS(12), version: '2026-10-01T00:00:00Z' };
    const { dep, body } = deps(day(), { mentions: [mention] });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).toContain('Book the dentist');
  });

  it('every item dealt with: no text at all, never an empty or filler brief', async () => {
    const { dep, sendText } = deps(day(), { current: new Map() });
    const { report } = await runMorningBriefs(dep, EIGHT_AM);
    expect(sendText).not.toHaveBeenCalled();
    expect(dep.sendPush).not.toHaveBeenCalled();
    expect(report.reasons).toEqual({ 'all-stale': 1 });
  });

  it('a safety item is never dropped, whatever every rule says about it', async () => {
    const safety = followUp({ source: { store: 'reminders', ref: 'r9' }, status: 'released' });
    const mention = { store: 'reminders', ref: 'r9', at: HOURS(1), version: CHECK_IN.version };
    const { dep, body } = deps(day(true), { current: new Map(), ledger: [safety], mentions: [mention] }); // prettier-ignore
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).toContain('Check in with Ferni tonight');
    expect(body()).not.toContain('Water the ferns');
  });

  it('unknown freshness sends the items as today: a read that fails drops nothing', async () => {
    const { dep, body } = deps(day(), { current: 'throws', ledger: null });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).toContain('Water the ferns');
    expect(body()).toContain('Book the dentist');
  });

  it('MORNING_BRIEF_FRESHNESS=off: nothing is dropped', async () => {
    const { dep, body } = deps(day(), { current: new Map() }, { MORNING_BRIEF_FRESHNESS: 'off' });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(body()).toContain('Water the ferns');
    expect(body()).toContain('Book the dentist');
  });

  it('the run line carries per-section counts and drops by reason: numbers, no words', async () => {
    const { dep } = deps(day(), { current: versions(PLANTS) });
    await runMorningBriefs(dep, EIGHT_AM);
    expect(runLines[0]).toMatchObject({
      segments: { events: 0, due: 1, open: 0 },
      dropped: { 'source-closed': 1 },
    });
    expect(JSON.stringify(runLines[0])).not.toMatch(/ferns|dentist/i);
  });
});
