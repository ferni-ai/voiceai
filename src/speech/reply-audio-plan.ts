/**
 * Reply audio plan: what Stage 2 (post-Cartesia, Rust) should do to the
 * next reply's audio.
 *
 * Ferni's Cartesia Professional Voice Clone ignores `<speed>`/`<emotion>`,
 * and Cartesia has no breath or sigh. So the speech director decides pace
 * and an opening breath/sigh per reply and leaves the decision here; the
 * post-TTS stage (`agents/shared/performance/reply-audio-stage.ts`) takes it
 * on the first audio frame of that reply's TTS stream and renders it.
 *
 * A plan is consumed by exactly one reply. It expires after PLAN_TTL_MS so a
 * plan whose reply never synthesized can't land on a much later one, and the
 * store is capped so abandoned sessions can't grow it.
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
  /** A breath or sigh rendered before the first word. */
  opening?: { kind: NonverbalKind; intensity: number; durationMs?: number };
}

export interface Stage2Gates {
  nonverbal: boolean;
  tempo: boolean;
}

export const PLAN_TTL_MS = 30_000;
export const MAX_PLANNED_SESSIONS = 256;
export const MIN_TEMPO = 0.8;
export const MAX_TEMPO = 1.25;

const NONVERBAL_KINDS: ReadonlySet<string> = new Set(['breath', 'sigh']);

interface StoredPlan {
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
      out.opening.durationMs = o.durationMs;
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

/** Set the plan for this session's next reply, replacing any pending one. */
export function setReplyAudioPlan(sessionId: string, plan: ReplyAudioPlan): void {
  const normalized = normalizeReplyAudioPlan(plan);
  plans.delete(sessionId);
  if (!normalized) return;
  const at = now();
  evict(at);
  plans.set(sessionId, { plan: normalized, expiresAt: at + PLAN_TTL_MS });
}

/** Take (and remove) this session's pending plan, if it hasn't expired. */
export function takeReplyAudioPlan(sessionId: string): ReplyAudioPlan | undefined {
  const stored = plans.get(sessionId);
  if (!stored) return undefined;
  plans.delete(sessionId);
  return stored.expiresAt > now() ? stored.plan : undefined;
}

/** Forget this session's pending plan (barge-in, session end). */
export function clearReplyAudioPlan(sessionId: string): void {
  plans.delete(sessionId);
}

/** Number of pending plans (diagnostics/tests). */
export function pendingReplyAudioPlanCount(): number {
  return plans.size;
}
