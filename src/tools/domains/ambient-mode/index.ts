/**
 * Ambient Mode Domain Tools
 *
 * "Better than Human" - Continuous background presence.
 *
 * Tools for ambient awareness - knowing where the user is, what time it is,
 * and being able to send gentle nudges when appropriate.
 *
 * DOMAIN: awareness
 * TOOLS:
 *   - getAmbientContext: Get current ambient context (location, time, activity)
 *   - suggestNudge: Evaluate if a nudge should be sent
 *   - setAmbientPreferences: Update ambient mode preferences
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Superhuman services for "Better Than Human" awareness
import { buildSeasonalContext } from '../../../services/superhuman/seasonal-awareness.js';
import { buildEnergyWaveContext } from '../../../services/superhuman/energy-wave-mapping.js';

const log = getLogger();

// ============================================================================
// GET AMBIENT CONTEXT
// ============================================================================

const getAmbientContextDef: ToolDefinition = {
  id: 'getAmbientContext',
  name: 'Get Ambient Context',
  description:
    'Get the current ambient context - location type, time of day, recent activity. Better than human awareness.',
  domain: 'awareness',
  tags: ['awareness', 'ambient', 'location', 'context', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getAmbientContext'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const { ambientMode } = await import('../../../services/ambient-mode/index.js');

          // Check if ambient mode is enabled
          const isEnabled = await ambientMode.isEnabled(ctx.userId);
          if (!isEnabled) {
            return "I don't have ambient awareness enabled for you. Enable it in settings so I know when you're home, at work, or on the go.";
          }

          const context = await ambientMode.buildContext(ctx.userId);

          if (!context.hasAmbientData) {
            return "I don't have recent ambient context. Your device might not have synced recently.";
          }

          // Build natural description from AmbientContext fields
          const parts: string[] = [];

          if (context.locationAwareness) {
            parts.push(context.locationAwareness);
          }

          if (context.timeAwareness) {
            parts.push(context.timeAwareness);
          }

          if (context.activityAwareness) {
            parts.push(context.activityAwareness);
          }

          if (context.environmentAwareness) {
            parts.push(context.environmentAwareness);
          }

          if (context.conversationStarters?.length) {
            parts.push(`Conversation starter: ${context.conversationStarters[0]}`);
          }

          log.info({ userId: ctx.userId }, 'Ambient context retrieved');

          return parts.length > 0
            ? parts.join('. ') + '.'
            : 'I have your ambient context but nothing notable to share right now.';
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Get ambient context failed');
          return "I couldn't retrieve your ambient context right now.";
        }
      },
    });
  },
};

// ============================================================================
// SUGGEST NUDGE
// ============================================================================

const suggestNudgeDef: ToolDefinition = {
  id: 'suggestNudge',
  name: 'Suggest Nudge',
  description: 'Evaluate if a gentle nudge should be sent to the user based on ambient context.',
  domain: 'awareness',
  tags: ['awareness', 'ambient', 'nudge', 'proactive', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('suggestNudge'),
      parameters: z.object({
        nudgeType: z
          .enum([
            'morning_checkin',
            'evening_reflection',
            'post_meeting',
            'workout_encouragement',
            'commute_moment',
            'bedtime_reminder',
            'weather_related',
            'general',
          ])
          .optional()
          .describe('Type of nudge to evaluate'),
      }),
      execute: async ({ nudgeType }) => {
        try {
          const { ambientMode } = await import('../../../services/ambient-mode/index.js');

          // Check if ambient mode is enabled
          const isEnabled = await ambientMode.isEnabled(ctx.userId);
          if (!isEnabled) {
            return "Ambient mode isn't enabled, so I can't evaluate nudges.";
          }

          // Get the current state first
          const state = await ambientMode.getState(ctx.userId);
          if (!state) {
            return "I don't have your ambient state yet. Make sure the Ferni app is syncing.";
          }

          // evaluateNudge takes a state object and returns AmbientNudge | null
          const evaluation = await ambientMode.evaluateNudge(state);

          if (evaluation && evaluation.shouldSend) {
            log.info(
              { userId: ctx.userId, nudgeType: evaluation.type, reason: evaluation.reason },
              'Nudge suggested'
            );

            return `Yes, a ${evaluation.type || 'check-in'} would be appropriate. ${evaluation.reason}`;
          } else {
            return `Not right now. ${evaluation?.reason || 'No nudge criteria met.'}`;
          }
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Suggest nudge failed');
          return "I couldn't evaluate whether to send a nudge right now.";
        }
      },
    });
  },
};

// ============================================================================
// SET QUIET HOURS
// ============================================================================

const setQuietHoursDef: ToolDefinition = {
  id: 'setQuietHours',
  name: 'Set Quiet Hours',
  description: 'Set the quiet hours when nudges should not be sent.',
  domain: 'awareness',
  tags: ['awareness', 'ambient', 'settings', 'quiet-hours'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('setQuietHours'),
      parameters: z.object({
        startTime: z.string().describe('Start time in HH:MM format (24-hour), e.g., "22:00"'),
        endTime: z.string().describe('End time in HH:MM format (24-hour), e.g., "08:00"'),
      }),
      execute: async ({ startTime, endTime }) => {
        try {
          const { ambientMode } = await import('../../../services/ambient-mode/index.js');

          // Validate time format
          const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
          if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return 'Please use 24-hour time format like 22:00 for 10 PM or 08:00 for 8 AM.';
          }

          await ambientMode.setQuietHours(ctx.userId, startTime, endTime);

          log.info({ userId: ctx.userId, startTime, endTime }, 'Quiet hours set');

          // Format for natural speech
          const formatTime = (time: string) => {
            const [hours, mins] = time.split(':').map(Number);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const hour12 = hours % 12 || 12;
            return `${hour12}:${mins.toString().padStart(2, '0')} ${ampm}`;
          };

          return `Got it! I'll keep quiet from ${formatTime(startTime)} to ${formatTime(endTime)}. No nudges during that time.`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Set quiet hours failed');
          return "I couldn't set quiet hours right now. Try again?";
        }
      },
    });
  },
};

// ============================================================================
// GET AMBIENT PREFERENCES
// ============================================================================

const getAmbientPreferencesDef: ToolDefinition = {
  id: 'getAmbientPreferences',
  name: 'Get Ambient Preferences',
  description: 'Get the current ambient mode preferences.',
  domain: 'awareness',
  tags: ['awareness', 'ambient', 'settings', 'preferences'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getAmbientPreferences'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const { ambientMode } = await import('../../../services/ambient-mode/index.js');

          const prefs = await ambientMode.getPreferences(ctx.userId);

          if (!prefs) {
            return "You haven't set up ambient mode yet. Would you like me to enable it?";
          }

          const parts: string[] = [];

          parts.push(`Ambient mode is ${prefs.enabled ? 'enabled' : 'disabled'}`);

          if (prefs.enabled) {
            if (prefs.allowLocation) parts.push('location tracking is on');
            if (prefs.allowPushNudges) parts.push('nudges are enabled');
            if (prefs.quietHoursStart && prefs.quietHoursEnd) {
              parts.push(`quiet hours are ${prefs.quietHoursStart} to ${prefs.quietHoursEnd}`);
            }
            if (prefs.maxNudgesPerDay) {
              parts.push(`max ${prefs.maxNudgesPerDay} nudges per day`);
            }
          }

          return parts.join(', ') + '.';
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Get ambient preferences failed');
          return "I couldn't retrieve your ambient preferences right now.";
        }
      },
    });
  },
};

// ============================================================================
// ENABLE/DISABLE AMBIENT MODE
// ============================================================================

const toggleAmbientModeDef: ToolDefinition = {
  id: 'toggleAmbientMode',
  name: 'Toggle Ambient Mode',
  description: 'Enable or disable ambient mode.',
  domain: 'awareness',
  tags: ['awareness', 'ambient', 'settings', 'toggle'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('toggleAmbientMode'),
      parameters: z.object({
        enabled: z.boolean().describe('Whether to enable (true) or disable (false) ambient mode'),
      }),
      execute: async ({ enabled }) => {
        try {
          const { ambientMode } = await import('../../../services/ambient-mode/index.js');

          if (enabled) {
            await ambientMode.enable(ctx.userId);
            log.info({ userId: ctx.userId }, 'Ambient mode enabled');
            return "Ambient mode is now enabled! I'll be aware of your location, time, and activity to provide better support.";
          } else {
            await ambientMode.disable(ctx.userId);
            log.info({ userId: ctx.userId }, 'Ambient mode disabled');
            return "Ambient mode is now disabled. I won't track location or send proactive nudges.";
          }
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, enabled },
            'Toggle ambient mode failed'
          );
          return `I couldn't ${enabled ? 'enable' : 'disable'} ambient mode right now. Try again?`;
        }
      },
    });
  },
};

// ============================================================================
// SUPERHUMAN AWARENESS TOOLS
// ============================================================================

const getSeasonalAwarenessDef: ToolDefinition = {
  id: 'getSeasonalAwareness',
  name: 'Get Seasonal Awareness',
  description:
    'Get superhuman awareness of seasonal patterns, anniversaries, and cyclical life events',
  domain: 'awareness',
  tags: ['awareness', 'seasonal', 'better-than-human', 'cycles'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getSeasonalAwareness'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const seasonalContext = await buildSeasonalContext(ctx.userId);

          if (!seasonalContext || seasonalContext === '') {
            return "I'm still learning your seasonal patterns. As we talk through different times of year, I'll remember what comes up for you.";
          }

          log.info({ userId: ctx.userId }, 'Seasonal awareness retrieved');

          return `**Seasonal Awareness**\n\n${seasonalContext}\n\nThis is "Better Than Human" memory—I notice the rhythms of your year that even you might not see.`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Get seasonal awareness failed');
          return "I couldn't access seasonal patterns right now.";
        }
      },
    });
  },
};

const getEnergyWaveAwarenessDef: ToolDefinition = {
  id: 'getEnergyWaveAwareness',
  name: 'Get Energy Wave Awareness',
  description: 'Get superhuman awareness of energy patterns throughout the day and week',
  domain: 'awareness',
  tags: ['awareness', 'energy', 'better-than-human', 'patterns'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getEnergyWaveAwareness'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const energyContext = await buildEnergyWaveContext(ctx.userId);

          if (!energyContext || energyContext === '') {
            return "I'm still mapping your energy patterns. As we talk at different times, I'll learn when you're at your best and when you need gentler support.";
          }

          log.info({ userId: ctx.userId }, 'Energy wave awareness retrieved');

          return `**Energy Awareness**\n\n${energyContext}\n\nA human friend might not notice when you're depleted. I do.`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            'Get energy wave awareness failed'
          );
          return "I couldn't access energy patterns right now.";
        }
      },
    });
  },
};

const getFullAmbientIntelligenceDef: ToolDefinition = {
  id: 'getFullAmbientIntelligence',
  name: 'Get Full Ambient Intelligence',
  description: 'Get comprehensive ambient awareness: location, time, energy, and seasonal patterns',
  domain: 'awareness',
  tags: ['awareness', 'ambient', 'better-than-human', 'comprehensive'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getFullAmbientIntelligence'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const { ambientMode } = await import('../../../services/ambient-mode/index.js');

          // Gather all awareness in parallel
          const [ambientContext, seasonalContext, energyContext] = await Promise.all([
            ambientMode.buildContext(ctx.userId).catch(() => null),
            buildSeasonalContext(ctx.userId).catch(() => ''),
            buildEnergyWaveContext(ctx.userId).catch(() => ''),
          ]);

          const sections: string[] = [];

          if (ambientContext?.hasAmbientData) {
            sections.push(`**Right Now:**`);
            if (ambientContext.locationAwareness) sections.push(ambientContext.locationAwareness);
            if (ambientContext.timeAwareness) sections.push(ambientContext.timeAwareness);
            if (ambientContext.activityAwareness) sections.push(ambientContext.activityAwareness);
          }

          if (energyContext) {
            sections.push(`\n**Energy:**\n${energyContext}`);
          }

          if (seasonalContext) {
            sections.push(`\n**Seasonal:**\n${seasonalContext}`);
          }

          if (sections.length === 0) {
            return "I don't have ambient intelligence data yet. Enable ambient mode and talk to me at different times—I'll learn your patterns.";
          }

          log.info({ userId: ctx.userId }, 'Full ambient intelligence retrieved');

          return `**Full Ambient Intelligence**\n\n${sections.join('\n')}\n\n---\n\nThis is superhuman awareness. No human friend could hold all this context at once.`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            'Get full ambient intelligence failed'
          );
          return "I couldn't gather full ambient intelligence right now.";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const ambientModeTools: ToolDefinition[] = [
  getAmbientContextDef,
  suggestNudgeDef,
  setQuietHoursDef,
  getAmbientPreferencesDef,
  toggleAmbientModeDef,
  // Superhuman awareness tools
  getSeasonalAwarenessDef,
  getEnergyWaveAwarenessDef,
  getFullAmbientIntelligenceDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'ambient-mode',
  ambientModeTools
);

export {
  getAmbientContextDef,
  suggestNudgeDef,
  setQuietHoursDef,
  getAmbientPreferencesDef,
  toggleAmbientModeDef,
};

export default getToolDefinitions;
