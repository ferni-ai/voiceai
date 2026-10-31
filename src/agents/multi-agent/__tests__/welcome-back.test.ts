/**
 * A returning call after a gap: the greeting keeps "last time you talked",
 * the system prompt's line for when they last talked, the sensitive-thread
 * check, his canon updates and the absence copy.
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

describe('a returning call after a gap', () => {
  it('the greeting is unchanged: last time and its topic stay', async () => {
    const req = await greet(12);
    expect(req.direction).toBe(GREETING_DIRECTION);
    expect(req.facts['last time you talked']).toBe('about 2 weeks ago');
    expect(req.facts['what you talked about last time']).toBe('her new job');
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

describe('system prompt line for when they last talked', () => {
  const off = { RECENT_CALL_RESTRAINT: 'off' };

  it('restraint off: the same lines as before', () => {
    expect(wb.lastTalkedAwareness(0, off)).toEqual(['You talked earlier today.']);
    expect(wb.lastTalkedAwareness(1, off)).toEqual(['You talked yesterday.']);
    expect(wb.lastTalkedAwareness(3, off)).toEqual(['Last talked 3 days ago.']);
    expect(wb.lastTalkedAwareness(12, off)).toEqual([
      "It's been about 2 weeks since you last talked.",
    ]);
    expect(wb.lastTalkedAwareness(60, off)).toEqual([
      "It's been a while - about 2 months since you last talked.",
    ]);
  });

  // Live call 10-17, second call that day: the first reply led with the earlier call's
  // people and assumed an outcome ("how things went with Clayton and Brent after you
  // talked with Jordan"). Seth: "You did jump the gun."
  it('by default a same-day call is told to let them lead, one light open question at most', () => {
    expect(wb.recentCallRestraintEnabled({})).toBe(true);
    const [line, rule] = wb.lastTalkedAwareness(0, {});
    expect(line).toBe('You talked earlier today.');
    expect(rule).toMatch(/already talked today/);
    expect(rule).toMatch(/do not open with what you talked about last time/);
    expect(rule).toMatch(/one light thing as a short open question/);
    expect(rule).toMatch(/Never guess how something went/);
    expect(rule).toMatch(/never string several people's names together/);
  });

  it('other returning calls get the let-them-lead rule without the same-day line', () => {
    const lines = wb.lastTalkedAwareness(3, {});
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^Let them lead/);
    expect(wb.lastTalkedAwareness(12, {})[1]).toMatch(/^Let them lead/);
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
