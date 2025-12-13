/**
 * Self-Healing Services
 *
 * AI-powered automatic recovery from failures.
 * "Better than human" means we fix ourselves.
 */

export { analyzeFailure } from './ai-diagnostics.js';
export type { DiagnosticResult } from './ai-diagnostics.js';
export { CircuitBreaker, createCircuitBreaker, getAllCircuitStats } from './circuit-breaker.js';
export { getRecoveryMessage, humanizeError } from './error-humanizer.js';
export type { HumanizedError } from './error-humanizer.js';
export { withResilience, makeResilient } from './resilient-executor.js';
export type { RetryOptions } from './resilient-executor.js';
export {
  communicateRecovery,
  createRecoveryAwareSession,
  getRecoveryPhrase,
  RECOVERY_PHRASES,
} from './session-recovery.js';
export type { RecoveryContext } from './session-recovery.js';

// Resilient HTTP Client - unified external API calls
export {
  createResilientClient,
  getAllClientStats,
  getClient,
  areAllClientsHealthy,
  getUnhealthyClients,
  // Pre-configured clients
  getYahooFinanceClient,
  getAlphaVantageClient,
  getGoogleApisClient,
  getWikipediaClient,
  getHomeAssistantClient,
  getHueClient,
  getLifxClient,
  getSmartThingsClient,
} from './resilient-http.js';
export type {
  ResilientClient,
  ResilientClientOptions,
  ResilientResponse,
  ResilientError,
  CircuitStats,
} from './resilient-http.js';
