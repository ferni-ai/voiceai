/**
 * Calls go out between 9:00 and 20:30 in the recipient's local time; outside
 * that, the next opening. The recipient's zone comes from what's stored, then
 * the area code, then the sponsor; a recipient's quiet hours narrow the window.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactInfo = vi.fn(
  async (_userId: string) => undefined as { timezone?: string } | undefined
);
const userDocs: Record<string, Record<string, unknown>> = {};
vi.mock('../user-contact.js', () => ({ getUserContactInfo: contactInfo }));
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({ get: async () => ({ data: () => userDocs[`${name}/${id}`] }) }),
    }),
  }),
}));

const { checkCallHours, nextCallableTime, localMinutes } = await import('../call-hours-guard.js');
const { timezoneFromPhone } = await import('../area-code-timezones.js');

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';
const at = (iso: string) => new Date(iso);
const local = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

beforeEach(() => {
  contactInfo.mockReset().mockResolvedValue(undefined);
  for (const key of Object.keys(userDocs)) delete userDocs[key];
});

describe('nextCallableTime', () => {
  it('lets a 10am call through unchanged', () => {
    const now = at('2026-10-13T17:00:00Z'); // Tue 10:00 in LA
    expect(nextCallableTime(now, [LA]).getTime()).toBe(now.getTime());
  });

  it('defers an 11pm call to 9:00 the next morning, recipient time', () => {
    const now = at('2026-10-14T06:00:00Z'); // Tue 23:00 in LA
    const next = nextCallableTime(now, [LA]);
    expect(local(next, LA)).toBe('Wed 09:00');
  });

  it('defers a 7am call to 9:00 the same morning', () => {
    const next = nextCallableTime(at('2026-10-13T14:00:00Z'), [LA]); // Tue 07:00 LA
    expect(local(next, LA)).toBe('Tue 09:00');
  });

  it('treats 20:30 as closed and 20:29 as open', () => {
    const open = at('2026-10-14T03:29:00Z'); // Tue 20:29 LA
    const closed = at('2026-10-14T03:30:00Z'); // Tue 20:30 LA
    expect(nextCallableTime(open, [LA]).getTime()).toBe(open.getTime());
    expect(local(nextCallableTime(closed, [LA]), LA)).toBe('Wed 09:00');
  });

  it('judges the same instant by each recipient’s own clock', () => {
    const now = at('2026-10-13T14:00:00Z'); // 10:00 New York, 07:00 Los Angeles
    expect(nextCallableTime(now, [NY]).getTime()).toBe(now.getTime());
    expect(local(nextCallableTime(now, [LA]), LA)).toBe('Tue 09:00');
  });

  it('opens at 9:00 wall-clock across a daylight-saving change', () => {
    const now = at('2026-11-01T05:00:00Z'); // Sat Oct 31 22:00 LA (PDT); DST ends overnight
    const next = nextCallableTime(now, [LA]);
    expect(local(next, LA)).toBe('Sun 09:00');
    expect(next.toISOString()).toBe('2026-11-01T17:00:00.000Z'); // 09:00 PST

    const spring = nextCallableTime(at('2027-03-14T06:00:00Z'), [LA]); // Sat 22:00 PST; DST starts
    expect(spring.toISOString()).toBe('2027-03-14T16:00:00.000Z'); // 09:00 PDT, not 10:00
  });

  it('honours quiet hours that are stricter than the window', () => {
    const now = at('2026-10-13T16:00:00Z'); // Tue 09:00 LA
    const next = nextCallableTime(now, [LA], [{ startMin: 22 * 60, endMin: 10 * 60 + 30 }]);
    expect(local(next, LA)).toBe('Tue 10:30');
  });

  it('with two zones, waits until both are open', () => {
    const now = at('2026-10-14T03:00:00Z'); // Tue 23:00 NY, 20:00 LA
    const next = nextCallableTime(now, [NY, LA]);
    expect(local(next, LA)).toBe('Wed 09:00');
    expect(local(next, NY)).toBe('Wed 12:00');
  });
});

describe('timezoneFromPhone', () => {
  it('maps US and Canadian area codes, in any format', () => {
    expect(timezoneFromPhone('+1 (213) 555-0100')).toBe(LA);
    expect(timezoneFromPhone('12125550100')).toBe(NY);
    expect(timezoneFromPhone('808-555-0100')).toBe('Pacific/Honolulu');
    expect(timezoneFromPhone('+1 604 555 0100')).toBe(LA); // Vancouver keeps Pacific time
  });

  it('knows nothing about non-NANP or malformed numbers', () => {
    expect(timezoneFromPhone('+44 20 7946 0958')).toBeUndefined();
    expect(timezoneFromPhone('555-0100')).toBeUndefined();
    expect(timezoneFromPhone(undefined)).toBeUndefined();
  });
});

describe('checkCallHours', () => {
  const elevenPmLA = at('2026-10-14T06:00:00Z'); // 23:00 LA, 02:00 NY

  it('defers by the stored time zone first', async () => {
    const d = await checkCallHours({
      now: elevenPmLA,
      recipientTimezone: LA,
      recipientPhone: '+12125550100',
    });
    expect(d).toMatchObject({ allowed: false, timezone: LA, source: 'stored' });
    expect(local(d.at, LA)).toBe('Wed 09:00');
  });

  it('falls back to the area code, then the sponsor', async () => {
    const byPhone = await checkCallHours({ now: elevenPmLA, recipientPhone: '+12135550100' });
    expect(byPhone).toMatchObject({ allowed: false, timezone: LA, source: 'area_code' });

    contactInfo.mockResolvedValue({ timezone: 'Europe/London' }); // 07:00 in London
    const bySponsor = await checkCallHours({ now: elevenPmLA, sponsorUserId: 's1' });
    expect(contactInfo).toHaveBeenCalledWith('s1');
    expect(bySponsor).toMatchObject({
      allowed: false,
      timezone: 'Europe/London',
      source: 'sponsor',
    });
    expect(local(bySponsor.at, 'Europe/London')).toBe('Wed 09:00');
  });

  it('allows a 10am call', async () => {
    const now = at('2026-10-13T17:00:00Z'); // 10:00 LA
    const d = await checkCallHours({ now, recipientTimezone: LA });
    expect(d).toEqual({ allowed: true, at: now, timezone: LA, source: 'stored' });
  });

  it('applies a Ferni user’s own quiet hours in their own time zone', async () => {
    contactInfo.mockImplementation(async (id) => (id === 'u1' ? { timezone: LA } : undefined));
    userDocs['bogle_users/u1'] = {
      outreachPreferences: { quietHours: { enabled: true, start: '21:00', end: '11:00' } },
    };
    const now = at('2026-10-13T17:00:00Z'); // 10:00 LA: inside the window, inside quiet hours
    const d = await checkCallHours({ now, recipientUserId: 'u1', recipientPhone: '+12125550100' });
    expect(d.allowed).toBe(false);
    expect(local(d.at, LA)).toBe('Tue 11:00');
  });

  it('ignores quiet hours the user turned off', async () => {
    contactInfo.mockResolvedValue({ timezone: LA });
    userDocs['bogle_users/u1'] = {
      outreachPreferences: { quietHours: { enabled: false, start: '21:00', end: '11:00' } },
    };
    const now = at('2026-10-13T17:00:00Z');
    expect((await checkCallHours({ now, recipientUserId: 'u1' })).allowed).toBe(true);
  });

  it('with no zone at all, requires the window on both coasts', async () => {
    const d = await checkCallHours({ now: at('2026-10-13T14:00:00Z') }); // 10:00 NY, 07:00 LA
    expect(d).toMatchObject({ allowed: false, source: 'fallback' });
    expect(local(d.at, LA)).toBe('Tue 09:00');
    expect(localMinutes(d.at, NY)).toBe(12 * 60);
  });
});
