/**
 * Conversation Pacing Module
 *
 * Calculates real-time conversation quality scores based on:
 * - Engagement
 * - Depth
 * - Rapport
 * - Progress
 *
 * @module conversation-quality/pacing
 */

import type { ConversationPacingScore } from './types.js';

/**
 * Calculate real-time conversation quality score
 */
export function calculatePacingScore(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  turnCount: number,
  topicsDiscussed: string[],
  emotionalMoments: number,
  goalsReached: number
): ConversationPacingScore {
  const factors = {
    engagement: 50,
    depth: 50,
    rapport: 50,
    progress: 50,
  };

  const suggestions: string[] = [];
  const userMessages = recentMessages.filter((m) => m.role === 'user');

  // ===== ENGAGEMENT SCORE =====
  if (userMessages.length >= 3) {
    const avgLength =
      userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

    if (avgLength > 100) {
      factors.engagement = 85;
    } else if (avgLength > 50) {
      factors.engagement = 70;
    } else if (avgLength < 20) {
      factors.engagement = 30;
      suggestions.push('User giving short responses - try asking an open-ended question');
    }

    // Questions indicate engagement
    const questionCount = userMessages.filter((m) => m.content.includes('?')).length;
    factors.engagement += questionCount * 5;
  }

  // ===== DEPTH SCORE =====
  factors.depth = Math.min(100, 40 + topicsDiscussed.length * 10);

  if (emotionalMoments > 0) {
    factors.depth += emotionalMoments * 10;
  }

  // Personal topics indicate depth
  const personalTopics = topicsDiscussed.filter((t) =>
    ['family', 'fear', 'dreams', 'regret', 'loss', 'hope', 'love'].includes(t.toLowerCase())
  );
  if (personalTopics.length > 0) {
    factors.depth = Math.min(100, factors.depth + 20);
  }

  // ===== RAPPORT SCORE =====
  if (turnCount < 5) {
    factors.rapport = 50; // Too early to tell
  } else {
    factors.rapport = 60; // Base

    // Long conversations indicate rapport
    if (turnCount > 15) factors.rapport += 15;
    if (turnCount > 25) factors.rapport += 10;

    // Check for warmth indicators
    const fullConvo = userMessages.map((m) => m.content).join(' ');
    if (/\b(thanks|appreciate|helpful|glad|enjoy)\b/i.test(fullConvo)) {
      factors.rapport += 15;
    }
  }

  // ===== PROGRESS SCORE =====
  factors.progress = 40 + goalsReached * 15;

  // Check for decision-making language
  const decisionPatterns = /\b(decided|will do|going to|plan to|makes sense)\b/i;
  if (decisionPatterns.test(userMessages.map((m) => m.content).join(' '))) {
    factors.progress += 20;
  }

  if (factors.progress < 40 && turnCount > 15) {
    suggestions.push(
      'Conversation feels unfocused - consider summarizing or asking about next steps'
    );
  }

  // ===== OVERALL SCORE =====
  const overallScore = Math.round(
    factors.engagement * 0.3 +
      factors.depth * 0.25 +
      factors.rapport * 0.25 +
      factors.progress * 0.2
  );

  // ===== ASSESSMENT =====
  let assessment: ConversationPacingScore['assessment'];
  if (overallScore >= 80) {
    assessment = 'excellent';
  } else if (overallScore >= 65) {
    assessment = 'good';
  } else if (overallScore >= 50) {
    assessment = 'okay';
  } else if (overallScore >= 35) {
    assessment = 'needs_attention';
    suggestions.push('Try to re-engage - ask about them personally');
  } else {
    assessment = 'struggling';
    suggestions.push('Consider offering to wrap up or change approach');
  }

  return {
    overallScore,
    factors,
    assessment,
    suggestions,
  };
}
