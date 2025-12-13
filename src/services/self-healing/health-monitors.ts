/**
 * Health Monitors for Critical Services
 *
 * Proactive health checking for LiveKit, Cartesia, Gemini, Firestore, etc.
 * Detects issues before they impact users.
 *
 * Features:
 * - Periodic health checks for each service
 * - Circuit breaker integration
 * - Anomaly detection integration
 * - Automatic alerting on degradation
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createCircuitBreaker } from './circuit-breaker.js';
import { recordLatency, recordSuccessRate } from './anomaly-detection.js';

const log = createLogger({ module: 'health-monitors' });

// ============================================================================
// TYPES
// ============================================================================

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  details?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthMonitor {
  name: string;
  displayName: string;
  category: 'voice' | 'ai' | 'database' | 'integration';
  criticalFor: ('dispatch' | 'session' | 'audio' | 'memory' | 'tools')[];
  check: () => Promise<HealthCheckResult>;
  lastResult?: HealthCheckResult;
  lastCheck?: number;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  monitors: Record<string, HealthCheckResult & { name: string; displayName: string }>;
  unhealthyServices: string[];
  recommendations: string[];
}

// ============================================================================
// HEALTH CHECK IMPLEMENTATIONS
// ============================================================================

/**
 * LiveKit health check - verify WebSocket connection
 */
async function checkLiveKit(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Check if we have LiveKit credentials
    const url = process.env.LIVEKIT_URL;
    if (!url) {
      return {
        healthy: false,
        latencyMs: 0,
        error: 'LIVEKIT_URL not configured',
      };
    }

    // Convert WSS URL to HTTPS for health check
    const healthUrl = url.replace('wss://', 'https://').replace('ws://', 'http://');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(healthUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      
      return {
        healthy: response.ok || response.status === 404, // 404 is fine - just checking connectivity
        latencyMs,
        details: `Status: ${response.status}`,
        metadata: { url: healthUrl },
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Cartesia TTS health check - verify API connectivity
 */
async function checkCartesia(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      return {
        healthy: false,
        latencyMs: 0,
        error: 'CARTESIA_API_KEY not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      // Cartesia voices endpoint as health check
      const response = await fetch('https://api.cartesia.ai/voices', {
        method: 'HEAD',
        headers: { 'X-API-Key': apiKey },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      
      return {
        healthy: response.ok,
        latencyMs,
        details: `Status: ${response.status}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gemini AI health check - verify API connectivity
 */
async function checkGemini(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return {
        healthy: false,
        latencyMs: 0,
        error: 'GOOGLE_API_KEY not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      // List models endpoint as health check
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        {
          method: 'GET',
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      
      return {
        healthy: response.ok,
        latencyMs,
        details: `Status: ${response.status}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Firestore health check - verify database connectivity
 */
async function checkFirestore(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Dynamic import to avoid loading Firebase unless needed
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    
    // Initialize if not already
    if (getApps().length === 0) {
      initializeApp();
    }
    
    const db = getFirestore();
    
    // Simple read operation to verify connectivity
    const testRef = db.collection('_health_check').doc('test');
    await testRef.get();
    
    const latencyMs = Date.now() - start;
    
    return {
      healthy: true,
      latencyMs,
      details: 'Connected to Firestore',
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Deepgram STT health check - verify API connectivity
 */
async function checkDeepgram(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return {
        healthy: false,
        latencyMs: 0,
        error: 'DEEPGRAM_API_KEY not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      // Projects endpoint as health check
      const response = await fetch('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: { Authorization: `Token ${apiKey}` },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      
      return {
        healthy: response.ok,
        latencyMs,
        details: `Status: ${response.status}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * OpenAI health check - verify API connectivity
 */
async function checkOpenAI(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        healthy: false,
        latencyMs: 0,
        error: 'OPENAI_API_KEY not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      // Models endpoint as health check
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      
      return {
        healthy: response.ok,
        latencyMs,
        details: `Status: ${response.status}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Memory health check - verify process memory usage
 */
async function checkMemory(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const rssMB = usage.rss / 1024 / 1024;
    
    // Consider unhealthy if heap usage > 1.5GB or > 90% of total
    const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;
    const healthy = heapUsedMB < 1500 && heapPercent < 90;
    
    return {
      healthy,
      latencyMs: Date.now() - start,
      details: `Heap: ${heapUsedMB.toFixed(0)}MB (${heapPercent.toFixed(1)}%), RSS: ${rssMB.toFixed(0)}MB`,
      metadata: {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        heapPercent: Math.round(heapPercent),
        rssMB: Math.round(rssMB),
      },
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Spotify health check - verify API connectivity (optional service)
 */
async function checkSpotify(): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      return {
        healthy: true, // Optional service - not having it is fine
        latencyMs: 0,
        details: 'Spotify not configured (optional)',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      // Check Spotify API availability
      const response = await fetch('https://api.spotify.com/v1/browse/categories?limit=1', {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      
      // 401 is expected without auth - just checking connectivity
      return {
        healthy: response.status === 401 || response.ok,
        latencyMs,
        details: `Status: ${response.status}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// MONITOR REGISTRY
// ============================================================================

const monitors: HealthMonitor[] = [
  {
    name: 'livekit',
    displayName: 'LiveKit (Voice)',
    category: 'voice',
    criticalFor: ['dispatch', 'session', 'audio'],
    check: checkLiveKit,
  },
  {
    name: 'cartesia',
    displayName: 'Cartesia (TTS)',
    category: 'voice',
    criticalFor: ['audio'],
    check: checkCartesia,
  },
  {
    name: 'deepgram',
    displayName: 'Deepgram (STT)',
    category: 'voice',
    criticalFor: ['audio'],
    check: checkDeepgram,
  },
  {
    name: 'gemini',
    displayName: 'Gemini AI',
    category: 'ai',
    criticalFor: ['session', 'tools'],
    check: checkGemini,
  },
  {
    name: 'openai',
    displayName: 'OpenAI',
    category: 'ai',
    criticalFor: ['session'],
    check: checkOpenAI,
  },
  {
    name: 'firestore',
    displayName: 'Firestore (Database)',
    category: 'database',
    criticalFor: ['memory', 'session'],
    check: checkFirestore,
  },
  {
    name: 'memory',
    displayName: 'Process Memory',
    category: 'integration',
    criticalFor: ['session'],
    check: checkMemory,
  },
  {
    name: 'spotify',
    displayName: 'Spotify (Music)',
    category: 'integration',
    criticalFor: ['tools'],
    check: checkSpotify,
  },
];

// Circuit breakers for health checks themselves
const healthCircuits = new Map<string, ReturnType<typeof createCircuitBreaker>>();

function getHealthCircuit(name: string) {
  if (!healthCircuits.has(name)) {
    healthCircuits.set(
      name,
      createCircuitBreaker(`health:${name}`, {
        failureThreshold: 3,
        recoveryTimeout: 60000, // 1 minute
        successThreshold: 1,
      })
    );
  }
  return healthCircuits.get(name)!;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Run health check for a specific service
 */
export async function checkServiceHealth(serviceName: string): Promise<HealthCheckResult | null> {
  const monitor = monitors.find((m) => m.name === serviceName);
  if (!monitor) {
    return null;
  }

  const circuit = getHealthCircuit(serviceName);
  
  try {
    const result = await circuit.execute(async () => monitor.check());
    
    // Record metrics for anomaly detection
    recordLatency(`health:${serviceName}`, result.latencyMs);
    recordSuccessRate(`health:${serviceName}`, result.healthy ? 100 : 0);
    
    // Cache result
    monitor.lastResult = result;
    monitor.lastCheck = Date.now();
    
    return result;
  } catch (error) {
    // Circuit is open or check failed
    const result: HealthCheckResult = {
      healthy: false,
      latencyMs: 0,
      error: error instanceof Error ? error.message : 'Health check circuit open',
    };
    
    monitor.lastResult = result;
    monitor.lastCheck = Date.now();
    
    return result;
  }
}

/**
 * Run all health checks
 */
export async function runAllHealthChecks(): Promise<HealthStatus> {
  const results = await Promise.allSettled(
    monitors.map(async (monitor) => {
      const result = await checkServiceHealth(monitor.name);
      return {
        name: monitor.name,
        displayName: monitor.displayName,
        result: result || {
          healthy: false,
          latencyMs: 0,
          error: 'Check failed',
        },
      };
    })
  );

  const monitorResults: Record<string, HealthCheckResult & { name: string; displayName: string }> = {};
  const unhealthyServices: string[] = [];
  const recommendations: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { name, displayName, result: checkResult } = result.value;
      monitorResults[name] = { ...checkResult, name, displayName };
      
      if (!checkResult.healthy) {
        unhealthyServices.push(displayName);
        
        // Add recommendations based on service
        const monitor = monitors.find((m) => m.name === name);
        if (monitor) {
          const criticalText = monitor.criticalFor.join(', ');
          recommendations.push(
            `${displayName} is unhealthy (affects ${criticalText}): ${checkResult.error || checkResult.details || 'Unknown issue'}`
          );
        }
      }
    }
  }

  // Determine overall status
  let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
  
  // Critical if any voice services are down
  const criticalServices = ['livekit', 'cartesia', 'gemini'];
  const criticalDown = criticalServices.some((s) => !monitorResults[s]?.healthy);
  
  if (criticalDown) {
    overall = 'critical';
  } else if (unhealthyServices.length > 0) {
    overall = 'degraded';
  }

  log.info(
    { overall, unhealthyCount: unhealthyServices.length },
    'Health check complete'
  );

  return {
    overall,
    timestamp: new Date().toISOString(),
    monitors: monitorResults,
    unhealthyServices,
    recommendations,
  };
}

/**
 * Check if a specific capability is available
 */
export function isCapabilityHealthy(
  capability: 'dispatch' | 'session' | 'audio' | 'memory' | 'tools'
): boolean {
  for (const monitor of monitors) {
    if (monitor.criticalFor.includes(capability)) {
      if (monitor.lastResult && !monitor.lastResult.healthy) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get cached health status (doesn't run new checks)
 */
export function getCachedHealthStatus(): HealthStatus {
  const monitorResults: Record<string, HealthCheckResult & { name: string; displayName: string }> = {};
  const unhealthyServices: string[] = [];
  const recommendations: string[] = [];

  for (const monitor of monitors) {
    if (monitor.lastResult) {
      monitorResults[monitor.name] = {
        ...monitor.lastResult,
        name: monitor.name,
        displayName: monitor.displayName,
      };
      
      if (!monitor.lastResult.healthy) {
        unhealthyServices.push(monitor.displayName);
      }
    }
  }

  const criticalServices = ['livekit', 'cartesia', 'gemini'];
  const criticalDown = criticalServices.some((s) => !monitorResults[s]?.healthy);
  
  let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (criticalDown) {
    overall = 'critical';
  } else if (unhealthyServices.length > 0) {
    overall = 'degraded';
  }

  return {
    overall,
    timestamp: new Date().toISOString(),
    monitors: monitorResults,
    unhealthyServices,
    recommendations,
  };
}

/**
 * Get list of all monitors
 */
export function getMonitors(): readonly HealthMonitor[] {
  return monitors;
}

// ============================================================================
// BACKGROUND MONITORING
// ============================================================================

let monitoringInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start background health monitoring
 */
export function startHealthMonitoring(intervalMs: number = 60000): void {
  if (monitoringInterval) {
    return; // Already running
  }

  log.info({ intervalMs }, 'Starting health monitoring');

  // Run initial check
  runAllHealthChecks().catch((error) => {
    log.error({ error }, 'Initial health check failed');
  });

  // Schedule periodic checks
  monitoringInterval = setInterval(() => {
    runAllHealthChecks().catch((error) => {
      log.error({ error }, 'Periodic health check failed');
    });
  }, intervalMs);
}

/**
 * Stop background health monitoring
 */
export function stopHealthMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    log.info('Stopped health monitoring');
  }
}

/**
 * Check if monitoring is running
 */
export function isMonitoringActive(): boolean {
  return monitoringInterval !== null;
}

