/**
 * After a goodbye, the call ends. GOODBYE_ENDS_CALL (default on, a kill
 * switch) ends it; CALL_WRAP_UP=on also makes Ferni go quiet meanwhile.
 *
 * Before this, a goodbye that didn't end the call left Ferni talking into the
 * line: a silence remark about 15 s after "bye", a whistle, a hum or a snore
 * (presence-watcher.ts), and no hang-up at all.
 *
 * "Farewell said" is per call. It is set by endCall (call-wrap-up.ts); when
 * the caller says goodbye and Ferni's next reply says his, or Ferni had
 * already said his; or when the caller asks Ferni to hang up ("hang up now"),
 * whatever Ferni answers. Ferni carrying on (a reply that isn't a goodbye)
 * clears it, except after a hang-up ask. With CALL_WRAP_UP on, while it
 * holds, stayQuiet() is true: no silence or away remark
 * (silence-response-blockers.ts, session-state-handler.ts), no early
 * check-in, no presence sound. If the caller then says something that isn't a
 * goodbye ("oh wait, one more thing"), it clears and the call carries on.
 *
 * After a farewell, IDLE_AFTER_GOODBYE_MS of quiet once Ferni's goodbye has
 * finished playing ends the call (the watcher's onIdle; call-wrap-up.ts sends
 * `idle_after_goodbye` and hangs up). The caller speaking in that window holds
 * it. Never on a call with crisis risk (crisis-call-risk.ts): that call stays
 * open until the caller leaves. Without a farewell nothing here runs, so the
 * call's idle behaviour is unchanged.
 *
 * Caller goodbyes are whole words in a closing position: "okay bye", "gotta
 * go, talk soon". "goodbye to my old job" and "say bye to grandma for me" are
 * not. happy-exits.ts (#1046) has a looser GOODBYE regex for its goodbye
 * note; this one decides whether the call ends, so it is stricter.
 *
 * @module agents/shared/call-farewell
 */
import { voice } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { isSessionClosing } from './session-closing-tracker.js';
import { farewellRisk, stripWarmSymbols } from './farewell-risk.js';

const log = createLogger({ module: 'call-farewell' });

/**
 * Quiet after both goodbyes (Ferni's finished playing) before the call ends:
 * time to say "wait", short enough that the caller isn't left on the line.
 */
export const IDLE_AFTER_GOODBYE_MS = 4_000;

const farewells = new Set<string>();
/** Each watched call's reset, run when it reopens (reopenFarewell). */
const resets = new Map<string, (line?: string) => void>();
const sessionIds = new WeakMap<object, string>();

export function markFarewell(
  sessionId: string,
  by: 'end_call' | 'goodbyes' | 'hang_up_asked'
): void {
  if (farewells.has(sessionId)) return;
  farewells.add(sessionId);
  log.info({ sessionId, by }, 'CALL_WRAP_UP farewell said');
}

export function farewellSaid(sessionId: string): boolean {
  return farewells.has(sessionId);
}

export function clearFarewell(sessionId: string): void {
  farewells.delete(sessionId);
}

/**
 * The call reopened after both goodbyes (wrap-up-window.ts): the farewell is
 * cleared and both earlier goodbyes no longer count. Only a FRESH caller
 * goodbye and a NEW one from Ferni end the call again (#2523: a risky line the
 * word check missed, read as none, was then ended by Ferni's "Okay. Bye, take
 * care."). `line` is the reopening turn's STT final when that turn's
 * conversation item hasn't arrived yet: the item follows, and is never that
 * fresh goodbye.
 */
export function reopenFarewell(sessionId: string, line?: string): void {
  farewells.delete(sessionId);
  resets.get(sessionId)?.(line);
}

/** Words only, for telling one transcript of a line from another. */
const plainWords = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** With CALL_WRAP_UP on, both sides have said goodbye on this call. */
export function goodbyesSaid(sessionId: string, env: Env = process.env): boolean {
  return flagOn('CALL_WRAP_UP', env) && farewells.has(sessionId);
}

/**
 * Nothing should speak or play into this call: it is closing, or both sides
 * have said goodbye. With CALL_WRAP_UP off this is exactly isSessionClosing.
 */
export function stayQuiet(sessionId: string, env: Env = process.env): boolean {
  return isSessionClosing(sessionId) || goodbyesSaid(sessionId, env);
}

/** stayQuiet for a session object the farewell watcher is attached to. */
export function stayQuietOn(session: object, env: Env = process.env): boolean {
  const sessionId = sessionIds.get(session);
  return sessionId !== undefined && stayQuiet(sessionId, env);
}

/**
 * Caller goodbyes are matched on words, not one big regex. The regex this
 * replaced nested overlapping alternatives under `*` ("thank you" matched two
 * ways, "bye bye" three), so a turn like "thank you thank you ... x" took
 * exponential time on a live transcript. Here every check is a linear pass
 * over at most MAX_CALLER_CHARS of text.
 */
export const MAX_CALLER_CHARS = 200;
const MAX_FERNI_CHARS = 300;

/** Every way to fill a phrase template: [["see"], ["ya", "you"]] -> "see ya", "see you". */
function expand(...slots: string[][]): string[] {
  return slots.reduce<string[]>(
    (acc, options) => acc.flatMap((head) => options.map((o) => (head ? `${head} ${o}` : o))),
    ['']
  );
}

const THANKS = expand(['thank', 'thanks', 'thank you', 'thanks you'], ['', 'so much']).map((p) =>
  p.trim()
);
const GOOD_TIME = expand(
  ['have a'],
  ['good', 'great', 'nice'],
  ['one', 'night', 'day', 'evening', 'weekend']
);
/** Words that may lead into a goodbye: "okay so, thanks, bye", "I said hang up". */
const LEADS = new Set([
  ...['ok', 'okay', 'alright', 'all right', 'well', 'so', 'anyway', 'yeah', 'yep', 'cool'],
  ...['great', 'perfect', 'right', 'just', 'please', 'hey', 'i said', 'go ahead and'],
  ...["i'll", 'ill', 'i will'],
  ...THANKS,
]);
/**
 * An ask to end the call: "hang up", "you need to end the call". Ends it
 * whatever Ferni answers. "you ..." only leads into these, never a goodbye:
 * "you gotta go" is not the caller leaving.
 */
const HANG_UPS = new Set(
  expand(['', 'you', 'you can', 'you need to', 'you have to'], ['hang up', 'end the call']).map(
    (p) => p.trim()
  )
);
/** A goodbye on its own. */
const CLOSERS = new Set([
  ...['bye', 'bye bye', 'byebye', 'goodbye', 'good night', 'goodnight', 'night night', 'later'],
  ...expand(['see'], ['ya', 'you'], ['', 'later', 'soon', 'tomorrow', 'around', 'next time']).map(
    (p) => p.trim()
  ),
  ...expand(['talk', 'talk to you'], ['later', 'soon', 'tomorrow']),
  ...['catch you later', 'take care', 'signing off', "i'm off", 'im off'],
  ...["i'll let you go", 'ill let you go'],
  ...GOOD_TIME,
  ...expand(
    ['i'],
    ['gotta', 'got to', 'have to', 'need to', 'should'],
    ['go', 'run', 'get going', 'head out', 'hop off']
  ),
  ...expand(['gotta', 'got to'], ['go', 'run', 'get going']),
  ...HANG_UPS,
]);
/** Words that may trail a goodbye: "bye now", "talk soon, ferni". */
const TAILS = new Set([
  'now',
  'then',
  'ferni',
  'friend',
  'buddy',
  'bro',
  'man',
  'for now',
  'right now',
  'please',
  'the phone',
  'bye',
  'bye bye',
  'byebye',
]);
/** A clause that may follow a goodbye without undoing it ("bye, thanks", "bye, love you"). */
const AFTERWORDS = new Set([
  ...THANKS,
  ...['ok', 'okay', 'alright', 'love you', 'you too', 'ferni', 'take care'],
  ...['bro', 'man', 'buddy', 'friend', 'dude'],
  ...GOOD_TIME,
]);
/** Longest phrase in any set, in words ("you need to end the call"). */
const MAX_PHRASE_WORDS = 6;

/** The longest phrase from `set` starting at word `at`, as a word count (0 if none). */
function phraseAt(words: readonly string[], at: number, set: ReadonlySet<string>): number {
  for (let len = Math.min(MAX_PHRASE_WORDS, words.length - at); len > 0; len--) {
    if (set.has(words.slice(at, at + len).join(' '))) return len;
  }
  return 0;
}

/** True when words[from..] is made only of phrases from `set`. */
function onlyPhrases(words: readonly string[], from: number, set: ReadonlySet<string>): boolean {
  for (let i = from; i < words.length;) {
    const len = phraseAt(words, i, set);
    if (len === 0) return false;
    i += len;
  }
  return true;
}

/** A clause that is a goodbye and nothing else: leads, one goodbye, tails. */
function closingClause(words: readonly string[], closers: ReadonlySet<string>): boolean {
  // The goodbye may start after any run of leads: "I'll let you go" is a goodbye that
  // starts with the lead "i'll", "okay, I'll talk to you later" one after it.
  for (let i = 0, lead = 0; i < words.length; i += lead) {
    // Try each goodbye length here: "bye bye now" is "bye bye" + "now" or "bye" + "bye now".
    for (let len = Math.min(MAX_PHRASE_WORDS, words.length - i); len > 0; len--) {
      if (closers.has(words.slice(i, i + len).join(' ')) && onlyPhrases(words, i + len, TAILS)) {
        return true;
      }
    }
    lead = phraseAt(words, i, LEADS);
    if (lead === 0) return false;
  }
  return false;
}

function clauseWords(text: string): string[][] {
  // Accents folded ("adiós" is "adios"); only warm symbols dropped ("bye 🙂", "bye :)").
  // Any other emoji stays a word no goodbye matches ("bye 😢"); letters of any script
  // stay, so a line in another script never matches a goodbye here.
  let t = stripWarmSymbols(text)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’]/g, "'");
  if (t.length > MAX_CALLER_CHARS) {
    // Keep the end, where a goodbye is, and drop the word the cut landed in.
    t = t.slice(-MAX_CALLER_CHARS);
    t = t.slice(t.search(/[\s.!?,;:]/) + 1);
  }
  return t
    .split(/[.!?,;:]/)
    .map((c) => c.split(/[\s-]/).filter(Boolean))
    .filter((words) => words.length > 0);
}

/** The last thing said (afterwords like "thanks" aside) is a clause from `closers` on its own. */
function endsWith(text: string, closers: ReadonlySet<string>): boolean {
  if (text.trim().endsWith('?')) return false; // "bye?" is a question, not a goodbye
  const parts = clauseWords(text);
  for (let i = parts.length - 1; i >= 0; i--) {
    const words = parts[i] ?? [];
    if (closingClause(words, closers)) return true;
    if (!onlyPhrases(words, 0, AFTERWORDS)) return false;
  }
  return false;
}

/** The caller is ending the call: their turn ends on a goodbye or a "hang up". */
export function callerSaysGoodbye(text: string): boolean {
  return endsWith(text, CLOSERS);
}

/** Pleasantries that fit a goodbye on their own: "thanks", "you too", "love you", "night". */
const SIGN_OFFS = new Set([
  ...AFTERWORDS,
  ...[
    'same to you',
    'you as well',
    'night',
    'all right',
    'yeah',
    'yep',
    'cool',
    'great',
    'perfect',
    // Goodnights, a day done, and Spanish ("adiós" is accent-folded, clauseWords)
    ...expand(['sleep'], ['well', 'tight']),
    'sweet dreams',
    ...expand(["i'm", 'im', 'i am'], ['done for'], ['today', 'tonight', 'the day', 'now']),
    ...['gracias', 'muchas gracias', 'adios', 'ciao', 'cheers'],
  ],
]);

/**
 * The caller is signing off: EVERY clause is a goodbye or a pleasantry that
 * fits one ("thanks", "thank you", "you too", "love you", "same to you",
 * "night"), and nothing in the line carries risk (farewell-risk.ts). "I won't
 * be here tomorrow. Bye." ends on a goodbye, but it is not a sign-off. After
 * `conversation_end` only a sign-off leaves the call ending (wrap-up-window.ts).
 */
export function callerSignsOff(text: string): boolean {
  if (text.length > MAX_CALLER_CHARS || text.trim().endsWith('?')) return false;
  const parts = clauseWords(text);
  return (
    parts.length > 0 &&
    parts.every((words) => closingClause(words, CLOSERS) || onlyPhrases(words, 0, SIGN_OFFS)) &&
    !farewellRisk(text)
  );
}

/** The caller asks Ferni to end the call: "hang up now", "you can end the call". */
export function callerAsksToHangUp(text: string): boolean {
  return endsWith(text, HANG_UPS);
}

/**
 * Leaving, which the goodbye words miss: "I should probably head out". Only at
 * the end of a clause or before "now"/"soon": "I need to go back to the
 * hospital after work tonight" and "I have to run errands all weekend" are
 * plans mid-story, not a goodbye (first calls, dev 2026-10-18).
 */
export const LEAVING =
  /\bi (?:should|need to|have to|gotta|better) (?:probably |really |just )?(?:go|get going|head (?:out|off)|let you go|get back|run|hop off)(?=\s*(?:$|[.,!?;:]|(?:now|soon|right now|for now|in a (?:bit|minute|sec|second|few))\b))/i;

/** They are ending the call: a goodbye on its own (callerSaysGoodbye), or leaving. */
export function leavingNow(said: string): boolean {
  return callerSaysGoodbye(said) || LEAVING.test(said);
}

const FERNI_GOODBYE =
  /\b(?:bye|goodbye|good ?night|take care|talk (?:to you )?(?:soon|later|tomorrow)|see you (?:soon|later|tomorrow|next time|then|around)|catch you later|have (?:a|an) (?:good|great|nice|lovely|wonderful|fun) (?:one|night|day|evening|weekend|time|dinner|trip)|go (?:enjoy|have fun))\b/i;

/** Ferni's reply says goodbye and doesn't end on a question. */
export function ferniSaysGoodbye(text: string): boolean {
  const t = text.trim();
  return !t.endsWith('?') && FERNI_GOODBYE.test(t.slice(-MAX_FERNI_CHARS));
}

interface ItemEvent {
  item?: { role?: string; textContent?: string };
}
interface StateEvent {
  newState?: string;
}

/** The session events the watcher uses, as an EventEmitter-shaped session. */
interface FarewellSession {
  on: (event: string, fn: (ev: never) => void) => unknown;
  off: (event: string, fn: (ev: never) => void) => unknown;
}

const EV = voice.AgentSessionEventTypes;

/**
 * Watches a call for the two goodbyes and, after them, ends it once
 * IDLE_AFTER_GOODBYE_MS pass with neither side speaking. Returns the
 * cleanup (also run when the session closes).
 */
export function watchFarewell(
  agentSession: object,
  opts: {
    sessionId: string;
    onIdle: () => void;
    idleMs?: number;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
    /** Crisis risk on this call: never end it then (default crisis-call-risk.ts). */
    crisis?: () => boolean;
  }
): () => void {
  const { sessionId } = opts;
  const session = agentSession as FarewellSession;
  if (sessionIds.has(agentSession)) return () => {};
  const setT = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  sessionIds.set(session, sessionId);
  const crisis = opts.crisis ?? (() => crisisRiskThisCall(sessionId));
  let callerSaidBye = false;
  let ferniSaidBye = false;
  let hangUpAsked = false;
  /**
   * The reopening turn's STT final, carried until the caller's next
   * conversation item: that item is the turn's own when it contains the line,
   * however late LiveKit adds it (after the turn's processing and the reply's
   * scheduling, seconds later). Any other item is the caller's next turn and
   * ends the carry. No clock: a timer let a late item through (#2532 verify).
   */
  let reopenedBy: string | null = null;
  let agent = 'initializing';
  let user = 'listening';
  let timer: unknown = null;

  const cancel = (): void => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const arm = (): void => {
    cancel();
    if (!farewellSaid(sessionId) || isSessionClosing(sessionId)) return;
    if (agent !== 'listening' || user === 'speaking') return;
    timer = setT(() => {
      timer = null;
      if (!farewellSaid(sessionId) || isSessionClosing(sessionId)) return;
      if (crisis()) {
        log.info({ sessionId }, 'GOODBYE_END_HELD crisis risk on this call; it stays open');
        return;
      }
      log.info(
        { sessionId, hangUpAsked },
        'GOODBYE_ENDS_CALL quiet after goodbye; ending the call'
      );
      opts.onIdle();
    }, opts.idleMs ?? IDLE_AFTER_GOODBYE_MS);
  };

  const onCaller = (text: string): void => {
    // The reopening turn's own item is not a fresh goodbye; the first item ends the carry
    const line = reopenedBy;
    reopenedBy = null;
    if (line && ` ${plainWords(text)} `.includes(` ${line} `)) return;
    // A goodbye carrying risk ("I won't be here tomorrow. Bye.") is never one: it carries on
    const risky = farewellRisk(text);
    callerSaidBye = !risky && callerSaysGoodbye(text);
    if (isSessionClosing(sessionId)) return;
    if (callerSaidBye) {
      hangUpAsked = hangUpAsked || callerAsksToHangUp(text);
      if (hangUpAsked) markFarewell(sessionId, 'hang_up_asked');
      else if (ferniSaidBye) markFarewell(sessionId, 'goodbyes'); // his came first
      arm();
      return;
    }
    if (farewellSaid(sessionId)) log.info({ sessionId }, 'CALL_WRAP_UP caller carried on');
    hangUpAsked = false;
    clearFarewell(sessionId);
    cancel();
  };
  const onFerni = (text: string): void => {
    ferniSaidBye = ferniSaysGoodbye(text);
    if (callerSaidBye && ferniSaidBye) {
      markFarewell(sessionId, 'goodbyes');
      arm();
    } else if (!ferniSaidBye && !hangUpAsked && farewellSaid(sessionId)) {
      log.info({ sessionId }, 'CALL_WRAP_UP Ferni carried on');
      clearFarewell(sessionId);
      cancel();
    }
  };
  const onItem = ({ item }: ItemEvent): void => {
    if (!item?.textContent) return; // only messages carry text
    if (item.role === 'user') onCaller(item.textContent);
    else if (item.role === 'assistant') onFerni(item.textContent);
  };
  const onAgent = (ev: StateEvent): void => {
    agent = ev.newState ?? agent;
    arm();
  };
  const onUser = (ev: StateEvent): void => {
    user = ev.newState ?? user;
    arm(); // cancels while they speak
  };

  const stop = (): void => {
    cancel();
    clearFarewell(sessionId);
    resets.delete(sessionId);
    sessionIds.delete(agentSession);
    session.off(EV.ConversationItemAdded, onItem);
    session.off(EV.AgentStateChanged, onAgent);
    session.off(EV.UserStateChanged, onUser);
    session.off(EV.Close, stop);
  };
  resets.set(sessionId, (line) => {
    callerSaidBye = ferniSaidBye = hangUpAsked = false;
    reopenedBy = line ? plainWords(line) || null : null;
  });
  session.on(EV.ConversationItemAdded, onItem);
  session.on(EV.AgentStateChanged, onAgent);
  session.on(EV.UserStateChanged, onUser);
  session.on(EV.Close, stop);
  return stop;
}
