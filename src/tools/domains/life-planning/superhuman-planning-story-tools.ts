/**
 * Superhuman Planning Tools: Event Stories & Anticipation
 *
 * Event story capture (meaning, emotional journey) and anticipatory planning
 * (detecting upcoming life transitions). Spread into
 * createSuperhumanPlanningTools() in superhuman-planning-tools.ts.
 *
 * @module tools/domains/life-planning/superhuman-planning-story-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';

import { eventStoryCapture } from '../../../services/superhuman/event-story-capture.js';
import { anticipatoryPlanning } from '../../../services/superhuman/anticipatory-planning.js';

/** Event story and anticipatory planning tools (part of the superhuman planning set). */
export function createSuperhumanPlanningStoryTools() {
  return {
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
        const story = await eventStoryCapture.startStoryCapture(
          userId,
          eventName,
          eventType,
          eventDate
        );

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
      description:
        'Remember what a past event meant - the emotional significance, key moments, and lessons.',
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
        "See what life transitions I've detected approaching - empty nest, retirement, career change, etc. I notice signals humans miss.",
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
