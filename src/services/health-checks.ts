/**
 * Service Health Checks
 *
 * Provides health check functions for all major services.
 * Used by monitoring, deployment validation, and API endpoints.
 *
 * @module services/health-checks
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'HealthChecks' });

// ============================================================================
// TYPES
// ============================================================================

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemHealthReport {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

// ============================================================================
// INDIVIDUAL SERVICE HEALTH CHECKS
// ============================================================================

/**
 * Check trust systems health
 */
export async function checkTrustSystemsHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  const testUserId = `health-check-${Date.now()}`;

  try {
    const { buildTrustContext, detectUnsaidSignals } = await import('./trust-systems/index.js');

    // Test building trust context
    const context = buildTrustContext(testUserId, 'Test message for health check', {
      currentTopic: 'health-check',
      detectedEmotion: 'neutral',
    });

    // Test signal detection
    const signals = detectUnsaidSignals(testUserId, 'Test message', {});

    if (!context || signals === undefined) {
      return {
        service: 'trust-systems',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Trust context building returned incomplete data',
      };
    }

    return {
      service: 'trust-systems',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        contextBuilt: true,
        signalDetection: true,
      },
    };
  } catch (error) {
    return {
      service: 'trust-systems',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check outreach system health
 */
export async function checkOutreachHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { generateTextMessage, selectPersonaForOutreach, getTimingProfile } =
      await import('./outreach/index.js');

    // Test persona selection (only requires trigger type)
    const persona = selectPersonaForOutreach('thinking_of_you');

    // Test message generation (requires personaId, context, tone)
    const message = generateTextMessage(
      persona || 'ferni',
      {
        userId: 'health-check',
        userName: 'Test',
        relationshipStage: 'building',
        trigger: {
          type: 'thinking_of_you',
          reason: 'Health check',
          urgency: 'low',
        },
        context: {},
      },
      'casual'
    );

    // Test timing profile retrieval
    const timingProfile = getTimingProfile('health-check');

    if (!persona || !message) {
      return {
        service: 'outreach',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Outreach components returned incomplete data',
      };
    }

    return {
      service: 'outreach',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        personaSelection: true,
        messageGeneration: true,
        timingProfileAvailable: !!timingProfile,
      },
    };
  } catch (error) {
    return {
      service: 'outreach',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check observability system health
 */
export async function checkObservabilityHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { observabilityHub } = await import('./observability/hub.js');

    const snapshot = observabilityHub.getSnapshot(5);

    if (!snapshot || typeof snapshot.overallHealth !== 'number') {
      return {
        service: 'observability',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Observability snapshot incomplete',
      };
    }

    return {
      service: 'observability',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        overallHealth: snapshot.overallHealth,
        llmHealth: snapshot.llmHealth,
        connectionHealth: snapshot.connectionHealth,
        criticalAlerts: snapshot.criticalAlerts,
      },
    };
  } catch (error) {
    return {
      service: 'observability',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check persistence layer health
 */
export async function checkPersistenceHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  const testKey = `health-check-${Date.now()}`;

  try {
    const { getGlobalServicesSync } = await import('./global-services.js');
    const services = getGlobalServicesSync();

    if (!services?.store) {
      return {
        service: 'persistence',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Store not initialized',
      };
    }

    // Test basic read/write
    const testProfile = { id: testKey, name: 'Health Check', created: new Date() };

    // Write test
    await services.store.saveProfile(testProfile as never);

    // Read test
    const retrieved = await services.store.getProfile(testKey);

    // Cleanup
    await services.store.deleteProfile(testKey);

    if (!retrieved) {
      return {
        service: 'persistence',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Read after write failed',
      };
    }

    return {
      service: 'persistence',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        storeType: services.store.constructor.name,
        readWriteTest: true,
      },
    };
  } catch (error) {
    return {
      service: 'persistence',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check cognitive intelligence health
 */
export async function checkCognitiveIntelligenceHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { detectDistortions, getGentleResponse, getUserDistortionStats } =
      await import('./cognitive-intelligence/index.js');

    // Test distortion detection
    const distortions = detectDistortions('health-check', 'I always fail at everything');

    if (!Array.isArray(distortions)) {
      return {
        service: 'cognitive-intelligence',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Distortion detection returned invalid data',
      };
    }

    // Test gentle response generation
    let responseGenerated = false;
    if (distortions.length > 0) {
      const response = getGentleResponse(distortions[0]);
      responseGenerated = !!response;
    }

    // Test stats retrieval
    const stats = getUserDistortionStats('health-check');

    return {
      service: 'cognitive-intelligence',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        distortionDetection: true,
        responseGeneration: responseGenerated || distortions.length === 0,
        statsAvailable: !!stats,
        detectedCount: distortions.length,
      },
    };
  } catch (error) {
    return {
      service: 'cognitive-intelligence',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check therapeutic frameworks health
 */
export async function checkTherapeuticFrameworksHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { detectChangeTalk, buildMIContext } =
      await import('./therapeutic-frameworks/motivational-interviewing.js');
    const { checkValuesAlignment } = await import('./therapeutic-frameworks/act-values.js');

    // Test MI change talk detection
    const changeTalk = detectChangeTalk('I want to change but it is hard');

    // Test MI context building
    const miContext = buildMIContext('health-check', 'I want to exercise more');

    // Test values alignment (will return hasValues: false for new user, but that's OK)
    const alignment = checkValuesAlignment('health-check', 'Test action');

    if (!alignment) {
      return {
        service: 'therapeutic-frameworks',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Therapeutic analysis returned incomplete data',
      };
    }

    return {
      service: 'therapeutic-frameworks',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        motivationalInterviewing: true,
        changeTalkDetection: changeTalk.length >= 0,
        actValues: true,
        miContextAvailable: miContext !== null,
      },
    };
  } catch (error) {
    return {
      service: 'therapeutic-frameworks',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check feature flags health
 */
export async function checkFeatureFlagsHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { getFeatureFlags } = await import('./feature-flags.js');

    const flags = getFeatureFlags();
    const allFlags = flags.getAllFlags();
    const flagCount = Object.keys(allFlags).length;

    if (flagCount === 0) {
      return {
        service: 'feature-flags',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'No feature flags loaded',
      };
    }

    return {
      service: 'feature-flags',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        flagCount,
        loaded: true,
      },
    };
  } catch (error) {
    return {
      service: 'feature-flags',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check session management health
 */
export async function checkSessionManagementHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { getActiveSessionCount, getActiveSessionIds } = await import('./session-manager.js');

    const count = getActiveSessionCount();
    const ids = getActiveSessionIds();

    return {
      service: 'session-management',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        activeSessions: count,
        sessionIdsAvailable: Array.isArray(ids),
      },
    };
  } catch (error) {
    return {
      service: 'session-management',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

/**
 * Check wellbeing tracking health
 */
export async function checkWellbeingTrackingHealth(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const wellbeing = await import('./wellbeing-tracking/index.js');

    // Just verify the module loads and exports expected functions
    const hasTracker = typeof wellbeing.wellbeingTracker === 'object';
    const hasDetection = typeof wellbeing.detectWellbeing === 'function';
    const hasProfile = typeof wellbeing.getWellbeingProfile === 'function';

    if (!hasTracker || !hasDetection) {
      return {
        service: 'wellbeing-tracking',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Missing expected exports',
      };
    }

    // Test detection
    const detected = wellbeing.detectWellbeing('I am feeling great today');

    return {
      service: 'wellbeing-tracking',
      status: 'healthy',
      latencyMs: Date.now() - start,
      details: {
        trackerAvailable: hasTracker,
        detectionAvailable: hasDetection,
        profileAvailable: hasProfile,
        testDetection: !!detected,
      },
    };
  } catch (error) {
    return {
      service: 'wellbeing-tracking',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: String(error),
    };
  }
}

// ============================================================================
// SYSTEM-WIDE HEALTH CHECK
// ============================================================================

/**
 * Run all health checks and return a comprehensive report
 */
export async function runAllHealthChecks(): Promise<SystemHealthReport> {
  log.info('Running all service health checks...');

  const checks = await Promise.allSettled([
    checkTrustSystemsHealth(),
    checkOutreachHealth(),
    checkObservabilityHealth(),
    checkPersistenceHealth(),
    checkCognitiveIntelligenceHealth(),
    checkTherapeuticFrameworksHealth(),
    checkFeatureFlagsHealth(),
    checkSessionManagementHealth(),
    checkWellbeingTrackingHealth(),
  ]);

  const results: HealthCheckResult[] = checks.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    const serviceNames = [
      'trust-systems',
      'outreach',
      'observability',
      'persistence',
      'cognitive-intelligence',
      'therapeutic-frameworks',
      'feature-flags',
      'session-management',
      'wellbeing-tracking',
    ];

    return {
      service: serviceNames[index],
      status: 'unhealthy' as const,
      latencyMs: 0,
      message: String(result.reason),
    };
  });

  const summary = {
    total: results.length,
    healthy: results.filter((r) => r.status === 'healthy').length,
    degraded: results.filter((r) => r.status === 'degraded').length,
    unhealthy: results.filter((r) => r.status === 'unhealthy').length,
  };

  // Determine overall status
  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (summary.unhealthy > 0) {
    overall = 'unhealthy';
  } else if (summary.degraded > 0) {
    overall = 'degraded';
  }

  const report: SystemHealthReport = {
    timestamp: new Date().toISOString(),
    overall,
    services: results,
    summary,
  };

  log.info(
    {
      overall,
      healthy: summary.healthy,
      degraded: summary.degraded,
      unhealthy: summary.unhealthy,
    },
    'Health check complete'
  );

  return report;
}

/**
 * Run critical health checks only (faster, for frequent polling)
 */
export async function runCriticalHealthChecks(): Promise<SystemHealthReport> {
  const checks = await Promise.allSettled([
    checkPersistenceHealth(),
    checkObservabilityHealth(),
    checkSessionManagementHealth(),
  ]);

  const results: HealthCheckResult[] = checks.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    const serviceNames = ['persistence', 'observability', 'session-management'];

    return {
      service: serviceNames[index],
      status: 'unhealthy' as const,
      latencyMs: 0,
      message: String(result.reason),
    };
  });

  const summary = {
    total: results.length,
    healthy: results.filter((r) => r.status === 'healthy').length,
    degraded: results.filter((r) => r.status === 'degraded').length,
    unhealthy: results.filter((r) => r.status === 'unhealthy').length,
  };

  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (summary.unhealthy > 0) {
    overall = 'unhealthy';
  } else if (summary.degraded > 0) {
    overall = 'degraded';
  }

  return {
    timestamp: new Date().toISOString(),
    overall,
    services: results,
    summary,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runAllHealthChecks,
  runCriticalHealthChecks,
  checkTrustSystemsHealth,
  checkOutreachHealth,
  checkObservabilityHealth,
  checkPersistenceHealth,
  checkCognitiveIntelligenceHealth,
  checkTherapeuticFrameworksHealth,
  checkFeatureFlagsHealth,
  checkSessionManagementHealth,
  checkWellbeingTrackingHealth,
};
