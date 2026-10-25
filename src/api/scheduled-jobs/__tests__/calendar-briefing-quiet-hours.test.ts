/**
 * The calendar-briefing job hands the 7am calendar push the menu's quiet-hours
 * reader (QUIET_HOURS_FROM_PREFS). The job module can't import it itself (the
 * architecture gate forbids that edge), so this pins the caller's wiring.
 */
import type { ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const briefings = vi.hoisted(() => vi.fn(async (_opts: Record<string, unknown>) => ({ sent: 0 })));
vi.mock('../../../tasks/scheduled/calendar-briefing-job.js', () => ({
  checkAndSendMorningBriefings: briefings,
}));
vi.mock('../../../services/outreach/morning-brief/brief-job.js', () => ({
  runMorningBriefs: async () => ({ recipients: ['texted-uid'], report: {} }),
}));
vi.mock('../../../services/outreach/morning-brief/default-deps.js', () => ({
  defaultMorningBriefDeps: async () => ({}),
}));

const { handleCalendarBriefing } = await import('../background-delivery-jobs.js');
const { isSavedQuietNow } = await import('../../../services/outreach/quiet-hours.js');

describe('calendar-briefing job', () => {
  it('passes the saved quiet-hours reader to the calendar push', async () => {
    const res = { writeHead: () => res, setHeader: () => res, end: () => res };
    await handleCalendarBriefing(res as unknown as ServerResponse);
    expect(briefings).toHaveBeenCalledWith({
      skipUsers: ['texted-uid'],
      quietNow: isSavedQuietNow,
    });
  });
});
