/**
 * Defense Module - Phase 5 Adversarial Robustness
 *
 * Protects semantic routing against adversarial attacks:
 * - Prompt injection detection
 * - Homoglyph normalization
 * - Out-of-distribution detection
 * - Confidence capping for suspicious inputs
 *
 * @module tools/semantic-router/defense
 */

// Input Sanitization
export {
  sanitizeInput,
  shouldBlockInput,
  getThreatSummary,
  calculateEntropy,
  normalizeUnicode,
  removeInvisibleChars,
  recordDefenseStats,
  getDefenseStats,
  resetDefenseStats,
  type SanitizationResult,
  type DetectedThreat,
  type ThreatType,
} from './input-sanitizer.js';

// Anomaly Detection
export {
  detectAnomaly,
  applyAnomalyPenalty,
  shouldBlockExecution,
  resetIntentClusters,
  getIntentClusters,
  addCluster,
  type AnomalyResult,
  type IntentCluster,
  type AnomalyDetectorConfig,
} from './anomaly-detector.js';
