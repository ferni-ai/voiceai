/**
 * No milestone celebrated before the outreach retry existed is ever re-emailed.
 *
 * The app now retries a milestone's email/SMS until the server confirms it. Milestones
 * celebrated under the old code have no confirmation stored, so on first load a one-time
 * migration marks every already-celebrated milestone as confirmed (and stores
 * milestoneOutreachMigratedAt). Only milestones celebrated after that retry.
 */

import { describe, expect, it, vi } from 'vitest';

const sendMilestoneCelebration = vi.fn();
vi.mock('../../src/services/outreach.service.js', () => ({
  outreachService: { sendMilestoneCelebration },
}));
vi.mock('../../src/services/push-notifications.service.js', () => ({
  showNotification: vi.fn(async () => undefined),
}));

const connect = () =>
  window.dispatchEvent(
    new CustomEvent('ferni:connection-state', { detail: { state: 'connected' } })
  );
const callsFor = (id: string) =>
  sendMilestoneCelebration.mock.calls.filter(([d]) => d.milestoneId === id).length;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('milestone outreach migration', () => {
  it('never re-sends a milestone celebrated before it; retries one celebrated after', async () => {
    // State the old code left: first-hello celebrated an hour ago, never confirmed
    localStorage.clear();
    localStorage.setItem(
      'ferni-milestones',
      JSON.stringify({
        milestones: [{ id: 'first-hello', celebrated: true, celebratedAt: Date.now() - 3_600_000 }],
        progress: {
          firstConversation: true,
          conversationDays: [],
          totalConversations: 1,
          personasUsed: [],
          easterEggsFound: [],
          themesUsed: [],
        },
      })
    );
    sendMilestoneCelebration.mockResolvedValue({
      success: true,
      sent: false,
      reason: 'not-reached',
    });

    const { initFerniMilestones, triggerMilestone } =
      await import('../../src/ui/ferni-milestones.ui.js');
    initFerniMilestones();
    expect(localStorage.getItem('milestoneOutreachMigratedAt')).toBeTruthy();

    connect();
    connect();
    await flush();
    expect(callsFor('first-hello')).toBe(0); // celebrated before the migration: never re-sent

    // Celebrated after the migration: the server says not yet, so the next call retries
    triggerMilestone('fifty-talks');
    await flush();
    expect(callsFor('fifty-talks')).toBe(1);
    connect();
    await flush();
    expect(callsFor('fifty-talks')).toBe(2);

    sendMilestoneCelebration.mockResolvedValue({ success: true, sent: true });
    connect();
    await flush();
    connect();
    await flush();
    expect(callsFor('fifty-talks')).toBe(3); // confirmed on the third try, then no more
    expect(callsFor('first-hello')).toBe(0);
  });
});
