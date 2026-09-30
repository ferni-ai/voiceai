/**
 * The calendar job fetches connected calendars only when it can do something
 * with them: push available, or the user has calendar-triggered workflows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pushUp = false;
let workflowUsers: string[] = [];
const collections: string[] = [];
const getEvents = vi.fn(async () => []);

const snap = (ids: string[]) => ({
  docs: ids.map((id) => ({
    id,
    data: () => ({ userId: id }),
    ref: { path: `users/${id}/calendar_providers/google`, parent: { parent: { id } } },
  })),
  size: ids.length,
});
const query = (name: string) => {
  collections.push(name);
  const q = {
    where: () => q,
    get: async () => snap(name === 'workflows' ? workflowUsers : ['cal-user']),
  };
  return q;
};

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collection: query, collectionGroup: query }),
}));
// getUsersWithCalendarConnected() builds its own client.
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection = query;
    collectionGroup = query;
  },
}));
vi.mock('../../outreach/unified-delivery.js', () => ({
  getChannelStatus: vi.fn(async () => ({ push: { available: pushUp } })),
}));
vi.mock('../../calendar/unified-calendar-store.js', () => ({ getEvents }));

const { runCalendarTriggerCheck } = await import('../calendar-trigger-worker.js');

beforeEach(() => {
  pushUp = false;
  workflowUsers = [];
  collections.length = 0;
  vi.clearAllMocks();
});

describe('runCalendarTriggerCheck', () => {
  it('fetches no calendars when push is off and nobody has calendar workflows', async () => {
    const result = await runCalendarTriggerCheck();
    expect(result).toEqual({ usersChecked: 0, push: false });
    expect(collections).not.toContain('google_calendar_tokens');
    expect(collections).not.toContain('calendar_providers');
    expect(getEvents).not.toHaveBeenCalled();
  });

  it('checks users with calendar workflows even without push', async () => {
    workflowUsers = ['wf-user'];
    const result = await runCalendarTriggerCheck();
    expect(result.usersChecked).toBe(1);
    expect(getEvents).toHaveBeenCalledWith('wf-user', expect.anything(), expect.anything());
  });

  it('includes calendar-connected users when push is available', async () => {
    pushUp = true;
    const result = await runCalendarTriggerCheck();
    expect(result.push).toBe(true);
    expect(collections).toContain('google_calendar_tokens');
    expect(result.usersChecked).toBeGreaterThan(0);
  });
});
