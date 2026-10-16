/**
 * Hands the "I'll remember: …" moment (tools/domains/memory/remember-moment.ts)
 * what a tool may not import itself: the caller's forgotten topics (memory
 * context) and the call's room (this layer).
 *
 * @module agents/realtime/remember-moment-ports
 */

import {
  forgottenInProcess,
  forgottenTopicsOrNull,
  isForgotten,
} from '../../memory/recall/forget.js';
import { setRememberMomentPorts } from '../../tools/domains/memory/remember-moment.js';

interface RoomSender {
  sendData: (type: string, payload: Record<string, unknown>) => Promise<boolean>;
}

/** Plug the moment into the session's forget list and rooms. Safe to call more than once. */
export function wireRememberMoment(publisherFor: (sessionId: string) => RoomSender): void {
  setRememberMomentPorts({
    async isForgotten(userId, text) {
      const stored = await forgottenTopicsOrNull(userId);
      if (stored === null) return null;
      return isForgotten(text, [...stored, ...forgottenInProcess(userId)]);
    },
    send: async (sessionId, type, payload) => publisherFor(sessionId).sendData(type, payload),
  });
}
