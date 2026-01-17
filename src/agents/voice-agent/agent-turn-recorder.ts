/**
 * Agent Turn Recorder
 *
 * Unified turn recording that handles:
 * 1. Regular session turn recording (memory persistence)
 * 2. On-behalf call transcript capture (superhuman analysis)
 * 3. Memory attribution tracking (recall quality metrics)
 *
 * This ensures consistent turn recording across all agent speech paths:
 * - Response processor (main responses)
 * - Greeting handler (initial greetings)
 * - Transcript handler (cached responses)
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
 * Record an agent turn with proper handling for on-behalf calls
 *
 * @param sessionId - Session ID for on-behalf lookup
 * @param services - Session services for regular turn recording
 * @param text - The agent's response text
 */
export async function recordAgentTurn(
  sessionId: string,
  services: SessionServices | null | undefined,
  text: string
): Promise<void> {
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

  // Also capture for on-behalf call analysis
  try {
    const { isOnBehalfCall, captureAgentTurn } =
      await import('../integrations/on-behalf-transcript-capture.js');

    if (isOnBehalfCall(sessionId)) {
      captureAgentTurn(sessionId, text);
      log.debug({ sessionId, textLength: text.length }, 'Captured agent turn for on-behalf call');
    }
  } catch {
    // On-behalf capture is non-critical
  }
}

/**
 * Record a user turn with proper handling for on-behalf calls
 * (For on-behalf calls, the "user" is actually the recipient)
 *
 * @param sessionId - Session ID for on-behalf lookup
 * @param services - Session services for regular turn recording
 * @param text - The user/recipient's speech
 */
export async function recordUserTurn(
  sessionId: string,
  services: SessionServices | null | undefined,
  text: string
): Promise<void> {
  if (!text) return;

  // Record to regular session services (memory persistence)
  if (services && typeof services.addTurn === 'function') {
    services.addTurn('user', text);
  }

  // Also capture for on-behalf call analysis
  try {
    const { isOnBehalfCall, captureRecipientTurn } =
      await import('../integrations/on-behalf-transcript-capture.js');

    if (isOnBehalfCall(sessionId)) {
      captureRecipientTurn(sessionId, text);
      log.debug(
        { sessionId, textLength: text.length },
        'Captured recipient turn for on-behalf call'
      );
    }
  } catch {
    // On-behalf capture is non-critical
  }
}
