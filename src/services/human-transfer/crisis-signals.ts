/**
 * The one rule for "this caller had a crisis": a crisis-level signal in
 * bogle_users/{uid}/crisis_signals, the store logCrisisSignal writes on every
 * turn (buildHumanTransferInjections). Crisis level is what a live escalation
 * uses: classifyEscalation gives crisis_immediate or crisis_support. Lower
 * signals (anxiety at severity 3, say) are logged too and don't count.
 *
 * Read by the crisis follow-up (getCrisisHistory), the pondered opener and
 * the pondered outreach notes, so they all agree on who is in a quiet period.
 *
 * @module services/human-transfer/crisis-signals
 */
import { createLogger } from '../../utils/safe-logger.js';
import { classifyEscalation } from './escalation-classifier.js';
import type { CrisisSignals, EscalationType } from './types.js';

const log = createLogger({ module: 'crisis-signals' });

/** A crisis this recent keeps pondered questions out of openers and outreach. */
export const CRISIS_QUIET_DAYS = 14;
const DAY_MS = 86_400_000;
/** Every signal above 0 is logged; read past low-level ones to find a crisis. */
const SIGNALS_READ = 50;

/** Crisis event record (crisis follow-up shape). */
export interface CrisisEventRecord {
  userId: string;
  timestamp: string;
  escalationType: EscalationType;
  urgency: string;
  reason: string;
  transferSuccess?: boolean;
  channel?: string;
  resources?: string[];
  sessionId?: string;
  /** The caller turn it was logged on (CRISIS_SAME_CALL_NOTE_FADES). */
  turn?: number;
}

/** A detection with no signals set; stored signals are laid over it. */
const NO_SIGNALS: CrisisSignals = {
  severity: 0,
  suicidalIdeation: false,
  selfHarmIndicators: false,
  traumaIndicators: false,
  persistentDepression: false,
  anxietyDisorder: false,
  dangerToOthers: false,
  domesticViolence: false,
  childSafetyConcern: false,
  psychoticSymptoms: false,
  substanceCrisis: false,
  medicalEmergency: false,
  legalEmergency: false,
  financialCrisis: false,
  professionalHelpRequest: false,
  rawSignals: [],
};

/** One crisis_signals doc as a crisis event, or null below crisis level. */
export function crisisFromSignal(
  userId: string,
  doc: Record<string, unknown>
): CrisisEventRecord | null {
  const stored = (doc.signals ?? {}) as Partial<CrisisSignals>;
  const signals: CrisisSignals = {
    ...NO_SIGNALS,
    ...stored,
    severity: Number(stored.severity) || 0,
  };
  const decision = classifyEscalation(signals);
  if (decision.type !== 'crisis_immediate' && decision.type !== 'crisis_support') return null;
  if (typeof doc.timestamp !== 'string') return null;
  return {
    userId,
    timestamp: doc.timestamp,
    escalationType: decision.type,
    urgency: decision.urgency,
    reason: decision.reason,
    sessionId: typeof doc.sessionId === 'string' ? doc.sessionId : undefined,
    ...(typeof doc.turn === 'number' ? { turn: doc.turn } : {}),
  };
}

/** Caller turns a same-call crisis follow-up note lasts (CRISIS_SAME_CALL_NOTE_FADES). */
const SAME_CALL_NOTE_TURNS = 3;

/**
 * The crisis the follow-up note is about, newest first (CRISIS_SAME_CALL_NOTE_FADES,
 * #3000; Seth: fade after a few turns). A crisis from an earlier call counts as on
 * main. One logged earlier on this call counts for SAME_CALL_NOTE_TURNS caller turns
 * after its own; a new signal on the call is newer and restarts the count. Without
 * a turn on either side (an older doc, no counter) it counts as on main.
 *
 * Turns are userData.turnCount, which goes up per final STT transcript: no counter
 * of committed caller turns exists in prod (dev-telemetry's is dev-only). A spoken
 * turn split into several finals burns several, so the note can fade after fewer
 * than 3 replies, never later. With 10+ crisis-level signals on this call, an
 * earlier call's crisis falls outside the read (10 kept of 50 read), so nothing
 * follows up once the same-call note fades; the in-call crisis path is engaged then.
 */
export function followUpCrisis(
  crises: readonly CrisisEventRecord[] | undefined,
  sessionId: string | undefined,
  turn: number | undefined
): CrisisEventRecord | undefined {
  return crises?.find(
    (c) =>
      !sessionId ||
      c.sessionId !== sessionId ||
      c.turn === undefined ||
      turn === undefined ||
      turn - c.turn <= SAME_CALL_NOTE_TURNS
  );
}

/** The caller's crisis-level signals since `since`, newest first (at most 10). Throws on read errors. */
export async function crisisLevelSignalsSince(
  db: Pick<FirebaseFirestore.Firestore, 'collection'>,
  userId: string,
  since: Date
): Promise<CrisisEventRecord[]> {
  const snapshot = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('crisis_signals')
    .where('timestamp', '>=', since.toISOString())
    .orderBy('timestamp', 'desc')
    .limit(SIGNALS_READ)
    .get();
  return snapshot.docs
    .map((doc) => crisisFromSignal(userId, doc.data()))
    .filter((event): event is CrisisEventRecord => event !== null)
    .slice(0, 10);
}

/**
 * True when the caller had a crisis-level signal in the last `days`. Fails
 * closed: when the signals can't be read, it answers true, so nothing pondered
 * reaches someone who may be in crisis.
 */
export async function hadCrisisWithin(
  db: Pick<FirebaseFirestore.Firestore, 'collection'>,
  userId: string,
  days: number = CRISIS_QUIET_DAYS,
  now: Date = new Date()
): Promise<boolean> {
  try {
    const since = new Date(now.getTime() - days * DAY_MS);
    return (await crisisLevelSignalsSince(db, userId, since)).length > 0;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Crisis signals unreadable: treating as a crisis');
    return true;
  }
}
