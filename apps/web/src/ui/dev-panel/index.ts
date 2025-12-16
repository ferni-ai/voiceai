/**
 * Dev Panel Module
 *
 * Re-exports from modular dev panel structure.
 * This provides backward compatibility for imports from the old monolithic file.
 *
 * Architecture:
 * - icons.ts - SVG icons
 * - handlers/ - Action handlers (outreach, subscription, etc.)
 *
 * The main dev-panel.ui.ts still contains:
 * - Panel creation and lifecycle
 * - Event binding
 * - Styles
 * - Section templates
 *
 * @module dev-panel
 */

// Icons
export { ICONS, type IconName } from './icons.js';

// Handlers
export { handleOutreachAction } from './handlers/index.js';
