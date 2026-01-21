/**
 * Predictive Intelligence Context Builder
 *
 * Provides pattern recognition and proactive follow-ups.
 * Superhuman memory - noticing patterns the user can't see themselves.
 *
 * PHILOSOPHY:
 * "We notice what you can't see about yourself."
 *
 * Capabilities:
 * - Temporal patterns (Sunday scaries, late night, morning energy)
 * - Emotional patterns (deflection, over-functioning, avoidance)
 * - Behavioral patterns (work talk to avoid relationships, busyness as shield)
 * - Proactive follow-ups (checking in on commitments, life events)
 * - Concern detection (hopelessness, isolation, warning signs)
 *
 * @module PredictiveContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  loadPredictiveIntelligence,
  type PredictiveIntelligence,
} from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'PredictiveContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, PredictiveIntelligence>();
const sessionState = new Map<
  string,
  {
    patternMentions: number;
    lastPatternTurn: number;
    followUpsMentioned: string[];
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      patternMentions: 0,
      lastPatternTurn: 0,
      followUpsMentioned: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<PredictiveIntelligence | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadPredictiveIntelligence(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded predictive intelligence content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load predictive intelligence content');
    return null;
  }
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

type PatternType = 'temporal' | 'emotional' | 'behavioral' | 'concern' | 'none';

function detectPatternSignals(input: ContextBuilderInput): PatternType {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis?.emotion;
  const hour = new Date().getHours();
  const day = new Date().getDay(); // 0 = Sunday

  // Concern detection (highest priority)
  if (
    text.includes('no point') ||
    text.includes("what's the use") ||
    text.includes('give up') ||
    text.includes('hopeless') ||
    text.includes("don't want to be here")
  ) {
    return 'concern';
  }

  // Temporal patterns
  // Sunday scaries
  if (
    day === 0 &&
    (text.includes('tomorrow') || text.includes('week') || text.includes('monday'))
  ) {
    return 'temporal';
  }
  // Late night patterns
  if (hour >= 23 || hour <= 4) {
    return 'temporal';
  }

  // Emotional patterns - deflection
  if (
    text.includes("it's fine") ||
    text.includes("doesn't matter") ||
    text.includes('whatever') ||
    text.includes('not a big deal')
  ) {
    return 'emotional';
  }

  // Behavioral patterns - avoidance
  if (
    text.includes('too busy') ||
    text.includes("don't have time") ||
    text.includes('later') ||
    text.includes('eventually')
  ) {
    return 'behavioral';
  }

  return 'none';
}

function detectFollowUpOpportunity(input: ContextBuilderInput): string | null {
  const text = input.userText.toLowerCase();

  // Commitment mentioned
  if (text.includes('going to') || text.includes('will try') || text.includes('i commit')) {
    return 'commitment';
  }

  // Life event mentioned
  if (
    text.includes('interview') ||
    text.includes('meeting') ||
    text.includes('conversation with') ||
    text.includes('appointment')
  ) {
    return 'life_event';
  }

  // Vulnerability shared
  if (
    text.includes('scared') ||
    text.includes('worried') ||
    text.includes('afraid') ||
    text.includes('anxious about')
  ) {
    return 'vulnerability';
  }

  return null;
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generatePatternGuidance(
  content: PredictiveIntelligence,
  patternType: PatternType
): string | null {
  const lines: string[] = ['[PREDICTIVE: PATTERN RECOGNITION]', ''];

  switch (patternType) {
    case 'concern':
      lines.push('URGENT: Possible concern signals detected.');
      if (content.concern_detection?.warning_signs) {
        lines.push('WARNING SIGNS: hopelessness, giving up, isolation');
      }
      if (content.concern_detection?.response_protocol) {
        lines.push(`PROTOCOL: ${content.concern_detection.response_protocol}`);
      }
      lines.push('');
      lines.push('PRIORITY: Gentle check-in. Safety first.');
      break;

    case 'temporal':
      lines.push('PATTERN: Temporal pattern detected.');
      const hour = new Date().getHours();
      const day = new Date().getDay();

      if (day === 0) {
        lines.push('CONTEXT: Sunday - potential "Sunday scaries".');
        if (content.pattern_recognition?.temporal_patterns?.['sunday_scaries']) {
          lines.push(content.pattern_recognition.temporal_patterns['sunday_scaries']);
        }
      } else if (hour >= 23 || hour <= 4) {
        lines.push('CONTEXT: Late night - different headspace.');
        if (content.pattern_recognition?.temporal_patterns?.['late_night']) {
          lines.push(content.pattern_recognition.temporal_patterns['late_night']);
        }
      }
      break;

    case 'emotional':
      lines.push('PATTERN: Emotional pattern detected.');
      lines.push('SIGNAL: Possible deflection or minimizing.');
      if (content.pattern_recognition?.emotional_patterns?.['deflection']) {
        lines.push(`INSIGHT: ${content.pattern_recognition.emotional_patterns['deflection']}`);
      }
      lines.push('');
      lines.push('APPROACH: Gentle curiosity, not calling out.');
      break;

    case 'behavioral':
      lines.push('PATTERN: Behavioral pattern detected.');
      lines.push('SIGNAL: Busyness or avoidance language.');
      if (content.pattern_recognition?.behavioral_patterns?.['avoidance']) {
        lines.push(`INSIGHT: ${content.pattern_recognition.behavioral_patterns['avoidance']}`);
      }
      lines.push('');
      lines.push('APPROACH: Compassionate observation, not judgment.');
      break;

    default:
      return null;
  }

  lines.push('');
  lines.push('IMPORTANT: Patterns are observations, not accusations.');
  lines.push('Surface with curiosity, not certainty.');

  return lines.join('\n');
}

function generateFollowUpGuidance(
  content: PredictiveIntelligence,
  followUpType: string
): string | null {
  const lines: string[] = ['[PREDICTIVE: FOLLOW-UP OPPORTUNITY]', ''];

  const followUps = content.proactive_follow_ups?.[followUpType];
  if (!followUps) return null;

  lines.push(`TYPE: ${followUpType.replace('_', ' ')}`);

  if (followUps.timing) {
    lines.push(`TIMING: ${followUps.timing}`);
  }

  if (followUps.phrases && followUps.phrases.length > 0) {
    const phrase = followUps.phrases[Math.floor(Math.random() * followUps.phrases.length)];
    lines.push(`EXAMPLE: "${phrase}"`);
  }

  lines.push('');
  lines.push('NOTE: This shows you remember. Use naturally, not robotically.');

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildPredictiveContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Check usage rules
  const maxPatternMentions = content.usage_rules?.max_pattern_mentions_per_session || 3;

  // =========================================================================
  // 1. PATTERN DETECTION
  // =========================================================================
  if (state.patternMentions < maxPatternMentions && turnCount - state.lastPatternTurn >= 3) {
    const patternType = detectPatternSignals(input);

    if (patternType !== 'none') {
      // Concern detection always triggers
      // Other patterns have probability
      const probability =
        patternType === 'concern' ? 1.0 : content.usage_rules?.follow_up_probability || 0.4;

      if (Math.random() < probability) {
        const guidance = generatePatternGuidance(content, patternType);
        if (guidance) {
          injections.push(
            createStandardInjection('predictive_pattern', guidance, { category: 'intelligence' })
          );

          state.patternMentions++;
          state.lastPatternTurn = turnCount;

          log.debug(
            { sessionId, turnCount, patternType, mentions: state.patternMentions },
            'Predictive pattern guidance applied'
          );
        }
      }
    }
  }

  // =========================================================================
  // 2. FOLLOW-UP OPPORTUNITIES
  // =========================================================================
  const followUpType = detectFollowUpOpportunity(input);
  if (followUpType && !state.followUpsMentioned.includes(followUpType)) {
    const followUpGuidance = generateFollowUpGuidance(content, followUpType);
    if (followUpGuidance) {
      injections.push(
        createStandardInjection('predictive_followup', followUpGuidance, {
          category: 'intelligence',
        })
      );

      state.followUpsMentioned.push(followUpType);

      log.debug({ sessionId, turnCount, followUpType }, 'Follow-up opportunity noted');
    }
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupPredictiveState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'predictive_context',
  description: 'Provides pattern recognition and proactive follow-ups',
  priority: 50, // Mid-priority - intelligence layer
  build: buildPredictiveContext,
});

export { buildPredictiveContext };
