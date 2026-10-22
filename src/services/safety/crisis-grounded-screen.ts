/**
 * The direct screening question a grounded release asks
 * (crisis-grounded-release.ts), and the caller's answer to it.
 *
 * Round 3 of #2354 released 40 of 40 new risky lines built only from allowed
 * words with both reads fooled ("After dinner I'll try again."), so word rules
 * cannot prove a release safe. Every release asks SCREEN_QUESTION (Seth,
 * 2026-10-22: "Ask directly, gently"), and the caller's next turn takes the
 * crisis path with 988 unless it is a clear no to that question as Ferni
 * actually asked it.
 *
 * @module CrisisGroundedScreen
 */

import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  type CrisisDetectionResult,
} from './crisis-guard.js';
import { EVENTS, alwaysHold, wordsOf } from './crisis-release-words.js';

const log = createLogger({ module: 'CrisisGroundedScreen' });

/** Lower case, letters, digits and apostrophes only, single spaces. */
const loose = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

/**
 * The screening question every release carries, asked the way clinicians
 * screen: directly, about suicide and self-harm by name. Asking does not raise
 * risk; a false alarm costs one caring question.
 */
export const SCREEN_QUESTION =
  "can I ask you something, and it's okay either way: when you said that, were you thinking about hurting yourself, or about ending your life?";

/**
 * Per call: the released turn whose reply asked SCREEN_QUESTION, and the
 * caller's answer once it comes. In memory, for SCREEN_TTL_MS.
 */
const SCREEN_TTL_MS = 6 * 60 * 60 * 1000;
const SCREEN_MAX = 512;
const screens = new Map<
  string,
  {
    at: number;
    asked: string;
    /** Ferni's line before the released turn: a path with it is that turn, not an answer. */
    before: string;
    answer?: { turn: string; companion: string; at: number; positive: boolean };
  }
>();

/**
 * A clear no is one of a closed set of phrases, never a bag of words: "No, I
 * meant it" and "No, I'm not okay" are not clear. Fillers first, then a no,
 * then only fixed reassurances or the caller's own event.
 */
const NO_FILLER = '(?:oh|um|uh|ha|haha|hah|lol|god|gosh|whoa|wow|hey|man|dude) ';
const NO_CORE =
  '(?:no(?: no)*|nope|nah|never|no way|hell no|god no|of course not|absolutely not|definitely not|not at all|not even close)';
const NO_TAIL = `(?:no|nope|not at all|i'?m (?:good|fine|okay|ok)|all good|totally fine|i promise|promise|(?:but )?thank(?:s| you) for asking|(?:i )?(?:just )?(?:meant|talking about|excited about) (?:the |my |our )?(?:${[...EVENTS].join('|')}))`;
const CLEAR_NO = new RegExp(`^(?:${NO_FILLER})*${NO_CORE}(?: ${NO_TAIL})*$`);

function clearNo(answer: string): boolean {
  const words = wordsOf(answer);
  if (!words || words.length === 0 || alwaysHold(answer)) return false;
  const scored = detectCrisis(answer);
  if (scored.severity > 0 || scored.indicators.length > 0) return false;
  return CLEAR_NO.test(words.join(' '));
}

/** Ferni's line asked SCREEN_QUESTION itself, not "you okay?" (where a bare no means not okay). */
const askedScreen = (companion: string | undefined): boolean => {
  const said = loose(stripSSML(String(companion ?? '')));
  return said.includes('hurting yourself') && said.includes('ending your life');
};
/** Both paths of one turn land well inside this; a later turn's line comes after Ferni's reply. */
const SAME_TURN_MS = 10_000;

export function noteScreenAsked(
  call: string,
  released: { latest: string; companion?: string },
  now = Date.now()
): void {
  for (const [id, s] of screens) if (now - s.at > SCREEN_TTL_MS) screens.delete(id);
  if (screens.size >= SCREEN_MAX) {
    const oldest = screens.keys().next().value;
    if (oldest !== undefined) screens.delete(oldest);
  }
  const before = loose(stripSSML(String(released.companion ?? '')));
  screens.set(call, { at: now, asked: loose(released.latest), before });
}

/**
 * The caller's first turn after a release, unless it is a clear no to
 * SCREEN_QUESTION as Ferni actually asked it: a positive screen,
 * which takes the crisis path with 988. Both paths of that turn get the same
 * answer; later turns are judged as usual. True on anything unexpected.
 */
export function screenPositive(
  call: string | undefined,
  input: { latest: string; companion?: string },
  now = Date.now()
): boolean {
  try {
    const screen = call ? screens.get(call) : undefined;
    if (!screen || now - screen.at > SCREEN_TTL_MS) return false;
    const turn = loose(String(input.latest ?? ''));
    // The released turn's own other path (its Ferni line never asked); a repeat that answers is screened.
    const companion = loose(stripSSML(String(input.companion ?? '')));
    // The released turn itself, on its other path, even with drifted words: never an answer.
    // A line that answers the question is screened, even one repeating the released words.
    const releasedTurn = turn === screen.asked || (companion !== '' && companion === screen.before);
    if (!turn || (releasedTurn && !askedScreen(input.companion))) return false;
    const fresh = (): boolean => !(askedScreen(input.companion) && clearNo(input.latest));
    const kept = screen.answer;
    if (kept) {
      if (kept.turn === turn) return kept.positive;
      // The turn's other path with different words: fail closed. A later turn: judged as usual.
      const sameTurn =
        (companion !== '' && companion === kept.companion) || now - kept.at < SAME_TURN_MS;
      return sameTurn ? kept.positive || fresh() : false;
    }
    const positive = fresh();
    screen.answer = { turn, companion, at: now, positive };
    log.info({ positive, asked: askedScreen(input.companion) }, 'CRISIS_GROUNDED_SCREEN');
    return positive;
  } catch {
    return true;
  }
}

/** A positive screen as a crisis reading: guidance with 988, never the replacement script. */
export function withScreenPositive(detection: CrisisDetectionResult): CrisisDetectionResult {
  const merged = applyClassifierVerdict(detection, { risk: 'crisis', subject: 'self' });
  return merged.indicators.includes('grounded_screen_positive')
    ? merged
    : { ...merged, indicators: [...merged.indicators, 'grounded_screen_positive'] };
}

/** For tests. */
export function resetGroundedScreen(): void {
  screens.clear();
}
