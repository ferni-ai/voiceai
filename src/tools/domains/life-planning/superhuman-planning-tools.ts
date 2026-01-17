/**
 * Superhuman Planning Tools for Jordan
 *
 * These tools expose Jordan's "Better Than Human" planning capabilities:
 * - Event Pattern Memory (budget tendencies, guest dynamics, emotional patterns)
 * - Guest Intelligence (profiles, relationships, dietary needs, attendance)
 * - Proactive Milestone Detection (anniversaries, life transitions, quiet wins)
 * - Event Story Capture (meaning, emotional journey, lessons)
 * - Anticipatory Planning (detecting upcoming life transitions)
 * - Celebration Balance (density, fatigue, needs)
 * - Planning Coordination (financial readiness, calendar capacity, energy)
 * - Seasonal Intelligence (cultural dates, optimal timing)
 * - Post-Event Learning (follow-ups, wisdom accumulation)
 *
 * @module tools/domains/life-planning/superhuman-planning-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import superhuman services
import { eventPatternMemory } from '../../../services/superhuman/event-pattern-memory.js';
import { guestIntelligence } from '../../../services/superhuman/guest-intelligence.js';
import { proactiveMilestoneDetector } from '../../../services/superhuman/proactive-milestone-detector.js';
import { eventStoryCapture } from '../../../services/superhuman/event-story-capture.js';
import { anticipatoryPlanning } from '../../../services/superhuman/anticipatory-planning.js';
import { celebrationBalance } from '../../../services/superhuman/celebration-balance.js';
import { planningCoordination } from '../../../services/superhuman/planning-coordination.js';
import { seasonalPlanningIntelligence } from '../../../services/superhuman/seasonal-planning-intelligence.js';
import { postEventLearning } from '../../../services/superhuman/post-event-learning.js';

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSuperhumanPlanningTools() {
  return {
    // ========================================================================
    // EVENT PATTERN MEMORY
    // ========================================================================

    /**
     * Get insights from past event patterns
     */
    getEventPatternInsights: llm.tool({
      description: getToolDescription('getEventPatternInsights') ||
        'Get planning insights from patterns across all past events - budget tendencies, guest dynamics, emotional patterns, vendor preferences. Use when starting to plan any event.',
      parameters: z.object({
        eventType: z
          .string()
          .optional()
          .describe('Type of event being planned (wedding, birthday, etc.)'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ eventType, userId }) => {
        const insights = await eventPatternMemory.getEventPatternInsights(userId, eventType);

        const allInsights = [
          ...insights.budgetWarnings,
          ...insights.guestRecommendations,
          ...insights.emotionalPrepTips,
          ...insights.vendorRecommendations,
        ];

        if (allInsights.length === 0) {
          return "I don't have event history for you yet. After your first event, I'll remember everything to help plan future ones better!";
        }

        let response = `📊 **Insights from Your Past Events**\n\n`;

        if (insights.budgetWarnings.length > 0) {
          response += `**💰 Budget Patterns:**\n`;
          insights.budgetWarnings.forEach((w) => (response += `• ${w}\n`));
          response += '\n';
        }

        if (insights.guestRecommendations.length > 0) {
          response += `**👥 Guest Dynamics:**\n`;
          insights.guestRecommendations.forEach((r) => (response += `• ${r}\n`));
          response += '\n';
        }

        if (insights.emotionalPrepTips.length > 0) {
          response += `**💭 Emotional Prep:**\n`;
          insights.emotionalPrepTips.forEach((t) => (response += `• ${t}\n`));
          response += '\n';
        }

        if (insights.vendorRecommendations.length > 0) {
          response += `**🏪 Vendor Memory:**\n`;
          insights.vendorRecommendations.forEach((r) => (response += `• ${r}\n`));
        }

        return response;
      },
    }),

    /**
     * Record a guest conflict for future seating recommendations
     */
    recordGuestConflict: llm.tool({
      description:
        'Remember that two guests have a conflict and should not be seated together at future events.',
      parameters: z.object({
        person1: z.string().describe('First person in the conflict'),
        person2: z.string().describe('Second person in the conflict'),
        reason: z.string().describe('Brief reason for the conflict'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ person1, person2, reason, userId }) => {
        await eventPatternMemory.recordGuestConflict(userId, person1, person2, reason);
        return `Got it - I'll remember to keep ${person1} and ${person2} apart at future events. (${reason})`;
      },
    }),

    // ========================================================================
    // GUEST INTELLIGENCE
    // ========================================================================

    /**
     * Get or update a guest profile
     */
    updateGuestProfile: llm.tool({
      description:
        'Update information about a guest - dietary restrictions, accessibility needs, gift preferences, social style. I remember this forever for all future events.',
      parameters: z.object({
        guestName: z.string().describe('Name of the guest'),
        relationship: z.string().optional().describe('Relationship to user'),
        dietaryRestrictions: z.array(z.string()).optional().describe('Dietary restrictions'),
        allergies: z.array(z.string()).optional().describe('Food allergies'),
        accessibilityNeeds: z.array(z.string()).optional().describe('Accessibility requirements'),
        socialStyle: z
          .enum(['introvert', 'extrovert', 'ambivert', 'unknown'])
          .optional()
          .describe('Social style'),
        strengths: z.array(z.string()).optional().describe('What they bring to events'),
        triggers: z.array(z.string()).optional().describe('Topics to avoid'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({
        guestName,
        relationship,
        dietaryRestrictions,
        allergies,
        accessibilityNeeds,
        socialStyle,
        strengths,
        triggers,
        userId,
      }) => {
        await guestIntelligence.upsertGuestProfile(userId, guestName, {
          relationship,
          dietary: {
            restrictions: dietaryRestrictions || [],
            allergies: allergies || [],
            preferences: [],
          },
          accessibility: {
            mobilityNeeds: accessibilityNeeds || [],
            sensoryNeeds: [],
            otherNeeds: [],
          },
          social: {
            seatingPreferences: [],
            socialStyle: socialStyle || 'unknown',
            conversations: [],
            triggers: triggers || [],
            strengths: strengths || [],
          },
        });

        let response = `✅ Updated profile for ${guestName}.\n`;
        if (dietaryRestrictions?.length) response += `🍽️ Dietary: ${dietaryRestrictions.join(', ')}\n`;
        if (allergies?.length) response += `⚠️ Allergies: ${allergies.join(', ')}\n`;
        if (accessibilityNeeds?.length) response += `♿ Accessibility: ${accessibilityNeeds.join(', ')}\n`;
        response += `\nI'll remember this for all future events!`;

        return response;
      },
    }),

    /**
     * Get dietary summary for a guest list
     */
    getGuestListDietary: llm.tool({
      description:
        'Get a summary of dietary requirements for a list of guests - vegetarians, vegans, allergies, etc.',
      parameters: z.object({
        guestNames: z.array(z.string()).describe('List of guest names'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ guestNames, userId }) => {
        const dietary = await guestIntelligence.getGuestListDietary(userId, guestNames);

        let response = `🍽️ **Dietary Summary for ${guestNames.length} Guests**\n\n`;

        if (dietary.vegetarian.length > 0) {
          response += `🥗 Vegetarian (${dietary.vegetarian.length}): ${dietary.vegetarian.join(', ')}\n`;
        }
        if (dietary.vegan.length > 0) {
          response += `🌱 Vegan (${dietary.vegan.length}): ${dietary.vegan.join(', ')}\n`;
        }
        if (dietary.glutenFree.length > 0) {
          response += `🌾 Gluten-Free (${dietary.glutenFree.length}): ${dietary.glutenFree.join(', ')}\n`;
        }
        if (dietary.allergies.length > 0) {
          response += `\n⚠️ **Allergies:**\n`;
          for (const a of dietary.allergies) {
            response += `• ${a.guest}: ${a.allergies.join(', ')}\n`;
          }
        }

        if (
          dietary.vegetarian.length === 0 &&
          dietary.vegan.length === 0 &&
          dietary.glutenFree.length === 0 &&
          dietary.allergies.length === 0
        ) {
          response += `No special dietary requirements on file. Want me to check with anyone?`;
        }

        return response;
      },
    }),

    /**
     * Predict attendance for a guest list
     */
    predictAttendance: llm.tool({
      description:
        'Predict attendance based on past patterns - who usually shows up, who tends to decline, who cancels last-minute.',
      parameters: z.object({
        guestNames: z.array(z.string()).describe('List of invited guests'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ guestNames, userId }) => {
        const prediction = await guestIntelligence.predictAttendance(userId, guestNames);

        let response = `📊 **Attendance Prediction for ${guestNames.length} Guests**\n\n`;
        response += `**Expected:** ${prediction.expectedCount.expected} guests\n`;
        response += `**Range:** ${prediction.expectedCount.min} - ${prediction.expectedCount.max}\n\n`;

        if (prediction.unlikely.length > 0) {
          response += `⚠️ **May not attend:**\n`;
          for (const u of prediction.unlikely.slice(0, 5)) {
            response += `• ${u.guest}: ${u.reason}\n`;
          }
          response += '\n';
        }

        if (prediction.likely.length > 0) {
          response += `✅ **Reliable attendees:**\n`;
          for (const l of prediction.likely.slice(0, 5)) {
            response += `• ${l.guest} (${Math.round(l.rate * 100)}% attendance rate)\n`;
          }
        }

        if (prediction.unknown.length > 0) {
          response += `\n❓ **No history:** ${prediction.unknown.slice(0, 5).join(', ')}`;
        }

        return response;
      },
    }),

    // ========================================================================
    // PROACTIVE MILESTONE DETECTION
    // ========================================================================

    /**
     * Track an important date for milestone detection
     */
    trackImportantDate: llm.tool({
      description:
        'Track an important date so I can proactively remind you of anniversaries and milestones.',
      parameters: z.object({
        label: z.string().describe('What this date represents (e.g., "Wedding anniversary")'),
        date: z.string().describe('The date (e.g., "2020-06-15")'),
        type: z
          .enum([
            'anniversary',
            'career',
            'friendship',
            'health',
            'financial',
            'habit',
            'life_stage',
            'second_chance',
            'quiet_win',
            'custom',
          ])
          .describe('Type of milestone'),
        associatedWith: z.string().optional().describe('Person or entity this is about'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ label, date, type, associatedWith, userId }) => {
        await proactiveMilestoneDetector.trackDate(userId, label, date, type, {
          associatedWith,
          recurring: true,
        });

        const dateObj = new Date(date);
        const formatted = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        return `📅 Tracking "${label}" (${formatted}). I'll proactively remind you of significant anniversaries!`;
      },
    }),

    /**
     * Track a quiet win streak
     */
    trackQuietWin: llm.tool({
      description:
        'Track a quiet win streak like days sober, days exercising, days meditating. I celebrate milestone days with you.',
      parameters: z.object({
        label: z.string().describe('What you\'re tracking (e.g., "Days sober", "Exercise streak")'),
        startDate: z.string().describe('When the streak started'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ label, startDate, userId }) => {
        await proactiveMilestoneDetector.trackQuietWin(userId, label, startDate);

        const daysSince = Math.floor(
          (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        return `🌟 Tracking your "${label}" streak - currently at **${daysSince} days**! I'll celebrate milestone days (7, 14, 30, 60, 90, 100, 365...) with you.`;
      },
    }),

    /**
     * Get upcoming milestones worth celebrating
     */
    getUpcomingMilestones: llm.tool({
      description:
        'See what milestones are coming up that are worth celebrating - anniversaries, streaks, life events.',
      parameters: z.object({
        daysAhead: z.number().optional().default(60).describe('How many days ahead to look'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ daysAhead, userId }) => {
        const milestones = await proactiveMilestoneDetector.detectUpcomingMilestones(userId, daysAhead);

        if (milestones.length === 0) {
          return `No tracked milestones in the next ${daysAhead} days. Want to add some dates to track?`;
        }

        let response = `🎉 **Upcoming Milestones**\n\n`;

        for (const m of milestones.slice(0, 10)) {
          const timing =
            m.daysAway === 0 ? '**TODAY!**' : m.daysAway > 0 ? `in ${m.daysAway} days` : `${Math.abs(m.daysAway)} days ago`;

          const anniversary = m.anniversaryNumber ? ` (${m.anniversaryNumber} years!)` : '';
          response += `• **${m.label}**${anniversary} - ${timing}\n`;
          response += `  💡 ${m.celebrationSuggestion}\n\n`;
        }

        return response;
      },
    }),

    // ========================================================================
    // CELEBRATION BALANCE
    // ========================================================================

    /**
     * Record a celebration
     */
    recordCelebration: llm.tool({
      description:
        'Record a celebration to track your celebration balance - are you celebrating enough? Too much?',
      parameters: z.object({
        description: z.string().describe('What was celebrated'),
        type: z
          .enum([
            'personal_achievement',
            'personal_milestone',
            'for_others',
            'community',
            'holiday',
            'spontaneous',
            'quiet',
            'recovery',
          ])
          .describe('Type of celebration'),
        size: z.enum(['micro', 'small', 'medium', 'large', 'major']).describe('Size of celebration'),
        honoree: z.enum(['self', 'others', 'both']).describe('Who was being celebrated'),
        joyReceived: z.number().min(1).max(10).optional().describe('How much joy did it bring? (1-10)'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ description, type, size, honoree, joyReceived, userId }) => {
        await celebrationBalance.recordCelebration(userId, description, type, size, honoree, {
          joyReceived,
        });

        const balance = await celebrationBalance.getCelebrationBalance(userId);

        let response = `🎉 Recorded: "${description}"\n\n`;
        response += `**Your Celebration Balance:**\n`;
        response += `• ${balance.recentCelebrations} celebrations in last 30 days\n`;
        response += `• ${balance.avgCelebrationsPerMonth.toFixed(1)} avg per month\n`;

        if (balance.recommendations.length > 0) {
          response += `\n💡 ${balance.recommendations[0]}`;
        }

        return response;
      },
    }),

    /**
     * Check celebration balance
     */
    checkCelebrationBalance: llm.tool({
      description:
        'Check your celebration balance - are you celebrating enough? Focusing too much on others?',
      parameters: z.object({
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ userId }) => {
        const balance = await celebrationBalance.getCelebrationBalance(userId);
        const suggestions = await celebrationBalance.getCelebrationSuggestions(userId);

        const statusEmoji =
          balance.state === 'balanced'
            ? '✅'
            : balance.state === 'celebration_drought'
              ? '🏜️'
              : balance.state === 'celebration_fatigue'
                ? '😴'
                : '⚠️';

        let response = `${statusEmoji} **Celebration Balance Report**\n\n`;
        response += `**Status:** ${balance.state.replace(/_/g, ' ')}\n`;
        response += `**Days since last celebration:** ${balance.daysSinceLastCelebration}\n`;
        response += `**Recent celebrations:** ${balance.recentCelebrations} (last 30 days)\n`;
        response += `**Self vs Others ratio:** ${Math.round(balance.selfVsOthersRatio * 100)}% for self\n\n`;

        if (suggestions.needsJoy) {
          response += `💡 **You could use more joy!**\n`;
        }
        if (suggestions.needsRest) {
          response += `💡 **You might need some celebration rest.**\n`;
        }

        if (suggestions.suggestions.length > 0) {
          response += `\n**Suggestions:**\n`;
          for (const s of suggestions.suggestions.slice(0, 3)) {
            response += `• ${s}\n`;
          }
        }

        return response;
      },
    }),

    // ========================================================================
    // PLANNING COORDINATION
    // ========================================================================

    /**
     * Check planning readiness across all life domains
     */
    checkPlanningReadiness: llm.tool({
      description:
        'Check if you\'re ready to plan an event - finances, calendar capacity, energy levels. Gives a traffic light assessment.',
      parameters: z.object({
        eventType: z.string().describe('Type of event'),
        budget: z.number().describe('Estimated budget'),
        eventDate: z.string().optional().describe('Target event date'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ eventType, budget, eventDate, userId }) => {
        const assessment = await planningCoordination.checkPlanningReadiness(
          userId,
          eventType,
          budget,
          eventDate
        );

        const statusEmoji = assessment.status === 'green' ? '🟢' : assessment.status === 'yellow' ? '🟡' : '🔴';

        let response = `${statusEmoji} **Planning Readiness: ${assessment.status.toUpperCase()}**\n`;
        response += `Overall Score: ${assessment.overallScore}/100\n\n`;

        response += `**${assessment.summary}**\n\n`;

        if (assessment.actionItems.length > 0) {
          response += `**Before proceeding:**\n`;
          for (const item of assessment.actionItems) {
            response += `• ${item}\n`;
          }
          response += '\n';
        }

        response += `**Recommended start time:** ${assessment.recommendedStartTime}\n\n`;

        response += `**Domain Breakdown:**\n`;
        response += `• 💰 Financial: ${assessment.financial.canAfford ? 'Ready' : 'Needs attention'} (${assessment.financial.budgetHealth}/100)\n`;
        response += `• 📅 Calendar: ${assessment.calendar.calendarDensity} (${assessment.calendar.capacityScore}/100)\n`;
        response += `• ⚡ Energy: ${assessment.energy.burnoutRisk} risk (${assessment.energy.currentEnergy}/100)\n`;

        return response;
      },
    }),

    // ========================================================================
    // SEASONAL INTELLIGENCE
    // ========================================================================

    /**
     * Get optimal timing for an event
     */
    suggestOptimalTiming: llm.tool({
      description:
        'Get suggestions for the best time to hold an event - considers seasonal patterns, cultural dates, and your personal rhythms.',
      parameters: z.object({
        eventType: z.string().describe('Type of event'),
        preferredMonths: z.array(z.number()).optional().describe('Preferred months (1-12)'),
        avoidMonths: z.array(z.number()).optional().describe('Months to avoid (1-12)'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ eventType, preferredMonths, avoidMonths, userId }) => {
        const recommendations = await seasonalPlanningIntelligence.suggestOptimalTiming(
          userId,
          eventType,
          preferredMonths,
          avoidMonths
        );

        let response = `📅 **Best Times for ${eventType}**\n\n`;

        const top5 = recommendations.slice(0, 5);
        for (const rec of top5) {
          const month = new Date(rec.dateRange.start).toLocaleString('en-US', { month: 'long', year: 'numeric' });
          const scoreBar = '█'.repeat(Math.round(rec.score / 10)) + '░'.repeat(10 - Math.round(rec.score / 10));

          response += `**${month}** ${scoreBar} ${rec.score}/100\n`;

          if (rec.reasons.length > 0) {
            response += `  ✓ ${rec.reasons[0]}\n`;
          }
          if (rec.warnings.length > 0) {
            response += `  ⚠️ ${rec.warnings[0]}\n`;
          }
          if (rec.culturalNotes.length > 0) {
            response += `  🌍 ${rec.culturalNotes[0]}\n`;
          }
          response += '\n';
        }

        return response;
      },
    }),

    /**
     * Check a specific date for conflicts
     */
    checkDateConflicts: llm.tool({
      description: 'Check if a specific date has any cultural, seasonal, or personal conflicts.',
      parameters: z.object({
        date: z.string().describe('Date to check (YYYY-MM-DD)'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ date, userId }) => {
        const conflicts = await seasonalPlanningIntelligence.checkDateConflicts(userId, date);

        const statusEmoji = conflicts.recommendation === 'clear' ? '✅' : conflicts.recommendation === 'caution' ? '🟡' : '🔴';

        let response = `${statusEmoji} **Date Check: ${date}**\n\n`;
        response += `**Recommendation:** ${conflicts.recommendation}\n\n`;

        if (conflicts.culturalConflicts.length > 0) {
          response += `**Cultural Considerations:**\n`;
          for (const c of conflicts.culturalConflicts) {
            response += `• ${c.name}: ${c.notes}\n`;
          }
          response += '\n';
        }

        if (conflicts.seasonalConsiderations.length > 0) {
          response += `**Seasonal Factors:**\n`;
          for (const s of conflicts.seasonalConsiderations) {
            response += `• ${s.name}: ${s.notes}\n`;
          }
          response += '\n';
        }

        if (conflicts.personalConflicts.length > 0) {
          response += `**Personal Considerations:**\n`;
          for (const p of conflicts.personalConflicts) {
            response += `• ${p}\n`;
          }
        }

        if (
          conflicts.culturalConflicts.length === 0 &&
          conflicts.seasonalConsiderations.length === 0 &&
          conflicts.personalConflicts.length === 0
        ) {
          response += `No conflicts found! This date looks clear.`;
        }

        return response;
      },
    }),

    // ========================================================================
    // POST-EVENT LEARNING
    // ========================================================================

    /**
     * Get learnings from past similar events
     */
    getEventWisdom: llm.tool({
      description:
        'Get wisdom and learnings from past events of the same type - what worked, what to avoid.',
      parameters: z.object({
        eventType: z.string().describe('Type of event being planned'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ eventType, userId }) => {
        const summary = await postEventLearning.getLearningSummary(userId, eventType);
        const learnings = await postEventLearning.getApplicableLearnings(userId, eventType);

        if (summary.totalEventsOfType === 0) {
          return `I don't have learnings from past ${eventType} events yet. After this one, I'll capture what worked and what to do differently!`;
        }

        let response = `📚 **Wisdom from ${summary.totalEventsOfType} Past ${eventType} Events**\n\n`;
        response += `**Average satisfaction:** ${summary.avgSatisfaction}/10\n`;
        response += `**Budget pattern:** ${summary.budgetTrends}\n\n`;

        if (summary.topLearnings.length > 0) {
          response += `**✅ What works:**\n`;
          for (const l of summary.topLearnings) {
            response += `• ${l}\n`;
          }
          response += '\n';
        }

        if (summary.commonMistakes.length > 0) {
          response += `**⚠️ Watch out for:**\n`;
          for (const m of summary.commonMistakes) {
            response += `• ${m}\n`;
          }
        }

        return response;
      },
    }),

    /**
     * Check for due follow-ups
     */
    checkEventFollowUps: llm.tool({
      description: 'Check if any post-event follow-ups are due - I follow up at the perfect times to capture learnings.',
      parameters: z.object({
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ userId }) => {
        const dueFollowUps = await postEventLearning.getDueFollowUps(userId);

        if (dueFollowUps.length === 0) {
          return `No event follow-ups due right now. I'll prompt you at the right times after events!`;
        }

        let response = `📝 **Event Follow-Ups Due**\n\n`;

        for (const followUp of dueFollowUps) {
          response += `**${followUp.eventName}** - ${followUp.stage} check-in\n`;
          response += `Questions to explore:\n`;
          for (const q of followUp.questions) {
            response += `• ${q}\n`;
          }
          response += '\n';
        }

        return response;
      },
    }),

    // ========================================================================
    // EVENT STORY CAPTURE
    // ========================================================================

    /**
     * Start capturing an event's story
     */
    startEventStory: llm.tool({
      description:
        'Start capturing the story of an event - not just logistics, but what it MEANT. I remember the emotional journey forever.',
      parameters: z.object({
        eventName: z.string().describe('Name of the event'),
        eventType: z.string().describe('Type of event'),
        eventDate: z.string().describe('Date of the event'),
        whyThisMattered: z.string().describe('Why this event matters/mattered'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ eventName, eventType, eventDate, whyThisMattered, userId }) => {
        const story = await eventStoryCapture.startStoryCapture(userId, eventName, eventType, eventDate);

        await eventStoryCapture.updateEventStory(userId, story.id, {
          meaning: { whyThisMattered, honorees: [], whatWasCelebrated: '' },
        });

        let response = `📖 **Started Story: "${eventName}"**\n\n`;
        response += `**Why it matters:** ${whyThisMattered}\n\n`;
        response += `I'll remember this forever. As the event unfolds (or looking back), share:\n`;
        response += `• Touching moments\n`;
        response += `• Unexpected joys\n`;
        response += `• Meaningful speeches\n`;
        response += `• Connections made\n\n`;
        response += `On future anniversaries, I'll remind you why this day mattered.`;

        return response;
      },
    }),

    /**
     * Recall what an event meant
     */
    recallEventMeaning: llm.tool({
      description: 'Remember what a past event meant - the emotional significance, key moments, and lessons.',
      parameters: z.object({
        eventName: z.string().describe('Name of the event to recall'),
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ eventName, userId }) => {
        const recall = await eventStoryCapture.recallEventMeaning(userId, eventName);

        if (!recall.found) {
          return `I don't have a story captured for "${eventName}". Would you like to tell me about it?`;
        }

        let response = `📖 **Remembering: "${eventName}"**\n\n`;

        if (recall.summary) {
          response += `**What it meant:** ${recall.summary}\n\n`;
        }

        if (recall.keyMoments && recall.keyMoments.length > 0) {
          response += `**Key moments:**\n`;
          for (const moment of recall.keyMoments) {
            response += `• ${moment}\n`;
          }
          response += '\n';
        }

        if (recall.emotionalArc) {
          response += `**The feeling:** ${recall.emotionalArc}`;
        }

        return response;
      },
    }),

    // ========================================================================
    // ANTICIPATORY PLANNING
    // ========================================================================

    /**
     * Get anticipated life transitions
     */
    getAnticipatedTransitions: llm.tool({
      description:
        'See what life transitions I\'ve detected approaching - empty nest, retirement, career change, etc. I notice signals humans miss.',
      parameters: z.object({
        userId: z.string().optional().default('default'),
      }),
      execute: async ({ userId }) => {
        const transitions = await anticipatoryPlanning.getAnticipatedTransitions(userId);

        if (transitions.length === 0) {
          return `I haven't detected any upcoming life transitions yet. As we talk more, I'll notice patterns that might suggest changes on the horizon.`;
        }

        let response = `🔮 **Life Transitions I'm Noticing**\n\n`;

        for (const t of transitions.slice(0, 5)) {
          const name = t.transition.replace(/_/g, ' ');
          response += `**${name}** (${Math.round(t.confidence * 100)}% confidence)\n`;
          response += `Timeframe: ${t.estimatedTimeframe}\n`;

          if (t.suggestedPlanning.length > 0) {
            response += `Worth planning:\n`;
            for (const p of t.suggestedPlanning.slice(0, 2)) {
              response += `• ${p}\n`;
            }
          }

          if (t.exploratoryQuestions.length > 0) {
            response += `Question to explore: "${t.exploratoryQuestions[0]}"\n`;
          }

          response += '\n';
        }

        return response;
      },
    }),
  };
}

export default createSuperhumanPlanningTools;
