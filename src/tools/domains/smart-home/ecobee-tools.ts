/**
 * Ecobee Thermostat Voice Tools
 *
 * Voice tools for controlling Ecobee thermostats:
 * - Get current temperature and status
 * - Set temperature
 * - Set climate mode (home/away/sleep)
 * - Control HVAC mode
 * - Get sensor readings
 *
 * TOOLS:
 *   - getThermostatStatus: "What's the temperature?"
 *   - setTemperature: "Set it to 72 degrees"
 *   - setClimateMode: "Set to away mode" / "I'm home"
 *   - setHvacMode: "Turn on the AC" / "Turn off the heat"
 *   - getSensorReadings: "How warm is the bedroom?"
 *   - resumeThermostatSchedule: "Resume normal schedule"
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  getThermostatStatus,
  setTemperature,
  setClimateMode,
  setHvacMode,
  getSensorReadings,
  getSensorByName,
  resumeSchedule,
} from '../../../services/identity/ecobee-api.js';
import { isEcobeeConfigured } from '../../../services/identity/ecobee-auth.js';

const log = createLogger({ module: 'ecobee-tools' });

// ============================================================================
// GET THERMOSTAT STATUS
// ============================================================================

const getThermostatStatusDef: ToolDefinition = {
  id: 'getThermostatStatus',
  name: 'Get Thermostat Status',
  description: 'Get current temperature, target temperature, and thermostat mode.',
  domain: 'smart-home',
  tags: ['ecobee', 'thermostat', 'temperature', 'status'],
  requiredServices: ['ecobee'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('getThermostatStatus') ||
        'Get the current temperature, humidity, target temperature, and thermostat status. Use when user asks about temperature or thermostat.',
      parameters: z.object({
        thermostatName: z
          .string()
          .optional()
          .describe('Name of the thermostat (optional if only one)'),
      }),
      execute: async ({ thermostatName }) => {
        log.info({ userId: ctx.userId, thermostatName }, 'Getting thermostat status');

        // Check if configured
        const configured = await isEcobeeConfigured(ctx.userId);
        if (!configured) {
          return "You haven't connected your thermostat yet. You can connect it in Settings.";
        }

        const result = await getThermostatStatus(ctx.userId, thermostatName);

        if (!result.success || !result.data) {
          return result.error || "Couldn't get thermostat status.";
        }

        const status = result.data;
        let response = `It's currently ${status.currentTemp}°F`;

        if (status.humidity) {
          response += ` with ${status.humidity}% humidity`;
        }

        response += '. ';

        // Add mode info
        if (status.mode === 'off') {
          response += 'The thermostat is off.';
        } else if (status.mode === 'heat') {
          response += `Heat is set to ${status.targetHeat}°F.`;
        } else if (status.mode === 'cool') {
          response += `Cooling is set to ${status.targetCool}°F.`;
        } else if (status.mode === 'auto') {
          response += `In auto mode, heating to ${status.targetHeat}°F and cooling to ${status.targetCool}°F.`;
        }

        // Add current event if any
        if (status.currentEvent) {
          response += ` Currently in ${status.currentEvent}.`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// SET TEMPERATURE
// ============================================================================

const setTemperatureDef: ToolDefinition = {
  id: 'setThermostatTemperature',
  name: 'Set Temperature',
  description: 'Set the thermostat to a specific temperature.',
  domain: 'smart-home',
  tags: ['ecobee', 'thermostat', 'temperature', 'control'],
  requiredServices: ['ecobee'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('setThermostatTemperature') ||
        'Set the thermostat to a specific temperature. Can set heat, cool, or both. Use when user says "set it to X degrees".',
      parameters: z.object({
        temperature: z
          .number()
          .min(45)
          .max(92)
          .describe('Target temperature in Fahrenheit (45-92)'),
        type: z
          .enum(['heat', 'cool', 'auto'])
          .optional()
          .describe('Type of temperature to set (defaults to current mode)'),
        holdType: z
          .enum(['nextTransition', 'indefinite', 'hours'])
          .optional()
          .describe(
            'How long to hold: until next schedule change, indefinitely, or for specific hours'
          ),
        holdHours: z
          .number()
          .min(1)
          .max(24)
          .optional()
          .describe('Hours to hold if holdType is "hours"'),
      }),
      execute: async ({ temperature, type, holdType = 'nextTransition', holdHours }) => {
        log.info({ userId: ctx.userId, temperature, type, holdType }, 'Setting temperature');

        const configured = await isEcobeeConfigured(ctx.userId);
        if (!configured) {
          return "You haven't connected your thermostat yet. Connect it in Settings.";
        }

        // Determine heat vs cool temp
        const params: Parameters<typeof setTemperature>[1] = {
          holdType: holdType === 'hours' ? 'holdHours' : holdType,
          holdHours,
        };

        if (type === 'heat' || !type) {
          params.heatHoldTemp = temperature;
        }
        if (type === 'cool') {
          params.coolHoldTemp = temperature;
        }
        if (type === 'auto') {
          params.heatHoldTemp = temperature - 2; // Slight buffer
          params.coolHoldTemp = temperature + 2;
        }

        const result = await setTemperature(ctx.userId, params);

        if (!result.success) {
          return result.error || "Couldn't set the temperature.";
        }

        let response = `Done! Set to ${temperature}°F`;

        if (holdType === 'indefinite') {
          response += ' until you change it';
        } else if (holdType === 'hours' && holdHours) {
          response += ` for ${holdHours} hour${holdHours > 1 ? 's' : ''}`;
        } else {
          response += ' until the next scheduled change';
        }

        response += '.';

        return response;
      },
    });
  },
};

// ============================================================================
// SET CLIMATE MODE
// ============================================================================

const setClimateModeDef: ToolDefinition = {
  id: 'setClimateMode',
  name: 'Set Climate Mode',
  description: 'Set the thermostat to home, away, or sleep mode.',
  domain: 'smart-home',
  tags: ['ecobee', 'thermostat', 'climate', 'mode'],
  requiredServices: ['ecobee'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('setClimateMode') ||
        'Set thermostat to home, away, or sleep mode. Use when user says "I\'m home", "set to away mode", or "set to sleep mode".',
      parameters: z.object({
        mode: z.enum(['home', 'away', 'sleep']).describe('Climate mode to set'),
        holdType: z
          .enum(['nextTransition', 'indefinite', 'hours'])
          .optional()
          .describe('How long to hold this mode'),
        holdHours: z
          .number()
          .min(1)
          .max(24)
          .optional()
          .describe('Hours to hold if holdType is "hours"'),
      }),
      execute: async ({ mode, holdType = 'nextTransition', holdHours }) => {
        log.info({ userId: ctx.userId, mode, holdType }, 'Setting climate mode');

        const configured = await isEcobeeConfigured(ctx.userId);
        if (!configured) {
          return 'Connect your thermostat in Settings first.';
        }

        const result = await setClimateMode(ctx.userId, {
          climate: mode,
          holdType: holdType === 'hours' ? 'holdHours' : holdType,
          holdHours,
        });

        if (!result.success) {
          return result.error || `Couldn't set to ${mode} mode.`;
        }

        const modeMessages: Record<typeof mode, string> = {
          home: "Welcome home! I've set the thermostat to home mode.",
          away: 'Set to away mode. Your home will be at a comfortable temperature when you get back.',
          sleep: 'Set to sleep mode. Sweet dreams!',
        };

        return modeMessages[mode];
      },
    });
  },
};

// ============================================================================
// SET HVAC MODE
// ============================================================================

const setHvacModeDef: ToolDefinition = {
  id: 'setHvacMode',
  name: 'Set HVAC Mode',
  description: 'Turn heating, cooling, or auto mode on or off.',
  domain: 'smart-home',
  tags: ['ecobee', 'thermostat', 'hvac', 'control'],
  requiredServices: ['ecobee'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('setHvacMode') ||
        'Turn on/off heating, cooling, or set to auto mode. Use for "turn on the AC", "turn on the heat", "turn off the thermostat".',
      parameters: z.object({
        mode: z
          .enum(['heat', 'cool', 'auto', 'off'])
          .describe('HVAC mode: heat, cool, auto, or off'),
      }),
      execute: async ({ mode }) => {
        log.info({ userId: ctx.userId, mode }, 'Setting HVAC mode');

        const configured = await isEcobeeConfigured(ctx.userId);
        if (!configured) {
          return 'Connect your thermostat in Settings first.';
        }

        const result = await setHvacMode(ctx.userId, mode);

        if (!result.success) {
          return result.error || `Couldn't set to ${mode} mode.`;
        }

        const modeMessages: Record<typeof mode, string> = {
          heat: 'Heating is now on.',
          cool: 'Cooling is now on.',
          auto: "Set to auto mode. I'll heat or cool as needed.",
          off: 'Thermostat is now off. Let me know when you want it back on.',
        };

        return modeMessages[mode];
      },
    });
  },
};

// ============================================================================
// GET SENSOR READINGS
// ============================================================================

const getSensorReadingsDef: ToolDefinition = {
  id: 'getSensorReadings',
  name: 'Get Sensor Readings',
  description: 'Get temperature readings from remote sensors.',
  domain: 'smart-home',
  tags: ['ecobee', 'sensors', 'temperature', 'rooms'],
  requiredServices: ['ecobee'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('getSensorReadings') ||
        'Get temperature from remote sensors in different rooms. Use for "how warm is the bedroom?" or "what\'s the temperature in the office?".',
      parameters: z.object({
        sensorName: z
          .string()
          .optional()
          .describe('Name of specific sensor (e.g., "bedroom", "office"). Omit for all sensors.'),
      }),
      execute: async ({ sensorName }) => {
        log.info({ userId: ctx.userId, sensorName }, 'Getting sensor readings');

        const configured = await isEcobeeConfigured(ctx.userId);
        if (!configured) {
          return 'Connect your thermostat in Settings first.';
        }

        if (sensorName) {
          // Get specific sensor
          const result = await getSensorByName(ctx.userId, sensorName);

          if (!result.success || !result.data) {
            return result.error || `Couldn't find the ${sensorName} sensor.`;
          }

          const sensor = result.data;
          let response = `The ${sensor.name} is at ${sensor.temperature}°F`;

          if (sensor.humidity !== undefined) {
            response += ` with ${sensor.humidity}% humidity`;
          }

          if (sensor.occupied !== undefined) {
            response += sensor.occupied ? ' and someone is there' : " and it's empty";
          }

          return response + '.';
        } else {
          // Get all sensors
          const result = await getSensorReadings(ctx.userId);

          if (!result.success || !result.data) {
            return result.error || "Couldn't get sensor readings.";
          }

          if (result.data.length === 0) {
            return "You don't have any remote sensors set up.";
          }

          const readings = result.data.map((s) => {
            let line = `${s.name}: ${s.temperature}°F`;
            if (s.occupied) line += ' (occupied)';
            return line;
          });

          return `Here are your sensor readings:\n${readings.join('\n')}`;
        }
      },
    });
  },
};

// ============================================================================
// RESUME SCHEDULE
// ============================================================================

const resumeScheduleDef: ToolDefinition = {
  id: 'resumeThermostatSchedule',
  name: 'Resume Thermostat Schedule',
  description: 'Cancel any temperature holds and resume normal schedule.',
  domain: 'smart-home',
  tags: ['ecobee', 'thermostat', 'schedule'],
  requiredServices: ['ecobee'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        getToolDescription('resumeThermostatSchedule') ||
        'Cancel temperature holds and resume normal schedule. Use for "resume schedule", "cancel the hold", "go back to normal".',
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Resuming thermostat schedule');

        const configured = await isEcobeeConfigured(ctx.userId);
        if (!configured) {
          return 'Connect your thermostat in Settings first.';
        }

        const result = await resumeSchedule(ctx.userId);

        if (!result.success) {
          return result.error || "Couldn't resume the schedule.";
        }

        return 'Done! Your thermostat is back on its regular schedule.';
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const ecobeeTools: ToolDefinition[] = [
  getThermostatStatusDef,
  setTemperatureDef,
  setClimateModeDef,
  setHvacModeDef,
  getSensorReadingsDef,
  resumeScheduleDef,
];

export default ecobeeTools;
