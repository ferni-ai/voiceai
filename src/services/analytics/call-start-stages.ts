/**
 * CALL_START_STAGES: one line per call with its start-up stages, logged at
 * first audio (or at the end of a call that never spoke). It is the prod
 * latency baseline. `*AtMs` fields are ms after session_start; `identifyMs` and
 * `servicesInitMs` are durations. A stage that had not happened yet is null
 * (profileReadyAtMs null means the greeting went out before the caller's
 * profile loaded).
 *
 * @module services/analytics/call-start-stages
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallStartStages' });
const logged = new WeakSet<object>();

/** The call fields the line reads. */
interface StagedCall {
  callId: string;
  personaId?: string;
  stages?: Record<string, number>;
}

/** Log the call's start-up stages once; later calls for the same call do nothing. */
export function logCallStartStages(call: StagedCall): void {
  if (logged.has(call)) return;
  logged.add(call);
  const stages = { ...(call.stages ?? {}) };
  const at = (stage: string): number | null => stages[stage] ?? null;
  const span = (from: string, to: string): number | null => {
    const start = at(from);
    const end = at(to);
    return start === null || end === null ? null : end - start;
  };
  log.info(
    {
      event: 'CALL_START_STAGES',
      callId: call.callId,
      personaId: call.personaId,
      identifyMs: span('identify_start', 'identify_done'),
      servicesInitMs: span('services_init_start', 'services_init_done'),
      profileReadyAtMs: at('profile_ready'),
      contextBuiltAtMs: at('context_built'),
      greetingSayAtMs: at('greeting_say'),
      firstAudioAtMs: at('tts_first_frame') ?? at('first_audio'),
      stages,
    },
    'CALL_START_STAGES'
  );
}

/** Stage marked when a placed call's phone is picked up (call-first-response.ts). */
export const CALL_ANSWERED_STAGE = 'call_answered';

/** Mark the pickup of a call Ferni placed; its first response is timed from here. */
export function markCallAnswered(callId: string): void {
  markCallStageSoon(callId, CALL_ANSWERED_STAGE);
}

/** Mark a call stage without waiting or failing (the monitor loads lazily). */
export function markCallStageSoon(callId: string, stage: string, atMs = Date.now()): void {
  void import('./call-quality-monitor.js')
    .then(({ markCallStage }) => markCallStage(callId, stage, atMs))
    .catch(() => undefined);
}
