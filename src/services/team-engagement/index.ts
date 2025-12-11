/**
 * Team Engagement Module
 *
 * Re-exports all team engagement types, data, and utilities.
 *
 * @module team-engagement
 */

// Types
export * from './types.js';

// Static Data
export { CROSS_PERSONA_REFERENCES, HANDOFF_BANTER, getHandoffBanter } from './banter.js';
export { PERSONA_EVOLUTION_STORIES } from './evolution-stories.js';

// Main service is in the parent directory for backward compatibility
// Import via: import { getTeamEngagement } from '../services/team-engagement.js';
