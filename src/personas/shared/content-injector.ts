/**
 * Shared Content Injector
 *
 * Provides runtime access to shared persona content for injection into
 * prompts and responses. This makes the team dynamics, relationship building,
 * and life event content actually get used.
 */

import {
  generateHandoffSummary,
  getCasualMention,
  getHandoffWarmth,
  getOpinionAbout,
  getTeamSuggestion,
  type HandoffContext,
} from './team-dynamics.js';

import {
  getAcknowledgment,
  getDeepeningQuestion,
  getNameUsage,
  getStageClosing,
  getStageGreeting,
  shouldSharePersonalStory,
} from './relationship-building.js';

import type { RelationshipStage } from '../../types/user-profile.js';

import {
  getMilestoneMessage,
  getTimeBasedGreeting,
  isMilestoneConversation,
} from './welcome-back.js';

import {
  findEventsToAcknowledge,
  generateEventAcknowledgment,
  getUpcomingEventMention,
  type LifeEvent,
} from './life-events.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SharedContentContext {
  currentPersona: string;
  userName?: string;
  relationshipStage?: string;
  conversationCount?: number;
  daysSinceLastContact?: number;
  lastConversationSummary?: string;
  lifeEvents?: LifeEvent[];
  previousPersona?: string; // For handoffs

  // Enhanced life events context (from UserProfile.lifeEvents)
  activeLifeEvents?: Array<{
    type: string;
    title: string;
    status: string;
    date?: Date;
    emotionalSignificance: string;
  }>;
  recentLifeMilestones?: string[]; // Recently completed events (for celebration)
}

export interface InjectedContent {
  greeting?: string;
  teamContext?: string;
  relationshipContext?: string;
  lifeEventAcknowledgment?: string;
  callbackContent?: string;
  closingContent?: string;
}

// ============================================================================
// SIMPLE WELCOME BACK GENERATION (doesn't need full UserProfile)
// ============================================================================

function simpleWelcomeBack(
  daysSinceLastContact: number,
  userName?: string,
  lastSummary?: string
): string | null {
  const name = userName ? `${userName}! ` : '';

  if (daysSinceLastContact === 0) {
    return `${name}Back so soon! <break time=\"200ms\"/>What's going on?`;
  } else if (daysSinceLastContact === 1) {
    return `${name}Good to see you again! <break time=\"200ms\"/>How's it going?`;
  } else if (daysSinceLastContact <= 7) {
    return `${name}Hey! <break time=\"200ms\"/>It's been a few days. <break time=\"150ms\"/>What's on your mind?`;
  } else if (daysSinceLastContact <= 30) {
    const intro = `${name}Welcome back! <break time=\"200ms\"/>It's been a little while.`;
    if (lastSummary) {
      return `${intro} <break time=\"150ms\"/>Last time we talked about ${lastSummary}. <break time=\"200ms\"/>How'd that go?`;
    }
    return intro;
  } else {
    return `${name}It's great to see you again! <break time=\"200ms\"/>It's been a while. <break time=\"150ms\"/>What's new?`;
  }
}

// ============================================================================
// MAIN INJECTOR FUNCTION
// ============================================================================

/**
 * Generate all applicable shared content for a conversation turn
 */
export function injectSharedContent(
  context: SharedContentContext,
  options?: {
    isGreeting?: boolean;
    isClosing?: boolean;
    mentionTeammate?: string;
    isHandoff?: boolean;
    lastUserMessage?: string;
  }
): InjectedContent {
  const result: InjectedContent = {};
  const { userName, relationshipStage, conversationCount, daysSinceLastContact } = context;

  // ========== GREETING CONTENT ==========
  if (options?.isGreeting) {
    // Welcome back for returning users
    if (conversationCount && conversationCount > 1 && daysSinceLastContact !== undefined) {
      const welcome = simpleWelcomeBack(
        daysSinceLastContact,
        userName,
        context.lastConversationSummary
      );
      if (welcome) {
        result.greeting = welcome;
      }
    }

    // Stage-appropriate greeting (if no welcome back)
    if (relationshipStage && !result.greeting) {
      const stageGreeting = getStageGreeting(relationshipStage as RelationshipStage);
      if (stageGreeting) {
        result.greeting = userName ? stageGreeting.replace('{name}', userName) : stageGreeting;
      }
    }

    // Add time-based greeting if nothing else
    if (!result.greeting && daysSinceLastContact !== undefined) {
      result.greeting = getTimeBasedGreeting(daysSinceLastContact, userName);
    }

    // Milestone conversation (10th, 25th, 50th, etc.)
    if (conversationCount && isMilestoneConversation(conversationCount)) {
      const milestone = getMilestoneMessage(conversationCount);
      if (milestone) {
        result.greeting = result.greeting ? `${result.greeting} ${milestone}` : milestone;
      }
    }
  }

  // ========== TEAM CONTEXT (HANDOFFS) ==========
  if (options?.isHandoff && context.previousPersona) {
    // What to say when receiving a handoff
    const warmth = getHandoffWarmth('from', context.previousPersona);
    if (warmth) {
      result.teamContext = warmth;
    }
  } else if (options?.mentionTeammate) {
    // Casual mention of a teammate
    const mention = getCasualMention(options.mentionTeammate);
    if (mention) {
      result.teamContext = mention;
    }
  }

  // ========== RELATIONSHIP CONTEXT ==========
  if (relationshipStage) {
    // Deepening question (occasionally)
    if (Math.random() < 0.2) {
      // 20% chance
      const question = getDeepeningQuestion(relationshipStage as RelationshipStage);
      if (question) {
        result.relationshipContext = question;
      }
    }
  }

  // ========== LIFE EVENT ACKNOWLEDGMENT ==========
  if (context.lifeEvents && context.lifeEvents.length > 0) {
    const eventsToAck = findEventsToAcknowledge(context.lifeEvents);
    if (eventsToAck.length > 0) {
      // Acknowledge the most relevant event
      const ack = generateEventAcknowledgment(eventsToAck[0]);
      if (ack) {
        result.lifeEventAcknowledgment = ack;
      }
    } else {
      // Check for upcoming events to mention
      const upcoming = context.lifeEvents.find((e) => {
        const days = Math.ceil((new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days > 0 && days <= 14;
      });
      if (upcoming) {
        const mention = getUpcomingEventMention(upcoming);
        if (mention) {
          result.lifeEventAcknowledgment = mention;
        }
      }
    }
  }

  // ========== CLOSING CONTENT ==========
  if (options?.isClosing && relationshipStage) {
    const closing = getStageClosing(relationshipStage as RelationshipStage);
    if (closing) {
      result.closingContent = userName ? closing.replace('{name}', userName) : closing;
    }
  }

  return result;
}

// ============================================================================
// SPECIFIC CONTENT GETTERS
// ============================================================================

/**
 * Get what a persona should say about a teammate
 */
export function getTeammateOpinion(fromPersona: string, aboutPersona: string): string | null {
  return getOpinionAbout(fromPersona, aboutPersona);
}

/**
 * Get a suggestion to bring in a teammate
 */
export function suggestTeammate(persona: string): string | null {
  return getTeamSuggestion(persona);
}

/**
 * Generate handoff context for passing to next persona
 */
export function createHandoffContext(
  fromPersona: string,
  toPersona: string,
  topicsDiscussed: string[],
  currentGoal?: string,
  emotionalState?: string,
  keyPoints: string[] = []
): string {
  const context: HandoffContext = {
    fromPersona,
    toPersona,
    topicsDiscussed,
    currentGoal,
    emotionalState,
    keyPointsToKnow: keyPoints,
  };
  return generateHandoffSummary(context);
}

/**
 * Get appropriate acknowledgment for user's situation
 */
export function acknowledgeUser(
  situation: 'personal' | 'emotional' | 'progress' | 'struggle'
): string {
  return getAcknowledgment(situation);
}

/**
 * Get name usage for personalization
 */
export function getPersonalizedNameUsage(
  name: string,
  context: 'greeting' | 'emphasis' | 'comfort' | 'celebration'
): string {
  return getNameUsage(name, context);
}

/**
 * Check if a personal story should be shared
 */
export function shouldTellStory(stage: string, storyWeight: 'light' | 'medium' | 'heavy'): boolean {
  return shouldSharePersonalStory(stage as RelationshipStage, storyWeight);
}

/**
 * Get time-appropriate greeting
 * @param daysSince - Days since last contact (0 = same day)
 * @param name - Optional user name
 */
export function getTimeGreeting(daysSince = 0, name?: string): string {
  return getTimeBasedGreeting(daysSince, name);
}

// ============================================================================
// PROMPT INJECTION HELPERS
// ============================================================================

/**
 * Format injected content for prompt
 */
export function formatForPrompt(content: InjectedContent): string {
  const sections: string[] = [];

  if (content.greeting) {
    sections.push(`[GREETING SUGGESTION]\n${content.greeting}`);
  }

  if (content.teamContext) {
    sections.push(`[TEAM CONTEXT]\n${content.teamContext}`);
  }

  if (content.relationshipContext) {
    sections.push(`[RELATIONSHIP]\n${content.relationshipContext}`);
  }

  if (content.lifeEventAcknowledgment) {
    sections.push(`[ACKNOWLEDGE]\n${content.lifeEventAcknowledgment}`);
  }

  if (content.callbackContent) {
    sections.push(`[CALLBACK]\n${content.callbackContent}`);
  }

  if (content.closingContent) {
    sections.push(`[CLOSING]\n${content.closingContent}`);
  }

  return sections.join('\n\n');
}

export default injectSharedContent;
