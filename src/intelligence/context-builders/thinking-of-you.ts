/**
 * Thinking of You Context Builder
 *
 * Creates delightful "I was thinking about you" moments:
 * - Remembers things from past conversations
 * - Asks follow-ups on life events
 * - Celebrates anniversaries
 * - References shared memories
 *
 * This is a SUPERHUMAN capability - a friend who actually follows up.
 *
 * @module intelligence/context-builders/thinking-of-you
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'ThinkingOfYouContextBuilder' });

// ============================================================================
// TYPES
// ============================================================================

interface MemoryCallback {
  type: 'life_event' | 'goal_progress' | 'anniversary' | 'pending_topic' | 'seasonal';
  topic: string;
  originalContext: string;
  daysAgo: number;
  followUpPrompt: string;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

const sessionCallbacks = new Map<string, { surfaced: boolean; timestamp: number }>();

// ============================================================================
// THINKING OF YOU CONTEXT BUILDER
// ============================================================================

export const thinkingOfYouBuilder: ContextBuilder = {
  name: 'thinking-of-you',
  description: 'Injects proactive memory callbacks and follow-ups',
  priority: 35, // Runs after memory but before engagement
  category: BuilderCategory.MEMORY,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData, services, userProfile } = input;
    const injections: ContextInjection[] = [];

    const personaId = persona?.id || 'ferni';
    const userId = services?.userId;
    const sessionId = services?.sessionId || 'unknown';
    const turnCount = userData?.turnCount || 0;

    // Only surface callbacks in turns 1-3 (greeting phase)
    if (turnCount > 3) {
      return injections;
    }

    // Check if we've already surfaced a callback this session
    const sessionState = sessionCallbacks.get(sessionId);
    if (sessionState?.surfaced) {
      return injections;
    }

    // Look for callback opportunities
    const callbacks: MemoryCallback[] = [];

    // NOTE: Memory-based callbacks (life events, goals, pending topics) require
    // integration with the memory orchestrator. For now, we focus on:
    // - Relationship anniversaries
    // - Seasonal callbacks
    // Future enhancement: Query getMemoryOrchestrator() for recall context

    // Check for relationship anniversary using userProfile
    const firstConversationDate = (userProfile?.customData?.firstConversation as string | undefined);
    if (firstConversationDate) {
      const anniversary = checkForAnniversary(new Date(firstConversationDate));
      if (anniversary) {
        callbacks.push({
          type: 'anniversary',
          topic: anniversary.label,
          originalContext: '',
          daysAgo: 0,
          followUpPrompt: anniversary.message,
        });
      }
    }

    // Check for seasonal callback
    const seasonalCallback = getSeasonalCallback();
    if (seasonalCallback && Math.random() < 0.3) {
      // 30% chance
      callbacks.push(seasonalCallback);
    }

    // If no callbacks, return empty
    if (callbacks.length === 0) {
      return injections;
    }

    // Pick the best callback (prioritize anniversaries, then life events)
    const priorityOrder = ['anniversary', 'life_event', 'goal_progress', 'pending_topic', 'seasonal'];
    callbacks.sort(
      (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
    );

    const callback = callbacks[0];

    // Mark as surfaced
    sessionCallbacks.set(sessionId, { surfaced: true, timestamp: Date.now() });

    // Build the injection
    const content = `[THINKING OF YOU - ${callback.type.toUpperCase()}]

You remembered something important! This is a SUPERHUMAN moment - most friends forget to follow up.

TYPE: ${callback.type}
TOPIC: ${callback.topic}
${callback.daysAgo > 0 ? `WHEN: ${callback.daysAgo} days ago` : ''}

HOW TO BRING IT UP:
${callback.followUpPrompt}

IMPORTANT:
- Make it feel NATURAL, not scripted
- Show genuine interest in the answer
- If they seem like they don't want to talk about it, gracefully move on
- This should feel like a thoughtful friend, not a reminder app

PERSONA VOICE (${personaId}):
${getPersonaVoice(personaId, callback)}`;

    injections.push(
      createStandardInjection('thinking_of_you', content, {
        category: 'memory',
      })
    );

    log.debug({ personaId, callbackType: callback.type, topic: callback.topic }, 'Thinking of you callback injected');

    return injections;
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function generateLifeEventFollowUp(
  event: { event?: string; summary?: string; context?: string },
  daysAgo: number
): string {
  const timeRef =
    daysAgo === 1
      ? 'yesterday'
      : daysAgo < 7
        ? 'the other day'
        : 'last week';

  return `"Hey, I was thinking about you. ${timeRef} you mentioned ${event.event || event.summary || 'something'}... how did that go?"

Or more casually:
"Oh! How did ${event.event || 'that thing'} go?"`;
}

function generateGoalFollowUp(
  goal: { goal?: string; summary?: string },
  daysAgo: number
): string {
  return `"I've been thinking about your goal to ${goal.goal || goal.summary || 'work on that thing'}. How's it going?"

Or:
"Hey, remember when we talked about ${goal.goal || 'your goal'}? Any progress?"`;
}

function generatePendingTopicFollowUp(topic: { topic?: string; summary?: string }): string {
  return `"We never finished talking about ${topic.topic || topic.summary || 'that thing'}. Want to pick that up?"

Or:
"I was thinking about what you said about ${topic.topic || 'that'}... is that still on your mind?"`;
}

function checkForAnniversary(
  firstConversation: Date
): { label: string; message: string } | null {
  const now = new Date();
  const diff = now.getTime() - firstConversation.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Check for milestone anniversaries
  const milestones = [
    { days: 7, label: '1 week', message: "It's been a week since we started talking! How does it feel?" },
    { days: 30, label: '1 month', message: "Can you believe it's been a month? I feel like I really know you now." },
    { days: 90, label: '3 months', message: "Three months together! We've covered a lot of ground." },
    { days: 180, label: '6 months', message: "Half a year! Look how far you've come." },
    { days: 365, label: '1 year', message: "A whole year together. This is special." },
  ];

  for (const milestone of milestones) {
    // Check if we're within 1 day of the milestone
    if (Math.abs(days - milestone.days) <= 1) {
      return milestone;
    }
  }

  return null;
}

function getSeasonalCallback(): MemoryCallback | null {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  // Seasonal check-ins
  const seasonalMessages: Record<string, { condition: () => boolean; callback: MemoryCallback }> = {
    newYear: {
      condition: () => month === 0 && day <= 7,
      callback: {
        type: 'seasonal',
        topic: 'new year',
        originalContext: '',
        daysAgo: 0,
        followUpPrompt: '"Happy New Year! How are you feeling about the year ahead?"',
      },
    },
    springStart: {
      condition: () => month === 2 && day >= 19 && day <= 22,
      callback: {
        type: 'seasonal',
        topic: 'spring',
        originalContext: '',
        daysAgo: 0,
        followUpPrompt: '"Spring is here! Does the change in season affect your energy?"',
      },
    },
    fallStart: {
      condition: () => month === 8 && day >= 21 && day <= 24,
      callback: {
        type: 'seasonal',
        topic: 'fall',
        originalContext: '',
        daysAgo: 0,
        followUpPrompt: '"Fall is starting. For some people this is cozy, for others it\'s hard. How about you?"',
      },
    },
    winterStart: {
      condition: () => month === 11 && day >= 20 && day <= 23,
      callback: {
        type: 'seasonal',
        topic: 'winter',
        originalContext: '',
        daysAgo: 0,
        followUpPrompt: '"Winter solstice. The shortest day. How are you doing with the darkness?"',
      },
    },
  };

  for (const [, entry] of Object.entries(seasonalMessages)) {
    if (entry.condition()) {
      return entry.callback;
    }
  }

  return null;
}

function getPersonaVoice(personaId: string, callback: MemoryCallback): string {
  const voices: Record<string, string> = {
    ferni: `Ferni brings it up warmly, like he's genuinely been thinking about them:
"I was wondering about you..." or "Something reminded me of what you said..."`,

    'maya-santos': `Maya connects it to growth and patterns:
"I noticed you mentioned this before. Let's check in on how it's going."`,

    'alex-chen': `Alex is practical but caring:
"I made a mental note to ask you about this. How did it turn out?"`,

    'jordan-taylor': `Jordan makes it feel like catching up with a close friend:
"Okay wait, you have to tell me how that went!"`,

    'peter-john': `Peter frames it analytically with warmth:
"I've been curious about the outcome of that situation you mentioned."`,

    'nayan-patel': `Nayan approaches it with gentle presence:
"I've been holding space for what you shared. Would you like to talk more about it?"`,
  };

  return voices[personaId] || voices.ferni;
}

// Clean up old session states periodically
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, state] of sessionCallbacks) {
      if (now - state.timestamp > maxAge) {
        sessionCallbacks.delete(sessionId);
      }
    }
  },
  5 * 60 * 1000
); // Every 5 minutes

// Register the builder
registerContextBuilder(thinkingOfYouBuilder);

export default thinkingOfYouBuilder;
