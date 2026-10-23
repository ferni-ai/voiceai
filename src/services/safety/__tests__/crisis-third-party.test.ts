/**
 * THIRD_PARTY_SELF_HARM (#2635). Live: someone else's self-harm said with a modal, as a report or
 * bare gets the third-party guidance from the main guard, never the caller's own script. Off and
 * shadow read exactly as main. The benign look-alikes are listed, and so are the three that
 * already read as third party on main.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (load) => {
  const real = await load<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: { module?: string }) => {
      const base = real.createLogger(bindings as never);
      return bindings?.module === 'CrisisThirdParty' ? { ...base, info } : base;
    },
  };
});

import { CRISIS_CONTEXTUAL } from '../../../agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../../agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_RELAY } from '../../../agents/__tests__/fixtures/crisis-relay.js';
import { CRISIS_TEST_BLIND } from '../../../agents/__tests__/fixtures/crisis-test-blind.js';
import { buildCrisisGuidance, detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { normalize } from '../crisis-modifiers.js';
import { THIRD_PARTY_PATTERNS } from '../crisis-patterns.js';
import {
  resolveThirdPartySelfHarm,
  shadowThirdPartySelfHarm,
  thirdPartyRisk,
  thirdPartySelfHarm,
} from '../crisis-third-party.js';
import { BENIGN_FRAMED, BEREAVED, SESSIONS } from './fixtures/third-party-self-harm.js';

/** Missed by every crisis site on main (#2635). */
const MISSED_ON_MAIN = [
  "he keeps saying he'll hurt himself",
  'kill himself',
  'hurt himself',
  'end their life',
  'kill herself',
  'kill themselves',
  'end his life',
  'take her own life',
  "he said he'd kill himself",
  'he said he will kill himself',
  "my brother keeps saying he'll end his life",
  "i'm scared he'll hurt himself",
  'i think she might hurt herself',
  "I'm worried my son might hurt himself.",
  "my partner said they'll kill themselves if i leave",
  "i'm worried my dad is going to take his own life",
  "my mom texted me that she'll kill herself",
  'they might kill themselves',
  'what if he kills himself',
  "i'm afraid she will take her own life",
  'he could hurt himself, he keeps saying it',
  "my boyfriend says he'll end his life",
  'she keeps saying she will hurt herself',
  "I'm scared my wife might kill herself",
  'she keeps posting about hurting herself',
  'he keeps joking about killing himself',
  "my dad said he'll take his own life",
  'he wants to unalive himself',
  'my son might kill him self',
  'my girlfriend threatened to take her own life',
  "she says she's going to hang herself",
];
/** Third-party lines main already guides, which must stay third party. */
const CAUGHT_ON_MAIN = [
  'she wants to kill herself',
  'my son talked about ending his life',
  'they said they want to end their life',
  'my daughter told me she wants to hurt herself',
  "he's threatening to kill himself",
  'my son keeps saying he wants to die',
  'he told me he is going to kill himself tonight',
];
/** Everyday look-alikes: none may read as risk in live unless main already does. */
const BENIGN = [
  'he was killing himself laughing',
  "he'd kill himself if he saw this mess",
  "she's dying to meet you",
  'he hurt himself playing soccer',
  'the character kills himself in the movie',
  'he hurt himself at the gym',
  'she hurt herself skiing',
  "he's killing himself at work these days",
  'my son hurt himself falling off his bike',
  "she's killing herself to finish the project",
  'he almost killed himself on the stairs',
  "he said he'd kill me if i was late again",
  "she'll kill herself laughing when she sees this",
  "he'll hurt himself if he keeps lifting like that",
  'the dog hurt himself on the fence',
  'he cut himself shaving',
  'he talked about the time he hurt himself skiing',
  "he's beating himself up over the breakup",
  "he's going to end his career if he keeps this up",
  'she ended her life as a smoker last year',
  'he took his life savings to vegas',
  "he's taking his life back after the divorce",
  "he's going to take his life back after rehab",
  "she said she'll take her life in a new direction",
  'taking his life back',
  'he nearly killed himself falling off the ladder',
  "he'll kill himself trying to keep up with them",
  'careful, she might hurt herself on those stairs',
  'he will kill himself doing that',
  // A threat to someone else is not their own self-harm.
  'he said he will end her life',
  // Already third party on main (THIRD_PARTY_PATTERNS), unchanged here.
  "he's going to kill himself on that skateboard",
  "she's going to kill herself studying for this exam",
  "he's gonna hurt himself on that trampoline",
];
const ALREADY_THIRD_PARTY_ON_MAIN = BENIGN.slice(-3);

const FIXTURES = [
  ...CRISIS_TEST_BLIND,
  ...CRISIS_HELDOUT,
  ...CRISIS_RELAY,
  ...CRISIS_CONTEXTUAL,
].map((c) => c.text);
const ALL = [
  ...MISSED_ON_MAIN,
  ...CAUGHT_ON_MAIN,
  ...BENIGN,
  ...BENIGN_FRAMED,
  ...BEREAVED,
  ...FIXTURES,
];
const offRead = <T>(fn: () => T): T => {
  vi.stubEnv('THIRD_PARTY_SELF_HARM', 'off');
  try {
    return fn();
  } finally {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'live');
  }
};

const read = (text: string) => JSON.stringify(detectCrisis(text));
const thirdParty = (text: string) => {
  const c = detectCrisis(text);
  return c.isCrisis && c.subject === 'third_party';
};

beforeEach(() => info.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe('THIRD_PARTY_SELF_HARM=live', () => {
  beforeEach(() => vi.stubEnv('THIRD_PARTY_SELF_HARM', 'live'));

  it.each(MISSED_ON_MAIN)('gives the third-party guidance, never a replaced reply: %s', (text) => {
    const c = detectCrisis(text);
    expect(c.isCrisis).toBe(true);
    expect(c.subject).toBe('third_party');
    expect(c.indicators).toContain('third_party_risk');
    expect(guardFromDetection(c).shouldBlock).toBe(false);
    expect(buildCrisisGuidance(c)).toContain('worried that someone they know is at risk');
    expect(c.suggestedResponse).toContain('call or text 988');
    expect(c.suggestedResponse).toContain('on their behalf');
  });

  it.each(CAUGHT_ON_MAIN)('keeps what main already guided: %s', (text) => {
    expect(thirdParty(text)).toBe(true);
  });

  it('a distressed voice never turns a third-party worry into the self script', () => {
    const c = detectCrisis("he keeps saying he'll hurt himself", {
      primary: 'distressed',
      intensity: 0.95,
      confidence: 0.9,
    });
    expect(c.subject).toBe('third_party');
    expect(guardFromDetection(c).shouldBlock).toBe(false);
  });

  it("the caller's own words still decide when they are about the caller", () => {
    const c = detectCrisis("i want to kill myself and he keeps saying he'll hurt himself");
    expect(c.subject).toBe('self');
    expect(guardFromDetection(c).shouldBlock).toBe(true);
  });

  it('only these benign look-alikes read as risk, all already third party on main', () => {
    const hits = BENIGN.filter((t) => detectCrisis(t).isCrisis);
    expect(hits).toEqual(ALREADY_THIRD_PARTY_ON_MAIN);
    expect(BENIGN.filter(thirdPartySelfHarm)).toEqual([]);
  });

  it('never lowers a read: every fixture line is at least what off gives it', () => {
    for (const text of ALL) {
      const live = detectCrisis(text);
      const off = offRead(() => detectCrisis(text));
      expect(live.severity, text).toBeGreaterThanOrEqual(off.severity);
      if (off.isCrisis) expect(live.subject, text).toBe(off.subject);
    }
  });

  it(`a bereaved caller never gets "988 for them": ${BEREAVED.length} lines read exactly as off`, () => {
    expect(BEREAVED.length).toBeGreaterThanOrEqual(40);
    const changed = BEREAVED.filter((t) => read(t) !== offRead(() => read(t)));
    expect(changed).toEqual([]);
  });

  it('warnings, trivial conditions, fiction and jokes around the act read exactly as off', () => {
    const changed = BENIGN_FRAMED.filter((t) => read(t) !== offRead(() => read(t)));
    expect(changed).toEqual([]);
  });

  it.each(SESSIONS)(
    'a third-party turn never lowers the session read (earlier %j, now %j)',
    (earlier, now) => {
      const live = detectCrisis(now, undefined, { recentMessages: earlier });
      const off = offRead(() => detectCrisis(now, undefined, { recentMessages: earlier }));
      expect(live.severity).toBeGreaterThanOrEqual(off.severity);
      expect(live.isCrisis || !off.isCrisis).toBe(true);
    }
  );

  it("the eval lead's three-turn session still escalates as on main", () => {
    const c = detectCrisis('soon none of this will matter', undefined, {
      recentMessages: [
        "he said he'd kill himself and i would never kill myself",
        "i can't do this anymore",
      ],
    });
    expect(c.isCrisis).toBe(true);
    expect(c.subject).toBe('self');
    expect(c.indicators).toContain('session_escalation');
  });
});

describe.each(['off', 'shadow'])('THIRD_PARTY_SELF_HARM=%s reads as main', (mode) => {
  beforeEach(() => vi.stubEnv('THIRD_PARTY_SELF_HARM', mode));

  it.each(MISSED_ON_MAIN)('still misses, as on main: %s', (text) => {
    const c = detectCrisis(text);
    expect(c.isCrisis).toBe(false);
    expect(c.subject).toBeUndefined();
  });

  it("checks exactly main's third-party patterns on every line", () => {
    for (const text of ALL.map(normalize)) {
      expect(thirdPartyRisk(text), text).toBe(THIRD_PARTY_PATTERNS.some((p) => p.test(text)));
    }
  });

  it('a session the third-party worry kept from escalating on main still does not', () => {
    const earlier = [
      'my brother wants to kill himself and i would never kill myself',
      "i can't do this anymore",
    ];
    expect(
      detectCrisis('soon none of this will matter', undefined, { recentMessages: earlier }).isCrisis
    ).toBe(false);
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'live');
    expect(
      detectCrisis('soon none of this will matter', undefined, { recentMessages: earlier }).isCrisis
    ).toBe(true);
  });

  it('every read is byte-identical to the flag unset', () => {
    const got = ALL.map(read);
    vi.stubEnv('THIRD_PARTY_SELF_HARM', '');
    expect(got).toEqual(ALL.map(read));
  });
});

describe('resolveThirdPartySelfHarm', () => {
  it('is off unless live or shadow', () => {
    expect(resolveThirdPartySelfHarm({})).toBe('off');
    expect(resolveThirdPartySelfHarm({ THIRD_PARTY_SELF_HARM: ' LIVE ' })).toBe('live');
    expect(resolveThirdPartySelfHarm({ THIRD_PARTY_SELF_HARM: 'shadow' })).toBe('shadow');
    for (const v of ['on', 'true', '1', 'junk']) {
      expect(resolveThirdPartySelfHarm({ THIRD_PARTY_SELF_HARM: v })).toBe('off');
    }
  });
});

describe('shadowThirdPartySelfHarm', () => {
  const turn = (text: string) => {
    const used = detectCrisis(text);
    shadowThirdPartySelfHarm(used, () => detectCrisis(text));
    return used;
  };

  it('in shadow, logs a turn whose live read differs, without changing it or the next read', () => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'shadow');
    const used = turn("he keeps saying he'll hurt himself ZQXSENTINEL");
    expect(used.isCrisis).toBe(false);
    expect(info.mock.calls).toStrictEqual([
      [
        {
          was: { isCrisis: false, subject: undefined, severity: 0 },
          live: { isCrisis: true, subject: 'third_party', severity: 0.75 },
        },
        'THIRD_PARTY_SELF_HARM_SHADOW',
      ],
    ]);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/ZQXSENTINEL|himself/);
    expect(detectCrisis("he keeps saying he'll hurt himself").isCrisis).toBe(false);
  });

  it('in shadow, logs nothing when the live read is the same', () => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'shadow');
    for (const text of [...CAUGHT_ON_MAIN, ...BENIGN]) turn(text);
    expect(info).not.toHaveBeenCalled();
  });

  it.each(['off', 'live', ''])('never reads or logs when the flag is %j', (mode) => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', mode);
    const reader = vi.fn(() => detectCrisis('kill himself'));
    shadowThirdPartySelfHarm(detectCrisis('hello'), reader);
    expect(reader).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('swallows a failed read and leaves later reads off', () => {
    vi.stubEnv('THIRD_PARTY_SELF_HARM', 'shadow');
    expect(() =>
      shadowThirdPartySelfHarm(detectCrisis('hello'), () => {
        throw new Error('boom');
      })
    ).not.toThrow();
    expect(detectCrisis('kill himself').isCrisis).toBe(false);
  });
});
