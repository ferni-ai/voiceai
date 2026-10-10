/**
 * Agent Turn Recorder
 *
 * Unified turn recording that handles:
 * 1. Regular session turn recording (memory persistence)
 * 2. Memory attribution tracking (recall quality metrics)
 *
 * On-behalf calls route services.addTurn to the call transcript instead
 * (see integrations/on-behalf-transcript-capture.ts).
 *
 * Agent turns arrive from agent-reply-recorder for every reply the session
 * commits (LLM, cached, greeting).
 *
 * @module voice-agent/agent-turn-recorder
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SessionServices } from '../../services/index.js';
import {
  getAndClearInjectedMemories,
  parseAttributions,
  applyAttributionFeedback,
} from '../../memory/retrieval/index.js';
import { recordMemoryAttribution, recordMemoriesInjected } from '../../memory/dynamic/metrics.js';

const log = createLogger({ module: 'agent-turn-recorder' });

/**
 * Record an agent turn and track which injected memories it used
 *
 * @param sessionId - Session ID for memory attribution
 * @param services - Session services for regular turn recording
 * @param text - The agent's response text
 */
export function recordAgentTurn(
  sessionId: string,
  services: SessionServices | null | undefined,
  text: string
): void {
  if (!text) return;

  // Record to regular session services (memory persistence)
  if (services && typeof services.addTurn === 'function') {
    services.addTurn('assistant', text);
  }

  // Track memory attribution (recall quality metrics)
  try {
    const injectedMemories = getAndClearInjectedMemories(sessionId);
    if (injectedMemories.length > 0) {
      // Record what was injected (by type)
      const byType = {
        thread: injectedMemories.filter((m) => m.type === 'thread').length,
        anchor: injectedMemories.filter((m) => m.type === 'anchor').length,
        semantic: injectedMemories.filter((m) => m.type === 'semantic').length,
      };
      recordMemoriesInjected(injectedMemories.length);

      // Parse response for attributions
      const attribution = parseAttributions(text, injectedMemories);

      // Record attribution metrics
      const attributedByType = {
        thread: attribution.attributions.filter((a) => a.type === 'thread').length,
        anchor: attribution.attributions.filter((a) => a.type === 'anchor').length,
        semantic: attribution.attributions.filter((a) => a.type === 'semantic').length,
      };
      recordMemoryAttribution(
        injectedMemories.length,
        attribution.explicitlyReferenced + attribution.implicitlyReferenced,
        {
          explicit: attribution.explicitlyReferenced,
          implicit: attribution.implicitlyReferenced,
          semantic: attributedByType.semantic,
        }
      );

      log.debug(
        {
          sessionId,
          injected: injectedMemories.length,
          attributed: attribution.explicitlyReferenced + attribution.implicitlyReferenced,
          explicit: attribution.explicitlyReferenced,
          rate: Math.round(attribution.attributionRate * 100) + '%',
        },
        '📊 Memory attribution tracked'
      );

      // Apply feedback loop - boost scores for attributed memories
      if (attribution.attributions.length > 0 && services?.userId) {
        applyAttributionFeedback(services.userId, attribution.attributions).catch((e) => {
          log.debug({ error: String(e) }, 'Feedback loop failed (non-critical)');
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Attribution tracking failed (non-critical)');
  }
}

/**
 * Record a user turn. In an on-behalf call services.addTurn is routed to the
 * call transcript, so the "user" here is the person being called.
 *
 * @param _sessionId - Kept for call-site symmetry with recordAgentTurn
 * @param services - Session services for regular turn recording
 * @param text - The user/recipient's speech
 */
export function recordUserTurn(
  _sessionId: string,
  services: SessionServices | null | undefined,
  text: string
): void {
  if (!text) return;

  // Record to regular session services (memory persistence)
  if (services && typeof services.addTurn === 'function') {
    services.addTurn('user', text);
  }
}
