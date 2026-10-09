/**
 * Two Cloud Scheduler ticks must send one briefing per user per local day.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
const canSendOutreach = vi.fn(() => true);
const isConnected = vi.fn(async () => true);
const getDayOverview = vi.fn(async () => ({ totalMeetings: 2 }));
const generateDailyBriefing = vi.fn(async () => ({
  summary: 'Two meetings after lunch.',
  alerts: [],
  suggestions: ['Leave a little early for the 2pm.'],
}));
const getUserContactInfo = vi.fn(async () => ({ timezone: 'America/New_York' }));

vi.mock('../../../services/push-notifications.js', () => ({
  getPushNotificationsService: () => ({ sendNotification }),
}));
vi.mock('../../../services/outreach-intelligence.js', () => ({
  canSendOutreach,
}));
vi.mock('../../../services/calendar/calendar-service.js', () => ({
  isConnected,
  getDayOverview,
}));
vi.mock('../../../services/calendar/calendar-intelligence.js', () => ({
  generateDailyBriefing,
}));
vi.mock('../../../services/outreach/user-contact.js', () => ({
  getUserContactInfo,
}));

describe('checkAndSendMorningBriefings', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    sendNotification.mockResolvedValue(true);
    const {
      setBriefingNow,
      setBriefingClaimStore,
      setBriefingUserIds,
    } = await import('../calendar-briefing-job.js');
    // 7:15 in America/New_York
    setBriefingNow(() => new Date('2026-10-06T11:15:00.000Z'));
    setBriefingUserIds(['user-alex']);
    const claimed = new Set<string>();
    setBriefingClaimStore({
      async claim(userId, dateKey) {
        const key = `${userId}:${dateKey}`;
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
      async release(userId, dateKey) {
        claimed.delete(`${userId}:${dateKey}`);
      },
    });
  });

  afterEach(async () => {
    const { resetBriefingNow, setBriefingClaimStore, setBriefingUserIds } =
      await import('../calendar-briefing-job.js');
    resetBriefingNow();
    setBriefingClaimStore(null);
    setBriefingUserIds(null);
  });

  it('sends one briefing when the job runs twice for the same local day', async () => {
    const { checkAndSendMorningBriefings } = await import('../calendar-briefing-job.js');

    const first = await checkAndSendMorningBriefings();
    const second = await checkAndSendMorningBriefings();

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      'user-alex',
      expect.objectContaining({
        personaId: 'alex-chen',
        data: expect.objectContaining({ action: 'open_calendar' }),
      })
    );
  });

  it('uses the user timezone for the briefing date key', async () => {
    const { formatDateInTimezone } = await import('../calendar-briefing-job.js');
    // 11:15 UTC is still 6 Oct in New York, already 7 Oct in Tokyo
    const now = new Date('2026-10-06T15:15:00.000Z');
    expect(formatDateInTimezone('America/New_York', now)).toBe('2026-10-06');
    expect(formatDateInTimezone('Asia/Tokyo', now)).toBe('2026-10-07');
  });
});
