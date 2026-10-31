/**
 * Handoff arrival: what the leaving persona handed over, held per call until the
 * arriving persona's first turn takes it.
 *
 * It was one module-global value in executor.ts, never cleared on a live call
 * (session init and cleanup reset state.ts, not this), so after one handoff every
 * later turn, and any other call on the same worker, read as a handoff (#3044).
 *
 * @module tools/handoff/handoff-arrival
 */

import type { TeamPairDynamic } from '../../personas/index.js';
import type { CognitiveHandoffContext } from './cognitive-handoff.js';

export interface HandoffArrivalContext {
  topics: string[];
  emotionalState: string;
  summary: string;
  pendingItems: string[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Cognitive insights for the target persona */
  cognitiveContext?: CognitiveHandoffContext;
  /** Voice emotion for better-than-human entrance adaptation */
  voiceEmotion?: {
    voiceEmotion?: string;
    voiceConfidence?: number;
    arousal?: number;
    valence?: number;
    hasVoiceStrain?: boolean;
    hasVoiceTremor?: boolean;
  };
  /** Team chemistry context for warm handoffs */
  teamChemistry?: {
    dynamic?: TeamPairDynamic;
    handoffNote?: string;
    fromPersona: string;
    toPersona: string;
  };
}

/** A handoff's context, held for one call until the arriving persona's first turn takes it. */
interface PendingArrival {
  context: HandoffArrivalContext;
  /** Canonical id (personas/persona-ids.ts) of the persona the call was handed to. */
  personaId: string;
  capturedAt: number;
  taken: boolean;
}

/**
 * An arrival older than this is not "the first turn" any more. The same minute
 * team/handoff.ts treats as a recent handoff.
 */
const ARRIVAL_WINDOW_MS = 60_000;

/**
 * Keyed by session id. Module-global once, so after one handoff every later
 * turn (and any other call on this worker) read as a handoff (#3044).
 */
const arrivals = new Map<string, PendingArrival>();

function dropStaleArrivals(now: number): void {
  for (const [sessionId, arrival] of arrivals) {
    if (now - arrival.capturedAt > ARRIVAL_WINDOW_MS) arrivals.delete(sessionId);
  }
}

/**
 * Capture context before a handoff to `arrivingPersonaId`, for this call only.
 * Without a session id there is no call to hold it for, so nothing is kept.
 */
export function captureHandoffContext(
  context: Partial<HandoffArrivalContext>,
  sessionId?: string,
  arrivingPersonaId?: string
): void {
  if (!sessionId) return;
  const now = Date.now();
  dropStaleArrivals(now);
  arrivals.set(sessionId, {
    context: {
      topics: context.topics || [],
      emotionalState: context.emotionalState || 'neutral',
      summary: context.summary || '',
      pendingItems: context.pendingItems || [],
      recentMessages: context.recentMessages || [],
      voiceEmotion: context.voiceEmotion,
      cognitiveContext: context.cognitiveContext,
    },
    personaId: arrivingPersonaId ?? '',
    capturedAt: now,
    taken: false,
  });
}

function liveArrival(sessionId: string | undefined): PendingArrival | null {
  const arrival = sessionId ? arrivals.get(sessionId) : undefined;
  if (!arrival) return null;
  if (Date.now() - arrival.capturedAt > ARRIVAL_WINDOW_MS) {
    arrivals.delete(sessionId as string);
    return null;
  }
  return arrival;
}

/** This call's latest handoff context within the arrival window, without taking it. */
export function getHandoffContext(sessionId?: string): HandoffArrivalContext | null {
  return liveArrival(sessionId)?.context ?? null;
}

/** True when `personaId` (canonical) was just handed this call and its first turn hasn't taken the arrival yet. */
function hasHandoffArrival(sessionId: string | undefined, personaId: string): boolean {
  const arrival = liveArrival(sessionId);
  if (!arrival || arrival.taken) return false;
  return arrival.personaId === personaId;
}

/**
 * The handoff context for `personaId`'s (canonical id) first turn after it was handed this
 * call, once: later turns, other personas and other calls get null.
 */
export function takeHandoffArrival(
  sessionId: string | undefined,
  personaId: string
): HandoffArrivalContext | null {
  if (!hasHandoffArrival(sessionId, personaId)) return null;
  const arrival = arrivals.get(sessionId as string) as PendingArrival;
  arrival.taken = true;
  return arrival.context;
}

/** Forget every pending arrival (tests, and executor's resetHandoffState). */
export function clearHandoffArrivals(): void {
  arrivals.clear();
}
