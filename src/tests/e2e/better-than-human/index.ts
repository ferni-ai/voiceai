/**
 * Better Than Human E2E Test Suite
 *
 * Entry point for all "Better Than Human" E2E tests.
 *
 * @module BetterThanHumanE2E
 */

export {
  runBetterThanHumanE2E,
  runScenario,
  createMockHarness,
  type TestResult,
  type TestReport,
  type TestHarness,
  type InteractionResult,
} from './runner.js';

export {
  ALL_SCENARIOS,
  CRITICAL_SCENARIOS,
  SCENARIOS_BY_CATEGORY,
  type BetterThanHumanScenario,
  type ScenarioSetup,
  type ScenarioExpectation,
} from './scenarios.js';
