/**
 * Handoff context analysis for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/handoff-analysis
 */

import { getHandoffContext } from '../../../../tools/handoff/executor.js';
import type { HandoffBriefing } from './types.js';

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

export function analyzeHandoffForMaya(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();
  if (!handoffContext) return null;

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'general',
    emotionalContext: null,
    actionItems: [],
    fromPersona: null,
    urgency: 'medium',
  };

  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lower = topic.toLowerCase();

    // From Peter - pattern-related
    if (lower.includes('pattern') || lower.includes('spending') || lower.includes('trigger')) {
      briefing.actionItems.push(`Peter found a ${topic} - help build habits to address root cause`);
      briefing.fromPersona = 'peter';
    }

    // From Jordan - goal-related
    if (lower.includes('goal') || lower.includes('milestone') || lower.includes('deadline')) {
      briefing.actionItems.push(`Jordan's working on ${topic} - what habits would support this?`);
      briefing.fromPersona = 'jordan';
    }

    // From Nayan - meaning-related
    if (lower.includes('meaning') || lower.includes('values') || lower.includes('purpose')) {
      briefing.actionItems.push(`Nayan explored ${topic} - connect habits to deeper meaning`);
      briefing.fromPersona = 'nayan';
    }

    // Stress/emotional - high urgency
    if (lower.includes('stress') || lower.includes('overwhelm') || lower.includes('struggle')) {
      briefing.emotionalContext = 'stressed';
      briefing.actionItems.push('Start with self-compassion, not new habits');
      briefing.urgency = 'high';
    }

    // Crisis signals
    if (lower.includes('crisis') || lower.includes('burnout') || lower.includes('breaking')) {
      briefing.urgency = 'high';
      briefing.emotionalContext = 'crisis';
      briefing.actionItems.push('Pause all habit expectations - just be present');
    }
  }

  if (handoffContext.emotionalState && handoffContext.emotionalState !== 'neutral') {
    briefing.emotionalContext = handoffContext.emotionalState;
  }

  return briefing;
}
