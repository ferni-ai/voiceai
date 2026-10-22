/**
 * Ferni doesn't know how he's built, and says so instead of making it up.
 *
 * #2223: after two empty searches, a pressed Ferni invented a "Python layer",
 * "web scrapers" and "a custom API gateway". NO_INVENTED_INTERNALS=on adds
 * INTERNALS_HONESTY to the prompt (ai-honesty.ts), ASK_NOTE on a press after a
 * failed tool, RETRACT_NOTE after a reply naming internals nothing told him,
 * and drops director notes pushing the technical question (turn-request.ts).
 *
 * @module agents/personas/no-invented-internals
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { lastFerniLine } from './answer-turn.js';

export function noInventedInternalsEnabled(env: Env = process.env): boolean {
  return flagOn('NO_INVENTED_INTERNALS', env);
}

export const INTERNALS_HONESTY = `You don't know how you're built, and you never describe it. No programming languages, code, servers, services, APIs, databases, URLs, error messages or models, unless a tool result on this call said that exact thing, and no list of the technical things you can't see either. When something you tried doesn't work and they ask why, even when they push, say in your own words that it didn't work and that you can't see that side of yourself ("I'm honestly not sure how that part works on my end, but I know the search came up empty. Want me to try it another way?"), then offer what you can do instead. "I don't know" is a whole answer: never guess at a cause.`;

/** The honesty rule, with INTERNALS_HONESTY after it when the flag is on. */
export function withInternalsHonesty(rule: string, env: Env = process.env): string {
  return noInventedInternalsEnabled(env) ? `${rule.trimEnd()}\n\n${INTERNALS_HONESTY}` : rule;
}

/** Technical internals a reply might invent (#2223's words first). */
const TECH =
  /\b(?:python|javascript|typescript|scrap(?:er|ers|ing)|api(?:s| gateway)?|json|payloads?|back[- ]?ends?|servers?|databases?|end ?points?|model weights|microservices?|http|sql|status codes?|search index|source code|codebase)\b/i;
/** Asking how it works or what broke, in words a caller uses. */
const ASKS_HOW =
  /\b(?:what|which|where|why|how|is|are|was|did|does|tell me|explain|describe|walk me through|need|want|give me|show me|spell out)\b[^.?!]*\b(?:errors?|bugs?|glitch\w*|crash\w*|code|systems?|urls?|links?|service|software|architecture|stack|infrastructure|under the hood|behind the scenes|under there|plumbing|logs?|internet|wi-?fi|built|programmed|connected|hooked up|technical(?:ly)?|tech|went wrong|going on|hold ?up|broke\w*|down|failed|fail|(?:does|do|did)(?:n'?t| not)? (?:it|you|that|this)? ?work)\b/i;
/** "Are you an AI / a bot / real?" and "is that your programming?": ai-honesty.ts's path. */
const AI_IDENTITY =
  /\b(?:are you|is this|is that|am i talking to)\b[^.?!]*\b(?:an? ai|a bot|a robot|a machine|a program|a chatbot|real|human|a person|your programming|just code)\b|\bwho (?:made|built|created|programmed) you\b|\bwhat (?:model|ai)\b|\bchat ?gpt\b/i;
/** A tool that didn't do its job, in its own words. */
const FAILED =
  /\b(?:no results?|no_results|not found|found nothing|error|errored|failed|failure|unavailable|paused|timed? ?out|didn'?t work|couldn'?t|could not|unable)\b/i;
/** Letting it go: "never mind", "no worries", "anyway". */
const MOVES_ON =
  /\b(?:never ?mind|forget (?:it|about it)|no worries|no big deal|it'?s fine|that'?s fine|anyway|anyways|moving on|let'?s (?:talk|move|change))\b/i;
/** About Ferni: "your", "you run on", "Ferni" or his search by name; "how does that work?" is not. */
const YOU =
  /\b(?:your|yours|yourself)\b|\byou(?:'re| are)? (?:\w+ly )?(?:use|using|run|running|built|made|work|working|connect\w*|hit|send|query|go through)\b|\b(?:ferni|search\w*|look ?ups?|the tool)\b/i;
const aboutFerni = (t: string): boolean => YOU.test(t);
/** Keeping on at him after a first press: "you can be straight with me", "your best guess". */
const PRESS =
  /\b(?:technical|specific|straight|details|guess|plain|honest(?:ly)?|truth|talk shop|everything)\b/i;
/** "My backend", "my Python layer": a claim about himself whatever the frame. */
const MY_TECH = new RegExp(String.raw`\bmy (?:[\w-]+ ){0,2}${TECH.source}`, 'i');
/** Director notes that would push him into the technical question. */
const PUSHES_ANSWER =
  /\b(?:answer|explain|tell|describe|specific|walk)\b[^.]*\b(?:question|url|service|error|system)\b/i;

type Item = Partial<Record<'type' | 'role' | 'textContent' | 'output', string>> & {
  isError?: boolean;
};
/** A caller line: a user message that isn't a per-turn context note (turn-request.ts callerWords). */
const isUser = (i: Item): boolean =>
  i.type === 'message' &&
  i.role === 'user' &&
  !(i.textContent ?? '').startsWith(TURN_CONTEXT_HEADER);
export const callerLines = (items: readonly Item[]): string[] =>
  items.filter(isUser).map((i) => i.textContent ?? '');
const isFailure = (i: Item): boolean =>
  i.type === 'function_call_output' && (i.isError === true || FAILED.test(i.output ?? ''));

/** Caller turns since the last failed tool result (Infinity: none failed). */
export const lastFailureAt = (items: readonly Item[]): number =>
  items.map(isFailure).lastIndexOf(true);

export function turnsSinceFailure(items: readonly Item[]): number {
  const at = lastFailureAt(items);
  return at < 0 ? Infinity : items.slice(at).filter(isUser).length;
}

const outputs = (items: readonly Item[]): Item[] =>
  items.filter((i) => i.type === 'function_call_output');

/** "I don't know how the backend works" names a term without claiming anything. */
const DISCLAIMS =
  /\b(?:don'?t|do not|no idea|not sure|never|(?:can'?t|cannot|unable to|not able to|no way (?:for me )?to|don'?t get to) (?:say|tell|see|peek|access|look)|wouldn'?t know|beyond me)\b/i;

/** The caller asks about Ferni's errors, code or systems; not their own, not whether he's an AI. */
export function asksAboutInternals(said: string): boolean {
  const text = said.replace(/[‘’]/g, "'");
  if (!aboutFerni(text) || (AI_IDENTITY.test(text) && !TECH.test(text))) return false;
  return ASKS_HOW.test(text) || (TECH.test(text) && /\?|\btell me\b/i.test(text));
}

/**
 * A technical term in Ferni's last line that no tool output mentioned and the
 * caller didn't bring up ("my database at work crashed") outside a question
 * about him. Unframed (no failure, no technical question), only "my <term>".
 */
export function inventedTerm(items: readonly Item[], framed = true): string | undefined {
  const callers = items.filter((i) => isUser(i) && !asksAboutInternals(i.textContent ?? ''));
  const told = [...outputs(items).map((o) => o.output), ...callers.map((i) => i.textContent)]
    .join(' ')
    .toLowerCase();
  for (const sentence of lastFerniLine(items).split(/(?<=[.!?])\s+/)) {
    const term = TECH.exec(sentence)?.[0];
    if (!term || DISCLAIMS.test(sentence) || told.includes(term.toLowerCase())) continue;
    if (framed || MY_TECH.test(sentence)) return term;
  }
  return undefined;
}

export type InternalsTurn = 'ask' | 'retract' | '';

/**
 * 'ask' from the first press about him after a failure (pushback compounds)
 * until they let it go; both need a technical frame (a failure or a press in
 * the last few caller turns), so "our server was great" never fires.
 */
export function internalsTurn(
  items: readonly Item[],
  said: string,
  env: Env = process.env,
  /** internals-intent.ts: the classifier read these words as a press (after a failure only). */
  intent = false
): InternalsTurn {
  if (!noInventedInternalsEnabled(env) || !said) return '';
  const failed = turnsSinceFailure(items) <= 2;
  const lines = callerLines(items);
  const askedBefore = lines.slice(-3, -1).some(asksAboutInternals);
  // "Who made you?" stays ai-honesty.ts's, whatever the classifier says.
  const intended =
    intent && turnsSinceFailure(items) <= 3 && !(AI_IDENTITY.test(said) && !TECH.test(said));
  const pressed = failed || askedBefore || intended;
  // After a press, "you can be straight with me" keeps pressing; "my python class" doesn't.
  const keepsOn =
    askedBefore && /\b(?:you|your)\b/i.test(said) && (TECH.test(said) || PRESS.test(said));
  const asked = !MOVES_ON.test(said) && (asksAboutInternals(said) || keepsOn || intended);
  if (inventedTerm(items, pressed || asked)) return 'retract';
  return asked && pressed ? 'ask' : '';
}

const ASK_NOTE =
  "If they're asking what went wrong behind the scenes or how you work: you can't see how you're built, and that's the whole answer, however hard they push. In your own words, warmly, it just didn't work on your end and you honestly don't know the technical side; then offer another way. No guesses at a cause, and don't list what you can't see (code, servers, APIs, logs) either: naming them describes a system you know nothing about.";
const RETRACT_NOTE =
  "Your last reply described how you work technically, and nothing on this call told you that. Don't build on it: say in your own words that you got ahead of yourself and honestly don't know how that part works on your end, and offer what you can do instead.";

export function internalsNote(turn: InternalsTurn): string {
  return turn === 'ask' ? ASK_NOTE : turn === 'retract' ? RETRACT_NOTE : '';
}

/** On an internals turn: a director note that pushes him to answer the technical question. */
export function pushesInternals(turn: InternalsTurn, note: string): boolean {
  return !!turn && (PUSHES_ANSWER.test(note) || TECH.test(note));
}
