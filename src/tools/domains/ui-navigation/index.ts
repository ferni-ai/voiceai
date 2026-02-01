/**
 * UI Navigation Domain Tools
 *
 * Voice-activated navigation for opening panels and dashboards.
 * Enables users to say "show me X" to navigate the app.
 *
 * @module tools/domains/ui-navigation
 */

import { createDomainExport } from '../../registry/loader.js';
import { navigationToolDefinitions } from './navigation-tools.js';

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'ui-navigation',
  navigationToolDefinitions
);

export { navigationToolDefinitions } from './navigation-tools.js';
