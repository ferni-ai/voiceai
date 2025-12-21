/**
 * Latency Logger Service
 *
 * Tracks and logs timing metrics for voice conversations.
 * Enable verbose mode in the browser console with:
 *   window.ferniLatency.enable()
 *
 * Shows:
 * - Time from user speech end → agent speech start (response latency)
 * - Rolling averages
 * - Slow turn alerts
 *
 * @module latency-logger.service
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('Latency');

// ============================================================================
// TYPES
// ============================================================================

interface TurnTiming {
  turnNumber: number;
  userStoppedAt: number;
  agentStartedAt?: number;
  agentResponseAt?: number;
  responseLatencyMs?: number;
  transcript?: string;
}

interface LatencyStats {
  totalTurns: number;
  avgResponseLatencyMs: number;
  minResponseLatencyMs: number;
  maxResponseLatencyMs: number;
  p50ResponseLatencyMs: number;
  p95ResponseLatencyMs: number;
  slowTurns: number; // > 1.5s
  criticalTurns: number; // > 3s
}

// ============================================================================
// STATE
// ============================================================================

let isEnabled = false;
let currentTurn: TurnTiming | null = null;
const turnHistory: TurnTiming[] = [];
const MAX_HISTORY = 100;

// Thresholds
const SLOW_THRESHOLD_MS = 1500;
const CRITICAL_THRESHOLD_MS = 3000;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Mark when user stopped speaking (start of response wait)
 */
export function markUserSpeechEnd(transcript?: string): void {
  const now = Date.now();
  const turnNumber = turnHistory.length + 1;

  currentTurn = {
    turnNumber,
    userStoppedAt: now,
    transcript: transcript?.slice(0, 50),
  };

  if (isEnabled) {
    log.debug(`⏱️ Turn ${turnNumber}: User finished speaking`, {
      transcript: transcript?.slice(0, 30),
    });
  }
}

/**
 * Mark when agent started speaking (first audio byte)
 */
export function markAgentSpeechStart(): void {
  if (!currentTurn) return;

  const now = Date.now();
  currentTurn.agentStartedAt = now;
  currentTurn.responseLatencyMs = now - currentTurn.userStoppedAt;

  // Store in history
  turnHistory.push({ ...currentTurn });
  if (turnHistory.length > MAX_HISTORY) {
    turnHistory.shift();
  }

  // Log based on latency
  const latency = currentTurn.responseLatencyMs;
  const turnNum = currentTurn.turnNumber;

  if (isEnabled) {
    const tier = latency < 500 ? '🟢' : latency < 1000 ? '🟡' : latency < 1500 ? '🟠' : '🔴';
    console.log(
      `%c${tier} Turn ${turnNum}: Response latency ${latency}ms`,
      `color: ${latency < 500 ? '#4a6741' : latency < 1000 ? '#c4856a' : latency < 1500 ? '#a67a6a' : '#cc3333'}; font-weight: bold;`
    );

    if (latency > SLOW_THRESHOLD_MS) {
      console.warn(`⚠️ Slow response detected: ${latency}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`);
    }
    if (latency > CRITICAL_THRESHOLD_MS) {
      console.error(`🚨 CRITICAL: Response took ${latency}ms (>${CRITICAL_THRESHOLD_MS}ms)`);
    }
  }

  currentTurn = null;
}

/**
 * Mark when agent's first word was heard (for more accurate latency)
 */
export function markAgentFirstWord(): void {
  if (!currentTurn) return;

  const now = Date.now();
  currentTurn.agentResponseAt = now;

  if (isEnabled && currentTurn.agentStartedAt) {
    const audioLatency = now - currentTurn.agentStartedAt;
    log.debug(`🔊 Audio playback latency: ${audioLatency}ms`);
  }
}

/**
 * Get current latency stats
 */
export function getStats(): LatencyStats {
  const latencies = turnHistory
    .filter((t) => t.responseLatencyMs !== undefined)
    .map((t) => t.responseLatencyMs as number);

  if (latencies.length === 0) {
    return {
      totalTurns: 0,
      avgResponseLatencyMs: 0,
      minResponseLatencyMs: 0,
      maxResponseLatencyMs: 0,
      p50ResponseLatencyMs: 0,
      p95ResponseLatencyMs: 0,
      slowTurns: 0,
      criticalTurns: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);

  return {
    totalTurns: turnHistory.length,
    avgResponseLatencyMs: Math.round(sum / latencies.length),
    minResponseLatencyMs: sorted[0],
    maxResponseLatencyMs: sorted[sorted.length - 1],
    p50ResponseLatencyMs: sorted[Math.floor(sorted.length * 0.5)],
    p95ResponseLatencyMs: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    slowTurns: latencies.filter((l) => l > SLOW_THRESHOLD_MS).length,
    criticalTurns: latencies.filter((l) => l > CRITICAL_THRESHOLD_MS).length,
  };
}

/**
 * Get recent turn history
 */
export function getHistory(limit = 10): TurnTiming[] {
  return turnHistory.slice(-limit);
}

/**
 * Print a summary to console
 */
export function printSummary(): void {
  const stats = getStats();

  console.log('\n%c📊 LATENCY SUMMARY', 'font-size: 14px; font-weight: bold; color: #4a6741;');
  console.log('─'.repeat(40));
  console.log(`Total turns: ${stats.totalTurns}`);
  console.log(`Average latency: ${stats.avgResponseLatencyMs}ms`);
  console.log(`Min/Max: ${stats.minResponseLatencyMs}ms / ${stats.maxResponseLatencyMs}ms`);
  console.log(`P50: ${stats.p50ResponseLatencyMs}ms | P95: ${stats.p95ResponseLatencyMs}ms`);
  console.log(`Slow turns (>${SLOW_THRESHOLD_MS}ms): ${stats.slowTurns}`);
  console.log(`Critical turns (>${CRITICAL_THRESHOLD_MS}ms): ${stats.criticalTurns}`);
  console.log('─'.repeat(40));

  if (stats.slowTurns > 0) {
    console.log('\n⚠️ Recent slow turns:');
    turnHistory
      .filter((t) => t.responseLatencyMs && t.responseLatencyMs > SLOW_THRESHOLD_MS)
      .slice(-5)
      .forEach((t) => {
        console.log(`  Turn ${t.turnNumber}: ${t.responseLatencyMs}ms - "${t.transcript || '...'}""`);
      });
  }
}

/**
 * Clear history (for new session)
 */
export function clear(): void {
  turnHistory.length = 0;
  currentTurn = null;
  if (isEnabled) {
    log.info('Latency history cleared');
  }
}

// ============================================================================
// ENABLE/DISABLE
// ============================================================================

/**
 * Enable verbose latency logging to console
 */
export function enable(): void {
  isEnabled = true;
  console.log(
    '%c⏱️ Latency logging ENABLED',
    'color: #4a6741; font-weight: bold; font-size: 12px;'
  );
  console.log('Commands:');
  console.log('  window.ferniLatency.summary() - Show latency summary');
  console.log('  window.ferniLatency.history() - Show recent turns');
  console.log('  window.ferniLatency.stats() - Get stats object');
  console.log('  window.ferniLatency.disable() - Turn off logging');
}

/**
 * Disable verbose latency logging
 */
export function disable(): void {
  isEnabled = false;
  console.log('%c⏱️ Latency logging DISABLED', 'color: #888; font-weight: bold;');
}

/**
 * Check if enabled
 */
export function isLoggingEnabled(): boolean {
  return isEnabled;
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

export const latencyLogger = {
  // Core tracking
  markUserSpeechEnd,
  markAgentSpeechStart,
  markAgentFirstWord,

  // Queries
  getStats,
  getHistory,
  printSummary,
  clear,

  // Toggle
  enable,
  disable,
  isEnabled: isLoggingEnabled,
};

// ============================================================================
// EXPOSE FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).ferniLatency = {
    enable,
    disable,
    summary: printSummary,
    history: () => {
      console.table(getHistory(20));
    },
    stats: getStats,
    clear,
  };
}

