/**
 * The paywall switch.
 *
 * Ferni is free for now (product decision, 2026-10-10): nobody is asked to pay,
 * offered an upgrade, or told their time is up. Teammates are still introduced as
 * the relationship grows; only the paid shortcut and every ask for money go away.
 * Existing supporters keep what their tier gives them.
 *
 * PAYWALL=on brings back upgrade hints, tip and value-capture prompts, the first
 * conversation's timed wrap-up lines, and the payment UI.
 */

export function isPaywallOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['PAYWALL'] === 'on';
}

/** `text` followed by the paid way to get there, which is offered only while the paywall is on. */
export function withUpgradePath(text: string, upgradePath: string): string {
  return isPaywallOn() ? `${text}${upgradePath}` : text;
}

/** A subscription status payload that tells the client whether to show payment UI. */
export function withPaywallState<T extends { canUpgrade: boolean }>(
  info: T
): T & { paywall: boolean } {
  const paywall = isPaywallOn();
  return paywall ? { ...info, paywall } : { ...info, canUpgrade: false, paywall };
}

/** The monetization options the web app may show. */
export function monetizationOptions(): Record<
  'tipJar' | 'valueCapture' | 'ferniFund' | 'b2bAvailable' | 'partnerships',
  boolean
> {
  const on = isPaywallOn();
  return { tipJar: on, valueCapture: on, ferniFund: on, b2bAvailable: on, partnerships: on };
}
