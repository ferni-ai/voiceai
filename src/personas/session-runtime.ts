/**
 * Session Bundle Runtime Manager
 *
 * Wraps the BundleRuntimeEngine and integrates shared utilities:
 * - Life events (birthdays, anniversaries, milestones)
 * - Welcome back messaging (time-based greetings)
 * - Relationship building (deepening questions, callbacks)
 * - Team dynamics (handoff context, teammate mentions)
 *
 * This provides a unified API for all session-level persona content,
 * making it easy to wire up rich, relationship-aware interactions.
 */

import type { RelationshipStage, UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';
import { createBundleRuntime } from './bundles/index.js';
import { loadBundleById } from './bundles/loader.js';
import type { BundleRuntimeEngine, BundleRuntimeState } from './bundles/runtime.js';

// Import shared utilities
import {
  findEventsToAcknowledge,
  generateEventAcknowledgment,
  getUpcomingEventMention,
  isEventSoon,
  type LifeEvent,
} from './shared/life-events.js';
import {
  generateCallback,
  getAcknowledgment,
  getDeepeningQuestion,
  getStageClosing,
  getStageGreeting,
  shouldSharePersonalStory,
} from './shared/relationship-building.js';
import { getCasualMention, getHandoffWarmth, getOpinionAbout } from './shared/team-dynamics.js';
import {
  generateWelcomeBack,
  getMilestoneMessage,
  isMilestoneConversation,
} from './shared/welcome-back.js';

// Import new intelligence systems
import type { PersonaIntelligenceEngine } from './persona-intelligence.js';
import { getPersonaIntelligence, type UnifiedPromptInjection } from './persona-intelligence.js';
import type { RelationshipMemory, SharedMomentType } from './relationship-memory/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface SessionRuntimeConfig {
  personaId: string;
  userProfile?: UserProfile;
  lifeEvents?: LifeEvent[];
  initialState?: Partial<BundleRuntimeState>;
  /** Enable the unified persona intelligence engine */
  enableIntelligence?: boolean;
  /** Existing relationship memory to restore (for returning users) */
  existingRelationshipMemory?: RelationshipMemory;
}

export interface SessionContext {
  userName?: string;
  lastConversationDate?: Date;
  conversationCount?: number;
  relationshipStage?: RelationshipStage;
  currentTopic?: string;
  detectedEmotion?: string;
  /** Current emotional state for handoff context */
  emotionalState?: 'high_emotion' | 'excited' | 'struggling' | 'neutral';
}

export interface WelcomeBackResult {
  greeting: string;
  type: 'same_day' | 'next_day' | 'few_days' | 'week' | 'weeks' | 'month' | 'long_time' | 'new';
  hasMilestone: boolean;
  milestoneMessage?: string;
  lifeEventAcknowledgment?: string;
}

export interface SessionEnhancements {
  welcomeBack?: WelcomeBackResult;
  deepeningQuestion?: string;
  callback?: string;
  acknowledgment?: string;
  storyRecommended: boolean;
  teamMention?: string;
  /** Unified intelligence prompt injection */
  intelligenceInjection?: UnifiedPromptInjection;
}

// ============================================================================
// SESSION BUNDLE RUNTIME MANAGER
// ============================================================================

export class SessionBundleRuntimeManager {
  private bundleRuntime: BundleRuntimeEngine | null = null;
  private personaId: string;
  private userProfile?: UserProfile;
  private lifeEvents: LifeEvent[] = [];
  private initialized = false;

  // New intelligence engine
  private intelligenceEngine: PersonaIntelligenceEngine | null = null;
  private userId?: string;

  constructor(config: SessionRuntimeConfig) {
    this.personaId = config.personaId;
    this.userProfile = config.userProfile;
    this.lifeEvents = config.lifeEvents || [];
    this.userId = config.userProfile?.id;
  }

  /**
   * Initialize the session runtime.
   * Loads the bundle and initializes the runtime engine.
   */
  async initialize(options?: {
    enableIntelligence?: boolean;
    existingRelationshipMemory?: RelationshipMemory;
  }): Promise<boolean> {
    if (this.initialized) {
      log.debug({ personaId: this.personaId }, 'Session runtime already initialized');
      return true;
    }

    try {
      const bundle = await loadBundleById(this.personaId);
      if (bundle) {
        this.bundleRuntime = await createBundleRuntime(bundle);

        // Sync user profile state
        if (this.userProfile) {
          this.bundleRuntime.updateState({
            userName: this.userProfile.name,
            sessionCount: this.userProfile.totalConversations || 0,
          });
        }

        log.info({ personaId: this.personaId }, 'Session runtime initialized');
        this.initialized = true;
      } else {
        log.debug({ personaId: this.personaId }, 'No bundle found for session runtime');
        this.initialized = true; // Mark as initialized even without bundle
      }

      // Initialize intelligence engine if we have a user ID
      if (options?.enableIntelligence !== false && this.userId) {
        this.intelligenceEngine = getPersonaIntelligence(
          this.personaId,
          this.userId,
          options?.existingRelationshipMemory
        );
        log.info(
          { personaId: this.personaId, userId: this.userId },
          'Intelligence engine initialized'
        );
      }

      return this.bundleRuntime !== null;
    } catch (error) {
      log.warn(
        { personaId: this.personaId, error: String(error) },
        'Failed to initialize session runtime'
      );
      this.initialized = true; // Mark as initialized to prevent retry loops
      return false;
    }
  }

  /**
   * Get the underlying BundleRuntimeEngine.
   */
  getBundleRuntime(): BundleRuntimeEngine | null {
    return this.bundleRuntime;
  }

  /**
   * Check if we have a bundle runtime available.
   */
  hasBundleRuntime(): boolean {
    return this.bundleRuntime !== null;
  }

  // ============================================================================
  // WELCOME BACK & GREETING ENHANCEMENTS
  // ============================================================================

  /**
   * Generate a welcome back result with life event acknowledgments.
   */
  generateWelcomeBackEnhanced(context: SessionContext): WelcomeBackResult {
    const { lastConversationDate, conversationCount } = context;

    // Determine time bucket
    let type: WelcomeBackResult['type'] = 'new';
    if (lastConversationDate) {
      const daysSince = Math.floor(
        (Date.now() - lastConversationDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince === 0) type = 'same_day';
      else if (daysSince === 1) type = 'next_day';
      else if (daysSince <= 6) type = 'few_days';
      else if (daysSince <= 13) type = 'week';
      else if (daysSince <= 29) type = 'weeks';
      else if (daysSince <= 59) type = 'month';
      else type = 'long_time';
    }

    // Generate base welcome back greeting using profile
    const greeting = this.userProfile ? generateWelcomeBack(this.userProfile) : '';

    // Check for milestones
    const hasMilestone = isMilestoneConversation(conversationCount || 0);
    const milestoneMessage = hasMilestone
      ? (getMilestoneMessage(conversationCount || 0) ?? undefined)
      : undefined;

    // Check for life events to acknowledge
    let lifeEventAcknowledgment: string | undefined;
    const eventsToAcknowledge = findEventsToAcknowledge(this.lifeEvents);
    if (eventsToAcknowledge.length > 0) {
      const event = eventsToAcknowledge[0]; // Acknowledge most important event
      const ack =
        generateEventAcknowledgment(event, context.userName, event.personName) ?? undefined;
      if (ack) lifeEventAcknowledgment = ack;
    }

    return {
      greeting,
      type,
      hasMilestone,
      milestoneMessage,
      lifeEventAcknowledgment,
    };
  }

  /**
   * Get all session enhancements for the current context.
   */
  getSessionEnhancements(context: SessionContext): SessionEnhancements {
    const { relationshipStage, conversationCount, lastConversationDate, detectedEmotion } = context;

    const enhancements: SessionEnhancements = {
      storyRecommended: false,
    };

    // Welcome back (only for returning users)
    if (lastConversationDate) {
      enhancements.welcomeBack = this.generateWelcomeBackEnhanced(context);
    }

    // Deepening question (based on relationship stage)
    if (relationshipStage && relationshipStage !== 'new_acquaintance') {
      enhancements.deepeningQuestion = getDeepeningQuestion(relationshipStage);
    }

    // Callback (reference to past conversation)
    if (this.userProfile) {
      const callback = generateCallback(this.userProfile);
      if (callback) enhancements.callback = callback;
    }

    // Acknowledgment based on detected emotion
    if (detectedEmotion) {
      const ackType = this.mapEmotionToAckType(detectedEmotion);
      enhancements.acknowledgment = getAcknowledgment(ackType);
    }

    // Should share a personal story?
    const storyWeight = this.getStoryWeight(conversationCount || 0);
    enhancements.storyRecommended = shouldSharePersonalStory(
      relationshipStage || 'new_acquaintance',
      storyWeight
    );

    // Team mention (occasional)
    if (Math.random() < 0.15) {
      // 15% chance
      const teammates = ['peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];
      const otherTeammate = teammates.find((t) => t !== this.personaId);
      if (otherTeammate) {
        enhancements.teamMention = getCasualMention(otherTeammate) || undefined;
      }
    }

    // Intelligence injection (unified prompt context)
    if (this.intelligenceEngine) {
      enhancements.intelligenceInjection = this.intelligenceEngine.buildPromptInjection(
        context.currentTopic
      );
    }

    return enhancements;
  }

  /**
   * Map detected emotion to acknowledgment type.
   */
  private mapEmotionToAckType(emotion: string): 'personal' | 'emotional' | 'progress' | 'struggle' {
    const emotionLower = emotion.toLowerCase();
    if (
      emotionLower.includes('happy') ||
      emotionLower.includes('excited') ||
      emotionLower.includes('proud')
    ) {
      return 'progress';
    }
    if (
      emotionLower.includes('sad') ||
      emotionLower.includes('frustrated') ||
      emotionLower.includes('anxious')
    ) {
      return 'struggle';
    }
    if (
      emotionLower.includes('vulnerable') ||
      emotionLower.includes('open') ||
      emotionLower.includes('trust')
    ) {
      return 'personal';
    }
    return 'emotional';
  }

  /**
   * Determine story weight based on conversation count.
   */
  private getStoryWeight(conversationCount: number): 'light' | 'medium' | 'heavy' {
    if (conversationCount < 5) return 'light';
    if (conversationCount < 20) return 'medium';
    return 'heavy';
  }

  // ============================================================================
  // LIFE EVENTS
  // ============================================================================

  /**
   * Set life events for the session.
   */
  setLifeEvents(events: LifeEvent[]): void {
    this.lifeEvents = events;
  }

  /**
   * Get events that should be acknowledged today.
   */
  getEventsToAcknowledge(): LifeEvent[] {
    return findEventsToAcknowledge(this.lifeEvents);
  }

  /**
   * Get upcoming events that could be mentioned.
   */
  getUpcomingEvents(daysAhead = 7): LifeEvent[] {
    return this.lifeEvents.filter((event) => isEventSoon(event, daysAhead));
  }

  /**
   * Generate mention for an upcoming event.
   */
  getUpcomingEventMentionText(event: LifeEvent): string | null {
    return getUpcomingEventMention(event);
  }

  // ============================================================================
  // RELATIONSHIP BUILDING
  // ============================================================================

  /**
   * Get stage-appropriate greeting.
   */
  getStageGreetingText(): string {
    const stage = this.userProfile?.relationshipStage || 'new_acquaintance';
    return getStageGreeting(stage);
  }

  /**
   * Get stage-appropriate closing.
   */
  getStageClosingText(): string {
    const stage = this.userProfile?.relationshipStage || 'new_acquaintance';
    return getStageClosing(stage);
  }

  /**
   * Get a deepening question for the current relationship stage.
   */
  getDeepeningQuestionText(): string {
    const stage = this.userProfile?.relationshipStage || 'new_acquaintance';
    return getDeepeningQuestion(stage);
  }

  // ============================================================================
  // TEAM DYNAMICS
  // ============================================================================

  /**
   * Get opinion about another team member.
   */
  getOpinionAboutTeammate(teammateId: string): string | null {
    return getOpinionAbout(this.personaId, teammateId);
  }

  /**
   * Get handoff warmth phrase for handing off to another team member.
   */
  getHandoffWarmthPhrase(toPersonaId: string): string | null {
    return getHandoffWarmth('to', toPersonaId);
  }

  /**
   * Get handoff warmth phrase for receiving from another team member.
   */
  getReceiveWarmthPhrase(fromPersonaId: string): string | null {
    return getHandoffWarmth('from', fromPersonaId);
  }

  // ============================================================================
  // INTELLIGENCE ENGINE
  // ============================================================================

  /**
   * Get the intelligence engine (if initialized).
   */
  getIntelligenceEngine(): PersonaIntelligenceEngine | null {
    return this.intelligenceEngine;
  }

  /**
   * Check if intelligence engine is available.
   */
  hasIntelligenceEngine(): boolean {
    return this.intelligenceEngine !== null;
  }

  /**
   * Start an intelligence session (tracks relationship progression).
   */
  startIntelligenceSession(): void {
    if (this.intelligenceEngine) {
      this.intelligenceEngine.startSession();
    }
  }

  /**
   * End an intelligence session with summary.
   */
  endIntelligenceSession(
    sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis',
    sessionEnergy: 'high' | 'medium' | 'low',
    topics: string[]
  ): void {
    if (this.intelligenceEngine) {
      this.intelligenceEngine.endSession(sessionMood, sessionEnergy, topics);
    }
  }

  /**
   * Build unified prompt injection for LLM.
   * Combines relationship, cognitive, predictive, and team context.
   */
  buildIntelligencePromptInjection(currentTopic?: string): UnifiedPromptInjection | null {
    if (!this.intelligenceEngine) return null;
    return this.intelligenceEngine.buildPromptInjection(currentTopic);
  }

  /**
   * Record a significant moment in the relationship.
   */
  recordMoment(
    type: SharedMomentType,
    summary: string,
    options?: {
      topic?: string;
      userPhrase?: string;
      ourResponse?: string;
      significance?: number;
      tags?: string[];
    }
  ): void {
    if (this.intelligenceEngine) {
      this.intelligenceEngine.recordMoment(type, summary, options);
    }
  }

  /**
   * Get a persona-appropriate question.
   */
  getPersonaQuestion(type: 'starter' | 'deep_dive' = 'starter'): string | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getQuestion(type);
  }

  /**
   * Get a disagreement phrase.
   */
  getDisagreementPhrase(intensity: 'mild' | 'moderate' | 'strong' = 'mild'): string | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getDisagreement(intensity);
  }

  /**
   * Get silence response based on duration.
   */
  getSilenceResponse(durationMs: number): string | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getSilenceResponse(durationMs);
  }

  /**
   * Get team reference about another persona.
   */
  getTeamReference(
    aboutPersona: string,
    type: 'admiration' | 'playful_teasing' = 'admiration'
  ): string | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getTeamRef(aboutPersona, type);
  }

  /**
   * Generate handoff note for another persona.
   */
  generateHandoffNote(
    toPersona: string,
    topic: string,
    emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral'
  ): string | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.generateHandoff(toPersona, topic, emotionalState);
  }

  /**
   * Get current relationship stage.
   */
  getIntelligenceRelationshipStage(): string | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getRelationshipStage();
  }

  /**
   * Get current trust score (0-1).
   */
  getTrustScore(): number | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getTrustScore();
  }

  /**
   * Export relationship memory for persistence.
   */
  exportRelationshipMemory(): RelationshipMemory | undefined {
    if (!this.intelligenceEngine) return undefined;
    return this.intelligenceEngine.getRelationshipMemory();
  }

  // ============================================================================
  // BUNDLE RUNTIME PASSTHROUGH
  // ============================================================================

  /**
   * Get time-of-day modifiers from bundle runtime.
   */
  getTimeOfDayModifiers(): { volume?: string; energy?: string } {
    if (!this.bundleRuntime) return {};
    return this.bundleRuntime.getTimeOfDayModifiers();
  }

  /**
   * Get relationship stage name.
   */
  getRelationshipStageName(): string {
    if (!this.bundleRuntime) return 'unknown';
    return this.bundleRuntime.getRelationshipStageName();
  }

  /**
   * Get quirk content from bundle.
   */
  async getQuirk(context?: string): Promise<string | null> {
    if (!this.bundleRuntime) return null;
    // Use optional chaining as these methods may not exist on all bundles
    const fn = (this.bundleRuntime as unknown as Record<string, unknown>)['getQuirkContent'];
    if (typeof fn === 'function') {
      return fn.call(this.bundleRuntime, context) || null;
    }
    return null;
  }

  /**
   * Get "caught doing" moment for alive greetings.
   */
  getCaughtDoing(): string | null {
    if (!this.bundleRuntime) return null;
    const fn = (this.bundleRuntime as unknown as Record<string, unknown>)['getCaughtDoing'];
    if (typeof fn === 'function') {
      return fn.call(this.bundleRuntime) || null;
    }
    return null;
  }

  /**
   * Get physical moment for embodied presence.
   */
  getPhysicalMoment(): string | null {
    if (!this.bundleRuntime) return null;
    const fn = (this.bundleRuntime as unknown as Record<string, unknown>)['getPhysicalMoment'];
    if (typeof fn === 'function') {
      return fn.call(this.bundleRuntime) || null;
    }
    return null;
  }

  /**
   * Get backstory hint for alive greetings.
   */
  getBackstoryHint(): string | null {
    if (!this.bundleRuntime) return null;
    const fn = (this.bundleRuntime as unknown as Record<string, unknown>)['getBackstoryHint'];
    if (typeof fn === 'function') {
      return fn.call(this.bundleRuntime) || null;
    }
    return null;
  }

  /**
   * Update runtime state.
   */
  updateState(state: Partial<BundleRuntimeState>): void {
    if (this.bundleRuntime) {
      this.bundleRuntime.updateState(state);
    }
  }

  /**
   * Increment turn counter.
   */
  incrementTurn(): void {
    if (this.bundleRuntime) {
      this.bundleRuntime.incrementTurn();
    }
  }

  /**
   * Update user profile reference.
   */
  setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
    if (this.bundleRuntime) {
      this.bundleRuntime.updateState({
        userName: profile.name,
        sessionCount: profile.totalConversations || 0,
      });
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and initialize a SessionBundleRuntimeManager.
 *
 * @param config - Session configuration including persona, user profile, and options
 * @returns Initialized session runtime manager with optional intelligence engine
 *
 * @example
 * ```typescript
 * // Basic usage
 * const session = await createSessionRuntime({
 *   personaId: 'ferni',
 *   userProfile: user,
 * });
 *
 * // With intelligence engine for relationship tracking
 * const session = await createSessionRuntime({
 *   personaId: 'ferni',
 *   userProfile: user,
 *   enableIntelligence: true,
 *   existingRelationshipMemory: savedMemory, // Optional - restore from persistence
 * });
 *
 * // Start intelligence session
 * session.startIntelligenceSession();
 *
 * // Get prompt injection for LLM
 * const injection = session.buildIntelligencePromptInjection('career');
 * // Use injection.combined in system prompt
 *
 * // Record significant moment
 * session.recordMoment('breakthrough', 'User realized their fear pattern');
 *
 * // End session
 * session.endIntelligenceSession('positive', 'high', ['career', 'growth']);
 *
 * // Export memory for persistence
 * const memory = session.exportRelationshipMemory();
 * await saveToDatabase(memory);
 * ```
 */
export async function createSessionRuntime(
  config: SessionRuntimeConfig
): Promise<SessionBundleRuntimeManager> {
  const manager = new SessionBundleRuntimeManager(config);
  await manager.initialize({
    enableIntelligence: config.enableIntelligence,
    existingRelationshipMemory: config.existingRelationshipMemory,
  });
  return manager;
}

export default SessionBundleRuntimeManager;
