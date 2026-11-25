/**
 * Admin Module
 *
 * Centralized admin portal for Ferni platform management.
 *
 * @module Admin
 */

export { initAdminPortal, destroyAdminPortal, adminPortalState } from './AdminPortal.js';
export { ADMIN_SECTIONS, type AdminSection } from './section-registry.js';
export { openAdminPortal } from './admin-access.js';

// Admin API utilities
export {
  getAdminApiKey,
  getAdminHeaders,
  getAdminHeadersAsync,
  adminGet,
  adminPost,
} from './admin-api.js';

// Event handlers for programmatic access
export {
  toggleFlag,
  toggleAgent,
  validateAgents,
  enableAllFlags,
  disableAllFlags,
  resetFlags,
  runQuickAction,
} from './admin-events.js';
