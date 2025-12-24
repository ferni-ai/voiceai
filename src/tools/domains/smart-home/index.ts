/**
 * Smart Home Domain Tools
 *
 * Control smart home devices via various integrations:
 * - Home Assistant: Lights, locks, scenes
 * - Ecobee: Thermostat control
 * - Generic: Hue, LIFX, SmartThings (via smart-home.ts)
 *
 * Features:
 * - Light control (on/off, brightness, color)
 * - Thermostat control (temperature, climate modes)
 * - Scene activation
 * - Lock control
 * - Home status queries
 * - Sensor readings
 *
 * Architecture:
 * - home-assistant-tools.ts: Home Assistant specific integrations
 * - ecobee-tools.ts: Ecobee thermostat integrations
 * - smart-home.ts: Generic/unified control for Hue, LIFX, SmartThings
 *   (Use this for users without Home Assistant)
 */

import { createDomainExport } from '../../registry/loader.js';
import { homeAssistantTools } from './home-assistant-tools.js';
import { ecobeeTools } from './ecobee-tools.js';

// Note: smart-home.ts provides generic control for Hue/LIFX/SmartThings
// It's available via createSmartHomeTools() for non-HA setups
// See HEALTH-HOME-WELLNESS-AUDIT.md for architecture details

const smartHomeTools = [...homeAssistantTools, ...ecobeeTools];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'smart-home',
  smartHomeTools
);

// Re-export generic smart home utilities for non-HA setups
export {
  createSmartHomeTools,
  getAllDevices,
  controlDevice,
  activateScene,
} from './smart-home.js';

export default getToolDefinitions;
