/**
 * Ferni doesn't know how he's built, and says so instead of making it up.
 *
 * Prod call 2026-10-19 (#2223): both searchWeb calls came back "No results",
 * the caller pressed for the cause, and over two minutes Ferni described a
 * "Python layer", "web scrapers", "a JSON payload sent to a private backend"
 * and "a custom API gateway", none of it true, with director notes ("Answer
 * their specific question about the backend service") pushing him further.
 *
 * NO_INVENTED_INTERNALS=on (off by default): INTERNALS_HONESTY in the system
 * prompt (ai-honesty.ts); ASK_NOTE on a press about his errors or systems
 * after a tool failed, RETRACT_NOTE after a reply that named internals no
 * tool result mentioned (turn-request.ts), and on either turn no director
 * note pushing the technical question. "Are you an AI?" stays ai-honesty.ts's.
 *
 * @module agents/personas/no-invented-internals
 */

import { flagOn, type Env } from '../../config/env-flag.js';
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
  /\b(?:what|which|where|why|how|is|are|was|did|does|tell me|explain|describe|walk me through|need|want|give me|show me|spell out)\b[^.?!]*\b(?:errors?|bugs?|glitch\w*|crash\w*|code|systems?|urls?|links?|service|software|architecture|stack|infrastructure|under the hood|behind the scenes|under there|plumbing|logs?|internet|wi-?fi|built|programmed|connected|hooked up|technical(?:ly)?|tech|went wrong|going on|happen\w*|hold ?up|broke\w*|down|failed|fail|(?:does|do|did)(?:n'?t| not)? (?:it|you|that|this)? ?work)\b/i;
/** "Are you an AI / a bot / real?" and "is that your programming?": ai-honesty.ts's path. */
const AI_IDENTITY =
  /\b(?:are you|is this|is that|am i talking to)\b[^.?!]*\b(?:an? ai|a bot|a robot|a machine|a program|a chatbot|real|human|a person|your programming|just code)\b|\bwho (?:made|built|created|programmed) you\b|\bwhat (?:model|ai)\b|\bchat ?gpt\b/i;
/** A tool that didn't do its job, in its own words. */
const FAILED =
  /\b(?:no results?|no_results|not found|found nothing|error|errored|failed|failure|unavailable|paused|timed? ?out|didn'?t work|couldn'?t|could not|unable)\b/i;
/** Letting it go: "never mind", "no worries", "anyway". */
const MOVES_ON =
  /\b(?:never ?mind|forget (?:it|about it)|no worries|no big deal|it'?s fine|that'?s fine|anyway|anyways|moving on|let'?s (?:talk|move|change))\b/i;
/** About Ferni: "your", "you run on", his search by name, or "it"/"that" with nothing of the caller's. */
const YOU =
  /\b(?:your|yours|yourself)\b|\byou(?:'re| are)? (?:\w+ly )?(?:use|using|run|running|built|made|work|working|connect\w*|hit|send|query|go through)\b|\b(?:search\w*|look ?ups?|the tool)\b/i;
const DEICTIC = /\b(?:it|that|this|there)\b/i;
const CALLERS_OWN = /\b(?:my|mine|our|i|i'?m|i'?ve|me)\b/i;
const aboutFerni = (t: string): boolean => YOU.test(t) || (DEICTIC.test(t) && !CALLERS_OWN.test(t));
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
const isUser = (i: Item): boolean => i.type === 'message' && i.role === 'user';

/** Items since the caller's third-last message: the last few turns. */
function recent(items: readonly Item[]): Item[] {
  let seen = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (isUser(items[i]) && ++seen === 3) return items.slice(i);
  }
  return [...items];
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
 * With the flag on, which kind of turn this is. 'ask' fires on the first
 * press after a failure (pushback compounds: don't wait for an invention) and
 * on every press after it. Both need a technical frame, so "our server was
 * great" about dinner never fires: a tool failed in the last few turns, or the
 * caller asked about internals in them; unframed, only "my backend" does.
 */
export function internalsTurn(
  items: readonly Item[],
  said: string,
  env: Env = process.env
): InternalsTurn {
  if (!noInventedInternalsEnabled(env) || !said) return '';
  const window = recent(items);
  const failed = outputs(window).some((o) => o.isError || FAILED.test(o.output ?? ''));
  // Before Ferni's last line: what they asked before this turn.
  const before = window.slice(0, Math.max(0, window.map((i) => i.role).lastIndexOf('assistant')));
  const askedBefore = before.some((i) => isUser(i) && asksAboutInternals(i.textContent ?? ''));
  const pressed = failed || askedBefore;
  // After a press, "you can be straight with me" keeps pressing; "my python class" doesn't.
  const keepsOn =
    askedBefore && /\b(?:you|your)\b/i.test(said) && (TECH.test(said) || PRESS.test(said));
  const asked = !MOVES_ON.test(said) && (asksAboutInternals(said) || keepsOn);
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
