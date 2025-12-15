/**
 * User Engagement Detection
 *
 * Detects user engagement level from conversation patterns.
 *
 * @module intelligence/human-behaviors/engagement-detection
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementSignals {
  level: 'highly_engaged' | 'engaged' | 'neutral' | 'disengaged' | 'checked_out';
  indicators: string[];
  suggestions: string[];
}

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Detect user engagement level from conversation patterns
 */
export function detectUserEngagement(
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string; lengthMs?: number }>,
  _averageResponseTime?: number
): EngagementSignals {
  if (recentMessages.length < 2) {
    return { level: 'neutral', indicators: [], suggestions: [] };
  }

  const userMessages = recentMessages.filter((m) => m.role === 'user').slice(-5);
  const indicators: string[] = [];
  const suggestions: string[] = [];
  let score = 0.5; // Neutral start

  // Check message lengths
  const avgUserLength =
    userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

  if (avgUserLength < 15) {
    score -= 0.2;
    indicators.push('Very short responses');
    suggestions.push('Ask an open-ended question to re-engage');
  } else if (avgUserLength < 30) {
    score -= 0.1;
    indicators.push('Short responses');
  } else if (avgUserLength > 100) {
    score += 0.2;
    indicators.push('Detailed, thoughtful responses');
  } else if (avgUserLength > 60) {
    score += 0.1;
    indicators.push('Good response length');
  }

  // Check for one-word answers
  const oneWordCount = userMessages.filter((m) => m.content.trim().split(/\s+/).length <= 2).length;
  if (oneWordCount >= 3) {
    score -= 0.25;
    indicators.push('Multiple one-word answers');
    suggestions.push('Try changing the topic or asking about them personally');
  }

  // Check for questions being asked
  const questionCount = userMessages.filter((m) => m.content.includes('?')).length;
  if (questionCount >= 2) {
    score += 0.15;
    indicators.push('User asking questions - curious and engaged');
  }

  // Check for emotional language
  const emotionalWords =
    /\b(love|hate|amazing|terrible|excited|worried|scared|happy|sad|frustrated|confused|interested)\b/i;
  const emotionalCount = userMessages.filter((m) => emotionalWords.test(m.content)).length;
  if (emotionalCount >= 2) {
    score += 0.15;
    indicators.push('Emotional language - invested in conversation');
  }

  // Check for dismissive patterns
  const dismissivePattern = /^(yeah|yep|ok|okay|sure|uh huh|mhm|i guess|whatever)\s*[.!]?$/i;
  const dismissiveCount = userMessages.filter((m) =>
    dismissivePattern.test(m.content.trim())
  ).length;
  if (dismissiveCount >= 2) {
    score -= 0.3;
    indicators.push('Dismissive responses');
    suggestions.push('User may want to wrap up - offer a graceful exit');
  }

  // Determine level
  let level: EngagementSignals['level'];
  if (score >= 0.7) {
    level = 'highly_engaged';
  } else if (score >= 0.5) {
    level = 'engaged';
  } else if (score >= 0.3) {
    level = 'neutral';
  } else if (score >= 0.1) {
    level = 'disengaged';
  } else {
    level = 'checked_out';
    suggestions.push('Consider offering to continue another time');
  }

  return { level, indicators, suggestions };
}

export default detectUserEngagement;
