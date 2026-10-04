/**
 * Ferni Fund modal: what each gift button does with the server's real answers.
 *
 * The response bodies are the ones POST /api/garden/plant and
 * /api/garden/subscribe actually send (src/tests/seed-payment-contract.test.ts
 * drives the real handlers). Only fetch, the toast, and Stripe.js are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const stripeJs = vi.hoisted(() => ({ instance: null as unknown }));
vi.mock('../../src/services/monetization.service.js', () => ({
  loadStripe: vi.fn(async () => stripeJs.instance),
  formatAmount: (cents: number) => `$${cents / 100}`,
}));

const replies = new Map<string, () => Response>();

function json(status: number, body: unknown): () => Response {
  return () => new Response(JSON.stringify(body), { status });
}

const { open, close } = await import('../../src/ui/ferni-fund.ui.js');

async function settle(ms = 30): Promise<void> {
  await new Promise((r) => {
    setTimeout(r, ms);
  });
}

async function openFund(): Promise<void> {
  await open('uid-1');
  await settle(); // requestAnimationFrame wires the form
}

function choose(selector: string): void {
  (document.querySelector(selector) as HTMLElement).click();
  (document.querySelector('.ferni-fund-submit-btn') as HTMLButtonElement).click();
}

beforeEach(() => {
  vi.clearAllMocks();
  replies.clear();
  replies.set('/api/garden/status', json(200, null));
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const reply = replies.get(String(url));
    return reply ? reply() : new Response('{}', { status: 404 });
  }) as typeof fetch;
});

afterEach(async () => {
  close();
  await settle(400);
  document.body.replaceChildren();
});

describe('Ferni Fund: monthly gift', () => {
  it('says payments are not set up when the server has no Stripe (503)', async () => {
    replies.set(
      '/api/garden/subscribe',
      json(503, { success: false, error: 'Subscription system not configured' })
    );
    await openFund();

    choose('[data-monthly-amount="1000"]');
    await settle();

    expect(toast.error).toHaveBeenCalledWith("Payments aren't set up yet, so nothing was charged.");
  });
});
