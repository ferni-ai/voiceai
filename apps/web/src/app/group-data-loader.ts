/**
 * Group roundtable / call messages are rare, so their handler (group-data-messages.ts) is
 * loaded on the first one instead of riding in the main bundle. Messages that arrive while
 * it loads are queued and handled in arrival order; after that, handling is synchronous.
 *
 * @module app/group-data-loader
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('GroupDataLoader');

type GroupHandler = (message: unknown) => boolean;
/** Messages kept while the handler loads; past this the oldest are dropped. */
const MAX_PENDING = 50;

/** Every type group-data-messages.ts handles (a test keeps the two in step). */
export const GROUP_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'group_roundtable_started',
  'group_roundtable_ended',
  'group_call_participant_added',
  'group_call_participant_status',
  'group_call_participant_removed',
  'group_speaker_changed',
  'group_state',
  'group_error',
]);

let handler: GroupHandler | null = null;
let loading: Promise<GroupHandler> | null = null;
/** Messages that arrived while the handler loads, in arrival order. */
const pending: unknown[] = [];

/** Load the group handler now (the first group message does this on its own). */
export function loadGroupDataMessages(): Promise<GroupHandler> {
  loading ??= import('./group-data-messages.js')
    .then((m) => {
      // Drain what arrived while loading before anything newer can run: a message routed
      // from another promise chain must not overtake an earlier one (e.g. a speaker change
      // before the roundtable that starts it).
      for (const message of pending.splice(0)) m.handleGroupDataMessage(message);
      handler = m.handleGroupDataMessage;
      return handler;
    })
    .catch((error: unknown) => {
      // A failed chunk load (e.g. a deploy changed its hash) must not stick: the next group
      // message tries again, and the queue keeps what arrived meanwhile
      loading = null;
      log.warn('Group message handler failed to load', { error: String(error) });
      throw error;
    });
  return loading;
}

/** True when the message is a group message; it is then handled, now or once loaded. */
export function routeGroupDataMessage(message: unknown): boolean {
  const type = (message as { type?: unknown } | null)?.type;
  if (typeof type !== 'string' || !GROUP_MESSAGE_TYPES.has(type)) return false;
  if (handler) handler(message);
  else {
    pending.push(message);
    if (pending.length > MAX_PENDING) pending.shift();
    loadGroupDataMessages().catch(() => undefined); // logged above; retried on the next message
  }
  return true;
}
