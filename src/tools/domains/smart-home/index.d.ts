/**
 * Smart Home Domain Tools
 *
 * Unified smart home control with support for multiple platforms:
 * - Home Assistant
 * - Philips Hue
 * - LIFX
 * - Ecobee
 *
 * DOMAIN: home
 */
import type { ToolDefinition } from '../../registry/types.js';
import { getAllDevices, controlDevice, activateScene } from './smart-home.js';
export { getAllDevices, controlDevice, activateScene };
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map