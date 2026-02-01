/**
 * Domain-Specific Tool Exports
 *
 * These are the recommended, agent-agnostic tool creators.
 * Prefer using buildAgentTools() over these direct imports.
 */

// ============================================================================
// COMMUNICATION DOMAIN
// ============================================================================

export {
  createCommunicationCoachingTools,
  createCommunicationTools,
} from '../domains/communication/communication-tools.js';

export { sendEmail, sendReminder, sendSMS } from '../../services/communication-service.js';

// ============================================================================
// SCHEDULING DOMAIN
// ============================================================================

export {
  createAppointmentTools,
  createContactsTools,
  createDeliveryTools,
  createPlacesTools,
} from '../scheduling.js';

// ============================================================================
// FINANCIAL DOMAIN
// ============================================================================

export { createFinancialHabitsTools } from '../domains/finance/financial-habits.js';
export {
  HABIT_TEMPLATES,
  LIFE_DOMAINS,
  LIFE_STAGES,
  createHabitCoachingTools,
} from '../habit-coaching.js';
export { createProactiveCoachingTools } from '../domains/proactive/coaching/index.js';

// ============================================================================
// GAMIFICATION DOMAIN
// ============================================================================

export { createGamificationToolsV2 } from '../domains/habits/gamification.js';
export { BADGE_DEFINITIONS, TITLE_PROGRESSION } from '../domains/habits/gamification-constants.js';

// ============================================================================
// NOTIFICATIONS & EVENTS
// ============================================================================

export { createEventPlanningTools } from '../domains/life-planning/event-planning.js';
export { createNotificationTools } from '../domains/communication/notifications.js';

// ============================================================================
// LIFE PLANNING DOMAIN
// ============================================================================

export { createCulturalCelebrationTools } from '../domains/life-planning/cultural-celebrations.js';
export { createFirstTimePlanningTools } from '../domains/life-planning/first-time-planning.js';
export { createGiftRegistryTools } from '../domains/life-planning/gift-registry.js';
export { createGoalManagementTools } from '../domains/life-planning/goal-management.js';
export { createLifeFirstsTools } from '../domains/life-planning/life-firsts-tracker.js';
export { createMilestoneProactiveTools } from '../domains/life-planning/milestone-proactive.js';
export { createRetirementPlanningTools } from '../domains/finance/retirement-planning.js';
export { createTeamIntegrationTools } from '../team-integration.js';

// ============================================================================
// DAILY PRODUCTIVITY DOMAIN
// ============================================================================

export { createBillTools } from '../domains/finance/bills.js';
export { createDailyBriefingTools } from '../domains/information/daily-briefing.js';
export { createHabitTools } from '../domains/habits/habits.js';
export { createMedicationTools } from '../domains/wellness/medications.js';
export { createNotesTools } from '../domains/productivity/notes.js';
export { createPackageTools } from '../domains/home/packages.js';
export { createRoutineTools } from '../domains/productivity/routines.js';
export { createShoppingTools } from '../domains/home/shopping.js';
export { createTaskTools } from '../domains/productivity/tasks.js';
export { createTravelTools } from '../domains/travel/travel.js';

// ============================================================================
// QUICK UTILITIES (Alexa/Siri-like)
// ============================================================================

export { createFlightTools, getAirportInfo, getFlightStatus } from '../domains/travel/flights.js';
export { createRestaurantTools, searchRestaurants } from '../domains/travel/restaurants.js';
export {
  activateScene,
  controlDevice,
  createSmartHomeTools,
  getAllDevices,
} from '../domains/smart-home/smart-home.js';
export {
  createTrafficTools,
  getDirections,
  getTrafficTime,
} from '../domains/information/traffic.js';

// ============================================================================
// ENTERTAINMENT DOMAIN
// ============================================================================

export { createSpotifyTools } from '../domains/entertainment/spotify.js';

// ============================================================================
// BANKING DOMAIN
// ============================================================================

export {
  getStoredAccessToken,
  getTokenData,
  hasLinkedAccounts,
  removeAccessToken,
  storeAccessToken,
} from '../domains/finance/plaid-store.js';
export { createPlaidTools } from '../domains/finance/plaid.js';

// ============================================================================
// AGENT-SPECIFIC
// ============================================================================

export { createHandoffTools } from '../handoff/index.js';
export { createInsightsAnalysisTools } from '../domains/research/insights-analysis.js';
export { createTelephonyTools } from '../domains/telephony/telephony.js';

// ============================================================================
// PERSONA MEMORY TOOLS
// ============================================================================

export {
  createAlexMemoryTools,
  createBogleMemoryTools,
  createFerniMemoryTools,
  createJordanMemoryTools,
  createMayaMemoryTools,
  createMemoryManagementTools,
  createPeterMemoryTools,
} from '../domains/memory/persona-tools.js';
