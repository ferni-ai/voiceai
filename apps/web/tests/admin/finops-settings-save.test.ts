/**
 * The FinOps Save buttons answer on screen (#4069 W7): an empty or invalid input says so
 * and sends nothing, a failed save says "Couldn't save: unavailable (HTTP n)" (the wording
 * the admin walk accepts as a reason), and a save says "Saved"
 * and fills the input from the server's answer. Driven through the real section with
 * only adminFetch (the network boundary) faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string, init?: RequestInit) => adminFetch(url, init),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** Answers for the section's own loads; each test sets `save` for the settings routes. */
let save: (url: string, init?: RequestInit) => Response;

const writes = () => adminFetch.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET'); // prettier-ignore

async function open() {
  const section = await import('../../src/admin/sections/FinOpsSection.js');
  document.body.innerHTML = `<div id="adminContent">${await section.render()}</div>`;
  await section.setupEvents();
}

async function click(id: string): Promise<string> {
  document.getElementById(id)?.click();
  await vi.waitFor(() => expect(document.getElementById(`${id}-status`)?.textContent ?? '').not.toBe('')); // prettier-ignore
  await vi.waitFor(() => expect((document.getElementById(id) as HTMLButtonElement).disabled).toBe(false)); // prettier-ignore
  return document.getElementById(`${id}-status`)?.textContent ?? '';
}

const type = (id: string, value: string) => {
  (document.getElementById(id) as HTMLInputElement).value = value;
};

beforeEach(() => {
  adminFetch.mockReset();
  adminFetch.mockImplementation(async (url, init) => {
    if (init?.method === 'PUT' || init?.method === 'POST') return save(url, init);
    return json({ alerts: [] }, 503); // the loads fail; the config inputs are still there
  });
});
afterEach(async () => {
  (await import('../../src/admin/sections/FinOpsSection.js')).cleanup();
});

describe('FinOps Save buttons', () => {
  it.each([
    ['save-mrr', 'Enter an amount'],
    ['save-cash', 'Enter an amount'],
    ['save-ltv-config', 'Enter CAC or churn'],
  ])('%s with an empty input says "%s" and sends nothing', async (button, text) => {
    await open();
    expect(await click(button)).toBe(text);
    expect(writes()).toEqual([]);
  });

  it('an invalid amount is refused before sending', async () => {
    await open();
    type('config-cash', '-20');
    expect(await click('save-cash')).toBe('Enter a number of 0 or more');
    type('config-churn', '250');
    expect(await click('save-ltv-config')).toBe('Churn is a percent, 0 to 100');
    expect(writes()).toEqual([]);
  });

  it('a 500 shows "Couldn\'t save: unavailable (HTTP 500)"', async () => {
    save = () => json({}, 500);
    await open();
    type('config-mrr', '1500');
    expect(await click('save-mrr')).toBe("Couldn't save: unavailable (HTTP 500)");
  });

  it('a 503 shows the reason the server gave', async () => {
    save = () => json({ error: 'FinOps settings unavailable', reason: 'firestore down' }, 503);
    await open();
    type('config-cash', '9000');
    expect(await click('save-cash')).toBe("Couldn't save: unavailable (HTTP 503): firestore down");
  });

  it('a save shows "Saved", sends the value and fills the input from the answer', async () => {
    save = (url, init) =>
      url === '/api/finops/ltv-cac'
        ? json({ success: true, inputs: { cac: 80, lifetimeMonths: 12, churnRate: 0.025 } })
        : json({ success: true, mrr: 1500 });
    await open();
    type('config-mrr', '1500.0');
    expect(await click('save-mrr')).toBe('Saved');
    expect((document.getElementById('config-mrr') as HTMLInputElement).value).toBe('1500');

    type('config-cac', '80');
    type('config-churn', '2.5');
    expect(await click('save-ltv-config')).toBe('Saved');
    expect(writes().map(([url, init]) => [url, JSON.parse(String(init?.body))])).toEqual([
      ['/api/finops/revenue', { mrr: 1500 }],
      ['/api/finops/ltv-cac', { cac: 80, churnRate: 0.025 }],
    ]);
    expect((document.getElementById('config-churn') as HTMLInputElement).value).toBe('2.5');
  });

  it('a network error shows "Couldn\'t save: unavailable (network error)"', async () => {
    save = () => {
      throw new TypeError('Failed to fetch');
    };
    await open();
    type('config-mrr', '10');
    expect(await click('save-mrr')).toBe("Couldn't save: unavailable (network error)");
  });
});

describe('Sync from Stripe', () => {
  const mrrInput = () => (document.getElementById('config-mrr') as HTMLInputElement).value;

  it("a 503 shows the server's reason and leaves the MRR input alone", async () => {
    save = () => json({ success: false, error: 'MRR not synced', reason: 'Stripe is not configured' }, 503); // prettier-ignore
    await open();
    type('config-mrr', '1200');
    expect(await click('sync-mrr')).toBe(
      "Couldn't sync: unavailable (HTTP 503): Stripe is not configured"
    );
    expect(mrrInput()).toBe('1200');
  });

  it('a 200 with subscriptions fills the MRR input', async () => {
    save = () => json({ success: true, mrr: 22, subscriptionCount: 2 });
    await open();
    expect(await click('sync-mrr')).toBe('Synced from Stripe (2 subscriptions)');
    expect(mrrInput()).toBe('22');
  });

  it("an older server's 200 with no subscriptions never fills MRR with 0", async () => {
    save = () => json({ success: true, mrr: 0, subscriptionCount: 0 });
    await open();
    type('config-mrr', '1200');
    expect(await click('sync-mrr')).toBe('Stripe reported no subscriptions');
    expect(mrrInput()).toBe('1200');
  });
});
