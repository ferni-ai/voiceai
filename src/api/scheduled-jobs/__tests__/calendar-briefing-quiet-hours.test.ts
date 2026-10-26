/**
 * The calendar-briefing job hands the 7am calendar push, and the calendar-triggers
 * job the pre-meeting push, the menu's quiet-hours reader (QUIET_HOURS_FROM_PREFS).
 * Neither module can import it itself (the architecture gate forbids that edge),
 * so this pins the callers' wiring.
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
const triggers = vi.hoisted(() => vi.fn(async (_opts?: Record<string, unknown>) => ({})));
vi.mock('../../../services/workflows/calendar-trigger-worker.js', () => ({
  runCalendarTriggerCheck: triggers,
}));

const { handleCalendarBriefing, handleCalendarTriggers } =
  await import('../background-delivery-jobs.js');
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

describe('calendar-triggers job', () => {
  it('passes the saved quiet-hours reader to the pre-meeting push', async () => {
    const res = { writeHead: () => res, setHeader: () => res, end: () => res };
    await handleCalendarTriggers(res as unknown as ServerResponse);
    expect(triggers).toHaveBeenCalledWith({ quietNow: isSavedQuietNow });
  });
});
