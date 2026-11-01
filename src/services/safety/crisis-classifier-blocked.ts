/**
 * CRISIS_CLASSIFIER_BLOCKED_SIGNAL (off by default): a crisis read the model refused to make is a
 * signal, never a quiet "none".
 *
 * The provider hard-blocks some caller words before the model reads them (PROHIBITED_CONTENT,
 * most often a child describing sexual abuse; safety settings cannot lift it). The classifier
 * then had only empty text, the same as "Gemini not configured", so the turn read nothing and
 * the caller got an ordinary reply (L8 recall audit, 2026-11-01). With the flag on:
 *
 * - the model call returns BLOCKED_REPLY instead of '' (it parses to no verdict, as before);
 * - the classifier run notes the turn (watchBlocked) by its call and words;
 * - a turn the patterns read as nothing, whose read was blocked, gets a gentle safety check-in,
 *   or child-safety care when the caller sounds under 18 or their words mention touching,
 *   sexual acts or abuse: not their fault, a safe adult, Childhelp, 911 if in danger now, and
 *   nothing from the call is kept (sexual-topic-hold.ts).
 *
 * Only adds: it never runs on a turn the patterns already read, and never replaces a verdict.
 * Logs counts only, never the words.
 *
 * @module CrisisClassifierBlocked
 */

import { flagOn } from '../../config/env-flag.js';
import { ageSignal, likelyMinor, statesUnder18 } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { holdForSexualTopic } from '../../utils/sexual-topic-hold.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

const log = createLogger({ module: 'CrisisClassifierBlocked' });

type Env = Record<string, string | undefined>;

const blockedSignalOn = (env: Env = process.env): boolean =>
  flagOn('CRISIS_CLASSIFIER_BLOCKED_SIGNAL', env);

/** What the model call returns, with the flag on, when the provider blocked the read. */
export const BLOCKED_REPLY = '{"blocked":true}';

/** The parts of a model response that say it was blocked. */
export interface BlockedResponse {
  promptFeedback?: { blockReason?: unknown };
  candidates?: Array<{ finishReason?: unknown }>;
}

/** Why a response was blocked, or null: the prompt's block reason, or a blocking finish. */
export function blockReasonOf(response: BlockedResponse): string | null {
  const prompt = response.promptFeedback?.blockReason;
  if (typeof prompt === 'string' && prompt && prompt !== 'BLOCKED_REASON_UNSPECIFIED') {
    return prompt;
  }
  const finish = response.candidates?.[0]?.finishReason;
  return typeof finish === 'string' && /^(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII)$/.test(finish)
    ? finish
    : null;
}

/** With the flag on, BLOCKED_REPLY for a blocked response: a refused read is never '' (not configured). */
export function blockedReply(response: BlockedResponse, env: Env = process.env): string | null {
  return blockedSignalOn(env) && blockReasonOf(response) ? BLOCKED_REPLY : null;
}

/** Turns whose read was blocked, by call: each turn's words, lower-cased. 6 h, like a call. */
const TTL_MS = 6 * 60 * 60 * 1000;
const blocked = new Map<string, { at: number; turns: Set<string> }>();
const turnOf = (latest: string): string => latest.trim().toLowerCase();

/** The classifier run's model call, noting a blocked read of this turn for the turn pipeline. */
export function watchBlocked(
  generate: CrisisGenerateFn,
  call: string | undefined,
  latest: string,
  env: Env = process.env
): CrisisGenerateFn {
  if (!call || !blockedSignalOn(env)) return generate;
  return async (prompt, content, signal) => {
    const reply = await generate(prompt, content, signal);
    if (reply === BLOCKED_REPLY) {
      const now = Date.now();
      for (const [id, entry] of blocked) if (now - entry.at > TTL_MS) blocked.delete(id);
      const entry = blocked.get(call) ?? { at: now, turns: new Set<string>() };
      entry.at = now;
      entry.turns.add(turnOf(latest));
      blocked.set(call, entry);
    }
    return reply;
  };
}

/** Whether this turn's crisis read was blocked. */
function readWasBlocked(call: string | undefined, latest: string): boolean {
  return !!call && !!blocked.get(call)?.turns.has(turnOf(latest));
}

/** Touching, sexual acts, abuse or coercion in the caller's own words. */
const CHILD_HARM_WORDS =
  /\b(touch(?:es|ed|ing)? me|touch(?:es|ed|ing)? my|makes? me do|made me do|does things to me|did things to me|sexual(?:ly)?|molest\w*|rap(?:e|ed|es|ing)|abus(?:e|ed|es|ing)|private parts|send (?:him|her|them) (?:pictures|pics|photos|nudes)|nudes|in my bed|into my room)\b/i;

const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];

export const BLOCKED_SAFETY_CHECK = `[SAFETY - SOFT CHECK]
A safety read of the caller's last words could not be made. Read them in the context of the conversation:
1. Stay with them, and check in once, plainly and warmly ("are you okay? are you safe right now?"), then follow their lead
2. If they say someone is hurting them, ask whether they are safe right now; if they are in danger right now, they can call ${EMERGENCY_NUMBER}
3. If they say anything about hurting themselves or not wanting to be here, take it seriously and offer the 988 Suicide & Crisis Lifeline`;

export const CHILD_SAFETY_CARE = `[SAFETY - CHILD SAFETY]
The caller may be a child, or may be telling you that someone is touching or hurting them. Answer with care:
1. Thank them for telling you. Say plainly that it is not their fault and they are not in trouble
2. Ask whether they are safe right now. If they are in danger right now, they can call ${EMERGENCY_NUMBER}
3. Gently encourage them to tell a safe adult they trust, like a parent who is not involved, a teacher or a school counselor
4. Offer the ${CHILDHELP.name}: call or text ${CHILDHELP.phone}, any time
5. Do not ask for details of what happened, and do not promise to keep it a secret
6. If they say anything about hurting themselves, also offer the 988 Suicide & Crisis Lifeline`;

/**
 * The turn's guidance when its read was blocked and the patterns read nothing, or null. Child-
 * safety care, and the call's memory held, when MINOR_CARE has an under-18 signal or the words
 * mention touching, sexual acts or abuse; otherwise the gentle safety check-in.
 */
export function blockedReadGuidance(
  call: string | undefined,
  input: { latest: string; earlier?: readonly string[]; companion?: string },
  env: Env = process.env
): string | null {
  if (!blockedSignalOn(env) || !readWasBlocked(call, input.latest)) return null;
  const words = [input.latest, ...(input.earlier ?? [])];
  const young =
    likelyMinor(call) || ageSignal(call) || words.some((w) => statesUnder18(w, input.companion));
  const child = young || CHILD_HARM_WORDS.test(input.latest);
  if (child && call) holdForSexualTopic(call);
  log.info({ child, young }, 'CRISIS_CLASSIFIER_BLOCKED');
  return child ? CHILD_SAFETY_CARE : BLOCKED_SAFETY_CHECK;
}

/** For tests. */
export function resetClassifierBlocked(): void {
  blocked.clear();
}
