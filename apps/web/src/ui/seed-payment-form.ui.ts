/**
 * Card form for a one-time Seed Fund gift.
 *
 * A PaymentIntent can't be confirmed without a payment method, so the gift
 * mounts Stripe's Payment Element in a small dialog, using the client secret
 * the server returned, and confirms with that `elements` instance. Cancel
 * (button, backdrop, Escape) closes without charging.
 *
 * Accessible: role="dialog" + aria-modal, focus moves into the dialog and is
 * kept there (Tab wraps), and returns to where it was when the dialog closes.
 *
 * @module ui/seed-payment-form
 */

import type { SeedPaymentOutcome } from '../services/seed-payment.js';

/** The parts of Stripe.js this form uses. */
export interface StripePaymentElement {
  mount(target: HTMLElement): void;
  destroy(): void;
}
export interface StripeElements {
  create(type: 'payment'): StripePaymentElement;
}
export interface StripeForCard {
  elements(options: { clientSecret: string }): StripeElements;
  confirmPayment(options: {
    elements: StripeElements;
    confirmParams: { return_url: string };
  }): Promise<{ error?: { message?: string } }>;
}

const STYLE_ID = 'seed-pay-styles';
const STYLES = `
  .seed-pay-overlay { position: fixed; inset: 0; z-index: var(--z-modal);
    display: flex; align-items: center; justify-content: center; padding: var(--space-md); }
  .seed-pay-backdrop { position: absolute; inset: 0; background: var(--backdrop-medium);
    z-index: var(--z-modal-backdrop); }
  .seed-pay-dialog { position: relative; z-index: var(--z-modal-elevated); width: 100%;
    max-width: 26rem; padding: var(--space-lg); border-radius: var(--radius-lg);
    background: var(--color-bg-elevated); box-shadow: var(--shadow-lg);
    color: var(--color-text-primary); font-family: var(--font-body); }
  .seed-pay-dialog:focus { outline: none; }
  .seed-pay-title { margin: 0 0 var(--space-md); font-size: 1.125rem; font-weight: 600; }
  .seed-pay-element { min-height: 3rem; margin-bottom: var(--space-md); }
  .seed-pay-actions { display: flex; gap: var(--space-sm); justify-content: flex-end; }
  .seed-pay-btn { min-height: 44px; padding: 0 var(--space-md); border-radius: var(--radius-full);
    border: 1px solid var(--color-border-subtle); background: transparent;
    color: var(--color-text-primary); font: inherit; cursor: pointer; }
  .seed-pay-btn--primary { background: var(--color-accent); border-color: var(--color-accent);
    color: var(--color-text-inverse); }
  .seed-pay-btn:hover, .seed-pay-btn:focus-visible { background: var(--color-accent-subtle); }
  .seed-pay-btn--primary:hover, .seed-pay-btn--primary:focus-visible {
    background: var(--color-accent-hover); }
  .seed-pay-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
  .seed-pay-btn:disabled { opacity: 0.6; cursor: default; }
  @media (prefers-reduced-motion: reduce) { .seed-pay-dialog { transition: none; } }
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function buildDialog(amountDollars: number): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'seed-pay-overlay';
  overlay.innerHTML = `
    <div class="seed-pay-backdrop" data-seed-pay="backdrop"></div>
    <div class="seed-pay-dialog" role="dialog" aria-modal="true"
         aria-labelledby="seed-pay-title" tabindex="-1">
      <h2 class="seed-pay-title" id="seed-pay-title">Plant a $${amountDollars} seed</h2>
      <div class="seed-pay-element" data-seed-pay="element"></div>
      <div class="seed-pay-actions">
        <button type="button" class="seed-pay-btn" data-seed-pay="cancel">Cancel</button>
        <button type="button" class="seed-pay-btn seed-pay-btn--primary" data-seed-pay="submit">
          Give $${amountDollars}
        </button>
      </div>
    </div>`;
  return overlay;
}

/** Keep Tab inside the dialog. */
function trapTab(dialog: HTMLElement, event: KeyboardEvent): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button, iframe, [tabindex="0"]')];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Show the card form for `clientSecret` and confirm the payment when the
 * user submits. Resolves `cancelled` if they close it, `failed` on a decline.
 */
export function collectCardPayment(
  stripe: StripeForCard,
  clientSecret: string,
  amountDollars: number
): Promise<SeedPaymentOutcome> {
  injectStyles();
  const returnFocus = document.activeElement as HTMLElement | null;
  const overlay = buildDialog(Math.round(amountDollars)); // a number in the markup, never text
  const dialog = overlay.querySelector<HTMLElement>('.seed-pay-dialog')!;
  const submit = overlay.querySelector<HTMLButtonElement>('[data-seed-pay="submit"]')!;
  const cancel = overlay.querySelector<HTMLButtonElement>('[data-seed-pay="cancel"]')!;
  document.body.appendChild(overlay);

  const elements = stripe.elements({ clientSecret });
  const paymentElement = elements.create('payment');
  paymentElement.mount(overlay.querySelector<HTMLElement>('[data-seed-pay="element"]')!);
  dialog.focus();

  return new Promise((resolve) => {
    let busy = false;
    const finish = (outcome: SeedPaymentOutcome): void => {
      document.removeEventListener('keydown', onKey, true);
      paymentElement.destroy();
      overlay.remove();
      returnFocus?.focus?.();
      resolve(outcome);
    };
    const onCancel = (): void => {
      if (!busy) finish({ status: 'cancelled' });
    };
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation(); // close this dialog, not the modal under it
        onCancel();
      } else if (event.key === 'Tab') trapTab(dialog, event);
    }

    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', onCancel);
    overlay.querySelector('[data-seed-pay="backdrop"]')?.addEventListener('click', onCancel);
    submit.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      submit.disabled = true;
      cancel.disabled = true;
      dialog.setAttribute('aria-busy', 'true');
      void stripe
        .confirmPayment({
          elements,
          confirmParams: { return_url: `${window.location.origin}/garden/success` },
        })
        .then(
          ({ error }) =>
            finish(
              error
                ? { status: 'failed', reason: error.message || 'Payment was declined' }
                : { status: 'confirmed' }
            ),
          (error: unknown) => finish({ status: 'failed', reason: String(error) })
        );
    });
  });
}
