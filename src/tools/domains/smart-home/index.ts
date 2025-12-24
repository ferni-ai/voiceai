/**
 * Smart Home Domain Tools
 *
 * Control smart home devices via various integrations:
 * - Home Assistant: Lights, locks, scenes
 * - Ecobee: Thermostat control
 *
 * Features:
 * - Light control (on/off, brightness, color)
 * - Thermostat control (temperature, climate modes)
 * - Scene activation
 * - Lock control
 * - Home status queries
 * - Sensor readings
 */

import { createDomainExport } from '../../registry/loader.js';
import { homeAssistantTools } from './home-assistant-tools.js';
import { ecobeeTools } from './ecobee-tools.js';

const smartHomeTools = [...homeAssistantTools, ...ecobeeTools];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'smart-home',
  smartHomeTools
);

export default getToolDefinitions;
