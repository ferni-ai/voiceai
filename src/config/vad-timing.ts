/**
 * The Silero VAD settings the live call loads (call-session.ts), and how long after a caller's
 * words began its start of speech can be reported.
 *
 * LiveKit stamps user_state_changed with the time it is emitted (createdAt = Date.now()), which is
 * when the VAD fired, not when the words began: the VAD needs VAD_MIN_SPEECH_MS of speech first,
 * then a model window to read it. CALL_CONSENT_NATURAL takes that lag off the stamp, so a yes
 * begun before a read-back started is never heard as an answer to it (outreach-confirm.ts).
 *
 * @module config/vad-timing
 */

/** Speech the VAD needs before it reports a start. Silero's default, set here so it can be read. */
export const VAD_MIN_SPEECH_MS = 50;

/** The VAD's 32 ms update window, plus the 200 ms past which Silero logs an inference as slow. */
const VAD_INFERENCE_BOUND_MS = 32 + 200;

/** Room for a slow CPU past that: asking again is the safe side of a late stamp. */
const VAD_SLOW_CPU_MARGIN_MS = 220;

/** The longest a start of speech is assumed to land after the words began (~500 ms). */
export const VAD_START_LAG_MS = VAD_MIN_SPEECH_MS + VAD_INFERENCE_BOUND_MS + VAD_SLOW_CPU_MARGIN_MS;
