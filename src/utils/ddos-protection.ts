/**
 * DDoS Protection Utilities
 *
 * Provides defense-in-depth against DDoS attacks:
 * - Request size limits
 * - Socket timeouts
 * - Health endpoint rate limiting
 * - Safe body parsing with size limits
 * - Request ID generation for tracing
 * - Rate limit monitoring and alerting
 */

import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createLogger } from './logger.js';

const log = createLogger({ module: 'DDoSProtection' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DDOS_CONFIG = {
  // Request size limits
  maxBodySize: 1 * 1024 * 1024, // 1MB default
  maxJsonBodySize: 512 * 1024, // 512KB for JSON
  maxHeaderSize: 16 * 1024, // 16KB headers

  // Timeouts (milliseconds)
  socketTimeout: 30_000, // 30 seconds - kill slow connections
  keepAliveTimeout: 65_000, // 65 seconds - slightly longer than typical LB timeout
  headersTimeout: 20_000, // 20 seconds to receive headers
  requestTimeout: 60_000, // 60 seconds total request time

  // Health endpoint protection
  healthRateLimit: {
    maxRequests: 60, // 60 requests per minute
    windowMs: 60_000,
  },

  // OAuth state limits
  oauthStateExpiry: 5 * 60 * 1000, // 5 minutes (reduced from 10)
  maxOAuthStates: 1000, // Max concurrent OAuth states in memory
} as const;

// ============================================================================
// REQUEST ID GENERATION
// ============================================================================

let requestCounter = 0;
const serverStartTime = Date.now().toString(36);

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  requestCounter = (requestCounter + 1) % 1_000_000;
  return `${serverStartTime}-${requestCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Add request ID to request and response
 */
export function addRequestId(req: IncomingMessage, res: ServerResponse): string {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  res.setHeader('X-Request-ID', requestId);
  return requestId;
}

// ============================================================================
// SERVER HARDENING
// ============================================================================

/**
 * Configure server with DDoS protection settings
 * Call this after creating the HTTP server
 */
export function hardenServer(server: Server): void {
  // Set timeouts to prevent slow connections
  server.setTimeout(DDOS_CONFIG.socketTimeout);
  server.keepAliveTimeout = DDOS_CONFIG.keepAliveTimeout;
  server.headersTimeout = DDOS_CONFIG.headersTimeout;
  server.requestTimeout = DDOS_CONFIG.requestTimeout;

  // Log when connections are closed due to timeout
  server.on('timeout', (socket) => {
    log.warn({ remoteAddress: socket.remoteAddress }, 'Socket timeout - connection killed');
    socket.destroy();
  });

  // Track connection count for monitoring
  let activeConnections = 0;
  server.on('connection', (socket) => {
    activeConnections++;
    socket.on('close', () => {
      activeConnections--;
    });
  });

  // Expose connection count for monitoring
  (server as Server & { activeConnections: () => number }).activeConnections = () =>
    activeConnections;

  log.info(
    {
      socketTimeout: DDOS_CONFIG.socketTimeout,
      keepAliveTimeout: DDOS_CONFIG.keepAliveTimeout,
      headersTimeout: DDOS_CONFIG.headersTimeout,
    },
    'Server hardened with DDoS protection'
  );
}

// ============================================================================
// SAFE BODY PARSING
// ============================================================================

export interface ParseBodyOptions {
  maxSize?: number;
  timeout?: number;
}

export interface ParseBodyResult {
  body: string;
  size: number;
  truncated: boolean;
}

/**
 * Safely parse request body with size limits
 * Prevents OOM attacks from oversized payloads
 */
export async function parseBodySafe(
  req: IncomingMessage,
  res: ServerResponse,
  options: ParseBodyOptions = {}
): Promise<ParseBodyResult | null> {
  const maxSize = options.maxSize ?? DDOS_CONFIG.maxBodySize;
  const timeout = options.timeout ?? DDOS_CONFIG.requestTimeout;

  return new Promise((resolve) => {
    let body = '';
    let size = 0;
    let truncated = false;
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        log.warn({ url: req.url, size }, 'Body parsing timeout');
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request Timeout' }));
        req.destroy();
        resolve(null);
      }
    }, timeout);

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          log.warn({ url: req.url, size, maxSize }, 'Request body too large');
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large', maxSize }));
          req.destroy();
          resolve(null);
        }
        truncated = true;
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve({ body, size, truncated });
      }
    });

    req.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        log.error({ error: String(err), url: req.url }, 'Body parsing error');
        resolve(null);
      }
    });
  });
}

/**
 * Parse JSON body safely with size limits
 */
export async function parseJsonBodySafe<T = unknown>(
  req: IncomingMessage,
  res: ServerResponse,
  options: ParseBodyOptions = {}
): Promise<T | null> {
  const maxSize = options.maxSize ?? DDOS_CONFIG.maxJsonBodySize;
  const result = await parseBodySafe(req, res, { ...options, maxSize });

  if (!result) return null;

  try {
    return JSON.parse(result.body) as T;
  } catch {
    log.warn({ url: req.url, bodyPreview: result.body.slice(0, 100) }, 'Invalid JSON body');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return null;
  }
}

// ============================================================================
// HEALTH ENDPOINT RATE LIMITING
// ============================================================================

const healthRateLimits = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of Array.from(healthRateLimits.entries())) {
    if (data.resetTime < now) {
      healthRateLimits.delete(ip);
    }
  }
}, 60_000);

/**
 * Check if health endpoint request should be rate limited
 * Returns true if rate limited (request should be blocked)
 */
export function isHealthRateLimited(req: IncomingMessage): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  const config = DDOS_CONFIG.healthRateLimit;

  let data = healthRateLimits.get(ip);
  if (!data || data.resetTime < now) {
    data = { count: 0, resetTime: now + config.windowMs };
    healthRateLimits.set(ip, data);
  }

  data.count++;
  return data.count > config.maxRequests;
}

/**
 * Handle health endpoint with rate limiting
 * Returns true if handled (caller should return)
 */
export function handleHealthEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  serviceName: string
): boolean {
  if (pathname !== '/health' && pathname !== '/health/dashboard') {
    return false;
  }

  // Rate limit health endpoints
  if (isHealthRateLimited(req)) {
    log.warn({ ip: getClientIp(req), pathname }, 'Health endpoint rate limited');
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too Many Requests', retryAfter: 60 }));
    return true;
  }

  // Basic health check - minimal info
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: serviceName }));
    return true;
  }

  // Dashboard - requires internal network or admin (check X-Admin-Key header)
  if (pathname === '/health/dashboard') {
    const adminKey = req.headers['x-admin-key'];
    const isInternal = isInternalRequest(req);

    if (!adminKey && !isInternal) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden - admin access required' }));
      return true;
    }

    // Return minimal dashboard info (don't expose detailed config)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: serviceName,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsed: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.floor(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      })
    );
    return true;
  }

  return false;
}

// ============================================================================
// IP UTILITIES
// ============================================================================

/**
 * Get client IP from request, handling proxies securely
 */
export function getClientIp(req: IncomingMessage): string {
  // In production behind Cloud Run/Load Balancer, trust X-Forwarded-For
  // But only take the first IP (client IP), not proxy chain
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
    // First IP should be client, last would be the proxy
    const clientIp = ips[0]?.trim();
    if (clientIp && isValidIp(clientIp)) {
      return clientIp;
    }
  }

  // Fallback to direct connection
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Basic IP validation (prevents header injection)
 */
function isValidIp(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Check if request is from internal network (GCP health checks, etc.)
 */
function isInternalRequest(req: IncomingMessage): boolean {
  const ip = req.socket?.remoteAddress || '';
  // GCP internal ranges, localhost
  return (
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('192.168.') ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1'
  );
}

// ============================================================================
// OAUTH STATE PROTECTION
// ============================================================================

/**
 * Create a secure OAuth state manager with limits
 */
export function createOAuthStateManager<T = unknown>(expiry = DDOS_CONFIG.oauthStateExpiry) {
  const states = new Map<string, { data: T; expires: number }>();

  // Cleanup expired states every minute
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [state, entry] of Array.from(states.entries())) {
      if (entry.expires < now) {
        states.delete(state);
      }
    }
  }, 60_000);

  return {
    /**
     * Create a new OAuth state
     */
    create(data: T): string | null {
      // Limit total states to prevent memory exhaustion
      if (states.size >= DDOS_CONFIG.maxOAuthStates) {
        log.warn({ count: states.size }, 'OAuth state limit reached');
        return null;
      }

      const state = generateRequestId();
      states.set(state, { data, expires: Date.now() + expiry });
      return state;
    },

    /**
     * Validate and consume a state (one-time use)
     */
    consume(state: string): T | null {
      const entry = states.get(state);
      if (!entry) return null;

      states.delete(state);

      if (entry.expires < Date.now()) {
        return null;
      }

      return entry.data;
    },

    /**
     * Get current state count (for monitoring)
     */
    count(): number {
      return states.size;
    },

    /**
     * Cleanup on shutdown
     */
    destroy(): void {
      clearInterval(cleanupInterval);
      states.clear();
    },
  };
}

// ============================================================================
// RATE LIMIT MONITORING
// ============================================================================

interface RateLimitEvent {
  timestamp: number;
  ip: string;
  endpoint: string;
  tier: string;
}

const rateLimitEvents: RateLimitEvent[] = [];
const MAX_EVENTS = 1000;

/**
 * Record a rate limit event for monitoring
 */
export function recordRateLimitEvent(ip: string, endpoint: string, tier: string): void {
  rateLimitEvents.push({
    timestamp: Date.now(),
    ip,
    endpoint,
    tier,
  });

  // Keep only recent events
  while (rateLimitEvents.length > MAX_EVENTS) {
    rateLimitEvents.shift();
  }
}

/**
 * Get rate limit statistics for monitoring
 */
export function getRateLimitStats(windowMs = 60_000): {
  total: number;
  byIp: Record<string, number>;
  byEndpoint: Record<string, number>;
  byTier: Record<string, number>;
} {
  const cutoff = Date.now() - windowMs;
  const recent = rateLimitEvents.filter((e) => e.timestamp > cutoff);

  const byIp: Record<string, number> = {};
  const byEndpoint: Record<string, number> = {};
  const byTier: Record<string, number> = {};

  for (const event of recent) {
    byIp[event.ip] = (byIp[event.ip] || 0) + 1;
    byEndpoint[event.endpoint] = (byEndpoint[event.endpoint] || 0) + 1;
    byTier[event.tier] = (byTier[event.tier] || 0) + 1;
  }

  return {
    total: recent.length,
    byIp,
    byEndpoint,
    byTier,
  };
}

/**
 * Check if there's a potential DDoS attack based on rate limit patterns
 */
export function detectDDoSPattern(): {
  detected: boolean;
  confidence: 'low' | 'medium' | 'high';
  details: string;
} {
  const stats = getRateLimitStats(60_000); // Last minute

  // Heuristics for DDoS detection
  const uniqueIps = Object.keys(stats.byIp).length;
  const totalEvents = stats.total;

  // High volume from single IP
  const maxFromSingleIp = Math.max(0, ...Object.values(stats.byIp));
  if (maxFromSingleIp > 50) {
    return {
      detected: true,
      confidence: 'high',
      details: `Single IP hit rate limit ${maxFromSingleIp} times in 1 minute`,
    };
  }

  // Distributed attack pattern (many IPs, high total)
  if (totalEvents > 100 && uniqueIps > 20) {
    return {
      detected: true,
      confidence: 'medium',
      details: `Distributed pattern: ${totalEvents} rate limits from ${uniqueIps} IPs`,
    };
  }

  // Moderate concern
  if (totalEvents > 50) {
    return {
      detected: true,
      confidence: 'low',
      details: `Elevated rate limiting: ${totalEvents} events from ${uniqueIps} IPs`,
    };
  }

  return { detected: false, confidence: 'low', details: 'Normal traffic patterns' };
}

// ============================================================================
// MONITORING ENDPOINT
// ============================================================================

/**
 * Handle security monitoring endpoint (admin only)
 */
export function handleSecurityMonitoring(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): boolean {
  if (pathname !== '/api/security/status') {
    return false;
  }

  // Admin only
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return true;
  }

  const ddosStatus = detectDDoSPattern();
  const rateLimitStats = getRateLimitStats();

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ddos: ddosStatus,
      rateLimits: {
        lastMinute: rateLimitStats.total,
        topIps: Object.entries(rateLimitStats.byIp)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5),
        topEndpoints: Object.entries(rateLimitStats.byEndpoint)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5),
      },
      healthRateLimits: healthRateLimits.size,
    })
  );
  return true;
}
