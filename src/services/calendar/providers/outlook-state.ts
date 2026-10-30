/** OUTLOOK_CONNECT and the error a linked Outlook raises; apart from outlook-link.ts so flag-off loads nothing heavy. */
import { flagOn } from '../../../config/env-flag.js';

export type OutlookState = 'not_connected' | 'needs_reauth' | 'unreachable';

export const outlookConnectOn = (): boolean => flagOn('OUTLOOK_CONNECT');

/** A Graph read or write that could not run; `state` is what the caller should say. */
export class OutlookUnavailableError extends Error {
  constructor(readonly state: OutlookState) {
    super(`outlook ${state}`);
    this.name = 'OutlookUnavailableError';
  }
}
