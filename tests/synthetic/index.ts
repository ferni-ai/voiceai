/**
 * Synthetic Testing Suite
 *
 * Comprehensive end-to-end testing for the Ferni platform.
 *
 * TEST SUITES:
 *
 * 1. CONCIERGE CALLING TESTS
 *    pnpm test:synthetic                    # Run all concierge scenarios
 *    pnpm test:synthetic --quick            # Quick scenarios only (< 30s each)
 *    pnpm test:synthetic --category=healthcare
 *    pnpm test:synthetic --id=hc-001
 *
 *    Categories:
 *      - healthcare: Doctor, dentist, specialist appointments
 *      - dining: Restaurant reservations
 *      - personal_service: Salon, spa, etc.
 *      - edge_case: Wrong numbers, disconnects, IVR hell
 *
 * 2. MENU NAVIGATION TESTS (Browser-based)
 *    pnpm test:menu                         # Run all menu scenarios
 *    pnpm test:menu --category=insights     # Run specific category
 *    pnpm test:menu --tag=new               # Run by tag
 *    pnpm test:menu --core                  # Run core scenarios only
 *
 *    Categories:
 *      - practices: Guided practices, rituals, notifications
 *      - insights: Your story, memories, history, predictions
 *      - engagement: Games, music, creative, video, marketplace
 *      - people: Contacts, household
 *      - integrations: Connected life (Spotify, Calendar, Health)
 *      - settings: Preferences, account, billing
 *      - quick_actions: Roadmap, referral, onboarding
 *      - feature_locks: Progressive disclosure tests
 *      - persistence: LocalStorage/state tests
 *
 * 3. VIBE & HOME AUTOMATION TESTS
 *    pnpm vitest run tests/synthetic/vibe-synthetic-e2e.test.ts
 *    pnpm vitest run tests/synthetic/vibe-synthetic-e2e.test.ts --reporter=verbose
 *
 *    Categories:
 *      - happy_path: All 15 vibe presets with full device response
 *      - partial_failure: Graceful degradation (lights fail, temp works, etc.)
 *      - full_failure: Circuit breakers, all devices offline
 *      - edge_case: Slow home, flaky connections, single device
 *      - voice_command: "Set the vibe to focus", "I need to relax"
 *
 *    Covers:
 *      - HomeKit integration (iOS native)
 *      - Home Assistant, Philips Hue, LIFX backends
 *      - Ecobee thermostat control
 *      - Vibe service (music + lights + temperature)
 *      - Voice command routing via semantic router
 */

// ============================================================================
// CONCIERGE CALLING MOCKS
// ============================================================================
export {
  MockBusiness,
  createHelpfulDoctorOffice,
  createBusyClinic,
  createPopularRestaurant,
  createSalon,
  createVoicemailBusiness,
  getNextWeekday,
  type MockBusinessConfig,
  type BusinessType,
  type ReceptionistPersonality,
  type AvailabilityScenario,
  type CallConnection,
  type IVRMenu,
  type AgentInput,
  type BusinessResponse,
} from './mocks/mock-business.js';

// ============================================================================
// CONCIERGE CALLING SCENARIOS
// ============================================================================
export {
  ALL_SCENARIOS,
  HEALTHCARE_SCENARIOS,
  RESTAURANT_SCENARIOS,
  PERSONAL_SERVICE_SCENARIOS,
  EDGE_CASE_SCENARIOS,
  getScenariosByCategory,
  getScenarioById,
  getQuickTestScenarios,
  getFullTestScenarios,
  getScenarioSummary,
  type TestScenario,
  type TestResult,
  type ExpectedOutcome,
  type ExpectedExtraction,
  type StoredContact,
} from './scenarios/concierge-scenarios.js';

// ============================================================================
// CONCIERGE CALLING RUNNER
// ============================================================================
export {
  runSyntheticTests,
  MockConciergeAgent,
  type TestRunOptions,
  type TestReport,
} from './runner/concierge-test-runner.js';

// ============================================================================
// MENU NAVIGATION SCENARIOS
// ============================================================================
export {
  ALL_MENU_SCENARIOS,
  PRACTICES_SCENARIOS,
  INSIGHTS_SCENARIOS,
  ENGAGEMENT_SCENARIOS,
  PEOPLE_SCENARIOS,
  INTEGRATIONS_SCENARIOS,
  SETTINGS_SCENARIOS,
  QUICK_ACTION_SCENARIOS,
  FEATURE_LOCK_SCENARIOS,
  PERSISTENCE_SCENARIOS,
  ADMIN_SCENARIOS,
  getScenariosByCategory as getMenuScenariosByCategory,
  getScenarioById as getMenuScenarioById,
  getScenariosByTag as getMenuScenariosByTag,
  getCoreScenarios,
  getNewFeatureScenarios,
  getFeatureLockScenarios,
  getMenuScenarioSummary,
  type MenuTestScenario,
  type MenuTestResult,
  type MenuTestCategory,
  type ExpectedUIResult,
  type MenuTestStep,
  type MenuTestAssertion,
} from './scenarios/menu-scenarios.js';

// ============================================================================
// MENU NAVIGATION RUNNER
// ============================================================================
export {
  runMenuTests,
  MenuTestExecutor,
  type MenuTestRunOptions,
  type MenuTestReport,
} from './runner/menu-test-runner.js';

// ============================================================================
// VIBE & HOME AUTOMATION MOCKS
// ============================================================================
export {
  MockSmartHome,
  createConnectedHome,
  createPartialHome,
  createEmptyHome,
  createCircuitOpenHome,
  createSlowHome,
  createFlakyHome,
  MOCK_VIBE_PRESETS,
  getVibePreset,
  type MockSmartHomeConfig,
  type MockDevice,
  type DeviceType,
  type SmartHomePlatform,
  type ResponseBehavior,
  type DeviceCommandResult,
  type VibeActivationResult,
  type VibePresetConfig,
} from './mocks/mock-smart-home.js';

// ============================================================================
// VIBE & HOME AUTOMATION SCENARIOS
// ============================================================================
export {
  ALL_VIBE_SCENARIOS,
  HAPPY_PATH_SCENARIOS,
  PARTIAL_FAILURE_SCENARIOS,
  FULL_FAILURE_SCENARIOS,
  EDGE_CASE_SCENARIOS as VIBE_EDGE_CASE_SCENARIOS,
  VOICE_COMMAND_SCENARIOS,
  SMART_HOME_SCENARIOS,
  getScenariosByCategory as getVibeScenariosByCategory,
  getScenarioById as getVibeScenarioById,
  getQuickTestScenarios as getQuickVibeTestScenarios,
  getFullTestScenarios as getFullVibeTestScenarios,
  getScenarioSummary as getVibeScenarioSummary,
  mapVoiceCommandToVibe,
  type VibeTestScenario,
  type VibeTestResult,
  type ExpectedOutcome as VibeExpectedOutcome,
  type ExpectedState,
} from './scenarios/vibe-scenarios.js';

// ============================================================================
// VIBE & HOME AUTOMATION RUNNER
// ============================================================================
export {
  VibeTestRunner,
  runVibeTests,
  createVitestCases,
  type TestRunConfig as VibeTestRunConfig,
  type TestRunSummary as VibeTestRunSummary,
} from './runner/vibe-test-runner.js';
