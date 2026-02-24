/**
 * Speculative Context Builder
 *
 * Pre-computes expensive context builders during user speech (interim transcripts)
 * and validates/merges results when the final transcript arrives.
 *
 * Architecture:
 *   Partial transcript arrives → buildSpeculative() fires (non-blocking)
 *     → Runs expensive I/O builders (predictive intelligence, cross-persona)
 *     → Caches result with 5s TTL
 *   Final transcript arrives → validateAndMerge()
 *     → Levenshtein check: if <30% divergence → return cached injections
 *     → Turn processor uses cached injections + quick builders (skips expensive)
 *
 * Part of WS1: Sub-300ms latency optimization.
 *
 * @module agents/shared/performance/speculative-context-builder
 */

import type { ContextInjection } from '../../../types/context-injection-types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { isOptimizationEnabled } from './latency-feature-flags.js';

const log = createLogger({ module: 'SpeculativeContext' });

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry {
  readonly injections: ContextInjection[];
  readonly transcript: string;
  readonly builtAt: number;
}

interface SpeculativeBuildContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly personaId: string;
  /** SessionServices passed through — typed loosely to avoid layer coupling */
  readonly services: Record<string, unknown>;
}

interface ValidateResult {
  readonly valid: boolean;
  readonly injections?: ContextInjection[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_TTL_MS = 5000;
const MAX_DIVERGENCE_RATIO = 0.3;

// ============================================================================
// LEVENSHTEIN DISTANCE (inline — no library dependency)
// ============================================================================

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

function normalizedDistance(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// ============================================================================
// SPECULATIVE CONTEXT BUILDER
// ============================================================================

export class SpeculativeContextBuilder {
  private cache = new Map<string, CacheEntry>();
  private buildInProgress = new Map<string, boolean>();

  /**
   * Pre-compute expensive context builders on an interim transcript.
   * Fire-and-forget — errors are silently caught.
   */
  async buildSpeculative(
    sessionId: string,
    interimTranscript: string,
    ctx: SpeculativeBuildContext
  ): Promise<void> {
    if (!isOptimizationEnabled('SPECULATIVE_CONTEXT')) return;

    // Don't start a new build if one is already in progress for this session
    if (this.buildInProgress.get(sessionId)) return;

    this.buildInProgress.set(sessionId, true);
    const startMs = Date.now();

    try {
      const injections: ContextInjection[] = [];

      // Run expensive I/O operations in parallel
      const results = await Promise.allSettled([
        // 1. Predictive intelligence (Firestore lookup)
        (async () => {
          const { getPredictiveIntelligenceContext } = await import(
            '../../../intelligence/predictive/index.js'
          );
          const context = await getPredictiveIntelligenceContext(ctx.userId, {
            currentEmotion: 'neutral',
            currentTopic: undefined,
          });
          if (context) {
            injections.push({ category: 'predictive', content: context, priority: 80 });
          }
        })(),

        // 2. Cross-persona insights (Firestore lookup)
        (async () => {
          const { buildCrossPersonaInsightsInjection } = await import(
            '../../processors/injection-builders/index.js'
          );
          const injection = await buildCrossPersonaInsightsInjection(
            ctx.services as unknown as Parameters<typeof buildCrossPersonaInsightsInjection>[0],
            ctx.personaId
          );
          if (injection) {
            injections.push(injection);
          }
        })(),
      ]);

      // Log any failures (non-blocking)
      for (const result of results) {
        if (result.status === 'rejected') {
          log.debug({ error: String(result.reason) }, 'Speculative builder failed (non-blocking)');
        }
      }

      // Cache the results
      this.cache.set(sessionId, {
        injections,
        transcript: interimTranscript,
        builtAt: Date.now(),
      });

      log.debug(
        {
          sessionId,
          injectionCount: injections.length,
          durationMs: Date.now() - startMs,
          transcriptPreview: interimTranscript.slice(0, 40),
        },
        'Speculative context built'
      );
    } catch (error) {
      log.debug({ error: String(error), sessionId }, 'Speculative build failed');
    } finally {
      this.buildInProgress.set(sessionId, false);
    }
  }

  /**
   * Validate the final transcript against cached speculative result.
   *
   * Returns cached injections if the final transcript is within 30% Levenshtein
   * distance of the interim transcript used for pre-computation.
   */
  validateAndMerge(sessionId: string, finalTranscript: string): ValidateResult {
    if (!isOptimizationEnabled('SPECULATIVE_CONTEXT')) return { valid: false };

    const entry = this.cache.get(sessionId);
    if (!entry) return { valid: false };

    // TTL check
    if (Date.now() - entry.builtAt > CACHE_TTL_MS) {
      this.cache.delete(sessionId);
      log.debug({ sessionId }, 'Speculative cache expired');
      return { valid: false };
    }

    // Levenshtein distance check
    const distance = normalizedDistance(entry.transcript, finalTranscript);
    if (distance > MAX_DIVERGENCE_RATIO) {
      this.cache.delete(sessionId);
      log.debug(
        { sessionId, distance: distance.toFixed(2), threshold: MAX_DIVERGENCE_RATIO },
        'Speculative cache invalidated (transcript diverged)'
      );
      return { valid: false };
    }

    // Valid hit — return cached injections and clear cache
    const { injections } = entry;
    this.cache.delete(sessionId);

    log.debug(
      { sessionId, distance: distance.toFixed(2), injectionCount: injections.length },
      'Speculative cache hit'
    );

    return { valid: true, injections };
  }

  /**
   * Clear cached entries for a session (call on session end).
   */
  cleanup(sessionId: string): void {
    this.cache.delete(sessionId);
    this.buildInProgress.delete(sessionId);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SpeculativeContextBuilder | null = null;

export function getSpeculativeContextBuilder(): SpeculativeContextBuilder {
  if (!instance) {
    instance = new SpeculativeContextBuilder();
  }
  return instance;
}
