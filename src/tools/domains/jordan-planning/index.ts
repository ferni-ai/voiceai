/**
 * Jordan's Superhuman Planning Domain
 *
 * "Better Than Human" event planning and life milestone capabilities.
 * These tools provide memory and intelligence no human planner can match.
 *
 * DOMAIN: jordan-planning
 * TOOLS:
 *   EventPatternMemory: recallEventPatterns - Perfect memory across all events
 *   GuestIntelligence: getGuestInsights - Know every guest's needs forever
 *   MilestoneDetector: detectMilestones - Find celebrations humans forget
 *   EventStoryCapture: captureEventMeaning - Remember what events MEANT
 *   CelebrationBalance: checkCelebrationHealth - Track joy gaps
 *   AnticipatorySense: anticipateTransition - See life changes coming
 *   PlanningReadiness: checkReadiness - Cross-team readiness assessment
 *
 * @module tools/domains/jordan-planning
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import superhuman services
import {
  recordEventPattern,
  getEventPatterns,
  recordGuestProfile,
  getGuestProfiles,
  recordMilestoneDetection,
  getDetectedMilestones,
  recordEventMeaning,
  getEventMeanings,
  recordCelebration,
  getCelebrationBalance,
  recordTransitionSignal,
  getAnticipatedTransitions,
  checkPlanningReadiness,
} from '../../../services/superhuman/jordan-planning-services.js';

const log = createLogger({ module: 'tools:jordan-planning' });

// ============================================================================
// EVENT PATTERN MEMORY - Perfect recall across all events
// ============================================================================

const recallEventPatternsDef: ToolDefinition = {
  id: 'recallEventPatterns',
  name: 'Recall Event Patterns',
  description:
    'Perfect memory for patterns across ALL events - budget tendencies, guest dynamics, emotional patterns, vendor preferences.',
  domain: 'jordan-planning',
  tags: ['events', 'patterns', 'memory', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recallEventPatterns'),
      parameters: z.object({
        eventType: z.string().optional().describe('Type of event (wedding, birthday, vacation)'),
        patternType: z
          .enum(['budget', 'timing', 'guest_dynamics', 'emotional', 'vendor', 'all'])
          .default('all')
          .describe('Type of pattern to recall'),
        recordPattern: z
          .object({
            eventName: z.string().describe('Name of the event'),
            pattern: z.string().describe('Pattern observed (e.g., "always goes over budget on catering")'),
            lesson: z.string().optional().describe('Lesson learned from this pattern'),
          })
          .optional()
          .describe('New pattern to record'),
      }),
      execute: async ({ eventType, patternType, recordPattern }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, eventType, patternType }, 'Recalling event patterns');

        if (recordPattern) {
          await recordEventPattern(userId, {
            eventType: eventType || 'general',
            patternType,
            eventName: recordPattern.eventName,
            pattern: recordPattern.pattern,
            lesson: recordPattern.lesson,
            recordedAt: new Date().toISOString(),
          });

          return `**Pattern Recorded**\n\nEvent: ${recordPattern.eventName}\nPattern: ${recordPattern.pattern}\n${recordPattern.lesson ? `Lesson: ${recordPattern.lesson}` : ''}\n\nI'll remember this for future planning!`;
        }

        const patterns = await getEventPatterns(userId, eventType, patternType);

        if (patterns.length === 0) {
          return `No event patterns recorded yet${eventType ? ` for ${eventType}` : ''}. Tell me about past events and I'll start learning your patterns!`;
        }

        let response = `**Event Patterns I've Learned:**\n\n`;

        // Group by pattern type
        const byType: Record<string, typeof patterns> = {};
        for (const p of patterns) {
          if (!byType[p.patternType]) byType[p.patternType] = [];
          byType[p.patternType].push(p);
        }

        for (const [type, typePatterns] of Object.entries(byType)) {
          response += `**${type.toUpperCase()}:**\n`;
          for (const p of typePatterns.slice(0, 3)) {
            response += `• ${p.pattern}`;
            if (p.lesson) response += ` → ${p.lesson}`;
            response += '\n';
          }
          response += '\n';
        }

        response += `I use these patterns to help you plan better events.`;
        return response;
      },
    });
  },
};

// ============================================================================
// GUEST INTELLIGENCE - Know every guest forever
// ============================================================================

const getGuestInsightsDef: ToolDefinition = {
  id: 'getGuestInsights',
  name: 'Get Guest Insights',
  description:
    'Permanent guest profiles - dietary needs, accessibility, attendance patterns, relationship dynamics. Never forget a guest.',
  domain: 'jordan-planning',
  tags: ['events', 'guests', 'memory', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getGuestInsights'),
      parameters: z.object({
        guestName: z.string().optional().describe('Specific guest to look up'),
        updateGuest: z
          .object({
            name: z.string().describe('Guest name'),
            dietary: z.string().optional().describe('Dietary requirements (e.g., vegetarian, gluten-free)'),
            accessibility: z.string().optional().describe('Accessibility needs'),
            note: z.string().optional().describe('Additional notes about this guest'),
            avoidSeatingWith: z.array(z.string()).optional().describe('Names of people to avoid seating with'),
          })
          .optional()
          .describe('Update guest profile'),
        listAll: z.boolean().default(false).describe('List all known guests'),
      }),
      execute: async ({ guestName, updateGuest, listAll }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, guestName, listAll }, 'Getting guest insights');

        if (updateGuest) {
          await recordGuestProfile(userId, {
            name: updateGuest.name,
            dietary: updateGuest.dietary,
            accessibility: updateGuest.accessibility,
            note: updateGuest.note,
            avoidSeatingWith: updateGuest.avoidSeatingWith,
            updatedAt: new Date().toISOString(),
          });

          let response = `**Guest Profile Updated: ${updateGuest.name}**\n\n`;
          if (updateGuest.dietary) response += `🍽️ Dietary: ${updateGuest.dietary}\n`;
          if (updateGuest.accessibility) response += `♿ Accessibility: ${updateGuest.accessibility}\n`;
          if (updateGuest.note) response += `📝 Note: ${updateGuest.note}\n`;
          if (updateGuest.avoidSeatingWith?.length) {
            response += `⚠️ Seating: Avoid placing with ${updateGuest.avoidSeatingWith.join(', ')}\n`;
          }
          response += `\nI'll remember this for EVERY future event.`;
          return response;
        }

        const guests = await getGuestProfiles(userId, guestName);

        if (guests.length === 0) {
          return guestName
            ? `I don't have any information about ${guestName} yet. Tell me about their dietary needs or preferences!`
            : `No guest profiles recorded yet. Start telling me about your guests and I'll remember forever!`;
        }

        if (guestName && guests.length === 1) {
          const g = guests[0];
          let response = `**Guest Profile: ${g.name}**\n\n`;
          if (g.dietary) response += `🍽️ Dietary: ${g.dietary}\n`;
          if (g.accessibility) response += `♿ Accessibility: ${g.accessibility}\n`;
          if (g.note) response += `📝 Note: ${g.note}\n`;
          if (g.avoidSeatingWith?.length) {
            response += `⚠️ Seating conflicts: ${g.avoidSeatingWith.join(', ')}\n`;
          }
          if (g.attendanceHistory?.length) {
            response += `\n📊 Attended ${g.attendanceHistory.length} events\n`;
          }
          return response;
        }

        // List all guests
        let response = `**Known Guests (${guests.length}):**\n\n`;
        const withDietary = guests.filter((g) => g.dietary);
        const withAccessibility = guests.filter((g) => g.accessibility);
        const withConflicts = guests.filter((g) => g.avoidSeatingWith?.length);

        if (withDietary.length > 0) {
          response += `🍽️ **Dietary needs:** ${withDietary.map((g) => g.name).join(', ')}\n`;
        }
        if (withAccessibility.length > 0) {
          response += `♿ **Accessibility needs:** ${withAccessibility.map((g) => g.name).join(', ')}\n`;
        }
        if (withConflicts.length > 0) {
          response += `⚠️ **Seating conflicts:** ${withConflicts.length} guests have conflicts\n`;
        }

        response += `\nAsk me about any specific guest for details!`;
        return response;
      },
    });
  },
};

// ============================================================================
// MILESTONE DETECTOR - Find forgotten celebrations
// ============================================================================

const detectMilestonesDef: ToolDefinition = {
  id: 'detectMilestones',
  name: 'Detect Milestones',
  description:
    'Detect celebrations humans forget - work anniversaries, friendship milestones, quiet win streaks, approaching transitions.',
  domain: 'jordan-planning',
  tags: ['milestones', 'detection', 'proactive', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('detectMilestones'),
      parameters: z.object({
        recordMilestone: z
          .object({
            type: z.enum([
              'work_anniversary',
              'friendship_milestone',
              'sobriety',
              'health_streak',
              'relationship',
              'quiet_win',
              'other',
            ]).describe('Type of milestone'),
            description: z.string().describe('Description of the milestone'),
            date: z.string().optional().describe('Date of the milestone (ISO format or natural language)'),
            recurring: z.boolean().optional().describe('Whether this recurs annually'),
          })
          .optional()
          .describe('Record a new milestone to track'),
        getUpcoming: z.boolean().default(false).describe('Get upcoming milestones'),
      }),
      execute: async ({ recordMilestone, getUpcoming }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, getUpcoming }, 'Detecting milestones');

        if (recordMilestone) {
          await recordMilestoneDetection(userId, {
            type: recordMilestone.type,
            description: recordMilestone.description,
            date: recordMilestone.date || new Date().toISOString(),
            recurring: recordMilestone.recurring || false,
            recordedAt: new Date().toISOString(),
          });

          let response = `**Milestone Tracked**\n\n`;
          response += `📌 ${recordMilestone.description}\n`;
          response += `Type: ${recordMilestone.type.replace('_', ' ')}\n`;
          if (recordMilestone.recurring) response += `🔄 Recurring annually\n`;
          response += `\nI'll remind you when this approaches so you can celebrate properly!`;
          return response;
        }

        const milestones = await getDetectedMilestones(userId);

        if (milestones.length === 0) {
          return `No milestones tracked yet. Tell me about important dates, anniversaries, or streaks worth celebrating!`;
        }

        let response = `**Milestones Worth Celebrating:**\n\n`;

        // Sort by upcoming date
        const upcoming = milestones
          .filter((m) => new Date(m.date) > new Date())
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const past = milestones.filter((m) => new Date(m.date) <= new Date());

        if (upcoming.length > 0) {
          response += `**📅 Coming Up:**\n`;
          for (const m of upcoming.slice(0, 5)) {
            const daysUntil = Math.ceil(
              (new Date(m.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
            );
            response += `• ${m.description} - ${daysUntil} days\n`;
          }
          response += '\n';
        }

        if (past.length > 0) {
          response += `**🎉 Celebrated:**\n`;
          for (const m of past.slice(0, 3)) {
            response += `• ${m.description}\n`;
          }
        }

        response += `\n*I detect milestones humans forget - work anniversaries, friendship milestones, quiet win streaks.*`;
        return response;
      },
    });
  },
};

// ============================================================================
// EVENT STORY CAPTURE - Remember what events MEANT
// ============================================================================

const captureEventMeaningDef: ToolDefinition = {
  id: 'captureEventMeaning',
  name: 'Capture Event Meaning',
  description:
    'Remember what events MEANT, not just logistics - the emotional journey, meaningful speeches, lessons learned.',
  domain: 'jordan-planning',
  tags: ['events', 'meaning', 'stories', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('captureEventMeaning'),
      parameters: z.object({
        eventName: z.string().describe('Name of the event'),
        meaning: z.string().optional().describe('What this event meant'),
        memorableMoment: z.string().optional().describe('A moment that stood out'),
        lessonLearned: z.string().optional().describe('What you learned'),
        recallEvent: z.boolean().default(false).describe('Recall meaning of past event'),
      }),
      execute: async ({ eventName, meaning, memorableMoment, lessonLearned, recallEvent }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, eventName, recallEvent }, 'Capturing event meaning');

        if (recallEvent) {
          const meanings = await getEventMeanings(userId, eventName);

          if (meanings.length === 0) {
            return `I don't have any deeper meaning captured for "${eventName}" yet. What made it special?`;
          }

          let response = `**What "${eventName}" Meant:**\n\n`;
          for (const m of meanings) {
            if (m.meaning) response += `💭 **Meaning:** ${m.meaning}\n\n`;
            if (m.memorableMoment) response += `✨ **Moment:** ${m.memorableMoment}\n\n`;
            if (m.lessonLearned) response += `📚 **Lesson:** ${m.lessonLearned}\n\n`;
          }
          return response;
        }

        if (!meaning && !memorableMoment && !lessonLearned) {
          return 'Tell me what this event meant to you - the meaning, a memorable moment, or a lesson learned.';
        }

        await recordEventMeaning(userId, {
          eventName,
          meaning,
          memorableMoment,
          lessonLearned,
          recordedAt: new Date().toISOString(),
        });

        let response = `**Event Meaning Captured: ${eventName}**\n\n`;
        if (meaning) response += `💭 Meaning: ${meaning}\n`;
        if (memorableMoment) response += `✨ Moment: ${memorableMoment}\n`;
        if (lessonLearned) response += `📚 Lesson: ${lessonLearned}\n`;
        response += `\nOn anniversaries, I'll remind you why this day mattered.`;
        return response;
      },
    });
  },
};

// ============================================================================
// CELEBRATION BALANCE - Track joy gaps
// ============================================================================

const checkCelebrationHealthDef: ToolDefinition = {
  id: 'checkCelebrationHealth',
  name: 'Check Celebration Health',
  description:
    'Track objectively: Are they celebrating enough? Too much? Always for others? Notice joy gaps and celebration fatigue.',
  domain: 'jordan-planning',
  tags: ['celebration', 'balance', 'wellness', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('checkCelebrationHealth'),
      parameters: z.object({
        recordCelebration: z
          .object({
            what: z.string().describe('What was celebrated'),
            forWhom: z.enum(['self', 'other', 'both']).describe('Who the celebration was for'),
            size: z.enum(['micro', 'small', 'medium', 'large']).describe('Scale of the celebration'),
          })
          .optional()
          .describe('Record a celebration'),
        getBalance: z.boolean().default(false).describe('Get celebration balance report'),
      }),
      execute: async ({ recordCelebration: celebrationData, getBalance }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, getBalance }, 'Checking celebration health');

        if (celebrationData) {
          await recordCelebration(userId, {
            what: celebrationData.what,
            forWhom: celebrationData.forWhom,
            size: celebrationData.size,
            recordedAt: new Date().toISOString(),
          });

          return `**Celebration Recorded**\n\n🎉 ${celebrationData.what}\nFor: ${celebrationData.forWhom}\nSize: ${celebrationData.size}\n\nI'm tracking your celebration balance!`;
        }

        const balance = await getCelebrationBalance(userId);

        let response = `**Your Celebration Health Report:**\n\n`;

        response += `📊 **Last 90 Days:**\n`;
        response += `• Total celebrations: ${balance.total}\n`;
        response += `• For yourself: ${balance.forSelf} (${Math.round((balance.forSelf / balance.total) * 100) || 0}%)\n`;
        response += `• For others: ${balance.forOthers} (${Math.round((balance.forOthers / balance.total) * 100) || 0}%)\n\n`;

        response += `📏 **By Size:**\n`;
        response += `• Micro (daily wins): ${balance.bySize.micro}\n`;
        response += `• Small: ${balance.bySize.small}\n`;
        response += `• Medium: ${balance.bySize.medium}\n`;
        response += `• Large: ${balance.bySize.large}\n\n`;

        // Insights
        const insights: string[] = [];
        if (balance.forSelf < balance.forOthers * 0.3) {
          insights.push('⚠️ You celebrate others much more than yourself. What about YOUR wins?');
        }
        if (balance.bySize.micro < 5) {
          insights.push('💡 Try celebrating more micro-wins. Daily acknowledgment matters.');
        }
        if (balance.total < 5) {
          insights.push('📉 Low celebration count. Are you missing opportunities for joy?');
        }
        if (balance.bySize.large > balance.bySize.small * 2) {
          insights.push('🎈 Lots of big celebrations, few small ones. Balance might help.');
        }

        if (insights.length > 0) {
          response += `**Insights:**\n${insights.join('\n')}\n\n`;
        } else {
          response += `✨ Your celebration balance looks healthy!\n\n`;
        }

        response += `*Joy needs tending. I help you notice the gaps.*`;
        return response;
      },
    });
  },
};

// ============================================================================
// ANTICIPATORY SENSE - See life changes coming
// ============================================================================

const anticipateTransitionDef: ToolDefinition = {
  id: 'anticipateTransition',
  name: 'Anticipate Transition',
  description:
    'See life transitions coming from conversation patterns - empty nest, retirement, career change. Suggest planning before they ask.',
  domain: 'jordan-planning',
  tags: ['transitions', 'anticipation', 'proactive', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('anticipateTransition'),
      parameters: z.object({
        recordSignal: z
          .object({
            type: z.enum([
              'empty_nest',
              'retirement',
              'career_change',
              'relationship_change',
              'health_transition',
              'location_change',
              'other',
            ]).describe('Type of life transition'),
            signal: z.string().describe('The signal observed (e.g., "mentioned thinking about retiring")'),
            strength: z.enum(['weak', 'moderate', 'strong']).describe('Strength of this signal'),
          })
          .optional()
          .describe('Record a transition signal'),
        getAnticipated: z.boolean().default(false).describe('Get anticipated transitions'),
      }),
      execute: async ({ recordSignal, getAnticipated }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, getAnticipated }, 'Anticipating transitions');

        if (recordSignal) {
          await recordTransitionSignal(userId, {
            type: recordSignal.type,
            signal: recordSignal.signal,
            strength: recordSignal.strength,
            recordedAt: new Date().toISOString(),
          });

          return `**Transition Signal Noted**\n\nType: ${recordSignal.type.replace('_', ' ')}\nSignal: ${recordSignal.signal}\nStrength: ${recordSignal.strength}\n\nI'm watching for patterns. When it's time to plan, I'll be ready.`;
        }

        const transitions = await getAnticipatedTransitions(userId);

        if (transitions.length === 0) {
          return `No major life transitions anticipated yet. I watch for signals in your conversations - talk about the future and I'll start noticing patterns.`;
        }

        let response = `**Transitions I'm Sensing:**\n\n`;

        for (const t of transitions) {
          const emoji =
            t.strength === 'strong' ? '🔴' : t.strength === 'moderate' ? '🟡' : '🟢';
          response += `${emoji} **${t.type.replace('_', ' ')}** (${t.strength})\n`;
          response += `   Signals: ${t.signals.slice(0, 2).join(', ')}\n`;
          response += `   Last signal: ${new Date(t.lastSignalAt).toLocaleDateString()}\n\n`;
        }

        response += `*I see transitions coming before you're ready to talk about them. Let me know when you want to plan.*`;
        return response;
      },
    });
  },
};

// ============================================================================
// PLANNING READINESS - Cross-team assessment
// ============================================================================

const checkPlanningReadinessDef: ToolDefinition = {
  id: 'checkPlanningReadiness',
  name: 'Check Planning Readiness',
  description:
    'Cross-team readiness check before major planning - financial health, calendar capacity, energy levels, emotional readiness.',
  domain: 'jordan-planning',
  tags: ['planning', 'readiness', 'cross-team', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('checkPlanningReadiness'),
      parameters: z.object({
        eventType: z.string().describe('What are you planning? (wedding, vacation, big purchase)'),
        budget: z.number().optional().describe('Estimated budget'),
        timeframe: z.string().optional().describe('When is this happening?'),
      }),
      execute: async ({ eventType, budget, timeframe }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, eventType }, 'Checking planning readiness');

        const readiness = await checkPlanningReadiness(userId, eventType);

        let response = `**Planning Readiness: ${eventType}**\n\n`;

        // Traffic light assessment
        const overallEmoji =
          readiness.overall === 'green' ? '🟢' : readiness.overall === 'yellow' ? '🟡' : '🔴';
        response += `${overallEmoji} **Overall: ${readiness.overall.toUpperCase()}**\n\n`;

        response += `**Area Assessments:**\n`;
        const areas = [
          { name: 'Financial', status: readiness.financial, emoji: '💰' },
          { name: 'Calendar', status: readiness.calendar, emoji: '📅' },
          { name: 'Energy', status: readiness.energy, emoji: '⚡' },
          { name: 'Emotional', status: readiness.emotional, emoji: '💭' },
        ];

        for (const area of areas) {
          const statusEmoji =
            area.status === 'green' ? '✅' : area.status === 'yellow' ? '⚠️' : '❌';
          response += `${area.emoji} ${area.name}: ${statusEmoji} ${area.status}\n`;
        }

        if (readiness.concerns.length > 0) {
          response += `\n**Concerns:**\n`;
          for (const concern of readiness.concerns) {
            response += `• ${concern}\n`;
          }
        }

        if (readiness.suggestions.length > 0) {
          response += `\n**Suggestions:**\n`;
          for (const suggestion of readiness.suggestions) {
            response += `• ${suggestion}\n`;
          }
        }

        if (budget) {
          response += `\n💵 Budget: $${budget.toLocaleString()}`;
        }
        if (timeframe) {
          response += `\n⏰ Timeframe: ${timeframe}`;
        }

        response += `\n\n*I check readiness across your whole life - not just logistics.*`;
        return response;
      },
    });
  },
};

// ============================================================================
// BACKGROUND RESERVATION TOOLS (Jordan's "While You Were Away" Powers)
// ============================================================================

const backgroundReservationDef: ToolDefinition = {
  id: 'backgroundReservation',
  name: 'Background Reservation',
  description:
    'Make reservations in the background that continue even when the user disconnects. Perfect for: "Book dinner at Nobu for Saturday", "Reserve a table while I\'m away", "Get us a hotel room". Results are delivered when the user reconnects.',
  domain: 'jordan-planning',
  tags: ['background', 'async', 'reservations', 'while-you-were-away', 'jordan-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('backgroundReservation'),
      parameters: z.object({
        venueName: z.string().describe('Name of restaurant, hotel, or venue'),
        reservationType: z
          .enum(['restaurant', 'hotel', 'venue', 'activity', 'service', 'other'])
          .describe('Type of reservation'),
        dateTime: z.string().describe('When (e.g., "Saturday at 7pm", "March 15")'),
        partySize: z.number().optional().describe('Number of people'),
        specialRequests: z.string().optional().describe('Any special requests or notes'),
        alternateOptions: z.array(z.string()).optional().describe('Backup venues if first choice unavailable'),
        urgency: z
          .enum(['when_ready', 'asap', 'next_session'])
          .optional()
          .describe('When to deliver results'),
      }),
      execute: async ({
        venueName,
        reservationType,
        dateTime,
        partySize = 2,
        specialRequests,
        alternateOptions,
        urgency = 'when_ready',
      }) => {
        try {
          const { queueReservationTask } = await import(
            '../../../services/background-agents/index.js'
          );

          const userId = ctx.userId || 'anonymous';
          log.info({ userId, venueName, reservationType }, 'Queueing background reservation');

          const taskId = await queueReservationTask({
            userId,
            venue: venueName,
            type: reservationType,
            dateTime,
            partySize,
            specialRequests,
            initiatedBy: 'jordan',
            sessionId: ctx.sessionId,
            context: alternateOptions ? `Alternates: ${alternateOptions.join(', ')}` : undefined,
          });

          return `**Background Reservation Started** 📅

I'm working on this! Making a reservation at ${venueName}.

**Details:**
• **Type:** ${reservationType}
• **When:** ${dateTime}
• **Party size:** ${partySize} people
${specialRequests ? `• **Special requests:** ${specialRequests}` : ''}
${alternateOptions && alternateOptions.length > 0 ? `• **Backups:** ${alternateOptions.join(', ')}` : ''}
• **Task ID:** ${taskId.slice(0, 8)}...

I'll keep working on this even if you disconnect. When you come back, I'll have the confirmation details!`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to queue background reservation');
          return `I couldn't start the background reservation. Let me help you with this in real-time instead...`;
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const jordanPlanningTools: ToolDefinition[] = [
  recallEventPatternsDef,
  getGuestInsightsDef,
  detectMilestonesDef,
  captureEventMeaningDef,
  checkCelebrationHealthDef,
  anticipateTransitionDef,
  checkPlanningReadinessDef,
  backgroundReservationDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'jordan-planning',
  jordanPlanningTools
);

export default getToolDefinitions;
