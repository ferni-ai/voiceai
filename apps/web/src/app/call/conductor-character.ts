/**
 * Ferni's character in numbers: warm & unhurried (Seth, 2026-10-17). Poses are
 * slower with a hint of spring; nothing grows past 1.06; tender, upset and
 * crisis never bounce, grow or tease; celebrations are earned and budgeted, and
 * celebrate what you did, never how often you showed up; crisis is quiet (a
 * caring face, no sound) until it passes. The rules that read this table live
 * in conductor-policy.ts and conductor-delight.ts.
 */

export const CONDUCTOR_POLICY = {
  priorities: {
    critical: ['arrival_joined', 'arrival_failed', 'connection_success', 'error_recovery'],
    high: ['handoff_out', 'handoff_in', 'celebration_big', 'team_unlock'],
    normal: ['handoff_transition', 'celebration_small', 'streak_milestone'],
    low: ['deep_moment', 'session_end'],
  },
  /** arrival_joined never replays in one attempt, whoever re-fires agent_connected. */
  moments: { maxQueue: 3, minGapMs: 500, oncePerAttempt: ['arrival_joined'] },
  character: {
    stateDurationScale: 1.15,
    /** Neutral poses: a hint of spring (peaks ~1.02) is the ceiling; any livelier curve becomes it. */
    poseEasing: 'springGentle',
    /** Tender, upset or crisis: heavy and slow. Any curve that leaves 0..1 becomes this one. */
    gentleEasing: 'gentle',
    /** Only the run of an earned big celebration, in a neutral mood, may pass maxScale. */
    maxScale: 1.06,
    /** Tender, upset or crisis: nothing grows past its resting size. */
    softMaxScale: 1,
    minTranslateY: -8,
  },
  sound: {
    sameTrackGapMs: 2000,
    oncePerAttempt: ['system.connectionSuccess'],
    quietStates: ['speaking', 'user_speaking'],
    personaPrefix: 'persona.',
    essential: ['system.connectionSuccess', 'system.sessionEnd'],
    bargeInDuckDb: -12,
  },
  haptic: {
    minGapMs: 600,
    perBeat: 1,
    moodPattern: 'softTap',
    reducedMotionSequences: ['arrival_joined', 'arrival_failed', 'session_end'],
  },
  face: {
    minDwellMs: 1200,
    /** Joyful faces: never while upset or in crisis. */
    positive: ['happy', 'joyful', 'delighted', 'pleased', 'glad', 'excited', 'proud'],
    /** Teasing faces: neutral moods only, never while tender, upset or in crisis. */
    playful: [
      'winking',
      'mischievous',
      'sheepish',
      'amused',
      'doubleTake',
      'playful',
      'cheeky',
      'silly',
      'teasing',
    ],
    crisis: ['holdingSpace', 'empathetic'],
  },
  delight: {
    /** What you DID, never how often you showed up: no streaks, no unlocks (Seth, 2026-10-29). */
    reasons: ['achievement', 'breakthrough', 'laughter', 'first_meeting'],
    perCall: { big: 1, small: 3 },
    minGapMs: 90_000,
    /** Celebration sequences asked for directly pass the same gate, with this size and reason. */
    asSequence: {
      celebration_small: { size: 'small' },
      celebration_big: { size: 'big' },
      streak_milestone: { size: 'small', reason: 'streak' },
      team_unlock: { size: 'small', reason: 'unlock' },
    },
  },
  /** Token step `element` → the one channel that writes it. Others stay with legacy UI. */
  elements: {
    face: ['face', 'eyes'],
    body: ['avatar', 'currentAvatar', 'newAvatar', 'newPersonaAvatar'],
    glow: ['halo', 'avatarGlow', 'ambientLight', 'connectionRing', 'sparkle'],
    colour: ['transitionGlow', 'overlay', 'backdrop'],
    caption: ['statusText', 'nameTag', 'greeting', 'farewell'],
  },
  failuresBeforeFallback: 3,
} as const;
