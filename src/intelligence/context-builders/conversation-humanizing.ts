/**
 * Conversation Humanizing Context Builder
 *
 * Uses the ConversationHumanizer orchestrator as the single entry point for all
 * conversation humanization features:
 * - Speech naturalization guidance
 * - Active listening cues
 * - Memory callbacks
 * - Question diversity
 * - Emotional arc tracking
 * - Topic change detection
 *
 * This bridges the conversation module with the LLM prompt injection system.
 */

import { log } from '@livekit/agents';
import type { ContextBuilderInput, ContextInjection } from './index.js';
import { createInjection } from './index.js';
import {
  getConversationHumanizer,
  getEmotionalArcTracker,
  type HumanizationContext,
  type ContextGuidance,
} from '../../conversation/index.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

interface ConversationHumanizingInput extends ContextBuilderInput {
  personaId: string;
  turnNumber: number;
  wasPersonalSharing?: boolean;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build humanization context injections using the unified ConversationHumanizer
 */
export function buildConversationHumanizingContext(
  input: ConversationHumanizingInput
): ContextInjection[] {
  const { userText, analysis, personaId, turnNumber } = input;

  // Get the humanizer for this persona
  const humanizer = getConversationHumanizer(personaId);

  // Build humanization context
  const topic = analysis.topics?.detected?.[0] || analysis.topics?.primary || undefined;
  const distressLevel = analysis.emotion.distressLevel ?? 0;

  const humanizationContext: HumanizationContext = {
    personaId,
    turnNumber,
    userMessage: userText,
    userEmotion: analysis.emotion.primary,
    topic,
    isSeriousContext: distressLevel > 0.3,
    wasPersonalSharing: input.wasPersonalSharing || distressLevel > 0.5 || analysis.emotion.intensity > 0.7,
  };

  // Process the user message (records in memory, dynamics, etc.)
  const preActions = humanizer.processUserMessage(humanizationContext);

  // Generate all context guidance from the humanizer
  const guidance = humanizer.generateContextGuidance(humanizationContext);

  // Convert guidance to context injections
  const injections: ContextInjection[] = guidance.map(g => 
    createInjection(g.source, g.content, g.priority)
  );

  // Add topic change notification if detected
  if (preActions.topicChange?.detected && preActions.topicChange.transitionPhrase) {
    injections.push(
      createInjection(
        'topic_change',
        `[TOPIC SHIFT] User changed topic. Consider: "${preActions.topicChange.transitionPhrase}"`,
        'standard'
      )
    );
  }

  // Log what we're injecting
  if (injections.length > 0) {
    getLogger().debug(
      {
        personaId,
        turnNumber,
        injectionsCount: injections.length,
        sources: [...new Set(injections.map(i => i.source))],
      },
      'Built conversation humanizing context via orchestrator'
    );
  }

  return injections;
}

/**
 * Format humanizing guidance for prompt injection
 */
export function formatConversationHumanizingForPrompt(
  injections: ContextInjection[]
): string {
  if (injections.length === 0) return '';

  const lines: string[] = [];

  // Group by priority
  const high = injections.filter(i => i.priority === 'high');
  const standard = injections.filter(i => i.priority === 'standard');
  const hints = injections.filter(i => i.priority === 'hint');

  if (high.length > 0) {
    lines.push('=== IMPORTANT ===');
    high.forEach(i => lines.push(i.content));
  }

  if (standard.length > 0) {
    lines.push('=== GUIDANCE ===');
    standard.forEach(i => lines.push(i.content));
  }

  if (hints.length > 0) {
    lines.push('=== OPTIONAL ===');
    hints.forEach(i => lines.push(i.content));
  }

  return lines.join('\n');
}

/**
 * Get a summary of humanizing features for this persona
 */
export function getHumanizingSummary(personaId: string): {
  unresolvedThreads: string[];
  commitments: Array<{ what: string; who: 'user' | 'agent'; fulfilled: boolean }>;
  emotionalTrajectory: string;
  suggestedPacing: string;
} {
  const humanizer = getConversationHumanizer(personaId);
  const emotional = getEmotionalArcTracker();

  const arc = emotional.getArc();
  const summary = humanizer.getConversationSummary();

  return {
    unresolvedThreads: summary.unresolvedThreads,
    commitments: summary.commitments,
    emotionalTrajectory: arc.trajectory,
    suggestedPacing: arc.needsEmotionalSupport ? 'slower' : 'normal',
  };
}

export default buildConversationHumanizingContext;
