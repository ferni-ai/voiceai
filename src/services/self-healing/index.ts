/**
 * Self-Healing Services
 *
 * AI-powered automatic recovery from failures.
 * "Better than human" means we fix ourselves.
 *
 * Core Features:
 * - Circuit breaker pattern (prevents cascading failures)
 * - Automatic retry with exponential backoff
 * - AI-powered root cause analysis
 * - Human-friendly error messages
 *
 * Monitoring & Alerting:
 * - Slack/email notifications on circuit breaker events
 * - GCP Cloud Monitoring metrics export
 * - Anomaly detection for predictive failure prevention
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

// Circuit Breaker Alerting - Slack/email notifications
export {
  handleCircuitStateChange,
  configureAlerting,
  getAlertConfig,
  getRecentEvents,
  getCircuitEvents,
  clearEventHistory,
  createAlertingCallback,
} from './circuit-alerting.js';
export type { CircuitEvent, AlertConfig, AlertSeverity } from './circuit-alerting.js';

// Cloud Monitoring Metrics - GCP integration
export {
  recordMetric,
  recordCircuitState,
  recordStateChange,
  recordHttpRequest,
  flushMetrics,
  configureMetrics,
  startMetricsExport,
  stopMetricsExport,
  getMetricsConfig,
  getBufferedMetricCount,
  createMetricsCallbacks,
} from './cloud-metrics.js';
export type { MetricPoint, MetricsConfig } from './cloud-metrics.js';

// Anomaly Detection - Predictive failure prevention
export {
  recordAndDetect,
  recordLatency,
  recordErrorRate,
  recordSuccessRate,
  recordRequestVolume,
  configureAnomalyDetection,
  getAnomalyConfig,
  getMetricStats,
  getAllMetricStats,
  getRecentAnomalies,
  getMetricAnomalies,
  resetAnomalyDetection,
  createPredictiveMonitor,
  createAlertingAnomalyHandler,
} from './anomaly-detection.js';
export type { MetricWindow, AnomalyConfig, Anomaly, TrendAnalysis } from './anomaly-detection.js';

// Health Monitors - Proactive service health checking
export {
  checkServiceHealth,
  runAllHealthChecks,
  getCachedHealthStatus,
  isCapabilityHealthy,
  getMonitors,
  startHealthMonitoring,
  stopHealthMonitoring,
  isMonitoringActive,
} from './health-monitors.js';
export type { HealthCheckResult, HealthMonitor, HealthStatus } from './health-monitors.js';

// Cloud Run Restart - Automatic container recovery
export {
  restartService,
  canRestart,
  getCooldownRemaining,
  getRestartHistory,
  clearCooldown,
  handleCriticalFailure,
  setupAutoRestart,
} from './cloud-run-restart.js';
export type { RestartOptions, RestartResult } from './cloud-run-restart.js';
