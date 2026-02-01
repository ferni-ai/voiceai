/**
 * Persona Proactive Context Builder
 *
 * > "Being truly present matters more than being impressive."
 *
 * Surfaces proactive insights based on persona-specific patterns:
 * - Temporal awareness ("I noticed you always bring up work stress on Mondays...")
 * - Emotional pattern detection
 * - Behavioral trend surfacing
 * - Concern detection with care
 *
 * Implements Core Principle #5: Presence Over Performance
 *
 * @module intelligence/context-builders/proactive/persona-proactive
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
  registerContextBuilder,
} from '../index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getPersonaPatternSignal,
  type DetectedPattern,
  type DetectedConcern,
  type ProactiveFollowUp,
} from '../../predictive/persona-patterns.js';
import type { PersonaId } from '../../../personas/types.js';

const log = createLogger({ module: 'PersonaProactiveBuilder' });

// ============================================================================
// PROBABILITY CONFIG
// ============================================================================

/**
 * Probability of surfacing proactive insights
 * - Too high: feels intrusive/surveillance-y
 * - Too low: misses opportunities for superhuman moments
 */
const PROACTIVE_PROBABILITY = 0.25; // 25% of turns

/**
 * Minimum confidence to surface a pattern
 */
const MIN_PATTERN_CONFIDENCE = 0.4;

/**
 * Max proactive injections per session
 */
const MAX_PROACTIVE_PER_SESSION = 3;

// Track proactive count per session
const sessionProactiveCount = new Map<string, number>();

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format a detected pattern as a prompt hint
 */
function formatPatternHint(pattern: DetectedPattern): string {
  const lines: string[] = [];

  lines.push(`[🔮 PROACTIVE PATTERN DETECTED - OPTIONAL]`);
  lines.push(`Type: ${pattern.patternType}`);
  lines.push(`Pattern: ${pattern.name}`);

  if (pattern.insight) {
    lines.push(`\nInsight: "${pattern.insight}"`);
  } else {
    lines.push(`\nDetection: ${pattern.description}`);
  }

  if (pattern.proactiveResponse && pattern.proactiveResponse.length > 0) {
    const response =
      pattern.proactiveResponse[Math.floor(Math.random() * pattern.proactiveResponse.length)];
    lines.push(`\nSuggested phrasing: "${response}"`);
  }

  lines.push(`\nConfidence: ${Math.round(pattern.confidence * 100)}%`);
  lines.push(`\nGuidance:`);
  lines.push(`- Only use if the conversation naturally leads here`);
  lines.push(`- Don't force it - skip if the moment doesn't feel right`);
  lines.push(`- This is a "Better Than Human" observation - use wisely`);

  return lines.join('\n');
}

/**
 * Format a detected concern as a prompt hint
 */
function formatConcernHint(concern: DetectedConcern): string {
  const lines: string[] = [];

  lines.push(`[⚠️ CONCERN DETECTED - HANDLE WITH CARE]`);
  lines.push(`Severity: ${concern.severity}`);
  lines.push(`Detection: ${concern.detection}`);

  if (concern.responses.length > 0) {
    const response = concern.responses[Math.floor(Math.random() * concern.responses.length)];
    lines.push(`\nSuggested response: "${response}"`);
  }

  lines.push(`\nGuidance:`);
  lines.push(`- Approach with warmth and presence`);
  lines.push(`- Don't diagnose or project - observe and support`);
  lines.push(`- Create space for them to share more if they want`);

  return lines.join('\n');
}

/**
 * Format a follow-up opportunity as a prompt hint
 */
function formatFollowUpHint(followUp: ProactiveFollowUp): string {
  const lines: string[] = [];

  lines.push(`[💭 PROACTIVE FOLLOW-UP OPPORTUNITY]`);
  lines.push(`Timing: ${followUp.timing}`);
  lines.push(`\nSuggested phrase: "${followUp.phrase}"`);
  lines.push(`\nConfidence: ${Math.round(followUp.confidence * 100)}%`);
  lines.push(`\nNote: Only use if it flows naturally. Skip if forced.`);

  return lines.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build persona proactive context for the current turn
 */
async function buildPersonaProactiveContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const userId = input.services?.userId;
  const sessionId = input.services?.sessionId || 'default';
  const personaId = (input.persona?.id || 'ferni') as PersonaId;

  if (!userId) {
    return [];
  }

  // Check session limit
  const sessionKey = `${userId}_${sessionId}`;
  const sessionCount = sessionProactiveCount.get(sessionKey) || 0;
  if (sessionCount >= MAX_PROACTIVE_PER_SESSION) {
    log.debug({ sessionCount }, 'Max proactive injections reached for session');
    return [];
  }

  // Probability check - don't surface proactive every turn
  if (Math.random() > PROACTIVE_PROBABILITY) {
    return [];
  }

  const injections: ContextInjection[] = [];

  try {
    // Build context
    const context = {
      userMessage: input.userText,
      topics: input.analysis?.topics?.detected || [],
      emotion: {
        primary: input.analysis?.emotion?.primary,
        intensity: input.analysis?.emotion?.intensity,
        valence: input.analysis?.emotion?.valence,
      },
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours(),
      sessionNumber: input.userData?.turnCount || 1,
      relationshipStage: input.userData?.currentPersona,
    };

    // Get persona pattern signals
    const signals = await getPersonaPatternSignal(personaId, context);

    // Surface top concern if detected
    if (signals.concerns.length > 0) {
      const topConcern = signals.concerns[0];
      const concernContent = formatConcernHint(topConcern);

      injections.push(
        createHintInjection('persona-concern', concernContent, {
          category: 'awareness',
          confidence: 0.85, // Concerns are high-signal
        })
      );

      sessionProactiveCount.set(sessionKey, sessionCount + 1);

      log.debug(
        {
          personaId,
          concernId: topConcern.concernId,
          severity: topConcern.severity,
        },
        'Surfaced persona concern'
      );

      // Concerns take priority - don't add pattern hints
      return injections;
    }

    // Surface top pattern if confident
    if (signals.patterns.length > 0 && signals.patterns[0].confidence >= MIN_PATTERN_CONFIDENCE) {
      const topPattern = signals.patterns[0];
      const patternContent = formatPatternHint(topPattern);

      injections.push(
        createHintInjection('persona-pattern', patternContent, {
          category: 'personality',
          confidence: topPattern.confidence,
        })
      );

      sessionProactiveCount.set(sessionKey, sessionCount + 1);

      log.debug(
        {
          personaId,
          patternId: topPattern.patternId,
          type: topPattern.patternType,
          confidence: topPattern.confidence,
        },
        'Surfaced persona pattern'
      );
    }

    // Surface follow-up if relevant (and no pattern surfaced)
    if (injections.length === 0 && signals.followUps.length > 0) {
      const topFollowUp = signals.followUps[0];
      if (topFollowUp.confidence >= 0.3) {
        const followUpContent = formatFollowUpHint(topFollowUp);

        injections.push(
          createHintInjection('persona-followup', followUpContent, {
            category: 'personality',
            confidence: topFollowUp.confidence,
          })
        );

        sessionProactiveCount.set(sessionKey, sessionCount + 1);

        log.debug(
          {
            personaId,
            followUpId: topFollowUp.id,
            timing: topFollowUp.timing,
          },
          'Surfaced proactive follow-up'
        );
      }
    }
  } catch (error) {
    log.error({ error, userId, personaId }, 'Error building persona proactive context');
  }

  return injections;
}

/**
 * Clear session proactive counts (call at session end)
 */
export function clearSessionProactiveCount(userId: string, sessionId: string): void {
  const sessionKey = `${userId}_${sessionId}`;
  sessionProactiveCount.delete(sessionKey);
}

/**
 * Clear all session counts (for testing)
 */
export function clearAllSessionProactiveCounts(): void {
  sessionProactiveCount.clear();
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'persona-proactive',
  description: 'Persona-specific proactive insights and pattern detection',
  priority: 55, // After relationship (45), before personality (70)
  build: buildPersonaProactiveContext,
});

export { buildPersonaProactiveContext };
