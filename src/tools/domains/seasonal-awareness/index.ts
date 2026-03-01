/**
 * Seasonal Awareness Tool Domain
 *
 * Voice-callable tools for seasonal patterns, personal dates, and event timing.
 * Wires the seasonalAwareness and seasonalPlanningIntelligence superhuman services.
 *
 * @module tools/domains/seasonal-awareness
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { seasonalAwareness } from '../../../services/superhuman/seasonal-awareness.js';
import { seasonalPlanningIntelligence } from '../../../services/superhuman/seasonal-planning-intelligence.js';

const log = getLogger();

const SEASON_LABELS: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

// ============================================================================
// Tool 1: checkSeasonalPatterns
// ============================================================================

const checkSeasonalPatternsDef: ToolDefinition = {
  id: 'checkSeasonalPatterns',
  name: 'Check Seasonal Patterns',
  description: 'Review how the user\'s energy, mood, and routines change with the seasons',
  domain: 'seasonal-awareness',
  tags: ['seasonal', 'patterns', 'energy', 'mood', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Review the user\'s seasonal patterns — how their energy, mood, and routines change with the seasons',
      parameters: z.object({}),
      execute: async () => {
        try {
          log.info({ userId: ctx.userId }, 'Checking seasonal patterns');

          const observations = await seasonalAwareness.loadObservations(ctx.userId);

          if (observations.length === 0) {
            return "I haven't noticed seasonal patterns yet. Over time, I'll track how your energy and mood shift with the seasons.";
          }

          // Group by season
          const bySeason = new Map<string, typeof observations>();
          for (const obs of observations) {
            const season = obs.season;
            if (!bySeason.has(season)) bySeason.set(season, []);
            bySeason.get(season)!.push(obs);
          }

          const lines: string[] = ["Here's what I've noticed about your seasonal patterns:"];

          for (const [season, obs] of bySeason) {
            const label = SEASON_LABELS[season] || season;
            lines.push('');
            lines.push(`${label}:`);
            for (const o of obs.slice(0, 3)) {
              const sentiment = o.sentiment === 'negative' ? ' (tough time)' : o.sentiment === 'positive' ? ' (good energy)' : '';
              lines.push(`  ${o.type.replace('_', ' ')}: ${o.observation.slice(0, 80)}${sentiment}`);
            }
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Seasonal patterns check failed');
          return "Couldn't pull up your seasonal patterns right now. Try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// Tool 2: upcomingDates
// ============================================================================

const upcomingDatesDef: ToolDefinition = {
  id: 'upcomingDates',
  name: 'Upcoming Dates',
  description: 'Check for upcoming important dates — anniversaries, celebrations, memorials',
  domain: 'seasonal-awareness',
  tags: ['dates', 'anniversaries', 'celebrations', 'upcoming', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Check for upcoming important dates — anniversaries, celebrations, memorials, and seasonal events',
      parameters: z.object({
        daysAhead: z.number().optional().describe('How many days ahead to look (default 30)'),
      }),
      execute: async ({ daysAhead }) => {
        try {
          const lookAhead = daysAhead ?? 30;
          log.info({ userId: ctx.userId, daysAhead: lookAhead }, 'Checking upcoming dates');

          const upcoming = await seasonalAwareness.findUpcoming(ctx.userId, lookAhead);

          if (upcoming.length === 0) {
            return `No important dates coming up in the next ${lookAhead} days.`;
          }

          const lines: string[] = [`Here's what's coming up in the next ${lookAhead} days:`];

          for (const item of upcoming) {
            const { date, daysUntil } = item;
            const when = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`;
            const sentimentNote =
              date.sentiment === 'bittersweet' ? ' (bittersweet)' :
              date.sentiment === 'negative' ? ' (heavy)' :
              '';
            lines.push(`  ${when}: ${date.name} (${date.type})${sentimentNote}`);
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Upcoming dates check failed');
          return "Couldn't check upcoming dates right now. Try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// Tool 3: suggestEventTiming
// ============================================================================

const suggestEventTimingDef: ToolDefinition = {
  id: 'suggestEventTiming',
  name: 'Suggest Event Timing',
  description: 'Suggest the best time to plan an event based on seasonal patterns and personal dates',
  domain: 'seasonal-awareness',
  tags: ['timing', 'planning', 'events', 'seasonal', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Suggest the best time to plan an event based on the user\'s seasonal patterns, cultural calendar, and personal dates',
      parameters: z.object({
        eventType: z.string().describe("Type of event, e.g. 'party', 'wedding', 'vacation', 'career-change'"),
      }),
      execute: async ({ eventType }) => {
        try {
          log.info({ userId: ctx.userId, eventType }, 'Suggesting event timing');

          const recommendations = await seasonalPlanningIntelligence.suggestOptimalTiming(
            ctx.userId,
            eventType
          );

          if (recommendations.length === 0) {
            return `I don't have enough data to suggest timing for a ${eventType} yet.`;
          }

          const top3 = recommendations.slice(0, 3);
          const lines: string[] = [`Best times for your ${eventType}:`];

          for (const rec of top3) {
            const monthLabel = new Date(rec.dateRange.start).toLocaleString('en-US', {
              month: 'long',
              year: 'numeric',
            });
            lines.push('');
            lines.push(`${monthLabel} — score: ${rec.score}/100`);

            for (const reason of rec.reasons.slice(0, 2)) {
              lines.push(`  Good: ${reason}`);
            }
            for (const warning of rec.warnings.slice(0, 2)) {
              lines.push(`  Watch out: ${warning}`);
            }
            for (const note of rec.culturalNotes.slice(0, 1)) {
              lines.push(`  Note: ${note}`);
            }
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Event timing suggestion failed');
          return "Couldn't suggest timing right now. Try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// Domain Export
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'seasonal-awareness',
  [checkSeasonalPatternsDef, upcomingDatesDef, suggestEventTimingDef]
);
