/**
 * The recorder's options and the session's turn handling (turn-receipt.ts re-exports both).
 */
import type { TurnReceipt } from './turn-receipt.js';

/** How turns end and how barge-in works on the session, read at the commit. */
export interface TurnHandling {
  turnDetection: string;
  interruptionMode: string;
}

export interface TurnReceiptOptions {
  sessionId: string;
  userId: string | undefined;
  /** The persona on the call now (follows handoffs). */
  persona: () => string | null | undefined;
  /** A phone (SIP) caller; undefined when the call path is not known. */
  phoneCaller?: boolean;
  /** The session's turn handling now (attachTurnReceipts reads LiveKit's activity). */
  handling?: () => TurnHandling;
  emit?: (receipt: TurnReceipt) => void;
  now?: () => number;
  env?: Record<string, string | undefined>;
}
