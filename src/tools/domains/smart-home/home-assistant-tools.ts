/**
 * Home Assistant Smart Home Tools
 *
 * Control smart home devices via Home Assistant.
 * Supports lights, switches, thermostats, locks, scenes, and more.
 * Falls back gracefully when Home Assistant is not configured.
 *
 * Requirements:
 * - Home Assistant instance running
 * - HOME_ASSISTANT_URL env var (e.g., http://homeassistant.local:8123)
 * - HOME_ASSISTANT_TOKEN env var (long-lived access token)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

const log = getLogger();

// Lazy import to avoid startup errors when not configured
async function getHomeAssistantService() {
  try {
    const service = await import('../../../services/smart-home/home-assistant.js');
    return service;
  } catch (error) {
    log.debug({ error: String(error) }, 'Home Assistant service not available');
    return null;
  }
}

export const homeAssistantTools: ToolDefinition[] = [
  {
    id: 'controlLight',
    name: 'Control Light',
    description: 'Turn lights on/off, adjust brightness, or change color via Home Assistant',
    domain: 'smart-home',
    tags: ['smart-home', 'lights', 'home-assistant'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('controlLight'),
        parameters: z.object({
          lightName: z.string().describe('Name of the light (e.g., "bedroom", "living room")'),
          action: z.enum(['on', 'off', 'toggle']).describe('What to do with the light'),
          brightness: z.number().optional().describe('Brightness level 0-100'),
        }),
        execute: async ({ lightName, action, brightness }) => {
          log.info({ lightName, action, brightness }, '🏠 Light control requested');

          const ha = await getHomeAssistantService();
          if (!ha) {
            return "Smart home control isn't set up yet. You'll need Home Assistant running.";
          }

          if (!ha.isHomeAssistantConfigured()) {
            return "Home Assistant isn't configured. Set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN.";
          }

          try {
            // Find matching lights
            const lights = await ha.findEntitiesByName(lightName, 'light');

            if (lights.length === 0) {
              return `I couldn't find a light named "${lightName}". Try saying the exact name from your Home Assistant.`;
            }

            const light = lights[0];
            let result: string;

            switch (action) {
              case 'on':
                result = await ha.turnOnLight(light.entity_id, brightness);
                break;
              case 'off':
                result = await ha.turnOffLight(light.entity_id);
                break;
              case 'toggle':
                result = await ha.toggleLight(light.entity_id);
                break;
            }

            return result;
          } catch (error) {
            log.error({ lightName, action, error: String(error) }, '🏠 Light control failed');
            return `I had trouble controlling the ${lightName} light. Is Home Assistant running?`;
          }
        },
      }),
  },

  {
    id: 'setThermostat',
    name: 'Set Thermostat',
    description: 'Adjust thermostat temperature or HVAC mode via Home Assistant',
    domain: 'smart-home',
    tags: ['smart-home', 'thermostat', 'temperature', 'hvac'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('setThermostat'),
        parameters: z.object({
          thermostatName: z
            .string()
            .optional()
            .describe('Name of thermostat (uses first if not specified)'),
          temperature: z.number().describe('Target temperature in Fahrenheit'),
          mode: z.enum(['heat', 'cool', 'heat_cool', 'off']).optional().describe('HVAC mode'),
        }),
        execute: async ({ thermostatName, temperature, mode }) => {
          log.info({ thermostatName, temperature, mode }, '🏠 Thermostat control requested');

          const ha = await getHomeAssistantService();
          if (!ha || !ha.isHomeAssistantConfigured()) {
            return "Smart home control isn't set up. You'll need Home Assistant running.";
          }

          try {
            // Find thermostat
            const thermostats = await ha.findEntitiesByName(thermostatName || '', 'climate');

            if (thermostats.length === 0) {
              return "I couldn't find any thermostats in your Home Assistant.";
            }

            const thermostat = thermostats[0];
            return await ha.setThermostat(thermostat.entity_id, temperature, mode);
          } catch (error) {
            log.error({ thermostatName, error: String(error) }, '🏠 Thermostat control failed');
            return 'I had trouble adjusting the thermostat. Is Home Assistant connected?';
          }
        },
      }),
  },

  {
    id: 'activateScene',
    name: 'Activate Scene',
    description: 'Activate a Home Assistant scene (e.g., "movie night", "bedtime")',
    domain: 'smart-home',
    tags: ['smart-home', 'scene', 'automation'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('activateScene'),
        parameters: z.object({
          sceneName: z.string().describe('Name of the scene to activate'),
        }),
        execute: async ({ sceneName }) => {
          log.info({ sceneName }, '🏠 Scene activation requested');

          const ha = await getHomeAssistantService();
          if (!ha || !ha.isHomeAssistantConfigured()) {
            return "Smart home control isn't set up. You'll need Home Assistant running.";
          }

          try {
            const scenes = await ha.findEntitiesByName(sceneName, 'scene');

            if (scenes.length === 0) {
              return `I couldn't find a scene called "${sceneName}". Check your Home Assistant scenes.`;
            }

            return await ha.activateScene(scenes[0].entity_id);
          } catch (error) {
            log.error({ sceneName, error: String(error) }, '🏠 Scene activation failed');
            return `I had trouble activating the ${sceneName} scene.`;
          }
        },
      }),
  },

  {
    id: 'controlLock',
    name: 'Control Lock',
    description: 'Lock or unlock smart locks via Home Assistant',
    domain: 'smart-home',
    tags: ['smart-home', 'lock', 'security'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('controlLock'),
        parameters: z.object({
          lockName: z.string().describe('Name of the lock (e.g., "front door")'),
          action: z.enum(['lock', 'unlock']).describe('Lock or unlock'),
        }),
        execute: async ({ lockName, action }) => {
          log.info({ lockName, action }, '🏠 Lock control requested');

          const ha = await getHomeAssistantService();
          if (!ha || !ha.isHomeAssistantConfigured()) {
            return "Smart home control isn't set up.";
          }

          try {
            const locks = await ha.findEntitiesByName(lockName, 'lock');

            if (locks.length === 0) {
              return `I couldn't find a lock named "${lockName}".`;
            }

            return await ha.setLock(locks[0].entity_id, action === 'lock');
          } catch (error) {
            log.error({ lockName, action, error: String(error) }, '🏠 Lock control failed');
            return `I had trouble with the ${lockName} lock.`;
          }
        },
      }),
  },

  {
    id: 'getHomeStatus',
    name: 'Get Home Status',
    description: 'Get status of a room or the whole home via Home Assistant',
    domain: 'smart-home',
    tags: ['smart-home', 'status', 'overview'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('getHomeStatus'),
        parameters: z.object({
          roomName: z.string().optional().describe('Room to check (or leave empty for whole home)'),
        }),
        execute: async ({ roomName }) => {
          log.info({ roomName }, '🏠 Home status requested');

          const ha = await getHomeAssistantService();
          if (!ha || !ha.isHomeAssistantConfigured()) {
            return "Smart home control isn't set up. You'll need Home Assistant running.";
          }

          try {
            if (roomName) {
              return await ha.getRoomStatus(roomName);
            }

            // Get overall home status
            const entities = await ha.getEntities();
            const lights = entities.filter((e) => e.entity_id.startsWith('light.'));
            const lightsOn = lights.filter((l) => l.state === 'on');
            const climate = entities.filter((e) => e.entity_id.startsWith('climate.'));
            const locks = entities.filter((e) => e.entity_id.startsWith('lock.'));
            const locksLocked = locks.filter((l) => l.state === 'locked');

            let status = `🏠 **Home Status**\n\n`;
            status += `💡 Lights: ${lightsOn.length} of ${lights.length} on\n`;

            if (climate.length > 0) {
              const thermostat = climate[0];
              const temp = thermostat.attributes?.current_temperature;
              const target = thermostat.attributes?.temperature;
              status += `🌡️ Temperature: ${temp}°F${target ? ` (set to ${target}°F)` : ''}\n`;
            }

            if (locks.length > 0) {
              status += `🔒 Locks: ${locksLocked.length} of ${locks.length} locked\n`;
            }

            return status;
          } catch (error) {
            log.error({ roomName, error: String(error) }, '🏠 Home status failed');
            return 'I had trouble checking your home status. Is Home Assistant connected?';
          }
        },
      }),
  },
];

export default homeAssistantTools;
