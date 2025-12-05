/**
 * Emotional Memory Engine
 *
 * Tracks emotional states across sessions to enable:
 * - "Last time we talked, you seemed stressed about work"
 * - "You were really excited about that investment - how's it going?"
 * - "I remember when you were worried about your daughter's college"
 *
 * Creates deeper human connection through emotional continuity.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { PrimaryEmotion } from './emotion-detector.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalMoment {
  id: string;
  timestamp: Date;
  sessionId: string;
  
  // What was felt
  emotion: PrimaryEmotion;
  intensity: 'mild' | 'moderate' | 'strong';
  
  // Context
  topic: string;
  trigger: string;         // What caused this emotion
  userStatement: string;   // What user said
  
  // Resolution
  resolved?: boolean;
  resolutionNote?: string;
  followedUp?: boolean;
}

export interface EmotionalPattern {
  topic: string;
  emotions: PrimaryEmotion[];
  frequency: number;
  lastSeen: Date;
  trend: 'improving' | 'stable' | 'worsening' | 'unknown';
}

export interface EmotionalCheckIn {
  type: 'follow_up' | 'celebration' | 'support' | 'curiosity';
  reference: string;         // What to reference
  suggestedOpener: string;   // How to bring it up
  priority: 'high' | 'medium' | 'low';
  moment: EmotionalMoment;
}

export interface EmotionalContext {
  // For LLM context injection
  recentEmotions: string[];
  unresolvedConcerns: string[];
  celebratableWins: string[];
  checkInSuggestions: EmotionalCheckIn[];
}

// ============================================================================
// EMOTIONAL MEMORY ENGINE
// ============================================================================

export class EmotionalMemoryEngine {
  private moments: EmotionalMoment[] = [];
  private currentSessionId: string = '';
  private lastSessionEmotions: EmotionalMoment[] = [];

  constructor() {
    getLogger().debug('EmotionalMemoryEngine initialized');
  }

  // ============================================================================
  // MOMENT CAPTURE
  // ============================================================================

  /**
   * Record a significant emotional moment
   */
  recordMoment(
    emotion: PrimaryEmotion,
    topic: string,
    trigger: string,
    userStatement: string,
    intensity: 'mild' | 'moderate' | 'strong' = 'moderate'
  ): string {
    // Only capture significant emotions (not neutral)
    if (emotion === 'neutral') return '';

    // Avoid duplicates in quick succession
    const recentSimilar = this.moments.find(m => 
      m.topic === topic && 
      m.emotion === emotion &&
      Date.now() - m.timestamp.getTime() < 60000 // 1 minute
    );
    if (recentSimilar) return recentSimilar.id;

    const moment: EmotionalMoment = {
      id: `emo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      sessionId: this.currentSessionId,
      emotion,
      intensity,
      topic,
      trigger,
      userStatement: userStatement.slice(0, 200),
      resolved: false,
      followedUp: false,
    };

    this.moments.push(moment);

    // Keep last 100 moments
    if (this.moments.length > 100) {
      this.moments = this.moments.slice(-100);
    }

    getLogger().debug({
      emotion,
      topic,
      intensity,
    }, 'Emotional moment recorded');

    return moment.id;
  }

  /**
   * Mark a concern as resolved
   */
  resolveEmotion(momentId: string, note?: string): void {
    const moment = this.moments.find(m => m.id === momentId);
    if (moment) {
      moment.resolved = true;
      moment.resolutionNote = note;
      getLogger().debug({ momentId }, 'Emotion resolved');
    }
  }

  /**
   * Mark that we followed up on something
   */
  markFollowedUp(momentId: string): void {
    const moment = this.moments.find(m => m.id === momentId);
    if (moment) {
      moment.followedUp = true;
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Start a new session, snapshot previous session emotions
   */
  startSession(sessionId: string): void {
    // Store emotions from last session before resetting
    if (this.currentSessionId) {
      this.lastSessionEmotions = this.moments.filter(
        m => m.sessionId === this.currentSessionId
      );
    }
    this.currentSessionId = sessionId;
    getLogger().debug({ sessionId }, 'Emotional memory session started');
  }

  // ============================================================================
  // PATTERN DETECTION
  // ============================================================================

  /**
   * Detect emotional patterns around topics
   */
  detectPatterns(): EmotionalPattern[] {
    const topicEmotions = new Map<string, { emotions: PrimaryEmotion[], dates: Date[] }>();

    for (const moment of this.moments) {
      const existing = topicEmotions.get(moment.topic) || { emotions: [], dates: [] };
      existing.emotions.push(moment.emotion);
      existing.dates.push(moment.timestamp);
      topicEmotions.set(moment.topic, existing);
    }

    const patterns: EmotionalPattern[] = [];

    for (const [topic, data] of topicEmotions.entries()) {
      if (data.emotions.length >= 2) {
        // Detect trend (compare recent vs older emotions)
        const midpoint = Math.floor(data.emotions.length / 2);
        const olderEmotions = data.emotions.slice(0, midpoint);
        const newerEmotions = data.emotions.slice(midpoint);

        const olderPositive = olderEmotions.filter(e => this.isPositive(e)).length;
        const newerPositive = newerEmotions.filter(e => this.isPositive(e)).length;

        let trend: 'improving' | 'stable' | 'worsening' | 'unknown' = 'unknown';
        if (data.emotions.length >= 4) {
          const oldRatio = olderPositive / olderEmotions.length;
          const newRatio = newerPositive / newerEmotions.length;
          if (newRatio > oldRatio + 0.2) trend = 'improving';
          else if (newRatio < oldRatio - 0.2) trend = 'worsening';
          else trend = 'stable';
        }

        patterns.push({
          topic,
          emotions: [...new Set(data.emotions)], // Unique emotions
          frequency: data.emotions.length,
          lastSeen: new Date(Math.max(...data.dates.map(d => d.getTime()))),
          trend,
        });
      }
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  private isPositive(emotion: PrimaryEmotion): boolean {
    return ['joy', 'trust', 'anticipation'].includes(emotion);
  }

  // ============================================================================
  // CHECK-IN SUGGESTIONS
  // ============================================================================

  /**
   * Get suggested emotional check-ins for conversation start
   */
  getCheckInSuggestions(): EmotionalCheckIn[] {
    const suggestions: EmotionalCheckIn[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Check last session emotions
    for (const moment of this.lastSessionEmotions) {
      if (moment.followedUp) continue;

      const ageInDays = (now - moment.timestamp.getTime()) / dayMs;

      // Recent stress/anxiety - follow up
      if (['fear', 'anxiety', 'sadness', 'anger'].includes(moment.emotion)) {
        if (ageInDays <= 7 && !moment.resolved) {
          suggestions.push({
            type: 'follow_up',
            reference: moment.topic,
            suggestedOpener: this.generateFollowUpOpener(moment),
            priority: ageInDays <= 2 ? 'high' : 'medium',
            moment,
          });
        }
      }

      // Recent excitement - celebrate/check in
      if (['joy', 'anticipation'].includes(moment.emotion)) {
        if (ageInDays <= 14 && moment.intensity !== 'mild') {
          suggestions.push({
            type: 'celebration',
            reference: moment.topic,
            suggestedOpener: this.generateCelebrationOpener(moment),
            priority: ageInDays <= 3 ? 'high' : 'medium',
            moment,
          });
        }
      }
    }

    // Look for unresolved concerns from any session
    const unresolvedConcerns = this.moments.filter(
      m => !m.resolved && 
           !m.followedUp &&
           ['fear', 'anxiety', 'sadness'].includes(m.emotion) &&
           (now - m.timestamp.getTime()) / dayMs <= 30
    );

    for (const concern of unresolvedConcerns.slice(0, 3)) {
      if (!suggestions.find(s => s.moment.id === concern.id)) {
        suggestions.push({
          type: 'support',
          reference: concern.topic,
          suggestedOpener: this.generateSupportOpener(concern),
          priority: 'low',
          moment: concern,
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 3);
  }

  private generateFollowUpOpener(moment: EmotionalMoment): string {
    const templates = {
      fear: [
        `Last time we talked, you seemed worried about ${moment.topic}. How are you feeling about that now?`,
        `I've been thinking about what you shared about ${moment.topic}. Has the situation improved?`,
      ],
      anxiety: [
        `You mentioned being anxious about ${moment.topic} before. How's that going?`,
        `I remember you were concerned about ${moment.topic}. Any updates?`,
      ],
      sadness: [
        `I wanted to check in about ${moment.topic}. You seemed down about it last time.`,
        `How are you feeling about ${moment.topic} now? I remember it was weighing on you.`,
      ],
      anger: [
        `Last time you were frustrated about ${moment.topic}. Has that situation resolved?`,
        `You seemed upset about ${moment.topic} before. How are things now?`,
      ],
    };

    const options = templates[moment.emotion as keyof typeof templates] || [
      `How are things with ${moment.topic}? You mentioned it last time.`,
    ];

    return options[Math.floor(Math.random() * options.length)];
  }

  private generateCelebrationOpener(moment: EmotionalMoment): string {
    const templates = [
      `You were so excited about ${moment.topic}! How did that turn out?`,
      `I remember how happy you were about ${moment.topic}. Tell me more!`,
      `Last time you were really looking forward to ${moment.topic}. How'd it go?`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateSupportOpener(moment: EmotionalMoment): string {
    return `By the way, how are things with ${moment.topic}? It's been on my mind.`;
  }

  // ============================================================================
  // CONTEXT FOR LLM
  // ============================================================================

  /**
   * Build emotional context for LLM prompt
   */
  buildEmotionalContext(): EmotionalContext {
    const checkIns = this.getCheckInSuggestions();
    
    // Get recent session emotions
    const recentEmotions = this.lastSessionEmotions
      .slice(-5)
      .map(m => `${m.emotion} about ${m.topic}`);

    // Get unresolved concerns
    const unresolvedConcerns = this.moments
      .filter(m => !m.resolved && ['fear', 'anxiety', 'sadness'].includes(m.emotion))
      .slice(-3)
      .map(m => m.topic);

    // Get celebratable wins (recent positive, intense moments)
    const celebratableWins = this.moments
      .filter(m => 
        ['joy', 'anticipation'].includes(m.emotion) && 
        m.intensity !== 'mild' &&
        Date.now() - m.timestamp.getTime() < 14 * 24 * 60 * 60 * 1000
      )
      .slice(-3)
      .map(m => m.topic);

    return {
      recentEmotions,
      unresolvedConcerns,
      celebratableWins,
      checkInSuggestions: checkIns,
    };
  }

  /**
   * Format for LLM prompt injection
   */
  formatForPrompt(): string {
    const context = this.buildEmotionalContext();
    const lines: string[] = [];

    if (context.checkInSuggestions.length > 0) {
      const topSuggestion = context.checkInSuggestions[0];
      lines.push(`[EMOTIONAL MEMORY] Consider checking in: "${topSuggestion.suggestedOpener}"`);
    }

    if (context.unresolvedConcerns.length > 0) {
      lines.push(`User may still be processing: ${context.unresolvedConcerns.join(', ')}`);
    }

    if (context.celebratableWins.length > 0) {
      lines.push(`Recent positive topics to celebrate: ${context.celebratableWins.join(', ')}`);
    }

    if (lines.length === 0) {
      return '';
    }

    return lines.join('\n');
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Export moments for persistence
   */
  exportMoments(): EmotionalMoment[] {
    return [...this.moments];
  }

  /**
   * Import moments from storage
   */
  importMoments(moments: EmotionalMoment[]): void {
    this.moments = moments.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    getLogger().debug({ count: moments.length }, 'Emotional moments imported');
  }

  /**
   * Get stats
   */
  getStats() {
    const patterns = this.detectPatterns();
    return {
      totalMoments: this.moments.length,
      lastSessionMoments: this.lastSessionEmotions.length,
      unresolvedCount: this.moments.filter(m => !m.resolved).length,
      topPatterns: patterns.slice(0, 3).map(p => ({
        topic: p.topic,
        trend: p.trend,
      })),
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, EmotionalMemoryEngine>();

export function getEmotionalMemory(userId: string): EmotionalMemoryEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new EmotionalMemoryEngine());
  }
  return engines.get(userId)!;
}

export function removeEmotionalMemory(userId: string): void {
  engines.delete(userId);
}

