import { createSessionBindings } from '../../utils/session-bindings.js';
import { FrontendPublisher, type PublisherConfig, type RoomRef } from './frontend-publisher.js';
import { wireRememberMoment } from './remember-moment-ports.js';
import { setMemorySavedSender } from '../../tools/domains/memory/memory-saved.js';

const publishers = createSessionBindings<FrontendPublisher>();

/**
 * The publisher for a call's room.
 *
 * Pass the session ID whenever the caller has it. Without one, the publisher is
 * found only while a single call is live; otherwise this returns a publisher
 * with no room, whose sends are dropped rather than delivered to another caller.
 */
export function getFrontendPublisher(sessionId?: string): FrontendPublisher {
  return publishers.resolve(sessionId) ?? new FrontendPublisher();
}

/**
 * Create the publisher for a call's room. Call {@link releaseFrontendPublisher}
 * when the session ends.
 */
export function initializeFrontendPublisher(
  sessionId: string,
  room: RoomRef,
  config?: PublisherConfig
): FrontendPublisher {
  const publisher = new FrontendPublisher(room, config);
  publishers.bind(sessionId, publisher);
  // A call's room is reachable from here on, so tools may announce to it (REMEMBER_MOMENT).
  wireRememberMoment(getFrontendPublisher);
  // ...and memory writers may tell it a memory was kept (memory_saved, CLIENT_SIGNALS_V2).
  setMemorySavedSender((id, type, payload) => getFrontendPublisher(id).sendData(type, payload));
  return publisher;
}

/** Drop a session's publisher so nothing can publish to its room after the call. */
export function releaseFrontendPublisher(sessionId: string): void {
  const publisher = publishers.resolve(sessionId);
  publisher?.setRoom(null);
  publishers.release(sessionId);
}

/** Drop every session's publisher (for tests). */
export function resetFrontendPublisher(): void {
  publishers.clear();
}
