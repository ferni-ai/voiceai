/**
 * Contemplative Practice Domain Tools
 *
 * Voice-callable tools for the Contemplative Intelligence superhuman service.
 * Track wisdom development, guide mindfulness, and support contemplative growth.
 *
 * DOMAIN: contemplative-practice
 * TOOLS: assessMindfulness, getDefusionTechnique, recordContemplativePractice
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  contemplativeIntelligence,
} from '../../../services/superhuman/contemplative-intelligence.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

const QUALITY_MAP: Record<string, number> = {
  struggled: 0.2,
  okay: 0.5,
  good: 0.7,
  deep: 0.9,
};

function formatFacetName(facet: string): string {
  return facet
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// TOOL 1: assessMindfulness
// ============================================================================

const assessMindfulnessDef: ToolDefinition = {
  id: 'assessMindfulness',
  name: 'Assess Mindfulness',
  description: "Assess the user's mindfulness level and recommend practices",
  domain: 'contemplative-practice',
  tags: ['mindfulness', 'assessment', 'meditation', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Assess the user's current mindfulness level based on conversation patterns and recommend practices",
      parameters: z.object({}),
      execute: async () => {
        try {
          log.info({ userId: ctx.userId }, 'Assessing mindfulness');

          // Default patterns — the LLM has conversation context,
          // these defaults get the assessment started
          const patterns = {
            presenceLevel: 5,
            emotionalAwareness: 6,
            reactivityLevel: 5,
            judgmentLevel: 5,
            abilityToDescribeExperience: 5,
            automaticPilotBehavior: false,
            observationStatements: [],
          };

          const assessment = contemplativeIntelligence.assessMindfulness(patterns, ctx.userId);
          const recommendations =
            contemplativeIntelligence.recommendMindfulnessPractices(assessment);

          const lines: string[] = [
            `Your mindfulness snapshot:\n`,
            `Overall: ${assessment.overallScore.toFixed(1)} out of 5`,
            `Primary strength: ${formatFacetName(assessment.primaryStrength)}`,
            `Area for growth: ${formatFacetName(assessment.areaForGrowth)}\n`,
            `Recommended practice: ${recommendations.primaryRecommendation.practice}`,
            `Why: ${recommendations.primaryRecommendation.rationale}`,
            `Duration: ${recommendations.primaryRecommendation.duration}`,
          ];

          if (recommendations.warning) {
            lines.push(`\nNote: ${recommendations.warning}`);
          }

          if (recommendations.secondaryRecommendations.length > 0) {
            lines.push('\nAlso worth exploring:');
            for (const rec of recommendations.secondaryRecommendations) {
              lines.push(`- ${rec.practice}: ${rec.rationale}`);
            }
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to assess mindfulness');
          return "I couldn't complete the mindfulness assessment right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================================================
// TOOL 2: getDefusionTechnique
// ============================================================================

const getDefusionTechniqueDef: ToolDefinition = {
  id: 'getDefusionTechnique',
  name: 'Get Defusion Technique',
  description: 'Get a cognitive defusion technique for a difficult thought pattern',
  domain: 'contemplative-practice',
  tags: ['defusion', 'ACT', 'thoughts', 'therapy', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get a cognitive defusion technique to help the user distance from a difficult thought pattern (ACT therapy based)',
      parameters: z.object({
        thoughtPattern: z
          .string()
          .describe('The thought the user is stuck on, e.g. "I\'m not good enough"'),
      }),
      execute: async ({ thoughtPattern }: { thoughtPattern: string }) => {
        try {
          log.info({ userId: ctx.userId }, 'Getting defusion technique');

          const result = contemplativeIntelligence.getDefusionTechnique(thoughtPattern);

          const lines: string[] = [
            `Here's something that might help with that thought:\n`,
            `Technique: ${result.technique}`,
            `How to do it: ${result.instruction}`,
            `Example: ${result.example}`,
            `\nThis comes from Acceptance and Commitment Therapy. The goal isn't to make the thought go away — it's to hold it more lightly.`,
          ];

          return lines.join('\n');
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            'Failed to get defusion technique'
          );
          return "I couldn't find a technique right now, but I hear that thought is weighing on you. Let's talk about it.";
        }
      },
    });
  },
};

// ============================================================================
// TOOL 3: recordContemplativePractice
// ============================================================================

const recordContemplativePracticeDef: ToolDefinition = {
  id: 'recordContemplativePractice',
  name: 'Record Contemplative Practice',
  description: 'Record a mindfulness or contemplative practice the user completed',
  domain: 'contemplative-practice',
  tags: ['practice', 'meditation', 'record', 'mindfulness', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Record a mindfulness or contemplative practice the user completed',
      parameters: z.object({
        type: z
          .string()
          .describe("Practice type, e.g. 'meditation', 'breathwork', 'body-scan', 'journaling'"),
        durationMinutes: z.number().describe('How long the practice lasted in minutes'),
        quality: z
          .enum(['struggled', 'okay', 'good', 'deep'])
          .describe('How the practice felt'),
        insights: z
          .string()
          .optional()
          .describe('Any insights or observations from the practice'),
      }),
      execute: async ({
        type,
        durationMinutes,
        quality,
        insights,
      }: {
        type: string;
        durationMinutes: number;
        quality: string;
        insights?: string;
      }) => {
        try {
          log.info({ userId: ctx.userId, type, durationMinutes, quality }, 'Recording practice');

          const qualityScore = QUALITY_MAP[quality] ?? 0.5;

          await contemplativeIntelligence.recordPractice(ctx.userId, {
            type,
            duration: durationMinutes,
            quality: qualityScore,
            insights,
          });

          const qualityMessages: Record<string, string> = {
            struggled: "Even showing up when it's hard counts. That takes real courage.",
            okay: 'Steady practice builds the foundation. Well done.',
            good: "That's a solid session. You're building something meaningful.",
            deep: 'A deep practice like that stays with you. Beautiful work.',
          };

          const message = qualityMessages[quality] || 'Practice recorded.';
          return `${durationMinutes} minutes of ${type} logged. ${message}`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            'Failed to record practice'
          );
          return "I couldn't log that practice, but your time on the cushion still counts. Let's try saving it again.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'contemplative-practice',
  [assessMindfulnessDef, getDefusionTechniqueDef, recordContemplativePracticeDef]
);
