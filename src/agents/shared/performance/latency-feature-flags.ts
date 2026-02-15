/**
 * Latency Optimization Feature Flags
 *
 * Controls for each sub-300ms latency workstream.
 * All flags default to `false` — enable individually via env vars.
 *
 * Workstreams:
 * - WS1: Speculative context pre-computation
 * - WS2: Semantic VAD endpointing
 * - WS3: Prompt compression
 * - WS4: TTS cache warming
 *
 * @module agents/shared/performance/latency-feature-flags
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'LatencyFlags' });

// ============================================================================
// FLAG DEFINITIONS
// ============================================================================

interface LatencyFlag {
  readonly envVar: string;
  readonly description: string;
  readonly workstream: string;
}

const FLAG_REGISTRY: Readonly<Record<string, LatencyFlag>> = {
  SPECULATIVE_CONTEXT: {
    envVar: 'ENABLE_SPECULATIVE_CONTEXT',
    description: 'Pre-compute context builders during user speech',
    workstream: 'WS1',
  },
  SEMANTIC_VAD: {
    envVar: 'ENABLE_SEMANTIC_VAD',
    description: 'Semantic-aware voice activity detection endpointing',
    workstream: 'WS2',
  },
  PROMPT_COMPRESSION: {
    envVar: 'ENABLE_PROMPT_COMPRESSION',
    description: 'Compress prompt tokens to reduce LLM TTFB',
    workstream: 'WS3',
  },
  CACHE_WARMING: {
    envVar: 'ENABLE_CACHE_WARMING',
    description: 'Pre-warm TTS cache with predicted responses',
    workstream: 'WS4',
  },
} as const;

type FlagName = keyof typeof FLAG_REGISTRY;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a latency optimization is enabled via its env var.
 */
export function isOptimizationEnabled(name: string): boolean {
  const flag = FLAG_REGISTRY[name as FlagName];
  if (!flag) {
    log.warn({ name }, 'Unknown latency optimization flag requested');
    return false;
  }
  return process.env[flag.envVar] === 'true';
}

/**
 * Get the status of all latency optimization flags.
 */
export function getAllFlagStatuses(): Record<string, { enabled: boolean; envVar: string; description: string; workstream: string }> {
  const statuses: Record<string, { enabled: boolean; envVar: string; description: string; workstream: string }> = {};

  for (const [name, flag] of Object.entries(FLAG_REGISTRY)) {
    statuses[name] = {
      enabled: process.env[flag.envVar] === 'true',
      envVar: flag.envVar,
      description: flag.description,
      workstream: flag.workstream,
    };
  }

  return statuses;
}

/**
 * Log the current state of all flags (call once at startup).
 */
export function logFlagStatus(): void {
  const statuses = getAllFlagStatuses();
  const enabled = Object.entries(statuses)
    .filter(([, s]) => s.enabled)
    .map(([name]) => name);

  if (enabled.length > 0) {
    log.info({ enabled }, 'Latency optimizations active');
  } else {
    log.debug({}, 'No latency optimizations enabled');
  }
}
