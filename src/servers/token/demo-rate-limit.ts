/**
 * Demo session rate limiting
 */

import crypto from 'crypto';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import type { DemoConfig, RateLimitResult } from '../shared/types.js';

/**
 * Default demo configuration
 */
export const DEMO_CONFIG: DemoConfig = {
  maxSessionsPerDay: 3,
  sessionDurationMinutes: 3,
  cooldownMinutes: 5,
};

/**
 * Demo rate limit data per IP
 */
interface DemoRateLimitData {
  dayStart: number;
  sessionCount: number;
  lastSession: number;
  sessions: Array<{ started: number; sessionId: string }>;
}

/**
 * In-memory rate limit storage
 * Note: Resets on server restart - for production, consider Redis
 */
const demoRateLimits = new Map<string, DemoRateLimitData>();

/**
 * Cleanup old rate limit entries (call periodically)
 */
export function cleanupOldRateLimits(): void {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  for (const [ip, data] of demoRateLimits.entries()) {
    if (data.lastSession < dayAgo) {
      demoRateLimits.delete(ip);
    }
  }
}

/**
 * Start periodic cleanup (every hour)
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;
  registerInterval('demo-rate-limit-cleanup', cleanupOldRateLimits, 60 * 60 * 1000);
  cleanupInterval = 1 as unknown as NodeJS.Timeout; // Marker
}

export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearNamedInterval('demo-rate-limit-cleanup');
    cleanupInterval = null;
  }
}

/**
 * Get rate limit data for an IP
 */
function getDemoRateLimit(ip: string): DemoRateLimitData {
  const dayStart = new Date().setHours(0, 0, 0, 0);

  let data = demoRateLimits.get(ip);

  // Reset if new day
  if (!data || data.dayStart !== dayStart) {
    data = {
      dayStart,
      sessionCount: 0,
      lastSession: 0,
      sessions: [],
    };
    demoRateLimits.set(ip, data);
  }

  return data;
}

/**
 * Check if a demo session is allowed for an IP
 */
export function checkDemoAllowed(ip: string, config = DEMO_CONFIG): RateLimitResult {
  const data = getDemoRateLimit(ip);
  const now = Date.now();

  // Check daily limit
  if (data.sessionCount >= config.maxSessionsPerDay) {
    return {
      allowed: false,
      reason: 'daily_limit',
      message: `You've used all ${config.maxSessionsPerDay} demo sessions today. Create a free account for unlimited access!`,
      retryAfter: new Date(data.dayStart + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Check cooldown
  const cooldownMs = config.cooldownMinutes * 60 * 1000;
  if (data.lastSession && now - data.lastSession < cooldownMs) {
    const retryIn = Math.ceil((cooldownMs - (now - data.lastSession)) / 1000);
    return {
      allowed: false,
      reason: 'cooldown',
      message: `Please wait ${retryIn} seconds before starting another demo.`,
      retryAfter: new Date(data.lastSession + cooldownMs).toISOString(),
    };
  }

  return {
    allowed: true,
    sessionsRemaining: config.maxSessionsPerDay - data.sessionCount,
  };
}

/**
 * Record a demo session for an IP
 */
export function recordDemoSession(ip: string): string {
  const data = getDemoRateLimit(ip);
  const sessionId = crypto.randomBytes(16).toString('hex');

  data.sessionCount++;
  data.lastSession = Date.now();
  data.sessions.push({
    started: Date.now(),
    sessionId,
  });

  return sessionId;
}

/**
 * Get demo statistics for monitoring
 */
export function getDemoStats(): {
  totalIPs: number;
  activeSessions: number;
} {
  const now = Date.now();
  let activeSessions = 0;

  for (const data of demoRateLimits.values()) {
    // Count sessions started in the last 10 minutes as "active"
    activeSessions += data.sessions.filter((s) => now - s.started < 10 * 60 * 1000).length;
  }

  return {
    totalIPs: demoRateLimits.size,
    activeSessions,
  };
}
