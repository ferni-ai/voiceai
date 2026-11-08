/**
 * One counted line per phone call when it ends, PHONE_AUDIO_SUMMARY, so the two
 * phone audio experiments can be compared call by call:
 * - nc: the caller's audio went through telephony noise cancellation
 *   (PHONE_NOISE_CANCEL, room-input-options.ts);
 * - tuning: the phone interruption options were in force
 *   (PHONE_INTERRUPT_TUNING, interruption-config.ts);
 * - falsePauses: LiveKit paused Ferni for caller audio that brought no words
 *   (agent_false_interruption); resumed: how many of those it resumed;
 * - interruptions: overlaps the barge-in model ruled real interruptions.
 *
 * Counts only: no transcript, no caller identity.
 *
 * @module agents/multi-agent/phone-audio-summary
 */
import { voice } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/** Sessions whose phone caller got telephony noise cancellation, until the call ends. */
const noiseCancelled = new Set<string>();

/** room-input-options.ts: this session's phone caller audio is noise cancelled. */
export function notePhoneNoiseCancel(sessionId: string): void {
  noiseCancelled.add(sessionId);
}

interface PhoneAudioCounts {
  falsePauses: number;
  resumed: number;
  interruptions: number;
}

/** Count this phone call's pauses and interruptions; log them once when the session closes. */
export function watchPhoneAudio(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: Pick<voice.AgentSession<any>, 'on'>,
  sessionId: string,
  tuning: boolean
): void {
  const counts: PhoneAudioCounts = { falsePauses: 0, resumed: 0, interruptions: 0 };
  let logged = false;
  session.on(voice.AgentSessionEventTypes.OverlappingSpeech, (ev) => {
    if (ev.isInterruption) counts.interruptions += 1;
  });
  session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, (ev) => {
    counts.falsePauses += 1;
    if (ev.resumed) counts.resumed += 1;
  });
  session.on(voice.AgentSessionEventTypes.Close, () => {
    if (logged) return;
    logged = true;
    const nc = noiseCancelled.delete(sessionId) ? 'on' : 'off';
    log.info({ sessionId, nc, tuning: tuning ? 'on' : 'off', ...counts }, 'PHONE_AUDIO_SUMMARY');
  });
}
