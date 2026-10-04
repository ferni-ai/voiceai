/**
 * Data-message envelope for the live-call data channel (agent → web).
 *
 * Every frontend message is `{ type, ...fields }`. Many payloads carry a `type`
 * of their own: a behavior signal's kind, a trust signal's kind, a speech-state
 * phase. The senders used to build `{ type, ...payload }`, so the payload's
 * `type` replaced the message type and the web never recognised the message
 * (a `behavior_signal` arrived as `mode_shift`, an `avatar_cue` as
 * `anticipatory_response`).
 *
 * The envelope keeps the message type and moves the payload's own `type` to the
 * field the web receiver reads for that message.
 *
 * @module agents/shared/data-message-envelope
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'data-message-envelope' });

/**
 * Where a payload's own `type` goes, per message type. Each entry names the
 * field the web receiver reads:
 * - behavior_signal: apps/web/src/services/behavior-signal.service.ts (signalType)
 * - trust_signal: apps/web/src/app/live-signal-handlers.ts (signalType)
 * - avatar_cue: apps/web/src/app/live-signal-handlers.ts (anticipatoryType)
 * - speech_state: apps/web/src/app/data-message-handlers.ts handleSpeechState (innerType)
 */
export const PAYLOAD_TYPE_FIELD: Readonly<Record<string, string>> = {
  behavior_signal: 'signalType',
  trust_signal: 'signalType',
  avatar_cue: 'anticipatoryType',
  speech_state: 'innerType',
};

/** Field used for a payload `type` on message types without an entry above. */
export const DEFAULT_PAYLOAD_TYPE_FIELD = 'subtype';

/**
 * Build the wire object for a data message. The message type always wins; a
 * differing payload `type` is kept under the receiver's field, unless the
 * payload already sets that field.
 */
export function buildDataMessage(
  type: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const { type: payloadType, ...fields } = payload;
  const message: Record<string, unknown> = { ...fields, type };
  if (payloadType !== undefined && payloadType !== type) {
    const field = PAYLOAD_TYPE_FIELD[type] ?? DEFAULT_PAYLOAD_TYPE_FIELD;
    if (message[field] === undefined) message[field] = payloadType;
  }
  return message;
}

/**
 * Flatten a sequenced handoff UI event (handoff-coordinator `emitUIEvent`) into
 * the data message the web handoff service reads: the event's data fields at
 * the top level, then its type and the session message sequence number.
 */
export function buildHandoffUIMessage(
  event: { type: string; data?: Record<string, unknown> },
  seq: number
): Record<string, unknown> {
  return { ...event.data, type: event.type, seq, timestamp: Date.now() };
}

/** Encode a data message for `publishData`. */
export function encodeDataMessage(type: string, payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(buildDataMessage(type, payload)));
}

/** The part of a LiveKit room a data-message sender needs. */
export interface DataMessageRoom {
  localParticipant?: {
    publishData: (data: Uint8Array, options: { reliable: boolean }) => Promise<void>;
  } | null;
}

export type DataMessageSender = (type: string, payload: Record<string, unknown>) => Promise<void>;

/**
 * Create the best-effort sender used by the turn handlers. A failed publish is
 * logged and never thrown: a dropped UI signal must not break a turn.
 */
export function createDataMessageSender(room: DataMessageRoom | undefined): DataMessageSender {
  return async (type, payload) => {
    try {
      await room?.localParticipant?.publishData(encodeDataMessage(type, payload), {
        reliable: true,
      });
    } catch (error) {
      log.debug({ type, error: String(error) }, 'Data message publish failed (non-critical)');
    }
  };
}
