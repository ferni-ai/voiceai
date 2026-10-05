/**
 * Reply audio plan: what Stage 2 (post-Cartesia, Rust) should do to the
 * next reply's audio.
 *
 * Ferni's Cartesia Professional Voice Clone ignores `<speed>`/`<emotion>`,
 * and Cartesia has no breath or sigh. So the speech director decides pace
 * and an opening breath/sigh per reply and leaves the decision here; the
 * post-TTS stage (`agents/shared/performance/reply-audio-stage.ts`) takes it
 * when that reply's TTS stream starts and renders it.
 *
 * A plan is keyed by (sessionId, replyId): `replyId` is the id the gateway
 * TTS node generates once per call and tags onto the audio stream it returns
 * (`tts-gateway/reply-audio-id.ts`) — never the user-turn counter. Two TTS
 * streams in the same turn (a filler, `say()`, a pre-tool phrase, and the
 * real reply) each get their own id, so one can never take or discard
 * another's plan (review H2). A plan also expires after PLAN_TTL_MS, is
 * cleared on barge-in and session end (by sessionId, every pending reply at
 * once), and the store is capped so abandoned sessions can't grow it
 * unbounded. A missing, empty or 'unknown' sessionId (tts-wrapper's
 * fallback), or a missing/blank replyId, is never stored or taken.
 *
 * The director decides on the reply's first text, which is after the stage
 * was built, so the stage can wait for its plan: `onReplyAudioPlan` calls back
 * (once, in a microtask) when a plan for that (session, replyId) is set. A
 * listener is dropped when it fires, when the caller unsubscribes, on
 * clearReplyAudioPlan, after PLAN_TTL_MS, or past MAX_LISTENERS_PER_SESSION,
 * so none can pile up; reaching that cap drops the oldest waiter and logs it
 * once (review L2).
 *
 * Gates (env, default off; each lever has its own so a regression is
 * attributable):
 *   SPEECH_STAGE2_NONVERBAL=off|live   opening breath/sigh
 *   SPEECH_STAGE2_TEMPO=off|live       pitch-preserving tempo
 *
 * @module speech/reply-audio-plan
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ReplyAudioPlan' });

export type NonverbalKind = 'breath' | 'sigh';

export interface ReplyAudioPlan {
  /** Speed for the whole reply: 1.1 = 10% faster. Clamped to 0.8-1.25. */
  tempo?: number;
  /**
   * A breath or sigh rendered before the first word. `f0Hz`: the speaker's
   * median pitch, so a sigh's voiced onset sits in the voice (50-400 Hz).
   */
  opening?: { kind: NonverbalKind; intensity: number; durationMs?: number; f0Hz?: number };
}

export interface Stage2Gates {
  nonverbal: boolean;
  tempo: boolean;
}

export const PLAN_TTL_MS = 10_000;
/** Opening length caps (ms): a director bug must not put seconds before every reply. */
export const MAX_OPENING_MS: Readonly<Record<NonverbalKind, number>> = { breath: 600, sigh: 1200 };
export const MAX_PLANNED_SESSIONS = 256;
export const MIN_TEMPO = 0.8;
export const MAX_TEMPO = 1.25;
/** Plausible speaking pitch; the Rust renderer ignores anything else. */
export const MIN_F0_HZ = 50;
export const MAX_F0_HZ = 400;

const NONVERBAL_KINDS: ReadonlySet<string> = new Set(['breath', 'sigh']);

/** A plan, keyed by replyId; `sessionId` is kept so clearReplyAudioPlan can find it. */
interface StoredPlan {
  sessionId: string;
  plan: ReplyAudioPlan;
  expiresAt: number;
}

/** Keyed by replyId (globally unique), never by sessionId alone (review H2). */
const plans = new Map<string, StoredPlan>();

interface PlanListener {
  replyId: string;
  fn: () => void;
  expiresAt: number;
}

export const MAX_LISTENERS_PER_SESSION = 8;
/** Keyed by sessionId: a list of waiters, each for one reply id. */
const listeners = new Map<string, PlanListener[]>();

/** Clock seam for tests. */
let now: () => number = () => Date.now();

export function setReplyAudioPlanClockForTests(clock: (() => number) | null): void {
  now = clock ?? (() => Date.now());
}

function isLive(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'live';
}

/** Read per call, so a flag change applies to the next reply. */
export function getStage2Gates(env: NodeJS.ProcessEnv = process.env): Stage2Gates {
  return {
    nonverbal: isLive(env.SPEECH_STAGE2_NONVERBAL),
    tempo: isLive(env.SPEECH_STAGE2_TEMPO),
  };
}

type Opening = NonNullable<ReplyAudioPlan['opening']>;

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function normalizeOpening(o: Opening | undefined): Opening | undefined {
  if (!o || !NONVERBAL_KINDS.has(o.kind) || !positive(o.intensity)) return undefined;
  const out: Opening = { kind: o.kind, intensity: Math.min(1, o.intensity) };
  if (positive(o.durationMs)) out.durationMs = Math.min(MAX_OPENING_MS[o.kind], o.durationMs);
  if (positive(o.f0Hz) && o.f0Hz >= MIN_F0_HZ && o.f0Hz <= MAX_F0_HZ) out.f0Hz = o.f0Hz;
  return out;
}

/** Drop invalid fields; clamp the rest. Returns undefined when nothing is left. */
export function normalizeReplyAudioPlan(plan: ReplyAudioPlan): ReplyAudioPlan | undefined {
  const out: ReplyAudioPlan = {};
  if (positive(plan.tempo)) out.tempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, plan.tempo));
  const opening = normalizeOpening(plan.opening);
  if (opening) out.opening = opening;
  return out.tempo === undefined && out.opening === undefined ? undefined : out;
}

function evict(at: number): void {
  for (const [id, stored] of plans) {
    if (stored.expiresAt <= at) plans.delete(id);
  }
  // Map iterates in insertion order (set() re-inserts), so the first key is the oldest.
  while (plans.size >= MAX_PLANNED_SESSIONS) {
    const oldest = plans.keys().next().value;
    if (oldest === undefined) break;
    plans.delete(oldest);
  }
}

/** False for a missing, blank or 'unknown' session id: never a plan slot. */
export function isPlannableSession(sessionId: string | undefined): sessionId is string {
  return typeof sessionId === 'string' && sessionId.trim() !== '' && sessionId !== 'unknown';
}

/** False for a missing or blank reply id: never a plan slot. */
export function isReplyId(replyId: string | undefined): replyId is string {
  return typeof replyId === 'string' && replyId.trim() !== '';
}

/**
 * Set the plan for `replyId`, replacing a pending plan already stored under
 * that SAME id (a second call for the same reply). Never touches another
 * reply's plan, even in the same session or turn (review H2). No-op without
 * a real session id and reply id.
 */
export function setReplyAudioPlan(
  sessionId: string | undefined,
  replyId: string | undefined,
  plan: ReplyAudioPlan
): void {
  if (!isPlannableSession(sessionId) || !isReplyId(replyId)) return;
  const normalized = normalizeReplyAudioPlan(plan);
  plans.delete(replyId);
  if (!normalized) return;
  const at = now();
  evict(at);
  plans.set(replyId, { sessionId, plan: normalized, expiresAt: at + PLAN_TTL_MS });
  notify(sessionId, replyId, at);
}

/** Live listeners for a session, expired ones dropped. */
function liveListeners(sessionId: string, at: number): PlanListener[] {
  const list = (listeners.get(sessionId) ?? []).filter((l) => l.expiresAt > at);
  if (list.length > 0) listeners.set(sessionId, list);
  else listeners.delete(sessionId);
  return list;
}

/** Wake this reply's listeners, each once, after the setter's own work. */
function notify(sessionId: string, replyId: string, at: number): void {
  const list = liveListeners(sessionId, at);
  const due = list.filter((l) => l.replyId === replyId);
  if (due.length === 0) return;
  const rest = list.filter((l) => l.replyId !== replyId);
  if (rest.length > 0) listeners.set(sessionId, rest);
  else listeners.delete(sessionId);
  void Promise.resolve().then(() => {
    for (const l of due) {
      try {
        l.fn();
      } catch {
        // A listener's failure is its own; the plan store is unaffected.
      }
    }
  });
}

/**
 * Update the plan for `replyId`: `patch` is merged into a pending plan
 * already stored under that id (a later opening keeps the tempo planned
 * before it), or stands alone when that plan was already taken or expired.
 * Waiting stages are woken as by setReplyAudioPlan.
 */
export function mergeReplyAudioPlan(
  sessionId: string | undefined,
  replyId: string | undefined,
  patch: ReplyAudioPlan
): void {
  if (!isPlannableSession(sessionId) || !isReplyId(replyId)) return;
  const stored = plans.get(replyId);
  const pending = stored && stored.expiresAt > now() ? stored.plan : {};
  setReplyAudioPlan(sessionId, replyId, { ...pending, ...patch });
}

/**
 * Call `fn` once when a plan for (sessionId, replyId) is set. Returns the
 * unsubscribe. A no-op (and a no-op unsubscribe) without a real session id
 * and reply id. Past MAX_LISTENERS_PER_SESSION the oldest waiter for this
 * session is dropped and logged once (review L2).
 */
export function onReplyAudioPlan(
  sessionId: string | undefined,
  replyId: string | undefined,
  fn: () => void
): () => void {
  if (!isPlannableSession(sessionId) || !isReplyId(replyId)) return () => undefined;
  const at = now();
  const entry: PlanListener = { replyId, fn, expiresAt: at + PLAN_TTL_MS };
  const before = [...liveListeners(sessionId, at), entry];
  if (before.length > MAX_LISTENERS_PER_SESSION) {
    log.warn({ sessionId }, 'Stage 2 plan listener cap reached; dropping the oldest waiter');
  }
  const list = before.slice(-MAX_LISTENERS_PER_SESSION);
  listeners.set(sessionId, list);
  return () => {
    const current = listeners.get(sessionId);
    if (!current) return;
    const kept = current.filter((l) => l !== entry);
    if (kept.length > 0) listeners.set(sessionId, kept);
    else listeners.delete(sessionId);
  };
}

/** Number of stages waiting for a plan (diagnostics/tests). */
export function replyAudioPlanListenerCount(): number {
  let n = 0;
  for (const list of listeners.values()) n += list.length;
  return n;
}

/**
 * Take (and remove) the plan for (sessionId, replyId), if it hasn't expired.
 * A plan stored under a different session (a replyId collision, which a
 * real UUID never produces) is never returned.
 */
export function takeReplyAudioPlan(
  sessionId: string | undefined,
  replyId: string | undefined
): ReplyAudioPlan | undefined {
  if (!isPlannableSession(sessionId) || !isReplyId(replyId)) return undefined;
  const stored = plans.get(replyId);
  if (!stored || stored.sessionId !== sessionId) return undefined;
  plans.delete(replyId);
  return stored.expiresAt > now() ? stored.plan : undefined;
}

/**
 * Forget every pending plan for this session and stop any stage waiting for
 * one (barge-in: the waiting reply is the one being interrupted; session
 * end). Clears all of that session's replies at once, never just one.
 */
export function clearReplyAudioPlan(sessionId: string): void {
  for (const [replyId, stored] of plans) {
    if (stored.sessionId === sessionId) plans.delete(replyId);
  }
  listeners.delete(sessionId);
}

/** Number of pending plans (diagnostics/tests). */
export function pendingReplyAudioPlanCount(): number {
  return plans.size;
}
