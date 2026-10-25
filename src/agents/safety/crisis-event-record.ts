/**
 * CRISIS_EVENT_RECORD (off by default): when the crisis script replaces a call's reply
 * (crisis-gate.ts 'replace', patterns or classifier), one crisis_events record per call.
 *
 * - No words: user, session and persona ids, the time, type and severity from fixed
 *   enums, resourcesProvided (every script names 988 or 911), and which reader decided.
 * - No alert: nothing goes to Slack or anyone else (Seth, 2026-10-25).
 * - Once per call; never awaited (the write starts on a later tick, failures logged).
 * - Not for a non-member id (anonymous, anon:, onbehalf:: nobody could delete or export
 *   it) nor a MINOR_CARE-held caller, whose hold keeps nothing personal from the call.
 *   The script is spoken either way. shadow: the same checks, logged; nothing written.
 *
 * @module agents/safety/crisis-event-record
 */

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

const MAX_CALLS = 5000;
/** Calls already recorded (or checked), oldest first. */
const recordedCalls = new Set<string>();

const PERSONA_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function idsOf(session: unknown): { sessionId?: string; userId?: string; personaId?: string } {
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

/**
 * Told of every crisis decision (crisis-gate-signal.ts). Returns at once and
 * never throws: the record is written on a later tick.
 */
export function recordCrisisOnCall(
  session: unknown,
  action: string | undefined,
  reader: CrisisReader,
  kind?: CrisisEventKind
): void {
  if (action !== 'replace') return;
  const mode = flagModeOf('CRISIS_EVENT_RECORD');
  if (mode === 'off') return;
  const ids = idsOf(session);
  if (!ids.sessionId || recordedCalls.has(ids.sessionId)) return;
  recordedCalls.add(ids.sessionId);
  if (recordedCalls.size > MAX_CALLS) recordedCalls.delete(recordedCalls.values().next().value!);
  const at = { sessionId: ids.sessionId, reader };
  if (!isMemberIdentity(ids.userId)) {
    log.info(at, 'Crisis event: no member id, not recorded');
    return;
  }
  if (writeHeld(ids.userId, ids.sessionId)) {
    log.info(at, 'Crisis event: MINOR_CARE hold, not recorded');
    return;
  }
  const { crisisType, severity } = kind ?? { crisisType: 'suicidal_ideation', severity: 'high' };
  if (mode === 'shadow')
    return log.info({ ...at, severity }, 'Crisis event (shadow): would record');
  const event = {
    ...ids,
    userId: ids.userId,
    crisisType,
    severity,
    reader,
    resourcesProvided: true,
  };
  setImmediate(() => {
    import('../../services/safety/index.js')
      .then(async ({ recordCrisisEvent }) => recordCrisisEvent(event))
      // recordCrisisEvent never throws; this is the module failing to load
      .catch(() => log.warn(at, 'Crisis event not recorded: safety module unavailable'));
  });
}

/** For tests. */
export function resetCrisisEventRecords(): void {
  recordedCalls.clear();
}
