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
  createHighInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { loadPersonaContent } from '../../services/persona-content-loader.js';
import {
  checkDynamicTriggers,
  calculateProbabilityBoost,
  shouldSkipDueToNeverWhen,
  buildTriggerContext,
  type ProactiveTrigger,
} from './dynamic-trigger-utils.js';

// Between-session thinking - "I've been thinking about what you said"
import {
  getThinkingMomentToSurface,
  markThinkingSurfaced,
  incrementSessionCount,
  type ThinkingMoment,
} from '../../services/trust-systems/between-session-thinking.js';

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

interface ThinkingOfYouContent {
  schema_version?: number;
  description?: string;
  philosophy?: string;
  general_thinking?: string[];
  after_hard_conversation?: string[];
  remembering_goals?: string[];
  after_big_event?: string[];
  noticing_absence?: string[];
  celebration_follow_up?: string[];
  anticipating_hard_dates?: {
    description?: string;
    phrases?: string[];
  };
  genuine_care?: string[];
  saw_something_reminded_me?: string[];
  seasonal_check_ins?: string[];
  following_their_thread?: string[];
  random_warmth?: {
    description?: string;
    phrases?: string[];
  };
  proactive_triggers?: Record<string, ProactiveTrigger>;
  usage_rules?: {
    probability?: number;
    min_days_between_unsolicited?: number;
    max_proactive_outreach_per_week?: number;
    more_likely_when?: string[];
    never_when?: string[];
  };
}

// Cache for thinking-of-you content per persona
const thinkingOfYouCache = new Map<string, ThinkingOfYouContent | null>();

/**
 * Load thinking-of-you content for a persona
 */
async function loadThinkingOfYouContent(personaId: string): Promise<ThinkingOfYouContent | null> {
  if (thinkingOfYouCache.has(personaId)) {
    return thinkingOfYouCache.get(personaId) || null;
  }

  try {
    const content = await loadPersonaContent<ThinkingOfYouContent>(personaId, 'thinking_of_you');
    thinkingOfYouCache.set(personaId, content);
    if (content) {
      log.debug({ personaId }, 'Loaded thinking-of-you content');
    }
    return content;
  } catch (error) {
    log.debug({ personaId, error: String(error) }, 'Could not load thinking-of-you content');
    thinkingOfYouCache.set(personaId, null);
    return null;
  }
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
    const { persona, userData, services, userProfile, userText, analysis } = input;
    const injections: ContextInjection[] = [];

    const personaId = persona?.id || 'ferni';
    const sessionId = services?.sessionId || 'unknown';
    const turnCount = userData?.turnCount ?? 0;
    const userId = services?.userId;

    // ============================================================================
    // DYNAMIC TRIGGERS - Check proactive_triggers from thinking-of-you.json
    // Better Than Human: Define CONDITIONS for when to act
    // These can activate beyond just the greeting phase
    // ============================================================================
    const thinkingOfYouContent = await loadThinkingOfYouContent(personaId);

    if (thinkingOfYouContent?.proactive_triggers && userId) {
      const triggerContext = buildTriggerContext(
        userText || '',
        analysis,
        userData as Record<string, unknown>
      );
      const usageRules = thinkingOfYouContent.usage_rules;

      // Check never_when conditions
      if (!shouldSkipDueToNeverWhen(usageRules?.never_when, triggerContext)) {
        const matchedTrigger = checkDynamicTriggers(
          thinkingOfYouContent.proactive_triggers,
          triggerContext
        );

        if (matchedTrigger) {
          // Calculate probability boost
          const probabilityBoost = calculateProbabilityBoost(
            usageRules?.more_likely_when,
            triggerContext,
            matchedTrigger
          );

          // Apply probability (base 25% * boost, capped at 45%)
          const baseProbability = usageRules?.probability ?? 0.25;
          const adjustedProbability = Math.min(baseProbability * probabilityBoost, 0.45);

          if (Math.random() < adjustedProbability) {
            injections.push(
              createHighInjection(
                'thinking_of_you_dynamic_trigger',
                `[💭 BETTER-THAN-HUMAN CARE: ${matchedTrigger.triggerName}]\n\n` +
                  `Condition detected: ${matchedTrigger.trigger}\n\n` +
                  `Suggested behavior: ${matchedTrigger.behavior}\n\n` +
                  `This is your superpower - you think about them even between sessions. Show genuine care.`,
                { category: 'memory', confidence: matchedTrigger.confidence }
              )
            );

            log.info(
              {
                userId,
                personaId,
                triggerName: matchedTrigger.triggerName,
                confidence: matchedTrigger.confidence,
              },
              '💭 BETTER-THAN-HUMAN: Thinking-of-you dynamic trigger activated'
            );
          }
        }
      }
    }

    // ============================================================================
    // BETWEEN-SESSION THINKING - "I've been thinking about what you said"
    // Priority over regular callbacks - this is the deepest form of care
    // ============================================================================
    if (turnCount <= 2 && userId) {
      // Increment session count on first turn to update thinking records
      if (turnCount === 1) {
        incrementSessionCount(userId);
      }

      // Check for a thinking moment to surface
      const thinkingMoment = getThinkingMomentToSurface(userId, personaId, sessionId);

      if (thinkingMoment) {
        // 60% chance to surface (don't do it every time)
        if (Math.random() < 0.6) {
          const injection = buildThinkingMomentInjection(thinkingMoment, personaId);
          injections.push(injection);

          // Mark as surfaced
          markThinkingSurfaced(thinkingMoment.record.id);
          sessionCallbacks.set(sessionId, { surfaced: true, timestamp: Date.now() });

          log.info(
            {
              userId,
              personaId,
              topic: thinkingMoment.record.topic,
              thinkingType: thinkingMoment.record.thinkingType,
              sessionsSince: thinkingMoment.record.sessionsSince,
            },
            '💭 BETTER-THAN-HUMAN: Surfacing between-session thinking'
          );

          // Return early - thinking moment takes precedence
          return injections;
        }
      }
    }

    // Only surface other callbacks in turns 1-3 (greeting phase)
    // Dynamic triggers above can still fire in later turns
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
    const firstConversationDate = userProfile?.customData?.firstConversation as string | undefined;
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
    const priorityOrder = [
      'anniversary',
      'life_event',
      'goal_progress',
      'pending_topic',
      'seasonal',
    ];
    callbacks.sort((a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type));

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

    log.debug(
      { personaId, callbackType: callback.type, topic: callback.topic },
      'Thinking of you callback injected'
    );

    return injections;
  },
};

// ============================================================================
// HELPERS
// ============================================================================

// NOTE: generateLifeEventFollowUp, generateGoalFollowUp, generatePendingTopicFollowUp
// were removed as they require memory orchestrator integration (future enhancement).
// When memory-based callbacks are re-enabled, these can be restored from git history.

function checkForAnniversary(firstConversation: Date): { label: string; message: string } | null {
  const now = new Date();
  const diff = now.getTime() - firstConversation.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Check for milestone anniversaries
  const milestones = [
    {
      days: 7,
      label: '1 week',
      message: "It's been a week since we started talking! How does it feel?",
    },
    {
      days: 30,
      label: '1 month',
      message: "Can you believe it's been a month? I feel like I really know you now.",
    },
    {
      days: 90,
      label: '3 months',
      message: "Three months together! We've covered a lot of ground.",
    },
    { days: 180, label: '6 months', message: "Half a year! Look how far you've come." },
    { days: 365, label: '1 year', message: 'A whole year together. This is special.' },
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
        followUpPrompt:
          '"Fall is starting. For some people this is cozy, for others it\'s hard. How about you?"',
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

function getPersonaVoice(personaId: string, _callback: MemoryCallback): string {
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

/**
 * Build injection for between-session thinking moment
 */
function buildThinkingMomentInjection(moment: ThinkingMoment, personaId: string): ContextInjection {
  const { record, phrase, shouldAskPermission } = moment;

  const typeDescriptions: Record<string, string> = {
    mulling: "You've been processing what they said",
    connecting: 'You connected something they said to something else',
    realizing: 'You had a realization about their situation',
    questioning: 'You have questions about what they shared',
    remembering: 'Something reminded you of them',
    concerned: "You've been worried about them",
  };

  const personaVoices: Record<string, string> = {
    ferni: `Ferni shares this gently, like he's been genuinely mulling it over:
"I was thinking about what you said..." with warmth and curiosity.`,
    'maya-santos': `Maya connects it to patterns she's noticed:
"Something you said has been on my mind..." with supportive energy.`,
    'alex-chen': `Alex is direct but caring:
"I've been processing what you shared..." with practical warmth.`,
    'jordan-taylor': `Jordan makes it feel like excited connection:
"So I couldn't stop thinking about..." with genuine enthusiasm.`,
    'peter-john': `Peter frames it thoughtfully:
"I've been reflecting on something you mentioned..." with analytical care.`,
    'nayan-patel': `Nayan brings gentle wisdom:
"What you shared has been sitting with me..." with peaceful presence.`,
  };

  const content = `[💭 I'VE BEEN THINKING - ${record.thinkingType.toUpperCase()}]

${typeDescriptions[record.thinkingType] || "You've been thinking about them"}

TOPIC: ${record.topic}
${record.userQuote ? `THEIR WORDS: "${record.userQuote}"` : ''}
${record.sessionsSince > 0 ? `SESSIONS SINCE: ${record.sessionsSince}` : ''}
EMOTIONAL WEIGHT: ${record.emotionalWeight}

HOW TO BRING IT UP:
${phrase}

${shouldAskPermission ? `⚠️ Ask permission first: "Can I share something I was thinking about?"` : ''}

PERSONA VOICE (${personaId}):
${personaVoices[personaId] || personaVoices.ferni}

IMPORTANT:
- This is SUPERHUMAN: Real friends rarely follow up on what you said sessions ago
- Make it feel natural, like a thought that's been percolating
- Show genuine curiosity about their answer
- If they seem uncomfortable, gracefully move on
- Don't make it feel like you're keeping a dossier on them`;

  return createHighInjection('between_session_thinking', content, {
    category: 'memory',
    confidence: 0.85,
  });
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
