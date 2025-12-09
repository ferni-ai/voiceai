/**
 * EvalOps API Routes
 *
 * > "Better than human" requires measurement - these routes expose it.
 *
 * Endpoints:
 * - POST /api/evalops/evaluate - Evaluate a single response
 * - POST /api/evalops/quick-check - Quick voice consistency check
 * - GET /api/evalops/fingerprints - Get persona fingerprints
 * - GET /api/evalops/scenarios - Get test scenarios
 * - POST /api/evalops/run-scenario - Run a specific test scenario
 * - POST /api/evalops/run-suite - Run full test suite for a persona
 * - GET /api/evalops/health - Get EvalOps system health
 */

import { Router, Request, Response } from 'express';
import { getLogger } from '../utils/safe-logger.js';
import {
  evaluateResponse,
  evaluateVoiceConsistency,
  quickHealthCheck,
  buildMinimalContext,
  getPersonaFingerprint,
  getPersonaFingerprintSummary,
  getScenarioStats,
  ALL_TEST_SCENARIOS,
  getScenariosForPersona,
  getCriticalScenarios,
  runScenario,
  runAllScenariosForPersona,
  runCriticalScenarios,
} from '../services/evalops/index.js';
import {
  getEvalOpsFlags,
  setEvalOpsFlags,
  getEvalMetrics,
  resetEvalMetrics,
  getRecentEvaluations,
  getFlaggedEvaluations,
  getSuiteResults,
  type EvalOpsFeatureFlags,
} from '../services/evalops/automation.js';

const log = getLogger();
const router = Router();

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * EvalOps routes require admin access (dev mode or admin key)
 */
function requireAdmin(req: Request, res: Response, next: () => void): void {
  const adminKey = req.headers['x-admin-key'] || req.body?.admin_key;
  const isDev = process.env.NODE_ENV === 'development' || adminKey === 'dev-mode';
  
  if (!isDev && adminKey !== process.env.EVALOPS_ADMIN_KEY) {
    res.status(403).json({ error: 'Admin access required for EvalOps' });
    return;
  }
  
  next();
}

// Apply admin check to all routes
router.use(requireAdmin);

// ============================================================================
// EVALUATION ENDPOINTS
// ============================================================================

/**
 * POST /api/evalops/evaluate
 * Full LLM-as-judge evaluation of a response
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const {
      user_message,
      ai_response,
      persona_id,
      conversation_history,
      user_profile,
      trust_context,
      emotional_context,
      turn_number,
    } = req.body;

    if (!user_message || !ai_response || !persona_id) {
      res.status(400).json({
        error: 'Missing required fields: user_message, ai_response, persona_id',
      });
      return;
    }

    const fingerprint = getPersonaFingerprint(persona_id);
    if (!fingerprint) {
      res.status(400).json({ error: `Unknown persona: ${persona_id}` });
      return;
    }

    const context = {
      personaId: persona_id,
      fingerprint,
      conversationHistory: conversation_history || [],
      userProfile: user_profile,
      trustContext: trust_context,
      emotionalContext: emotional_context,
      turnNumber: turn_number || 1,
    };

    log.info({ persona_id, turn_number }, 'Running full evaluation');

    const evaluation = await evaluateResponse(user_message, ai_response, context);

    res.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    log.error({ error }, 'Evaluation failed');
    res.status(500).json({ error: 'Evaluation failed', details: String(error) });
  }
});

/**
 * POST /api/evalops/quick-check
 * Quick voice consistency check (no LLM call)
 */
router.post('/quick-check', (req: Request, res: Response) => {
  try {
    const { response, persona_id } = req.body;

    if (!response || !persona_id) {
      res.status(400).json({ error: 'Missing required fields: response, persona_id' });
      return;
    }

    const result = quickHealthCheck(response, persona_id);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    log.error({ error }, 'Quick check failed');
    res.status(500).json({ error: 'Quick check failed', details: String(error) });
  }
});

/**
 * POST /api/evalops/voice-analysis
 * Detailed voice consistency analysis
 */
router.post('/voice-analysis', (req: Request, res: Response) => {
  try {
    const { response, persona_id } = req.body;

    if (!response || !persona_id) {
      res.status(400).json({ error: 'Missing required fields: response, persona_id' });
      return;
    }

    const { score, issues } = evaluateVoiceConsistency(response, persona_id);
    const fingerprint = getPersonaFingerprint(persona_id);

    res.json({
      success: true,
      persona_id,
      score,
      issues,
      fingerprint_summary: fingerprint ? {
        signature_phrases_count: fingerprint.signaturePhrases.length,
        anti_patterns_count: fingerprint.antiPatterns.length,
        warmth: fingerprint.emotionalTone.warmth,
        energy: fingerprint.emotionalTone.energy,
        reasoning_style: fingerprint.reasoningIndicators.style,
      } : null,
    });
  } catch (error) {
    log.error({ error }, 'Voice analysis failed');
    res.status(500).json({ error: 'Voice analysis failed', details: String(error) });
  }
});

// ============================================================================
// FINGERPRINT ENDPOINTS
// ============================================================================

/**
 * GET /api/evalops/fingerprints
 * Get all persona fingerprints or a specific one
 */
router.get('/fingerprints', (req: Request, res: Response) => {
  try {
    const { persona_id } = req.query;

    if (persona_id && typeof persona_id === 'string') {
      const fingerprint = getPersonaFingerprint(persona_id);
      if (!fingerprint) {
        res.status(404).json({ error: `Fingerprint not found for: ${persona_id}` });
        return;
      }
      res.json({ success: true, fingerprint });
      return;
    }

    // Return summary of all fingerprints
    const summary = getPersonaFingerprintSummary();
    res.json({ success: true, fingerprints: summary });
  } catch (error) {
    log.error({ error }, 'Failed to get fingerprints');
    res.status(500).json({ error: 'Failed to get fingerprints', details: String(error) });
  }
});

/**
 * GET /api/evalops/fingerprints/:personaId/full
 * Get full fingerprint for a specific persona
 */
router.get('/fingerprints/:personaId/full', (req: Request, res: Response) => {
  try {
    const { personaId } = req.params;
    const fingerprint = getPersonaFingerprint(personaId);

    if (!fingerprint) {
      res.status(404).json({ error: `Fingerprint not found for: ${personaId}` });
      return;
    }

    res.json({ success: true, fingerprint });
  } catch (error) {
    log.error({ error }, 'Failed to get fingerprint');
    res.status(500).json({ error: 'Failed to get fingerprint', details: String(error) });
  }
});

// ============================================================================
// TEST SCENARIO ENDPOINTS
// ============================================================================

/**
 * GET /api/evalops/scenarios
 * Get test scenarios (all or filtered)
 */
router.get('/scenarios', (req: Request, res: Response) => {
  try {
    const { persona_id, category, severity } = req.query;

    let scenarios = ALL_TEST_SCENARIOS;

    if (persona_id && typeof persona_id === 'string') {
      scenarios = getScenariosForPersona(persona_id);
    }

    if (category && typeof category === 'string') {
      scenarios = scenarios.filter(s => s.category === category);
    }

    if (severity && typeof severity === 'string') {
      scenarios = scenarios.filter(s => s.severity === severity);
    }

    res.json({
      success: true,
      count: scenarios.length,
      scenarios: scenarios.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        severity: s.severity,
        description: s.description,
        applicable_personas: s.applicablePersonas,
      })),
    });
  } catch (error) {
    log.error({ error }, 'Failed to get scenarios');
    res.status(500).json({ error: 'Failed to get scenarios', details: String(error) });
  }
});

/**
 * GET /api/evalops/scenarios/stats
 * Get statistics about test scenarios
 */
router.get('/scenarios/stats', (_req: Request, res: Response) => {
  try {
    const stats = getScenarioStats();
    res.json({ success: true, stats });
  } catch (error) {
    log.error({ error }, 'Failed to get scenario stats');
    res.status(500).json({ error: 'Failed to get scenario stats', details: String(error) });
  }
});

/**
 * GET /api/evalops/scenarios/:id
 * Get a specific scenario by ID
 */
router.get('/scenarios/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scenario = ALL_TEST_SCENARIOS.find(s => s.id === id);

    if (!scenario) {
      res.status(404).json({ error: `Scenario not found: ${id}` });
      return;
    }

    res.json({ success: true, scenario });
  } catch (error) {
    log.error({ error }, 'Failed to get scenario');
    res.status(500).json({ error: 'Failed to get scenario', details: String(error) });
  }
});

/**
 * POST /api/evalops/run-scenario
 * Run a specific test scenario
 * 
 * Requires a way to generate responses - this is a placeholder
 * that would need to be connected to your actual response generation
 */
router.post('/run-scenario', async (req: Request, res: Response) => {
  try {
    const { scenario_id, persona_id, mock_response } = req.body;

    if (!scenario_id || !persona_id) {
      res.status(400).json({ error: 'Missing required fields: scenario_id, persona_id' });
      return;
    }

    const scenario = ALL_TEST_SCENARIOS.find(s => s.id === scenario_id);
    if (!scenario) {
      res.status(404).json({ error: `Scenario not found: ${scenario_id}` });
      return;
    }

    // If mock_response is provided, use it; otherwise this is a dry run
    if (mock_response) {
      const generateResponse = async () => mock_response;
      const result = await runScenario(scenario, persona_id, generateResponse);
      res.json({ success: true, result });
    } else {
      // Dry run - just return the scenario details
      res.json({
        success: true,
        dry_run: true,
        scenario,
        message: 'Provide mock_response to actually run the scenario',
      });
    }
  } catch (error) {
    log.error({ error }, 'Failed to run scenario');
    res.status(500).json({ error: 'Failed to run scenario', details: String(error) });
  }
});

/**
 * POST /api/evalops/run-suite
 * Run full test suite for a persona (with mock responses)
 */
router.post('/run-suite', async (req: Request, res: Response) => {
  try {
    const { persona_id, mock_responses, critical_only } = req.body;

    if (!persona_id) {
      res.status(400).json({ error: 'Missing required field: persona_id' });
      return;
    }

    if (!mock_responses || typeof mock_responses !== 'object') {
      // Return what scenarios would be run
      const scenarios = critical_only 
        ? getCriticalScenarios().filter(s => 
            s.applicablePersonas.length === 0 || s.applicablePersonas.includes(persona_id)
          )
        : getScenariosForPersona(persona_id);
      
      res.json({
        success: true,
        dry_run: true,
        persona_id,
        scenario_count: scenarios.length,
        scenarios: scenarios.map(s => ({ id: s.id, name: s.name, probe: s.probe })),
        message: 'Provide mock_responses object { scenario_id: response } to run suite',
      });
      return;
    }

    // Create a generate function that uses mock responses
    const generateResponse = async (probe: string): Promise<string> => {
      // Find scenario by probe and get mock response
      const scenario = ALL_TEST_SCENARIOS.find(s => s.probe === probe);
      if (scenario && mock_responses[scenario.id]) {
        return mock_responses[scenario.id];
      }
      return mock_responses.default || 'No mock response provided';
    };

    const { results, summary } = await runAllScenariosForPersona(persona_id, generateResponse);

    res.json({
      success: true,
      persona_id,
      summary,
      results: results.map(r => ({
        scenario_id: r.scenarioId,
        passed: r.passed,
        scores: r.scores,
        findings: r.findings,
      })),
    });
  } catch (error) {
    log.error({ error }, 'Failed to run test suite');
    res.status(500).json({ error: 'Failed to run test suite', details: String(error) });
  }
});

// ============================================================================
// FEATURE FLAGS ENDPOINTS
// ============================================================================

/**
 * GET /api/evalops/flags
 * Get current EvalOps feature flags
 */
router.get('/flags', (_req: Request, res: Response) => {
  try {
    const flags = getEvalOpsFlags();
    res.json({ success: true, flags });
  } catch (error) {
    log.error({ error }, 'Failed to get feature flags');
    res.status(500).json({ error: 'Failed to get feature flags' });
  }
});

/**
 * PUT /api/evalops/flags
 * Update EvalOps feature flags
 */
router.put('/flags', (req: Request, res: Response) => {
  try {
    const updates: Partial<EvalOpsFeatureFlags> = req.body;
    
    // Validate input
    const validKeys = [
      'enabled', 'autoSampling', 'voiceChecks', 'llmEvaluation',
      'scheduledSuites', 'alerting', 'sampleRateOverride', 'enabledPersonas'
    ];
    
    for (const key of Object.keys(updates)) {
      if (!validKeys.includes(key)) {
        res.status(400).json({ error: `Invalid flag key: ${key}` });
        return;
      }
    }
    
    setEvalOpsFlags(updates);
    const newFlags = getEvalOpsFlags();
    
    log.info({ updates }, 'Feature flags updated via API');
    res.json({ success: true, flags: newFlags });
  } catch (error) {
    log.error({ error }, 'Failed to update feature flags');
    res.status(500).json({ error: 'Failed to update feature flags' });
  }
});

// ============================================================================
// METRICS ENDPOINTS
// ============================================================================

/**
 * GET /api/evalops/metrics
 * Get evaluation metrics
 */
router.get('/metrics', (_req: Request, res: Response) => {
  try {
    const metrics = getEvalMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    log.error({ error }, 'Failed to get metrics');
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * POST /api/evalops/metrics/reset
 * Reset evaluation metrics
 */
router.post('/metrics/reset', (_req: Request, res: Response) => {
  try {
    resetEvalMetrics();
    log.info('Evaluation metrics reset via API');
    res.json({ success: true, message: 'Metrics reset' });
  } catch (error) {
    log.error({ error }, 'Failed to reset metrics');
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// ============================================================================
// EVALUATION HISTORY ENDPOINTS
// ============================================================================

/**
 * GET /api/evalops/evaluations
 * Get recent evaluation results
 */
router.get('/evaluations', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const personaId = req.query.persona_id as string | undefined;
    const flaggedOnly = req.query.flagged === 'true';
    
    const evaluations = flaggedOnly 
      ? getFlaggedEvaluations(limit)
      : getRecentEvaluations(limit, { personaId, flagged: flaggedOnly || undefined });
    
    res.json({
      success: true,
      count: evaluations.length,
      evaluations,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get evaluations');
    res.status(500).json({ error: 'Failed to get evaluations' });
  }
});

/**
 * GET /api/evalops/evaluations/flagged
 * Get flagged evaluation results
 */
router.get('/evaluations/flagged', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const evaluations = getFlaggedEvaluations(limit);
    
    res.json({
      success: true,
      count: evaluations.length,
      evaluations,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get flagged evaluations');
    res.status(500).json({ error: 'Failed to get flagged evaluations' });
  }
});

// ============================================================================
// SUITE RESULTS ENDPOINTS
// ============================================================================

/**
 * GET /api/evalops/suite-results
 * Get scheduled test suite results
 */
router.get('/suite-results', (req: Request, res: Response) => {
  try {
    const personaId = req.query.persona_id as string | undefined;
    const results = getSuiteResults(personaId);
    
    res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get suite results');
    res.status(500).json({ error: 'Failed to get suite results' });
  }
});

// ============================================================================
// HEALTH ENDPOINT
// ============================================================================

/**
 * GET /api/evalops/health
 * Get EvalOps system health
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    const fingerprintSummary = getPersonaFingerprintSummary();
    const scenarioStats = getScenarioStats();
    const flags = getEvalOpsFlags();
    const metrics = getEvalMetrics();

    res.json({
      success: true,
      status: 'healthy',
      evalops_version: '1.0.0',
      enabled: flags.enabled,
      sample_rate: flags.sampleRateOverride ?? 5,
      personas_configured: Object.keys(fingerprintSummary).length,
      total_scenarios: scenarioStats.total,
      critical_scenarios: scenarioStats.bySeverity['critical'] || 0,
      categories: Object.keys(scenarioStats.byCategory),
      fingerprint_summary: fingerprintSummary,
      metrics: {
        total_evaluations: metrics.totalEvaluations,
        flagged_responses: metrics.flaggedResponses,
        average_score: metrics.averageScore,
        errors: metrics.errors,
      },
      flags,
    });
  } catch (error) {
    log.error({ error }, 'Health check failed');
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: String(error),
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
export { router as evalopsRouter };

