/**
 * Welcome back, life on both sides (WELCOME_BACK_BOTH_SIDES): after a gap of
 * WELCOME_BACK_MIN_DAYS or more, the greeting picks up one thread of theirs
 * and one small canon update from his life, and never mentions the gap.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
  source: 'understudy',
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

const { directedGreeting, GREETING_DIRECTION, rememberCallerHistory } =
  await import('../greeting-direction.js');
const wb = await import('../welcome-back.js');
const { pendingLifeUpdates } = await import('../../personas/life-updates.js');

type Request = { direction: string; facts: Record<string, string> };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;

const UPDATE = 'You finally got the sourdough starter to rise properly.';
const THREAD = 'Ask how the pottery class went';

function stubSources(followUps: string[], lifeUpdate: string | undefined) {
  const f = vi.spyOn(wb.welcomeBackSources, 'followUps').mockResolvedValue(followUps);
  const l = vi.spyOn(wb.welcomeBackSources, 'lifeUpdate').mockResolvedValue(lifeUpdate);
  return { f, l };
}

let n = 0;
async function greet(daysSince: number): Promise<Request> {
  const sessionId = `wb-${n++}`;
  rememberCallerHistory(sessionId, { calls: 6, daysSince, lastTopic: 'her new job' });
  await directedGreeting(sessionId, 'ferni', { userId: 'u1', userName: 'Sam' });
  return lastRequest();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('welcome back greeting', () => {
  it('flag off: the greeting is unchanged and nothing extra is read', async () => {
    const { f, l } = stubSources([THREAD], UPDATE);
    const req = await greet(12);
    expect(req.direction).toBe(GREETING_DIRECTION);
    expect(req.facts['last time you talked']).toBe('about 2 weeks ago');
    expect(req.facts['what you talked about last time']).toBe('her new job');
    expect(req.facts[wb.THREAD_FACT]).toBeUndefined();
    expect(req.facts[wb.UPDATE_FACT]).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
    expect(l).not.toHaveBeenCalled();
  });

  it('flag on after 5+ days: one thread, one canon update, and no gap', async () => {
    vi.stubEnv('WELCOME_BACK_BOTH_SIDES', 'on');
    stubSources([THREAD, 'Ask about the garage sale'], UPDATE);
    const req = await greet(12);
    expect(req.facts[wb.THREAD_FACT]).toBe(THREAD);
    expect(req.facts[wb.UPDATE_FACT]).toBe(UPDATE);
    // Only one thread: the second follow-up and last time's topic stay out.
    expect(JSON.stringify(req.facts)).not.toContain('garage sale');
    expect(req.facts['what you talked about last time']).toBeUndefined();
    // The gap itself is gone from the facts and ruled out in the direction.
    expect(req.facts['last time you talked']).toBeUndefined();
    expect(req.direction.startsWith(GREETING_DIRECTION)).toBe(true);
    expect(req.direction).toContain(wb.NO_GAP_DIRECTION);
    expect(req.direction).toMatch(/no counting days or weeks/);
    expect(req.direction).toMatch(/no "missed you"/);
    expect(req.direction).toMatch(/no "where have you been"/);
    expect(req.direction).toMatch(/one small thing from your own life/);
    expect(req.direction).toMatch(/one thing of theirs/);
  });

  it('a short gap (under 5 days) gets the normal greeting', async () => {
    vi.stubEnv('WELCOME_BACK_BOTH_SIDES', 'on');
    const { f } = stubSources([THREAD], UPDATE);
    const req = await greet(4);
    expect(req.direction).toBe(GREETING_DIRECTION);
    expect(req.facts['last time you talked']).toBe('4 days ago');
    expect(req.facts[wb.THREAD_FACT]).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
    expect(wb.isWelcomeBack({ daysSince: 5 })).toBe(true);
    expect(wb.isWelcomeBack({ daysSince: 4 })).toBe(false);
    expect(wb.isWelcomeBack(undefined)).toBe(false);
  });

  it('with no canon update, he shares nothing about his life', async () => {
    vi.stubEnv('WELCOME_BACK_BOTH_SIDES', 'on');
    stubSources([THREAD], undefined);
    const req = await greet(9);
    expect(req.facts[wb.UPDATE_FACT]).toBeUndefined();
    expect(req.direction).not.toMatch(/from your own life/);
    expect(req.facts[wb.THREAD_FACT]).toBe(THREAD);
    expect(req.direction).toContain(wb.NO_GAP_DIRECTION);
  });

  it('a sensitive thread is never named; he asks gently instead', async () => {
    vi.stubEnv('WELCOME_BACK_BOTH_SIDES', 'on');
    const heavy = ['Ask how the biopsy results came back', "Ask about her dad's funeral"];
    stubSources(heavy, undefined);
    const req = await greet(10);
    const said = JSON.stringify(req.facts) + req.direction;
    expect(said).not.toMatch(/biopsy|funeral/);
    expect(req.facts[wb.THREAD_FACT]).toBeUndefined();
    // Last time's summary may be the same hard thing: it stays out too.
    expect(req.facts['what you talked about last time']).toBeUndefined();
    expect(req.direction).toContain(wb.GENTLE_DIRECTION);
    // A light thread behind a heavy one is the one picked.
    const plan = wb.planWelcomeBack({ followUps: [heavy[0], THREAD] });
    expect(plan.thread).toBe(THREAD);
    expect(plan.direction).not.toContain(wb.GENTLE_DIRECTION);
  });

  it('a slow source is left out within the wait', async () => {
    const never = new Promise<string[]>(() => {
      // never settles
    });
    const material = await wb.loadWelcomeBack(
      'u1',
      'ferni',
      { daysSince: 8 },
      {
        env: { WELCOME_BACK_BOTH_SIDES: 'on' },
        waitMs: 20,
        sources: { followUps: () => never, lifeUpdate: async () => UPDATE },
      }
    );
    expect(material).toEqual({ followUps: [], lifeUpdate: UPDATE });
  });
});

describe('sensitive threads match whole words', () => {
  it.each([
    ['Ask how the chemo is going', true],
    ['Ask how the move went after the divorce', true],
    ['Ask about the money for the trip', true],
    ['Ask how the chemistry exam went', false],
    ['Ask about the healthy recipes she tried', false],
    ['Ask how the moneyball draft went', false],
  ])('%s -> %s', (text, sensitive) => {
    expect(wb.isSensitiveThread(text)).toBe(sensitive);
  });
});

describe('precedence: one opening thread per call', () => {
  const material = { followUps: [THREAD], lifeUpdate: UPDATE };

  it('a pondered follow-up (PONDERING) takes the opening; welcome-back keeps only the no-gap rule', () => {
    const plan = wb.planWelcomeBack(material, { pondered: 'the martial arts classes' });
    expect(plan).toEqual({ direction: wb.NO_GAP_DIRECTION });
    const facts = wb.welcomeBackFacts(
      { 'last time you talked': 'about 2 weeks ago', 'their name': 'Sam' },
      plan
    );
    expect(facts).toEqual({ 'their name': 'Sam' });
  });

  it('their check-in is the one thread: no second thread, the update stays', () => {
    const plan = wb.planWelcomeBack(material, { checkIn: 'start running again' });
    expect(plan.thread).toBeUndefined();
    expect(plan.lifeUpdate).toBe(UPDATE);
    expect(plan.direction).not.toMatch(/one thing of theirs/);
  });
});

describe('system prompt line for when they last talked', () => {
  it('flag off: the same lines as before', () => {
    expect(wb.lastTalkedAwareness(0, {})).toEqual(['You talked earlier today.']);
    expect(wb.lastTalkedAwareness(1, {})).toEqual(['You talked yesterday.']);
    expect(wb.lastTalkedAwareness(3, {})).toEqual(['Last talked 3 days ago.']);
    expect(wb.lastTalkedAwareness(12, {})).toEqual([
      "It's been about 2 weeks since you last talked.",
    ]);
    expect(wb.lastTalkedAwareness(60, {})).toEqual([
      "It's been a while - about 2 months since you last talked.",
    ]);
  });

  it('flag on after 5+ days: adds never bring up the gap', () => {
    const on = { WELCOME_BACK_BOTH_SIDES: 'on' };
    expect(wb.lastTalkedAwareness(4, on)).toHaveLength(1);
    const lines = wb.lastTalkedAwareness(12, on);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/Never bring up how long it has been, that you missed them/);
  });
});

describe('his update comes only from written, unspoken canon', () => {
  const env = { LIFE_MOVES_ON: 'on' };
  const now = () => Date.parse('2026-10-11T12:00:00Z');
  const written = {
    personaId: 'ferni',
    update: "The basil didn't make it; you've started a rosemary instead.",
    createdAt: '2026-10-05T12:00:00Z',
  };
  const store = (updates: Array<typeof written>) => ({
    save: vi.fn(async () => undefined),
    recent: vi.fn(async () => updates),
  });

  it('nothing written: nothing to share, and nothing is written', async () => {
    const s = store([]);
    expect(await pendingLifeUpdates('u1', [], 'ferni', { store: s, env, now })).toEqual([]);
    expect(s.save).not.toHaveBeenCalled();
  });

  it('a written update not yet said is shared; one he has since said is not', async () => {
    expect(
      await pendingLifeUpdates('u1', [], 'ferni', { store: store([written]), env, now })
    ).toEqual([written]);
    const told = [
      {
        fact: 'the basil plant did not survive, now has a rosemary plant',
        saidAt: '2026-10-06T12:00:00Z',
      },
    ];
    expect(
      await pendingLifeUpdates('u1', told as never, 'ferni', { store: store([written]), env, now })
    ).toEqual([]);
  });

  it('LIFE_MOVES_ON off: no update', async () => {
    expect(
      await pendingLifeUpdates('u1', [], 'ferni', { store: store([written]), env: {}, now })
    ).toEqual([]);
  });
});

describe('absence copy (thinking-of-you.json)', () => {
  const path = fileURLToPath(
    new URL(
      '../../../personas/bundles/ferni/content/behaviors/thinking-of-you.json',
      import.meta.url
    )
  );
  const content = JSON.parse(readFileSync(path, 'utf8')) as {
    noticing_absence: { approach: string };
    proactive_triggers: { extended_silence: { behavior: string } };
  };

  it.each([
    ['noticing_absence', content.noticing_absence.approach],
    ['extended_silence', content.proactive_triggers.extended_silence.behavior],
  ])('%s gives a reason to reach out, not a worry', (_name, text) => {
    expect(text).not.toMatch(/—|\.\.\./);
    // What it says to do, with the "never ..." clauses taken out.
    const asks = text.replace(/\bnever\b[^,.:]*[,.]/gi, '');
    expect(asks).not.toMatch(/quiet|everything (?:is )?okay|missed you|crossed my mind/i);
    expect(text).toMatch(/reason/i);
  });
});
