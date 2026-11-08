/**
 * GMAIL_READ_TOOLS (off by default): offer the Gmail read tools.
 *
 * The Google link carries the calendar scope only; gmail.readonly is a restricted
 * scope (yearly CASA review) and is not requested, so every Gmail read meets a 403.
 * Off: no Gmail read tool is offered, by voice or chat. On: offered, and a failed
 * read is an honest "can't read your inbox" (services/gmail/gmail-honesty.ts).
 *
 * @module config/gmail-read-tools
 */

import { flagOn } from './env-flag.js';

export function isGmailReadToolsOn(): boolean {
  return flagOn('GMAIL_READ_TOOLS');
}
