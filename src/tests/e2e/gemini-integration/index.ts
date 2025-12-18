/**
 * Gemini E2E Integration Tests
 *
 * A comprehensive test suite for validating Gemini LLM behavior with:
 * - Tool calling (calls vs speaks about tools)
 * - System prompt compliance (persona voice, constraints)
 * - Memory integration (recall, storage, boundaries)
 *
 * @module
 */

// ============================================================================
// HARNESS
// ============================================================================

export {
  GeminiTestHarness,
  TEST_TOOL_DEFINITIONS,
  type GeminiTestConfig,
  type TestUserProfile,
  type ConversationTurn,
  type TestToolDefinition,
  type ToolCallResult,
  type HarnessResponse,
  type TestScenarioResult,
  type ExpectedBehavior,
} from './harness.js';

// ============================================================================
// SCENARIOS
// ============================================================================

export {
  ALL_TOOL_CALLING_SCENARIOS,
  entertainmentScenarios,
  informationScenarios,
  handoffScenarios,
  memoryScenarios,
  negativeScenarios,
  getScenariosByCategory as getToolScenariosByCategory,
  getScenariosForPersona as getToolScenariosForPersona,
  getCriticalScenarios as getToolCriticalScenarios,
  getHandoffScenarios,
  type ToolCallingScenario,
} from './scenarios/tool-calling.scenarios.js';

export {
  ALL_SYSTEM_PROMPT_SCENARIOS,
  ferniVoiceScenarios,
  peterVoiceScenarios,
  mayaVoiceScenarios,
  behavioralConstraintScenarios,
  speechOutputScenarios,
  emotionalIntelligenceScenarios,
  boundaryRespectScenarios,
  getScenariosByCategory as getPromptScenariosByCategory,
  getScenariosForPersona as getPromptScenariosForPersona,
  getCriticalScenarios as getPromptCriticalScenarios,
  getSpeechOutputScenarios,
  type SystemPromptScenario,
} from './scenarios/system-prompt.scenarios.js';

export {
  ALL_MEMORY_SCENARIOS,
  memoryRecallScenarios,
  memoryStorageScenarios,
  profileUsageScenarios,
  boundaryMemoryScenarios,
  crossPersonaMemoryScenarios,
  getScenariosByCategory as getMemoryScenariosByCategory,
  getScenariosForPersona as getMemoryScenariosForPersona,
  getCriticalScenarios as getMemoryCriticalScenarios,
  getBoundaryScenarios,
  type MemoryScenario,
} from './scenarios/memory.scenarios.js';

// ============================================================================
// RUNNER
// ============================================================================

export { runAllTests, type RunnerConfig, type RunnerResult } from './runner.js';

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Get all scenarios across all categories
 */
export function getAllScenarios() {
  const { ALL_TOOL_CALLING_SCENARIOS } = require('./scenarios/tool-calling.scenarios.js');
  const { ALL_SYSTEM_PROMPT_SCENARIOS } = require('./scenarios/system-prompt.scenarios.js');
  const { ALL_MEMORY_SCENARIOS } = require('./scenarios/memory.scenarios.js');

  return {
    toolCalling: ALL_TOOL_CALLING_SCENARIOS,
    systemPrompt: ALL_SYSTEM_PROMPT_SCENARIOS,
    memory: ALL_MEMORY_SCENARIOS,
    total:
      ALL_TOOL_CALLING_SCENARIOS.length +
      ALL_SYSTEM_PROMPT_SCENARIOS.length +
      ALL_MEMORY_SCENARIOS.length,
  };
}

/**
 * Get all critical scenarios (must-pass)
 */
export function getAllCriticalScenarios() {
  const {
    getCriticalScenarios: getToolCritical,
  } = require('./scenarios/tool-calling.scenarios.js');
  const {
    getCriticalScenarios: getPromptCritical,
  } = require('./scenarios/system-prompt.scenarios.js');
  const { getCriticalScenarios: getMemoryCritical } = require('./scenarios/memory.scenarios.js');

  return {
    toolCalling: getToolCritical(),
    systemPrompt: getPromptCritical(),
    memory: getMemoryCritical(),
  };
}

/**
 * Quick check function for CI - runs only critical tests
 */
export async function runCriticalTests(): Promise<{
  passed: boolean;
  failures: number;
  summary: string;
}> {
  const { runAllTests } = require('./runner.js');

  const result = await runAllTests({
    criticalOnly: true,
    failFast: true,
  });

  return {
    passed: result.summary.criticalFailures === 0,
    failures: result.summary.criticalFailures,
    summary: `${result.summary.passed}/${result.summary.total} passed, ${result.summary.criticalFailures} critical failures`,
  };
}
