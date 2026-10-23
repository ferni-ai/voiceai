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
 * clear no takes the crisis path. The caller's turn after the answer is
 * watched once (#2511): a no taken back or a yes after the gentle offer takes
 * the crisis path too.
 *
 * @module CrisisGroundedScreen
 */

import { ReadableStream, TransformStream } from 'node:stream/web';
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
  "Can I ask you something, and it's okay either way: have you been having thoughts of hurting yourself, or of ending your life?";

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
  /** Judged as the one caller turn after the answer (#2511). */
  watch?: boolean;
}
const screens = new Map<
  string,
  { at: number; asked: string; before: string; reasked: boolean; watched: boolean; last?: Judged }
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
  if (/^\W*oh,? no\W*$/i.test(answer)) return false; // dismay, not an answer
  if (/[?¿]|\.\.|…/.test(answer)) return false;
  const words = wordsOf(answer);
  if (!words || words.length === 0 || alwaysHold(answer)) return false;
  const scored = detectCrisis(answer);
  if (scored.severity > 0 || scored.indicators.length > 0) return false;
  return CLEAR_NO.test(words.join(' '));
}

/**
 * The caller's turn after the answer, judged once (#2511): a no taken back or a yes after the
 * gentle offer. Not "anything but a clear no": a release follows an ordinary turn, so the next
 * turn is usually ordinary ("Pie, obviously.") and would get 988. Positive, whatever Ferni
 * said between, on a take-back anywhere in the turn (the caller's later words merge into one
 * turn: "Okay. Actually, yes, I have."):
 * - "actually" with a yes or not knowing ("Actually... I don't know.");
 * - an honesty marker with a yes, not knowing or a bad stretch ("It's been really bad, honestly.");
 * - owning the no ("I lied", "I said no but…", "I didn't want to say it");
 * - steering away from the question ("Can we not talk about that.");
 * - a no that trails off ("not really no… I mean…").
 * A bare yes ("Yeah.", "Sometimes, maybe.") counts only when Ferni asked nothing since, so it
 * can't be answering Ferni's own question ("Want me to text him?").
 */
const AFFIRM =
  "(?:yes|yeah|yep|yup|ya|mhm|uh huh|mm hmm|mm hm|i have|i do|i am|i'?ve been|i did|sometimes|kind of|kinda|sort of|a little|a bit|maybe|i guess|i think so|i mean yeah|more than)";
const UNSURE = "(?:i don'?t know|i do not know|idk|dunno|not sure|i'?m not sure|hard to say)";
const BAD =
  "(?:it'?s been|it has been|things have been|i'?ve been|been) (?:really |pretty |so |kind of |kinda )?(?:bad|hard|rough|awful|terrible|dark|heavy|not good|not great|struggling)";
const HONEST =
  "(?:honestly|truthfully|to be honest|tbh|ngl|not gonna lie|if i'?m honest|in all honesty)";
const TAKES_BACK = new RegExp(
  [
    `(?:^| )actually (?:${AFFIRM}|${UNSURE})\\b`,
    `(?:^| )${HONEST}\\b.*(?:^| )(?:${AFFIRM}|${UNSURE}|${BAD})\\b`,
    `(?:^| )(?:${AFFIRM}|${UNSURE}|${BAD})\\b.*(?:^| )${HONEST}\\b`,
    "(?:^| )(?:i lied|i was lying|i wasn'?t (?:being )?(?:honest|truthful)|i take (?:that|it) back|i said no (?:but|because)|i shouldn'?t have said no|that'?s not (?:totally |entirely |really )?true|i didn'?t want to (?:say|tell|admit|worry|scare|upset))\\b",
    "(?:^| )(?:can we not (?:talk|get into)|i don'?t want to (?:talk|get into)|i'?d rather not (?:talk|say|get into)|let'?s not (?:talk|go there|get into)|change the subject|drop it|talk about something else)\\b",
    `^(?:${NO_FILLER}|um |uh |well )*(?:no|nope|nah|not really)(?: no| nope| really)*(?: (?:i mean|but|although|except|well|kind of|sort of|maybe|${UNSURE}))+$`,
  ].join('|')
);
const AFFIRMS = new RegExp(`^(?:${NO_FILLER}|um |uh |well |so |i mean )*${AFFIRM}\\b`);

function takesBack(answer: string, ferni: readonly string[]): boolean {
  const found = detectCrisis(answer);
  if (found.severity > 0 || found.indicators.length > 0 || alwaysHold(answer)) return true;
  const words = loose(answer);
  if (TAKES_BACK.test(words)) return true;
  return AFFIRMS.test(words) && ferni.every((line) => !/[?¿]/.test(line));
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
  screens.set(call, {
    at: now,
    asked: loose(released.latest),
    before,
    reasked: false,
    watched: false,
  });
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
    // Keyed on Ferni's last recorded line: the gate passes its lines without acknowledgements,
    // as the reply recorder (the pipeline's lastAgentResponse) keeps them.
    const keyLine = input.ferni?.length ? input.ferni[input.ferni.length - 1] : input.companion;
    const companion = loose(stripSSML(String(keyLine ?? '')));
    // Asked if a line of Ferni's reply ended with the question in full and nothing Ferni said
    // after it asked anything else: a tool's follow-up may come last (the SDK speaks it after).
    const lines = input.ferni?.length ? input.ferni : [input.companion ?? ''];
    const at = lines.map((line) => askedScreen(line)).lastIndexOf(true);
    const asked = at >= 0 && lines.slice(at + 1).every((line) => !line.includes('?'));
    // The released turn itself, on its other path, even with drifted words: never an answer.
    // A line that answers the question is screened, even one repeating the released words.
    const releasedTurn = turn === screen.asked || (companion !== '' && companion === screen.before);
    if (!turn || (releasedTurn && !asked)) return 'none';
    const judge = (reasked: boolean, watch = false): ScreenOutcome => {
      if (watch) return takesBack(input.latest, lines) ? 'positive' : 'none';
      if (asked) return clearNo(input.latest) ? 'none' : 'positive';
      return reasked ? 'positive' : 'reask';
    };
    const last = screen.last;
    // The same words after the screen closed: the turn already judged, on whichever path.
    if (last && last.turn === turn && last.outcome !== 'reask') return last.outcome;
    // The same turn's other path shares Ferni's line before it: one shared record, never weaker
    // than the first path's verdict, and a stronger one replaces it. Words alone never make a
    // turn the same one: a caller may repeat "No." after a re-ask.
    if (last && companion !== '' && companion === last.companion) {
      const again = judge(screen.reasked && last.outcome !== 'reask', last.watch);
      if (RANK[again] <= RANK[last.outcome]) return last.outcome;
      if (again === 'reask') screen.reasked = true;
      screen.last = { ...last, outcome: again };
      log.info({ outcome: again, asked, path: 'second' }, 'CRISIS_GROUNDED_SCREEN');
      return again;
    }
    // The caller's next turn after the answer is watched once (#2511), then the screen closes.
    if (last && last.outcome !== 'reask') {
      if (screen.watched) return 'none';
      screen.watched = true;
      const outcome = judge(false, true);
      screen.last = { turn, companion, outcome, watch: true };
      log.info({ outcome, asked, watch: true }, 'CRISIS_GROUNDED_SCREEN');
      return outcome;
    }
    // A turn while the screen is open: nothing judged yet, or a re-ask.
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
 * An unclear answer ("I don't know", a laugh, a hesitant no) gets this in
 * Ferni's reply (Seth, 2026-10-22): a gentle 988 offer inside the
 * conversation, Ferni staying itself. A yes, or risk content, gets crisis
 * guidance; the replacement script stays for a plan or intent the classifier
 * reads. The classifier can only make it stronger, never gentler.
 */
export const SCREEN_GENTLE_OFFER = `[SAFETY - GENTLE OFFER]
You asked whether they were thinking about hurting themselves, and they didn't give a clear no.
1. Stay yourself: warm and unhurried, and keep the conversation going; no alarm and no lecture
2. Once, gently, say you're really glad they're talking with you, and that if things ever get heavy they can call or text 988, any time
3. Don't push for details. If they say more, listen, stay with them, and take it seriously`;

/**
 * Unclear, not a yes: not knowing, a laugh, a question back, hesitation, a
 * hesitant no ("No?", "Um, no.", "No... I'm fine."). A closed set: anything
 * else that is not a clear no ("yeah", "kind of", "maybe", "No, I meant it")
 * is a yes, or a no taken back.
 */
const UNCLEAR_FILLER = '(?:(?:oh|um|uh|hmm|ha|haha|lol|well) )*';
const UNCLEAR = new RegExp(
  // "uh huh" and "mm hmm" are yeses; "I guess" is unclear only after a no.
  `^(?!.*\\b(?:uh huh|mm hmm|mm hm|mhm)\\b)${UNCLEAR_FILLER}(?:` +
    "(?:i (?:don'?t|do not) know|idk|dunno|not sure|i'?m not sure|hard to say|haha|ha|lol|hmm+|um+|uh+|what|huh|sorry|wait what)(?: (?:really|why|what do you mean))*" +
    "|(?:no|nope|nah|not really)(?: (?:i'?m (?:fine|good|okay|ok)|i guess|really))*" +
    ')$'
);

/**
 * The answer is ideation, not merely unclear: risk content of its own (a
 * pattern hit or a held word), or any answer outside the closed unclear set.
 * Ideation gets crisis guidance in Ferni's own reply; unclear gets the gentle offer.
 */
export function screenIdeation(found: CrisisDetectionResult, answer: string): boolean {
  if (found.severity > 0 || found.indicators.length > 0 || alwaysHold(answer)) return true;
  return !UNCLEAR.test((wordsOf(answer) ?? []).join(' ')); // NFKC: "…" reads as "..."
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
        // Skipped only when the model's own text ends with the exact canonical question.
        if (!said.trimEnd().endsWith(SCREEN_QUESTION)) controller.enqueue(` ${SCREEN_QUESTION}`);
      },
    })
  );
}

/** The reply with the question last, or the question alone when the model gave nothing. */
export function screenReply<T>(reply: ReadableStream<T> | null): ReadableStream<T | string> {
  if (reply) return withScreenQuestion(reply);
  return new ReadableStream<T | string>({
    start(controller) {
      controller.enqueue(SCREEN_QUESTION);
      controller.close();
    },
  });
}

/** For tests. */
export function resetGroundedScreen(): void {
  screens.clear();
}
