/**
 * setQuietHours by voice: once messagingPrefs holds the window, the caller hears
 * it was set, even when the nudges' own copy (ambient mode) can't be written.
 * Before: that second write threw and the tool said "I couldn't set quiet hours"
 * about a window that was already saved and enforced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUserDocs } from '../../../../services/messaging/__tests__/fake-user-docs.js';

const h = vi.hoisted(() => ({ db: null as unknown, ambient: vi.fn() }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => h.db,
}));
vi.mock('../../../../services/ambient-mode/index.js', () => ({
  ambientMode: { setQuietHours: h.ambient },
}));

const { installQuietHoursWriter } =
  await import('../../../../services/messaging/voice-quiet-hours.js');
const { readPrefs } = await import('../../../../services/messaging/prefs.js');
const { getToolDefinitions } = await import('../index.js');

async function say(startTime: string, endTime: string): Promise<string> {
  const def = (await getToolDefinitions()).find((d) => d.id === 'setQuietHours');
  if (!def) throw new Error('setQuietHours is not in ambient-mode');
  const ctx = {
    userId: 'riley-test-01',
    sessionId: 's-1',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  };
  const tool = def.create(ctx) as unknown as { execute: (a: object, o: object) => Promise<string> };
  return tool.execute({ startTime, endTime }, {});
}

let store: ReturnType<typeof fakeUserDocs>;
beforeEach(() => {
  store = fakeUserDocs();
  h.db = store.db;
  h.ambient.mockReset();
  installQuietHoursWriter(); // what live-call-behaviors.ts does for every call
});

describe('setQuietHours', () => {
  it('says it was set when prefs saved, even though the ambient copy threw', async () => {
    h.ambient.mockRejectedValue(new Error('ambient store down'));
    const said = await say('22:30', '06:30');
    expect(h.ambient).toHaveBeenCalledWith('riley-test-01', '22:30', '06:30');
    expect(said).toMatch(/^Got it! I'll keep quiet from 10:30 PM to 6:30 AM/);
    expect(await readPrefs('riley-test-01')).toMatchObject({
      quietStart: '22:30',
      quietEnd: '06:30',
      updatedBy: 'voice',
    });
  });

  it('says it could not when the prefs themselves did not save', async () => {
    h.db = null;
    expect(await say('22:30', '06:30')).toMatch(/couldn't set quiet hours/);
    expect(h.ambient).not.toHaveBeenCalled();
  });
});
