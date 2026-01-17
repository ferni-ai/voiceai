/**
 * Firestore Availability Monitor
 *
 * Tracks when services fall back to in-memory storage and provides
 * metrics for observability. This helps detect infrastructure issues
 * that cause data loss.
 *
 * @module services/observability/firestore-monitor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'firestore-monitor' });

// ============================================================================
// TYPES
// ============================================================================

interface FallbackEvent {
  service: string;
  reason: string;
  timestamp: Date;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

interface FirestoreHealthMetrics {
  isAvailable: boolean;
  lastCheckTime: Date;
  totalFallbacks: number;
  fallbacksByService: Record<string, number>;
  recentFallbacks: FallbackEvent[];
  affectedServices: string[];
}

// ============================================================================
// STATE
// ============================================================================

const fallbackEvents: FallbackEvent[] = [];
const fallbackCounts: Record<string, number> = {};
const MAX_RECENT_EVENTS = 100;

let lastAvailabilityCheck: Date = new Date();
let isFirestoreAvailable = true;

// Impact levels for different services
const SERVICE_IMPACT: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  'realtime-memory': 'critical', // Conversation turns lost
  'stm-promotion': 'critical', // Entity memory lost
  'voice-profile-store': 'high', // Voice profiles lost
  'learning-engine': 'medium', // Learning data lost
  'semantic-router': 'low', // Corrections lost
  'voice-context-capture': 'medium', // Voice context lost
  default: 'medium',
};

// ============================================================================
// FALLBACK TRACKING
// ============================================================================

/**
 * Record a fallback to in-memory storage.
 * Call this whenever a service can't write to Firestore.
 *
 * @param service - Name of the service (e.g., 'realtime-memory', 'stm-promotion')
 * @param reason - Why the fallback occurred (e.g., 'Firestore not available')
 */
export function recordFallback(service: string, reason: string): void {
  const impact = SERVICE_IMPACT[service] || SERVICE_IMPACT.default;

  const event: FallbackEvent = {
    service,
    reason,
    timestamp: new Date(),
    impact,
  };

  fallbackEvents.push(event);
  if (fallbackEvents.length > MAX_RECENT_EVENTS) {
    fallbackEvents.shift();
  }

  fallbackCounts[service] = (fallbackCounts[service] || 0) + 1;
  isFirestoreAvailable = false;

  // Log with appropriate severity based on impact
  if (impact === 'critical') {
    log.error(
      { service, reason, totalFallbacks: fallbackCounts[service] },
      '🚨 [FIRESTORE-FALLBACK] Critical service using in-memory storage - DATA LOSS RISK'
    );
  } else if (impact === 'high') {
    log.warn(
      { service, reason, totalFallbacks: fallbackCounts[service] },
      '⚠️ [FIRESTORE-FALLBACK] High-impact service using in-memory storage'
    );
  } else {
    log.info(
      { service, reason, totalFallbacks: fallbackCounts[service] },
      '📋 [FIRESTORE-FALLBACK] Service using in-memory storage'
    );
  }
}

/**
 * Mark Firestore as available again.
 * Call this when a successful Firestore operation completes.
 */
export function recordSuccess(service: string): void {
  if (!isFirestoreAvailable) {
    log.info({ service }, '✅ Firestore connection restored');
    isFirestoreAvailable = true;
  }
  lastAvailabilityCheck = new Date();
}

// ============================================================================
// HEALTH METRICS
// ============================================================================

/**
 * Get current Firestore health metrics.
 */
export function getFirestoreHealthMetrics(): FirestoreHealthMetrics {
  const recentFallbacks = fallbackEvents.slice(-20);
  const affectedServices = [...new Set(recentFallbacks.map((e) => e.service))];

  return {
    isAvailable: isFirestoreAvailable,
    lastCheckTime: lastAvailabilityCheck,
    totalFallbacks: Object.values(fallbackCounts).reduce((a, b) => a + b, 0),
    fallbacksByService: { ...fallbackCounts },
    recentFallbacks,
    affectedServices,
  };
}

/**
 * Check if there are critical fallbacks affecting data integrity.
 */
export function hasCriticalFallbacks(): boolean {
  const criticalServices = Object.entries(SERVICE_IMPACT)
    .filter(([_, impact]) => impact === 'critical')
    .map(([service]) => service);

  return criticalServices.some((service) => (fallbackCounts[service] || 0) > 0);
}

/**
 * Get a summary for health check endpoints.
 */
export function getHealthSummary(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  details: Record<string, unknown>;
} {
  const metrics = getFirestoreHealthMetrics();

  if (!metrics.isAvailable || hasCriticalFallbacks()) {
    return {
      status: 'unhealthy',
      message: 'Firestore unavailable or critical fallbacks detected',
      details: {
        isAvailable: metrics.isAvailable,
        criticalFallbacks: hasCriticalFallbacks(),
        affectedServices: metrics.affectedServices,
      },
    };
  }

  if (metrics.totalFallbacks > 0) {
    return {
      status: 'degraded',
      message: 'Some services using in-memory storage',
      details: {
        totalFallbacks: metrics.totalFallbacks,
        affectedServices: metrics.affectedServices,
      },
    };
  }

  return {
    status: 'healthy',
    message: 'All Firestore connections operational',
    details: {
      lastCheck: metrics.lastCheckTime.toISOString(),
    },
  };
}

// ============================================================================
// RESET (for testing)
// ============================================================================

export function resetMetrics(): void {
  fallbackEvents.length = 0;
  Object.keys(fallbackCounts).forEach((key) => delete fallbackCounts[key]);
  isFirestoreAvailable = true;
  lastAvailabilityCheck = new Date();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordFallback,
  recordSuccess,
  getFirestoreHealthMetrics,
  hasCriticalFallbacks,
  getHealthSummary,
  resetMetrics,
};
