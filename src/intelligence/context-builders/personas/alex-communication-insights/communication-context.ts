/**
 * Communication context analysis for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/communication-context
 */

import type { CommunicationContext, HandoffContextType } from './types.js';

// ============================================================================
// PATTERN CONSTANTS
// ============================================================================

const DIFFICULT_CONVERSATION_PATTERNS = ['conversation', 'talk to', 'tell', 'ask', 'need to say'];
const BOUNDARY_PATTERNS = ['boundary', 'say no', 'confront', 'push back', 'stand up'];
const PROFESSIONAL_PATTERNS = ['boss', 'manager', 'coworker', 'colleague', 'client', 'work'];
const PERSONAL_PATTERNS = ['family', 'parent', 'partner', 'spouse', 'friend', 'sibling'];
const SCRIPTING_PATTERNS = ['how to say', 'what to say', 'script', 'word it', 'phrase it'];

// ============================================================================
// TOPIC CLASSIFICATION
// ============================================================================

export function classifyTopic(topic: string): {
  isDifficult: boolean;
  isBoundary: boolean;
  needsScripting: boolean;
  dynamic: string | null;
} {
  const lower = topic.toLowerCase();

  return {
    isDifficult: DIFFICULT_CONVERSATION_PATTERNS.some((p) => lower.includes(p)),
    isBoundary: BOUNDARY_PATTERNS.some((p) => lower.includes(p)),
    needsScripting: SCRIPTING_PATTERNS.some((p) => lower.includes(p)),
    dynamic: PROFESSIONAL_PATTERNS.some((p) => lower.includes(p))
      ? `Professional: ${topic}`
      : PERSONAL_PATTERNS.some((p) => lower.includes(p))
        ? `Personal: ${topic}`
        : null,
  };
}

// ============================================================================
// EMOTIONAL STATE ANALYSIS
// ============================================================================

export function analyzeEmotionalStateForCommunication(emotionalState: string): string[] {
  const patterns: string[] = [];
  const emo = emotionalState.toLowerCase();

  if (emo.includes('anxious') || emo.includes('nervous')) {
    patterns.push('Anxiety detected - practice scenarios, break into small steps');
  }
  if (emo.includes('frustrated') || emo.includes('angry')) {
    patterns.push('Frustration present - help process before composing');
  }
  if (emo.includes('avoidant') || emo.includes('hesitant')) {
    patterns.push('Avoidance noted - explore the fear behind it');
  }
  if (emo.includes('overwhelmed')) {
    patterns.push('Overwhelmed - triage and prioritize communications');
  }
  if (emo.includes('sad') || emo.includes('down')) {
    patterns.push('Low mood - gentle approach, no pressure');
  }

  return patterns;
}

// ============================================================================
// BUILD COMMUNICATION CONTEXT
// ============================================================================

export function buildCommunicationContext(
  handoffContext?: HandoffContextType
): CommunicationContext {
  const context: CommunicationContext = {
    pendingFollowUps: [],
    recentDifficultTopics: [],
    communicationPatterns: [],
    relationshipDynamics: [],
    scriptingNeeds: [],
    boundaryConversations: [],
  };

  if (!handoffContext) return context;

  // Classify each topic
  for (const topic of handoffContext.topics || []) {
    const classification = classifyTopic(topic);

    if (classification.isDifficult) {
      context.recentDifficultTopics.push(topic);
    }
    if (classification.isBoundary) {
      context.boundaryConversations.push(topic);
    }
    if (classification.needsScripting) {
      context.scriptingNeeds.push(topic);
    }
    if (classification.dynamic) {
      context.relationshipDynamics.push(classification.dynamic);
    }
  }

  // Analyze emotional state
  if (handoffContext.emotionalState) {
    context.communicationPatterns = analyzeEmotionalStateForCommunication(
      handoffContext.emotionalState
    );
  }

  return context;
}
