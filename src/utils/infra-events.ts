/**
 * Infrastructure Events
 *
 * A simple event emitter for cross-layer communication.
 * Lives in utils layer so it can be imported by any layer.
 *
 * Usage:
 *   In memory layer (emitter):
 *     import { emitInfraEvent } from '../../utils/infra-events.js';
 *     emitInfraEvent('firestore:fallback', { service: 'stm-promotion', reason: '...' });
 *
 *   In services layer (subscriber):
 *     import { onInfraEvent } from '../../utils/infra-events.js';
 *     onInfraEvent('firestore:fallback', (data) => recordFallback(data.service, data.reason));
 *
 * @module utils/infra-events
 */

// ============================================================================
// TYPES
// ============================================================================

export interface InfraEventMap {
  'firestore:fallback': { service: string; reason: string };
  'firestore:success': { service: string };
  'memory:capture': { userId: string; entityCount: number; captureTimeMs: number };
  'memory:promotion': { userId: string; entitiesPromoted: number; sessionId: string };
  'identity:linked': { sourceId: string; targetId: string; collections: string[] };
}

type InfraEventName = keyof InfraEventMap;
type InfraEventHandler<T extends InfraEventName> = (data: InfraEventMap[T]) => void;

// ============================================================================
// EVENT EMITTER
// ============================================================================

const listeners = new Map<InfraEventName, Set<InfraEventHandler<InfraEventName>>>();

/**
 * Emit an infrastructure event.
 * Call this from any layer to signal something happened.
 */
export function emitInfraEvent<T extends InfraEventName>(event: T, data: InfraEventMap[T]): void {
  const handlers = listeners.get(event);
  if (!handlers || handlers.size === 0) {
    return; // No listeners, skip
  }

  for (const handler of handlers) {
    try {
      handler(data);
    } catch {
      // Ignore handler errors - don't let observers break the emitter
    }
  }
}

/**
 * Subscribe to an infrastructure event.
 * Call this from services layer to react to events from lower layers.
 *
 * @returns Unsubscribe function
 */
export function onInfraEvent<T extends InfraEventName>(
  event: T,
  handler: InfraEventHandler<T>
): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }

  const handlers = listeners.get(event)!;
  handlers.add(handler as InfraEventHandler<InfraEventName>);

  // Return unsubscribe function
  return () => {
    handlers.delete(handler as InfraEventHandler<InfraEventName>);
  };
}

/**
 * Remove all listeners for an event (useful for testing).
 */
export function clearInfraEventListeners(event?: InfraEventName): void {
  if (event) {
    listeners.delete(event);
  } else {
    listeners.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  emitInfraEvent,
  onInfraEvent,
  clearInfraEventListeners,
};
