/**
 * The ports the UI server installs at start-up.
 *
 * @module services/outreach/ui-server-ports
 */
import { installCallUserPort } from './call-user-adapter.js';
import { installForgetFollowUpsPort } from './forget-follow-ups-adapter.js';
import { registerMessagingConsent } from '../messaging/consent.js';

export function installUiServerPorts(): void {
  // Texts and calls to a member (outreach routes, chat) reach only their verified phone.
  installCallUserPort();
  // A topic forgotten in the app (memory view) also closes its open follow-ups.
  installForgetFollowUpsPort();
  // The consent check senders below L4 ask (utils/consent-port.ts).
  registerMessagingConsent();
}
