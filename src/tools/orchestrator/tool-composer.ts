/**
 * Tool Composer
 *
 * Enables tools to work together for human-level conversation.
 * Provides:
 * - Tool chaining (one tool suggesting the next)
 * - Context passing between tools
 * - Response composition
 * - Emotional awareness integration
 *
 * USAGE:
 *   const composer = new ToolComposer(conversationState);
 *
 *   // Execute with context sharing
 *   const result = await composer.execute('rememberAboutUser', params);
 *
 *   // Get next suggested tools
 *   const suggestions = composer.getSuggestedTools();
 */

import { getLogger } from '../../utils/safe-logger.js';

import {
  getConversationState,
  type ConversationStateManager,
  type EmotionalContext,
} from '../../services/conversation-state.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool execution result with composition metadata
 */
export interface ComposedResult {
  /** The tool's actual result */
  result: unknown;

  /** Natural language for speech */
  speech: string;

  /** Emotion hint for TTS */
  emotion?: 'neutral' | 'happy' | 'excited' | 'concerned' | 'empathetic' | 'celebratory';

  /** Tools to consider next */
  suggestedNext: string[];

  /** Topic change detected */
  topicChange?: string;

  /** Facts to remember from this interaction */
  factsToRemember?: Array<{
    fact: string;
    category: 'personal' | 'financial' | 'emotional' | 'goal' | 'preference';
    importance: 'low' | 'medium' | 'high';
  }>;

  /** Should circle back later */
  circleBackLater?: {
    topic: string;
    reason: string;
  };
}

/**
 * Tool chain definition
 */
export interface ToolChain {
  /** Primary tool */
  primary: string;

  /** Tools that might logically follow */
  suggestedFollowers: string[];

  /** Context to pass to followers */
  contextKeys: string[];

  /** Emotion typically associated with this tool */
  typicalEmotion?: ComposedResult['emotion'];
}

/**
 * Composed execution options
 */
export interface ComposeOptions {
  /** Share context with next tools */
  shareContext?: boolean;

  /** Auto-detect topic changes */
  detectTopicChange?: boolean;

  /** Extract facts to remember */
  extractFacts?: boolean;

  /** Override emotion */
  emotion?: ComposedResult['emotion'];
}

// ============================================================================
// TOOL CHAINS
// ============================================================================

/**
 * Predefined tool chains for common conversation patterns
 */
export const TOOL_CHAINS: Record<string, ToolChain> = {
  // ========================================================================
  // MEMORY DOMAIN
  // ========================================================================
  rememberAboutUser: {
    primary: 'rememberAboutUser',
    suggestedFollowers: ['checkIn', 'setGoal', 'suggestRelevantTopic'],
    contextKeys: ['fact', 'category'],
    typicalEmotion: 'empathetic',
  },
  recallFromMemory: {
    primary: 'recallFromMemory',
    suggestedFollowers: ['circleBack', 'shareStory', 'checkGoalProgress'],
    contextKeys: ['topic', 'recalledInfo'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // CAREER DOMAIN - Job Search Journey
  // ========================================================================
  clarifyCareerGoals: {
    primary: 'clarifyCareerGoals',
    suggestedFollowers: ['exploreGrowthAreas', 'createLearningPath', 'assessCareerSatisfaction'],
    contextKeys: ['timeHorizon', 'clarity', 'values'],
    typicalEmotion: 'empathetic',
  },
  exploreGrowthAreas: {
    primary: 'exploreGrowthAreas',
    suggestedFollowers: ['createLearningPath', 'trackJobApplication', 'expandNetwork'],
    contextKeys: ['currentRole', 'targetRole', 'gaps'],
    typicalEmotion: 'neutral',
  },
  trackJobApplication: {
    primary: 'trackJobApplication',
    suggestedFollowers: ['practiceInterview', 'prepareSTARStories', 'researchSalary'],
    contextKeys: ['company', 'role', 'status'],
    typicalEmotion: 'neutral',
  },
  practiceInterview: {
    primary: 'practiceInterview',
    suggestedFollowers: ['prepareSTARStories', 'trackJobApplication', 'rolePlayNegotiation'],
    contextKeys: ['interviewType', 'role', 'feedback'],
    typicalEmotion: 'empathetic',
  },
  assessBurnout: {
    primary: 'assessBurnout',
    suggestedFollowers: ['setWorkBoundary', 'planCareerTransition', 'companionInGrief'],
    contextKeys: ['symptoms', 'level', 'duration'],
    typicalEmotion: 'concerned',
  },
  researchSalary: {
    primary: 'researchSalary',
    suggestedFollowers: ['rolePlayNegotiation', 'trackJobApplication'],
    contextKeys: ['role', 'range', 'target'],
    typicalEmotion: 'neutral',
  },
  rolePlayNegotiation: {
    primary: 'rolePlayNegotiation',
    suggestedFollowers: ['trackJobApplication', 'celebrateMilestone'],
    contextKeys: ['scenario', 'offer', 'target'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // GRIEF DOMAIN - Support Journey
  // ========================================================================
  processGrief: {
    primary: 'processGrief',
    suggestedFollowers: ['navigateGriefWave', 'companionInGrief', 'rememberLoved'],
    contextKeys: ['lossType', 'whereTheyAre', 'whatWasLost'],
    typicalEmotion: 'empathetic',
  },
  navigateGriefWave: {
    primary: 'navigateGriefWave',
    suggestedFollowers: ['companionInGrief', 'validateGrief', 'processGrief'],
    contextKeys: ['intensity', 'trigger'],
    typicalEmotion: 'empathetic',
  },
  acknowledgeLoss: {
    primary: 'acknowledgeLoss',
    suggestedFollowers: ['validateGrief', 'companionInGrief', 'rememberLoved'],
    contextKeys: ['loss', 'recognized'],
    typicalEmotion: 'empathetic',
  },
  navigateTransition: {
    primary: 'navigateTransition',
    suggestedFollowers: ['processEnding', 'embraceNewIdentity', 'companionInGrief'],
    contextKeys: ['transition', 'stage'],
    typicalEmotion: 'empathetic',
  },
  anniversarySupport: {
    primary: 'anniversarySupport',
    suggestedFollowers: ['rememberLoved', 'companionInGrief', 'processGrief'],
    contextKeys: ['occasion', 'howLongAgo'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // CRISIS DOMAIN - Safety Journey
  // ========================================================================
  assessCrisis: {
    primary: 'assessCrisis',
    suggestedFollowers: ['groundingExercise', 'createSafetyPlan', 'findCrisisResources'],
    contextKeys: ['severity', 'type', 'immediate'],
    typicalEmotion: 'concerned',
  },
  groundingExercise: {
    primary: 'groundingExercise',
    suggestedFollowers: ['checkIn', 'companionInGrief', 'createSafetyPlan'],
    contextKeys: ['technique', 'effectiveness'],
    typicalEmotion: 'empathetic',
  },
  createSafetyPlan: {
    primary: 'createSafetyPlan',
    suggestedFollowers: ['findCrisisResources', 'scheduleFollowUp', 'rememberAboutUser'],
    contextKeys: ['triggers', 'copingStrategies', 'contacts'],
    typicalEmotion: 'concerned',
  },

  // ========================================================================
  // ENGAGEMENT DOMAIN - Daily Rituals
  // ========================================================================
  morningSkyCheck: {
    primary: 'morningSkyCheck',
    suggestedFollowers: ['questionOfTheWeek', 'streakTracker', 'teamHuddle'],
    contextKeys: ['mood', 'energy'],
    typicalEmotion: 'empathetic',
  },
  streakTracker: {
    primary: 'streakTracker',
    suggestedFollowers: ['celebrationMoment', 'quickChallenges', 'awardBadge'],
    contextKeys: ['streak', 'domain'],
    typicalEmotion: 'happy',
  },
  celebrationMoment: {
    primary: 'celebrationMoment',
    suggestedFollowers: ['streakTracker', 'reflectionPrompts', 'teamHuddle'],
    contextKeys: ['achievement', 'celebrationType'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // DECISIONS DOMAIN
  // ========================================================================
  helpMeDecide: {
    primary: 'helpMeDecide',
    suggestedFollowers: ['questionBeneath', 'clarifyCareerGoals', 'rememberAboutUser'],
    contextKeys: ['decision', 'options', 'choice'],
    typicalEmotion: 'neutral',
  },
  questionBeneath: {
    primary: 'questionBeneath',
    suggestedFollowers: ['helpMeDecide', 'clarifyCareerGoals', 'processGrief'],
    contextKeys: ['surfaceQuestion', 'deeperQuestion'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // SIMPLE UTILITIES - Quick Help
  // ========================================================================
  setTimer: {
    primary: 'setTimer',
    suggestedFollowers: ['quickNote', 'checkTimerStatus'],
    contextKeys: ['duration', 'label'],
    typicalEmotion: 'neutral',
  },
  calculateTip: {
    primary: 'calculateTip',
    suggestedFollowers: ['splitBill', 'quickNote'],
    contextKeys: ['amount', 'tip'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // HEALTH DOMAIN
  // ========================================================================
  trackExercise: {
    primary: 'trackExercise',
    suggestedFollowers: ['logHabit', 'streakTracker', 'celebrationMoment'],
    contextKeys: ['activity', 'duration', 'intensity'],
    typicalEmotion: 'happy',
  },
  assessSleepQuality: {
    primary: 'assessSleepQuality',
    suggestedFollowers: ['setGoal', 'logHabit', 'assessBurnout'],
    contextKeys: ['quality', 'hours', 'issues'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // RELATIONSHIPS DOMAIN
  // ========================================================================
  prepareConversation: {
    primary: 'prepareConversation',
    suggestedFollowers: ['practiceConversation', 'draftDifficultMessage', 'rememberAboutUser'],
    contextKeys: ['topic', 'person', 'goal'],
    typicalEmotion: 'empathetic',
  },
  navigateConflict: {
    primary: 'navigateConflict',
    suggestedFollowers: ['prepareConversation', 'validateGrief', 'companionInGrief'],
    contextKeys: ['conflict', 'parties', 'needs'],
    typicalEmotion: 'empathetic',
  },

  // Goal tools chain naturally
  setGoal: {
    primary: 'setGoal',
    suggestedFollowers: ['rememberAboutUser', 'scheduleFollowUp', 'awardXP'],
    contextKeys: ['goalName', 'targetAmount', 'targetDate'],
    typicalEmotion: 'excited',
  },
  checkGoalProgress: {
    primary: 'checkGoalProgress',
    suggestedFollowers: ['provideEncouragement', 'awardBadge', 'suggestCheckIn'],
    contextKeys: ['goalName', 'progress', 'isOnTrack'],
    typicalEmotion: 'happy',
  },

  // Emotional support flows
  noteEmotionalState: {
    primary: 'noteEmotionalState',
    suggestedFollowers: ['checkIn', 'practiceGratitude', 'addressFinancialAnxiety'],
    contextKeys: ['state', 'context'],
    typicalEmotion: 'empathetic',
  },
  addressFinancialAnxiety: {
    primary: 'addressFinancialAnxiety',
    suggestedFollowers: ['reframeMoneyBelief', 'shareStory', 'wrapUp'],
    contextKeys: ['anxietyType', 'severity'],
    typicalEmotion: 'concerned',
  },

  // Habit tracking flows
  logHabit: {
    primary: 'logHabit',
    suggestedFollowers: ['awardXP', 'checkStreakMilestone', 'suggestNextHabit'],
    contextKeys: ['habitName', 'streak', 'completed'],
    typicalEmotion: 'celebratory',
  },
  getHabitStats: {
    primary: 'getHabitStats',
    suggestedFollowers: ['provideEncouragement', 'setGoal', 'logHabit'],
    contextKeys: ['habitName', 'streak', 'completionRate'],
    typicalEmotion: 'neutral',
  },

  // Financial tools
  analyzeSpending: {
    primary: 'analyzeSpending',
    suggestedFollowers: ['findSpendingLeaks', 'rememberMerchant', 'setGoal'],
    contextKeys: ['topCategories', 'totalSpend', 'trends'],
    typicalEmotion: 'neutral',
  },
  checkFinancialHealth: {
    primary: 'checkFinancialHealth',
    suggestedFollowers: ['setGoal', 'addressFinancialAnxiety', 'celebrateMilestone'],
    contextKeys: ['healthScore', 'recommendations'],
    typicalEmotion: 'empathetic',
  },

  // Communication tools
  draftDifficultMessage: {
    primary: 'draftDifficultMessage',
    suggestedFollowers: ['practiceConversation', 'sendEmail', 'setReminder'],
    contextKeys: ['conversationType', 'recipient', 'draft'],
    typicalEmotion: 'concerned',
  },
  sendEmail: {
    primary: 'sendEmail',
    suggestedFollowers: ['scheduleFollowUp', 'noteInterest', 'checkIn'],
    contextKeys: ['to', 'subject', 'sent'],
    typicalEmotion: 'happy',
  },

  // Celebration & achievements
  celebrateMilestone: {
    primary: 'celebrateMilestone',
    suggestedFollowers: ['awardBadge', 'shareStory', 'setGoal'],
    contextKeys: ['milestone', 'achievement'],
    typicalEmotion: 'celebratory',
  },
  awardBadge: {
    primary: 'awardBadge',
    suggestedFollowers: ['viewBadgeCollection', 'setGoal', 'wrapUp'],
    contextKeys: ['badgeName', 'rarity'],
    typicalEmotion: 'celebratory',
  },

  // Wrap up
  wrapUp: {
    primary: 'wrapUp',
    suggestedFollowers: [],
    contextKeys: ['sentiment'],
    typicalEmotion: 'empathetic',
  },
};

// ============================================================================
// EMOTION DETECTION
// ============================================================================

/**
 * Detect appropriate emotion based on result content
 */
function detectEmotion(result: unknown, toolName: string): ComposedResult['emotion'] {
  // Check for predefined emotion
  const chain = TOOL_CHAINS[toolName];
  if (chain?.typicalEmotion) {
    return chain.typicalEmotion;
  }

  // Analyze result content
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

  // Celebratory indicators
  if (/🎉|🏆|congrat|amazing|excellent|streak|milestone|level up/i.test(resultStr)) {
    return 'celebratory';
  }

  // Happy/positive indicators
  if (/✅|done|success|complete|great|good job|nice/i.test(resultStr)) {
    return 'happy';
  }

  // Excited indicators
  if (/!{2,}|wow|exciting|can't wait|looking forward/i.test(resultStr)) {
    return 'excited';
  }

  // Concerned indicators
  if (/⚠️|warning|careful|concern|worry|risk|issue/i.test(resultStr)) {
    return 'concerned';
  }

  // Empathetic indicators
  if (/understand|hear you|that's hard|must be|support|here for you/i.test(resultStr)) {
    return 'empathetic';
  }

  return 'neutral';
}

/**
 * Extract facts from result
 */
function extractFacts(result: unknown, toolName: string): ComposedResult['factsToRemember'] {
  const facts: ComposedResult['factsToRemember'] = [];

  // Tool-specific extraction
  if (toolName === 'setGoal') {
    const goalData = result as Record<string, unknown>;
    if (goalData.name) {
      facts.push({
        fact: `Set goal: ${goalData.name}`,
        category: 'goal',
        importance: 'high',
      });
    }
  }

  if (toolName === 'logHabit') {
    const habitData = result as Record<string, unknown>;
    if (habitData.streak && Number(habitData.streak) >= 7) {
      facts.push({
        fact: `${habitData.streak}-day streak on ${habitData.habitName}`,
        category: 'goal',
        importance: 'medium',
      });
    }
  }

  if (toolName === 'noteEmotionalState') {
    const emotionData = result as Record<string, unknown>;
    if (emotionData.state) {
      facts.push({
        fact: `Feeling ${emotionData.state}: ${emotionData.context}`,
        category: 'emotional',
        importance: 'medium',
      });
    }
  }

  return facts;
}

// ============================================================================
// TOOL COMPOSER
// ============================================================================

export class ToolComposer {
  private state: ConversationStateManager;
  private context = new Map<string, unknown>();
  private logger = getLogger();

  constructor(sessionId: string, userId?: string, agentId?: string) {
    this.state = getConversationState(sessionId, userId, agentId);
  }

  /**
   * Get the conversation state manager
   */
  getState(): ConversationStateManager {
    return this.state;
  }

  /**
   * Set context value for sharing between tools
   */
  setContext(key: string, value: unknown): void {
    this.context.set(key, value);
  }

  /**
   * Get context value
   */
  getContext<T>(key: string): T | undefined {
    return this.context.get(key) as T | undefined;
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context.clear();
  }

  /**
   * Compose a tool result with metadata
   */
  compose(toolName: string, result: unknown, options: ComposeOptions = {}): ComposedResult {
    const chain = TOOL_CHAINS[toolName];

    // Extract speech from result
    let speech: string;
    if (typeof result === 'string') {
      speech = result;
    } else if (result && typeof result === 'object' && 'speech' in result) {
      speech = (result as { speech: string }).speech;
    } else {
      speech = JSON.stringify(result);
    }

    // Detect emotion
    const emotion = options.emotion || detectEmotion(result, toolName);

    // Get suggested next tools
    const suggestedNext = chain?.suggestedFollowers || [];

    // Extract facts if requested
    const factsToRemember = options.extractFacts ? extractFacts(result, toolName) : undefined;

    // Store context keys for next tools
    if (options.shareContext && chain?.contextKeys) {
      for (const key of chain.contextKeys) {
        if (result && typeof result === 'object' && key in result) {
          this.setContext(key, (result as Record<string, unknown>)[key]);
        }
      }
    }

    // Update conversation state
    this.state.recordToolCall(toolName, speech.substring(0, 100));
    this.state.suggestNextTools(suggestedNext);

    if (factsToRemember) {
      for (const fact of factsToRemember) {
        this.state.addFactToRemember(fact.fact, fact.category, fact.importance);
      }
    }

    // Update emotional context based on tool
    if (emotion && emotion !== 'neutral') {
      const emotionMap: Record<string, EmotionalContext['emotions'][0]> = {
        happy: 'happy',
        excited: 'excited',
        concerned: 'anxious',
        empathetic: 'calm',
        celebratory: 'excited',
      };
      if (emotionMap[emotion]) {
        this.state.detectEmotion(emotionMap[emotion]);
      }
    }

    this.state.incrementTurn();

    return {
      result,
      speech,
      emotion,
      suggestedNext,
      factsToRemember,
    };
  }

  /**
   * Get suggested next tools based on conversation state
   */
  getSuggestedTools(): string[] {
    return this.state.getToolExecutionData().suggestedNextTools;
  }

  /**
   * Check if we should wrap up
   */
  shouldWrapUp(): { should: boolean; reasons: string[] } {
    return this.state.shouldWrapUp();
  }

  /**
   * Get emotional context for voice modulation
   */
  getEmotionalContext(): EmotionalContext {
    return this.state.getEmotionalContext() as EmotionalContext;
  }

  /**
   * Get conversation summary for LLM context
   */
  getConversationSummary(): string {
    return this.state.getSummaryForLLM();
  }

  /**
   * Get a circle-back topic if any pending
   */
  getCircleBackTopic(): { topic: string; reason: string } | null {
    return this.state.getNextCircleBack();
  }

  /**
   * Add a topic to circle back to later
   */
  addCircleBack(topic: string, reason: string): void {
    this.state.addCircleBackTopic(topic, reason);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a tool composer for a session
 */
export function createToolComposer(
  sessionId: string,
  userId?: string,
  agentId?: string
): ToolComposer {
  return new ToolComposer(sessionId, userId, agentId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ToolComposer,
  createToolComposer,
  TOOL_CHAINS,
};
