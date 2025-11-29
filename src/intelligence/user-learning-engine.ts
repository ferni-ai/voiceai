/**
 * User Learning Engine
 *
 * The central orchestrator for making Jack smarter over time.
 * Captures insights during conversations and persists them to user profiles.
 * Retrieves relevant memories to enrich context for better responses.
 *
 * KEY RESPONSIBILITIES:
 * 1. Learn user preferences from conversation patterns
 * 2. Capture key moments (breakthroughs, concerns, celebrations)
 * 3. Index conversation insights for future retrieval
 * 4. Build dynamic context from user history
 * 5. Provide feedback loops on conversation quality
 */

import { log } from '@livekit/agents';
import type { UserProfile, KeyMoment, EmotionalPattern } from '../types/user-profile.js';
import type { EmotionResult } from './emotion-detector.js';
import type { IntentResult } from './intent-classifier.js';
import type { ConversationState } from './conversation-state.js';
import { inferUserPreferences, getPreferenceGuidance } from './human-behaviors.js';

// Local type for preference updates (subset of what we track)
interface PreferenceUpdates {
  responseLength?: 'brief' | 'thorough' | 'unknown';
  storyAppetite?: 'loves_stories' | 'prefers_facts' | 'unknown';
  humorReceptivity?: 'high' | 'medium' | 'low' | 'unknown';
}
import { extractSmallDetails, type SmallDetail, type FarewellSummary, generateFarewellSummary, type FollowUpItem } from './conversation-quality.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Learning insight captured during conversation
 */
export interface LearningInsight {
  type: 'preference' | 'concern' | 'goal' | 'relationship' | 'communication_style' | 'topic_interest' | 'emotional_pattern';
  key: string;
  value: unknown;
  confidence: number; // 0-1
  source: 'explicit' | 'inferred'; // Did user say it or did we infer it?
  capturedAt: Date;
  context?: string;
}

/**
 * Conversation analysis result for learning
 */
export interface ConversationLearningData {
  insights: LearningInsight[];
  keyMoments: KeyMoment[];
  smallDetails: SmallDetail[];
  emotionalPatterns: EmotionalPattern[];
  storiesTold: Array<{ storyId: string; theme: string; sharedAt: Date }>;
  preferenceUpdates: PreferenceUpdates;
  followUps: FollowUpItem[];
  farewellSummary?: FarewellSummary;
}

/**
 * Dynamic context for prompt enrichment
 */
export interface DynamicUserContext {
  // Personalization guidance
  communicationGuidance: string;
  preferenceGuidance: string;

  // Memory retrieval
  relevantKeyMoments: string[];
  relevantPastTopics: string[];
  rememberedDetails: string[];

  // Relationship context
  relationshipDepth: string;
  emotionalHistory: string;

  // Goals & concerns
  activeGoals: string[];
  knownConcerns: string[];

  // Combined formatted context
  formattedForPrompt: string;
}

// ============================================================================
// USER LEARNING ENGINE
// ============================================================================

export class UserLearningEngine {
  private sessionInsights: LearningInsight[] = [];
  private sessionKeyMoments: KeyMoment[] = [];
  private sessionSmallDetails: SmallDetail[] = [];
  private sessionEmotions: EmotionalPattern[] = [];
  private sessionStoriesTold: Array<{ storyId: string; theme: string; sharedAt: Date }> = [];
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private topicsDiscussed: string[] = [];
  private turnsSinceLastCapture = 0;

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
    const userNameDetail = details.find(d => d.type === 'user_name');
    if (userNameDetail && profile && !profile.name) {
      profile.name = userNameDetail.value;
      getLogger().info({ name: userNameDetail.value, context: userNameDetail.context }, '🎉 Learned user name!');
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
    if (analysis.state.currentTopic && !this.topicsDiscussed.includes(analysis.state.currentTopic)) {
      this.topicsDiscussed.push(analysis.state.currentTopic);
    }

    // 4. Detect key moments
    const keyMoment = this.detectKeyMoment(message, analysis);
    if (keyMoment) {
      this.sessionKeyMoments.push(keyMoment);
      getLogger().info({ type: keyMoment.type, summary: keyMoment.summary }, 'Captured key moment');
    }

    // 5. Learn preferences every 5 turns
    if (this.turnsSinceLastCapture >= 5) {
      this.learnPreferences(profile);
      this.turnsSinceLastCapture = 0;
    }

    // 6. Extract explicit insights
    this.extractExplicitInsights(message, analysis.intent);
  }

  /**
   * Process an assistant turn
   * Now also tracks stories Jack tells to avoid repetition
   */
  processAssistantTurn(message: string): void {
    this.conversationHistory.push({ role: 'assistant', content: message });
    
    // Detect if Jack is telling a story
    const storyId = this.detectStoryTelling(message);
    if (storyId) {
      this.sessionStoriesTold.push({
        storyId,
        theme: this.extractStoryTheme(message),
        sharedAt: new Date(),
      });
      getLogger().debug({ storyId }, 'Story told by Jack tracked');
    }
  }

  /**
   * Detect if Jack is telling a story (for avoiding repetition)
   */
  private detectStoryTelling(message: string): string | null {
    const messageLower = message.toLowerCase();
    
    // Story indicators
    const storyPatterns = [
      { pattern: /\bi remember\b.*\b(1974|1975|1987|2000|2008|2020)/i, id: (m: RegExpMatchArray) => `year_story_${m[1]}` },
      { pattern: /\bback in\b.*\b(19\d{2}|20\d{2})/i, id: (m: RegExpMatchArray) => `year_story_${m[1]}` },
      { pattern: /\bwhen i (started|founded|created) vanguard/i, id: () => 'vanguard_founding' },
      { pattern: /\bmy father (taught|told|showed) me/i, id: () => 'father_lesson' },
      { pattern: /\bi met (warren|buffett)/i, id: () => 'buffett_meeting' },
      { pattern: /\b(samuelson|paul samuelson)/i, id: () => 'samuelson_story' },
      { pattern: /\bwellington fund/i, id: () => 'wellington_story' },
      { pattern: /\bprincetonl/i, id: () => 'princeton_story' },
      { pattern: /\bindex fund.*folly/i, id: () => 'bogles_folly' },
      { pattern: /\bthe market (crashed|dropped|fell).*\d{2,4}/i, id: (m: RegExpMatchArray) => `market_crash_story` },
    ];
    
    for (const { pattern, id } of storyPatterns) {
      const match = messageLower.match(pattern);
      if (match) {
        return typeof id === 'function' ? id(match) : id;
      }
    }
    
    // Generic story detection
    const hasStoryIndicator = /\b(i remember|back in|years ago|one time|let me tell you|when i was|my (father|mother|wife)|at vanguard)\b/i.test(messageLower);
    const isLongEnough = message.length > 200;
    
    if (hasStoryIndicator && isLongEnough) {
      // Generate a hash-based ID for unrecognized stories
      return `story_${message.substring(0, 50).replace(/\W+/g, '_').toLowerCase()}`;
    }
    
    return null;
  }

  /**
   * Extract the theme of a story
   */
  private extractStoryTheme(message: string): string {
    const themes = [
      { pattern: /\b(market|crash|recession|panic)/i, theme: 'market_volatility' },
      { pattern: /\b(index fund|passive|low cost)/i, theme: 'index_investing' },
      { pattern: /\b(patience|long.?term|compound)/i, theme: 'patience' },
      { pattern: /\b(family|father|mother|children)/i, theme: 'family' },
      { pattern: /\b(vanguard|wellington)/i, theme: 'career' },
      { pattern: /\b(mistake|wrong|failed|learned)/i, theme: 'lessons' },
    ];
    
    for (const { pattern, theme } of themes) {
      if (pattern.test(message)) return theme;
    }
    
    return 'general';
  }

  /**
   * Detect if current turn contains a key moment worth remembering
   */
  private detectKeyMoment(
    message: string,
    analysis: {
      emotion: EmotionResult;
      intent: IntentResult;
      state: ConversationState;
    }
  ): KeyMoment | null {
    const messageLower = message.toLowerCase();

    // Shared vulnerability patterns
    const vulnerabilityPatterns = [
      /i('m| am) (scared|afraid|terrified|worried sick)/i,
      /i('ve| have) never told anyone/i,
      /this is hard (to|for me to) (admit|say|talk about)/i,
      /i feel so (alone|lost|overwhelmed|helpless)/i,
      /my (father|mother|dad|mom|parent) (died|passed|left)/i,
      /i lost (my job|everything|my savings)/i,
    ];

    // Breakthrough patterns
    const breakthroughPatterns = [
      /i (finally |just )?(understand|get it|realized|see)/i,
      /that makes (so much |a lot of )?sense/i,
      /i('ve| have) been (doing|thinking about) (this|it) (all )?wrong/i,
      /why didn'?t (i|anyone) (see|tell me) this before/i,
      /this (changes|changed) everything/i,
    ];

    // Decision patterns
    const decisionPatterns = [
      /i('ve| have) decided to/i,
      /i('m| am) going to/i,
      /from now on,? i('ll| will)/i,
      /i('m| am) (finally |ready to )?(ready|committed) to/i,
      /that'?s it,? i('m| am)/i,
    ];

    // Celebration patterns
    const celebrationPatterns = [
      /i (finally |just )?(paid off|hit|reached|achieved)/i,
      /we (finally |just )?(did it|made it|got there)/i,
      /i can'?t believe (i|we) (actually|finally)/i,
      /this is (amazing|incredible|the best)/i,
    ];

    // Concern patterns
    const concernPatterns = [
      /i('m| am) (really |very )?(worried|concerned|anxious) (about|that)/i,
      /what (if|happens if) (the market|i lose|we can'?t)/i,
      /i don'?t (know|think) (if|whether) (i|we) can/i,
      /this (keeps|is keeping) me (up|awake) at night/i,
    ];

    // Check patterns and create key moment
    let type: KeyMoment['type'] | null = null;
    let emotionalWeight: KeyMoment['emotionalWeight'] = 'medium';

    for (const pattern of vulnerabilityPatterns) {
      if (pattern.test(messageLower)) {
        type = 'shared_vulnerability';
        emotionalWeight = 'heavy';
        break;
      }
    }

    if (!type) {
      for (const pattern of breakthroughPatterns) {
        if (pattern.test(messageLower)) {
          type = 'breakthrough';
          emotionalWeight = 'medium';
          break;
        }
      }
    }

    if (!type) {
      for (const pattern of decisionPatterns) {
        if (pattern.test(messageLower)) {
          type = 'decision';
          emotionalWeight = 'medium';
          break;
        }
      }
    }

    if (!type) {
      for (const pattern of celebrationPatterns) {
        if (pattern.test(messageLower)) {
          type = 'celebration';
          emotionalWeight = 'light';
          break;
        }
      }
    }

    if (!type) {
      for (const pattern of concernPatterns) {
        if (pattern.test(messageLower)) {
          type = 'concern';
          emotionalWeight = analysis.emotion.distressLevel > 0.6 ? 'heavy' : 'medium';
          break;
        }
      }
    }

    // High distress without pattern match = concern
    if (!type && analysis.emotion.distressLevel > 0.7) {
      type = 'concern';
      emotionalWeight = 'heavy';
    }

    if (!type) return null;

    // Generate summary
    const summary = this.generateMomentSummary(message, type);

    return {
      id: `km_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      summary,
      emotionalWeight,
      topics: [...this.topicsDiscussed],
      followUpNeeded: type === 'concern' || type === 'shared_vulnerability',
      followUpDate: type === 'concern' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined, // 1 week
    };
  }

  /**
   * Generate a natural summary of a key moment
   */
  private generateMomentSummary(message: string, type: KeyMoment['type']): string {
    // Extract the core of the message (first 2 sentences, max 150 chars)
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 10);
    let core = sentences.slice(0, 2).join('. ').trim();
    if (core.length > 150) {
      core = core.slice(0, 147) + '...';
    }

    // Add context based on type
    const prefixes: Record<KeyMoment['type'], string> = {
      shared_vulnerability: 'Opened up about',
      breakthrough: 'Had a breakthrough:',
      milestone: 'Reached a milestone:',
      concern: 'Expressed concern about',
      celebration: 'Celebrated',
      decision: 'Made a decision to',
    };

    return `${prefixes[type]} "${core}"`;
  }

  /**
   * Learn preferences from conversation patterns
   */
  private learnPreferences(profile: UserProfile | null): void {
    const userMessages = this.conversationHistory
      .filter(m => m.role === 'user')
      .map(m => m.content);

    if (userMessages.length < 3) return;

    const preferences = inferUserPreferences(userMessages, profile);

    // Convert preferences to insights
    if (preferences.communicationStyle !== 'unknown') {
      this.sessionInsights.push({
        type: 'communication_style',
        key: 'communicationStyle',
        value: preferences.communicationStyle,
        confidence: 0.7,
        source: 'inferred',
        capturedAt: new Date(),
      });
    }

    if (preferences.responseLength !== 'unknown') {
      this.sessionInsights.push({
        type: 'preference',
        key: 'verbosity',
        value: preferences.responseLength === 'brief' ? 'concise' : preferences.responseLength === 'thorough' ? 'storytelling' : 'balanced',
        confidence: 0.7,
        source: 'inferred',
        capturedAt: new Date(),
      });
    }

    if (preferences.storyAppetite !== 'unknown') {
      this.sessionInsights.push({
        type: 'preference',
        key: 'storyAppetite',
        value: preferences.storyAppetite,
        confidence: 0.6,
        source: 'inferred',
        capturedAt: new Date(),
      });
    }

    if (preferences.humorReceptivity !== 'unknown') {
      this.sessionInsights.push({
        type: 'preference',
        key: 'humorAppreciation',
        value: preferences.humorReceptivity,
        confidence: 0.6,
        source: 'inferred',
        capturedAt: new Date(),
      });
    }

    getLogger().debug({ preferences }, 'Learned user preferences');
  }

  /**
   * Extract explicit insights from user statements
   */
  private extractExplicitInsights(message: string, intent: IntentResult): void {
    const messageLower = message.toLowerCase();

    // Goal mentions
    const goalPatterns = [
      /i('m| am) (trying|planning|hoping|wanting) to (save|retire|buy|pay off)/i,
      /my goal is to/i,
      /i want to (be able to|have|achieve)/i,
    ];

    for (const pattern of goalPatterns) {
      const match = messageLower.match(pattern);
      if (match) {
        this.sessionInsights.push({
          type: 'goal',
          key: 'mentioned_goal',
          value: message.slice(0, 200),
          confidence: 0.9,
          source: 'explicit',
          capturedAt: new Date(),
          context: intent.primary,
        });
        break;
      }
    }

    // Concern mentions
    const concernPatterns = [
      /i('m| am) (worried|concerned|anxious|scared) (about|that)/i,
      /my (biggest|main|primary) (worry|concern|fear)/i,
    ];

    for (const pattern of concernPatterns) {
      if (pattern.test(messageLower)) {
        this.sessionInsights.push({
          type: 'concern',
          key: 'explicit_concern',
          value: message.slice(0, 200),
          confidence: 0.9,
          source: 'explicit',
          capturedAt: new Date(),
        });
        break;
      }
    }

    // Topic interest (positive sentiment about topics)
    const interestIntents = ['request_info', 'seeking_education', 'asking_question', 'requesting_info'];
    if (interestIntents.includes(intent.primary)) {
      this.sessionInsights.push({
        type: 'topic_interest',
        key: 'interested_topic',
        value: this.topicsDiscussed[this.topicsDiscussed.length - 1] || 'general',
        confidence: 0.6,
        source: 'inferred',
        capturedAt: new Date(),
      });
    }
  }

  /**
   * Build dynamic context for prompt enrichment
   */
  buildDynamicContext(profile: UserProfile | null): DynamicUserContext {
    const sections: string[] = [];

    // 1. Communication guidance
    let communicationGuidance = '';
    let preferenceGuidance = '';

    if (profile) {
      // From profile
      if (profile.communicationStyle !== 'mixed') {
        communicationGuidance = `User prefers ${profile.communicationStyle} communication.`;
      }
      if (profile.preferences.verbosity !== 'balanced') {
        communicationGuidance += ` Keep responses ${profile.preferences.verbosity === 'concise' ? 'short and direct' : 'detailed with stories'}.`;
      }
      if (profile.humorAppreciation === 'high') {
        communicationGuidance += ' Feel free to be playful and joke.';
      } else if (profile.humorAppreciation === 'low') {
        communicationGuidance += ' Keep it serious, minimal humor.';
      }
    }

    // From session insights (override profile with recent learnings)
    const recentInsights = this.sessionInsights.filter(i => i.type === 'preference' || i.type === 'communication_style');
    for (const insight of recentInsights) {
      if (insight.key === 'communicationStyle') {
        communicationGuidance = `User ${insight.source === 'inferred' ? 'seems to' : ''} prefer${insight.source === 'inferred' ? '' : 's'} ${insight.value} communication.`;
      }
    }

    // Get preference guidance from inference
    if (this.conversationHistory.length >= 3) {
      const userMessages = this.conversationHistory.filter(m => m.role === 'user').map(m => m.content);
      const inferred = inferUserPreferences(userMessages, profile);
      preferenceGuidance = getPreferenceGuidance(inferred);
    }

    // 2. Key moments from this session
    const relevantKeyMoments = this.sessionKeyMoments.slice(-3).map(km => km.summary);

    // Key moments from profile (recent ones)
    if (profile?.keyMoments) {
      const recentProfileMoments = profile.keyMoments
        .filter(km => {
          const daysSince = (Date.now() - new Date(km.timestamp).getTime()) / (1000 * 60 * 60 * 24);
          return daysSince < 30; // Last 30 days
        })
        .slice(-2)
        .map(km => km.summary);
      relevantKeyMoments.push(...recentProfileMoments);
    }

    // 3. Remembered details
    const rememberedDetails: string[] = [];
    for (const detail of this.sessionSmallDetails.slice(-5)) {
      rememberedDetails.push(`${detail.type}: ${detail.value}`);
    }

    // 4. Topics
    const relevantPastTopics = [...this.topicsDiscussed];
    if (profile?.preferredTopics) {
      relevantPastTopics.push(...profile.preferredTopics.slice(0, 3));
    }

    // 5. Relationship depth
    let relationshipDepth = 'New conversation';
    if (profile) {
      if (profile.relationshipStage === 'old_friend') {
        relationshipDepth = `Close relationship - ${profile.totalConversations} conversations, ${Math.round(profile.totalMinutesTalked / 60)} hours together`;
      } else if (profile.relationshipStage === 'trusted_advisor') {
        relationshipDepth = `Trusted advisor - ${profile.totalConversations} conversations`;
      } else if (profile.relationshipStage === 'getting_to_know') {
        relationshipDepth = `Getting to know each other - ${profile.totalConversations} conversations so far`;
      }
    }

    // 6. Emotional history
    let emotionalHistory = '';
    if (this.sessionEmotions.length > 0) {
      const emotions = this.sessionEmotions.map(e => e.emotion);
      const journey = [...new Set(emotions)].join(' → ');
      emotionalHistory = `This session: ${journey}`;
    }
    if (profile?.emotionalPatterns && profile.emotionalPatterns.length > 0) {
      const recent = profile.emotionalPatterns.slice(-5).map(p => p.emotion);
      emotionalHistory += emotionalHistory ? `. Recent history: ${recent.join(', ')}` : `Recent: ${recent.join(', ')}`;
    }

    // 7. Active goals
    const activeGoals: string[] = [];
    if (profile?.goals) {
      for (const goal of profile.goals.filter(g => g.status === 'active' || g.status === 'on_track')) {
        let goalStr = `${goal.type}: ${goal.name}`;
        if (goal.progressPercent !== undefined) {
          goalStr += ` (${goal.progressPercent}% complete)`;
        }
        activeGoals.push(goalStr);
      }
    }

    // 8. Known concerns
    const knownConcerns: string[] = [];
    if (profile?.primaryConcerns) {
      knownConcerns.push(...profile.primaryConcerns.filter(c => c !== 'none' && c !== 'general'));
    }
    const concernInsights = this.sessionInsights.filter(i => i.type === 'concern');
    for (const insight of concernInsights) {
      if (typeof insight.value === 'string') {
        knownConcerns.push(insight.value.slice(0, 50));
      }
    }

    // Build formatted context
    if (communicationGuidance) {
      sections.push(`[COMMUNICATION STYLE]\n${communicationGuidance}`);
    }
    if (preferenceGuidance) {
      sections.push(`[LEARNED PREFERENCES]\n${preferenceGuidance}`);
    }
    if (relevantKeyMoments.length > 0) {
      sections.push(`[KEY MOMENTS TO REMEMBER]\n${relevantKeyMoments.map(m => `• ${m}`).join('\n')}`);
    }
    if (rememberedDetails.length > 0) {
      sections.push(`[REMEMBERED DETAILS]\n${rememberedDetails.map(d => `• ${d}`).join('\n')}`);
    }
    if (activeGoals.length > 0) {
      sections.push(`[USER'S ACTIVE GOALS]\n${activeGoals.map(g => `• ${g}`).join('\n')}`);
    }
    if (knownConcerns.length > 0) {
      sections.push(`[KNOWN CONCERNS - Handle Gently]\n${knownConcerns.map(c => `• ${c}`).join('\n')}`);
    }
    if (emotionalHistory) {
      sections.push(`[EMOTIONAL CONTEXT]\n${emotionalHistory}`);
    }

    return {
      communicationGuidance,
      preferenceGuidance,
      relevantKeyMoments,
      relevantPastTopics: [...new Set(relevantPastTopics)],
      rememberedDetails,
      relationshipDepth,
      emotionalHistory,
      activeGoals,
      knownConcerns,
      formattedForPrompt: sections.join('\n\n'),
    };
  }

  /**
   * Finalize session and return all learning data
   */
  finalizeSession(profile: UserProfile | null): ConversationLearningData {
    // Generate farewell summary
    let farewellSummary: FarewellSummary | undefined;
    if (this.conversationHistory.length > 2) {
      const startEmotion = this.sessionEmotions[0]?.emotion || 'neutral';
      const endEmotion = this.sessionEmotions[this.sessionEmotions.length - 1]?.emotion || 'neutral';

      farewellSummary = generateFarewellSummary(
        this.conversationHistory,
        this.topicsDiscussed,
        profile as { name?: string; goals?: { type: string; status: string }[]; familyMembers?: { name: string; relationship: string }[] } | null,
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
      preferenceUpdates: this.buildPreferenceUpdates(),
      followUps: farewellSummary?.followUps || [],
      farewellSummary,
    };
  }

  /**
   * Build preference updates from insights
   */
  private buildPreferenceUpdates(): PreferenceUpdates {
    const updates: PreferenceUpdates = {};

    for (const insight of this.sessionInsights) {
      if (insight.type === 'preference' && insight.confidence > 0.6) {
        if (insight.key === 'verbosity' && typeof insight.value === 'string') {
          updates.responseLength = insight.value as 'brief' | 'thorough' | 'unknown';
        }
        if (insight.key === 'storyAppetite') {
          updates.storyAppetite = insight.value as 'loves_stories' | 'prefers_facts' | 'unknown';
        }
        if (insight.key === 'humorAppreciation') {
          updates.humorReceptivity = insight.value as 'high' | 'medium' | 'low' | 'unknown';
        }
      }
    }

    return updates;
  }

  /**
   * Apply learning data to user profile
   */
  static applyLearningToProfile(profile: UserProfile, learning: ConversationLearningData): UserProfile {
    const updated = { ...profile };
    const now = new Date();

    // Apply key moments
    updated.keyMoments = [...(updated.keyMoments || []), ...learning.keyMoments];

    // Apply emotional patterns
    updated.emotionalPatterns = [...(updated.emotionalPatterns || []), ...learning.emotionalPatterns].slice(-50);

    // Apply preference updates
    if (learning.preferenceUpdates.responseLength && learning.preferenceUpdates.responseLength !== 'unknown') {
      updated.preferences = {
        ...updated.preferences,
        verbosity: learning.preferenceUpdates.responseLength === 'brief' ? 'concise' : 
                   learning.preferenceUpdates.responseLength === 'thorough' ? 'storytelling' : 'balanced',
      };
    }

    if (learning.preferenceUpdates.humorReceptivity && learning.preferenceUpdates.humorReceptivity !== 'unknown') {
      updated.humorAppreciation = learning.preferenceUpdates.humorReceptivity;
    }

    // Apply follow-ups
    for (const followUp of learning.followUps) {
      if (!updated.pendingFollowUps.some(f => f.topic === followUp.topic)) {
        updated.pendingFollowUps.push({
          topic: followUp.topic,
          targetDate: followUp.suggestedDate,
          reason: followUp.reason,
        });
      }
    }

    // Update topics from insights
    for (const insight of learning.insights) {
      if (insight.type === 'topic_interest' && typeof insight.value === 'string') {
        if (!updated.preferredTopics.includes(insight.value)) {
          updated.preferredTopics.push(insight.value);
        }
      }
    }

    // Update concerns from insights
    for (const insight of learning.insights) {
      if (insight.type === 'concern' && typeof insight.value === 'string') {
        if (!updated.financialAnxietyTriggers) {
          updated.financialAnxietyTriggers = [];
        }
        // Extract key concern topic
        const concernWords = insight.value.toLowerCase().match(/\b(market|crash|retire|debt|job|money|savings|invest|fees|loss)\b/);
        if (concernWords && !updated.financialAnxietyTriggers.includes(concernWords[1])) {
          updated.financialAnxietyTriggers.push(concernWords[1]);
        }
      }
    }

    // Update last conversation summary from farewell
    if (learning.farewellSummary) {
      updated.lastConversationSummary = learning.farewellSummary.keyThingsToRemember.slice(0, 2).join('; ');
    }

    // Track stories Jack told (to avoid repetition in future)
    if (learning.storiesTold && learning.storiesTold.length > 0) {
      if (!updated.sharedStories) {
        updated.sharedStories = [];
      }
      for (const story of learning.storiesTold) {
        // Only add if not already tracked
        if (!updated.sharedStories.some(s => s.storyId === story.storyId)) {
          updated.sharedStories.push({
            storyId: story.storyId,
            theme: story.theme,
            sharedAt: story.sharedAt,
            context: story.theme,
          });
        }
      }
      // Keep only last 50 stories
      updated.sharedStories = updated.sharedStories.slice(-50);
    }

    updated.updatedAt = now;
    updated.version++;

    return updated;
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
   * This allows KeyMomentRetrieval to access moments from the CURRENT session
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
   * This allows other modules to feed insights into the learning engine
   */
  captureExternalInsight(insight: Omit<LearningInsight, 'capturedAt'>): void {
    this.sessionInsights.push({
      ...insight,
      capturedAt: new Date(),
    });
    getLogger().debug({ type: insight.type, key: insight.key }, 'Captured external insight');
  }

  /**
   * Capture an external key moment (from tasks, conversation manager, etc.)
   */
  captureExternalKeyMoment(moment: KeyMoment): void {
    this.sessionKeyMoments.push(moment);
    getLogger().info({ type: moment.type, summary: moment.summary }, 'Captured external key moment');
  }

  /**
   * Generate proactive insights - natural suggestions based on what Jack has learned
   * Called mid-conversation to suggest things Jack might naturally bring up
   */
  getProactiveInsight(profile: UserProfile | null, turnCount: number): string | null {
    // Only suggest proactively after warmup (turns 4-8) or periodically
    if (turnCount < 4) return null;
    if (turnCount > 8 && turnCount % 6 !== 0) return null;

    // 1. Check for pending follow-ups from previous sessions
    if (profile?.pendingFollowUps && profile.pendingFollowUps.length > 0) {
      const followUp = profile.pendingFollowUps[0];
      const daysSince = Math.floor((Date.now() - new Date(followUp.targetDate).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince >= 0) {
        return `I've been meaning to ask - how's that ${followUp.topic} situation going?`;
      }
    }

    // 2. Check for goal milestones to celebrate or check on
    if (profile?.goals && profile.goals.length > 0) {
      const activeGoals = profile.goals.filter(g => g.status === 'active' || g.status === 'on_track');
      
      for (const goal of activeGoals) {
        // Near completion - celebrate
        if (goal.progressPercent && goal.progressPercent >= 90) {
          return `You're so close to that ${goal.type} goal! How does it feel being at ${goal.progressPercent}%?`;
        }
        // Halfway - encourage
        if (goal.progressPercent && goal.progressPercent >= 45 && goal.progressPercent <= 55) {
          return `You're about halfway to your ${goal.type} goal. That's real progress.`;
        }
      }
    }

    // 3. Reference a key moment from previous conversations
    if (profile?.keyMoments && profile.keyMoments.length > 0) {
      const recentMoments = profile.keyMoments.filter(km => {
        const daysSince = (Date.now() - new Date(km.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince < 30 && km.followUpNeeded;
      });
      
      if (recentMoments.length > 0 && Math.random() < 0.3) {
        const moment = recentMoments[0];
        const timeAgo = this.getTimeAgoString(moment.timestamp);
        
        if (moment.type === 'concern') {
          return `I've been thinking about what you mentioned ${timeAgo}. How are you feeling about that now?`;
        }
        if (moment.type === 'decision') {
          return `How's that decision you made ${timeAgo} working out?`;
        }
      }
    }

    // 4. Small detail callback - shows Jack remembers
    if (this.sessionSmallDetails.length > 0 && Math.random() < 0.2) {
      const detail = this.sessionSmallDetails[Math.floor(Math.random() * this.sessionSmallDetails.length)];
      
      if (detail.type === 'person_name') {
        return `By the way, how's ${detail.value} doing?`;
      }
      if (detail.type === 'pet_name') {
        return `How's ${detail.value}?`;
      }
    }

    // 5. Topic from this session that wasn't explored deeply
    const shallowTopics = this.topicsDiscussed.filter(topic => {
      const mentions = this.conversationHistory.filter(m => 
        m.content.toLowerCase().includes(topic.toLowerCase())
      ).length;
      return mentions <= 2;
    });

    if (shallowTopics.length > 0 && Math.random() < 0.25) {
      const topic = shallowTopics[0];
      return `You mentioned ${topic} earlier. Was there more to that?`;
    }

    return null;
  }

  /**
   * Helper for proactive insights
   */
  private getTimeAgoString(timestamp: Date | string): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return 'earlier';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return 'a few days ago';
    if (diffDays < 14) return 'last week';
    if (diffDays < 30) return 'a couple weeks ago';
    return 'last month';
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.sessionInsights = [];
    this.sessionKeyMoments = [];
    this.sessionSmallDetails = [];
    this.sessionEmotions = [];
    this.conversationHistory = [];
    this.topicsDiscussed = [];
    this.turnsSinceLastCapture = 0;
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

