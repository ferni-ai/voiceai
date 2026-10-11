/**
 * Paywall flag: the one place the web app decides whether to show payment UI.
 *
 * Ferni is free for now (owner decision, 2026-10-10): nobody is asked to pay,
 * tip, upgrade or join the Founders Fund. The server says whether a paywall is
 * on with `paywall: boolean` on GET /subscription/status and
 * /subscription/config. Payment UI shows only when it says `paywall === true`;
 * a missing field, an old server, a failed request or not having asked yet all
 * mean "no paywall", so nobody sees an upsell by accident.
 *
 * subscription.ui.ts feeds every status/config response it already fetches
 * through `recordPaywallFlag`; nothing here makes a request of its own.
 *
 * @module services/paywall
 */
import { createLogger } from '../utils/logger.js';

const log = createLogger('Paywall');

let paywallOn = false;

/** True only after the server explicitly said `paywall: true`. */
export function isPaywallOn(): boolean {
  return paywallOn;
}

/**
 * Read `paywall` from a /subscription/status or /subscription/config body.
 * Anything other than a literal `true` turns payment UI off.
 */
export function recordPaywallFlag(body: unknown): void {
  const next =
    typeof body === 'object' && body !== null && (body as { paywall?: unknown }).paywall === true;
  if (next !== paywallOn) log.info('Paywall flag changed', { paywall: next });
  paywallOn = next;
}

/** The subscription status fields the connect gate reads. */
export interface ConnectGateStatus {
  canStartConversation?: boolean;
  conversationsRemaining?: number | null;
  approaching?: boolean;
  upgradePrompt?: string | null;
  usage?: {
    canStartConversation?: boolean;
    conversationsRemaining?: number | null;
    approachingLimit?: boolean;
    statusMessage?: string;
  };
}

export interface ConnectGate {
  /** False only when the paywall is on and the user is out of conversations. */
  allowed: boolean;
  /** Approaching the limit: show the usage reminder. Never true without a paywall. */
  approaching: boolean;
  remaining: number | null;
  /** The message for the limit-reached modal, set only when `allowed` is false. */
  limitMessage?: string;
}

/**
 * Whether a call may start, and whether to nudge about limits. Without a
 * paywall every call is allowed and nothing is counted down.
 */
export function connectGate(
  status: ConnectGateStatus | null,
  fallbackLimitMessage: string,
  paywall: boolean = isPaywallOn()
): ConnectGate {
  if (!paywall || !status) return { allowed: true, approaching: false, remaining: null };

  const canStart = status.usage?.canStartConversation ?? status.canStartConversation ?? true;
  if (!canStart) {
    const limitMessage =
      status.usage?.statusMessage || status.upgradePrompt || fallbackLimitMessage;
    return { allowed: false, approaching: false, remaining: 0, limitMessage };
  }

  return {
    allowed: true,
    approaching: status.usage?.approachingLimit ?? status.approaching ?? false,
    remaining: status.usage?.conversationsRemaining ?? status.conversationsRemaining ?? null,
  };
}

/** Test hook: put the flag back to its unknown (off) state. */
export function resetPaywallFlagForTests(): void {
  paywallOn = false;
}
