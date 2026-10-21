/**
 * A milestone's email/SMS counts as done only when the server says it went out.
 *
 * Before: the app marked first-hello celebrated the moment the first call connected
 * and never asked again. The server (which counted only ended calls) said
 * "not-reached", so first-hello never sent. Now an unconfirmed send is retried on the
 * next call, and stops once the server answers sent or already-sent.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMilestoneCelebration = vi.fn();
vi.mock('../../src/services/outreach.service.js', () => ({
  outreachService: { sendMilestoneCelebration },
}));
vi.mock('../../src/services/push-notifications.service.js', () => ({
  showNotification: vi.fn(async () => undefined),
}));

const { initFerniMilestones } = await import('../../src/ui/ferni-milestones.ui.js');

const connect = () =>
  window.dispatchEvent(
    new CustomEvent('ferni:connection-state', { detail: { state: 'connected' } })
  );
const firstHelloCalls = () =>
  sendMilestoneCelebration.mock.calls.filter(([d]) => d.milestoneId === 'first-hello').length;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('milestone outreach confirmation', () => {
  beforeEach(() => {
    localStorage.clear();
    sendMilestoneCelebration.mockReset();
  });

  it('retries until the server says sent, then stops and saves that', async () => {
    initFerniMilestones();
    sendMilestoneCelebration.mockResolvedValue({
      success: true,
      sent: false,
      reason: 'not-reached',
    });
    connect(); // call 1: first-hello fires, the server says not yet
    await flush();
    expect(firstHelloCalls()).toBe(1);

    sendMilestoneCelebration.mockResolvedValue({ success: true, sent: true });
    connect(); // call 2: unconfirmed, so it tries again, and this time it went out
    await flush();
    expect(firstHelloCalls()).toBe(2);

    connect(); // call 3: confirmed, nothing more
    await flush();
    expect(firstHelloCalls()).toBe(2);

    const saved = JSON.parse(localStorage.getItem('ferni-milestones') ?? '{}');
    const hello = saved.milestones.find((m: { id: string }) => m.id === 'first-hello');
    expect(hello.outreachDone).toBe(true);
  });
});
