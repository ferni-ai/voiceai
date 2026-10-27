/**
 * CRISIS_MEANS_IN_HAND (#2697, #2717 round 1): off | shadow (default) | live.
 *
 * Shadow and off read every line exactly as main; shadow logs the tier live would give, with the
 * session id and no words. Live adds the imminent forms, and nothing else: a dose strength is not
 * a count, and negated, hypothetical or everyday means add no indicator at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    info: logged.info,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  return { createLogger: () => logger, getLogger: () => logger, default: logger, logger };
});

import { detectCrisis, guardFromDetection, IN_DANGER_NOW } from '../crisis-guard.js';
import { resolveMeansInHandMode } from '../crisis-means-in-hand.js';
import { noteMeansInHandShadow, readsImminentLive, tierOf } from '../crisis-means-shadow.js';
import {
  assessSafety,
  getCrisisResponse,
} from '../../../tools/domains/life-coaching-shared/safety-guards.js';

const live = (text: string) => detectCrisis(text, undefined, { meansInHand: 'live' });
const off = (text: string) => detectCrisis(text, undefined, { meansInHand: 'off' });

const NEW_IMMINENT = [
  "i have the pills right here and i'm taking them now",
  'i swallowed every pill i have',
  'the knife is against my throat',
  'im taking them all now goodbye',
  'i took the whole bottle im scared',
];

beforeEach(() => logged.info.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe('the mode', () => {
  it('is shadow unless set to off or live', () => {
    expect(resolveMeansInHandMode({})).toBe('shadow');
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: 'yes' })).toBe('shadow');
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: ' LIVE ' })).toBe('live');
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: 'off' })).toBe('off');
  });

  it.each(NEW_IMMINENT)('off and shadow read "%s" exactly as main; live reads 911', (text) => {
    const main = off(text);
    expect(main.indicators).not.toContain('imminent_danger');
    // '' is unset: the default, whatever the process was started with.
    for (const mode of ['', 'shadow', 'off']) {
      vi.stubEnv('CRISIS_MEANS_IN_HAND', mode);
      expect(detectCrisis(text)).toEqual(main);
      expect(assessSafety(text).flags).not.toContain('suicidal: imminent means or attempt');
    }
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
    const read = detectCrisis(text);
    expect(read.indicators).toContain('imminent_danger');
    expect(guardFromDetection(read).replacementResponse).toContain(IN_DANGER_NOW);
    expect(assessSafety(text).level).toBe('crisis');
    expect(getCrisisResponse(assessSafety(text))).toContain('911');
  });

  it('shadow keeps assessSafety as on main for words the patterns already read imminent', () => {
    const text = 'the gun is in my mouth';
    expect(off(text).indicators).toContain('imminent_danger');
    expect(readsImminentLive(text, {})).toBe(false);
    expect(readsImminentLive(text, { CRISIS_MEANS_IN_HAND: 'live' })).toBe(true);
  });
});

describe('shadow logs the tier live would give, never the words', () => {
  const words = "i have the pills right here and i'm taking them now";

  it('logs session id, reader and tier when live would read the turn differently', () => {
    const tier = noteMeansInHandShadow('call-1', off(words), { text: words }, {});
    expect(tier).toBe('imminent');
    expect(logged.info).toHaveBeenCalledTimes(1);
    const [fields] = logged.info.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toEqual({ sessionId: 'call-1', reader: 'means_in_hand', tier: 'imminent' });
    expect(JSON.stringify(logged.info.mock.calls)).not.toContain('pills');
  });

  it('logs nothing when the tier is the same, or when off or live', () => {
    const plain = 'what should i cook for dinner';
    expect(noteMeansInHandShadow('call-2', off(plain), { text: plain }, {})).toBeNull();
    for (const mode of ['off', 'live']) {
      const env = { CRISIS_MEANS_IN_HAND: mode };
      expect(noteMeansInHandShadow('call-3', off(words), { text: words }, env)).toBeNull();
    }
    expect(logged.info).not.toHaveBeenCalled();
  });

  it('names the tiers by what the caller hears', () => {
    expect(tierOf(live(words))).toBe('imminent');
    expect(tierOf(off('i want to kill myself'))).toBe('block');
    expect(tierOf(off('what should i cook for dinner'))).toBe('none');
  });
});

describe('live: a dose strength is not a pill count (r1 blocker 2)', () => {
  it.each([
    'i took 500 mg of tylenol for my headache',
    'took 200mg of ibuprofen',
    'i took 25 units of insulin before dinner',
    'i took 300 mg of lithium like always',
    'i took 20 ml of benadryl syrup',
    'i took 81 mg of aspirin',
    'i took 40 iu of insulin',
  ])('"%s" reads as on main', (text) => {
    expect(live(text)).toEqual(off(text));
    expect(live(text).indicators).not.toContain('imminent_danger');
  });

  it.each(['i took 40 tylenol', 'i took like 50 advil an hour ago', 'took 30 xanax'])(
    'a count still reads 911: "%s"',
    (text) => expect(live(text).indicators).toContain('imminent_danger')
  );
});

describe('live: negated or hypothetical means block the 911 tier and add nothing (r1 blocker 3)', () => {
  it.each([
    'i have no pills right here',
    "i don't have any pills in my hand",
    "i'd never have the pills right here",
    "i wouldn't ever have the rope right here",
    "i promised i wouldn't have the pills in my hand",
    'my therapist asked if i have the pills right here and i said no',
    'what if i had the pills right here',
    'imagine if i had the gun in my hand',
    'i dreamed i had the gun in my hand',
    'in my dream i had the pills in my hand',
    'there is a song called the gun is in my hand',
    'lol im taking them now',
    "i wouldn't say i'm taking them now",
  ])('"%s" reads exactly as on main', (text) => {
    expect(live(text)).toEqual(off(text));
  });

  it.each([
    "i want to die but i don't have the pills right here",
    'i want to kill myself, i have no gun in my hand',
  ])('ending words keep their own read, never lower than main: "%s"', (text) => {
    expect(off(text).severity).toBeGreaterThanOrEqual(0.85);
    expect(live(text)).toEqual(off(text));
    expect(live(text).indicators).not.toContain('imminent_danger');
  });

  it.each([
    "i can't take it anymore i have the pills right here",
    'no i have the pills right here',
    "i'm not okay i have the pills right here",
    'i want to die and the gun is loaded',
  ])('a negation elsewhere does not soften the means: "%s"', (text) => {
    expect(live(text).indicators).toContain('imminent_danger');
  });
});

describe('live: everyday look-alikes', () => {
  it.each([
    'i have the rope right here, tie it to the tent',
    'i have the razor in my hand, shaving my legs',
    'at the shooting range with the pistol in my hand',
    'the drill gun is in my hand',
    'i have the jump rope right here',
    'i have my blood pressure pills right here',
    'i have my anti anxiety pills in my hand',
    "i'm taking my meds now",
    "i'm taking them now, my antidepressants, like the doctor said",
    'i have the tablets in front of me, ipads for the class',
    'the rope is in my hands, hauling the canoe onto the dock',
    'i have a blade in my hand, sanding down the shelf',
    'the gun is right here, locked in the safe',
    'got the pills right here, it is time for dads evening dose',
    "i have the rope right here and we're going camping",
    'my caulking gun is in my hand',
    'the thermometer gun is in my hand',
  ])('"%s" reads as on main', (text) => {
    expect(live(text)).toEqual(off(text));
  });

  it.each([
    "she said i'm taking them now and then she hung up",
    'my brother texted "i did it, i took them all"',
  ])('someone else\'s reported words are not the caller\'s 911: "%s"', (text) => {
    expect(live(text)).toEqual(off(text));
  });

  it.each([
    "they said i'm better off dead so i'm taking them all now",
    'the blade is right here, cutting myself tonight',
    'i have the gun right here, loading it now',
  ])('risk after the comma or a report still reads 911: "%s"', (text) => {
    expect(live(text).indicators).toContain('imminent_danger');
  });

  it.each([
    "i'm taking them now, goodbye.",
    'im taking them now i love you',
    'i took them all dont tell anyone',
  ])('a goodbye after the means still ends the clause: "%s"', (text) =>
    expect(live(text).indicators).toContain('imminent_danger')
  );
});
