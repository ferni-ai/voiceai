/**
 * The hello's one-thread arbiter with a date due (DATES_IN_HELLO): why they
 * called, call news and a letter come first; the date then beats a win, a
 * check-in and a pondered ask; a sensitive date keeps the
 * anniversary party out. Crisis risk, an unknown caller and a same-day return
 * get no date. Only the winner commits: a date that loses is never marked
 * raised and never claims the opener. Runs the real directedGreeting and
 * dateFor over fakes holding a fictional caller's dates.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface Cue {
  direction: string;
  facts: Record<string, string>;
  fallback: string;
}
/** A line that names either date, so a winning date commits (greeting-date.ts commit). */
const SAID = "Hey Riley. Thinking of Priya's visit, and of your grandma Rose.";
const directedText = vi.fn(async (_s: string, _req: Cue) => ({ text: SAID, source: 'actor' }));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

const on = vi.hoisted(() => ({
  win: false,
  checkIn: false,
  ponder: false,
  party: false,
  letter: false,
  news: false,
  sensitive: false,
  recentCrisis: false,
}));
const markWinSurfaced = vi.fn(async () => undefined);
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () =>
    on.win ? { id: 'w1', commitmentId: 'w1', text: 'call my sister Sunday' } : undefined
  ),
  markWinSurfaced,
}));
vi.mock('../../../services/superhuman/commitment-follow-up.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  coachFollowThroughMode: () => on.checkIn,
}));
vi.mock('../../../services/outreach/call-status.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkInsWithCalls: async () => [{ statement: 'start running again', createdAt: 0 }],
}));
vi.mock('../../../intelligence/pondering/pondering.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isPonderingOn: () => on.ponder,
}));
vi.mock('../../../intelligence/pondering/pondering-opener.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ponderingForOpener: async () => ({ text: 'How is the pottery class going?', item: {} }),
}));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => ({}),
}));
const party = vi.hoisted(() => ({ key: '1y', words: 'a year', mark: () => {} }));
vi.mock('../friendship-anniversary.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  anniversaryFor: async () => (on.party ? party : null),
}));
const letter = { writtenOn: 'October 18, 2026', mark: vi.fn() };
vi.mock('../../../tools/domains/engagement/future-letters.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  letterToOffer: async () => (on.letter ? letter : undefined),
}));
const NEWS = { tone: 'news', careful: false, direction: ' CALL NEWS.', facts: {} };
vi.mock('../call-news-opener.js', () => ({
  callNewsFor: async () => (on.news ? NEWS : undefined),
}));

const DAY = 86_400_000;
const markFactRaised = vi.fn(async () => undefined);
vi.mock('../../../intelligence/world-model/temporal/store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createFirestoreWorldFactStore: () => ({
    listOpen: async () => [
      {
        id: 'wd_hello',
        subject: on.sensitive ? 'Rose' : 'Priya',
        subjectKind: 'person',
        relation: on.sensitive ? 'grandma' : 'sister',
        subjectKey: on.sensitive ? 'person:rose' : 'person:priya',
        attribute: 'event',
        value: on.sensitive ? 'procedure' : 'visit',
        observedAt: '2026-10-01T18:00:00Z',
        validFrom: '2026-10-01T18:00:00Z',
        validTo: null,
        confidence: 0.9,
        source: { kind: 'summary', sessionId: 's0' },
        kind: 'event',
        recurrence: 'once',
        eventDate: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10),
        needsConfirmation: false,
      },
    ],
    listRaisedSince: async () => [],
    apply: async () => undefined,
  }),
  markFactRaised,
}));
vi.mock('../../../services/human-transfer/crisis-signals.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hadCrisisWithin: async () => on.recentCrisis,
}));
vi.mock('../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forgottenTopicsOrNull: async () => [],
}));

const { directedGreeting, rememberCallerHistory, WIN_DIRECTION, CHECK_IN_DIRECTION } =
  await import('../greeting-direction.js');
const { PONDER_DIRECTION } = await import('../greeting-direction.js');
const { rememberCallLaunch, PEP_TALK_DIRECTION } = await import('../../shared/call-launch-hint.js');
const { rememberCallerRecognition } = await import('../../voice-agent-entry/caller-recognition.js');
const { noteCrisisRisk } = await import('../../../services/safety/crisis-call-risk.js');
const { anniversaryDirection } = await import('../friendship-anniversary.js');
const { letterOfferDirection } =
  await import('../../../tools/domains/engagement/future-letters.js');
const { clearOpenerClaims, takeOpenerClaim } =
  await import('../../../memory/recall/opener-claim.js');
const { PRESENCE_GREETING_DIRECTION } = await import('../greeting-date.js');

const USER = 'voice-eval-riley';
const DATE = /There is something on their calendar soon/;
const PRESENCE = /Thinking of your grandma Rose/;
let n = 0;

async function greet(
  setup: (sessionId: string) => void = () => {},
  extra: Record<string, unknown> = {}
): Promise<Cue> {
  const sessionId = `gda-${++n}`;
  setup(sessionId);
  await directedGreeting(sessionId, 'jordan-taylor', { userId: USER, userName: 'Riley', ...extra });
  await new Promise((r) => {
    setTimeout(r, 0); // the winner's commit is not awaited
  });
  return directedText.mock.calls.at(-1)![1];
}

// dateFor loads the intelligence barrel on first use: warm it so a cold import can't lose the
// 400 ms race (in the agent the barrel is loaded long before any hello).
beforeAll(async () => {
  await import('../../../intelligence/index.js');
}, 60_000);

beforeEach(() => {
  vi.stubEnv('DATES_IN_HELLO', 'on');
  markFactRaised.mockClear();
  markWinSurfaced.mockClear();
  clearOpenerClaims();
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of Object.keys(on) as Array<keyof typeof on>) on[k] = false;
});

function expectDateWon(cue: Cue): void {
  expect(cue.direction).toMatch(on.sensitive ? PRESENCE : DATE);
  expect(markFactRaised).toHaveBeenCalledTimes(1);
  expect(takeOpenerClaim(USER)).toBe('greeting-date');
}
function expectDateLost(cue: Cue): void {
  expect(cue.direction).not.toMatch(DATE);
  expect(cue.direction).not.toMatch(PRESENCE);
  expect(markFactRaised).not.toHaveBeenCalled();
  expect(takeOpenerClaim(USER)).toBeUndefined();
}

describe('the date loses to what comes before it', () => {
  it('why they called', async () => {
    const cue = await greet((s) =>
      rememberCallLaunch(s, { kind: 'bookend', ref: 'a'.repeat(24) }, { CALL_LAUNCH_CONTEXT: 'on' })
    );
    expect(cue.direction).toContain(PEP_TALK_DIRECTION);
    expectDateLost(cue);
  });

  it('call news', async () => {
    on.news = true;
    const cue = await greet();
    expect(cue.direction).toContain(NEWS.direction);
    expectDateLost(cue);
  });

  it('a letter', async () => {
    on.letter = true;
    const cue = await greet();
    expect(cue.direction).toContain(letterOfferDirection(letter));
    expectDateLost(cue);
  });
});

describe('the date wins over what comes after it, which waits for a later call', () => {
  it('alone', async () => {
    expectDateWon(await greet());
  });

  it('a win: not named, not marked', async () => {
    on.win = true;
    const cue = await greet();
    expectDateWon(cue);
    expect(cue.direction).not.toContain(WIN_DIRECTION);
    expect(markWinSurfaced).not.toHaveBeenCalled();
  });

  it('a check-in', async () => {
    on.checkIn = true;
    const cue = await greet();
    expectDateWon(cue);
    expect(cue.direction).not.toContain(CHECK_IN_DIRECTION);
  });

  it('a pondered ask', async () => {
    on.ponder = true;
    const cue = await greet();
    expectDateWon(cue);
    expect(cue.direction).not.toContain(PONDER_DIRECTION);
  });

  it('an ordinary date keeps the anniversary alongside', async () => {
    on.party = true;
    const cue = await greet();
    expectDateWon(cue);
    expect(cue.direction).toContain(anniversaryDirection(party));
  });

  it('a sensitive date: tender, no anniversary party, no question', async () => {
    on.party = true;
    on.sensitive = true;
    const cue = await greet();
    expectDateWon(cue);
    expect(cue.direction).not.toContain(anniversaryDirection(party));
    expect(cue.direction).not.toMatch(/procedure/i);
  });

  it('a sensitive date: the whole direction asks no question and invites none', async () => {
    on.sensitive = true;
    const cue = await greet();
    expectDateWon(cue);
    expect(cue.direction.startsWith(PRESENCE_GREETING_DIRECTION)).toBe(true);
    expect(cue.direction).not.toContain('?');
    expect(cue.direction).not.toMatch(/quick easy question|you may ask|ask how/i);
  });
});

describe('the winner commits only when its line names the date', () => {
  it.each([
    ['ordinary', false, 'Hey Riley. What are you up to?'],
    ['sensitive', true, 'Hey Riley. Good to hear you.'],
  ])('%s: a line that ignores it marks nothing and claims nothing', async (_l, sensitive, line) => {
    on.sensitive = sensitive;
    directedText.mockResolvedValueOnce({ text: line, source: 'actor' });
    const cue = await greet();
    expect(cue.direction).toMatch(sensitive ? PRESENCE : DATE);
    expect(markFactRaised).not.toHaveBeenCalled();
    expect(takeOpenerClaim(USER)).toBeUndefined();
  });

  it('a line that names its day commits', async () => {
    const day = new Date(Date.now() + 2 * DAY).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    directedText.mockResolvedValueOnce({
      text: `Hey Riley. ${day} is the big day.`,
      source: 'actor',
    });
    expectDateWon(await greet());
  });

  it('the scripted fallback never commits', async () => {
    directedText.mockResolvedValueOnce({ text: SAID, source: 'understudy' });
    const cue = await greet();
    expect(cue.direction).toMatch(DATE);
    expect(markFactRaised).not.toHaveBeenCalled();
  });
});

describe('no date at all', () => {
  it('with crisis risk already on this call', async () => {
    const cue = await greet((s) => noteCrisisRisk(s));
    expectDateLost(cue);
  });

  it("within 14 days of a crisis-level signal (the pondered ask's window)", async () => {
    on.recentCrisis = true;
    expectDateLost(await greet());
  });

  it('on a first call, to a stranger', async () => {
    expectDateLost(await greet(() => {}, { isReturningUser: false }));
  });

  it('for a caller the line does not recognise', async () => {
    const cue = await greet((s) =>
      rememberCallerRecognition(s, { status: 'maybe', attestation: 'B' })
    );
    expectDateLost(cue);
  });

  it('on a same-day return', async () => {
    const cue = await greet((s) => rememberCallerHistory(s, { calls: 3, daysSince: 0 }));
    expectDateLost(cue);
  });

  it('flag off', async () => {
    vi.stubEnv('DATES_IN_HELLO', 'off');
    expectDateLost(await greet());
  });
});
