/**
 * CRISIS_CLASSIFIER_OTHER_IMMINENT_911 (#4212, owner rule 2026-11-02): when the classifier reads
 * someone other than the caller in immediate danger and no pattern read an emergency for them,
 * 911 for them comes first, then everything main said, whole. Off, and unset, is main. Read from
 * the request's env, not process.env, at the merge (applyClassifierVerdict), the reply gate
 * (gatedReply) and the turn pipeline (startTurnCrisis). All lines are fictional.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { forThemFirst } from '../../../services/safety/crisis-caller-check.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import {
  CALL_911_FOR_THEM,
  EMERGENCY_FOR_THEM,
} from '../../../services/safety/crisis-guard-replies.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  guardFromDetection,
  type ClassifierVerdictLike,
  type CrisisDetectionResult,
  type VoiceEmotionContext,
} from '../../../services/safety/crisis-guard.js';
import { FLIP_SHAPES, NON_COMPLIANT, stubbedGateReply } from './caller-check-gate.js';

const FLAG = 'CRISIS_CLASSIFIER_OTHER_IMMINENT_911';
const savedFlag = process.env[FLAG];
afterEach(() => {
  if (savedFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = savedFlag;
});

/** No pattern reads it: only the classifier can. */
const GARAGE = 'my sister locked herself in the garage with the car running';
/** The patterns read a worry for someone else. */
const FRIEND = 'my friend told me she wants to kill herself';
/** The patterns read the caller at risk; the classifier reads someone else in danger too. */
const BOTH =
  'i want to kill myself and my sister locked herself in the garage with the car running';
/** As BOTH, with the caller's own words read as a worry (passive), not a replacement. */
const BOTH_SOFT =
  'sometimes i wish i would not wake up, and my sister locked herself in the garage with the car running';
/** The patterns already read someone down: an emergency for them. */
const DOWN = "my dad collapsed and he isn't getting up";
/** No pattern reads it; the classifier reads the caller in danger. */
const PARKED = 'im parked on the bridge, engine off, just sitting here deciding';
const LINES = [GARAGE, FRIEND, BOTH, BOTH_SOFT, DOWN, PARKED];

const OTHER_IMMINENT: ClassifierVerdictLike = { risk: 'imminent', subject: 'third_party' };
const OTHER_CRISIS: ClassifierVerdictLike = { risk: 'crisis', subject: 'third_party' };
const SELF_IMMINENT: ClassifierVerdictLike = { risk: 'imminent', subject: 'self' };
const VERDICTS = [OTHER_IMMINENT, OTHER_CRISIS, SELF_IMMINENT];

const DISTRESSED: VoiceEmotionContext = { primary: 'anxious', intensity: 0.9, confidence: 0.9 };

/** The merge with the flag in its env; process.env holds the opposite, so only the env can decide. */
function merge(
  line: string,
  verdict: ClassifierVerdictLike,
  flag: 'on' | 'off' | undefined,
  voice?: VoiceEmotionContext
): CrisisDetectionResult {
  process.env[FLAG] = flag === 'on' ? 'off' : 'on';
  const env = flag === undefined ? {} : { [FLAG]: flag };
  return applyClassifierVerdict(detectCrisis(line, voice), verdict, env);
}

const blocks = (c: CrisisDetectionResult) => guardFromDetection(c).shouldBlock;
/** Main's for-them reply, as a line only the classifier reads gets it (#3789). */
const forThemReply = () => merge(GARAGE, OTHER_IMMINENT, 'off').suggestedResponse ?? '';
/** The patterns read the caller, the classifier someone else: the for-them reply, then main's. */
const bothWays = (main: string) => forThemFirst(`${forThemReply()}\n\n${main}`);
const at = (text: string, n: string) => (text.includes(n) ? text.indexOf(n) : Infinity);

describe('CRISIS_CLASSIFIER_OTHER_IMMINENT_911 at the merge', () => {
  it.each([GARAGE, FRIEND])(
    'someone else in danger, read by the classifier: 911 first, then main whole (%s)',
    (line) => {
      const on = merge(line, OTHER_IMMINENT, 'on');
      const off = merge(line, OTHER_IMMINENT, 'off');
      expect(on.suggestedResponse).toBe(forThemFirst(off.suggestedResponse!));
      expect(on.suggestedResponse!.startsWith(CALL_911_FOR_THEM)).toBe(true);
      expect(at(on.suggestedResponse!, '911')).toBeLessThan(at(on.suggestedResponse!, '988'));
      expect(on.suggestedResponse).toContain('988');
      expect(blocks(on)).toBe(true);
      expect(on.subject).toBe('third_party');
      expect(on.indicators).toEqual(
        expect.arrayContaining(['third_party_emergency', 'imminent_danger', 'classifier_imminent'])
      );
    }
  );

  it.each([GARAGE, FRIEND])('off, and unset, is main: 988 first, not replaced (%s)', (line) => {
    const off = merge(line, OTHER_IMMINENT, 'off');
    expect(merge(line, OTHER_IMMINENT, undefined)).toEqual(off);
    expect(blocks(off)).toBe(false);
    expect(at(off.suggestedResponse!, '988')).toBeLessThan(at(off.suggestedResponse!, '911'));
    expect(off.indicators).not.toContain('third_party_emergency');
  });

  it('both the caller and someone else: 911 for them, the for-them reply, then the caller’s own script whole', () => {
    const on = merge(BOTH, OTHER_IMMINENT, 'on');
    const off = merge(BOTH, OTHER_IMMINENT, 'off');
    expect(off.subject).toBe('self');
    expect(on.subject).toBe('self');
    expect(on.severity).toBe(off.severity);
    expect(on.suggestedResponse).toBe(bothWays(off.suggestedResponse!));
    expect(on.suggestedResponse!.startsWith(CALL_911_FOR_THEM)).toBe(true);
    expect(on.suggestedResponse).toContain('988');
    expect(on.indicators).toEqual(expect.arrayContaining(off.indicators));
  });

  it('a caller check: 911 for them, then the for-them reply and the caller’s 988 line', () => {
    const line = FLIP_SHAPES[0];
    const off = merge(line, OTHER_IMMINENT, 'off', DISTRESSED);
    expect(off.indicators).toContain('caller_check');
    const on = merge(line, OTHER_IMMINENT, 'on', DISTRESSED);
    expect(on.suggestedResponse).toBe(forThemFirst(off.suggestedResponse!));
  });

  it('someone the patterns already read down keeps the emergency reply as it is', () => {
    const off = merge(DOWN, OTHER_IMMINENT, 'off');
    expect(off.suggestedResponse).toBe(EMERGENCY_FOR_THEM);
    expect(merge(DOWN, OTHER_IMMINENT, 'on')).toEqual(off);
  });

  it.each(LINES)('a non-imminent read about someone else is unchanged (%s)', (line) => {
    expect(merge(line, OTHER_CRISIS, 'on')).toEqual(merge(line, OTHER_CRISIS, 'off'));
  });

  it.each(LINES)('an imminent read about the caller is unchanged (%s)', (line) => {
    expect(merge(line, SELF_IMMINENT, 'on')).toEqual(merge(line, SELF_IMMINENT, 'off'));
  });

  it('never lowers: every line and verdict keeps its level, its marks and its numbers', () => {
    let cells = 0;
    for (const line of LINES)
      for (const verdict of VERDICTS) {
        const where = `${verdict.risk}/${verdict.subject}: ${line}`;
        const on = merge(line, verdict, 'on');
        const off = merge(line, verdict, 'off');
        expect(on.severity, where).toBeGreaterThanOrEqual(off.severity);
        expect(on.isCrisis || !off.isCrisis, where).toBe(true);
        expect(blocks(on) || !blocks(off), where).toBe(true);
        expect(on.indicators, where).toEqual(expect.arrayContaining(off.indicators));
        if (off.subject === 'self') expect(on.subject, where).toBe('self');
        for (const n of ['911', '988'])
          if (off.suggestedResponse?.includes(n)) expect(on.suggestedResponse, where).toContain(n);
        cells++;
      }
    expect(cells).toBe(18);
  });
});

const answering = (verdict: ClassifierVerdictLike) => async () => JSON.stringify(verdict);
const gate = (line: string, flag: 'on' | 'off' | undefined) => {
  process.env[FLAG] = flag === 'on' ? 'off' : 'on';
  const env: Record<string, string> = flag === undefined ? {} : { [FLAG]: flag };
  return stubbedGateReply(line, undefined, 'classifier none', env, answering(OTHER_IMMINENT));
};

// The gate reads the classifier only on a turn the patterns don't already replace, so its "both"
// line is one the patterns read as the caller's own worry, below a replacement. The model is
// started while the read runs; the read's reply replaces it.
describe('CRISIS_CLASSIFIER_OTHER_IMMINENT_911 through gatedReply', () => {
  it('on: code speaks 911 for them first, then the for-them 988 reply', async () => {
    const { text } = await gate(GARAGE, 'on');
    expect(text).toBe(merge(GARAGE, OTHER_IMMINENT, 'on').suggestedResponse);
    expect(text.startsWith(CALL_911_FOR_THEM)).toBe(true);
    expect(text).not.toContain(NON_COMPLIANT);
  });

  it('off, and unset, is main: the model answers, guided', async () => {
    const off = await gate(GARAGE, 'off');
    expect(await gate(GARAGE, undefined)).toEqual(off);
    expect(off.text).toBe(NON_COMPLIANT);
  });

  it('both the caller and someone else: 911 for them, the for-them reply, then the caller’s own script whole', async () => {
    const on = await gate(BOTH_SOFT, 'on');
    const off = await gate(BOTH_SOFT, 'off');
    expect(off.text).toBe(merge(BOTH_SOFT, OTHER_IMMINENT, 'off').suggestedResponse);
    expect(on.text).toBe(bothWays(off.text));
    expect(on.text).toContain('988');
  });
});

async function pipeline(line: string, flag: 'on' | 'off'): Promise<CrisisDetectionResult> {
  resetCrisisClassifierCache();
  process.env[FLAG] = flag === 'on' ? 'off' : 'on';
  const env = { CRISIS_CLASSIFIER_MODE: 'live', [FLAG]: flag };
  const turn = startTurnCrisis(line, {}, { env, generate: answering(OTHER_IMMINENT) });
  return turn.resolve();
}

describe('CRISIS_CLASSIFIER_OTHER_IMMINENT_911 in the turn pipeline', () => {
  it('on: the turn reads an emergency for them, 911 first; off is main', async () => {
    const on = await pipeline(GARAGE, 'on');
    const off = await pipeline(GARAGE, 'off');
    expect(on.suggestedResponse!.startsWith(CALL_911_FOR_THEM)).toBe(true);
    expect(on.indicators).toContain('third_party_emergency');
    expect(off.suggestedResponse!.startsWith(CALL_911_FOR_THEM)).toBe(false);
    expect(off.indicators).not.toContain('third_party_emergency');
  });
});
