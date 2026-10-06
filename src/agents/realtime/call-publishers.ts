/**
 * One frontend publisher per call.
 *
 * A worker process hosts several calls (USE_SINGLE_PROCESS=true). The
 * publisher used to be a process singleton that every new call re-pointed
 * with setRoom, so call A's app messages (emotion, music, games, tool
 * actions) went to call B's room once B started. Each call now gets its own
 * publisher, found through the call's async context. With more than one call
 * live and no call in context, messages are dropped rather than risk the
 * wrong room.
 *
 * @module agents/realtime/call-publishers
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getLogger } from '../../utils/safe-logger.js';
import { FrontendPublisher, type PublisherConfig, type RoomRef } from './frontend-publisher.js';

const callRoom = new AsyncLocalStorage<RoomRef>();
const publishers = new Map<RoomRef, FrontendPublisher>();
/** Sends nowhere: used when the call can't be told apart (created lazily: circular import). */
let detached: FrontendPublisher | undefined;
let warnedAmbiguous = false;
/** Run `fn` as part of the call on `room`, so getFrontendPublisher() finds its publisher. */
export function runInCall<T>(room: RoomRef, fn: () => T): T {
  return callRoom.run(room, fn);
}

/**
 * The publisher for the current call. With one call live it is that call's;
 * with several, the one whose async context this runs in, else none (sends
 * return false).
 */
export function getFrontendPublisher(): FrontendPublisher {
  const room = callRoom.getStore();
  const own = room ? publishers.get(room) : undefined;
  if (own) return own;
  if (publishers.size === 1) return publishers.values().next().value as FrontendPublisher;
  if (publishers.size > 1 && !warnedAmbiguous) {
    warnedAmbiguous = true;
    getLogger().warn(
      { liveCalls: publishers.size },
      'Frontend message with no call context while several calls are live: not sent'
    );
  }
  return (detached ??= new FrontendPublisher());
}

/**
 * Give this call its own publisher, and mark the current async context as
 * belonging to it (everything this call starts from here finds it).
 */
export function initializeFrontendPublisher(
  room: RoomRef,
  config?: PublisherConfig
): FrontendPublisher {
  let publisher = publishers.get(room);
  if (!publisher) {
    publisher = new FrontendPublisher(room, config);
    publishers.set(room, publisher);
    // A LiveKit Room is an EventEmitter: forget the call when it disconnects.
    (room as { once?: (event: string, fn: () => void) => void }).once?.('disconnected', () =>
      releaseFrontendPublisher(room)
    );
  }
  callRoom.enterWith(room);
  return publisher;
}

/** The call on `room` ended: forget its publisher. */
export function releaseFrontendPublisher(room: RoomRef): void {
  publishers.delete(room);
}

/** Forget every call (for tests). */
export function resetFrontendPublisher(): void {
  publishers.clear();
  warnedAmbiguous = false;
}
