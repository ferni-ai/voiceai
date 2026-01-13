/**
 * Settings Domain Tools
 *
 * User preferences and settings that span across all personas.
 * Includes language preferences, theme settings, and other app configuration.
 *
 * @module tools/domains/settings
 */
import { createDomainExport } from '../../registry/loader.js';
import { languageToolDefinitions } from './language-tools.js';
import { themeToolDefinitions } from './theme-tools.js';
// Combine all settings tools
const allSettingsTools = [...languageToolDefinitions, ...themeToolDefinitions];
// Export combined tools as the domain
export const { getToolDefinitions, domain, definitions } = createDomainExport('settings', allSettingsTools);
// Also export individual tool sets for testing
export { languageToolDefinitions } from './language-tools.js';
export { themeToolDefinitions } from './theme-tools.js';
//# sourceMappingURL=index.js.map