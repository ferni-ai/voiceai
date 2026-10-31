/**
 * CRISIS_MEANS_IN_HAND (#2697, #2717 round 1): off | shadow (default) | live.
 *
 * Off and shadow read every line exactly as main. Live adds the imminent read of the live forms
 * only (LIVE_FORMS); the other forms never change a read. In shadow and live, the shadow log names
 * the tier and the form any form would give, with the session id and no words.
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

import { detectCrisis, sessionSeverityOf } from '../crisis-guard.js';
import { LIVE_FORMS, resolveMeansInHandMode } from '../crisis-means-in-hand.js';
import { noteMeansInHandShadow, readsImminentLive, tierOf } from '../crisis-means-shadow.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';

const live = (text: string) => detectCrisis(text, undefined, { meansInHand: 'live' });
const off = (text: string) => detectCrisis(text, undefined, { meansInHand: 'off' });
const all = (text: string) => detectCrisis(text, undefined, { meansInHand: 'all' });
const imminent = (r: { indicators: string[] }) => r.indicators.includes('imminent_danger');

beforeEach(() => logged.info.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe('the mode and the live set', () => {
  it('is shadow unless set to off or live', () => {
    expect(resolveMeansInHandMode({})).toBe('shadow');
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: 'yes' })).toBe('shadow');
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: ' LIVE ' })).toBe('live');
    expect(resolveMeansInHandMode({ CRISIS_MEANS_IN_HAND: 'off' })).toBe('off');
  });

  it('keeps the two forms with held-out false 911s shadow-only', () => {
    expect([...LIVE_FORMS].sort()).toEqual(
      [
        'cutting_now',
        'did_it',
        'drug_count',
        'ending_beside_means',
        'means_with_intent',
        'on_body',
        'took_dose',
      ].sort()
    );
  });

  it.each(['the noose is around my neck', "i have the pills right here and i'm taking them now"])(
    'off and shadow read "%s" exactly as main; live reads 911',
    (text) => {
      expect(imminent(off(text))).toBe(false);
      // '' is unset: the default, whatever the process was started with.
      for (const mode of ['', 'shadow', 'off']) {
        vi.stubEnv('CRISIS_MEANS_IN_HAND', mode);
        expect(detectCrisis(text)).toEqual(off(text));
        expect(assessSafety(text).flags).not.toContain('suicidal: imminent means or attempt');
      }
      vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
      expect(imminent(detectCrisis(text))).toBe(true);
      expect(assessSafety(text).level).toBe('crisis');
    }
  );

  it('shadow keeps assessSafety as on main for words the patterns already read imminent', () => {
    const text = 'the gun is in my mouth';
    expect(imminent(off(text))).toBe(true);
    expect(readsImminentLive(text, {})).toBe(false);
    expect(readsImminentLive(text, { CRISIS_MEANS_IN_HAND: 'live' })).toBe(true);
  });
});

describe('shadow-only forms never change a read, even live', () => {
  it.each([
    ['i have the pills right here', 'means_in_hand'],
    ['the pills are right here', 'means_in_hand'],
    ["i'm taking them now", 'taking_now'],
    ["i'm taking all my pills now goodbye", 'taking_now'],
  ])('"%s" (%s)', (text, form) => {
    expect(live(text)).toEqual(off(text));
    expect(all(text).indicators).toContain(`means_form:${form}`);
  });
});

describe('the shadow log names the tier and the form, never the words', () => {
  const words = 'i have the pills right here';

  it.each(['', 'live'])('logs a shadow-only form (mode "%s")', (mode) => {
    const env = { CRISIS_MEANS_IN_HAND: mode };
    const got = noteMeansInHandShadow('call-1', off(words), { text: words }, env);
    expect(got).toEqual({ tier: 'imminent', form: 'means_in_hand' });
    const [fields] = logged.info.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toEqual({
      sessionId: 'call-1',
      reader: 'means_in_hand',
      tier: 'imminent',
      form: 'means_in_hand',
    });
    expect(JSON.stringify(logged.info.mock.calls)).not.toContain('pills');
  });

  it('logs nothing when off, when no form fires, or when the turn already has that tier', () => {
    const offEnv = { CRISIS_MEANS_IN_HAND: 'off' };
    expect(noteMeansInHandShadow('c', off(words), { text: words }, offEnv)).toBeNull();
    const plain = 'what should i cook for dinner';
    expect(noteMeansInHandShadow('c', off(plain), { text: plain }, {})).toBeNull();
    const liveForm = 'the noose is around my neck';
    expect(noteMeansInHandShadow('c', live(liveForm), { text: liveForm }, {})).toBeNull();
    expect(logged.info).not.toHaveBeenCalled();
  });

  it('names the tiers by what the caller hears', () => {
    expect(tierOf(live('the noose is around my neck'))).toBe('imminent');
    expect(tierOf(off('i want to kill myself'))).toBe('block');
    expect(tierOf(off('what should i cook for dinner'))).toBe('none');
  });
});

/**
 * Every bypass the security review found across four rounds, on the exemption layer this design
 * deleted. Each line either reaches no 911 script from a live form, or is a real crisis line a live
 * form reads correctly.
 */
describe('the security-review bypasses', () => {
  it.each([
    'i took my meds this morning and the noose is around my neck',
    "i'm on my blood pressure pills and the gun is pointed at my head",
    'i had a headache all day and the razor is against my wrist',
    'i was shaving and now the razor is against my wrist',
    "i have the guns in my hand and i'm doing it now",
    "i have the knives in my hand and i'm doing it now",
    "i have a bottle in my hand and i'm doing it now",
    "i have everything in my hand and i'm doing it now",
    'i took 15 pills',
    'i swallowed 1200 tablets',
    'i took a bottle',
    // A softened first match never hides a real second one.
    'years ago i took them all. today i just took them all',
  ])('a real crisis line a live form reads: "%s"', (text) => {
    expect(imminent(off(text))).toBe(false);
    expect(imminent(live(text))).toBe(true);
  });

  it.each([
    'i took my meds and i have the gun right here',
    'i took my meds this morning, the gun is right here',
    'i have my heart pills right here. i have the pills right here',
    "my coworker's pills are right here",
    "my stepdad's pills are right here",
    "my ex's meds are right here",
    'the cop left his gun right here',
    'the cop left his gun and i have it in my hand',
    "i'm out hunting i have the pills right here",
    "i have my pills right here and i'm taking them now",
    "i'm taking my meds now",
    'i have my blood pressure pills right here',
    'at the shooting range with the pistol in my hand',
    'i have the tablets in front of me, ipads for the class',
  ])('no live form reads it; the classifier decides: "%s"', (text) => {
    expect(live(text)).toEqual(off(text));
  });
});

describe('round 2 (verifier r1 follow-ups)', () => {
  it.each([
    "she texted me 'i took them all'",
    'she texted me "i took them all"',
    // These read nothing only because of the reported-speech softener.
    'my brother texted me i took a whole bottle of tylenol',
    'he told me i did it, i took the pills',
    'she said i took 40 tylenol',
  ])("someone else's reported words are not the caller's 911: %s", (text) => {
    expect(live(text)).toEqual(off(text));
    expect(imminent(live(text))).toBe(false);
  });

  it.each(['the nail gun is in my hand', "the nail gun is in my hand and i'm going to use it now"])(
    'a tool called a gun is not the means, in any form: "%s"',
    (text) => {
      expect(live(text)).toEqual(off(text));
      expect(all(text).indicators.some((i) => i.startsWith('means_form:'))).toBe(false);
    }
  );

  it.each(['', 'shadow', 'live'])(
    'a shadow-only match never counts toward a later turn (mode "%s")',
    (mode) => {
      vi.stubEnv('CRISIS_MEANS_IN_HAND', mode);
      expect(sessionSeverityOf('i have the pills right here')).toBe(0);
      const later = 'everything is too much right now.';
      const earlier = { recentMessages: ['i have the pills right here'] };
      const main = detectCrisis(later, undefined, { ...earlier, meansInHand: 'off' });
      expect(main.indicators).not.toContain('session_escalation');
      expect(detectCrisis(later, undefined, earlier)).toEqual(main);
    }
  );

  // Lead decision, round 2b: no sentence-wide exclusions. These three ordinary lines get the 911
  // script in live mode. That is the known cost (3/147 on the verifier's set), Seth's call when
  // live is considered. An exclusion that clears them also cleared real crises like the next set.
  it.each([
    'i took 10 tylenol over the whole week for my back',
    "the blade is against my wrist, i'm doing the ink outline for my tattoo",
    "i took 30 tylenol to my grandma's house in her pill organizer",
  ])('known cost: live reads the ordinary line "%s" as 911', (text) => {
    expect(imminent(off(text))).toBe(false);
    expect(imminent(live(text))).toBe(true);
  });

  it.each([
    "i took 40 tylenol, i won't be here in a week",
    'i took 40 tylenol to my room so nobody would stop me',
    "the razor is against my wrist, i'm not shaving, i'm ending it",
    "i took 50 tylenol, i can't face another day of this, every day is the same",
    'i took 40 tylenol, what a day, goodbye',
  ])('a time span, a place or a purpose word elsewhere never clears 911: "%s"', (text) => {
    expect(imminent(live(text))).toBe(true);
  });

  it.each([
    'she texted me "it\'s over and i took them all."',
    'my brother wrote "i can\'t anymore and i took 40 tylenol."',
    'he texted "i\'m sorry and the noose is around my neck"',
  ])("words quoted from someone else are not the caller's 911: %s", (text) => {
    expect(live(text)).toEqual(off(text));
  });

  it('the shadow log names the form that would act: ending words beside the means', () => {
    const text = 'i want to die and i have the pills right here';
    expect(all(text).indicators).toContain('means_form:ending_beside_means');
    expect(all('i have the pills right here').indicators).toContain('means_form:means_in_hand');
  });
});
