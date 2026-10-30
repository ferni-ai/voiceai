/**
 * CRISIS_EVENT_RECORD (off by default): when the crisis script replaces a call's reply
 * (crisis-gate.ts 'replace', patterns or classifier), one crisis_events record per call.
 *
 * - No words: user, session and persona ids, the time, type and severity from fixed
 *   enums, resourcesProvided (every script names 988 or 911), and which reader decided.
 * - No alert: nothing goes to Slack or anyone else (Seth, 2026-10-25).
 * - Once per call. Every check runs on a later tick, caught: it can never touch the reply.
 * - Not for a non-member id (nobody could delete or export it) nor a MINOR_CARE-held caller
 *   (nothing personal is kept). The script is spoken either way. shadow: logged only.
 *
 * @module agents/safety/crisis-event-record
 */

import { setImmediate } from 'node:timers';
import { flagModeOf } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import type { CrisisSeverity, CrisisType } from '../../services/safety/crisis-detection.js';
import type { CrisisReader } from '../../services/safety/index.js';
import { writeHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'crisis-event-record' });

/** What a replace decision was about, from fixed enums only. */
export interface CrisisEventKind {
  crisisType: Extract<CrisisType, 'suicidal_ideation' | 'self_harm'>;
  severity: Extract<CrisisSeverity, 'high' | 'critical'>;
}

/** The kind of a detection that replaced the reply: its indicator tags, never its words. */
export function crisisKindOf(crisis: { indicators: readonly string[] }): CrisisEventKind {
  return {
    crisisType: crisis.indicators.includes('self_harm') ? 'self_harm' : 'suicidal_ideation',
    severity: crisis.indicators.includes('imminent_danger') ? 'critical' : 'high',
  };
}

/** The kind on a gate decision, when it replaced the reply (crisis-gate.ts). */
export const replaceKind = (
  decision: { action: string; kind?: CrisisEventKind } | null | undefined
): CrisisEventKind | undefined => (decision?.action === 'replace' ? decision.kind : undefined);

const MAX_CALLS = 5000;
/** Calls recorded (or shadow-logged), oldest first; a skipped call is checked again later. */
const recordedCalls = new Set<string>();

const PERSONA_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** The call's ids from its session (crisis-quiet-window.ts reads them too). */
export function idsOf(session: unknown): {
  sessionId?: string;
  userId?: string;
  personaId?: string;
} {
  const ud = (session as { userData?: unknown } | undefined)?.userData as
    { userId?: unknown; personaId?: unknown; services?: { sessionId?: unknown } } | undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  const persona = str(ud?.personaId);
  return {
    sessionId: str(ud?.services?.sessionId),
    userId: str(ud?.userId),
    // An id, never a name a person typed: anything else is recorded as 'other'
    personaId: persona && (PERSONA_ID.test(persona) ? persona : 'other'),
  };
}

/** Told of every crisis decision (crisis-gate-signal.ts, late-words.ts); returns at once. The
 * catch logs the reader alone: an error's message could quote the caller. */
export function recordCrisisOnCall(
  session: unknown,
  action: string | undefined,
  reader: CrisisReader,
  kind?: CrisisEventKind
): void {
  if (action !== 'replace') return;
  const run = (): void => {
    try {
      recordOnce(session, reader, kind);
    } catch {
      log.warn({ reader }, 'Crisis event check failed, not recorded');
    }
  };
  try {
    setImmediate(run);
  } catch {
    log.warn({ reader }, 'Crisis event not scheduled, not recorded');
  }
}

function recordOnce(session: unknown, reader: CrisisReader, kind?: CrisisEventKind): void {
  const mode = flagModeOf('CRISIS_EVENT_RECORD');
  if (mode === 'off') return;
  const ids = idsOf(session);
  if (!ids.sessionId || recordedCalls.has(ids.sessionId)) return;
  const at = { sessionId: ids.sessionId, reader };
  if (!isMemberIdentity(ids.userId)) return log.info(at, 'Crisis event skipped: no member id');
  if (writeHeld(ids.userId, ids.sessionId)) return log.info(at, 'Crisis event skipped: MINOR_CARE');
  recordedCalls.add(ids.sessionId);
  if (recordedCalls.size > MAX_CALLS) recordedCalls.delete(recordedCalls.values().next().value!);
  const { crisisType, severity } = kind ?? { crisisType: 'suicidal_ideation', severity: 'high' };
  if (mode === 'shadow') return log.info({ ...at, severity }, 'Crisis event (shadow)');
  const event = { ...ids, userId: ids.userId, crisisType, severity, reader };
  import('../../services/safety/index.js')
    .then(async ({ recordCrisisEvent }) => recordCrisisEvent({ ...event, resourcesProvided: true }))
    // recordCrisisEvent never throws; this is the module failing to load
    .catch(() => log.warn(at, 'Crisis event not recorded: safety module unavailable'));
}

/** For tests. */
export function resetCrisisEventRecords(): void {
  recordedCalls.clear();
}
