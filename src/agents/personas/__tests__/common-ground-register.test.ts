/**
 * The common-ground writer through the real after-call registry, as endSession
 * starts it: agents/after-call-register.ts → runAfterCallTasks. Only the
 * database and the model are fakes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  const docs = new Map<string, unknown>();
  const generateContent = vi.fn(async () => ({
    response: {
      text: () =>
        JSON.stringify({
          told: [{ kind: 'advice', text: 'Ferni suggested a two-minute morning log of what changed' }],
          references: [{ phrase: 'the spreadsheet goblin', meaning: 'their boss, who reorganizes spreadsheets' }],
        }),
    },
  }));
  const ref = (uid: string) => ({
    get: async () => ({ data: () => docs.get(uid) }),
    set: async (v: unknown) => void docs.set(uid, v),
  });
  const db = {
    collection: () => ({ doc: (uid: string) => ({ collection: () => ({ doc: () => ref(uid) }) }) }),
  };
  return { docs, db, generateContent };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fakes.db }));
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({ generateContent: fakes.generateContent }),
}));

import '../../after-call-register.js';
import {
  drainAfterCallTasks,
  registeredAfterCallTasks,
  runAfterCallTasks,
} from '../../../services/session/after-call-tasks.js';

const turns = [
  { role: 'user', content: "My boss reorganized every spreadsheet again. He's a spreadsheet goblin." },
  { role: 'assistant', content: 'The spreadsheet goblin strikes again! What did he do?' },
  { role: 'user', content: 'Renamed every tab. The spreadsheet goblin never sleeps.' },
  { role: 'assistant', content: "I'd keep a two-minute log each morning of what changed, so it never ambushes you." },
];
const call = (userId: string, personaId?: string) => ({
  userId,
  sessionId: `s-${userId}`,
  personaId,
  turns,
  startedAt: new Date(),
});

afterEach(() => {
  vi.unstubAllEnvs();
  fakes.generateContent.mockClear();
});

describe('common ground as an after-call task', () => {
  it('is registered, and writes the caller ground after a call with COMMON_GROUND=on', async () => {
    expect(registeredAfterCallTasks()).toContain('common-ground');
    vi.stubEnv('COMMON_GROUND', 'on');
    runAfterCallTasks(call('u-on'));
    expect(await drainAfterCallTasks(2000)).toBe(0);
    const saved = fakes.docs.get('u-on') as { references: Array<{ phrase: string }>; told: unknown[] };
    expect(saved.references.map((r) => r.phrase)).toEqual(['the spreadsheet goblin']);
    expect(saved.told).toHaveLength(1);
  });

  it("does nothing with the flag off, or for another persona's call", async () => {
    runAfterCallTasks(call('u-off'));
    vi.stubEnv('COMMON_GROUND', 'on');
    runAfterCallTasks(call('u-maya', 'maya'));
    await drainAfterCallTasks(2000);
    expect(fakes.docs.has('u-off')).toBe(false);
    expect(fakes.docs.has('u-maya')).toBe(false);
    expect(fakes.generateContent).not.toHaveBeenCalled();
  });
});
