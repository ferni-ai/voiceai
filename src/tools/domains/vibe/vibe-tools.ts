/**
 * Vibe Control Voice Tools
 *
 * Voice commands for unified environment control:
 * - "Set the vibe to focus"
 * - "I need to relax"
 * - "Make it cozy"
 * - "Set up for a party"
 *
 * This tool translates natural language into coordinated
 * Music + Lights + Temperature adjustments.
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  activateVibe,
  getVibeState,
  getAvailablePresets,
  VIBE_PRESETS,
} from '../../../services/vibe/index.js';

const log = createLogger({ module: 'vibe-tools' });

// ============================================================================
// SET VIBE PRESET
// ============================================================================

const setVibeDef: ToolDefinition = {
  id: 'setVibe',
  name: 'Set Vibe',
  description:
    'Set the environment vibe - adjusts music, lights, and temperature together for a unified atmosphere.',
  domain: 'smart-home',
  additionalDomains: ['entertainment', 'wellness'],
  tags: ['vibe', 'environment', 'ambiance', 'mood', 'atmosphere'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('setVibe') ||
        `Set the environment vibe. Available vibes: ${Object.keys(VIBE_PRESETS).join(', ')}. 
        Use when user says things like "set the vibe to focus", "I need to relax", "make it cozy", 
        "set up for a party", "help me concentrate", "time to wind down", "getting ready for bed".
        This controls music, lights, and temperature together for a unified experience.`,
      parameters: z.object({
        vibe: z
          .enum([
            'focus',
            'relax',
            'energize',
            'sleep',
            'social',
            'morning',
            'romantic',
            'workout',
            'movie',
            'cooking',
            'reading',
            'creative',
            'meditation',
            'gaming',
            'dinner',
          ])
          .describe(
            'The vibe to set. focus=work mode, relax=wind down, energize=get moving, sleep=bedtime, social=hosting, morning=wake up, romantic=date night, workout=exercise'
          ),
      }),
      execute: async ({ vibe }) => {
        log.info({ userId: ctx.userId, vibe }, 'Setting vibe');

        const result = await activateVibe(ctx.userId, vibe);

        if (!result.success) {
          return result.message;
        }

        // Build a friendly response
        const preset = VIBE_PRESETS[vibe];
        let response = `🌟 **${preset.name} vibe activated!**\n\n`;

        if (result.applied.music) {
          response += `🎵 Music: ${preset.music?.genre || 'ambient'} vibes\n`;
        }
        if (result.applied.lights) {
          response += `💡 Lights: ${preset.lights?.brightness}% brightness, ${preset.lights?.colorTemp}K\n`;
        }
        if (result.applied.temperature) {
          response += `🌡️ Temperature: ${preset.temperature?.target}°F\n`;
        }

        if (!result.applied.lights && !result.applied.temperature) {
          response += `\n_Connect smart home devices in Settings to control lights and temperature._`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// GET ENVIRONMENT STATUS
// ============================================================================

const getEnvironmentStatusDef: ToolDefinition = {
  id: 'getEnvironmentStatus',
  name: 'Get Environment Status',
  description: 'Get the current status of the environment - music, lights, and temperature.',
  domain: 'smart-home',
  tags: ['vibe', 'status', 'environment'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('getEnvironmentStatus') ||
        'Get the current environment status including music, lights, and temperature. Use when user asks "what\'s the vibe?", "how are things set up?", "what\'s the temperature?".',
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Getting environment status');

        const state = await getVibeState(ctx.userId);
        let response = '**Current Environment**\n\n';

        // Music status
        response += `🎵 **Music**: ${state.music.playing ? 'Playing' : 'Paused'}`;
        if (state.music.track) {
          response += ` - ${state.music.track}`;
          if (state.music.artist) {
            response += ` by ${state.music.artist}`;
          }
        }
        response += '\n';

        // Lights status
        if (state.lights.connected) {
          response += `💡 **Lights**: ${state.lights.brightness}% brightness`;
          if (state.lights.devices.length > 0) {
            const onCount = state.lights.devices.filter((d) => d.state === 'on').length;
            response += ` (${onCount}/${state.lights.devices.length} on)`;
          }
          response += '\n';
        } else {
          response += `💡 **Lights**: Not connected\n`;
        }

        // Temperature status
        if (state.temperature.connected) {
          response += `🌡️ **Temperature**: Currently ${state.temperature.current}°F`;
          if (state.temperature.humidity) {
            response += `, ${state.temperature.humidity}% humidity`;
          }
          response += `\n   Target: ${state.temperature.target}°F (${state.temperature.mode} mode)`;
        } else {
          response += `🌡️ **Temperature**: Not connected`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// QUICK VIBE ADJUSTMENTS
// ============================================================================

const adjustLightsDef: ToolDefinition = {
  id: 'adjustLights',
  name: 'Adjust Lights',
  description: 'Quickly adjust light brightness or turn lights on/off.',
  domain: 'smart-home',
  tags: ['lights', 'brightness', 'ambiance'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('adjustLights') ||
        'Adjust lights - change brightness or turn on/off. Use for "dim the lights", "brighten up", "turn off the lights", "set lights to 50%".',
      parameters: z.object({
        action: z
          .enum(['on', 'off', 'dim', 'brighten', 'set'])
          .describe(
            'What to do: on, off, dim (reduce by 25%), brighten (increase by 25%), or set to specific level'
          ),
        brightness: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('Brightness level 0-100 (only for "set" action)'),
      }),
      execute: async ({ action, brightness }) => {
        log.info({ userId: ctx.userId, action, brightness }, 'Adjusting lights');

        const state = await getVibeState(ctx.userId);

        if (!state.lights.connected) {
          return "You don't have any smart lights connected. You can connect them in Settings.";
        }

        // Import the setLights function
        const { setLights } = await import('../../../services/vibe/index.js');

        let newBrightness: number;
        switch (action) {
          case 'on':
            newBrightness = 100;
            break;
          case 'off':
            newBrightness = 0;
            break;
          case 'dim':
            newBrightness = Math.max(0, state.lights.brightness - 25);
            break;
          case 'brighten':
            newBrightness = Math.min(100, state.lights.brightness + 25);
            break;
          case 'set':
            newBrightness = brightness ?? 50;
            break;
          default:
            newBrightness = 50;
        }

        const result = await setLights(newBrightness);

        if (!result.success) {
          return `Couldn't adjust the lights. ${result.message}`;
        }

        if (newBrightness === 0) {
          return '💡 Lights are off.';
        } else if (newBrightness === 100) {
          return '💡 Lights are on at full brightness.';
        } else {
          return `💡 Lights set to ${newBrightness}%.`;
        }
      },
    });
  },
};

// ============================================================================
// LIST AVAILABLE VIBES
// ============================================================================

const listVibesDef: ToolDefinition = {
  id: 'listVibes',
  name: 'List Available Vibes',
  description: 'List all available vibe presets.',
  domain: 'smart-home',
  tags: ['vibe', 'presets', 'list'],

  create: (_ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('listVibes') ||
        'List available vibe presets. Use when user asks "what vibes do you have?", "what can you set up?", "show me the mood options".',
      parameters: z.object({}),
      execute: async () => {
        const presets = getAvailablePresets();

        let response = '**Available Vibes**\n\n';
        response += 'Just say "set the vibe to [name]" to activate:\n\n';

        for (const preset of presets) {
          const icons = [];
          if (preset.music) icons.push('🎵');
          if (preset.lights) icons.push('💡');
          if (preset.temperature) icons.push('🌡️');

          response += `• **${preset.name}** ${icons.join('')}\n`;
          response += `  _${preset.description}_\n\n`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const vibeTools: ToolDefinition[] = [
  setVibeDef,
  getEnvironmentStatusDef,
  adjustLightsDef,
  listVibesDef,
];

export default vibeTools;
