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

export { createFinancialHabitsTools } from '../financial-habits.js';
export {
  HABIT_TEMPLATES,
  LIFE_DOMAINS,
  LIFE_STAGES,
  createHabitCoachingTools,
} from '../habit-coaching.js';
export { createProactiveCoachingTools } from '../proactive-coaching.js';

// ============================================================================
// GAMIFICATION DOMAIN
// ============================================================================

export { createGamificationToolsV2 } from '../domains/habits/gamification-v2.js';
export { BADGE_DEFINITIONS, TITLE_PROGRESSION } from '../gamification.js';

// ============================================================================
// NOTIFICATIONS & EVENTS
// ============================================================================

export { createEventPlanningTools } from '../domains/life-planning/event-planning.js';
export { createNotificationTools } from '../notifications.js';

// ============================================================================
// LIFE PLANNING DOMAIN
// ============================================================================

export { createCulturalCelebrationTools } from '../cultural-celebrations.js';
export { createFirstTimePlanningTools } from '../first-time-planning.js';
export { createGiftRegistryTools } from '../gift-registry.js';
export { createGoalManagementTools } from '../domains/life-planning/goal-management.js';
export { createLifeFirstsTools } from '../domains/life-planning/life-firsts-tracker.js';
export { createMilestoneProactiveTools } from '../milestone-proactive.js';
export { createRetirementPlanningTools } from '../retirement-planning.js';
export { createTeamIntegrationTools } from '../team-integration.js';

// ============================================================================
// DAILY PRODUCTIVITY DOMAIN
// ============================================================================

export { createBillTools } from '../bills.js';
export { createDailyBriefingTools } from '../daily-briefing.js';
export { createHabitTools } from '../domains/habits/habits.js';
export { createMedicationTools } from '../medications.js';
export { createNotesTools } from '../notes.js';
export { createPackageTools } from '../packages.js';
export { createRoutineTools } from '../routines.js';
export { createShoppingTools } from '../shopping.js';
export { createTaskTools } from '../tasks.js';
export { createTravelTools } from '../travel.js';

// ============================================================================
// QUICK UTILITIES (Alexa/Siri-like)
// ============================================================================

export { createFlightTools, getAirportInfo, getFlightStatus } from '../flights.js';
export { createRestaurantTools, searchRestaurants } from '../restaurants.js';
export {
  activateScene,
  controlDevice,
  createSmartHomeTools,
  getAllDevices,
} from '../smart-home.js';
export { createTrafficTools, getDirections, getTrafficTime } from '../traffic.js';

// ============================================================================
// ENTERTAINMENT DOMAIN
// ============================================================================

export { createSpotifyTools } from '../spotify.js';

// ============================================================================
// BANKING DOMAIN
// ============================================================================

export {
  getStoredAccessToken,
  getTokenData,
  hasLinkedAccounts,
  removeAccessToken,
  storeAccessToken,
} from '../plaid-store.js';
export { createPlaidTools } from '../plaid.js';

// ============================================================================
// AGENT-SPECIFIC
// ============================================================================

export { createHandoffTools } from '../handoff/index.js';
export { createInsightsAnalysisTools } from '../domains/research/insights-analysis.js';
export { createTelephonyTools } from '../telephony.js';

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
} from '../persona-memory-tools.js';
