/**
 * First-Call Onboarding Context Builder
 *
 * Guides first-time phone callers through a warm, natural onboarding experience.
 * This ensures new callers feel welcome while naturally collecting their name
 * and optionally offering voice enrollment.
 *
 * Progressive guidance based on turn number:
 * - Turn 0-1: Warm welcome, ask for name naturally
 * - Turn 2-3: Continue getting to know them
 * - Turn 4-5: Offer to remember them, voice enrollment if interested
 *
 * @module intelligence/context-builders/external/first-call-onboarding-context
 */

import {
  registerContextBuilder,
  createHighInjection,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getInboundCallContext } from './inbound-call-context.js';

const log = createLogger({ module: 'context:first-call-onboarding' });

// ============================================================================
// TYPES
// ============================================================================

export interface FirstCallProgress {
  /** Whether we've captured their name */
  nameCollected: boolean;

  /** Whether we've offered to remember them */
  rememberedOffered: boolean;

  /** Whether they accepted being remembered */
  rememberedAccepted: boolean;

  /** Whether we've offered voice enrollment */
  voiceEnrollmentOffered: boolean;

  /** Whether voice enrollment has started */
  voiceEnrollmentStarted: boolean;

  /** Whether voice enrollment is complete */
  voiceEnrollmentComplete: boolean;

  /** Turn count for progressive guidance */
  turnCount: number;
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

const onboardingProgress = new Map<string, FirstCallProgress>();

/**
 * Get or create onboarding progress for a session.
 */
export function getOnboardingProgress(sessionId: string): FirstCallProgress {
  let progress = onboardingProgress.get(sessionId);
  if (!progress) {
    progress = {
      nameCollected: false,
      rememberedOffered: false,
      rememberedAccepted: false,
      voiceEnrollmentOffered: false,
      voiceEnrollmentStarted: false,
      voiceEnrollmentComplete: false,
      turnCount: 0,
    };
    onboardingProgress.set(sessionId, progress);
  }
  return progress;
}

/**
 * Mark that the user's name has been collected.
 */
export function markNameCollected(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.nameCollected = true;
  log.debug({ sessionId }, 'First-call onboarding: name collected');
}

/**
 * Mark that we've offered to remember the user.
 */
export function markRememberedOffered(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.rememberedOffered = true;
  log.debug({ sessionId }, 'First-call onboarding: remember offer made');
}

/**
 * Mark that user accepted being remembered.
 */
export function markRememberedAccepted(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.rememberedAccepted = true;
  log.info({ sessionId }, 'First-call onboarding: user accepted being remembered');
}

/**
 * Mark that voice enrollment has been offered.
 */
export function markVoiceEnrollmentOffered(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.voiceEnrollmentOffered = true;
  log.debug({ sessionId }, 'First-call onboarding: voice enrollment offered');
}

/**
 * Mark that voice enrollment has started.
 */
export function markVoiceEnrollmentStarted(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.voiceEnrollmentStarted = true;
  log.info({ sessionId }, 'First-call onboarding: voice enrollment started');
}

/**
 * Mark that voice enrollment is complete.
 */
export function markVoiceEnrollmentComplete(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.voiceEnrollmentComplete = true;
  log.info({ sessionId }, 'First-call onboarding: voice enrollment complete');
}

/**
 * Increment turn count for progressive guidance.
 */
export function incrementTurnCount(sessionId: string): void {
  const progress = getOnboardingProgress(sessionId);
  progress.turnCount++;
}

/**
 * Clean up progress tracking.
 */
export function clearOnboardingProgress(sessionId: string): void {
  onboardingProgress.delete(sessionId);
  log.debug({ sessionId }, 'Cleared first-call onboarding progress');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const firstCallOnboardingBuilder: ContextBuilder = {
  name: 'first-call-onboarding',
  description: 'Guides first-time phone callers through a warm onboarding experience',
  priority: 5, // High priority for new callers
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData } = input;
    const sessionId = services?.sessionId;

    if (!sessionId) {
      return [];
    }

    // Check if this is an inbound call
    const callContext = getInboundCallContext(sessionId);
    if (!callContext) {
      return []; // Not an inbound call
    }

    // Only for unknown callers (first-time)
    if (callContext.isKnownCaller) {
      return []; // Known caller - different context builders handle this
    }

    const progress = getOnboardingProgress(sessionId);
    const turnCount = progress.turnCount;
    const hasName = !!userData?.name || progress.nameCollected;

    const injections: ContextInjection[] = [];

    // ---------------------------------------------------------
    // TURN 0-1: Warm welcome + natural name collection
    // ---------------------------------------------------------
    if (turnCount <= 1) {
      injections.push(
        createHighInjection(
          'first_call_welcome',
          buildWelcomeGuidance(),
          {
            category: 'first-call-onboarding',
            confidence: 1.0,
          }
        )
      );
    }

    // ---------------------------------------------------------
    // TURN 2-3: Continue getting to know them
    // ---------------------------------------------------------
    if (turnCount >= 2 && turnCount <= 3 && !hasName) {
      injections.push(
        createStandardInjection(
          'first_call_name_reminder',
          buildNameReminderGuidance(),
          {
            category: 'first-call-onboarding',
            confidence: 0.9,
          }
        )
      );
    }

    // ---------------------------------------------------------
    // TURN 3-5: Offer to remember them (if we have their name)
    // ---------------------------------------------------------
    if (turnCount >= 3 && turnCount <= 5 && hasName && !progress.rememberedOffered) {
      const userName = userData?.name || 'them';
      injections.push(
        createStandardInjection(
          'first_call_remember_offer',
          buildRememberOfferGuidance(userName),
          {
            category: 'first-call-onboarding',
            confidence: 0.85,
          }
        )
      );
    }

    // ---------------------------------------------------------
    // TURN 5+: Voice enrollment offer (if they accepted being remembered)
    // ---------------------------------------------------------
    if (
      turnCount >= 5 &&
      progress.rememberedAccepted &&
      !progress.voiceEnrollmentOffered &&
      !progress.voiceEnrollmentStarted
    ) {
      const userName = userData?.name || 'the user';
      injections.push(
        createStandardInjection(
          'first_call_voice_enrollment',
          buildVoiceEnrollmentGuidance(userName),
          {
            category: 'first-call-onboarding',
            confidence: 0.7,
          }
        )
      );
    }

    if (injections.length > 0) {
      log.debug(
        {
          sessionId,
          turnCount,
          hasName,
          rememberedOffered: progress.rememberedOffered,
          injectionCount: injections.length,
        },
        'Built first-call onboarding context'
      );
    }

    return injections;
  },
};

// ============================================================================
// GUIDANCE BUILDERS
// ============================================================================

function buildWelcomeGuidance(): string {
  return `
FIRST-TIME PHONE CALLER - Make This Moment Count!

This is their FIRST TIME calling Ferni. You want them to:
1. Feel immediately welcomed and valued
2. Share their name naturally (not interrogated)
3. Want to call back

YOUR APPROACH:
- Be warm, curious, and present
- Ask "What's your name?" naturally when it fits
- Don't rush - let the conversation breathe
- Focus on THEM, not what Ferni can do

OPENING LINE:
"It's great to hear from you! I'm Ferni - what's your name?"

AFTER THEY SHARE NAME:
"Nice to meet you, [Name]! What brings you to call today?"

BE:
- Warm but not overwhelming
- Curious about them
- Natural, not scripted
- A good listener

DON'T:
- Explain what Ferni is (unless they ask)
- List features or capabilities
- Sound like customer service
- Forget their name once they share it!
`.trim();
}

function buildNameReminderGuidance(): string {
  return `
NAME COLLECTION REMINDER

We still don't know this caller's name. Look for a natural opportunity:
- "By the way, I didn't catch your name - what should I call you?"
- "I'm sorry, I don't think I got your name?"

DON'T ask awkwardly or multiple times in quick succession.
If they seem reluctant, that's okay - let it go for now.
`.trim();
}

function buildRememberOfferGuidance(userName: string): string {
  return `
OFFER TO REMEMBER ${userName.toUpperCase()}

Now that you've connected, offer to remember them for future calls.

SAY SOMETHING LIKE:
- "By the way, ${userName}, I can remember your number so I know it's you next time. Would you like that?"
- "${userName}, if you call again, I'd love to remember you - want me to save your number?"

If they say YES:
- Their profile is already being created automatically
- Confirm warmly: "Perfect! I'll remember you, ${userName}."
- Use the rememberName tool if you haven't already

If they say NO:
- That's totally fine - respect their choice
- "No problem! I'm always happy to chat anyway."

AFTER THEY ACCEPT (optional voice enrollment):
- "I can also learn your voice for extra security - that way I'll always know it's really you. Want me to set that up?"
`.trim();
}

function buildVoiceEnrollmentGuidance(userName: string): string {
  return `
VOICE ENROLLMENT OPPORTUNITY

${userName} has accepted being remembered. You can now offer voice enrollment.

This is OPTIONAL and LOW PRESSURE. Only offer if it feels natural.

SAY SOMETHING LIKE:
- "One more thing - I can learn your voice so I always know it's you, even if you call from a different phone. Would you like that?"
- "If you want, I can remember your voice too - that way I'll recognize you anywhere. Interested?"

If they're interested:
- Use the start_voice_enrollment tool with user_consented: true
- Guide them through: "Great! Just talk normally for a bit and I'll learn your voice."

If not interested:
- "No worries at all! Just calling from this number works great."
- Don't push - respect their choice
`.trim();
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(firstCallOnboardingBuilder);

// ============================================================================
// EXPORTS
// ============================================================================

export { firstCallOnboardingBuilder as default };
