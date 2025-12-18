/**
 * World Awareness Domain Tools
 *
 * Tools that give agents contextual awareness of time, environment, and world state.
 * These make conversations feel more grounded, natural, and contextually relevant.
 *
 * DOMAIN: awareness
 * TOOLS:
 *   Time: getCurrentContext, getTimeAwareness, getSeasonalContext
 *   Environment: getUserContext, getLocationContext
 *   World: getWorldContext, getTodaySignificance
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// TIME AWARENESS
// ============================================================================

const getCurrentContextDef: ToolDefinition = {
  id: 'getCurrentContext',
  name: 'Get Current Context',
  description: 'Get comprehensive awareness of current time, day, season, and contextual factors',
  domain: 'awareness',
  tags: ['awareness', 'time', 'context', 'environment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getCurrentContext'),
      parameters: z.object({
        includeWeather: z.boolean().optional().describe('Include weather context if available'),
        timezone: z
          .string()
          .optional()
          .describe('Override timezone (default: user profile or UTC)'),
      }),
      execute: async ({ includeWeather, timezone }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Getting current context');

        const now = new Date();
        const userTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Format time in user's timezone
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        const time = timeFormatter.format(now);
        const date = dateFormatter.format(now);
        const hour = now.getHours();

        // Time of day
        let timeOfDay = 'night';
        let greeting = 'Good evening';
        if (hour >= 5 && hour < 12) {
          timeOfDay = 'morning';
          greeting = 'Good morning';
        } else if (hour >= 12 && hour < 17) {
          timeOfDay = 'afternoon';
          greeting = 'Good afternoon';
        } else if (hour >= 17 && hour < 21) {
          timeOfDay = 'evening';
          greeting = 'Good evening';
        }

        // Day context
        const dayOfWeek = now.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isFriday = dayOfWeek === 5;
        const isMonday = dayOfWeek === 1;

        // Season (Northern Hemisphere approximation)
        const month = now.getMonth();
        let season = 'winter';
        if (month >= 2 && month <= 4) season = 'spring';
        else if (month >= 5 && month <= 7) season = 'summer';
        else if (month >= 8 && month <= 10) season = 'fall';

        // Special day awareness
        const specialDays: string[] = [];
        const monthDay = `${month + 1}-${now.getDate()}`;

        // Common holidays (expand as needed)
        const holidays: Record<string, string> = {
          '1-1': "New Year's Day",
          '2-14': "Valentine's Day",
          '7-4': 'Independence Day (US)',
          '10-31': 'Halloween',
          '12-25': 'Christmas',
          '12-31': "New Year's Eve",
        };

        if (holidays[monthDay]) {
          specialDays.push(holidays[monthDay]);
        }

        // Build context object
        const context = {
          current_time: time,
          current_date: date,
          timezone: userTimezone,
          time_of_day: timeOfDay,
          greeting,
          is_weekend: isWeekend,
          is_friday: isFriday,
          is_monday: isMonday,
          season,
          special_days: specialDays,
          contextual_awareness: buildContextualAwareness(
            timeOfDay,
            isWeekend,
            isFriday,
            isMonday,
            season
          ),
        };

        return JSON.stringify(context, null, 2);
      },
    });
  },
};

function buildContextualAwareness(
  timeOfDay: string,
  isWeekend: boolean,
  isFriday: boolean,
  isMonday: boolean,
  season: string
): string {
  const insights: string[] = [];

  // Time-based insights
  if (timeOfDay === 'morning') {
    insights.push('User is starting their day - energy may be fresh, goals setting is natural');
  } else if (timeOfDay === 'evening') {
    insights.push('User is winding down - reflection and next-day planning fit well');
  } else if (timeOfDay === 'night') {
    insights.push('Late hour - keep conversation calming, avoid stimulating topics');
  }

  // Day-based insights
  if (isMonday) {
    insights.push('Monday energy - week planning, goal setting, fresh starts');
  } else if (isFriday) {
    insights.push('Friday energy - week review, celebration of wins, weekend planning');
  } else if (isWeekend) {
    insights.push('Weekend - more relaxed pace, personal time, reflection');
  }

  // Season-based insights
  const seasonInsights: Record<string, string> = {
    spring: 'Spring - themes of renewal, growth, new beginnings',
    summer: 'Summer - energy, activity, abundance, outdoor time',
    fall: 'Fall - harvest, reflection, preparation, cozy settling',
    winter: 'Winter - introspection, rest, planning, warmth-seeking',
  };
  insights.push(seasonInsights[season]);

  return insights.join('. ');
}

// ============================================================================
// USER CONTEXT
// ============================================================================

const getUserContextDef: ToolDefinition = {
  id: 'getUserContext',
  name: 'Get User Context',
  description: 'Get awareness of user state, recent activity, and relationship context',
  domain: 'awareness',
  tags: ['awareness', 'user', 'context', 'relationship'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getUserContext'),
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Getting user context');

        const userData = toolCtx.userData as {
          name?: string;
          services?: {
            userProfile?: {
              name?: string;
              totalConversations: number;
              relationshipStage: string;
              preferredTopics: string[];
              recentMoods?: string[];
              goals?: Array<{ name: string; status: string }>;
              lastConversationSummary?: string;
            };
          };
          keyMoments?: string[];
          topics?: string[];
        };

        const services = userData?.services;
        const profile = services?.userProfile;

        const context: Record<string, unknown> = {
          name: profile?.name || userData?.name || 'Unknown',
          relationship: {
            total_conversations: profile?.totalConversations || 1,
            stage: profile?.relationshipStage || 'new',
            is_new_user: (profile?.totalConversations || 1) <= 1,
          },
          interests: {
            preferred_topics: profile?.preferredTopics || [],
            recent_topics: userData?.topics || [],
          },
          emotional_context: {
            recent_moods: profile?.recentMoods || [],
            key_moments_today: userData?.keyMoments || [],
          },
          goals: {
            active_goals: profile?.goals?.filter((g) => g.status === 'active') || [],
          },
          last_conversation: profile?.lastConversationSummary || null,
        };

        // Add relationship guidance based on stage
        const relationshipGuidance: Record<string, string> = {
          new: 'New relationship - focus on learning about them, building trust, being warm but not presumptuous',
          acquaintance:
            'Getting to know them - can reference past conversations, still learning preferences',
          familiar: 'Established relationship - can be more casual, reference shared history',
          trusted: 'Deep relationship - can challenge, be vulnerable, reference deep knowledge',
        };

        context.relationship_guidance = relationshipGuidance[profile?.relationshipStage || 'new'];

        return JSON.stringify(context, null, 2);
      },
    });
  },
};

// ============================================================================
// CONVERSATIONAL AWARENESS
// ============================================================================

const getConversationAwarenessDef: ToolDefinition = {
  id: 'getConversationAwareness',
  name: 'Get Conversation Awareness',
  description: 'Get awareness of current conversation flow, topics, and emotional trajectory',
  domain: 'awareness',
  tags: ['awareness', 'conversation', 'emotional', 'flow'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getConversationAwareness'),
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Getting conversation awareness');

        const userData = toolCtx.userData as {
          conversationState?: {
            getConversationContext: () => {
              topics: string[];
              emotionalJourney: string[];
              currentMood: string;
              engagementLevel: string;
              turnCount: number;
            };
            getToolExecutionData: () => {
              recentlyUsedTools: string[];
              suggestedNextTools: string[];
            };
          };
          topics?: string[];
        };

        const convState = userData?.conversationState;
        let context: Record<string, unknown>;

        if (convState?.getConversationContext) {
          const convContext = convState.getConversationContext();
          const toolData = convState.getToolExecutionData();

          context = {
            conversation: {
              turn_count: convContext.turnCount,
              topics_discussed: convContext.topics,
              current_mood: convContext.currentMood,
              emotional_journey: convContext.emotionalJourney,
              engagement_level: convContext.engagementLevel,
            },
            tools: {
              recently_used: toolData.recentlyUsedTools,
              suggested_next: toolData.suggestedNextTools,
            },
            guidance: generateConversationGuidance(convContext),
          };
        } else {
          context = {
            conversation: {
              turn_count: 0,
              topics_discussed: userData?.topics || [],
              note: 'Limited conversation state available',
            },
            guidance: 'Early in conversation - focus on understanding what brought them here today',
          };
        }

        return JSON.stringify(context, null, 2);
      },
    });
  },
};

function generateConversationGuidance(convContext: {
  topics: string[];
  emotionalJourney: string[];
  currentMood: string;
  engagementLevel: string;
  turnCount: number;
}): string {
  const guidance: string[] = [];

  // Turn-based guidance
  if (convContext.turnCount < 3) {
    guidance.push('Early in conversation - establish rapport, understand their need');
  } else if (convContext.turnCount > 20) {
    guidance.push('Extended conversation - check if they need to wrap up, summarize if helpful');
  }

  // Mood-based guidance
  if (convContext.currentMood === 'anxious' || convContext.currentMood === 'stressed') {
    guidance.push('User seems stressed - prioritize calming, validation before problem-solving');
  } else if (convContext.currentMood === 'excited' || convContext.currentMood === 'happy') {
    guidance.push('Positive energy - match their enthusiasm, celebrate with them');
  }

  // Engagement guidance
  if (convContext.engagementLevel === 'low') {
    guidance.push('Engagement seems low - ask what would be most helpful, consider wrapping up');
  }

  return guidance.join('. ') || 'Conversation flowing naturally - stay present and responsive';
}

// ============================================================================
// TODAY'S SIGNIFICANCE
// ============================================================================

const getTodaySignificanceDef: ToolDefinition = {
  id: 'getTodaySignificance',
  name: "Get Today's Significance",
  description: 'Get any special significance of today for conversation openers or context',
  domain: 'awareness',
  tags: ['awareness', 'today', 'special', 'openers'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getTodaySignificance'),
      parameters: z.object({
        includeHistorical: z.boolean().optional().describe('Include historical events on this day'),
        includeQuirky: z.boolean().optional().describe('Include fun/quirky observances'),
      }),
      execute: async ({ includeHistorical = false, includeQuirky = false }) => {
        getLogger().info({ agentId: ctx.agentId }, "Getting today's significance");

        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

        const significance: Record<string, unknown> = {
          date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          day_of_week: dayOfWeek,
          holidays: [],
          observances: [],
          conversation_openers: [],
        };

        // Major holidays (US-centric, expand as needed)
        const majorHolidays: Record<string, string> = {
          '1-1': "New Year's Day - Fresh starts, resolutions",
          '2-14': "Valentine's Day - Love, relationships, self-love",
          '3-17': "St. Patrick's Day",
          '7-4': 'Independence Day',
          '10-31': 'Halloween',
          '11-11': 'Veterans Day - Gratitude for service',
          '12-25': 'Christmas',
          '12-31': "New Year's Eve - Reflection, celebration",
        };

        const key = `${month}-${day}`;
        if (majorHolidays[key]) {
          (significance.holidays as string[]).push(majorHolidays[key]);
        }

        // Generate contextual openers
        const openers: string[] = [];

        if ((significance.holidays as string[]).length > 0) {
          openers.push(
            `Today is ${(significance.holidays as string[])[0]} - a great day to discuss...`
          );
        }

        // Day-of-week openers
        const dayOpeners: Record<string, string[]> = {
          Monday: [
            'Starting a new week - what are you hoping to accomplish?',
            'Monday energy - fresh start vibes!',
          ],
          Friday: ["It's Friday! How did your week go?", 'Weekend is near - any plans?'],
          Saturday: [
            "Weekend time - hope you're getting some rest",
            'Saturday vibes - what brings you here today?',
          ],
          Sunday: ['Sunday - good day for reflection', 'Winding down the weekend?'],
        };

        if (dayOpeners[dayOfWeek]) {
          openers.push(...dayOpeners[dayOfWeek]);
        }

        significance.conversation_openers = openers;

        return JSON.stringify(significance, null, 2);
      },
    });
  },
};

// ============================================================================
// PROACTIVE AWARENESS
// ============================================================================

const getProactiveInsightsDef: ToolDefinition = {
  id: 'getProactiveInsights',
  name: 'Get Proactive Insights',
  description: 'Get proactive insights about what might be relevant to discuss based on context',
  domain: 'awareness',
  tags: ['awareness', 'proactive', 'insights', 'suggestions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getProactiveInsights'),
      parameters: z.object({
        focus: z
          .enum(['general', 'goals', 'wellbeing', 'upcoming', 'reflection'])
          .optional()
          .describe('Area to focus insights on'),
      }),
      execute: async ({ focus = 'general' }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, focus }, 'Getting proactive insights');

        const userData = toolCtx.userData as {
          services?: {
            userProfile?: {
              goals?: Array<{ name: string; status: string; deadline?: string }>;
              preferredTopics?: string[];
              recentMoods?: string[];
            };
          };
        };

        const profile = userData?.services?.userProfile;
        const insights: string[] = [];
        const suggestions: string[] = [];

        // Time-based insights
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();
        const dayOfMonth = now.getDate();

        // Morning proactivity
        if (hour >= 6 && hour <= 9) {
          suggestions.push('Morning is a good time for intention-setting or daily planning');
        }

        // End of week
        if (dayOfWeek === 5 && hour >= 14) {
          suggestions.push('Friday afternoon - might be good time for weekly reflection');
        }

        // End of month
        if (dayOfMonth >= 28) {
          suggestions.push('End of month - monthly review or goal check-in could be valuable');
        }

        // Goal-based insights
        if (focus === 'goals' || focus === 'general') {
          const activeGoals = profile?.goals?.filter((g) => g.status === 'active') || [];
          if (activeGoals.length > 0) {
            insights.push(`User has ${activeGoals.length} active goals to potentially check in on`);
            // Check for upcoming deadlines (if dates stored)
            for (const goal of activeGoals) {
              if (goal.deadline) {
                const deadline = new Date(goal.deadline);
                const daysUntil = Math.ceil(
                  (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (daysUntil <= 7 && daysUntil > 0) {
                  suggestions.push(`Goal "${goal.name}" has deadline in ${daysUntil} days`);
                }
              }
            }
          }
        }

        // Wellbeing check-in suggestions
        if (focus === 'wellbeing' || focus === 'general') {
          const recentMoods = profile?.recentMoods || [];
          if (recentMoods.includes('stressed') || recentMoods.includes('anxious')) {
            suggestions.push(
              'User has shown stress recently - gentle wellbeing check-in might help'
            );
          }
        }

        // Build response
        const response: Record<string, unknown> = {
          focus,
          timestamp: now.toISOString(),
          insights,
          suggestions,
          guidance:
            'Be proactive but not pushy. Offer, don\'t insist. "I noticed..." or "Would it be helpful to..." works better than assuming.',
        };

        return JSON.stringify(response, null, 2);
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const awarenessTools: ToolDefinition[] = [
  getCurrentContextDef,
  getUserContextDef,
  getConversationAwarenessDef,
  getTodaySignificanceDef,
  getProactiveInsightsDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'awareness',
  awarenessTools
);

export default getToolDefinitions;
