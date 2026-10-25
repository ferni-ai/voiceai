/**
 * After a call, one wellbeing snapshot from what the caller said about how
 * they are (WELLBEING_AFTER_CALL=on, per person through cohort flags; off by
 * default). agents/wellbeing-register.ts registers it as an after-call task.
 *
 * Why: the only other writer is the per-turn regex detector (detectWellbeing),
 * which needs first-person phrasing like "I'm exhausted" or "I feel lonely" in
 * a single turn. Most calls had no match, so "How You're Feeling" stayed empty.
 * Reading the whole call once catches "doing pretty good, just wiped from the
 * week" too.
 *
 * Scores are 0 to 1 like the detector's (the panel shows them as percents);
 * a dimension the caller didn't speak to stays out, so nothing is invented.
 *
 * @module services/wellbeing-tracking/after-call
 */
import { envForCaller, type CohortStore } from '../platform/cohort-flags.js';
import { callLLM } from '../llm-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import {
  classifyEscalation,
  detectCrisisSignals,
} from '../human-transfer/escalation-classifier.js';
import { persistSnapshot } from './persistence.js';
import type { WellbeingDimensions, WellbeingSnapshot } from './index.js';

const log = createLogger({ module: 'wellbeing-after-call' });

export const WELLBEING_TASK = 'wellbeing-after-call';

/** The dimensions the panel shows, by their stored names. */
const DIMENSIONS = [
  'mood',
  'energy',
  'worry',
  'loneliness',
  'meaningfulness',
  'sleepQuality',
] as const satisfies ReadonlyArray<keyof WellbeingDimensions>;

const MAX_TRANSCRIPT = 12_000;

export interface WellbeingCall {
  userId: string;
  sessionId: string;
  startedAt: Date;
  turns: ReadonlyArray<{ role: string; content: string }>;
}

export interface WellbeingDeps {
  llm?: (prompt: string) => Promise<string | null>;
  save?: (userId: string, snapshot: WellbeingSnapshot) => Promise<boolean>;
  env?: Record<string, string | undefined>;
  cohorts?: CohortStore;
}

export function wellbeingAfterCallOn(env: Record<string, string | undefined>): boolean {
  return env.WELLBEING_AFTER_CALL === 'on';
}

export function buildWellbeingPrompt(turns: WellbeingCall['turns']): string {
  let transcript = turns
    .filter((t) => t.content?.trim())
    .map((t) => `${t.role === 'user' ? 'CALLER' : 'FERNI'}: ${t.content.trim()}`)
    .join('\n');
  if (transcript.length > MAX_TRANSCRIPT) {
    const half = MAX_TRANSCRIPT / 2;
    transcript = `${transcript.slice(0, half)}\n[...]\n${transcript.slice(-half)}`;
  }
  return `Read this call and score how the CALLER is doing, only from what the caller said about themselves on this call (never from FERNI's lines, never guessed from the topic).

${transcript}

Each score is 0 to 1, or null when the caller didn't show it:
- mood: 0 very low, 0.5 so-so, 1 very good
- energy: 0 drained, 1 full of energy
- worry: 0 calm, 1 very worried or stressed
- loneliness: 0 connected, 1 very lonely
- meaningfulness: 0 life feels pointless, 1 full of purpose
- sleepQuality: 0 slept terribly, 1 slept great
A polite "good, you?" answering a greeting is not a mood. Most calls leave most scores null.
Respond with ONLY JSON: {"mood":null,"energy":null,"worry":null,"loneliness":null,"meaningfulness":null,"sleepQuality":null}`;
}

/** The scored dimensions from the model's reply; values outside 0..1 or not numbers are dropped. */
export function parseWellbeingReply(reply: string | null): Partial<WellbeingDimensions> {
  const json = reply?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return {};
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
  const out: Partial<WellbeingDimensions> = {};
  for (const key of DIMENSIONS) {
    const v = parsed[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) out[key] = v;
  }
  return out;
}

/**
 * A call where any caller turn reaches the crisis tier of the human-transfer
 * classifier. Such a call is never scored: a mood number is no way to remember it.
 */
export function isCrisisCall(turns: WellbeingCall['turns']): boolean {
  return turns.some(
    (t) =>
      t.role === 'user' &&
      (t.content ?? '').trim() !== '' &&
      classifyEscalation(detectCrisisSignals(t.content)).type.startsWith('crisis_')
  );
}

/** The task body: one model call, then one snapshot when the caller said how they are. */
export async function recordWellbeingAfterCall(
  ctx: WellbeingCall,
  deps: WellbeingDeps = {}
): Promise<void> {
  if (!isMemberIdentity(ctx.userId)) return;
  // This caller's flags: process.env may already hold the next caller's.
  const env = await envForCaller(ctx.userId, { env: deps.env, store: deps.cohorts });
  if (!wellbeingAfterCallOn(env)) return;
  if (!ctx.turns.some((t) => t.role === 'user' && (t.content ?? '').trim() !== '')) return;
  if (isCrisisCall(ctx.turns)) {
    log.info({ sessionId: ctx.sessionId }, 'WELLBEING_SKIPPED_CRISIS');
    return;
  }

  const llm =
    deps.llm ??
    (async (p: string) => callLLM(p, { maxTokens: 200, temperature: 0, timeout: 20_000 }));
  const dimensions = parseWellbeingReply(await llm(buildWellbeingPrompt(ctx.turns)));
  const keys = Object.keys(dimensions) as Array<keyof WellbeingDimensions>;
  if (keys.length === 0) {
    log.info({ sessionId: ctx.sessionId }, 'WELLBEING_NONE');
    return;
  }

  const snapshot: WellbeingSnapshot = {
    id: `wb_call_${ctx.sessionId}`, // one per call: a retried task overwrites, never doubles
    userId: ctx.userId,
    timestamp: new Date(),
    source: 'inferred',
    dimensions,
    confidence: Object.fromEntries(keys.map((k) => [k, 0.6])),
    conversationId: ctx.sessionId,
  };
  const saved = await (deps.save ?? persistSnapshot)(ctx.userId, snapshot);
  log.info({ sessionId: ctx.sessionId, dimensions: keys, saved }, 'WELLBEING_RECORDED');
}
