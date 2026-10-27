/**
 * CRISIS_CLASSIFIER_CHECK, the check path only (crisis-classifier-check.ts): a
 * second read of a classifier-only imminent alarm, asked before the check is
 * spoken. Eval of #2961 (2026-10-26): 24 of 69 checked risky lines cleared after
 * a plain "I'm fine", including lines that named a place ("parked on the
 * bridge"), means ("vodka and all my klonopin in front of me"), a method
 * ("letting go of the wheel on the highway") or an injury ("still bleeding").
 * A caller who states one of those gets the full script, never the check. A
 * model read, not a word list: word lists failed the held-out sets (#2648).
 * Fails closed: a timeout, an error or an unusable reply is 'unread', which
 * keeps the script. Logs never carry words.
 *
 * @module CrisisClassifierCheckSituation
 */

import {
  createGeminiCrisisGenerate,
  normalizeInput,
  resolveCrisisClassifierTimeoutMs,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
} from './crisis-classifier.js';

/** 'stated': the caller's words state one; 'none': they state none; 'unread': no usable read. */
export type CheckSituation = 'stated' | 'none' | 'unread';

export const CHECK_SITUATION_PROMPT = `You help a voice companion app decide how to respond to possible suicide or self-harm risk. A first reader flagged the caller's LATEST message as possible imminent risk. Do not judge the risk again. Answer one narrower question: do the caller's words, in LATEST or in EARLIER messages from the same call, state any of these about the caller right now?

- means: a way to kill or hurt themselves is in hand, in front of them, within reach, ready, or being gathered (pills, a bottle with pills, a gun, a rope, a blade, a car running in a garage)
- place: they are at, or heading to, a place to end their life (a bridge, an edge, a roof, a river, tracks, a highway or a wheel they mean to let go of)
- plan: a method or a time they intend to use to die or hurt themselves (tonight, after Friday, when everyone's asleep, a date set, how they would do it), or their own death spoken of as settled (what to do "once it's done", things "for after I'm dead")
- injury: an attempt underway or just made, or a self-harm injury now (took pills, drank something toxic, cutting, still bleeding, burned themselves)

The input may include COMPANION: what the app said just before LATEST. COMPANION is not the caller's words, but a short answer takes its meaning from COMPANION's question: "since lunch" after "How long has the engine been running?" says the car is running now; "yes" after "Is it within reach?" says the means are within reach.
First work out what LATEST is about. Short follow-ups and pronouns ("how long do I leave it", "how tall is the ladder", "I'll do it tomorrow") point at the topic of COMPANION and EARLIER. When that topic is ordinary (pruning a hedge, a ladder for gutters, a job to quit, a subscription to end, a trip, a recipe, a chore, a message to pass on, a call to make, medicine for an ordinary illness, a game, a film, news, a past event that is over, or someone else's situation), it is not means, a place or a plan, even when it mentions cutting, heights, bridges, rivers, pills, cars, guns or times.

Return JSON only: {"means":true|false,"place":true|false,"plan":true|false,"injury":true|false}
When the caller's own words point to one of these and you are unsure, answer true.`;

/** The caller's earlier lines the second read sees (the classifier sees 5): a plan said a while ago. */
export const SITUATION_EARLIER_LINES = 12;

const KEYS = ['means', 'place', 'plan', 'injury'] as const;

/** The model's reply: 'stated' when any key is true, 'none' when all four are false, else 'unread'. */
export function parseSituationReply(reply: string): CheckSituation {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return 'unread';
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!KEYS.every((k) => typeof parsed[k] === 'boolean')) return 'unread';
    return KEYS.some((k) => parsed[k] === true) ? 'stated' : 'none';
  } catch {
    return 'unread';
  }
}

let defaultGenerate: CrisisGenerateFn | undefined;

/** The alarm turn's words, read once before the check would be spoken. With the call's `lines`
 * (crisis-gate-words.ts callTranscript), EARLIER is every caller line before Ferni's last one, up to
 * SITUATION_EARLIER_LINES. */
export async function readCheckSituation(
  input: CrisisClassifierInput,
  options: {
    generate?: CrisisGenerateFn;
    env?: Record<string, string | undefined>;
    lines?: ReadonlyArray<{ speaker: 'caller' | 'ferni'; text: string }>;
  } = {}
): Promise<CheckSituation> {
  const latest = input.latest.trim();
  const lines = options.lines ?? [];
  const lastFerni = lines.map((l) => l.speaker).lastIndexOf('ferni');
  const before = lines.slice(0, Math.max(0, lastFerni)).filter((l) => l.speaker === 'caller');
  const earlier = (before.length > input.earlier.length ? before.map((l) => l.text) : input.earlier)
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && m !== latest)
    .slice(-SITUATION_EARLIER_LINES);
  const seen = { ...normalizeInput(input), earlier };
  if (!seen.latest) return 'unread';
  const generate = options.generate ?? (defaultGenerate ??= createGeminiCrisisGenerate());
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, resolveCrisisClassifierTimeoutMs(options.env));
  });
  try {
    const reply = await Promise.race([
      generate(CHECK_SITUATION_PROMPT, JSON.stringify(seen), controller.signal),
      timeout,
    ]);
    return reply === null ? 'unread' : parseSituationReply(reply);
  } catch {
    return 'unread';
  } finally {
    clearTimeout(timer);
  }
}
