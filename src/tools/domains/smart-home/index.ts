/**
 * Smart Home Domain Tools
 *
 * Control smart home devices via Home Assistant integration.
 *
 * Features:
 * - Light control (on/off, brightness, color)
 * - Thermostat control
 * - Scene activation
 * - Lock control
 * - Home status queries
 */

import { createDomainExport } from '../../registry/loader.js';
import { homeAssistantTools } from './home-assistant-tools.js';

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'smart-home',
  homeAssistantTools
);

export default getToolDefinitions;
