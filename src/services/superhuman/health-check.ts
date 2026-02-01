/**
 * Superhuman Services Health Check
 *
 * Centralized health checking for all "Better Than Human" services.
 * Used by:
 * - `/health/bth` endpoint for monitoring
 * - Alerting system for proactive notifications
 * - Admin dashboard for status overview
 *
 * @module services/superhuman/health-check
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SuperhumanHealthCheck' });

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceHealth {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  message?: string;
  lastCheck: Date;
}

export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    avgLatencyMs: number;
  };
}

// ============================================================================
// SERVICE DEFINITIONS
// ============================================================================

const SERVICES = [
  { id: 'commitment-keeper', name: 'Commitment Keeper' },
  { id: 'learning-engine', name: 'Learning Engine' },
  { id: 'memory-consolidation', name: 'Memory Consolidation' },
  { id: 'proactive-outreach', name: 'Proactive Outreach' },
  { id: 'our-songs', name: 'Our Songs' },
  { id: 'emotional-intelligence', name: 'Emotional Intelligence' },
  { id: 'cross-persona', name: 'Cross-Persona Intelligence' },
  { id: 'predictive-coaching', name: 'Predictive Coaching' },
  { id: 'values-alignment', name: 'Values Alignment' },
  { id: 'capacity-guardian', name: 'Capacity Guardian' },
];

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

async function checkService(serviceId: string): Promise<ServiceHealth> {
  const service = SERVICES.find((s) => s.id === serviceId);
  const startTime = Date.now();

  if (!service) {
    return {
      id: serviceId,
      name: 'Unknown',
      status: 'unknown',
      latencyMs: 0,
      message: 'Service not found',
      lastCheck: new Date(),
    };
  }

  try {
    switch (serviceId) {
      case 'commitment-keeper': {
        const { detectCommitment } = await import('./commitment-keeper.js');
        const result = detectCommitment('I will exercise', 'health-check', {});
        return {
          id: serviceId,
          name: service.name,
          status: result.detected ? 'healthy' : 'degraded',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'learning-engine': {
        const { LearningEngine } = await import('../../memory/learning-engine.js');
        const engine = new LearningEngine();
        return {
          id: serviceId,
          name: service.name,
          status: engine ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'memory-consolidation': {
        const { getMemoryConsolidator } = await import('../../memory/memory-consolidator.js');
        const consolidator = getMemoryConsolidator();
        return {
          id: serviceId,
          name: service.name,
          status: consolidator ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'proactive-outreach': {
        const { getOutreachOrchestrator } = await import('../outreach/outreach-orchestrator.js');
        const orchestrator = getOutreachOrchestrator();
        return {
          id: serviceId,
          name: service.name,
          status: orchestrator ? 'healthy' : 'degraded',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'our-songs': {
        const { detectSignificantMoment } = await import('../trust-systems/our-songs.js');
        const result = detectSignificantMoment({
          recentUserText: 'This song reminds me of a special moment',
          emotion: 'joy',
          isUserSpeaking: true,
        });
        return {
          id: serviceId,
          name: service.name,
          status: typeof result.isSignificant === 'boolean' ? 'healthy' : 'degraded',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'emotional-intelligence': {
        const { detectEmotionalState } =
          await import('../../tools/semantic-router/shared-vocabulary.js');
        const result = detectEmotionalState('I feel so overwhelmed and stressed');
        return {
          id: serviceId,
          name: service.name,
          status: result?.found ? 'healthy' : 'degraded',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'cross-persona': {
        const { addCrossPersonaInsight } =
          await import('../cross-persona/cross-persona-insights.js');
        return {
          id: serviceId,
          name: service.name,
          status: typeof addCrossPersonaInsight === 'function' ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'predictive-coaching': {
        const { getPatternPrediction } =
          await import('./semantic-intelligence/temporal-patterns.js');
        return {
          id: serviceId,
          name: service.name,
          status: typeof getPatternPrediction === 'function' ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'values-alignment': {
        const valuesModule = await import('./values-alignment.js');
        return {
          id: serviceId,
          name: service.name,
          status: valuesModule ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      case 'capacity-guardian': {
        const capacityModule = await import('./capacity-guardian.js');
        return {
          id: serviceId,
          name: service.name,
          status: capacityModule ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          lastCheck: new Date(),
        };
      }

      default:
        return {
          id: serviceId,
          name: service.name,
          status: 'unknown',
          latencyMs: Date.now() - startTime,
          message: 'Health check not implemented',
          lastCheck: new Date(),
        };
    }
  } catch (error) {
    return {
      id: serviceId,
      name: service.name,
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      message: String(error),
      lastCheck: new Date(),
    };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check health of all superhuman services
 */
export async function checkSuperhumanServicesHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  const healthChecks = await Promise.allSettled(SERVICES.map((s) => checkService(s.id)));

  const services: ServiceHealth[] = healthChecks.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      id: SERVICES[index].id,
      name: SERVICES[index].name,
      status: 'unhealthy' as const,
      latencyMs: 0,
      message: String(result.reason),
      lastCheck: new Date(),
    };
  });

  const healthyCount = services.filter((s) => s.status === 'healthy').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;

  const avgLatencyMs = services.reduce((sum, s) => sum + s.latencyMs, 0) / services.length;

  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (unhealthyCount > services.length / 2) {
    overall = 'unhealthy';
  } else if (unhealthyCount > 0 || degradedCount > services.length / 4) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  const result: HealthCheckResult = {
    overall,
    timestamp: new Date(),
    services,
    summary: {
      total: services.length,
      healthy: healthyCount,
      degraded: degradedCount,
      unhealthy: unhealthyCount,
      avgLatencyMs: Math.round(avgLatencyMs),
    },
  };

  log.info(
    {
      overall,
      healthy: healthyCount,
      degraded: degradedCount,
      unhealthy: unhealthyCount,
      totalMs: Date.now() - startTime,
    },
    '🧠 Superhuman services health check completed'
  );

  return result;
}

/**
 * Check health of a single service
 */
export async function checkServiceHealth(serviceId: string): Promise<ServiceHealth> {
  return checkService(serviceId);
}

/**
 * Get list of all monitored services
 */
export function getMonitoredServices(): typeof SERVICES {
  return SERVICES;
}

export default {
  checkSuperhumanServicesHealth,
  checkServiceHealth,
  getMonitoredServices,
};
