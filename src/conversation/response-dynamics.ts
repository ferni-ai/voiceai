/**
 * Response Dynamics
 *
 * Dynamically adapts response characteristics based on user behavior.
 *
 * Features:
 * - Response length adaptation (mirror user verbosity)
 * - Topic transition phrases (smooth topic changes)
 * - Pacing detection (rushed vs relaxed user)
 * - Turn-taking optimization
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UserEngagementMetrics {
  // Message characteristics
  avgWordCount: number;
  recentWordCounts: number[];
  avgResponseTimeMs: number;

  // Engagement signals
  questionsAsked: number;
  detailedResponses: number; // > 50 words
  shortResponses: number; // < 10 words

  // Pacing
  isRushed: boolean;
  isRelaxed: boolean;

  // Turn patterns
  interruptions: number;
  longestTurnWords: number;
}

export interface ResponseLengthRecommendation {
  targetWordCount: number;
  range: { min: number; max: number };
  rationale: string;
  shouldAbbreviate: boolean;
  shouldElaborate: boolean;
}

export interface TopicTransition {
  type: 'smooth' | 'acknowledgment' | 'redirect' | 'callback';
  phrase: string;
  fromTopic?: string;
  toTopic?: string;
}

export interface PacingAnalysis {
  userPacing: 'rushed' | 'normal' | 'relaxed' | 'unknown';
  confidence: number;
  suggestedAgentPacing: 'faster' | 'normal' | 'slower';
  timeOfDayFactor: 'morning' | 'afternoon' | 'evening' | 'night';
}

// ============================================================================
// RESPONSE DYNAMICS ENGINE
// ============================================================================

export class ResponseDynamicsEngine {
  private messageHistory: Array<{
    role: 'user' | 'agent';
    wordCount: number;
    timestamp: number;
    topics?: string[];
  }> = [];

  private interruptionCount = 0;
  private readonly maxHistory = 30;

  constructor() {
    getLogger().debug('ResponseDynamicsEngine initialized');
  }

  /**
   * Record a message for analysis
   */
  recordMessage(role: 'user' | 'agent', text: string, topics?: string[]): void {
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

    this.messageHistory.push({
      role,
      wordCount,
      timestamp: Date.now(),
      topics,
    });

    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }
  }

  /**
   * Record an interruption
   */
  recordInterruption(): void {
    this.interruptionCount++;
  }

  /**
   * Get response length recommendation
   */
  getResponseLengthRecommendation(): ResponseLengthRecommendation {
    const userMessages = this.messageHistory.filter((m) => m.role === 'user');

    if (userMessages.length < 2) {
      return {
        targetWordCount: 40,
        range: { min: 20, max: 60 },
        rationale: 'Not enough data - using default length',
        shouldAbbreviate: false,
        shouldElaborate: false,
      };
    }

    // Calculate user's average word count
    const recentUserMessages = userMessages.slice(-5);
    const avgUserWords =
      recentUserMessages.reduce((sum, m) => sum + m.wordCount, 0) / recentUserMessages.length;

    // Calculate trend (are they getting shorter or longer?)
    const trend = this.calculateTrend(recentUserMessages.map((m) => m.wordCount));

    // Check interruption rate
    const interruptionRate = this.interruptionCount / Math.max(1, userMessages.length);

    // Base target on user's verbosity
    let targetWordCount = Math.round(avgUserWords * 1.2); // Slightly more than user

    // Adjustments
    if (interruptionRate > 0.2) {
      // User interrupts often - shorten responses
      targetWordCount = Math.round(targetWordCount * 0.7);
    }

    if (trend < -0.2) {
      // User messages getting shorter - they want brevity
      targetWordCount = Math.round(targetWordCount * 0.8);
    } else if (trend > 0.2) {
      // User messages getting longer - they want depth
      targetWordCount = Math.round(targetWordCount * 1.2);
    }

    // Time of day adjustment
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) {
      // Late night - shorter responses
      targetWordCount = Math.round(targetWordCount * 0.8);
    }

    // Clamp to reasonable range
    targetWordCount = Math.max(15, Math.min(120, targetWordCount));

    const shouldAbbreviate = avgUserWords < 15 || interruptionRate > 0.25;
    const shouldElaborate = avgUserWords > 50 && trend > 0;

    return {
      targetWordCount,
      range: {
        min: Math.round(targetWordCount * 0.6),
        max: Math.round(targetWordCount * 1.4),
      },
      rationale: this.generateLengthRationale(avgUserWords, trend, interruptionRate),
      shouldAbbreviate,
      shouldElaborate,
    };
  }

  /**
   * Get a topic transition phrase
   */
  getTopicTransition(
    fromTopic: string | null,
    toTopic: string | null,
    transitionType?: TopicTransition['type']
  ): TopicTransition {
    const type = transitionType || this.determineTransitionType(fromTopic, toTopic);

    return {
      type,
      phrase: this.generateTransitionPhrase(type, fromTopic, toTopic),
      fromTopic: fromTopic || undefined,
      toTopic: toTopic || undefined,
    };
  }

  /**
   * Get pacing analysis
   */
  getPacingAnalysis(): PacingAnalysis {
    const userMessages = this.messageHistory.filter((m) => m.role === 'user');

    if (userMessages.length < 3) {
      return {
        userPacing: 'unknown',
        confidence: 0,
        suggestedAgentPacing: 'normal',
        timeOfDayFactor: this.getTimeOfDay(),
      };
    }

    // Calculate average response time
    const responseTimes: number[] = [];
    for (let i = 1; i < userMessages.length; i++) {
      responseTimes.push(userMessages[i].timestamp - userMessages[i - 1].timestamp);
    }

    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    // Calculate message velocity (words per minute over session)
    const totalWords = userMessages.reduce((sum, m) => sum + m.wordCount, 0);
    const sessionDuration = Date.now() - userMessages[0].timestamp;
    const wordsPerMinute = (totalWords / sessionDuration) * 60000;

    // Determine pacing
    let pacing: PacingAnalysis['userPacing'] = 'normal';
    let confidence = 0.5;

    if (avgResponseTime < 3000 && wordsPerMinute > 50) {
      pacing = 'rushed';
      confidence = 0.8;
    } else if (avgResponseTime > 15000 || wordsPerMinute < 15) {
      pacing = 'relaxed';
      confidence = 0.7;
    } else {
      confidence = 0.6;
    }

    // Suggested agent pacing
    let suggestedPacing: PacingAnalysis['suggestedAgentPacing'] = 'normal';
    if (pacing === 'rushed') {
      suggestedPacing = 'faster'; // Keep up but don't rush
    } else if (pacing === 'relaxed') {
      suggestedPacing = 'slower'; // Match their pace
    }

    return {
      userPacing: pacing,
      confidence,
      suggestedAgentPacing: suggestedPacing,
      timeOfDayFactor: this.getTimeOfDay(),
    };
  }

  /**
   * Get engagement metrics
   */
  getEngagementMetrics(): UserEngagementMetrics {
    const userMessages = this.messageHistory.filter((m) => m.role === 'user');
    const wordCounts = userMessages.map((m) => m.wordCount);

    const avgWordCount =
      wordCounts.length > 0 ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length : 0;

    // Count questions (messages with ?)
    const questionsAsked = userMessages.filter((m) =>
      this.messageHistory.find((msg) => msg === m)
    ).length; // Simplified - would need actual text

    const detailed = wordCounts.filter((c) => c > 50).length;
    const short = wordCounts.filter((c) => c < 10).length;

    const pacing = this.getPacingAnalysis();

    return {
      avgWordCount,
      recentWordCounts: wordCounts.slice(-5),
      avgResponseTimeMs: this.calculateAvgResponseTime(),
      questionsAsked,
      detailedResponses: detailed,
      shortResponses: short,
      isRushed: pacing.userPacing === 'rushed',
      isRelaxed: pacing.userPacing === 'relaxed',
      interruptions: this.interruptionCount,
      longestTurnWords: Math.max(...wordCounts, 0),
    };
  }

  /**
   * Get length guidance string for LLM prompt
   */
  getLengthGuidance(): string {
    const rec = this.getResponseLengthRecommendation();
    const pacing = this.getPacingAnalysis();

    let guidance = `[RESPONSE LENGTH: Target ~${rec.targetWordCount} words (${rec.range.min}-${rec.range.max} range)]`;

    if (rec.shouldAbbreviate) {
      guidance += '\n[Keep response BRIEF - user prefers shorter answers]';
    } else if (rec.shouldElaborate) {
      guidance += '\n[User appreciates detail - can elaborate more]';
    }

    if (pacing.userPacing === 'rushed') {
      guidance += '\n[User seems rushed - be concise and to the point]';
    } else if (pacing.userPacing === 'relaxed') {
      guidance += '\n[User is relaxed - can take time, add warmth]';
    }

    if (pacing.timeOfDayFactor === 'night') {
      guidance += '\n[Late night - shorter, calmer responses]';
    }

    return guidance;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.messageHistory = [];
    this.interruptionCount = 0;
    getLogger().debug('ResponseDynamicsEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    // Simple linear regression slope
    const n = values.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Normalize by average value
    const avg = sumY / n;
    return avg > 0 ? slope / avg : 0;
  }

  private calculateAvgResponseTime(): number {
    const userMessages = this.messageHistory.filter((m) => m.role === 'user');
    if (userMessages.length < 2) return 0;

    let totalTime = 0;
    for (let i = 1; i < userMessages.length; i++) {
      totalTime += userMessages[i].timestamp - userMessages[i - 1].timestamp;
    }

    return totalTime / (userMessages.length - 1);
  }

  private generateLengthRationale(
    avgUserWords: number,
    trend: number,
    interruptionRate: number
  ): string {
    const parts: string[] = [];

    if (avgUserWords < 15) {
      parts.push('User prefers brief exchanges');
    } else if (avgUserWords > 50) {
      parts.push('User is verbose and engaged');
    }

    if (trend < -0.2) {
      parts.push('messages getting shorter');
    } else if (trend > 0.2) {
      parts.push('messages getting longer');
    }

    if (interruptionRate > 0.2) {
      parts.push('frequent interruptions detected');
    }

    return parts.join(', ') || 'Standard response length';
  }

  private determineTransitionType(
    fromTopic: string | null,
    toTopic: string | null
  ): TopicTransition['type'] {
    if (!fromTopic && toTopic) {
      return 'smooth'; // New topic introduction
    }
    if (fromTopic && !toTopic) {
      return 'acknowledgment'; // Wrapping up topic
    }
    if (fromTopic === toTopic) {
      return 'acknowledgment'; // Continuing same topic
    }

    // Check if returning to previous topic
    const previousTopics = this.messageHistory
      .filter((m) => m.topics)
      .flatMap((m) => m.topics || []);

    if (toTopic && previousTopics.slice(0, -5).includes(toTopic)) {
      return 'callback'; // Returning to earlier topic
    }

    return 'smooth';
  }

  private generateTransitionPhrase(
    type: TopicTransition['type'],
    fromTopic: string | null,
    toTopic: string | null
  ): string {
    switch (type) {
      case 'smooth':
        if (toTopic) {
          const phrases = [
            `Speaking of ${toTopic}...`,
            `That brings up ${toTopic}...`,
            `On the topic of ${toTopic}...`,
            `About ${toTopic}...`,
          ];
          return phrases[Math.floor(Math.random() * phrases.length)];
        }
        return '';

      case 'acknowledgment': {
        const ackPhrases = [
          'Right, I hear you.',
          'Yes, that makes sense.',
          'I understand.',
          'Got it.',
        ];
        return ackPhrases[Math.floor(Math.random() * ackPhrases.length)];
      }

      case 'redirect': {
        const redirectPhrases = [
          'Let me ask about something else...',
          'On a different note...',
          'Changing gears a bit...',
        ];
        return redirectPhrases[Math.floor(Math.random() * redirectPhrases.length)];
      }

      case 'callback':
        if (toTopic) {
          const callbackPhrases = [
            `Going back to what you said about ${toTopic}...`,
            `I wanted to circle back to ${toTopic}...`,
            `Remember when we talked about ${toTopic}?`,
            `Earlier you mentioned ${toTopic}...`,
          ];
          return callbackPhrases[Math.floor(Math.random() * callbackPhrases.length)];
        }
        return 'Going back to what you mentioned earlier...';

      default:
        return '';
    }
  }

  private getTimeOfDay(): PacingAnalysis['timeOfDayFactor'] {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ResponseDynamicsEngine | null = null;

export function getResponseDynamicsEngine(): ResponseDynamicsEngine {
  if (!instance) {
    instance = new ResponseDynamicsEngine();
  }
  return instance;
}

export function resetResponseDynamicsEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default ResponseDynamicsEngine;
