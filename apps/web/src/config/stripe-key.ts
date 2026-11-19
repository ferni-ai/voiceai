/**
 * Stripe's browser (publishable) key, from `VITE_STRIPE_PUBLISHABLE_KEY` at build time.
 *
 * Public by design: it is compiled into the bundle and grants nothing on its own.
 * A build without it has no card payments, so the seed flow answers
 * `not-configured` before asking the server for a PaymentIntent.
 */

/** The build's publishable key, or '' when payments were never set up for this build. */
export function stripePublishableKey(): string {
  const key: unknown = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  return typeof key === 'string' ? key : '';
}
