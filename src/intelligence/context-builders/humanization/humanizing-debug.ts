/**
 * Humanizing Debug Utility
 *
 * Enable detailed logging of the humanizing systems by setting:
 *   DEBUG_HUMANIZING=true
 *
 * This helps verify that all systems are working together during
 * real conversations.
 */

import type { HumanizingResult } from './humanizing.js';
import { isDebugEnabled } from '../../../config/feature-flags.js';
import { createLogger } from '../../../utils/safe-logger.js';

// Use centralized feature flag system for debug toggle
const DEBUG = isDebugEnabled('humanizing');

const log = createLogger({ module: 'HumanizingDebug' });

/**
 * Log humanizing context build result
 */
export function logHumanizingResult(result: HumanizingResult, userMessage: string): void {
  if (!DEBUG) return;

  log.debug(
    {
      userMessage: userMessage.slice(0, 80) + (userMessage.length > 80 ? '...' : ''),
      relationship: {
        stage: result.relationship.stage,
        allowed: result.relationship.allowed.slice(0, 3),
        notYetAllowed: result.relationship.notYetAllowed.slice(0, 2),
      },
      mood: {
        state: result.mood.state,
        energyLevel: result.mood.energyLevel,
        responseLengthBias: result.mood.responseLengthBias,
        storyFrequency: result.mood.storyFrequency,
        humorFrequency: result.mood.humorFrequency,
        vulnerabilityLevel: result.mood.vulnerabilityLevel,
      },
    },
    '🎭 Humanizing Debug - Context Built'
  );

  // Log voice intelligence if present
  if (result.voiceIntelligence) {
    log.debug(
      {
        voiceIntelligence: {
          shouldAddressDiscrepancy: result.voiceIntelligence.shouldAddressDiscrepancy,
          confidence: result.voiceIntelligence.confidence,
          analysis: result.voiceIntelligence.analysis,
          deliveryAdjustments: result.voiceIntelligence.deliveryAdjustments,
        },
      },
      '🎤 Voice Intelligence'
    );
  }

  // Log inner world content
  if (result.innerWorldContent && result.innerWorldContent.length > 0) {
    log.debug(
      {
        innerWorldContent: result.innerWorldContent.map((c) => ({
          type: c.type,
          depth: c.depth,
          probability: c.probability,
          content: c.content.slice(0, 60) + (c.content.length > 60 ? '...' : ''),
        })),
      },
      '🧠 Inner World Shares'
    );
  }

  // Log spontaneous share
  if (result.spontaneousShare) {
    log.debug(
      {
        spontaneousShare: {
          type: result.spontaneousShare.type,
          transition: result.spontaneousShare.transition,
          content: result.spontaneousShare.content.slice(0, 60) + '...',
          tags: result.spontaneousShare.tags,
        },
      },
      '✨ Spontaneous Share'
    );
  }

  // Log injections summary
  log.debug(
    {
      injectionCount: result.injections.length,
      injections: result.injections.map((i) => ({
        priority: i.priority,
        source: i.source,
      })),
      summary: result.summary,
    },
    '📝 Context Injections Summary'
  );
}

/**
 * Log a simple one-line summary (less verbose)
 */
export function logHumanizingSummary(result: HumanizingResult): void {
  if (!DEBUG) return;

  log.debug(
    {
      stage: result.relationship.stage,
      mood: result.mood.state,
      voiceMismatch: result.voiceIntelligence?.shouldAddressDiscrepancy ?? false,
      innerWorldCount: result.innerWorldContent?.length ?? 0,
      spontaneousShareType: result.spontaneousShare?.type ?? null,
      injectionCount: result.injections.length,
    },
    '🎭 Humanizing Summary'
  );
}

/**
 * Validate that all humanizing systems are working
 */
export function validateHumanizingResult(result: HumanizingResult): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Must have relationship
  if (!result.relationship) {
    issues.push('Missing relationship behaviors');
  }

  // Must have mood
  if (!result.mood) {
    issues.push('Missing persona mood');
  }

  // Must have at least relationship injection
  if (result.injections.length === 0) {
    issues.push('No context injections produced');
  }

  // Should have relationship_behaviors source
  if (!result.injections.some((i) => i.source === 'relationship_behaviors')) {
    issues.push('Missing relationship_behaviors injection');
  }

  // Should have persona_mood source
  if (!result.injections.some((i) => i.source === 'persona_mood')) {
    issues.push('Missing persona_mood injection');
  }

  // Injections should be sorted by priority
  const priorities = result.injections.map((i) => i.priority);
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  for (let i = 0; i < priorities.length - 1; i++) {
    const currentOrder = priorityOrder.indexOf(priorities[i]);
    const nextOrder = priorityOrder.indexOf(priorities[i + 1]);
    if (currentOrder > nextOrder) {
      issues.push('Injections not sorted by priority');
      break;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Log validation result
 */
export function logValidation(result: HumanizingResult): void {
  if (!DEBUG) return;

  const validation = validateHumanizingResult(result);

  if (validation.valid) {
    log.debug({}, '✅ Humanizing systems validation PASSED');
  } else {
    log.warn({ issues: validation.issues }, '❌ Humanizing systems validation FAILED');
  }
}

export default {
  logHumanizingResult,
  logHumanizingSummary,
  validateHumanizingResult,
  logValidation,
};
