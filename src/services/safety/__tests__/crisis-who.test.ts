/**
 * THIRD_PARTY_SELF_HARM (off | shadow | live, issue #2635): on a third-party
 * crisis read, a second classifier read decides who is at risk (self,
 * third_party, bereaved, none). Hard rules pinned here:
 *   1. it never lowers or removes the caller's own read (session_escalation included);
 *   2. bereavement routes to grief guidance, never "988 for them"; the caller's own risk wins;
 *   3. off and shadow change nothing; shadow logs kind and booleans, never caller text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info, warn, error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, default: logger, logger };
});

import {
  applyClassifierVerdict,
  buildCrisisGuidance,
  detectCrisis,
  guardFromDetection,
  type CrisisDetectionResult,
} from '../crisis-guard.js';
import type { CrisisVerdict } from '../crisis-classifier.js';
import {
  WHO_PROMPT,
  applyWhoRead,
  parseWhoReply,
  resetWhoReads,
  resolveWhoMode,
  sessionShowsSelfRisk,
  startWhoRead,
  whoHint,
  type WhoKind,
  type WhoRead,
} from '../crisis-who.js';

const SENTINEL = 'zq-sentinel-7731';
const KINDS: WhoKind[] = ['self', 'third_party', 'bereaved', 'none'];
const READS: Array<WhoRead | null> = [null, ...KINDS.map((who) => ({ who }))];
const VERDICTS: Array<CrisisVerdict | null> = [
  null,
  { risk: 'none', subject: 'self' },
  { risk: 'crisis', subject: 'self' },
  { risk: 'crisis', subject: 'third_party' },
  { risk: 'imminent', subject: 'self' },
  { risk: 'imminent', subject: 'third_party' },
];
const LIVE = { THIRD_PARTY_SELF_HARM: 'live', CRISIS_CLASSIFIER_TIMEOUT_MS: '200' };
const SHADOW = { THIRD_PARTY_SELF_HARM: 'shadow', CRISIS_CLASSIFIER_TIMEOUT_MS: '200' };

const third = (): CrisisDetectionResult =>
  applyClassifierVerdict(detectCrisis('my brother said he would end his life'), {
    risk: 'crisis',
    subject: 'third_party',
  });

/** A read never lowers: severity, crisis, block, and a self read all stay at least as they were. */
function neverLower(base: CrisisDetectionResult, live: CrisisDetectionResult): void {
  expect(live.severity).toBeGreaterThanOrEqual(base.severity);
  if (base.isCrisis) expect(live.isCrisis).toBe(true);
  if (guardFromDetection(base).shouldBlock) expect(guardFromDetection(live).shouldBlock).toBe(true);
  if (base.subject === 'self') expect(live.subject).toBe('self');
  if (base.indicators.includes('session_escalation')) {
    expect(live.indicators).toContain('session_escalation');
  }
}

beforeEach(() => {
  info.mockClear();
  warn.mockClear();
  resetWhoReads();
});
afterEach(() => vi.useRealTimers());

describe('resolveWhoMode', () => {
  it('is off by default and for anything unknown', () => {
    expect(resolveWhoMode({})).toBe('off');
    expect(resolveWhoMode({ THIRD_PARTY_SELF_HARM: 'on' })).toBe('off');
    expect(resolveWhoMode({ THIRD_PARTY_SELF_HARM: ' Shadow ' })).toBe('shadow');
    expect(resolveWhoMode({ THIRD_PARTY_SELF_HARM: 'LIVE' })).toBe('live');
  });
});

describe('parseWhoReply', () => {
  it('reads the four kinds and rejects anything else', () => {
    for (const who of KINDS) expect(parseWhoReply(`{"who":"${who}"}`)).toEqual({ who });
    expect(parseWhoReply('```json\n{"who":"bereaved"}\n```')).toEqual({ who: 'bereaved' });
    expect(parseWhoReply('{"who":"caller"}')).toBeNull();
    expect(parseWhoReply('not json')).toBeNull();
    expect(parseWhoReply('{"who":')).toBeNull();
    // Braces that are not JSON: null, never a throw.
    expect(parseWhoReply('{who: self}')).toBeNull();
    expect(parseWhoReply('{"who":"self",}')).toBeNull();
  });
});

describe('whoHint (the lexical forms, as a hint only)', () => {
  it("lists the patterns' tags and risk words, never the caller's words", () => {
    const text = `my brother keeps saying he wants to kill himself ${SENTINEL}`;
    const hint = whoHint(detectCrisis(text), text);
    expect(hint).toContain('third_party_risk');
    expect(hint).toContain('risk_words');
    expect(JSON.stringify(hint)).not.toContain(SENTINEL);
    expect(
      whoHint(detectCrisis('what should i cook for dinner'), 'what should i cook for dinner')
    ).toEqual([]);
  });
});

const IMMINENT_TP: CrisisVerdict = { risk: 'imminent', subject: 'third_party' };
const IMMINENT_SELF: CrisisVerdict = { risk: 'imminent', subject: 'self' };
// Own imminent risk the patterns miss in every CRISIS_MEANS_IN_HAND mode (#2717 reads
// "i have the pills right here and i'm taking them now" on the patterns once live).
const OWN_IMMINENT =
  "i'm holding the pills and i'm going to swallow them and he said he'd kill himself";

describe('applyWhoRead: the classifier imminent level on a self read', () => {
  it("an own-imminent line beside a third-party clause gets main's self-imminent script", () => {
    const found = detectCrisis(OWN_IMMINENT);
    const main = applyClassifierVerdict(found, IMMINENT_SELF);
    const flipped = applyClassifierVerdict(found, IMMINENT_TP);
    expect(flipped.subject).toBe('third_party');
    const live = applyWhoRead(flipped, { who: 'self' }, { verdict: IMMINENT_TP });
    expect(live.subject).toBe('self');
    expect(live.indicators).toContain('imminent_danger');
    expect(guardFromDetection(live).shouldBlock).toBe(true);
    expect(live.suggestedResponse).toBe(main.suggestedResponse);
    expect(guardFromDetection(live).replacementResponse).toBe(
      guardFromDetection(main).replacementResponse
    );
  });

  it('a crisis-level verdict, or none, stays at crisis: no script', () => {
    const flipped = third();
    for (const verdict of [null, { risk: 'crisis', subject: 'third_party' } as const]) {
      const live = applyWhoRead(flipped, { who: 'self' }, { verdict });
      expect(live.indicators).not.toContain('imminent_danger');
      expect(guardFromDetection(live).shouldBlock).toBe(false);
    }
  });

  it('an imminent verdict never turns a bereaved read into a script', () => {
    const live = applyWhoRead(third(), { who: 'bereaved' }, { verdict: IMMINENT_TP });
    expect(live.subject).toBe('bereaved');
    expect(guardFromDetection(live).shouldBlock).toBe(false);
  });
});

describe('applyWhoRead: hard rule 2 across turns', () => {
  const DISTRESS = ["i can't do this anymore", 'i feel like such a burden to everyone'];

  it("the caller's own risk earlier in the session wins over a bereaved read", () => {
    expect(sessionShowsSelfRisk(DISTRESS)).toBe(true);
    const live = applyWhoRead(third(), { who: 'bereaved' }, { sessionSelf: true });
    expect(live.subject).toBe('self');
    expect(live.isCrisis).toBe(true);
    const guidance = buildCrisisGuidance(live);
    expect(guidance).toMatch(/Acknowledge their pain/);
    expect(guidance).toMatch(/988/);
    expect(guidance).not.toMatch(/grieving someone who has died/);
    expect(guidance).not.toMatch(/on the person's behalf|on their behalf/);
    // The scripted response is the caller's too, never the third-party one.
    expect(live.suggestedResponse).toMatch(/988/);
    expect(live.suggestedResponse).not.toMatch(/on their behalf/);
  });

  it('a quiet session keeps the grief route', () => {
    expect(sessionShowsSelfRisk(['what should i cook for dinner', 'my brother called'])).toBe(
      false
    );
    expect(sessionShowsSelfRisk([])).toBe(false);
    expect(applyWhoRead(third(), { who: 'bereaved' }, { sessionSelf: false }).subject).toBe(
      'bereaved'
    );
  });

  it('startWhoRead reads the session from the earlier turns', async () => {
    const input = {
      latest: "my brother said he would kill himself and now he's gone",
      earlier: DISTRESS,
    };
    const run = startWhoRead(input, detectCrisis(input.latest), {
      env: LIVE,
      generate: fakeWho('bereaved'),
    });
    expect((await run!.resolve(third())).subject).toBe('self');
  });
});

describe('applyWhoRead', () => {
  it('bereaved: grief guidance in place of "988 for them", at the same severity', () => {
    const base = third();
    const live = applyWhoRead(base, { who: 'bereaved' });
    expect(live.subject).toBe('bereaved');
    expect(live.severity).toBe(base.severity);
    expect(live.isCrisis).toBe(true);
    expect(live.suggestedResponse).toBeUndefined();
    const guidance = buildCrisisGuidance(live);
    expect(guidance).toMatch(/grief|griev/i);
    expect(guidance).not.toMatch(/on the person's behalf/);
    expect(buildCrisisGuidance(base)).toMatch(/on the person's behalf/);
  });

  it('self: the caller is put first, and the other person keeps their 988 line', () => {
    const base = third();
    const live = applyWhoRead(base, { who: 'self' });
    expect(live.subject).toBe('self');
    expect(live.severity).toBeGreaterThanOrEqual(base.severity);
    const guidance = buildCrisisGuidance(live);
    expect(guidance).toMatch(/988/);
    expect(guidance).toMatch(/on (the person's|their) behalf/);
    expect(guidance).toMatch(/the user (themselves|may be at risk)/i);
    expect(guardFromDetection(live).shouldBlock).toBe(false);
  });

  it('third_party, none and a missing read leave the read as it was', () => {
    const base = third();
    for (const read of [null, { who: 'third_party' }, { who: 'none' }] as const) {
      expect(applyWhoRead(base, read)).toBe(base);
    }
  });

  it('never touches a self read or a turn with no third-party read', () => {
    const self = detectCrisis("i can't do this anymore and i want to die");
    const quiet = detectCrisis('what should i cook tonight');
    for (const read of READS) {
      expect(applyWhoRead(self, read)).toBe(self);
      expect(applyWhoRead(quiet, read)).toBe(quiet);
    }
  });

  it('never lowers anything, over every pattern, classifier and who read', () => {
    const turns: Array<[string, string[]]> = [
      ['my brother said he would end his life', []],
      ["he said he'd kill himself and i would never kill myself", []],
      ["he said he'd kill himself and i've been cutting again", []],
      [
        'soon none of this will matter',
        ["he said he'd kill himself and i would never kill myself", "i can't do this anymore"],
      ],
      [
        "he said he'd kill himself and i would never kill myself",
        ["i can't do this anymore", 'i feel like such a burden to everyone'],
      ],
      ['my brother wants to kill himself', ["i can't do this anymore"]],
      ["she told me she'd end her life, and last spring she did", []],
      ['i want to kill myself tonight', []],
    ];
    for (const [latest, earlier] of turns) {
      const found = detectCrisis(latest, undefined, { recentMessages: earlier });
      for (const verdict of VERDICTS) {
        const base = applyClassifierVerdict(found, verdict);
        for (const read of READS) neverLower(base, applyWhoRead(base, read));
      }
    }
  });

  it("keeps the session's own escalation (#2648 round 1 and round 2 cases)", () => {
    const r1 = detectCrisis('soon none of this will matter', undefined, {
      recentMessages: [
        "he said he'd kill himself and i would never kill myself",
        "i can't do this anymore",
      ],
    });
    expect([r1.subject, r1.severity, r1.isCrisis]).toEqual(['self', 0.75, true]);
    expect(r1.indicators).toContain('session_escalation');
    for (const read of READS) expect(applyWhoRead(r1, read)).toBe(r1);
  });
});

const aborted: AbortSignal[] = [];

/** A generate function that answers the who prompt with `who` and records what it was sent. */
function fakeWho(who: WhoKind | 'throw' | 'hang', seen: string[] = []) {
  return vi.fn(async (system: string, user: string, signal: AbortSignal) => {
    expect(system).toBe(WHO_PROMPT);
    seen.push(user);
    if (who === 'throw') throw new Error('boom');
    // Never answers, abort or not: only the timeout can settle the read.
    if (who === 'hang') {
      return new Promise<string>(() => {
        aborted.push(signal);
      });
    }
    return JSON.stringify({ who });
  });
}

const INPUT = {
  latest: `my brother keeps saying he wants to kill himself ${SENTINEL}`,
  earlier: [],
};

describe('startWhoRead', () => {
  it('is off by default: no read, no call', () => {
    const generate = fakeWho('bereaved');
    expect(startWhoRead(INPUT, detectCrisis(INPUT.latest), { env: {}, generate })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('starts at once only when the patterns read third-party risk, and passes the hint in', async () => {
    const seen: string[] = [];
    const generate = fakeWho('bereaved', seen);
    const run = startWhoRead(INPUT, detectCrisis(INPUT.latest), { env: LIVE, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(seen[0]).lexical).toContain('third_party_risk');
    expect((await run!.resolve(third())).subject).toBe('bereaved');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('without a third-party pattern read, reads only once a third-party read needs it', async () => {
    const seen: string[] = [];
    const generate = fakeWho('bereaved', seen);
    // Risk words alone ("gone") no longer start the read; they still go in as a hint.
    const input = { latest: 'my aunt said it so many times and now she is gone', earlier: [] };
    const run = startWhoRead(input, detectCrisis(input.latest), { env: LIVE, generate });
    expect(generate).not.toHaveBeenCalled();
    const quiet = detectCrisis('what should i cook tonight');
    expect(await run!.resolve(quiet)).toBe(quiet);
    expect(generate).not.toHaveBeenCalled();
    expect((await run!.resolve(third())).subject).toBe('bereaved');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(seen[0]).lexical).toEqual(['risk_words']);
  });

  it('a timeout or error falls back to the read as it was', async () => {
    for (const who of ['hang', 'throw'] as const) {
      resetWhoReads();
      const base = third();
      const run = startWhoRead(INPUT, detectCrisis(INPUT.latest), {
        env: LIVE,
        generate: fakeWho(who),
      });
      expect(await run!.resolve(base)).toBe(base);
    }
    expect(aborted.at(-1)?.aborted).toBe(true);
  });

  it('shadow returns the read unchanged and logs kind and booleans, never caller text', async () => {
    const base = third();
    const run = startWhoRead(INPUT, detectCrisis(INPUT.latest), {
      env: SHADOW,
      generate: fakeWho('bereaved'),
    });
    expect(run!.live).toBe(false);
    expect(await run!.resolve(base)).toBe(base);
    expect(run!.shadow(base)).toBe(base);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.anything(), 'THIRD_PARTY_WHO'));
    const [payload] = info.mock.calls.find(([, msg]) => msg === 'THIRD_PARTY_WHO')!;
    expect(payload).toEqual({ kind: 'bereaved', changed: true, eager: true });
    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(SENTINEL);
    expect(logged).not.toContain('kill himself');
  });

  it('shadow logs nothing when no third-party read is on the table', async () => {
    const run = startWhoRead(INPUT, detectCrisis(INPUT.latest), {
      env: SHADOW,
      generate: fakeWho('bereaved'),
    });
    const self = detectCrisis('i want to die');
    expect(run!.shadow(self)).toBe(self);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(info.mock.calls.filter(([, msg]) => msg === 'THIRD_PARTY_WHO')).toEqual([]);
  });
});
