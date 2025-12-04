/**
 * Tools Module - Clean Architecture
 *
 * Organized collection of all LLM tools for the Voice AI Agent.
 *
 * Architecture:
 *   registry/         - Domain-based tool registry system (PREFERRED)
 *   builder.ts        - Build tools for agents from manifests
 *   utils/            - Shared utilities (generateId, getUserId, formatters)
 *   lifecycle.ts      - Initialization and shutdown
 *   categories.ts     - Tool categorization and documentation
 *   domains/          - Domain-specific tool collections
 *
 * RECOMMENDED USAGE:
 *   // For agents - use manifest-driven tool building
 *   import { buildAgentTools } from './tools/index.js';
 *   const tools = await buildAgentTools('maya-santos');
 *
 *   // For utilities in tool implementations
 *   import { getUserId, generateId, formatCurrency } from './tools/utils/index.js';
 *
 * MIGRATION STATUS:
 *   - Registry system: Active (preferred)
 *   - Legacy create*Tools(): Deprecated, use buildAgentTools() instead
 *   - Persona aliases (createMayaTools, etc.): Deprecated
 *
 * See docs/TOOL_MIGRATION.md for migration guide.
 */

// ============================================================================
// NEW: TOOL REGISTRY SYSTEM
// ============================================================================

export {
  // Registry
  toolRegistry,
  ToolRegistry,
  registerTool,
  registerTools,
  getTool,
  buildToolSet,

  // Types
  type ToolDefinition,
  type ToolDomain,
  type ToolCategory,
  type ToolContext,
  type ToolSetSpec,
  type ToolSetResult,
  type ToolMetadata,
  type Tool,
  ALL_TOOL_DOMAINS,
  DOMAIN_TO_CATEGORY,
  EmptyServiceRegistry,
} from './registry/index.js';

export {
  initializeToolRegistry,
  loadToolDomain,
  registerDomainLoader,
  convertLegacyTools,
  registerLegacyTools,
  createDomainExport,
} from './registry/loader.js';

// ============================================================================
// NEW: AGENT TOOL BUILDER
// ============================================================================

export {
  buildAgentTools,
  buildToolsForDomains,
  buildAllTeamTools,
  buildEssentialTools,
  agentHasTool,
  getAvailableToolsForAgent,
  getDefaultDomainsForRole,
  type BuildToolsOptions,
} from './builder.js';

// ============================================================================
// LEGACY COMPATIBILITY SHIM
// These functions exist for backward compatibility with tests
// ============================================================================

/**
 * @deprecated Use buildAllTeamTools() or buildAgentTools() instead.
 * This is a synchronous compatibility shim that returns an empty object.
 * For tests, use the async buildAllTeamTools() function.
 */
export function createAllTools(): Record<string, unknown> {
  console.warn(
    '[DEPRECATED] createAllTools() is deprecated. Use buildAllTeamTools() for async tool building.'
  );
  // Return empty object - tests should use buildAllTeamTools
  return {};
}

// ============================================================================
// LIFECYCLE FUNCTIONS
// ============================================================================

export {
  initializeTools,
  initializeTeamHandlers,
  isToolRegistryInitialized,
  isTeamHandlerRegistryInitialized,
  shutdownTools,
} from './lifecycle.js';

// ============================================================================
// TEAM HANDLER REGISTRY (NEW)
// ============================================================================

export {
  teamHandlerRegistry,
  TeamHandlerRegistry,
  registerTeamHandler,
  routeTeamRequest,
  type TeamHandlerDefinition,
  type TeamHandlerFunction,
  type HandlerCapability,
  type AgentHandlerConfig,
  type SharedContext,
  type AgentNotification,
  ALL_HANDLER_CAPABILITIES,
} from '../services/team-handler-registry/index.js';

export {
  initializeTeamHandlerRegistry,
  loadLegacyHandlers,
  loadHandlersFromManifests,
  wrapLegacyHandler,
} from '../services/team-handler-registry/loader.js';

// ============================================================================
// CATEGORIES & DOCUMENTATION
// ============================================================================

export { getToolCategories, getToolDocumentation } from './categories.js';

// ============================================================================
// NOTE: Consolidated tools have been removed
// Use domain-based tools instead (domains/finance/, domains/memory/, etc.)
// ============================================================================

// ============================================================================
// FINANCIAL DOMAIN
// ============================================================================

export { createMarketDataTools } from './market-data.js';
export { createEconomicTools } from './economic.js';
export { createCalculatorTools } from './calculators.js';
export { createPersonalFinanceTools } from './personal-finance.js';

// ============================================================================
// INFORMATION DOMAIN
// ============================================================================

export { createNewsTools } from './news.js';
export { createSportsTools } from './sports.js';
export { createWeatherTools } from './weather.js';
export { createSearchTools } from './search.js';
export { createWisdomTools } from './wisdom.js';

// ============================================================================
// HUMAN CONNECTION DOMAIN
// ============================================================================

export { createLifeEventsTools } from './life-events.js';
export { createWellnessTools } from './wellness.js';
export { createSmallTalkTools } from './small-talk.js';

// ============================================================================
// CONVERSATION DOMAIN
// ============================================================================

export { createConversationTools } from './conversation.js';
export { createMemoryTools } from './memory-tools.js';
export { createProactiveTools } from './proactive.js';
export { createAwarenessTools } from './awareness.js';
export { createBackgroundTools } from './background-tools.js';

// ============================================================================
// SHARED UTILITIES
// ============================================================================

export {
  // User context
  getUserId,
  getUserName,
  getUserData,
  type ToolExecutionContext,

  // ID generation
  generateId,
  generateUUID,

  // Formatting
  formatCurrency,
  formatPercent,
  ordinal,
  formatDate,
  formatRelativeTime,

  // Progress
  calculateProgress,
  progressBar,

  // Response
  createResponse,
  formatWithEmoji,
  bulletList,
  numberedList,
  type ToolResponse,

  // Strings
  truncate,
  titleCase,
  camelToTitle,

  // Validation
  isNonEmptyString,
  isPositiveNumber,

  // Logger
  getLogger,
} from './utils/index.js';

// ============================================================================
// COMMUNICATION DOMAIN (Low-level services)
// ============================================================================

// Low-level email/SMS functions (use createCommunicationTools for full tools)
export {
  sendEmail,
  sendSMS,
  sendPortfolioSummary,
  createCommunicationTools as createBaseCommunicationTools,
} from './communication.js';

// ============================================================================
// BANKING DOMAIN (PLAID)
// ============================================================================

export { createPlaidTools } from './plaid.js';
export {
  storeAccessToken,
  getStoredAccessToken,
  hasLinkedAccounts,
  getTokenData,
  removeAccessToken,
} from './plaid-store.js';

// ============================================================================
// AGENT DOMAIN
// ============================================================================

export { createHandoffTools } from './handoff/index.js';
export { createTelephonyTools } from './telephony.js';
export { createResearchTools, createResearchTools as createPeterLynchTools } from './research-tools.js';
export { createInsightsAnalysisTools, createInsightsAnalysisTools as createPeterInsightsTools } from './insights-analysis.js';

// ============================================================================
// ENTERTAINMENT DOMAIN
// ============================================================================

export { createSpotifyTools } from './spotify.js';

// ============================================================================
// DOMAIN-SPECIFIC TOOLS (Agent-Agnostic)
// ============================================================================

// Communication tools (full-featured with coaching)
export {
  createCommunicationTools,
  createCommunicationCoachingTools,
} from './communication-tools.js';

// Scheduling tools
export {
  createAppointmentTools,
  createDeliveryTools,
  createPlacesTools,
  createContactsTools,
} from './scheduling.js';

// Financial & Habit tools
export { createFinancialHabitsTools } from './financial-habits.js';
export { createHabitCoachingTools, LIFE_DOMAINS, LIFE_STAGES, HABIT_TEMPLATES } from './habit-coaching.js';
export { createProactiveCoachingTools } from './proactive-coaching.js';

// Gamification - V2 is the preferred version (uses Firestore)
// Note: BADGE_DEFINITIONS and TITLE_PROGRESSION are in gamification.ts (shared constants)
export { createGamificationToolsV2 } from './gamification-v2.js';
export { BADGE_DEFINITIONS, TITLE_PROGRESSION } from './gamification.js';

// Notification tools
export { createNotificationTools } from './notifications.js';

// Event planning tools
export { createEventPlanningTools } from './event-planning.js';

// ============================================================================
// DEPRECATED: Persona-specific aliases
// Use the generic names above instead. These will be removed in a future version.
// ============================================================================

/** @deprecated Use createCommunicationTools instead */
export { createCommunicationTools as createAlexTools } from './communication-tools.js';
/** @deprecated Use createCommunicationCoachingTools instead */
export { createCommunicationCoachingTools as createAlexCoachingTools } from './communication-tools.js';
/** @deprecated Use createAppointmentTools instead */
export { createAppointmentTools as createAlexAppointmentTools } from './scheduling.js';
/** @deprecated Use createDeliveryTools instead */
export { createDeliveryTools as createAlexDeliveryTools } from './scheduling.js';
/** @deprecated Use createPlacesTools instead */
export { createPlacesTools as createAlexPlacesTools } from './scheduling.js';
/** @deprecated Use createContactsTools instead */
export { createContactsTools as createAlexContactsTools } from './scheduling.js';
/** @deprecated Use createFinancialHabitsTools instead */
export { createFinancialHabitsTools as createMayaTools } from './financial-habits.js';
/** @deprecated Use createHabitCoachingTools instead */
export { createHabitCoachingTools as createMayaHabitCoachTools } from './habit-coaching.js';
/** @deprecated Use createProactiveCoachingTools instead */
export { createProactiveCoachingTools as createMayaProactiveTools } from './proactive-coaching.js';
/** @deprecated Use createGamificationToolsV2 instead (gamification v1 is deprecated) */
export { createGamificationTools, createGamificationTools as createMayaGamificationTools } from './gamification.js';
/** @deprecated Use createGamificationToolsV2 instead */
export { createGamificationToolsV2 as createMayaGamificationToolsV2 } from './gamification-v2.js';
/** @deprecated Use createNotificationTools instead */
export { createNotificationTools as createMayaNotificationTools } from './notifications.js';
/** @deprecated Use createEventPlanningTools instead */
export { createEventPlanningTools as createJordanTools } from './event-planning.js';

// Persona memory tools
export {
  createFerniMemoryTools,
  createBogleMemoryTools,
  createPeterMemoryTools,
  createMayaMemoryTools,
  createJordanMemoryTools,
  createAlexMemoryTools,
} from './persona-memory-tools.js';

// ============================================================================
// TEAM HANDLERS (Migrated to team-handler-registry)
// ============================================================================

// NOTE: Legacy team handlers have been migrated to the team-handler-registry system.
// See: src/services/team-handler-registry/
//
// For the new system, use:
//   import { teamHandlerRegistry, registerTeamHandler } from '../services/team-handler-registry/index.js';
//
// The following exports are no longer available:
// - registerMayaTeamHandlers, unregisterMayaTeamHandlers
// - registerAlexTeamHandlers, unregisterAlexTeamHandlers
// - registerJordanTeamHandlers, unregisterJordanTeamHandlers
// - registerPeterTeamHandlers, unregisterPeterTeamHandlers
// - registerFerniTeamHandlers, unregisterFerniTeamHandlers
// - notifyPeterCalendarContext, notifyPeterSpendingContext, etc.

// ============================================================================
// JACK MENTOR INTEGRATION
// ============================================================================
// JORDAN'S LIFE'S FIRSTS ENHANCEMENT
// ============================================================================

export { createLifeFirstsTools } from './life-firsts-tracker.js';
export { createCulturalCelebrationTools } from './cultural-celebrations.js';
export { createFirstTimePlanningTools } from './first-time-planning.js';
export { createGiftRegistryTools } from './gift-registry.js';
export { createMilestoneProactiveTools } from './milestone-proactive.js';
export { createRetirementPlanningTools } from './retirement-planning.js';
export { createGoalManagementTools } from './goal-management.js';
export { createTeamIntegrationTools } from './team-integration.js';

// ============================================================================
// DAILY PRODUCTIVITY DOMAIN
// ============================================================================

export { createTaskTools } from './tasks.js';
export { createBillTools } from './bills.js';
export { createRoutineTools } from './routines.js';
export { createNotesTools } from './notes.js';
export { createHabitTools } from './habits.js';
export { createShoppingTools } from './shopping.js';
export { createMedicationTools } from './medications.js';
export { createDailyBriefingTools } from './daily-briefing.js';
export { createPackageTools } from './packages.js';
export { createTravelTools } from './travel.js';

// ============================================================================
// TOOL ORCHESTRATION (Human-Level Conversation)
// ============================================================================

export {
  // Composer
  ToolComposer,
  createToolComposer,
  composeToolResult,
  TOOL_CHAINS,

  // Conversation state
  getConversationState,
  hasConversationState,
  endConversation,
  getActiveSessionIds,
  cleanupStaleConversations,
  ConversationStateManager,

  // Quick helpers
  getNextToolSuggestions,
  checkShouldWrapUp,
  getSessionEmotionalContext,

  // Types
  type ComposedResult,
  type ToolChain,
  type ComposeOptions,
  type ConversationState,
  type EmotionalContext,
  type TopicContext,
  type FlowContext,
  type UserContext,
} from './orchestration/index.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import { getToolCategories, getToolDocumentation } from './categories.js';
import { initializeTeamHandlers, shutdownTools } from './lifecycle.js';
import { toolRegistry } from './registry/index.js';
import { initializeToolRegistry } from './registry/loader.js';
import { buildAgentTools, buildToolsForDomains, buildEssentialTools, buildAllTeamTools } from './builder.js';
import { createToolComposer, composeToolResult } from './orchestration/index.js';
import { getConversationState, cleanupStaleConversations } from './orchestration/index.js';

export default {
  // Registry-based system
  toolRegistry,
  initializeToolRegistry,
  buildAgentTools,
  buildToolsForDomains,
  buildEssentialTools,
  buildAllTeamTools,

  // Orchestration (human-level conversation)
  createToolComposer,
  composeToolResult,
  getConversationState,
  cleanupStaleConversations,

  // Utilities
  getToolCategories,
  getToolDocumentation,
  initializeTeamHandlers,
  shutdownTools,
};
