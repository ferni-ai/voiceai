/**
 * OUTLOOK_CONNECT with no database at all, on the REAL persistence layer (the Firestore
 * constructor throws): the Outlook link is unknown, never "linked", a disconnect is not
 * a confirmed delete, and a caller with no calendar hears a line that names no provider.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      throw new Error('no database in this process');
    }
  },
}));

const link = await import('../providers/outlook-link.js');
const { outlookLinkedOr, outlookLinkUnknown } = await import('../providers/outlook-state.js');
const { smartCalendarTools } =
  await import('../../../tools/domains/calendar/calendar-connection-gate.js');
const { CALENDAR_UNCHECKED } = await import('../not-connected-copy.js');

const UID = 'uid-nodb-000000000000000000';
type Exec = { execute: (p: unknown, o: unknown) => Promise<unknown> };

beforeAll(() => {
  process.env.OUTLOOK_CONNECT = 'on';
});
afterAll(() => {
  delete process.env.OUTLOOK_CONNECT;
});

describe('no database', () => {
  it('the link is unknown, not linked', async () => {
    expect(await link.outlookLinkState(UID)).toBe('link_unknown');
    expect(await outlookLinkUnknown(UID)).toBe(true);
    expect(await outlookLinkedOr(UID, async () => false)).toBe(false);
  });

  it('a disconnect is not a confirmed delete', async () => {
    await expect(link.disconnectOutlook(UID)).rejects.toThrow();
  });

  it('a read names no provider and claims no connection', async () => {
    const def = smartCalendarTools.find((d) => d.id === 'getCalendarToday')!;
    const reply = await (def.create({ userId: UID } as never) as Exec).execute({}, {});
    expect(reply).toBe(CALENDAR_UNCHECKED);
  });
});
