/**
 * Capacity Monitoring Domain Tools
 *
 * Voice-callable tools for the Capacity Guardian and Energy Wave Mapping
 * superhuman services. DOMAIN: capacity-monitoring
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ToolDomain } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { capacityGuardian } from '../../../services/superhuman/capacity-guardian.js';
import { energyWaveMapping } from '../../../services/superhuman/energy-wave-mapping.js';

const log = getLogger();

// Domain name — will be added to ToolDomain union by the registration task
const DOMAIN = 'capacity-monitoring' as ToolDomain;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ENERGY_SCORE: Record<string, number> = { high: 90, good: 70, moderate: 50, low: 30, depleted: 10 };

const checkBurnoutRiskDef: ToolDefinition = {
  id: 'checkBurnoutRisk',
  name: 'Check Burnout Risk',
  description: "Assess the user's current burnout risk",
  domain: DOMAIN,
  tags: ['burnout', 'energy', 'wellness', 'capacity'],
  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        "Assess the user's current burnout risk based on energy patterns, commitments, and calendar load",
      parameters: z.object({}),
      execute: async () => {
        try {
          const assessment = await capacityGuardian.assessRisk(ctx.userId);
          const lines: string[] = [
            `Burnout risk: ${assessment.risk.toUpperCase()} (${assessment.riskScore}/100)`,
          ];
          if (assessment.factors.length > 0) {
            lines.push('\nContributing factors:');
            for (const f of assessment.factors.slice(0, 4)) {
              lines.push(`- ${f.factor}: ${f.description}`);
            }
          }
          if (assessment.recommendations.length > 0) {
            lines.push('\nRecommendations:');
            for (const rec of assessment.recommendations.slice(0, 3)) lines.push(`- ${rec}`);
          }
          if (assessment.risk === 'high' || assessment.risk === 'critical') {
            lines.push("\nI want you to take this seriously. Your wellbeing matters more than any to-do list.");
          }
          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to assess burnout risk');
          return "I had trouble checking your burnout risk. Let's try again in a moment.";
        }
      },
    });
  },
};

const logEnergyDef: ToolDefinition = {
  id: 'logEnergy',
  name: 'Log Energy',
  description: "Record the user's current energy level",
  domain: DOMAIN,
  tags: ['energy', 'tracking', 'wellness'],
  create: (ctx: ToolContext) => {
    return llm.tool({
      description: "Record the user's current energy level for tracking over time",
      parameters: z.object({
        energyLevel: z.enum(['high', 'good', 'moderate', 'low', 'depleted']).describe("The user's current energy level"),
        factors: z.array(z.string()).optional().describe("What's affecting energy (e.g., 'poor sleep', 'stressful day')"),
      }),
      execute: async (params: { energyLevel: 'high' | 'good' | 'moderate' | 'low' | 'depleted'; factors?: string[] }) => {
        try {
          const score = ENERGY_SCORE[params.energyLevel];
          await capacityGuardian.recordReading(ctx.userId, {
            energyLevel: params.energyLevel,
            energyScore: score,
            detectedFrom: ['explicit'],
            indicators: params.factors ?? [],
          });
          log.info({ userId: ctx.userId, level: params.energyLevel, score }, 'Energy logged via tool');
          const messages: Record<string, string> = {
            high: "Logged! You're feeling energized. Great time to tackle something meaningful.",
            good: "Logged! Solid energy today. You've got this.",
            moderate: "Logged. You're hanging in there. Be kind to yourself today.",
            low: "Logged. Sounds like you could use some rest. What can wait until tomorrow?",
            depleted: "Logged. I hear you. Please take care of yourself first. Everything else can wait.",
          };
          return messages[params.energyLevel];
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to log energy');
          return "I had trouble logging your energy. Let's try again.";
        }
      },
    });
  },
};

const checkEnergyPatternsDef: ToolDefinition = {
  id: 'checkEnergyPatterns',
  name: 'Check Energy Patterns',
  description: "Analyze the user's energy patterns over time",
  domain: DOMAIN,
  tags: ['energy', 'patterns', 'analytics'],
  create: (ctx: ToolContext) => {
    return llm.tool({
      description: "Analyze the user's energy patterns over time to find peak hours and best times for different activities",
      parameters: z.object({
        daysBack: z.number().optional().describe('Number of days to analyze (default 30)'),
      }),
      execute: async (params: { daysBack?: number }) => {
        try {
          const days = params.daysBack ?? 30;
          const interactions = await energyWaveMapping.load(ctx.userId, days);
          if (interactions.length < 10) {
            return `I need more data to spot patterns. I've only seen ${interactions.length} interactions so far. Keep chatting with me and I'll learn your rhythms over time.`;
          }
          const profile = energyWaveMapping.analyze(interactions);
          if (!profile) return "Not enough pattern data yet. I'm still learning your rhythms.";

          const lines: string[] = [];
          if (profile.dailyPattern.peakHours.length > 0) {
            const peaks = profile.dailyPattern.peakHours.sort((a, b) => a - b).map((h) => `${h}:00`).join(', ');
            lines.push(`Peak energy hours: ${peaks}`);
          }
          if (profile.weeklyPattern.lowEnergyDays.length > 0) {
            lines.push(`Lower energy days: ${profile.weeklyPattern.lowEnergyDays.map((d) => DAY_NAMES[d]).join(', ')}`);
          }
          if (profile.weeklyPattern.highEnergyDays.length > 0) {
            lines.push(`High energy days: ${profile.weeklyPattern.highEnergyDays.map((d) => DAY_NAMES[d]).join(', ')}`);
          }
          const deepRec = energyWaveMapping.getRecommendation('deep_emotional', profile);
          if (deepRec.betterTimes && deepRec.betterTimes.length > 0) {
            lines.push(`\nBest times for deep conversations: ${deepRec.betterTimes.join(', ')}`);
          }
          if (lines.length === 0) return "I'm still building your energy profile. Keep logging and I'll have insights soon.";
          return `Here's what I've noticed over the last ${days} days:\n${lines.join('\n')}`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to check energy patterns');
          return "I had trouble analyzing your energy patterns. Let's try again later.";
        }
      },
    });
  },
};

export const { getToolDefinitions, domain, definitions } = createDomainExport(DOMAIN, [
  checkBurnoutRiskDef,
  logEnergyDef,
  checkEnergyPatternsDef,
]);
