/**
 * User Learning Engine - Main Implementation (Refactored)
 *
 * Orchestrates all learning modules to make the AI smarter over time.
 * This is the refactored version that delegates to specialized modules.
 *
 * @module intelligence/user-learning-engine/engine
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile, KeyMoment, EmotionalPattern } from '../../types/user-profile.js';
import type { EmotionResult } from '../detectors/emotion.js';
import type { IntentResult } from '../detectors/intent.js';
import type { ConversationState } from '../state/conversation.js';
import {
  extractSmallDetails,
  type SmallDetail,
  type FarewellSummary,
  generateFarewellSummary,
} from '../tracking/conversation-quality.js';

// Import from split modules
import type { LearningInsight, ConversationLearningData, DynamicUserContext } from './types.js';
import {
  createVoiceEmotionState,
  recordVoiceEmotion as recordVoiceEmotionState,
  validateVoiceEmotionPrediction,
  getVoiceEmotionAccuracy as getVoiceAccuracy,
  type VoiceEmotionState,
} from './voice-validation.js';
import { trackStoryTold, type StoryRecord } from './story-detection.js';
import { captureKeyMoment } from './key-moments.js';
import { learnPreferences, buildPreferenceUpdates } from './preference-learning.js';
import { extractExplicitInsights, captureExternalInsight } from './insight-extraction.js';
import { buildDynamicContext } from './context-building.js';
import { applyLearningToProfile } from './profile-application.js';
import { contributeToCommunnityLearning, getCommunityContext } from './community-learning.js';
import { getProactiveInsight } from './proactive-insights.js';

// Re-export types for backward compatibility
export type { LearningInsight, ConversationLearningData, DynamicUserContext } from './types.js';

const log = getLogger();

// ============================================================================
// USER LEARNING ENGINE
// ============================================================================

export class UserLearningEngine {
  private sessionInsights: LearningInsight[] = [];
  private sessionKeyMoments: KeyMoment[] = [];
  private sessionSmallDetails: SmallDetail[] = [];
  private sessionEmotions: EmotionalPattern[] = [];
  private sessionStoriesTold: StoryRecord[] = [];
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private topicsDiscussed: string[] = [];
  private turnsSinceLastCapture = 0;
  private voiceEmotionState: VoiceEmotionState;

  constructor() {
    this.voiceEmotionState = createVoiceEmotionState();
  }

  /**
   * Process a user turn and extract learning opportunities
   */
  processUserTurn(
    message: string,
    analysis: {
      emotion: EmotionResult;
      intent: IntentResult;
      state: ConversationState;
    },
    profile: UserProfile | null
  ): void {
    this.conversationHistory.push({ role: 'user', content: message });
    this.turnsSinceLastCapture++;

    // 1. Extract small details (names, places, amounts)
    const details = extractSmallDetails(message);
    this.sessionSmallDetails.push(...details);

    // 1b. If we found the user's name, save it to their profile!
    const userNameDetail = details.find((d) => d.type === 'user_name');
    if (userNameDetail && profile && !profile.name) {
      profile.name = userNameDetail.value;
      log.info(
        { name: userNameDetail.value, context: userNameDetail.context },
        '🎉 Learned user name!'
      );
    }

    // 2. Track emotional patterns
    if (analysis.emotion.intensity > 0.5) {
      this.sessionEmotions.push({
        timestamp: new Date(),
        emotion: analysis.emotion.primary,
        intensity: analysis.emotion.intensity,
        context: message.slice(0, 100),
      });
    }

    // 3. Capture topics
    if (
      analysis.state.currentTopic &&
      !this.topicsDiscussed.includes(analysis.state.currentTopic)
    ) {
      this.topicsDiscussed.push(analysis.state.currentTopic);
    }

    // 4. Detect key moments
    captureKeyMoment(this.sessionKeyMoments, message, analysis, this.topicsDiscussed);

    // 5. Learn preferences every 5 turns
    if (this.turnsSinceLastCapture >= 5) {
      learnPreferences(this.conversationHistory, profile, this.sessionInsights);
      this.turnsSinceLastCapture = 0;
    }

    // 6. Extract explicit insights
    extractExplicitInsights(message, analysis.intent, this.topicsDiscussed, this.sessionInsights);

    // 7. Validate voice emotion predictions against text emotion
    validateVoiceEmotionPrediction(this.voiceEmotionState, analysis.emotion);
  }

  /**
   * Record a voice emotion detection for later validation
   */
  recordVoiceEmotion(emotion: string, confidence: number): void {
    recordVoiceEmotionState(this.voiceEmotionState, emotion, confidence);
  }

  /**
   * Get current voice emotion detection accuracy
   */
  getVoiceEmotionAccuracy(): number {
    return getVoiceAccuracy(this.voiceEmotionState);
  }

  /**
   * Process an assistant turn
   * Also tracks stories told to avoid repetition
   */
  processAssistantTurn(message: string): void {
    this.conversationHistory.push({ role: 'assistant', content: message });
    trackStoryTold(this.sessionStoriesTold, message);
  }

  /**
   * Build dynamic context for prompt enrichment
   */
  buildDynamicContext(profile: UserProfile | null): DynamicUserContext {
    return buildDynamicContext(
      profile,
      this.sessionInsights,
      this.sessionKeyMoments,
      this.sessionSmallDetails,
      this.sessionEmotions,
      this.topicsDiscussed,
      this.conversationHistory
    );
  }

  /**
   * Finalize session and return all learning data
   */
  finalizeSession(profile: UserProfile | null): ConversationLearningData {
    // Generate farewell summary
    let farewellSummary: FarewellSummary | undefined;
    if (this.conversationHistory.length > 2) {
      const startEmotion = this.sessionEmotions[0]?.emotion || 'neutral';
      const endEmotion =
        this.sessionEmotions[this.sessionEmotions.length - 1]?.emotion || 'neutral';

      farewellSummary = generateFarewellSummary(
        this.conversationHistory,
        this.topicsDiscussed,
        profile as {
          name?: string;
          goals?: Array<{ type: string; status: string }>;
          familyMembers?: Array<{ name: string; relationship: string }>;
        } | null,
        { start: startEmotion, end: endEmotion }
      );
    }

    // Deduplicate insights by key, keeping highest confidence
    const uniqueInsights = new Map<string, LearningInsight>();
    for (const insight of this.sessionInsights) {
      const existing = uniqueInsights.get(insight.key);
      if (!existing || insight.confidence > existing.confidence) {
        uniqueInsights.set(insight.key, insight);
      }
    }

    return {
      insights: Array.from(uniqueInsights.values()),
      keyMoments: this.sessionKeyMoments,
      smallDetails: this.sessionSmallDetails,
      emotionalPatterns: this.sessionEmotions,
      storiesTold: this.sessionStoriesTold,
      preferenceUpdates: buildPreferenceUpdates(this.sessionInsights),
      followUps: farewellSummary?.followUps || [],
      farewellSummary,
    };
  }

  /**
   * Apply learning data to user profile
   */
  static applyLearningToProfile(
    profile: UserProfile,
    learning: ConversationLearningData
  ): UserProfile {
    return applyLearningToProfile(profile, learning);
  }

  /**
   * Get current session stats
   */
  getSessionStats(): {
    turns: number;
    keyMoments: number;
    insights: number;
    detailsCaptured: number;
    storiesTold: number;
    topicsDiscussed: string[];
  } {
    return {
      turns: this.conversationHistory.length,
      keyMoments: this.sessionKeyMoments.length,
      insights: this.sessionInsights.length,
      detailsCaptured: this.sessionSmallDetails.length,
      storiesTold: this.sessionStoriesTold.length,
      topicsDiscussed: [...this.topicsDiscussed],
    };
  }

  /**
   * Get current session key moments (for real-time retrieval)
   */
  getCurrentSessionKeyMoments(): KeyMoment[] {
    return [...this.sessionKeyMoments];
  }

  /**
   * Get current session small details (for real-time callbacks)
   */
  getCurrentSessionDetails(): SmallDetail[] {
    return [...this.sessionSmallDetails];
  }

  /**
   * Get current session topics
   */
  getCurrentSessionTopics(): string[] {
    return [...this.topicsDiscussed];
  }

  /**
   * Capture an external insight (from tasks, conversation manager, etc.)
   */
  captureExternalInsight(insight: Omit<LearningInsight, 'capturedAt'>): void {
    captureExternalInsight(this.sessionInsights, insight);
    log.debug({ type: insight.type, key: insight.key }, 'Captured external insight');
  }

  /**
   * Capture an external key moment (from tasks, conversation manager, etc.)
   */
  captureExternalKeyMoment(moment: KeyMoment): void {
    this.sessionKeyMoments.push(moment);
    log.info({ type: moment.type, summary: moment.summary }, 'Captured external key moment');
  }

  /**
   * Generate proactive insights
   */
  getProactiveInsight(profile: UserProfile | null, turnCount: number): string | null {
    return getProactiveInsight(
      profile,
      turnCount,
      this.sessionSmallDetails,
      this.topicsDiscussed,
      this.conversationHistory
    );
  }

  /**
   * Contribute session learnings to community insights
   */
  contributeToCommunnityLearning(
    personaId: string,
    sessionData: {
      engagementScores: number[];
      userSatisfaction: 'positive' | 'neutral' | 'negative';
      breakthoughQuestions?: Array<{ question: string; engagementLift: number }>;
    }
  ): void {
    contributeToCommunnityLearning(
      personaId,
      sessionData,
      this.conversationHistory,
      this.sessionEmotions,
      this.topicsDiscussed,
      this.sessionKeyMoments,
      this.sessionStoriesTold
    );
  }

  /**
   * Get community-informed context for better responses
   */
  getCommunityContext(
    personaId: string,
    context: {
      userEmotion: string;
      topic: string;
      relationshipStage: string;
    }
  ): {
    suggestedStrategy?: string;
    recommendedStories?: string[];
    effectiveQuestions?: string[];
    adjustments?: string[];
  } {
    return getCommunityContext(personaId, context);
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.sessionInsights = [];
    this.sessionKeyMoments = [];
    this.sessionSmallDetails = [];
    this.sessionEmotions = [];
    this.sessionStoriesTold = [];
    this.conversationHistory = [];
    this.topicsDiscussed = [];
    this.turnsSinceLastCapture = 0;
    this.voiceEmotionState = createVoiceEmotionState();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engine: UserLearningEngine | null = null;

/**
 * Get the singleton learning engine
 */
export function getLearningEngine(): UserLearningEngine {
  if (!engine) {
    engine = new UserLearningEngine();
  }
  return engine;
}

/**
 * Reset for testing or new session
 */
export function resetLearningEngine(): void {
  if (engine) {
    engine.reset();
  }
  engine = null;
}

export default UserLearningEngine;
