/**
 * Cross-Persona Learning Context Builder
 *
 * Retrieves successful expression patterns that have been learned from other personas
 * and injects them as subtle behavioral hints. This enables "Better than Human" team
 * learning where the whole team improves together.
 *
 * WIRED (Jan 2026): Connects personas/shared/cross-persona-learning.ts to the LLM context.
 *
 * When to inject:
 * - When relevant learned patterns exist for the current context
 * - Not too frequently (to avoid over-scripting)
 * - Adapted to the current persona's voice
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { createBuilderRng } from '../core/rng-utils.js';

// WIRED: Import cross-persona learning from personas/shared
import {
  getBestPatternsForPersona,
  learnFromExpression,
  getPatternStats,
  type LearnedPattern,
} from '../../../personas/shared/cross-persona-learning.js';

const log = createLogger({ module: 'CrossPersonaLearning' });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map analysis emotional state to pattern context
 */
function getEmotionalContext(input: ContextBuilderInput): string | undefined {
  const { voiceEmotion, analysis } = input;
  
  // Use voiceEmotion.emotion (not .primary)
  if (voiceEmotion?.emotion) {
    return voiceEmotion.emotion;
  }
  
  // Use state.distressLevel from ConversationAnalysis
  if ((analysis.state?.distressLevel ?? 0) > 0.5) {
    return 'distressed';
  }
  
  return undefined;
}

/**
 * Map current topic to theme category
 */
function getThemeCategory(input: ContextBuilderInput): string | undefined {
  const topics = input.analysis.topics?.detected || [];
  
  // Map common topics to theme categories
  const topicToTheme: Record<string, string> = {
    'work': 'career',
    'career': 'career',
    'job': 'career',
    'relationship': 'relationships',
    'family': 'relationships',
    'health': 'wellness',
    'wellness': 'wellness',
    'stress': 'emotional',
    'anxiety': 'emotional',
    'goal': 'growth',
    'progress': 'growth',
    'money': 'financial',
    'budget': 'financial',
  };
  
  for (const topic of topics) {
    const lowerTopic = topic.toLowerCase();
    for (const [key, theme] of Object.entries(topicToTheme)) {
      if (lowerTopic.includes(key)) {
        return theme;
      }
    }
  }
  
  return undefined;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildCrossPersonaLearningContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, userData, userProfile } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  
  // Create deterministic RNG for this builder
  const rng = createBuilderRng(input, 'cross-persona-learning');
  
  // Skip early turns - let conversation establish naturally first
  if (turnCount < 3) {
    return injections;
  }
  
  // Only inject learned patterns occasionally (20% chance)
  if (!rng.chance(0.2)) {
    return injections;
  }
  
  // Check if there are any learned patterns
  const stats = getPatternStats();
  if (stats.totalPatterns === 0) {
    return injections;
  }
  
  // Build context for pattern matching
  // Note: sessionMomentum not in ContextUserData, derive from analysis
  const patternContext: Partial<LearnedPattern['context']> = {
    emotionalState: getEmotionalContext(input),
    relationshipStage: userProfile?.relationshipStage,
    momentum: input.analysis.state?.phase || 'neutral',
  };
  
  // Get relevant theme if detectable
  const theme = getThemeCategory(input);
  
  // Get best patterns for this persona and context
  const patterns = getBestPatternsForPersona(
    persona.id,
    theme as LearnedPattern['theme'] | undefined,
    patternContext,
    2 // Get top 2 patterns
  );
  
  if (patterns.length === 0) {
    return injections;
  }
  
  // Use the top pattern
  const topPattern = patterns[0];
  
  // Don't inject the literal adaptation - describe the opportunity
  const learningHint = `[LEARNED PATTERN: An expression like "${topPattern.pattern.template.slice(0, 60)}..." has worked well with users in similar moments. Consider incorporating this style naturally, adapted to your voice.]`;
  
  injections.push(createHintInjection('cross_persona_learning', learningHint));
  
  log.debug(
    {
      personaId: persona.id,
      patternId: topPattern.pattern.id,
      source: topPattern.pattern.sourcePersona,
      score: topPattern.pattern.engagement.score,
    },
    '🧠 Injected learned pattern from team'
  );
  
  return injections;
}

// ============================================================================
// LEARNING INTEGRATION (called from turn handlers)
// ============================================================================

/**
 * Record when an expression gets positive engagement
 * Call this from turn-handler when user responds positively
 */
export function recordSuccessfulExpression(
  expression: string,
  personaId: string,
  theme: string,
  context: {
    emotionalState?: string;
    relationshipStage?: string;
    momentum?: string;
  }
): void {
  try {
    learnFromExpression(
      expression,
      personaId,
      theme as LearnedPattern['theme'],
      context,
      'positive'
    );
  } catch (error) {
    log.warn({ error, personaId }, 'Failed to record expression learning');
  }
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'cross_persona_learning',
  description: 'Injects learned expression patterns from the team',
  priority: 30, // Low priority - subtle enhancement layer
  build: buildCrossPersonaLearningContext,
});

export { buildCrossPersonaLearningContext };
