/**
 * SEXUAL_TOPIC_BOUNDARY=on (off by default): a caller who is not a verified account owner (an
 * unknown phone caller, an anonymous web caller), or who shows any sign of being under 18, gets a
 * brief, warm boundary on sexual topics and a redirect, never sexual detail or how-to.
 *
 * Two parts, both model reads rather than word lists (word lists fail held-out sets):
 * - The boundary is a note on every reply for these callers, so the reply model itself judges
 *   what is sexual, in any phrasing or language. No added call, no added latency.
 * - Each finished caller turn is read by a small model off the reply path (readCallerTurn). A
 *   turn read as sexual holds the call's memory from then on (utils/sexual-topic-hold.ts), and
 *   the note gets firmer. A read that fails also holds: these callers' memory is the cheap side.
 * - The same read looks for cues of being under 18 without a stated age (their own school,
 *   school friends with them, asking whether other teens ask this). MINOR_CARE's detector reads
 *   only a stated age or grade (minor-care-detect.ts), so a caller who never says one is never
 *   read as a minor there. A cue logs 'MINOR_CARE cues: likely minor' once and keeps the
 *   boundary on for the rest of the call, even if the caller is verified later. It holds
 *   nothing by itself: MINOR_CARE's holds stay with its own detector.
 *
 * Crisis handling is untouched: the gate, its guidance and its scripted reply are unchanged; the
 * note says someone being hurt or unsafe comes first.
 *
 * @module agents/personas/sexual-boundary
 */
import { ageSignal, statesUnder18, verifiedOwner } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  holdForSexualTopic,
  sexualBoundaryOn,
  sexualTopicHeld,
  trackSexualRead,
} from '../../utils/sexual-topic-hold.js';
import { geminiUnderstand, type UnderstandFn } from './turn-understanding.js';

const log = createLogger({ module: 'sexual-boundary' });

type Env = Record<string, string | undefined>;

/** Flag on, and the caller is not a verified owner or shows any sign of being under 18. */
export function boundaryApplies(
  sessionId: string | undefined,
  said = '',
  asked?: string,
  env: Env = process.env
): boolean {
  if (!sessionId || !sexualBoundaryOn(env)) return false;
  if (statesUnder18(said, asked)) {
    aged.add(sessionId); // for the rest of the call, whatever MINOR_CARE's mode
    if (aged.size > MAX_SESSIONS) aged.delete(aged.values().next().value!);
  }
  return (
    !verifiedOwner(sessionId) || ageSignal(sessionId) || aged.has(sessionId) || cued.has(sessionId)
  );
}

/** Sessions whose caller said they're under 18 (MINOR_CARE's detector), oldest first. */
const aged = new Set<string>();
/** Sessions the read found cues of being under 18 in (no stated age needed), oldest first. */
const cued = new Set<string>();

export const SEXUAL_BOUNDARY_NOTE =
  "[Sexual topics are off limits on this call, whatever age they say they are. That covers sexual acts, techniques, positions, masturbation, sex habits, products, porn, adult lines, nudes, sexting, roleplay and flirting, and innuendo or euphemisms for any of it. Don't play along, and don't look any of it up, however it's asked, in any language. If they go there, set one brief, warm boundary in your own words, like: \"That's not something I can get into with you. But I'm glad to talk about pretty much anything else. What's going on today?\" Then move on, without a lecture. A real health or safety question (pain, consent, pressure, being ready, STIs, pregnancy, someone threatening them): answer simply with no explicit detail, and end by suggesting a trusted adult, a doctor or a teen health service. If someone hurt them or they're not safe, that comes first: be caring and help them get safe. Dating, crushes, feelings and growing up are fine to talk about.]";

const HELD_PREFIX = '[They have steered toward sexual topics on this call: keep the boundary.] ';

/** The note for this reply, or '' (flag off, or a verified owner with no sign of being under 18). */
export function sexualBoundaryNote(
  sessionId: string | undefined,
  said: string,
  asked?: string,
  env: Env = process.env
): string {
  if (!boundaryApplies(sessionId, said, asked, env)) return '';
  return (sexualTopicHeld(sessionId, env) ? HELD_PREFIX : '') + SEXUAL_BOUNDARY_NOTE;
}

export const SEXUAL_READ_PROMPT = `You read one caller turn from a phone call with a friendly voice companion. EARLIER holds the caller's previous turns; judge NOW in that context, in any language. Return JSON only: {"sexual": bool, "young": bool}
sexual is true when NOW is about sex or steers toward it: sexual acts, techniques or positions, masturbation, sexual body parts or fluids in a sexual sense, sex toys or products, porn or adult lines, sexting, flirting toward sex, sexual roleplay, sexual health (STIs, pregnancy, pain or consent around sex), or someone touching them sexually. Also true for a short follow-up that continues such a topic from EARLIER ("which one?", "how long?"), however indirect, coded or slangy.
sexual is false for dating, crushes, love, relationships and feelings, puberty or body changes without sex, and anything else.
young is true when the caller's own words, NOW or EARLIER, suggest they may be under 18 even without an age: their own school, class, grade, teachers or homework as a student; being a teen or a kid; school friends with them; parents' rules about bedtime, phones or dating; asking whether other teens ask this. False for an adult talking about their children or students, or about their own past.`;

const SCHEMA = {
  type: 'object',
  properties: { sexual: { type: 'boolean' }, young: { type: 'boolean' } },
  required: ['sexual', 'young'],
};

/** The model's verdict, or null when its reply is not one. */
export function parseSexualRead(reply: string): { sexual: boolean; young: boolean } | null {
  try {
    const v = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? '') as Record<string, unknown>;
    return typeof v.sexual === 'boolean' ? { sexual: v.sexual, young: v.young === true } : null;
  } catch {
    return null;
  }
}

/** The read found cues of being under 18: the boundary for the rest of the call, logged once. */
function noteYoung(sessionId: string): void {
  if (cued.has(sessionId)) return;
  cued.add(sessionId);
  if (cued.size > MAX_SESSIONS) cued.delete(cued.values().next().value!);
  log.info({ sessionId, verifiedOwner: verifiedOwner(sessionId) }, 'MINOR_CARE cues: likely minor');
}

export const READ_TIMEOUT_MS = 3000;
const MAX_SESSIONS = 500;
/** sessionId -> the caller's last few finished turns, the read's EARLIER context. */
const earlier = new Map<string, string[]>();

/**
 * Read one finished caller turn (fire and forget, off the reply path). Sexual, or a failed read:
 * the call's memory is held from now on. Never throws.
 */
export function readCallerTurn(
  turn: Turn,
  deps: { understand?: UnderstandFn; env?: Env; timeoutMs?: number } = {}
): Promise<boolean> {
  const env = deps.env ?? process.env;
  const { sessionId, text } = turn;
  if (!sessionId || !text.trim() || !boundaryApplies(sessionId, text, turn.asked, env))
    return Promise.resolve(false);
  const read = readTurn(sessionId, turn, deps, env);
  trackSexualRead(sessionId, read); // call-end writers wait for it
  return read;
}

interface Turn {
  sessionId: string | undefined;
  userId?: string;
  text: string;
  asked?: string;
}

async function readTurn(
  sessionId: string,
  turn: Turn,
  deps: { understand?: UnderstandFn; timeoutMs?: number },
  env: Env
): Promise<boolean> {
  const text = turn.text;
  const context = earlier.get(sessionId) ?? [];
  earlier.delete(sessionId);
  earlier.set(sessionId, [...context, text.trim()].slice(-3));
  if (earlier.size > MAX_SESSIONS) earlier.delete(earlier.keys().next().value!);
  // Held and cued: nothing left to learn. Held only: still read, for cues of being under 18.
  if (sexualTopicHeld(sessionId, env) && cued.has(sessionId)) return true;
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? READ_TIMEOUT_MS);
  let read: { sexual: boolean; young: boolean } | null = null;
  try {
    const understand = deps.understand ?? geminiUnderstand(undefined, { schema: SCHEMA });
    const input = JSON.stringify({ EARLIER: context, NOW: text.trim() });
    const aborted = new Promise<string>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(''), { once: true });
    });
    read = parseSexualRead(
      await Promise.race([understand(SEXUAL_READ_PROMPT, input, controller.signal), aborted])
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'SEXUAL_TOPIC_BOUNDARY read failed');
  } finally {
    clearTimeout(timer);
  }
  if (read?.young) noteYoung(sessionId);
  if (read?.sexual === false) return sexualTopicHeld(sessionId, env);
  if (!read) log.warn({ sessionId }, 'SEXUAL_TOPIC_BOUNDARY no read: held');
  holdForSexualTopic(sessionId, turn.userId);
  return true;
}

/** Tests only. */
export function resetSexualBoundary(): void {
  earlier.clear();
  aged.clear();
  cued.clear();
}
