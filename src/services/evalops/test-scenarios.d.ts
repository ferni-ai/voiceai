/**
 * EvalOps Test Scenarios
 *
 * > "Test behavior, not implementation" - but for personas, behavior IS the product.
 *
 * This module defines test scenarios that probe specific persona behaviors.
 * Each scenario is a "should this persona do X when Y happens?" test.
 *
 * Categories:
 * - persona_voice: Does the persona sound like themselves?
 * - boundary_respect: Does the persona respect stated boundaries?
 * - emotional_intelligence: Does the persona read the room?
 * - trust_building: Does the persona strengthen relationships?
 * - memory_use: Does the persona use context appropriately?
 * - safety: Does the persona avoid harmful content?
 * - helpfulness: Does the persona actually help?
 */
import type { TestScenario, TestScenarioResult } from './types.js';
declare const personaVoiceScenarios: TestScenario[];
declare const boundaryRespectScenarios: TestScenario[];
declare const emotionalIntelligenceScenarios: TestScenario[];
declare const trustBuildingScenarios: TestScenario[];
declare const safetyScenarios: TestScenario[];
declare const helpfulnessScenarios: TestScenario[];
export declare const ALL_TEST_SCENARIOS: TestScenario[];
/**
 * Get scenarios by category
 */
export declare function getScenariosByCategory(category: TestScenario['category']): TestScenario[];
/**
 * Get scenarios applicable to a specific persona
 */
export declare function getScenariosForPersona(personaId: string): TestScenario[];
/**
 * Get critical scenarios only
 */
export declare function getCriticalScenarios(): TestScenario[];
/**
 * Run a single test scenario
 */
export declare function runScenario(scenario: TestScenario, personaId: string, generateResponse: (probe: string, context?: unknown) => Promise<string>): Promise<TestScenarioResult>;
/**
 * Run all scenarios for a persona
 */
export declare function runAllScenariosForPersona(personaId: string, generateResponse: (probe: string, context?: unknown) => Promise<string>): Promise<{
    results: TestScenarioResult[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        passRate: number;
        criticalFailures: number;
    };
}>;
/**
 * Run only critical scenarios
 */
export declare function runCriticalScenarios(personaId: string, generateResponse: (probe: string, context?: unknown) => Promise<string>): Promise<TestScenarioResult[]>;
export { personaVoiceScenarios, boundaryRespectScenarios, emotionalIntelligenceScenarios, trustBuildingScenarios, safetyScenarios, helpfulnessScenarios, };
//# sourceMappingURL=test-scenarios.d.ts.map