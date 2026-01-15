/**
 * BTH (Better Than Human) Validation API Routes
 *
 * Provides endpoints for validating and monitoring all "Better Than Human"
 * superhuman capabilities. Used by:
 * - Admin dashboard for monitoring
 * - E2E tests for validation
 * - Alerting system for health checks
 *
 * Endpoints:
 * - GET /api/bth/health - Health status of all services
 * - GET /api/bth/capabilities - List all capabilities and their status
 * - GET /api/bth/validation/:userId - Validate BTH for a specific user
 * - POST /api/admin/bth/test/:serviceId - Test a specific service
 *
 * @module api/bth-validation-routes
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../utils/safe-logger.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'BTHValidationRoutes' });
const router = Router();

// ============================================================================
// TYPES
// ============================================================================

interface ServiceHealth {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: string;
  latencyMs?: number;
  errorRate?: number;
  message?: string;
}

interface CapabilityStatus {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  stats?: {
    label: string;
    value: string | number;
  };
}

interface UserValidationResult {
  userId: string;
  timestamp: string;
  overall: 'pass' | 'partial' | 'fail';
  capabilities: Array<{
    id: string;
    name: string;
    status: 'pass' | 'fail' | 'skip';
    message: string;
    details?: Record<string, unknown>;
  }>;
  recommendations: string[];
}

// ============================================================================
// SERVICE DEFINITIONS
// ============================================================================

const SUPERHUMAN_SERVICES: Array<{
  id: string;
  name: string;
  description: string;
  healthCheck: () => Promise<ServiceHealth>;
}> = [
  {
    id: 'commitment-keeper',
    name: 'Commitment Keeper',
    description: 'Tracks user commitments and follow-ups',
    healthCheck: async () => checkCommitmentKeeperHealth(),
  },
  {
    id: 'learning-engine',
    name: 'Learning Engine',
    description: 'Adapts memory surfacing based on reactions',
    healthCheck: async () => checkLearningEngineHealth(),
  },
  {
    id: 'proactive-outreach',
    name: 'Proactive Outreach',
    description: 'Thinking of you moments',
    healthCheck: async () => checkOutreachHealth(),
  },
  {
    id: 'memory-consolidation',
    name: 'Memory Consolidation',
    description: 'Unifies related memories',
    healthCheck: async () => checkMemoryConsolidationHealth(),
  },
  {
    id: 'our-songs',
    name: 'Our Songs',
    description: 'Musical memory callbacks',
    healthCheck: async () => checkOurSongsHealth(),
  },
  {
    id: 'emotional-intelligence',
    name: 'Emotional Intelligence',
    description: 'Reading between lines',
    healthCheck: async () => checkEmotionalIntelligenceHealth(),
  },
  {
    id: 'cross-persona',
    name: 'Cross-Persona Intelligence',
    description: 'Team coordination',
    healthCheck: async () => checkCrossPersonaHealth(),
  },
  {
    id: 'predictive-coaching',
    name: 'Predictive Coaching',
    description: 'Anticipates user needs',
    healthCheck: async () => checkPredictiveCoachingHealth(),
  },
];

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

async function checkCommitmentKeeperHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { detectCommitment } = await import('../services/superhuman/commitment-keeper.js');
    // Simple smoke test
    const result = detectCommitment('I promise to exercise', 'test-user', {});
    return {
      id: 'commitment-keeper',
      name: 'Commitment Keeper',
      status: result.detected ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'commitment-keeper',
      name: 'Commitment Keeper',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkLearningEngineHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { LearningEngine } = await import('../memory/learning-engine.js');
    const engine = new LearningEngine();
    // Simple smoke test - just verify the engine can be instantiated
    return {
      id: 'learning-engine',
      name: 'Learning Engine',
      status: engine ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'learning-engine',
      name: 'Learning Engine',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkOutreachHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { getOutreachOrchestrator } =
      await import('../services/outreach/outreach-orchestrator.js');
    const orchestrator = getOutreachOrchestrator();
    // Just verify the orchestrator is instantiated
    return {
      id: 'proactive-outreach',
      name: 'Proactive Outreach',
      status: orchestrator ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'proactive-outreach',
      name: 'Proactive Outreach',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkMemoryConsolidationHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { getMemoryConsolidator } = await import('../memory/memory-consolidator.js');
    const consolidator = getMemoryConsolidator();
    return {
      id: 'memory-consolidation',
      name: 'Memory Consolidation',
      status: consolidator ? 'healthy' : 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'memory-consolidation',
      name: 'Memory Consolidation',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkOurSongsHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { detectSignificantMoment } = await import('../services/trust-systems/our-songs.js');
    // Simple smoke test - detectSignificantMoment expects ConversationContext
    const moment = detectSignificantMoment({
      recentUserText: 'This song is amazing, it reminds me of when I got engaged!',
      emotion: 'joy',
      isUserSpeaking: true,
    });
    return {
      id: 'our-songs',
      name: 'Our Songs',
      status: typeof moment.isSignificant === 'boolean' ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'our-songs',
      name: 'Our Songs',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkEmotionalIntelligenceHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { detectEmotionalState } = await import('../tools/semantic-router/shared-vocabulary.js');
    const emotion = detectEmotionalState('I feel so overwhelmed and stressed');
    return {
      id: 'emotional-intelligence',
      name: 'Emotional Intelligence',
      status: emotion?.found ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'emotional-intelligence',
      name: 'Emotional Intelligence',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkCrossPersonaHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { addCrossPersonaInsight } = await import('../services/cross-persona-insights.js');
    return {
      id: 'cross-persona',
      name: 'Cross-Persona Intelligence',
      status: typeof addCrossPersonaInsight === 'function' ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'cross-persona',
      name: 'Cross-Persona Intelligence',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

async function checkPredictiveCoachingHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const { getPatternPrediction } =
      await import('../services/superhuman/semantic-intelligence/temporal-patterns.js');
    return {
      id: 'predictive-coaching',
      name: 'Predictive Coaching',
      status: typeof getPatternPrediction === 'function' ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: 'predictive-coaching',
      name: 'Predictive Coaching',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      message: String(error),
    };
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/bth/health
 * Health status of all BTH services
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const healthChecks = await Promise.allSettled(SUPERHUMAN_SERVICES.map((s) => s.healthCheck()));

    const services: ServiceHealth[] = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        id: SUPERHUMAN_SERVICES[index].id,
        name: SUPERHUMAN_SERVICES[index].name,
        status: 'unhealthy' as const,
        lastCheck: new Date().toISOString(),
        message: String(result.reason),
      };
    });

    const healthyCount = services.filter((s) => s.status === 'healthy').length;
    const overallStatus =
      healthyCount === services.length
        ? 'healthy'
        : healthyCount > services.length / 2
          ? 'degraded'
          : 'unhealthy';

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
      summary: {
        total: services.length,
        healthy: healthyCount,
        degraded: services.filter((s) => s.status === 'degraded').length,
        unhealthy: services.filter((s) => s.status === 'unhealthy').length,
      },
    });
  } catch (error) {
    log.error({ error: String(error) }, 'BTH health check failed');
    res.status(500).json({ error: 'Health check failed' });
  }
});

/**
 * GET /api/bth/capabilities
 * List all capabilities and their status for the current user
 */
router.get('/capabilities', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;

    const capabilities: CapabilityStatus[] = [
      {
        id: 'perfect-memory',
        name: 'Perfect Memory',
        description: 'Never forgets what you share',
        isActive: true,
      },
      {
        id: 'proactive-outreach',
        name: 'Thinking of You',
        description: 'Reaches out when you need support',
        isActive: true,
      },
      {
        id: 'learning-engine',
        name: 'Learns Your Patterns',
        description: 'Adapts to your preferences',
        isActive: true,
      },
      {
        id: 'commitment-keeper',
        name: 'Never Lets You Down',
        description: 'Remembers your commitments',
        isActive: true,
      },
      {
        id: 'musical-memory',
        name: 'Our Songs',
        description: 'Remembers your musical moments',
        isActive: true,
      },
      {
        id: 'emotional-intelligence',
        name: 'Reads Between Lines',
        description: 'Hears what you are not saying',
        isActive: true,
      },
    ];

    // If we have a userId, get stats for each capability
    if (userId) {
      const db = getFirestoreDb();
      if (db) {
        // Get memory count
        const memoriesSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('memories')
          .count()
          .get();
        const memoryCount = memoriesSnap.data().count;
        capabilities[0].stats = { label: 'memories stored', value: memoryCount };

        // Get commitment count
        const commitmentsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('commitments')
          .where('status', '==', 'active')
          .count()
          .get();
        const commitmentCount = commitmentsSnap.data().count;
        capabilities[3].stats = { label: 'active commitments', value: commitmentCount };

        // Get our songs count
        const songsSnap = await db
          .collection('bogle_users')
          .doc(userId)
          .collection('our_songs')
          .count()
          .get();
        const songCount = songsSnap.data().count;
        capabilities[4].stats = { label: 'shared songs', value: songCount };
      }
    }

    res.json({ capabilities });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get capabilities');
    res.status(500).json({ error: 'Failed to get capabilities' });
  }
});

/**
 * GET /api/bth/validation/:userId
 * Validate BTH capabilities for a specific user
 */
router.get('/validation/:userId', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const result: UserValidationResult = {
      userId,
      timestamp: new Date().toISOString(),
      overall: 'pass',
      capabilities: [],
      recommendations: [],
    };

    const db = getFirestoreDb();
    if (!db) {
      res.status(503).json({ error: 'Database not available' });
      return;
    }

    // Validate Perfect Memory
    const memoriesSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .limit(1)
      .get();

    result.capabilities.push({
      id: 'perfect-memory',
      name: 'Perfect Memory',
      status: memoriesSnap.empty ? 'skip' : 'pass',
      message: memoriesSnap.empty
        ? 'No memories stored yet - share something with Ferni!'
        : 'Memories are being stored correctly',
    });

    // Validate Commitment Keeper
    const commitmentsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('commitments')
      .limit(1)
      .get();

    result.capabilities.push({
      id: 'commitment-keeper',
      name: 'Commitment Keeper',
      status: commitmentsSnap.empty ? 'skip' : 'pass',
      message: commitmentsSnap.empty
        ? 'No commitments tracked yet'
        : 'Commitments are being tracked',
    });

    // Validate Our Songs
    const songsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('our_songs')
      .limit(1)
      .get();

    result.capabilities.push({
      id: 'our-songs',
      name: 'Our Songs',
      status: songsSnap.empty ? 'skip' : 'pass',
      message: songsSnap.empty
        ? 'No shared songs yet - listen to music during a meaningful moment!'
        : 'Musical memories are being captured',
    });

    // Validate Learning Engine
    const learningsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('learning_profile')
      .limit(1)
      .get();

    result.capabilities.push({
      id: 'learning-engine',
      name: 'Learning Engine',
      status: learningsSnap.empty ? 'skip' : 'pass',
      message: learningsSnap.empty
        ? 'Still learning your preferences'
        : 'Preferences are being learned',
    });

    // Validate Outreach Preferences
    const userDoc = await db.collection('bogle_users').doc(userId).get();
    const userData = userDoc.data();
    const outreachEnabled = userData?.outreachPreferences?.enabled ?? false;

    result.capabilities.push({
      id: 'proactive-outreach',
      name: 'Proactive Outreach',
      status: outreachEnabled ? 'pass' : 'skip',
      message: outreachEnabled
        ? 'Proactive check-ins are enabled'
        : 'Enable proactive check-ins in settings',
    });

    // Calculate overall status
    const failCount = result.capabilities.filter((c) => c.status === 'fail').length;
    const passCount = result.capabilities.filter((c) => c.status === 'pass').length;

    if (failCount > 0) {
      result.overall = 'fail';
    } else if (passCount === 0) {
      result.overall = 'partial';
    }

    // Add recommendations
    if (memoriesSnap.empty) {
      result.recommendations.push(
        'Share something personal with Ferni to start building your memory together'
      );
    }
    if (!outreachEnabled) {
      result.recommendations.push(
        'Enable proactive check-ins to let Ferni reach out when you might need support'
      );
    }
    if (songsSnap.empty) {
      result.recommendations.push(
        'Play music during a conversation about something meaningful to create shared musical memories'
      );
    }

    res.json(result);
  } catch (error) {
    log.error({ error: String(error), userId }, 'BTH validation failed');
    res.status(500).json({ error: 'Validation failed' });
  }
});

/**
 * POST /api/admin/bth/test/:serviceId
 * Test a specific BTH service (admin only)
 */
router.post('/admin/bth/test/:serviceId', async (req: Request, res: Response): Promise<void> => {
  const { serviceId } = req.params;

  const service = SUPERHUMAN_SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }

  try {
    const health = await service.healthCheck();

    res.json({
      success: health.status === 'healthy',
      message:
        health.status === 'healthy'
          ? `${service.name} is working correctly`
          : `${service.name} has issues: ${health.message}`,
      details: {
        status: health.status,
        latencyMs: health.latencyMs,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      message: `Test failed: ${error}`,
    });
  }
});

/**
 * GET /api/admin/bth/health
 * Admin health dashboard data
 */
router.get('/admin/bth/health', async (_req: Request, res: Response) => {
  try {
    const healthChecks = await Promise.allSettled(SUPERHUMAN_SERVICES.map((s) => s.healthCheck()));

    const services: ServiceHealth[] = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        id: SUPERHUMAN_SERVICES[index].id,
        name: SUPERHUMAN_SERVICES[index].name,
        status: 'unhealthy' as const,
        lastCheck: new Date().toISOString(),
        message: String(result.reason),
      };
    });

    // Get metrics from observability (if available)
    const metrics: Array<{
      serviceId: string;
      totalCalls: number;
      successRate: number;
      avgLatencyMs: number;
      p99LatencyMs: number;
      last24hCalls: number;
    }> = [];

    res.json({ services, metrics });
  } catch (error) {
    log.error({ error: String(error) }, 'Admin health check failed');
    res.status(500).json({ error: 'Health check failed' });
  }
});

export default router;
export { router as bthValidationRoutes };
