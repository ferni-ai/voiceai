/**
 * Story Timing Intelligence
 *
 * Smart story triggering based on conversation context.
 * Ensures stories are told at the right moment for maximum impact.
 *
 * Features:
 * - Rapport-based gating (don't tell personal stories too early)
 * - Pacing awareness (don't tell stories when user is rushed)
 * - Story spacing (avoid back-to-back stories)
 * - Emotional appropriateness (match story to mood)
 * - Topic relevance scoring
 */

import { seededChance, seededPick, seededIndex } from './utils/rng.js';
import { getLogger } from '../utils/safe-logger.js';
import type { PersonaConfig, StoryConfig } from '../personas/types.js';
import type { EmotionalArc } from './emotional-arc.js';

// ============================================================================
// TYPES
// ============================================================================

export interface StoryTimingContext {
  turnCount: number;
  conversationDurationMs: number;
  lastStoryTurn?: number;
  storiesToldThisSession: string[];
  emotionalArc?: EmotionalArc;
  userEngagement: 'high' | 'medium' | 'low' | 'unknown';
  userPacing: 'rushed' | 'relaxed' | 'normal' | 'unknown';
  currentTopic?: string;
  recentTopics?: string[];
}

export interface StoryRecommendation {
  shouldTell: boolean;
  story?: StoryConfig;
  reason: string;
  timing: 'now' | 'soon' | 'wait' | 'never';
  transitionPhrase?: string;
  confidenceScore: number;
}

export interface StoryMetrics {
  storiesTold: number;
  storiesSkipped: number;
  avgEngagementAfterStory: number;
  successfulStories: string[];
}

// ============================================================================
// STORY TIMING ENGINE
// ============================================================================

export class StoryTimingEngine {
  private storiesTold = new Map<string, number>(); // storyId -> turnTold
  private lastStoryTurn = -10;
  private storyOutcomes = new Map<string, boolean>(); // storyId -> wasWellReceived

  // Timing parameters
  private readonly minTurnsBeforeFirstStory = 4;
  private readonly minTurnsBetweenStories = 6;
  private readonly maxStoriesPerSession = 4;
  private readonly rapportThreshold = 5; // turns needed for "deep" stories

  constructor() {
    getLogger().debug('StoryTimingEngine initialized');
  }

  /**
   * Evaluate if a story should be told now
   */
  evaluateStoryTiming(
    persona: PersonaConfig,
    context: StoryTimingContext,
    candidateStory?: StoryConfig
  ): StoryRecommendation {
    // Check basic gating conditions
    const gatingResult = this.checkGatingConditions(context);
    if (!gatingResult.pass) {
      return {
        shouldTell: false,
        reason: gatingResult.reason,
        timing: gatingResult.timing,
        confidenceScore: 0,
      };
    }

    // If no candidate, find the best story
    const story = candidateStory || this.findBestStory(persona, context);
    if (!story) {
      return {
        shouldTell: false,
        reason: 'No suitable story found for current context',
        timing: 'wait',
        confidenceScore: 0,
      };
    }

    // Score the story fit
    const fitScore = this.scoreStoryFit(story, context);

    // Check emotional appropriateness
    const emotionalFit = this.checkEmotionalFit(story, context);
    if (!emotionalFit.appropriate) {
      return {
        shouldTell: false,
        story,
        reason: emotionalFit.reason,
        timing: 'wait',
        confidenceScore: fitScore * 0.5,
      };
    }

    // Generate transition phrase
    const transition = this.generateTransition(story, context);

    // Final decision
    const shouldTell = fitScore > 0.6 && emotionalFit.appropriate;

    return {
      shouldTell,
      story,
      reason: shouldTell
        ? `Story "${story.id}" is a good fit (score: ${fitScore.toFixed(2)})`
        : `Story fit score too low: ${fitScore.toFixed(2)}`,
      timing: shouldTell ? 'now' : fitScore > 0.4 ? 'soon' : 'wait',
      transitionPhrase: transition,
      confidenceScore: fitScore,
    };
  }

  /**
   * Find the best story for the current context
   */
  findBestStory(persona: PersonaConfig, context: StoryTimingContext): StoryConfig | null {
    if (!persona.stories || persona.stories.length === 0) {
      return null;
    }

    // Filter out already-told stories this session
    const availableStories = persona.stories.filter(
      (s) => !context.storiesToldThisSession.includes(s.id)
    );

    if (availableStories.length === 0) {
      return null;
    }

    // Score each story
    const scored = availableStories.map((story) => ({
      story,
      score: this.scoreStoryFit(story, context),
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Return best if it meets threshold
    if (scored[0].score > 0.4) {
      return scored[0].story;
    }

    return null;
  }

  /**
   * Record that a story was told
   */
  recordStoryTold(storyId: string, turn: number): void {
    this.storiesTold.set(storyId, turn);
    this.lastStoryTurn = turn;
    getLogger().debug(`Recorded story told: ${storyId} at turn ${turn}`);
  }

  /**
   * Record story outcome for learning
   */
  recordStoryOutcome(storyId: string, wasWellReceived: boolean): void {
    this.storyOutcomes.set(storyId, wasWellReceived);
    getLogger().debug(`Recorded story outcome: ${storyId} = ${wasWellReceived}`);
  }

  /**
   * Get metrics for the session
   */
  getMetrics(): StoryMetrics {
    const successful = Array.from(this.storyOutcomes.entries())
      .filter(([, received]) => received)
      .map(([id]) => id);

    return {
      storiesTold: this.storiesTold.size,
      storiesSkipped: 0, // Would need tracking
      avgEngagementAfterStory: successful.length / Math.max(1, this.storiesTold.size),
      successfulStories: successful,
    };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.storiesTold.clear();
    this.lastStoryTurn = -10;
    this.storyOutcomes.clear();
    getLogger().debug('StoryTimingEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private checkGatingConditions(context: StoryTimingContext): {
    pass: boolean;
    reason: string;
    timing: StoryRecommendation['timing'];
  } {
    // Too early in conversation
    if (context.turnCount < this.minTurnsBeforeFirstStory) {
      return {
        pass: false,
        reason: `Too early (turn ${context.turnCount}/${this.minTurnsBeforeFirstStory})`,
        timing: 'soon',
      };
    }

    // Too soon after last story
    const turnsSinceLastStory = context.turnCount - (context.lastStoryTurn ?? -100);
    if (turnsSinceLastStory < this.minTurnsBetweenStories) {
      return {
        pass: false,
        reason: `Too soon after last story (${turnsSinceLastStory}/${this.minTurnsBetweenStories} turns)`,
        timing: 'soon',
      };
    }

    // Max stories reached
    if (context.storiesToldThisSession.length >= this.maxStoriesPerSession) {
      return {
        pass: false,
        reason: `Max stories reached (${this.maxStoriesPerSession})`,
        timing: 'never',
      };
    }

    // User is rushed
    if (context.userPacing === 'rushed') {
      return {
        pass: false,
        reason: 'User seems rushed - not a good time for stories',
        timing: 'wait',
      };
    }

    // Low engagement
    if (context.userEngagement === 'low') {
      return {
        pass: false,
        reason: 'Low engagement - stories may not land well',
        timing: 'wait',
      };
    }

    return { pass: true, reason: 'Gating passed', timing: 'now' };
  }

  private scoreStoryFit(story: StoryConfig, context: StoryTimingContext): number {
    let score = 0.5; // Base score

    // Topic relevance
    if (context.currentTopic || context.recentTopics) {
      const topics = [context.currentTopic, ...(context.recentTopics || [])].filter(Boolean);
      const triggerMatch = story.triggers.some((trigger) =>
        topics.some(
          (topic) =>
            topic?.toLowerCase().includes(trigger.toLowerCase()) ||
            trigger.toLowerCase().includes(topic?.toLowerCase() || '')
        )
      );
      if (triggerMatch) {
        score += 0.3;
      }
    }

    // Engagement bonus
    if (context.userEngagement === 'high') {
      score += 0.15;
    }

    // Rapport bonus for longer conversations
    if (context.turnCount > this.rapportThreshold) {
      score += 0.1;
    }

    // Penalty for very short conversations
    if (context.turnCount < 3) {
      score -= 0.3;
    }

    // Story freshness (prefer untold stories)
    if (!this.storiesTold.has(story.id)) {
      score += 0.1;
    }

    // Historical success bonus
    if (this.storyOutcomes.get(story.id) === true) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  private checkEmotionalFit(
    story: StoryConfig,
    context: StoryTimingContext
  ): { appropriate: boolean; reason: string } {
    const arc = context.emotionalArc;

    if (!arc) {
      return { appropriate: true, reason: 'No emotional data available' };
    }

    // Don't tell lighthearted stories when user is distressed
    if (arc.needsEmotionalSupport) {
      // Check if story has empathetic tone (we'd need this in StoryConfig)
      return {
        appropriate: false,
        reason: 'User needs support - hold off on stories',
      };
    }

    // Volatile emotions - not a good time
    if (arc.trajectory === 'volatile') {
      return {
        appropriate: false,
        reason: 'Emotional state is volatile - stories may not land well',
      };
    }

    // High arousal negative - not a good time
    if (arc.currentArousal > 0.7 && arc.currentValence < -0.2) {
      return {
        appropriate: false,
        reason: 'User seems agitated - focus on them first',
      };
    }

    return { appropriate: true, reason: 'Emotional fit OK' };
  }

  private generateTransition(story: StoryConfig, context: StoryTimingContext): string {
    const transitions = [
      'You know, that reminds me of something...',
      'Speaking of which, let me tell you about...',
      'That brings up something I think about often...',
      'You know what? This reminds me...',
      'I have to tell you about something...',
      'This makes me think of...',
    ];

    // Topic-specific transitions
    if (context.currentTopic) {
      const topicTransitions = [
        `Talking about ${context.currentTopic}... that reminds me...`,
        `On the subject of ${context.currentTopic}, let me share something...`,
        `${context.currentTopic}... you know, that brings up a memory...`,
      ];
      return seededPick(`${Date.now()}:370`, topicTransitions) ?? topicTransitions[0];
    }

    return seededPick(`${Date.now()}:373`, transitions) ?? transitions[0];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: StoryTimingEngine | null = null;

export function getStoryTimingEngine(): StoryTimingEngine {
  if (!instance) {
    instance = new StoryTimingEngine();
  }
  return instance;
}

export function resetStoryTimingEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default StoryTimingEngine;
