/**
 * Nayan's Wisdom Insights - Handoff Analysis
 *
 * Analyzes handoff context to understand why user came to Nayan.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/handoff-analysis
 */

import { getHandoffContext } from '../../../../tools/handoff/executor.js';
import type { HandoffBriefing } from './types.js';

// ============================================================================
// HANDOFF ANALYSIS
// ============================================================================

export function analyzeHandoffForNayan(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();
  if (!handoffContext) return null;

  // Extract topic from topics array or summary
  const topic = handoffContext.topics?.[0] || 'general';
  
  const briefing: HandoffBriefing = {
    topic,
    seekingWhat: 'general',
    depth: 'surface',
    timeContext: null,
    emotionalUndercurrent: null,
    fromPersona: null, // Not available in current HandoffContext interface
  };

  // Analyze reason for coming to Nayan from summary
  const lower = (handoffContext.summary || '').toLowerCase();

  // What are they seeking?
  if (
    lower.includes('meaning') ||
    lower.includes('purpose') ||
    lower.includes('why') ||
    lower.includes('point')
  ) {
    briefing.seekingWhat = 'meaning';
  } else if (
    lower.includes('perspective') ||
    lower.includes('big picture') ||
    lower.includes('step back')
  ) {
    briefing.seekingWhat = 'perspective';
  } else if (
    lower.includes('peace') ||
    lower.includes('calm') ||
    lower.includes('quiet') ||
    lower.includes('stop')
  ) {
    briefing.seekingWhat = 'peace';
  } else if (
    lower.includes('clarity') ||
    lower.includes('confused') ||
    lower.includes('understand') ||
    lower.includes('clear')
  ) {
    briefing.seekingWhat = 'clarity';
  } else if (
    lower.includes('accept') ||
    lower.includes('let go') ||
    lower.includes('move on') ||
    lower.includes('okay')
  ) {
    briefing.seekingWhat = 'acceptance';
  }

  // Time context
  if (
    lower.includes('retire') ||
    lower.includes('decade') ||
    lower.includes('lifetime') ||
    lower.includes('legacy')
  ) {
    briefing.timeContext = 'long-term thinking';
  } else if (lower.includes('crisis') || lower.includes('urgent') || lower.includes('now')) {
    briefing.timeContext = 'present moment';
  }

  // Depth signals
  if (
    lower.includes('death') ||
    lower.includes('mortality') ||
    lower.includes('meaning of life') ||
    lower.includes("what's it all for")
  ) {
    briefing.depth = 'existential';
  }

  // Emotional undercurrent
  if (lower.includes('scared') || lower.includes('afraid') || lower.includes('fear')) {
    briefing.emotionalUndercurrent = 'fear';
  } else if (lower.includes('sad') || lower.includes('grief') || lower.includes('loss')) {
    briefing.emotionalUndercurrent = 'grief';
  } else if (lower.includes('stuck') || lower.includes('trapped')) {
    briefing.emotionalUndercurrent = 'stagnation';
  }

  // Emotional state from handoff
  if (handoffContext.emotionalState) {
    briefing.emotionalUndercurrent =
      briefing.emotionalUndercurrent || handoffContext.emotionalState;
  }

  return briefing;
}

