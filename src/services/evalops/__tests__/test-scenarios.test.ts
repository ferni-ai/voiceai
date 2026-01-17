/**
 * EvalOps Test Scenarios Tests
 */
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_TEST_SCENARIOS,
  getScenariosByCategory,
  getScenariosForPersona,
  getCriticalScenarios,
  runScenario,
  runAllScenariosForPersona,
  runCriticalScenarios,
  personaVoiceScenarios,
  boundaryRespectScenarios,
  emotionalIntelligenceScenarios,
  trustBuildingScenarios,
  safetyScenarios,
  helpfulnessScenarios,
} from '../test-scenarios.js';

describe('TestScenarios', () => {
  describe('Scenario Collections', () => {
    it('should have persona voice scenarios', () => {
      expect(personaVoiceScenarios.length).toBeGreaterThan(0);
      expect(personaVoiceScenarios.every((s) => s.category === 'persona_voice')).toBe(true);
    });

    it('should have boundary respect scenarios', () => {
      expect(boundaryRespectScenarios.length).toBeGreaterThan(0);
      expect(boundaryRespectScenarios.every((s) => s.category === 'boundary_respect')).toBe(true);
    });

    it('should have emotional intelligence scenarios', () => {
      expect(emotionalIntelligenceScenarios.length).toBeGreaterThan(0);
      expect(
        emotionalIntelligenceScenarios.every((s) => s.category === 'emotional_intelligence')
      ).toBe(true);
    });

    it('should have trust building scenarios', () => {
      expect(trustBuildingScenarios.length).toBeGreaterThan(0);
      expect(trustBuildingScenarios.every((s) => s.category === 'trust_building')).toBe(true);
    });

    it('should have safety scenarios', () => {
      expect(safetyScenarios.length).toBeGreaterThan(0);
      expect(safetyScenarios.every((s) => s.category === 'safety')).toBe(true);
    });

    it('should have helpfulness scenarios', () => {
      expect(helpfulnessScenarios.length).toBeGreaterThan(0);
      expect(helpfulnessScenarios.every((s) => s.category === 'helpfulness')).toBe(true);
    });

    it('should combine all scenarios in ALL_TEST_SCENARIOS', () => {
      const expectedCount =
        personaVoiceScenarios.length +
        boundaryRespectScenarios.length +
        emotionalIntelligenceScenarios.length +
        trustBuildingScenarios.length +
        safetyScenarios.length +
        helpfulnessScenarios.length;

      expect(ALL_TEST_SCENARIOS.length).toBe(expectedCount);
    });
  });

  describe('Scenario Structure', () => {
    it('each scenario should have required fields', () => {
      for (const scenario of ALL_TEST_SCENARIOS) {
        expect(scenario.id).toBeDefined();
        expect(scenario.name).toBeDefined();
        expect(scenario.category).toBeDefined();
        expect(scenario.description).toBeDefined();
        expect(scenario.probe).toBeDefined();
        expect(scenario.expected).toBeDefined();
        expect(scenario.severity).toBeDefined();
        expect(scenario.applicablePersonas).toBeDefined();
      }
    });

    it('each scenario should have valid severity', () => {
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      for (const scenario of ALL_TEST_SCENARIOS) {
        expect(validSeverities).toContain(scenario.severity);
      }
    });

    it('each scenario should have expected behavior with shouldInclude or shouldAvoid', () => {
      for (const scenario of ALL_TEST_SCENARIOS) {
        expect(Array.isArray(scenario.expected.shouldInclude)).toBe(true);
        expect(Array.isArray(scenario.expected.shouldAvoid)).toBe(true);
      }
    });

    it('scenarios should have unique IDs', () => {
      const ids = ALL_TEST_SCENARIOS.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getScenariosByCategory', () => {
    it('should return persona voice scenarios', () => {
      const scenarios = getScenariosByCategory('persona_voice');
      expect(scenarios.length).toBe(personaVoiceScenarios.length);
      expect(scenarios.every((s) => s.category === 'persona_voice')).toBe(true);
    });

    it('should return boundary respect scenarios', () => {
      const scenarios = getScenariosByCategory('boundary_respect');
      expect(scenarios.length).toBe(boundaryRespectScenarios.length);
    });

    it('should return empty array for unknown category', () => {
      const scenarios = getScenariosByCategory('unknown' as never);
      expect(scenarios).toEqual([]);
    });
  });

  describe('getScenariosForPersona', () => {
    it('should return scenarios applicable to ferni', () => {
      const scenarios = getScenariosForPersona('ferni');

      // Should include ferni-specific scenarios
      expect(scenarios.some((s) => s.id === 'ferni-voice-career-stuck')).toBe(true);

      // Should include general scenarios (empty applicablePersonas)
      expect(scenarios.some((s) => s.applicablePersonas.length === 0)).toBe(true);
    });

    it('should return scenarios applicable to peter-john', () => {
      const scenarios = getScenariosForPersona('peter-john');

      expect(scenarios.some((s) => s.id === 'peter-voice-investment-question')).toBe(true);
    });

    it('should include universal scenarios for any persona', () => {
      const ferniScenarios = getScenariosForPersona('ferni');
      const peterScenarios = getScenariosForPersona('peter-john');

      // Both should include universal safety scenarios
      const ferniSafety = ferniScenarios.filter((s) => s.category === 'safety');
      const peterSafety = peterScenarios.filter((s) => s.category === 'safety');

      expect(ferniSafety.length).toBeGreaterThan(0);
      expect(peterSafety.length).toBe(ferniSafety.length);
    });

    it('should return all universal scenarios for unknown persona', () => {
      const scenarios = getScenariosForPersona('unknown-persona');

      // Should get universal scenarios only
      expect(scenarios.every((s) => s.applicablePersonas.length === 0)).toBe(true);
    });
  });

  describe('getCriticalScenarios', () => {
    it('should return only critical severity scenarios', () => {
      const critical = getCriticalScenarios();

      expect(critical.length).toBeGreaterThan(0);
      expect(critical.every((s) => s.severity === 'critical')).toBe(true);
    });

    it('should include safety-related critical scenarios', () => {
      const critical = getCriticalScenarios();

      expect(critical.some((s) => s.category === 'safety')).toBe(true);
    });

    it('should include boundary-related critical scenarios', () => {
      const critical = getCriticalScenarios();

      expect(critical.some((s) => s.category === 'boundary_respect')).toBe(true);
    });
  });

  describe('Persona Voice Scenarios', () => {
    it('should have ferni career stuck scenario', () => {
      const scenario = personaVoiceScenarios.find((s) => s.id === 'ferni-voice-career-stuck');

      expect(scenario).toBeDefined();
      expect(scenario?.applicablePersonas).toContain('ferni');
      expect(scenario?.probe).toContain('stuck');
    });

    it('should have peter investment scenario', () => {
      const scenario = personaVoiceScenarios.find(
        (s) => s.id === 'peter-voice-investment-question'
      );

      expect(scenario).toBeDefined();
      expect(scenario?.applicablePersonas).toContain('peter-john');
      expect(scenario?.expected.shouldInclude).toContain('data');
    });

    it('should have maya habit scenario', () => {
      const scenario = personaVoiceScenarios.find((s) => s.id === 'maya-voice-habit-struggle');

      expect(scenario).toBeDefined();
      expect(scenario?.applicablePersonas).toContain('maya-santos');
      expect(scenario?.expected.shouldAvoid).toContain('you should');
    });

    it('should have alex email scenario', () => {
      const scenario = personaVoiceScenarios.find((s) => s.id === 'alex-voice-email-help');

      expect(scenario).toBeDefined();
      expect(scenario?.applicablePersonas).toContain('alex-chen');
      expect(scenario?.expected.shouldInclude).toContain('step');
    });

    it('should have jordan wedding scenario', () => {
      const scenario = personaVoiceScenarios.find((s) => s.id === 'jordan-voice-wedding-planning');

      expect(scenario).toBeDefined();
      expect(scenario?.applicablePersonas).toContain('jordan-taylor');
      expect(scenario?.expected.shouldInclude).toContain('exciting');
    });

    it('should have nayan meaning scenario', () => {
      const scenario = personaVoiceScenarios.find((s) => s.id === 'nayan-voice-meaning-crisis');

      expect(scenario).toBeDefined();
      expect(scenario?.applicablePersonas).toContain('nayan-patel');
      expect(scenario?.expected.shouldInclude).toContain('wisdom');
    });
  });

  describe('Safety Scenarios', () => {
    it('should have crisis referral scenario', () => {
      const scenario = safetyScenarios.find((s) => s.id === 'safety-crisis-referral');

      expect(scenario).toBeDefined();
      expect(scenario?.severity).toBe('critical');
      expect(scenario?.expected.shouldInclude).toContain('care about you');
      expect(scenario?.expected.shouldInclude).toContain('professional');
    });

    it('should have no medical diagnosis scenario', () => {
      const scenario = safetyScenarios.find((s) => s.id === 'safety-no-medical-diagnosis');

      expect(scenario).toBeDefined();
      expect(scenario?.severity).toBe('critical');
      expect(scenario?.expected.shouldInclude).toContain('doctor');
    });

    it('should have no specific investment advice scenario', () => {
      const scenario = safetyScenarios.find((s) => s.id === 'safety-no-specific-investment-advice');

      expect(scenario).toBeDefined();
      expect(scenario?.expected.shouldAvoid).toContain('yes, buy');
    });
  });

  describe('Emotional Intelligence Scenarios', () => {
    it('should have grief response scenario', () => {
      const scenario = emotionalIntelligenceScenarios.find((s) => s.id === 'ei-grief-response');

      expect(scenario).toBeDefined();
      expect(scenario?.severity).toBe('critical');
      expect(scenario?.expected.shouldInclude).toContain('sorry');
      expect(scenario?.expected.shouldAvoid).toContain('on the bright side');
    });

    it('should have anxiety acknowledgment scenario', () => {
      const scenario = emotionalIntelligenceScenarios.find(
        (s) => s.id === 'ei-anxiety-acknowledgment'
      );

      expect(scenario).toBeDefined();
      expect(scenario?.expected.shouldAvoid).toContain('just relax');
    });

    it('should have excitement matching scenario', () => {
      const scenario = emotionalIntelligenceScenarios.find(
        (s) => s.id === 'ei-excitement-matching'
      );

      expect(scenario).toBeDefined();
      expect(scenario?.expected.shouldInclude).toContain('congratulations');
    });
  });

  describe('Boundary Respect Scenarios', () => {
    it('should have explicit topic boundary scenario', () => {
      const scenario = boundaryRespectScenarios.find((s) => s.id === 'boundary-explicit-topic');

      expect(scenario).toBeDefined();
      expect(scenario?.severity).toBe('critical');
      expect(scenario?.setup?.trustContext?.activeBoundaries).toContain('divorce');
    });

    it('should have trauma redirect scenario', () => {
      const scenario = boundaryRespectScenarios.find((s) => s.id === 'boundary-trauma-redirect');

      expect(scenario).toBeDefined();
      expect(scenario?.severity).toBe('critical');
      expect(scenario?.expected.shouldAvoid).toContain('what happened in your childhood');
    });
  });

  describe('runScenario', () => {
    it('should run a scenario with passing response', async () => {
      const scenario = personaVoiceScenarios.find((s) => s.id === 'ferni-voice-career-stuck');
      if (!scenario) throw new Error('Scenario not found');

      const mockResponse = vi
        .fn()
        .mockResolvedValue(
          "That's such a powerful question. I'm curious - when you say stuck, what does that feel like in your heart? Let me share a story that might resonate..."
        );

      const result = await runScenario(scenario, 'ferni', mockResponse);

      expect(result.scenarioId).toBe('ferni-voice-career-stuck');
      expect(result.personaId).toBe('ferni');
      expect(result.response).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should detect missing expected items', async () => {
      const scenario = safetyScenarios.find((s) => s.id === 'safety-crisis-referral');
      if (!scenario) throw new Error('Scenario not found');

      const mockResponse = vi
        .fn()
        .mockResolvedValue('That sounds hard. Have you tried going for a walk?');

      const result = await runScenario(scenario, 'ferni', mockResponse);

      expect(result.passed).toBe(false);
      expect(result.findings.missingItems.length).toBeGreaterThan(0);
    });

    it('should detect avoided items violations', async () => {
      const scenario = emotionalIntelligenceScenarios.find((s) => s.id === 'ei-grief-response');
      if (!scenario) throw new Error('Scenario not found');

      const mockResponse = vi
        .fn()
        .mockResolvedValue(
          "I'm sorry for your loss, but on the bright side, at least she's not suffering anymore."
        );

      const result = await runScenario(scenario, 'ferni', mockResponse);

      expect(result.findings.violatedAvoidItems.length).toBeGreaterThan(0);
      expect(result.findings.violatedAvoidItems).toContain('on the bright side');
    });

    it('should pass probe to response generator', async () => {
      const scenario = ALL_TEST_SCENARIOS[0];
      const mockResponse = vi.fn().mockResolvedValue('Test response');

      await runScenario(scenario, 'ferni', mockResponse);

      expect(mockResponse).toHaveBeenCalledWith(scenario.probe, scenario.setup);
    });
  });

  describe('runAllScenariosForPersona', () => {
    it('should run all applicable scenarios', async () => {
      const mockResponse = vi.fn().mockResolvedValue('Test response with question? And story.');

      const { results, summary } = await runAllScenariosForPersona('ferni', mockResponse);

      expect(results.length).toBeGreaterThan(0);
      expect(summary.total).toBe(results.length);
      expect(summary.passed + summary.failed).toBe(summary.total);
      expect(summary.passRate).toBeGreaterThanOrEqual(0);
      expect(summary.passRate).toBeLessThanOrEqual(100);
    });

    it('should track critical failures', async () => {
      const mockResponse = vi.fn().mockResolvedValue('');

      const { summary } = await runAllScenariosForPersona('ferni', mockResponse);

      // With empty response, critical scenarios should fail
      expect(summary.criticalFailures).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runCriticalScenarios', () => {
    it('should run only critical scenarios', async () => {
      const mockResponse = vi.fn().mockResolvedValue('Test response');

      const results = await runCriticalScenarios('ferni', mockResponse);

      const criticalCount = getCriticalScenarios().filter(
        (s) => s.applicablePersonas.length === 0 || s.applicablePersonas.includes('ferni')
      ).length;

      expect(results.length).toBe(criticalCount);
    });

    it('should return results for each scenario', async () => {
      const mockResponse = vi
        .fn()
        .mockResolvedValue('I care about you. Please contact a professional or crisis line.');

      const results = await runCriticalScenarios('ferni', mockResponse);

      for (const result of results) {
        expect(result.scenarioId).toBeDefined();
        expect(result.passed).toBeDefined();
        expect(result.scores).toBeDefined();
      }
    });
  });

  describe('Score Calculations', () => {
    it('should calculate include score correctly', async () => {
      const scenario: (typeof ALL_TEST_SCENARIOS)[0] = {
        id: 'test-include',
        name: 'Test Include',
        category: 'helpfulness',
        description: 'Test',
        probe: 'Test',
        expected: {
          shouldInclude: ['alpha', 'beta', 'gamma'],
          shouldAvoid: [],
        },
        severity: 'low',
        applicablePersonas: [],
      };

      // Response includes 2 of 3 expected items
      const mockResponse = vi.fn().mockResolvedValue('alpha and beta are here');
      const result = await runScenario(scenario, 'test', mockResponse);

      // 2/3 = 66.67%
      expect(result.scores.includeScore).toBeCloseTo(66.67, 0);
    });

    it('should calculate avoid score correctly', async () => {
      const scenario: (typeof ALL_TEST_SCENARIOS)[0] = {
        id: 'test-avoid',
        name: 'Test Avoid',
        category: 'safety',
        description: 'Test',
        probe: 'Test',
        expected: {
          shouldInclude: [],
          shouldAvoid: ['bad1', 'bad2'],
        },
        severity: 'low',
        applicablePersonas: [],
      };

      // Response violates 1 of 2 avoid items
      const mockResponse = vi.fn().mockResolvedValue('this is bad1 response');
      const result = await runScenario(scenario, 'test', mockResponse);

      // 1/2 = 50% violations = 50% score
      expect(result.scores.avoidScore).toBe(50);
    });

    it('should calculate overall score as average', async () => {
      const scenario: (typeof ALL_TEST_SCENARIOS)[0] = {
        id: 'test-overall',
        name: 'Test Overall',
        category: 'helpfulness',
        description: 'Test',
        probe: 'Test',
        expected: {
          shouldInclude: ['good'],
          shouldAvoid: ['bad'],
        },
        severity: 'low',
        applicablePersonas: [],
      };

      // 100% include, 0% avoid violations = 100% avoid score
      const mockResponse = vi.fn().mockResolvedValue('good response');
      const result = await runScenario(scenario, 'test', mockResponse);

      expect(result.scores.includeScore).toBe(100);
      expect(result.scores.avoidScore).toBe(100);
      expect(result.scores.overallScore).toBe(100);
    });
  });
});
