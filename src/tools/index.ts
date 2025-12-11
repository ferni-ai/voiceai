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
  ALL_TOOL_DOMAINS,
  buildToolSet,
  DOMAIN_TO_CATEGORY,
  EmptyServiceRegistry,
  getTool,
  registerTool,
  registerTools,
  // Registry
  toolRegistry,
  ToolRegistry,
  type Tool,
  type ToolCategory,
  type ToolContext,
  // Types
  type ToolDefinition,
  type ToolDomain,
  type ToolMetadata,
  type ToolSetResult,
  type ToolSetSpec,
} from './registry/index.js';

export {
  convertLegacyTools,
  createDomainExport,
  initializeToolRegistry,
  loadToolDomain,
  registerDomainLoader,
  registerLegacyTools,
} from './registry/loader.js';

// ============================================================================
// NEW: AGENT TOOL BUILDER
// ============================================================================

export {
  agentHasTool,
  buildAgentTools,
  buildAllTeamTools,
  buildEssentialTools,
  buildToolsForDomains,
  getAvailableToolsForAgent,
  getDefaultDomainsForRole,
  type BuildToolsOptions,
} from './builder.js';

// ============================================================================
// LIFECYCLE FUNCTIONS
// ============================================================================

export {
  initializeTeamHandlers,
  initializeTools,
  isTeamHandlerRegistryInitialized,
  isToolRegistryInitialized,
  shutdownTools,
} from './lifecycle.js';

// ============================================================================
// TEAM HANDLER REGISTRY (NEW)
// ============================================================================

export {
  ALL_HANDLER_CAPABILITIES,
  registerTeamHandler,
  routeTeamRequest,
  teamHandlerRegistry,
  TeamHandlerRegistry,
  type AgentHandlerConfig,
  type AgentNotification,
  type HandlerCapability,
  type SharedContext,
  type TeamHandlerDefinition,
  type TeamHandlerFunction,
} from '../services/team-handler-registry/index.js';

export {
  initializeTeamHandlerRegistry,
  loadHandlersFromManifests,
  loadLegacyHandlers,
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

export { createCalculatorTools } from './calculators.js';
export { createEconomicTools } from './economic.js';
export { createMarketDataTools } from './market-data.js';
export { createPersonalFinanceTools } from './personal-finance.js';

// ============================================================================
// INFORMATION DOMAIN
// ============================================================================

export { createNewsTools } from './news.js';
export { createSearchTools } from './search.js';
export { createSportsTools } from './sports.js';
export { createWeatherTools } from './weather.js';
export { createWisdomTools } from './wisdom.js';

// ============================================================================
// HUMAN CONNECTION DOMAIN
// ============================================================================

export { createLifeEventsTools } from './life-events.js';
export { createSmallTalkTools } from './small-talk.js';
export { createWellnessTools } from './wellness.js';

// ============================================================================
// CONVERSATION DOMAIN
// ============================================================================

export { createAwarenessTools } from './awareness.js';
export { createBackgroundTools } from './background-tools.js';
export { createConversationTools } from './conversation.js';
export { createMemoryTools } from './memory-tools.js';
export { createProactiveTools } from './proactive.js';

// ============================================================================
// SHARED UTILITIES
// ============================================================================

export {
  bulletList,
  // Progress
  calculateProgress,
  camelToTitle,
  // Response
  createResponse,
  // Formatting
  formatCurrency,
  formatDate,
  formatPercent,
  formatRelativeTime,
  formatWithEmoji,
  // ID generation
  generateId,
  generateUUID,
  // Logger
  getLogger,
  getUserData,
  // User context
  getUserId,
  getUserName,
  // Validation
  isNonEmptyString,
  isPositiveNumber,
  numberedList,
  ordinal,
  progressBar,
  titleCase,
  // Strings
  truncate,
  type ToolExecutionContext,
  type ToolResponse,
} from './utils/index.js';

// ============================================================================
// COMMUNICATION DOMAIN (Low-level services)
// ============================================================================

// Low-level email/SMS functions
export { sendEmail, sendReminder, sendSMS } from '../services/communication-service.js';

// ============================================================================
// BANKING DOMAIN (PLAID)
// ============================================================================

export {
  getStoredAccessToken,
  getTokenData,
  hasLinkedAccounts,
  removeAccessToken,
  storeAccessToken,
} from './plaid-store.js';
export { createPlaidTools } from './plaid.js';

// ============================================================================
// AGENT DOMAIN
// ============================================================================

export {
  cameoTools,
  clearCameoSessionContext,
  createCameoTools,
  setCameoSessionContext,
} from './cameo.js';
export { createHandoffTools } from './handoff/index.js';
export { createInsightsAnalysisTools } from './insights-analysis.js';
export { createResearchTools } from './research-tools.js';
export { createTelephonyTools } from './telephony.js';

// ============================================================================
// ENTERTAINMENT DOMAIN
// ============================================================================

export { createSpotifyTools } from './spotify.js';

// ============================================================================
// DOMAIN-SPECIFIC TOOLS (Agent-Agnostic)
// ============================================================================

// Communication tools (full-featured with coaching)
export {
  createCommunicationCoachingTools,
  createCommunicationTools,
} from './communication-tools.js';

// Scheduling tools
export {
  createAppointmentTools,
  createContactsTools,
  createDeliveryTools,
  createPlacesTools,
} from './scheduling.js';

// Financial & Habit tools
export { createFinancialHabitsTools } from './financial-habits.js';
export {
  createHabitCoachingTools,
  HABIT_TEMPLATES,
  LIFE_DOMAINS,
  LIFE_STAGES,
} from './habit-coaching.js';
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
// NOTE: Persona-specific aliases have been REMOVED
// Use the generic names: createCommunicationTools, createFinancialHabitsTools, etc.
// ============================================================================

// Persona memory tools
export {
  createAlexMemoryTools,
  createBogleMemoryTools,
  createFerniMemoryTools,
  createJordanMemoryTools,
  createMayaMemoryTools,
  createMemoryManagementTools,
  createPeterMemoryTools,
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

export { createCulturalCelebrationTools } from './cultural-celebrations.js';
export { createFirstTimePlanningTools } from './first-time-planning.js';
export { createGiftRegistryTools } from './gift-registry.js';
export { createGoalManagementTools } from './goal-management.js';
export { createLifeFirstsTools } from './life-firsts-tracker.js';
export { createMilestoneProactiveTools } from './milestone-proactive.js';
export { createRetirementPlanningTools } from './retirement-planning.js';
export { createTeamIntegrationTools } from './team-integration.js';

// ============================================================================
// DAILY PRODUCTIVITY DOMAIN
// ============================================================================

export { createBillTools } from './bills.js';
export { createDailyBriefingTools } from './daily-briefing.js';
export { createHabitTools } from './habits.js';
export { createMedicationTools } from './medications.js';
export { createNotesTools } from './notes.js';
export { createPackageTools } from './packages.js';
export { createRoutineTools } from './routines.js';
export { createShoppingTools } from './shopping.js';
export { createTaskTools } from './tasks.js';
export { createTravelTools } from './travel.js';

// ============================================================================
// TOOL ORCHESTRATION (Human-Level Conversation)
// ============================================================================

export {
  checkShouldWrapUp,
  cleanupStaleConversations,
  composeToolResult,
  ConversationStateManager,
  createToolComposer,
  endConversation,
  getActiveSessionIds,
  // Conversation state
  getConversationState,
  // Quick helpers
  getNextToolSuggestions,
  getSessionEmotionalContext,
  hasConversationState,
  TOOL_CHAINS,
  // Composer
  ToolComposer,
  // Types
  type ComposedResult,
  type ComposeOptions,
  type ConversationState,
  type EmotionalContext,
  type FlowContext,
  type ToolChain,
  type TopicContext,
  type UserContext,
} from './orchestration/index.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import {
  buildAgentTools,
  buildAllTeamTools,
  buildEssentialTools,
  buildToolsForDomains,
} from './builder.js';
import { getToolCategories, getToolDocumentation } from './categories.js';
import { initializeTeamHandlers, shutdownTools } from './lifecycle.js';
import {
  cleanupStaleConversations,
  composeToolResult,
  createToolComposer,
  getConversationState,
} from './orchestration/index.js';
import { toolRegistry } from './registry/index.js';
import { initializeToolRegistry } from './registry/loader.js';

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
