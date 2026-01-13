/**
 * Team Handler Registry Exports
 *
 * System for routing requests between team members (agents).
 */
// ============================================================================
// TEAM HANDLER REGISTRY
// ============================================================================
export { ALL_HANDLER_CAPABILITIES, TeamHandlerRegistry, registerTeamHandler, routeTeamRequest, teamHandlerRegistry, } from '../../services/team-handler-registry/index.js';
export { initializeTeamHandlerRegistry, loadHandlersFromManifests, loadLegacyHandlers, wrapLegacyHandler, } from '../../services/team-handler-registry/loader.js';
//# sourceMappingURL=team-handlers.js.map