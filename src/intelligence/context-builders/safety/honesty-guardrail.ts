/**
 * Honesty Guardrail Context Builder
 *
 * Detects when users ask about actions/capabilities and injects honest context.
 * Prevents Ferni from implying she did something she didn't do.
 *
 * CRITICAL FOR TRUST: This is a core brand promise - Ferni is honest.
 *
 * Examples of questions this handles:
 * - "Did you actually call my mom?"
 * - "If you called my mom..."
 * - "Did you send that text?"
 * - "Have you made the reservation?"
 *
 * @module intelligence/context-builders/honesty-guardrail
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  wasHighImpactActionExecuted,
  getHumanReadableSummary,
} from '../../agents/shared/action-history.js';

const log = createLogger({ module: 'honesty-guardrail' });

// ============================================================================
// TYPES
// ============================================================================

export interface HonestyContext {
  /** Whether honesty context should be injected */
  shouldInject: boolean;
  /** The honest answer to inject */
  context?: string;
  /** Detected action type being asked about */
  actionType?: 'call' | 'text' | 'email' | 'message' | 'event';
  /** Detected contact being asked about */
  contact?: string;
  /** Confidence in the detection (0-1) */
  confidence: number;
}

// ============================================================================
// CAPABILITY QUESTION PATTERNS
// ============================================================================

/**
 * Patterns that indicate user is asking about whether an action was taken.
 * Grouped by action type for targeted detection.
 */
const CAPABILITY_QUESTION_PATTERNS = {
  call: [
    /did you (?:actually |really )?call/i,
    /have you (?:actually |really )?called/i,
    /if you (?:actually |really )?called/i,
    /whether you called/i,
    /did (?:you|ferni) call/i,
    /you (?:actually )?called/i,
    /did the call (?:go through|work|happen)/i,
    /was the call made/i,
    /have you spoken to/i,
    /did you talk to/i,
    /did you reach/i,
  ],
  text: [
    /did you (?:actually |really )?(?:text|send|message)/i,
    /have you (?:actually |really )?(?:texted|sent|messaged)/i,
    /if you (?:actually |really )?(?:texted|sent)/i,
    /whether you (?:texted|sent)/i,
    /was the (?:text|message) sent/i,
    /did the (?:text|message) (?:go through|work)/i,
  ],
  email: [
    /did you (?:actually |really )?email/i,
    /have you (?:actually |really )?emailed/i,
    /if you (?:actually |really )?emailed/i,
    /whether you emailed/i,
    /was the email sent/i,
    /did the email (?:go through|work)/i,
  ],
  event: [
    /did you (?:actually |really )?(?:schedule|create|book)/i,
    /have you (?:actually |really )?(?:scheduled|created|booked)/i,
    /if you (?:actually |really )?(?:scheduled|created|booked)/i,
    /was the (?:event|appointment|meeting) (?:created|scheduled|booked)/i,
    /did the (?:event|appointment|meeting) get (?:created|scheduled|booked)/i,
  ],
};

/**
 * Patterns to extract contact names from questions.
 */
const CONTACT_EXTRACTION_PATTERNS = [
  /(?:call|text|email|message|reach|talk to|speak to|contacted?)\s+(?:my\s+)?(\w+)/i,
  /(?:to|with)\s+(?:my\s+)?(\w+)\??$/i,
  /\b(mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|sister|brother|wife|husband|partner|friend|parents|family)\b/i,
];

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect if user is asking about whether an action was taken.
 */
function detectCapabilityQuestion(transcript: string): {
  isCapabilityQuestion: boolean;
  actionType?: 'call' | 'text' | 'email' | 'message' | 'event';
  contact?: string;
  confidence: number;
} {
  const lowerTranscript = transcript.toLowerCase();

  // Check each action type
  for (const [actionType, patterns] of Object.entries(CAPABILITY_QUESTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(transcript)) {
        // Extract contact if mentioned
        let contact: string | undefined;
        for (const contactPattern of CONTACT_EXTRACTION_PATTERNS) {
          const match = transcript.match(contactPattern);
          if (match && match[1]) {
            contact = match[1];
            break;
          }
        }

        // Calculate confidence based on pattern strength
        const hasQuestionMark = transcript.includes('?');
        const hasDoubtWord = /actually|really|if|whether/i.test(lowerTranscript);
        const confidence = 0.7 + (hasQuestionMark ? 0.15 : 0) + (hasDoubtWord ? 0.15 : 0);

        log.debug(
          { actionType, contact, confidence, transcript: transcript.slice(0, 50) },
          '🔍 Capability question detected'
        );

        return {
          isCapabilityQuestion: true,
          actionType: actionType as 'call' | 'text' | 'email' | 'event',
          contact,
          confidence: Math.min(confidence, 1),
        };
      }
    }
  }

  return { isCapabilityQuestion: false, confidence: 0 };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build honesty context to inject into LLM prompt.
 *
 * Call this when processing user input to check if honest context
 * should be injected about what actions have/haven't been taken.
 */
export function buildHonestyContext(sessionId: string, userTranscript: string): HonestyContext {
  // Detect if this is a capability question
  const detection = detectCapabilityQuestion(userTranscript);

  if (!detection.isCapabilityQuestion) {
    return { shouldInject: false, confidence: 0 };
  }

  // Check action history for honest answer
  const result = wasHighImpactActionExecuted(sessionId, {
    actionType: detection.actionType,
    contact: detection.contact,
  });

  log.info(
    {
      sessionId,
      actionType: detection.actionType,
      contact: detection.contact,
      wasExecuted: result.executed,
    },
    '🎯 Honesty guardrail activated'
  );

  return {
    shouldInject: true,
    context: result.explanation,
    actionType: detection.actionType,
    contact: detection.contact,
    confidence: detection.confidence,
  };
}

/**
 * Get the full context injection string for LLM prompt.
 */
export function getHonestyInjection(sessionId: string, userTranscript: string): string | null {
  const context = buildHonestyContext(sessionId, userTranscript);

  if (!context.shouldInject || !context.context) {
    return null;
  }

  // Build the injection block
  const injection = `[HONESTY CHECK - CRITICAL]
The user is asking whether you performed an action. You MUST be honest.
TRUTH: ${context.context}

DO NOT:
- Imply you did something you didn't do
- Deflect with questions like "What's making you doubt me?"
- Be evasive or psychoanalyze the user's question

DO:
- Answer honestly and directly first
- Then offer to help (if you haven't done it yet, offer to do it)
- Be warm but truthful

Example good response: "No, I haven't called your mom yet. Would you like me to?"
Example bad response: "What's making you doubt that I made the call?"`;

  return injection;
}

/**
 * Get a brief session summary for context.
 * Useful for general honesty context about what has been done.
 */
export function getSessionActionSummary(sessionId: string): string {
  return getHumanReadableSummary(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildHonestyContext,
  getHonestyInjection,
  getSessionActionSummary,
};
