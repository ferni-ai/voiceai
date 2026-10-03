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
 * A plan is keyed by (sessionId, turn): `turn` is the session's user-turn
 * counter (`userData.turnCount`, the `turnNumber` tts-wrapper profiles with).
 * A plan for turn N is consumed by the first reply of turn N and never
 * applies to turn N+1: taking turn N+1 discards a leftover turn-N plan. It
 * also expires after PLAN_TTL_MS, is cleared on barge-in and session end, and
 * the store is capped so abandoned sessions can't grow it. A missing, empty
 * or 'unknown' sessionId (tts-wrapper's fallback) is never stored or taken:
 * it would be a slot shared by every session without an id.
 *
 * Gates (env, default off; each lever has its own so a regression is
 * attributable):
 *   SPEECH_STAGE2_NONVERBAL=off|live   opening breath/sigh
 *   SPEECH_STAGE2_TEMPO=off|live       pitch-preserving tempo
 *
 * @module speech/reply-audio-plan
 */

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

interface StoredPlan {
  turn: number;
  plan: ReplyAudioPlan;
  expiresAt: number;
}

const plans = new Map<string, StoredPlan>();

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

/** Drop invalid fields; clamp the rest. Returns undefined when nothing is left. */
export function normalizeReplyAudioPlan(plan: ReplyAudioPlan): ReplyAudioPlan | undefined {
  const out: ReplyAudioPlan = {};
  if (typeof plan.tempo === 'number' && Number.isFinite(plan.tempo) && plan.tempo > 0) {
    out.tempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, plan.tempo));
  }
  const o = plan.opening;
  if (o && NONVERBAL_KINDS.has(o.kind) && Number.isFinite(o.intensity) && o.intensity > 0) {
    out.opening = { kind: o.kind, intensity: Math.min(1, o.intensity) };
    if (typeof o.durationMs === 'number' && Number.isFinite(o.durationMs) && o.durationMs > 0) {
      out.opening.durationMs = Math.min(MAX_OPENING_MS[o.kind], o.durationMs);
    }
    if (typeof o.f0Hz === 'number' && o.f0Hz >= MIN_F0_HZ && o.f0Hz <= MAX_F0_HZ) {
      out.opening.f0Hz = o.f0Hz;
    }
  }
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

function isTurn(turn: number | undefined): turn is number {
  return typeof turn === 'number' && Number.isInteger(turn) && turn >= 0;
}

/**
 * Set the plan for the reply to `turn`, replacing any pending plan for the
 * session. No-op without a real session id and turn.
 */
export function setReplyAudioPlan(
  sessionId: string | undefined,
  turn: number | undefined,
  plan: ReplyAudioPlan
): void {
  if (!isPlannableSession(sessionId) || !isTurn(turn)) return;
  const normalized = normalizeReplyAudioPlan(plan);
  plans.delete(sessionId);
  if (!normalized) return;
  const at = now();
  evict(at);
  plans.set(sessionId, { turn, plan: normalized, expiresAt: at + PLAN_TTL_MS });
}

/**
 * Take (and remove) the plan for `turn`, if it hasn't expired. A pending plan
 * for an earlier turn is stale and is discarded; one for a later turn is left.
 */
export function takeReplyAudioPlan(
  sessionId: string | undefined,
  turn: number | undefined
): ReplyAudioPlan | undefined {
  if (!isPlannableSession(sessionId) || !isTurn(turn)) return undefined;
  const stored = plans.get(sessionId);
  if (!stored || stored.turn > turn) return undefined;
  plans.delete(sessionId);
  return stored.turn === turn && stored.expiresAt > now() ? stored.plan : undefined;
}

/** Forget this session's pending plan (barge-in, session end). */
export function clearReplyAudioPlan(sessionId: string): void {
  plans.delete(sessionId);
}

/** Number of pending plans (diagnostics/tests). */
export function pendingReplyAudioPlanCount(): number {
  return plans.size;
}
