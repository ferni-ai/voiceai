/**
 * Life Synthesis Tool Domain
 *
 * Voice-callable tools for cross-domain life analysis and trajectory projection.
 * Wires the crossDomainSynthesis and lifeTrajectoryEngine superhuman services.
 *
 * @module tools/domains/life-synthesis
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { crossDomainSynthesis } from '../../../services/superhuman/cross-domain-synthesis.js';
import { lifeTrajectoryEngine } from '../../../services/superhuman/life-trajectory-engine.js';

const log = getLogger();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================================================
// Tool 1: synthesizeMyLife
// ============================================================================

const synthesizeMyLifeDef: ToolDefinition = {
  id: 'synthesizeMyLife',
  name: 'Synthesize My Life',
  description: 'Generate a comprehensive cross-domain life synthesis with insights and recommendations',
  domain: 'life-synthesis',
  tags: ['synthesis', 'insights', 'cross-domain', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Generate a comprehensive life synthesis — analyzing health, career, relationships, finances, growth, and emotional patterns to find cross-domain connections and insights',
      parameters: z.object({}),
      execute: async () => {
        try {
          log.info({ userId: ctx.userId }, 'Synthesizing life domains');

          let synthesis = await crossDomainSynthesis.getLatest(ctx.userId);

          if (!synthesis || Date.now() - new Date(synthesis.generatedAt).getTime() > SEVEN_DAYS_MS) {
            synthesis = await crossDomainSynthesis.generate(ctx.userId);
          }

          const lines: string[] = [];

          // Domain scores
          if (synthesis.domains.length > 0) {
            lines.push("Here's how things look across your life right now:");
            for (const d of synthesis.domains) {
              const trendLabel = d.trend === 'improving' ? 'improving' : d.trend === 'declining' ? 'declining' : 'steady';
              lines.push(`  ${d.name.replace('_', ' ')}: ${d.currentScore}/100 (${trendLabel})`);
            }
          }

          // Top insights
          const topInsights = synthesis.insights
            .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
            .slice(0, 3);
          if (topInsights.length > 0) {
            lines.push('');
            lines.push('Key insights:');
            for (const insight of topInsights) {
              lines.push(`  ${insight.title}: ${insight.ferniInsight || insight.description}`);
            }
          }

          // Top risk
          const highRisk = synthesis.riskAlerts.find(
            (r) => r.riskLevel === 'critical' || r.riskLevel === 'high'
          );
          if (highRisk) {
            lines.push('');
            lines.push(`Watch out: ${highRisk.title} — ${highRisk.description}`);
          }

          // Top opportunity
          if (synthesis.opportunities.length > 0) {
            const opp = synthesis.opportunities[0];
            lines.push('');
            lines.push(`Opportunity: ${opp.title} — ${opp.description}`);
          }

          return lines.join('\n') || "I don't have enough data yet to synthesize your life domains. Keep talking to me and I'll build up a picture over time.";
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Life synthesis failed');
          return "I couldn't pull together your life synthesis right now. Let's try again in a bit.";
        }
      },
    });
  },
};

// ============================================================================
// Tool 2: getLifeTrajectory
// ============================================================================

const getLifeTrajectoryDef: ToolDefinition = {
  id: 'getLifeTrajectory',
  name: 'Get Life Trajectory',
  description: 'Get the user\'s life trajectory with projections and suggested pivots',
  domain: 'life-synthesis',
  tags: ['trajectory', 'projection', 'chapter', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get the user\'s life trajectory — where they are, where they\'re heading, and what compound effects are building',
      parameters: z.object({}),
      execute: async () => {
        try {
          log.info({ userId: ctx.userId }, 'Getting life trajectory');

          let trajectory = await lifeTrajectoryEngine.getLatest(ctx.userId);

          if (!trajectory) {
            trajectory = await lifeTrajectoryEngine.generate(ctx.userId);
          }

          const lines: string[] = [];

          // Current chapter
          lines.push(`You're in a chapter I'd call "${trajectory.currentChapter.title}".`);
          if (trajectory.currentChapter.description) {
            lines.push(trajectory.currentChapter.description);
          }

          // Life score highlights
          const { lifeScore } = trajectory;
          lines.push('');
          lines.push(`Overall life score: ${lifeScore.overall}/100.`);

          // Find the two lowest areas
          const areas: Array<{ name: string; score: number }> = [
            { name: 'health', score: lifeScore.health },
            { name: 'career', score: lifeScore.career },
            { name: 'relationships', score: lifeScore.relationships },
            { name: 'growth', score: lifeScore.growth },
            { name: 'meaning', score: lifeScore.meaning },
          ];
          areas.sort((a, b) => a.score - b.score);
          const lowest = areas.slice(0, 2);
          lines.push(`Areas that could use attention: ${lowest.map((a) => `${a.name} (${a.score})`).join(', ')}.`);

          // Projected outcome (realistic)
          const realistic = trajectory.projectedOutcomes.realistic;
          lines.push('');
          lines.push(`Looking ahead: ${realistic.description}`);

          // Top pivot suggestion
          if (trajectory.suggestedPivots.length > 0) {
            const pivot = trajectory.suggestedPivots[0];
            lines.push('');
            lines.push(`Something to consider: ${pivot.title} — ${pivot.reasoning}`);
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Life trajectory failed');
          return "I couldn't generate your life trajectory right now. Let's try again later.";
        }
      },
    });
  },
};

// ============================================================================
// Tool 3: getLifeScore
// ============================================================================

const getLifeScoreDef: ToolDefinition = {
  id: 'getLifeScore',
  name: 'Get Life Score',
  description: 'Quick check on life score across 6 dimensions',
  domain: 'life-synthesis',
  tags: ['score', 'quick-check', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Quick check on the user\'s life score across 6 dimensions: health, career, relationships, growth, meaning, and overall',
      parameters: z.object({}),
      execute: async () => {
        try {
          log.info({ userId: ctx.userId }, 'Getting life score');

          const trajectory = await lifeTrajectoryEngine.getLatest(ctx.userId);

          if (!trajectory) {
            return "I don't have enough data yet to calculate a life score. Keep talking to me and I'll build up a picture.";
          }

          const { lifeScore } = trajectory;
          const lines = [
            `Your life score: ${lifeScore.overall}/100`,
            '',
            `  Health: ${lifeScore.health}/100`,
            `  Career: ${lifeScore.career}/100`,
            `  Relationships: ${lifeScore.relationships}/100`,
            `  Growth: ${lifeScore.growth}/100`,
            `  Meaning: ${lifeScore.meaning}/100`,
          ];

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Life score check failed');
          return "Couldn't pull up your life score right now. Try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// Domain Export
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'life-synthesis',
  [synthesizeMyLifeDef, getLifeTrajectoryDef, getLifeScoreDef]
);
