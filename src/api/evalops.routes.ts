/**
 * EvalOps API Handler
 *
 * > "Better than human" requires measurement - these routes expose it.
 *
 * Raw HTTP handler (matching ui-server.js pattern) for EvalOps API.
 *
 * Endpoints:
 *   GET  /api/evalops/health         - System health + metrics
 *   GET  /api/evalops/flags          - Get feature flags
 *   PUT  /api/evalops/flags          - Update feature flags
 *   GET  /api/evalops/metrics        - Evaluation metrics
 *   POST /api/evalops/metrics/reset  - Reset metrics
 *   GET  /api/evalops/evaluations    - Recent evaluations
 *   GET  /api/evalops/evaluations/flagged - Flagged responses
 *   GET  /api/evalops/fingerprints   - Persona fingerprints
 *   GET  /api/evalops/scenarios      - Test scenarios
 *   GET  /api/evalops/scenarios/stats - Scenario statistics
 *   POST /api/evalops/evaluate       - Full LLM evaluation
 *   POST /api/evalops/quick-check    - Quick voice check
 *   POST /api/evalops/run-scenario   - Run specific scenario
 *   POST /api/evalops/run-suite      - Run test suite
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getDimensionAverages,
  getEvalMetrics,
  getEvalOpsFlags,
  getFlaggedEvaluations,
  getRecentEvaluations,
  getSuiteResults,
  resetEvalMetrics,
  setEvalOpsFlags,
  type EvalOpsFeatureFlags,
} from '../services/evalops/automation.js';
import {
  ALL_TEST_SCENARIOS,
  evaluateResponse,
  evaluateVoiceConsistency,
  getCriticalScenarios,
  getPersonaFingerprint,
  getPersonaFingerprintSummary,
  getScenariosForPersona,
  getScenarioStats,
  quickHealthCheck,
  runAllScenariosForPersona,
  runScenario,
} from '../services/evalops/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAdmin } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'EvalOps-API' });

/**
 * Handle EvalOps API routes
 */
export async function handleEvalOpsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Only handle /api/evalops/* routes
  if (!pathname.startsWith('/api/evalops')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // All EvalOps routes require admin access
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // ========================================================================
    // HEALTH ENDPOINT
    // ========================================================================
    if (pathname === '/api/evalops/health' && method === 'GET') {
      const fingerprintSummary = getPersonaFingerprintSummary();
      const scenarioStats = getScenarioStats();
      const flags = getEvalOpsFlags();
      const metrics = getEvalMetrics();

      sendJSON(res, {
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
      return true;
    }

    // ========================================================================
    // FEATURE FLAGS ENDPOINTS
    // ========================================================================
    if (pathname === '/api/evalops/flags' && method === 'GET') {
      const flags = getEvalOpsFlags();
      sendJSON(res, { success: true, flags });
      return true;
    }

    if (pathname === '/api/evalops/flags' && method === 'PUT') {
      const body = await parseBody<Partial<EvalOpsFeatureFlags>>(req);

      const validKeys = [
        'enabled',
        'autoSampling',
        'voiceChecks',
        'llmEvaluation',
        'scheduledSuites',
        'alerting',
        'sampleRateOverride',
        'enabledPersonas',
      ];

      for (const key of Object.keys(body)) {
        if (!validKeys.includes(key)) {
          sendError(res, `Invalid flag key: ${key}`, 400);
          return true;
        }
      }

      setEvalOpsFlags(body);
      const newFlags = getEvalOpsFlags();
      log.info({ updates: body }, 'Feature flags updated via API');
      sendJSON(res, { success: true, flags: newFlags });
      return true;
    }

    // ========================================================================
    // METRICS ENDPOINTS
    // ========================================================================
    if (pathname === '/api/evalops/metrics' && method === 'GET') {
      const metrics = getEvalMetrics();
      sendJSON(res, { success: true, metrics });
      return true;
    }

    if (pathname === '/api/evalops/metrics/reset' && method === 'POST') {
      resetEvalMetrics();
      log.info('Evaluation metrics reset via API');
      sendJSON(res, { success: true, message: 'Metrics reset' });
      return true;
    }

    if (pathname === '/api/evalops/dimensions' && method === 'GET') {
      const dimensions = getDimensionAverages();
      sendJSON(res, { success: true, dimensions });
      return true;
    }

    // ========================================================================
    // EVALUATIONS ENDPOINTS
    // ========================================================================
    if (pathname === '/api/evalops/evaluations/flagged' && method === 'GET') {
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '20');
      const evaluations = await getFlaggedEvaluations(limit);
      sendJSON(res, { success: true, count: evaluations.length, evaluations });
      return true;
    }

    if (pathname === '/api/evalops/evaluations' && method === 'GET') {
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50');
      const personaId = parsedUrl.searchParams.get('persona_id') || undefined;
      const flaggedOnly = parsedUrl.searchParams.get('flagged') === 'true';

      const evaluations = flaggedOnly
        ? await getFlaggedEvaluations(limit)
        : await getRecentEvaluations(limit, { personaId, flagged: flaggedOnly || undefined });

      sendJSON(res, { success: true, count: evaluations.length, evaluations });
      return true;
    }

    // ========================================================================
    // FINGERPRINT ENDPOINTS
    // ========================================================================
    if (pathname.match(/^\/api\/evalops\/fingerprints\/[^/]+\/full$/) && method === 'GET') {
      const personaId = pathname.split('/')[4];
      const fingerprint = getPersonaFingerprint(personaId);

      if (!fingerprint) {
        sendError(res, `Fingerprint not found for: ${personaId}`, 404);
        return true;
      }

      sendJSON(res, { success: true, fingerprint });
      return true;
    }

    if (pathname === '/api/evalops/fingerprints' && method === 'GET') {
      const personaId = parsedUrl.searchParams.get('persona_id');

      if (personaId) {
        const fingerprint = getPersonaFingerprint(personaId);
        if (!fingerprint) {
          sendError(res, `Fingerprint not found for: ${personaId}`, 404);
          return true;
        }
        sendJSON(res, { success: true, fingerprint });
        return true;
      }

      const summary = getPersonaFingerprintSummary();
      sendJSON(res, { success: true, fingerprints: summary });
      return true;
    }

    // ========================================================================
    // SCENARIO ENDPOINTS
    // ========================================================================
    if (pathname === '/api/evalops/scenarios/stats' && method === 'GET') {
      const stats = getScenarioStats();
      sendJSON(res, { success: true, stats });
      return true;
    }

    if (
      pathname.match(/^\/api\/evalops\/scenarios\/[^/]+$/) &&
      !pathname.includes('stats') &&
      method === 'GET'
    ) {
      const scenarioId = pathname.split('/')[4];
      const scenario = ALL_TEST_SCENARIOS.find((s) => s.id === scenarioId);

      if (!scenario) {
        sendError(res, `Scenario not found: ${scenarioId}`, 404);
        return true;
      }

      sendJSON(res, { success: true, scenario });
      return true;
    }

    if (pathname === '/api/evalops/scenarios' && method === 'GET') {
      const personaId = parsedUrl.searchParams.get('persona_id');
      const category = parsedUrl.searchParams.get('category');
      const severity = parsedUrl.searchParams.get('severity');

      let scenarios = ALL_TEST_SCENARIOS;

      if (personaId) {
        scenarios = getScenariosForPersona(personaId);
      }
      if (category) {
        scenarios = scenarios.filter((s) => s.category === category);
      }
      if (severity) {
        scenarios = scenarios.filter((s) => s.severity === severity);
      }

      sendJSON(res, {
        success: true,
        count: scenarios.length,
        scenarios: scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          severity: s.severity,
          description: s.description,
          applicable_personas: s.applicablePersonas,
        })),
      });
      return true;
    }

    // ========================================================================
    // EVALUATION ENDPOINTS (POST)
    // ========================================================================
    if (pathname === '/api/evalops/evaluate' && method === 'POST') {
      const body = await parseBody<{
        user_message: string;
        ai_response: string;
        persona_id: string;
        conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        user_profile?: Record<string, unknown>;
        trust_context?: Record<string, unknown>;
        emotional_context?: Record<string, unknown>;
        turn_number?: number;
      }>(req);

      if (!body.user_message || !body.ai_response || !body.persona_id) {
        sendError(res, 'Missing required fields: user_message, ai_response, persona_id', 400);
        return true;
      }

      const fingerprint = getPersonaFingerprint(body.persona_id);
      if (!fingerprint) {
        sendError(res, `Unknown persona: ${body.persona_id}`, 400);
        return true;
      }

      const context = {
        personaId: body.persona_id,
        fingerprint,
        conversationHistory: body.conversation_history || [],
        userProfile: body.user_profile,
        trustContext: body.trust_context,
        emotionalContext: body.emotional_context,
        turnNumber: body.turn_number || 1,
      };

      log.info(
        { persona_id: body.persona_id, turn_number: body.turn_number },
        'Running full evaluation'
      );

      const evaluation = await evaluateResponse(body.user_message, body.ai_response, context);
      sendJSON(res, { success: true, evaluation });
      return true;
    }

    if (pathname === '/api/evalops/quick-check' && method === 'POST') {
      const body = await parseBody<{ response: string; persona_id: string }>(req);

      if (!body.response || !body.persona_id) {
        sendError(res, 'Missing required fields: response, persona_id', 400);
        return true;
      }

      const result = quickHealthCheck(body.response, body.persona_id);
      sendJSON(res, { success: true, ...result });
      return true;
    }

    if (pathname === '/api/evalops/voice-analysis' && method === 'POST') {
      const body = await parseBody<{ response: string; persona_id: string }>(req);

      if (!body.response || !body.persona_id) {
        sendError(res, 'Missing required fields: response, persona_id', 400);
        return true;
      }

      const { score, issues } = evaluateVoiceConsistency(body.response, body.persona_id);
      const fingerprint = getPersonaFingerprint(body.persona_id);

      sendJSON(res, {
        success: true,
        persona_id: body.persona_id,
        score,
        issues,
        fingerprint_summary: fingerprint
          ? {
              signature_phrases_count: fingerprint.signaturePhrases.length,
              anti_patterns_count: fingerprint.antiPatterns.length,
              warmth: fingerprint.emotionalTone.warmth,
              energy: fingerprint.emotionalTone.energy,
              reasoning_style: fingerprint.reasoningIndicators.style,
            }
          : null,
      });
      return true;
    }

    // ========================================================================
    // TEST SUITE ENDPOINTS
    // ========================================================================
    if (pathname === '/api/evalops/run-scenario' && method === 'POST') {
      const body = await parseBody<{
        scenario_id: string;
        persona_id: string;
        mock_response?: string;
      }>(req);

      if (!body.scenario_id || !body.persona_id) {
        sendError(res, 'Missing required fields: scenario_id, persona_id', 400);
        return true;
      }

      const scenario = ALL_TEST_SCENARIOS.find((s) => s.id === body.scenario_id);
      if (!scenario) {
        sendError(res, `Scenario not found: ${body.scenario_id}`, 404);
        return true;
      }

      if (body.mock_response) {
        const generateResponse = async () => body.mock_response!;
        const result = await runScenario(scenario, body.persona_id, generateResponse);
        sendJSON(res, { success: true, result });
      } else {
        sendJSON(res, {
          success: true,
          dry_run: true,
          scenario,
          message: 'Provide mock_response to actually run the scenario',
        });
      }
      return true;
    }

    if (pathname === '/api/evalops/run-suite' && method === 'POST') {
      const body = await parseBody<{
        persona_id: string;
        mock_responses?: Record<string, string>;
        critical_only?: boolean;
      }>(req);

      if (!body.persona_id) {
        sendError(res, 'Missing required field: persona_id', 400);
        return true;
      }

      if (!body.mock_responses || typeof body.mock_responses !== 'object') {
        const scenarios = body.critical_only
          ? getCriticalScenarios().filter(
              (s) =>
                s.applicablePersonas.length === 0 || s.applicablePersonas.includes(body.persona_id)
            )
          : getScenariosForPersona(body.persona_id);

        sendJSON(res, {
          success: true,
          dry_run: true,
          persona_id: body.persona_id,
          scenario_count: scenarios.length,
          scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, probe: s.probe })),
          message: 'Provide mock_responses object { scenario_id: response } to run suite',
        });
        return true;
      }

      const mockResponses = body.mock_responses;
      const generateResponse = async (probe: string): Promise<string> => {
        const scenario = ALL_TEST_SCENARIOS.find((s) => s.probe === probe);
        if (scenario && mockResponses[scenario.id]) {
          return mockResponses[scenario.id];
        }
        return mockResponses.default || 'No mock response provided';
      };

      const { results, summary } = await runAllScenariosForPersona(
        body.persona_id,
        generateResponse
      );

      sendJSON(res, {
        success: true,
        persona_id: body.persona_id,
        summary,
        results: results.map((r) => ({
          scenario_id: r.scenarioId,
          passed: r.passed,
          scores: r.scores,
          findings: r.findings,
        })),
      });
      return true;
    }

    // ========================================================================
    // SUITE RESULTS ENDPOINT
    // ========================================================================
    if (pathname === '/api/evalops/suite-results' && method === 'GET') {
      const personaId = parsedUrl.searchParams.get('persona_id') || undefined;
      const results = getSuiteResults(personaId);
      sendJSON(res, { success: true, count: results.length, results });
      return true;
    }

    // Route not found within /api/evalops
    sendError(res, `Unknown EvalOps endpoint: ${pathname}`, 404);
    return true;
  } catch (error) {
    log.error({ error, pathname }, 'EvalOps route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
