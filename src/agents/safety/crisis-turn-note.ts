/**
 * Each crisis decision as a words-free note for its turn's TURN_RECEIPT
 * (agents/shared/turn-receipt-crisis.ts), and the crisis override log once per replaced
 * call turn (crisis-guard.ts logCrisisOverride). Logging only: it reads decisions after
 * they are made, never changes one, and never throws into the reply.
 *
 * A gate decision's reply class comes from the guidance it carries (the shared soft,
 * direct and gentle checks, the timeout check-in, else crisis guidance) or, for a script,
 * from whether the script names 911. Each note carries the turn it was made on
 * (call-turn.ts), so a read that settles after the caller's next commit is not credited
 * to the wrong turn.
 *
 * @module agents/safety/crisis-turn-note
 */
import { callTurnOf, type CallTurnIds } from '../../utils/call-turn.js';
import {
  GROUNDED_LIGHT_TOUCH,
  logCrisisOverride,
  names911,
  replacesReply,
  SCREEN_GENTLE_OFFER,
  SOFT_CRISIS_CHECK,
  TIMEOUT_CHECKIN,
  type CrisisReader,
} from '../../services/safety/index.js';
import { sessionIdIn } from '../../speech/output-control/index.js';
import { noteCrisisTurn, type CrisisReplyClass } from '../shared/turn-receipt-crisis.js';
import type { CrisisEventKind } from './crisis-event-record.js';

/** A gate decision (crisis-gate.ts CrisisGateDecision), as far as a note reads it. */
interface GateDecision {
  action: string;
  guidance?: string;
  script?: string;
  kind?: CrisisEventKind;
}

const CHECK_CLASSES = new Map<string, CrisisReplyClass>([
  [SOFT_CRISIS_CHECK, 'softCheck'],
  [GROUNDED_LIGHT_TOUCH, 'directCheck'],
  [SCREEN_GENTLE_OFFER, 'gentleOffer'],
  [TIMEOUT_CHECKIN, 'checkin'],
]);

function replyClassOf(decision: GateDecision): CrisisReplyClass | null {
  if (decision.action === 'replace')
    return names911(decision.script ?? '') ? 'script911' : 'script988';
  if (decision.action !== 'guide') return null;
  return CHECK_CLASSES.get(decision.guidance ?? '') ?? 'guidance';
}

/** The call's session id; a session whose userData throws on read has none. */
function sessionIdOf(session: unknown): string | undefined {
  try {
    return sessionIdIn((session as { userData?: unknown } | null | undefined)?.userData);
  } catch {
    return undefined;
  }
}

const MAX_TURNS = 2000;
/** `${sessionId}|${turn}` whose replace was logged, oldest first. */
const loggedTurns = new Set<string>();

/** The override line, once per call turn; a turn that isn't known logs each time. */
function logOverride(
  sessionId: string | undefined,
  turn: number | null,
  reader: CrisisReader,
  kind?: CrisisEventKind
): void {
  const key = sessionId && turn !== null ? `${sessionId}|${turn}` : null;
  if (key && loggedTurns.has(key)) return;
  if (key) loggedTurns.add(key);
  const oldest = loggedTurns.size > MAX_TURNS ? loggedTurns.values().next().value : undefined;
  if (oldest !== undefined) loggedTurns.delete(oldest);
  const { crisisType = null, severity = null } = kind ?? {};
  logCrisisOverride({ sessionId: sessionId ?? null, turn, reader, crisisType, severity });
}

/** One gate decision on the session's open turn (or, with no session, the typed gate's). */
export function noteGateDecision(
  session: unknown,
  decision: GateDecision | null | undefined,
  reader: CrisisReader,
  turn: number | null = callTurnOf(sessionIdOf(session))
): void {
  try {
    const reply = decision ? replyClassOf(decision) : null;
    if (!decision || !reply) return;
    const sessionId = sessionIdOf(session);
    const tier = decision.action === 'replace' ? 'block' : 'crisis';
    noteCrisisTurn(sessionId, turn, { engine: 'gate', tier, reply, kind: decision.kind });
    if (decision.action === 'replace') logOverride(sessionId, turn, reader, decision.kind);
  } catch {
    // Observability only: never in the way of the reply.
  }
}

/**
 * A reply gate's decision now and its classifier escalation once it settles (gatedReply).
 * Returns the call and the turn this reply answers, for its other log lines (CRISIS_HOLD).
 */
export function noteGateTurn(
  session: unknown,
  gate: { decision: GateDecision; escalation: Promise<GateDecision | null> | null } | null
): CallTurnIds {
  const sessionId = sessionIdOf(session);
  const turn = callTurnOf(sessionId); // the turn this reply answers, not a later one
  const ids = { sessionId: sessionId ?? null, turn };
  if (!gate) return ids;
  noteGateDecision(session, gate.decision, 'pattern', turn);
  gate.escalation
    ?.then((d) => noteGateDecision(session, d, 'classifier', turn))
    .catch(() => undefined);
  return ids;
}

/** The turn pipeline's settled read (turn-crisis.ts), on the call's open turn. */
export function notePipelineRead(
  sessionId: string | undefined,
  settled: { crisis: { isCrisis: boolean; severity: number }; soft: boolean }
): void {
  const { crisis, soft } = settled;
  const tier = replacesReply(crisis) ? 'block' : crisis.isCrisis || soft ? 'crisis' : 'none';
  if (tier !== 'none')
    noteCrisisTurn(sessionId, callTurnOf(sessionId), { engine: 'pipeline', tier });
}
