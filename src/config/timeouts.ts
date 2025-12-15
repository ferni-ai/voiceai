/**
 * Centralized Timeout Configuration
 *
 * ALL timeout values for the voice agent system in one place.
 * This makes it easy to tune timeouts for different environments
 * and understand the full timing budget.
 *
 * TIMING BUDGET (must complete within Cloud Run's 300s request timeout):
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Phase                           │ Timeout │ Typical │ Notes            │
 * ├─────────────────────────────────┼─────────┼─────────┼──────────────────┤
 * │ LiveKit SDK initializeTimeout   │ 300s    │ 2-10s   │ Patched in Docker│
 * │ LiveKit SDK initializeProcess   │ 300s    │ 1-5s    │ Patched in Docker│
 * │ LiveKit SDK ORPHANED_TIMEOUT    │ 300s    │ N/A     │ Patched in Docker│
 * │ prewarm() return                │ instant │ <100ms  │ Returns immediately│
 * │ Background warmup               │ 90s     │ 5-30s   │ Runs async       │
 * │ ctx.connect()                   │ 10s     │ <1s     │ SDK requirement  │
 * │ Prewarm wait in entry()         │ 30s     │ 0-5s    │ After connect    │
 * │ Session creation                │ 30s     │ 2-5s    │ VAD + TTS + LLM  │
 * │ Room handshake                  │ 30s     │ <1s     │ LiveKit server   │
 * └─────────────────────────────────┴─────────┴─────────┴──────────────────┘
 *
 * Total worst case: ~10s typical, ~60s cold start
 */

// ============================================================================
// LIVEKIT SDK TIMEOUTS (Patched in Dockerfile)
// ============================================================================
// These are patched in docker/Dockerfile.agent via sed
// Keep these values in sync with the Dockerfile patches

export const LIVEKIT_SDK_TIMEOUTS = {
  /** How long parent waits for child to send initializeResponse (patched from 30s) */
  INITIALIZE_TIMEOUT: 300_000, // 5 minutes

  /** How long before process is considered failed to initialize (patched from 10s) */
  INITIALIZE_PROCESS_TIMEOUT: 300_000, // 5 minutes

  /** How long before orphaned child is killed (patched from 15s) */
  ORPHANED_TIMEOUT: 300_000, // 5 minutes
} as const;

// ============================================================================
// APPLICATION TIMEOUTS
// ============================================================================

export const APP_TIMEOUTS = {
  // ---------------------------------------------------------------------------
  // Worker Process (worker.ts)
  // ---------------------------------------------------------------------------

  /** How long to wait for resource warmup before starting */
  WARMUP_TIMEOUT: 30_000, // 30 seconds

  /** Circuit breaker recovery timeout */
  CIRCUIT_BREAKER_RECOVERY: 30_000, // 30 seconds

  // ---------------------------------------------------------------------------
  // Session Pipeline (orchestrator/)
  // ---------------------------------------------------------------------------

  /** Safety timeout for prewarm monitoring (just logging, doesn't reject) */
  PREWARM_SAFETY_TIMEOUT: 120_000, // 2 minutes

  /** How long session setup waits for resources */
  PREWARM_WAIT_TIMEOUT: 30_000, // 30 seconds

  /** Individual module import timeout (for slow network/disk) */
  MODULE_IMPORT_TIMEOUT: 30_000, // 30 seconds

  // ---------------------------------------------------------------------------
  // Session Handlers (voice-agent/)
  // ---------------------------------------------------------------------------

  /** Room connection timeout */
  ROOM_CONNECT_TIMEOUT: 30_000, // 30 seconds

  /** Fallback initialization timeout (if prewarm incomplete) */
  FALLBACK_INIT_TIMEOUT: 60_000, // 60 seconds

  // ---------------------------------------------------------------------------
  // IPC (resource-server.ts)
  // ---------------------------------------------------------------------------

  /** How long child waits for resource request response */
  IPC_REQUEST_TIMEOUT: 30_000, // 30 seconds

  /** How long cache file is considered fresh */
  CACHE_FRESHNESS: 10 * 60 * 1000, // 10 minutes
} as const;

// ============================================================================
// CLOUD RUN TIMEOUTS
// ============================================================================
// These are configured in infra/cloudrun-service-agent.yaml

export const CLOUD_RUN_TIMEOUTS = {
  /** Maximum request duration (configured in Cloud Run) */
  REQUEST_TIMEOUT: 300, // 5 minutes (in seconds for YAML)

  /** Health check initial delay */
  HEALTH_CHECK_INITIAL_DELAY: 10, // 10 seconds

  /** Health check period */
  HEALTH_CHECK_PERIOD: 30, // 30 seconds

  /** Health check failure threshold */
  HEALTH_CHECK_FAILURE_THRESHOLD: 3,
} as const;

// ============================================================================
// VOICE SESSION TIMEOUTS
// ============================================================================

export const VOICE_TIMEOUTS = {
  /** Minimum silence before considering user done speaking */
  MIN_ENDPOINTING_DELAY: 400, // 400ms

  /** Maximum wait before ending user turn */
  MAX_ENDPOINTING_DELAY: 1200, // 1.2 seconds

  /** Minimum interruption duration */
  MIN_INTERRUPTION_DURATION: 300, // 300ms
} as const;

// ============================================================================
// HELPER: Get all timeouts as a report
// ============================================================================

export function getTimeoutReport(): string {
  return `
=== FERNI TIMEOUT CONFIGURATION ===

LIVEKIT SDK (patched in Docker):
  initializeTimeout:        ${LIVEKIT_SDK_TIMEOUTS.INITIALIZE_TIMEOUT / 1000}s
  initializeProcessTimeout: ${LIVEKIT_SDK_TIMEOUTS.INITIALIZE_PROCESS_TIMEOUT / 1000}s
  ORPHANED_TIMEOUT:         ${LIVEKIT_SDK_TIMEOUTS.ORPHANED_TIMEOUT / 1000}s

APPLICATION:
  Main Process:
    warmupTimeout:          ${APP_TIMEOUTS.WARMUP_TIMEOUT / 1000}s
    circuitBreakerRecovery: ${APP_TIMEOUTS.CIRCUIT_BREAKER_RECOVERY / 1000}s
  
  Child Process:
    prewarmSafetyTimeout:   ${APP_TIMEOUTS.PREWARM_SAFETY_TIMEOUT / 1000}s
    prewarmWaitTimeout:     ${APP_TIMEOUTS.PREWARM_WAIT_TIMEOUT / 1000}s
    moduleImportTimeout:    ${APP_TIMEOUTS.MODULE_IMPORT_TIMEOUT / 1000}s
  
  Session:
    roomConnectTimeout:     ${APP_TIMEOUTS.ROOM_CONNECT_TIMEOUT / 1000}s
    fallbackInitTimeout:    ${APP_TIMEOUTS.FALLBACK_INIT_TIMEOUT / 1000}s

CLOUD RUN:
  requestTimeout:           ${CLOUD_RUN_TIMEOUTS.REQUEST_TIMEOUT}s
  healthCheckInitialDelay:  ${CLOUD_RUN_TIMEOUTS.HEALTH_CHECK_INITIAL_DELAY}s
  healthCheckPeriod:        ${CLOUD_RUN_TIMEOUTS.HEALTH_CHECK_PERIOD}s

VOICE:
  minEndpointingDelay:      ${VOICE_TIMEOUTS.MIN_ENDPOINTING_DELAY}ms
  maxEndpointingDelay:      ${VOICE_TIMEOUTS.MAX_ENDPOINTING_DELAY}ms
  minInterruptionDuration:  ${VOICE_TIMEOUTS.MIN_INTERRUPTION_DURATION}ms
`.trim();
}

// ============================================================================
// RUNTIME CHECK: Verify timeouts are consistent
// ============================================================================

export function validateTimeouts(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Prewarm wait must be less than SDK initialize timeout
  if (APP_TIMEOUTS.PREWARM_WAIT_TIMEOUT >= LIVEKIT_SDK_TIMEOUTS.INITIALIZE_TIMEOUT) {
    issues.push('PREWARM_WAIT_TIMEOUT should be less than INITIALIZE_TIMEOUT');
  }

  // Warmup must be less than Cloud Run request timeout
  if (APP_TIMEOUTS.WARMUP_TIMEOUT >= CLOUD_RUN_TIMEOUTS.REQUEST_TIMEOUT * 1000) {
    issues.push('WARMUP_TIMEOUT should be less than Cloud Run REQUEST_TIMEOUT');
  }

  // Module import timeout should be less than prewarm safety
  if (APP_TIMEOUTS.MODULE_IMPORT_TIMEOUT >= APP_TIMEOUTS.PREWARM_SAFETY_TIMEOUT) {
    issues.push('MODULE_IMPORT_TIMEOUT should be less than PREWARM_SAFETY_TIMEOUT');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
