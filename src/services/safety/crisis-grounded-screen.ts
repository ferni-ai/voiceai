/**
 * The direct screening question a grounded release asks
 * (crisis-grounded-release.ts), and the caller's answer to it.
 *
 * Round 3 of #2354 released 40 of 40 new risky lines built only from allowed
 * words with both reads fooled ("After dinner I'll try again."), so word rules
 * cannot prove a release safe. Every release asks SCREEN_QUESTION (Seth,
 * 2026-10-22: "Ask directly, gently"). Code appends it as the reply's last
 * sentence (crisis-gate.ts), so the reply model can neither skip nor reword
 * it. The caller's next turn takes the crisis path with 988 unless it is a
 * clear no to that question as Ferni actually said it, in full and last (an
 * interrupted reply keeps only what played). If Ferni's line before the
 * answer was something else (the caller went quiet and Ferni filled the
 * silence), the question is asked once more; after that, anything but a
 * clear no takes the crisis path.
 *
 * @module CrisisGroundedScreen
 */

import { TransformStream, type ReadableStream } from 'node:stream/web';
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
  "Can I ask you something, and it's okay either way: when you said that, were you thinking about hurting yourself, or about ending your life?";

/** What the screen makes of a caller turn. */
export type ScreenOutcome = 'none' | 'reask' | 'positive';
const RANK: Record<ScreenOutcome, number> = { none: 0, reask: 1, positive: 2 };

/**
 * Per call, after a live release: the released turn, Ferni's line before it,
 * whether the question was asked again, and the last turn judged. In memory,
 * for SCREEN_TTL_MS.
 */
const SCREEN_TTL_MS = 6 * 60 * 60 * 1000;
const SCREEN_MAX = 512;
interface Judged {
  turn: string;
  companion: string;
  outcome: ScreenOutcome;
}
const screens = new Map<
  string,
  { at: number; asked: string; before: string; reasked: boolean; last?: Judged }
>();

/**
 * A clear no is one of a closed set of phrases, never a bag of words: "No, I
 * meant it", "No, I'm not okay" and "Nope, kind of" are not clear. Then a
 * no, then only fixed reassurances or the caller's own event. A question
 * mark, an ellipsis or a hesitation ("um", "uh") is not clear either.
 */
const NO_FILLER = '(?:oh|ha|haha|hah|lol|god|gosh|whoa|wow|hey|man|dude) ';
const NO_CORE =
  '(?:no(?: no)*|nope|nah|never|no way|hell no|god no|of course not|absolutely not|definitely not|not at all|not even close)';
const EVENT = `(?:the |my |our )?(?:${[...EVENTS].join('|')})`;
const NO_TAIL = `(?:no|nope|not at all|i'?m (?:good|fine|okay|ok)|all good|totally fine|i promise|promise|(?:but )?thank(?:s| you) for asking|just ${EVENT}|(?:i )?(?:just )?(?:meant|talking about|excited about) ${EVENT})`;
const CLEAR_NO = new RegExp(`^(?:${NO_FILLER})*${NO_CORE}(?: ${NO_TAIL})*$`);

function clearNo(answer: string): boolean {
  if (/[?¿]|\.\.|…/.test(answer)) return false;
  const words = wordsOf(answer);
  if (!words || words.length === 0 || alwaysHold(answer)) return false;
  const scored = detectCrisis(answer);
  if (scored.severity > 0 || scored.indicators.length > 0) return false;
  return CLEAR_NO.test(words.join(' '));
}

/**
 * Ferni's line ends with SCREEN_QUESTION, in full: not a paraphrase, not "you
 * okay?" (where a bare no means not okay), nothing asked after it, and not
 * cut off by an interruption.
 */
export function askedScreen(companion: string | undefined): boolean {
  return loose(stripSSML(String(companion ?? ''))).endsWith(loose(SCREEN_QUESTION));
}

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
  screens.set(call, { at: now, asked: loose(released.latest), before, reasked: false });
}

/**
 * The screen's verdict on a caller turn after a release:
 * - positive: anything but a clear no to the question as Ferni said it, or
 *   any answer once the question was asked again; the crisis path with 988;
 * - reask: Ferni's line was something else (the caller went quiet), the first
 *   time; the reply asks the question again;
 * - none: no screen open, a clear no, the released turn itself, or a turn
 *   after the screen closed.
 * Both paths of a turn share Ferni's line: the second gets the first's
 * verdict, or a stronger one if its words differ. Positive on anything
 * unexpected.
 */
export function screenAnswer(
  call: string | undefined,
  input: {
    latest: string;
    companion?: string;
    /** All of Ferni's lines since the caller last spoke, when known (a tool follow-up comes last). */
    ferni?: readonly string[];
  },
  now = Date.now()
): ScreenOutcome {
  try {
    const screen = call ? screens.get(call) : undefined;
    if (!screen || now - screen.at > SCREEN_TTL_MS) return 'none';
    const turn = loose(String(input.latest ?? ''));
    const companion = loose(stripSSML(String(input.companion ?? '')));
    // Asked if any line of Ferni's reply ended with the question in full: a tool's follow-up may
    // be the last line (the SDK speaks it after the reply that asked).
    const asked = [input.companion, ...(input.ferni ?? [])].some(askedScreen);
    // The released turn itself, on its other path, even with drifted words: never an answer.
    // A line that answers the question is screened, even one repeating the released words.
    const releasedTurn = turn === screen.asked || (companion !== '' && companion === screen.before);
    if (!turn || (releasedTurn && !asked)) return 'none';
    const judge = (reasked: boolean): ScreenOutcome => {
      if (asked) return clearNo(input.latest) ? 'none' : 'positive';
      return reasked ? 'positive' : 'reask';
    };
    const last = screen.last;
    // The same turn's other path (same words, or the same Ferni line before them): one shared
    // record, never weaker than the first path's verdict, and a stronger one replaces it.
    if (last && (last.turn === turn || (companion !== '' && companion === last.companion))) {
      const again = judge(screen.reasked && last.outcome !== 'reask');
      if (RANK[again] <= RANK[last.outcome]) return last.outcome;
      if (again === 'reask') screen.reasked = true;
      screen.last = { ...last, outcome: again };
      log.info({ outcome: again, asked, path: 'second' }, 'CRISIS_GROUNDED_SCREEN');
      return again;
    }
    // A later turn: judged only while the screen is open (nothing judged yet, or a re-ask).
    if (last && last.outcome !== 'reask') return 'none';
    const outcome = judge(screen.reasked);
    if (outcome === 'reask') screen.reasked = true;
    screen.last = { turn, companion, outcome };
    log.info({ outcome, asked }, 'CRISIS_GROUNDED_SCREEN');
    return outcome;
  } catch {
    return 'positive';
  }
}

/**
 * A positive screen with no crisis words of its own ("I don't know", "kind
 * of", a laugh) gets this in Ferni's reply (Seth, 2026-10-22): a gentle 988
 * offer inside the conversation, Ferni staying itself. Crisis guidance is for
 * answers that carry risk content; the replacement script stays for a plan or
 * intent the classifier reads.
 */
export const SCREEN_GENTLE_OFFER = `[SAFETY - GENTLE OFFER]
You asked whether they were thinking about hurting themselves, and they didn't give a clear no.
1. Stay yourself: warm and unhurried, and keep the conversation going; no alarm and no lecture
2. Once, gently, say you're really glad they're talking with you, and that if things ever get heavy they can call or text 988, any time
3. Don't push for details. If they say more, listen, stay with them, and take it seriously`;

/** The answer carries risk content of its own: a pattern hit or a held word. */
export function screenIdeation(found: CrisisDetectionResult, answer: string): boolean {
  return found.severity > 0 || found.indicators.length > 0 || alwaysHold(answer);
}

/** A positive screen as a crisis reading: guidance with 988, never the replacement script. */
export function withScreenPositive(detection: CrisisDetectionResult): CrisisDetectionResult {
  const merged = applyClassifierVerdict(detection, { risk: 'crisis', subject: 'self' });
  return merged.indicators.includes('grounded_screen_positive')
    ? merged
    : { ...merged, indicators: [...merged.indicators, 'grounded_screen_positive'] };
}

/** A stream chunk's text: a string, or a chat chunk's delta content. */
const chunkText = (chunk: unknown): string => {
  if (typeof chunk === 'string') return chunk;
  const content = (chunk as { delta?: { content?: unknown } } | null)?.delta?.content;
  return typeof content === 'string' ? content : '';
};

/**
 * A reply stream with SCREEN_QUESTION as its last sentence, whatever the model
 * wrote; not added twice when the model already ended on it.
 */
export function withScreenQuestion<T>(reply: ReadableStream<T>): ReadableStream<T | string> {
  let said = '';
  return reply.pipeThrough(
    new TransformStream<T, T | string>({
      transform(chunk, controller) {
        said += chunkText(chunk);
        controller.enqueue(chunk);
      },
      flush(controller) {
        if (!askedScreen(said)) controller.enqueue(` ${SCREEN_QUESTION}`);
      },
    })
  );
}

/** For tests. */
export function resetGroundedScreen(): void {
  screens.clear();
}
