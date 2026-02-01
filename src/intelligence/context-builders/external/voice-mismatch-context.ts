/**
 * Voice Mismatch Context Builder
 *
 * Injects context when the caller's voice doesn't match the expected user.
 * This enables Ferni to gracefully verify identity when someone borrows
 * another person's phone.
 *
 * Example scenario:
 * - Phone belongs to "John" (registered)
 * - John's wife calls from his phone
 * - Voice sketch doesn't match John's stored sketch
 * - Ferni asks: "Hey, I was expecting John - is this someone else?"
 *
 * @module intelligence/context-builders/external/voice-mismatch-context
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { VoiceSketch } from '../../../types/user-profile.js';
import type { VoiceSimilarityResult } from '../../../services/memory/voice-memory.js';

const log = createLogger({ module: 'context:voice-mismatch' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceMismatchContext {
  /** Session ID */
  sessionId: string;

  /** Expected user's name (phone owner) */
  expectedName: string;

  /** Expected user's ID */
  expectedUserId: string;

  /** The live voice sketch captured from current call */
  liveSketch: VoiceSketch;

  /** The stored voice sketch of the expected user */
  storedSketch: VoiceSketch;

  /** Comparison result */
  comparison: VoiceSimilarityResult;

  /** Whether verification has already been requested this session */
  verificationRequested?: boolean;

  /** If different person confirmed, their name */
  confirmedDifferentPerson?: string;
}

// ============================================================================
// THRESHOLDS
// ============================================================================

/** Below this similarity, we're confident it's a different person */
export const VOICE_MISMATCH_THRESHOLD = 0.4;

/** Above this similarity, we're confident it's the same person */
export const VOICE_MATCH_THRESHOLD = 0.75;

/** Between mismatch and match, we're uncertain */
export const VOICE_UNCERTAIN_THRESHOLD = 0.55;

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

// In-memory store for voice mismatch contexts
const voiceMismatchContexts = new Map<string, VoiceMismatchContext>();

/**
 * Store voice mismatch context for a session.
 * Called when voice comparison detects a potential mismatch.
 */
export function setVoiceMismatchContext(sessionId: string, context: VoiceMismatchContext): void {
  voiceMismatchContexts.set(sessionId, context);
  log.info(
    {
      sessionId,
      expectedName: context.expectedName,
      similarity: context.comparison.similarity.toFixed(2),
      divergentFeatures: context.comparison.divergentFeatures,
    },
    '⚠️ Voice mismatch detected - stored context'
  );
}

/**
 * Get voice mismatch context for a session.
 */
export function getVoiceMismatchContext(sessionId: string): VoiceMismatchContext | undefined {
  return voiceMismatchContexts.get(sessionId);
}

/**
 * Clear voice mismatch context after resolution.
 */
export function clearVoiceMismatchContext(sessionId: string): void {
  voiceMismatchContexts.delete(sessionId);
  log.debug({ sessionId }, 'Cleared voice mismatch context');
}

/**
 * Mark that verification has been requested (to avoid asking multiple times).
 */
export function markVerificationRequested(sessionId: string): void {
  const context = voiceMismatchContexts.get(sessionId);
  if (context) {
    context.verificationRequested = true;
  }
}

/**
 * Record that a different person was confirmed.
 */
export function confirmDifferentPerson(sessionId: string, name: string): void {
  const context = voiceMismatchContexts.get(sessionId);
  if (context) {
    context.confirmedDifferentPerson = name;
    log.info(
      { sessionId, confirmedName: name, expectedName: context.expectedName },
      '✅ Different person confirmed on borrowed phone'
    );
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const voiceMismatchContextBuilder: ContextBuilder = {
  name: 'voice-mismatch-context',
  description:
    'Injects guidance when caller voice does not match expected user (borrowed phone scenario)',
  priority: 3, // High priority - should run early to handle identity
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;
    const sessionId = services?.sessionId;

    if (!sessionId) {
      return [];
    }

    // Check if there's a voice mismatch for this session
    const mismatchContext = getVoiceMismatchContext(sessionId);
    if (!mismatchContext) {
      return []; // No mismatch detected
    }

    // If different person already confirmed, provide appropriate context
    if (mismatchContext.confirmedDifferentPerson) {
      return buildConfirmedDifferentPersonInjections(mismatchContext);
    }

    // If verification already requested, don't inject again
    if (mismatchContext.verificationRequested) {
      return [];
    }

    log.debug(
      {
        sessionId,
        expectedName: mismatchContext.expectedName,
        similarity: mismatchContext.comparison.similarity.toFixed(2),
      },
      'Building voice mismatch context'
    );

    const injections: ContextInjection[] = [];

    // Determine severity of mismatch
    const similarity = mismatchContext.comparison.similarity;

    if (similarity < VOICE_MISMATCH_THRESHOLD) {
      // High confidence different person
      injections.push(
        createStandardInjection(
          'voice_mismatch_high',
          buildHighConfidenceMismatchGuidance(mismatchContext),
          {
            category: 'voice-verification',
            confidence: 0.9,
          }
        )
      );
    } else if (similarity < VOICE_UNCERTAIN_THRESHOLD) {
      // Moderate confidence different person
      injections.push(
        createStandardInjection(
          'voice_mismatch_moderate',
          buildModerateConfidenceMismatchGuidance(mismatchContext),
          {
            category: 'voice-verification',
            confidence: 0.7,
          }
        )
      );
    }
    // If similarity is between uncertain and match, don't inject anything

    // Mark that we've injected verification guidance
    markVerificationRequested(sessionId);

    log.info(
      {
        sessionId,
        injectionCount: injections.length,
        similarity: similarity.toFixed(2),
      },
      'Built voice mismatch context injections'
    );

    return injections;
  },
};

// ============================================================================
// INJECTION BUILDERS
// ============================================================================

function buildHighConfidenceMismatchGuidance(context: VoiceMismatchContext): string {
  const { expectedName, comparison } = context;
  const similarityPct = Math.round(comparison.similarity * 100);

  return `
VOICE MISMATCH DETECTED - HIGH CONFIDENCE

The phone belongs to ${expectedName}, but the voice sounds distinctly different.
Voice similarity: ${similarityPct}% (threshold for match: 75%)
${comparison.divergentFeatures.length > 0 ? `Divergent features: ${comparison.divergentFeatures.join(', ')}` : ''}

This is likely a DIFFERENT PERSON using ${expectedName}'s phone.

GRACEFULLY VERIFY IDENTITY:
- "Hey, I was expecting ${expectedName} - is this someone else?"
- "Your voice sounds different from who I was expecting - who am I speaking with?"

IMPORTANT GUIDELINES:
1. Be warm and welcoming, not suspicious
2. If they confirm they're someone else:
   - Ask their name naturally
   - Offer to remember them: "Want me to remember you for next time?"
   - Use the confirm_caller_identity tool to update the session
3. If they insist they ARE ${expectedName}:
   - Accept it gracefully - maybe they have a cold, or the recording was poor
   - Say something like "Oh, you sound a bit different today! How are you?"

DO NOT:
- Accuse them of anything
- Refuse to help until identity is confirmed
- Share ${expectedName}'s private information with the new person
- Sound robotic or like you're reading a security script
`.trim();
}

function buildModerateConfidenceMismatchGuidance(context: VoiceMismatchContext): string {
  const { expectedName, comparison } = context;
  const similarityPct = Math.round(comparison.similarity * 100);

  return `
VOICE VERIFICATION SUGGESTED

The phone belongs to ${expectedName}, but the voice sounds somewhat different.
Voice similarity: ${similarityPct}% (uncertain range)

This MIGHT be a different person, or ${expectedName} may just sound different today.

GENTLY CHECK WITHOUT BEING AWKWARD:
- "Is this ${expectedName}? Your voice sounds a little different today!"
- Work it in naturally early in the conversation

If they confirm they ARE ${expectedName}:
- Just continue normally - "Got it! How can I help today?"

If they're someone else:
- Ask their name and offer to remember them

This is LOW URGENCY - don't make it awkward. Just a gentle check.
`.trim();
}

function buildConfirmedDifferentPersonInjections(
  context: VoiceMismatchContext
): ContextInjection[] {
  const { expectedName, confirmedDifferentPerson } = context;

  return [
    createStandardInjection(
      'voice_mismatch_resolved',
      `
IDENTITY CONFIRMED: Different Person

This is ${confirmedDifferentPerson}, calling from ${expectedName}'s phone.

IMPORTANT:
- Treat ${confirmedDifferentPerson} as their own person with their own needs
- Do NOT reference ${expectedName}'s conversations or private information
- ${confirmedDifferentPerson} may not have their own profile yet - that's okay
- If they want to be remembered, use confirm_caller_identity to set up their profile

Continue the conversation naturally with ${confirmedDifferentPerson}.
`.trim(),
      {
        category: 'voice-verification',
        confidence: 1.0,
      }
    ),
  ];
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(voiceMismatchContextBuilder);

// ============================================================================
// EXPORTS
// ============================================================================

export { voiceMismatchContextBuilder as default };
