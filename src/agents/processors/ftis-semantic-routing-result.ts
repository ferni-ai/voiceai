/**
 * An FTIS routing result in the SemanticRoutingResult shape the turn pipeline reads.
 *
 * @module agents/processors/ftis-semantic-routing-result
 */

import type { FTISRoutingResult } from './tool-routing-integration.js';
import type { SemanticRoutingResult } from './types.js';

/**
 * Convert FTIS routing result to SemanticRoutingResult.
 *
 * Maps FTIS result fields to the SemanticRoutingResult format
 * used by the rest of the pipeline.
 */
export function convertToSemanticRoutingResult(
  ftisResult: FTISRoutingResult
): SemanticRoutingResult {
  // Not attempted or failed
  if (!ftisResult.attempted || ftisResult.error) {
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: 0,
        matchPath: 'none',
      },
      routingPath: ftisResult.error ? 'error' : 'disabled',
    };
  }

  // Direct execution happened
  if (ftisResult.bypassLLM && ftisResult.toolResult) {
    return {
      routed: true,
      bypassLLM: true,
      toolResult: {
        toolId: ftisResult.toolResult.toolId,
        output: ftisResult.toolResult.output,
        success: ftisResult.toolResult.success,
        speakableResponse: ftisResult.toolResult.speakableResponse,
      },
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: ftisResult.classification?.confidence || 0,
        matchPath: 'combined', // FTIS uses combined pattern + keyword matching
      },
      routingPath: 'semantic_auto_execute', // Direct execution = auto execute
    };
  }

  // Classification only (hint mode)
  if (ftisResult.classification) {
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: ftisResult.classification.confidence,
        matchPath: 'combined', // FTIS uses combined pattern + keyword matching
      },
      routingPath: 'semantic_hint', // Classification only = hint mode
    };
  }

  // Fallback - conversation detected
  return {
    routed: false,
    bypassLLM: false,
    metrics: {
      latencyMs: ftisResult.processingTimeMs,
      cacheHit: false,
      confidence: 0,
      matchPath: 'none',
    },
    routingPath: 'semantic_conversation', // No tool needed
  };
}
