/**
 * When a dead-air check-in may speak.
 *
 * The early check-in fires a few seconds after the user stops talking. Its
 * other guards miss a reply that is still being generated (agent "thinking",
 * no audio yet), so on a slow turn it started a second reply that cut the
 * real one off with "you still there?" (live dev call, 2026-09-27). The
 * session's own state is authoritative: only speak into real silence.
 *
 * @module agents/voice-agent/dead-air
 */

export interface SessionStates {
  agentState?: string;
  userState?: string;
}

export function isRealSilence(session: SessionStates | null | undefined): boolean {
  if (!session) return true; // no state to consult; defer to the other guards
  const agentBusy = session.agentState !== undefined && session.agentState !== 'listening';
  const userTalking = session.userState === 'speaking';
  return !agentBusy && !userTalking;
}

// ============================================================================
// Comfortable silence
// ============================================================================

/** What the session knows about the moment the caller went quiet in. */
export interface SilenceMoment {
  lastUserText?: string;
  /** 0-1 from text emotion analysis. */
  distressLevel?: number;
  /** Text or voice emotion label. */
  emotion?: string;
}

const HEAVY_EMOTIONS = new Set([
  'sad',
  'sadness',
  'grief',
  'hurt',
  'anxious',
  'anxiety',
  'fear',
  'fearful',
  'scared',
  'lonely',
  'overwhelmed',
  'despair',
  'distress',
]);

const HEAVY_WORDS =
  /\b(died|dying|passed away|funeral|diagnos\w*|cancer|divorce|breakup|broke up|miscarriage|lost my|depress\w*|crying|cried|grief|grieving|scared|panic|afraid|hospital|laid off|fired)\b/i;

/** After something heavy, a pause is them feeling or finding words, not dead air. */
const HEAVY_HOLD = 3;

/**
 * How long to let a silence sit before a check-in, as a multiple of the
 * usual wait. A friend does not rush in after "my dad died".
 */
export function silenceHold(moment: SilenceMoment): number {
  const heavy =
    (moment.distressLevel ?? 0) >= 0.5 ||
    HEAVY_EMOTIONS.has((moment.emotion ?? '').toLowerCase()) ||
    HEAVY_WORDS.test(moment.lastUserText ?? '');
  return heavy ? HEAVY_HOLD : 1;
}
