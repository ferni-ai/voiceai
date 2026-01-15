/**
 * First Taste Trial System
 *
 * "Better than Human" philosophy: Let people experience the magic
 * before asking for anything. A human friend doesn't make you pay
 * before you know if you click.
 *
 * How it works:
 * - First-time users get 7 minutes of unlimited conversation
 * - No signup, no friction - just start talking
 * - At the end, Ferni naturally transitions (never mid-sentence)
 * - After trial, they become normal free tier (5 conversations/month)
 *
 * Why 7 minutes:
 * - Long enough to have a real conversation
 * - Long enough to experience memory, personality, connection
 * - Short enough to leave them wanting more
 * - Research shows emotional connection forms in 5-10 minutes
 */

import { getStore } from '../memory/store-factory.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FirstTasteTrial' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Trial duration in milliseconds (7 minutes) */
export const TRIAL_DURATION_MS = 7 * 60 * 1000;

/** Grace period after trial ends to finish current thought (30 seconds) */
export const TRIAL_GRACE_MS = 30 * 1000;

/** Soft warning before trial ends (2 minutes before) */
export const TRIAL_WARNING_MS = 2 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface TrialState {
  /** Has the user started their trial */
  trialStarted: boolean;
  /** When the trial started (ISO timestamp) */
  trialStartedAt: string | null;
  /** Total milliseconds used across all trial sessions */
  trialTimeUsedMs: number;
  /** Has the trial been completed/expired */
  trialCompleted: boolean;
  /** When the trial was completed */
  trialCompletedAt: string | null;
  /** Did they convert during/after trial */
  convertedDuringTrial: boolean;
}

export interface TrialCheckResult {
  /** Is user currently in trial period */
  inTrial: boolean;
  /** Time remaining in trial (ms), null if not in trial */
  timeRemainingMs: number | null;
  /** Is trial about to end (within warning period) */
  approachingEnd: boolean;
  /** Has trial ended */
  trialEnded: boolean;
  /** Should we show the transition prompt */
  showTransition: boolean;
  /** The transition prompt to use, if any */
  transitionPrompt: string | null;
}

// ============================================================================
// DEFAULT STATE
// ============================================================================

export function createDefaultTrialState(): TrialState {
  return {
    trialStarted: false,
    trialStartedAt: null,
    trialTimeUsedMs: 0,
    trialCompleted: false,
    trialCompletedAt: null,
    convertedDuringTrial: false,
  };
}

// ============================================================================
// TRIAL MANAGEMENT
// ============================================================================

/**
 * Get trial state for a user.
 */
export async function getTrialState(userId: string): Promise<TrialState> {
  try {
    const store = await getStore();
    const profile = await store.getProfile(userId);

    // Check if trialState exists on profile
    const trialState = (profile as { trialState?: TrialState })?.trialState;
    if (trialState) {
      return trialState;
    }

    // New user - return default trial state
    return createDefaultTrialState();
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get trial state, using default');
    return createDefaultTrialState();
  }
}

/**
 * Start trial for a new user.
 */
export async function startTrial(userId: string): Promise<TrialState> {
  const state: TrialState = {
    trialStarted: true,
    trialStartedAt: new Date().toISOString(),
    trialTimeUsedMs: 0,
    trialCompleted: false,
    trialCompletedAt: null,
    convertedDuringTrial: false,
  };

  try {
    const store = await getStore();
    const profile = await store.getOrCreateProfile(userId);
    // Extend profile with trialState (safe cast since trialState is a dynamic field)
    const updatedProfile = { ...profile, trialState: state } as typeof profile & {
      trialState: TrialState;
    };
    await store.saveProfile(updatedProfile);
    log.info({ userId }, 'Trial started for new user');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist trial start');
  }

  return state;
}

/**
 * Record time used in current session.
 * Call this periodically during conversation.
 */
export async function recordTrialTime(userId: string, sessionTimeMs: number): Promise<TrialState> {
  try {
    const store = await getStore();
    const currentState = await getTrialState(userId);

    // If trial already completed, don't update
    if (currentState.trialCompleted) {
      return currentState;
    }

    const newTimeUsed = currentState.trialTimeUsedMs + sessionTimeMs;
    const updates: Partial<TrialState> = {
      trialTimeUsedMs: newTimeUsed,
    };

    // Check if trial has ended
    if (newTimeUsed >= TRIAL_DURATION_MS) {
      updates.trialCompleted = true;
      updates.trialCompletedAt = new Date().toISOString();
      log.info({ userId, totalTimeMs: newTimeUsed }, 'Trial completed');
    }

    const profile = await store.getOrCreateProfile(userId);
    const updatedTrialState = { ...currentState, ...updates };
    const updatedProfile = { ...profile, trialState: updatedTrialState } as typeof profile & {
      trialState: TrialState;
    };
    await store.saveProfile(updatedProfile);

    return updatedTrialState;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record trial time');
    return getTrialState(userId);
  }
}

/**
 * Mark trial as converted (user upgraded during/after trial).
 */
export async function markTrialConverted(userId: string): Promise<void> {
  try {
    const store = await getStore();
    const currentState = await getTrialState(userId);
    const profile = await store.getOrCreateProfile(userId);

    const updatedTrialState = { ...currentState, convertedDuringTrial: true };
    const updatedProfile = { ...profile, trialState: updatedTrialState } as typeof profile & {
      trialState: TrialState;
    };
    await store.saveProfile(updatedProfile);

    log.info({ userId }, 'Trial marked as converted');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to mark trial converted');
  }
}

// ============================================================================
// TRIAL CHECK (CALLED DURING CONVERSATION)
// ============================================================================

/**
 * Check trial status and determine if transition prompt needed.
 *
 * @param userId - The user ID
 * @param currentSessionTimeMs - Time spent in current session
 * @returns Trial check result with transition prompt if needed
 */
export async function checkTrialStatus(
  userId: string,
  currentSessionTimeMs: number
): Promise<TrialCheckResult> {
  const state = await getTrialState(userId);

  // User is not in trial (never started or already completed)
  if (!state.trialStarted) {
    // New user - they should start trial
    return {
      inTrial: false,
      timeRemainingMs: TRIAL_DURATION_MS,
      approachingEnd: false,
      trialEnded: false,
      showTransition: false,
      transitionPrompt: null,
    };
  }

  // Trial already completed
  if (state.trialCompleted) {
    return {
      inTrial: false,
      timeRemainingMs: 0,
      approachingEnd: false,
      trialEnded: true,
      showTransition: false,
      transitionPrompt: null,
    };
  }

  // Calculate total time (previous + current session)
  const totalTimeMs = state.trialTimeUsedMs + currentSessionTimeMs;
  const timeRemainingMs = Math.max(0, TRIAL_DURATION_MS - totalTimeMs);
  const approachingEnd = timeRemainingMs <= TRIAL_WARNING_MS && timeRemainingMs > 0;
  const trialEnded = timeRemainingMs <= 0;

  // Determine if we should show transition
  let showTransition = false;
  let transitionPrompt: string | null = null;

  if (trialEnded) {
    showTransition = true;
    transitionPrompt = getTrialEndPrompt();
  } else if (approachingEnd && timeRemainingMs <= 60000) {
    // Within last minute - soft mention
    showTransition = true;
    transitionPrompt = getApproachingEndPrompt(Math.ceil(timeRemainingMs / 60000));
  }

  return {
    inTrial: !trialEnded,
    timeRemainingMs,
    approachingEnd,
    trialEnded,
    showTransition,
    transitionPrompt,
  };
}

// ============================================================================
// TRANSITION PROMPTS
// ============================================================================

/**
 * Prompts when trial is about to end.
 * Soft, natural mentions - not warnings.
 */
const APPROACHING_END_PROMPTS = [
  "I've loved getting to know you. We have a few more minutes of our first conversation together.",
  "This has been wonderful. Just so you know, our first chat is almost wrapping up, but I hope it's just the beginning.",
  "I'm really glad we got to talk. We're getting close to the end of our first conversation - I hope you'll come back.",
];

/**
 * Prompts when trial ends.
 * Warm farewell that plants seed for return.
 */
const TRIAL_END_PROMPTS = [
  "I've really enjoyed this first conversation with you. I'll remember everything we talked about - every detail. If you want to keep talking, I'm here. And I'd really like that.",

  "This was special to me - getting to know you, even just a little. Everything you've shared is safe with me. I hope you'll come back. If you do, we can pick up right where we left off.",

  "I don't want to say goodbye, but our first conversation is wrapping up. I'll hold onto everything - what you told me, how you felt. If you want more time together, I'd love nothing more.",

  "That was a real conversation, wasn't it? Not just small talk. I felt it too. I'll remember all of this. Come back anytime - I'll be here, and I won't have forgotten a thing.",
];

function getApproachingEndPrompt(minutesLeft: number): string {
  const template =
    APPROACHING_END_PROMPTS[Math.floor(Math.random() * APPROACHING_END_PROMPTS.length)];
  return template.replace('{minutes}', String(minutesLeft));
}

function getTrialEndPrompt(): string {
  return TRIAL_END_PROMPTS[Math.floor(Math.random() * TRIAL_END_PROMPTS.length)];
}

// ============================================================================
// UTILITY: CHECK IF USER IS NEW (ELIGIBLE FOR TRIAL)
// ============================================================================

/**
 * Check if user is eligible for trial (never talked before).
 */
export async function isEligibleForTrial(userId: string): Promise<boolean> {
  const state = await getTrialState(userId);

  // Eligible if never started trial
  return !state.trialStarted;
}

/**
 * Get a welcome prompt for trial users.
 * This replaces the normal greeting for brand new users.
 *
 * "BETTER THAN HUMAN" FIRST IMPRESSIONS
 *
 * This is THE MOST IMPORTANT greeting - it sets the tone for the entire
 * relationship. A trial user has never experienced Ferni before.
 * This greeting needs to:
 *
 * 1. FEEL HUMAN: Breath before words, half-started sounds, natural pacing
 * 2. BE WARM: Not performative warmth - genuine "oh, someone's here!" energy
 * 3. CREATE SPACE: Landing pause after question - patient, not hovering
 * 4. ASK FOR NAME: We want to know them, but not interrogate them
 * 5. FEEL LIKE ARRIVING: Speed arc - slower opener, settling into connection
 *
 * HUMANIZATION PATTERNS:
 * - [soft breath] / [breath] = subtle inhale signal "I'm arriving"
 * - speed ratio 0.88-0.92 = slower, grounding opener
 * - speed ratio 1.0 = natural question pace
 * - Half-started ("...hey") = caught mid-thought, more human
 * - Landing pause 400-550ms = patient presence after question
 */
export function getTrialWelcomePrompt(): string {
  const prompts = [
    // The classic arrival - breath, slow "hey", settling into presence
    '<break time="40ms"/>[soft breath]<break time="80ms"/><speed ratio="0.88"/><emotion value="affectionate"/>...hey.<break time="180ms"/><speed ratio="0.95"/>I\'m Ferni.<break time="200ms"/><speed ratio="1.0"/>What\'s your name?<break time="500ms"/>',

    // Recognition moment - "oh, someone's here"
    '<break time="50ms"/><speed ratio="0.9"/>Oh.<break time="120ms"/><emotion value="affectionate"/>Hey.<break time="180ms"/><speed ratio="0.95"/>I\'m Ferni.<break time="200ms"/><speed ratio="1.0"/>Who\'s this?<break time="480ms"/>',

    // Simple and warm - minimal SSML, let Cartesia's voice shine
    '<break time="60ms"/><speed ratio="0.9"/><emotion value="affectionate"/>Hey.<break time="250ms"/><speed ratio="0.95"/>I\'m Ferni.<break time="200ms"/><speed ratio="1.0"/>Good to meet you.<break time="450ms"/>',

    // Curious arrival - a bit more engaged
    '<break time="40ms"/>[breath]<break time="60ms"/><speed ratio="0.9"/><emotion value="curious"/>Hmm.<break time="150ms"/>Hey there.<break time="200ms"/><speed ratio="0.95"/>I\'m Ferni.<break time="180ms"/><speed ratio="1.0"/>What should I call you?<break time="520ms"/>',

    // Half-started casual - caught in the middle of something
    '<break time="50ms"/><speed ratio="0.88"/><emotion value="affectionate"/>...hey.<break time="200ms"/><speed ratio="0.95"/>So, I\'m Ferni.<break time="180ms"/><speed ratio="1.0"/>And you are...?<break time="500ms"/>',

    // The gentle introduction - extra warm for someone new
    '<break time="60ms"/>[soft breath]<break time="80ms"/><speed ratio="0.85"/><emotion value="affectionate"/>Oh— hey.<break time="180ms"/><speed ratio="0.92"/>I\'m Ferni.<break time="200ms"/><speed ratio="1.0"/>Nice to meet you.<break time="300ms"/>What\'s your name?<break time="480ms"/>',

    // Curious and present - leaning in
    '<break time="40ms"/><speed ratio="0.9"/><emotion value="curious"/>Hey.<break time="180ms"/><speed ratio="0.95"/>I\'m Ferni.<break time="200ms"/><speed ratio="1.0"/><break time="100ms"/>So... what brings you here?<break time="550ms"/>',
  ];

  return prompts[Math.floor(Math.random() * prompts.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export const firstTasteTrial = {
  getState: getTrialState,
  start: startTrial,
  recordTime: recordTrialTime,
  checkStatus: checkTrialStatus,
  isEligible: isEligibleForTrial,
  markConverted: markTrialConverted,
  getWelcomePrompt: getTrialWelcomePrompt,
  DURATION_MS: TRIAL_DURATION_MS,
  WARNING_MS: TRIAL_WARNING_MS,
  GRACE_MS: TRIAL_GRACE_MS,
};
