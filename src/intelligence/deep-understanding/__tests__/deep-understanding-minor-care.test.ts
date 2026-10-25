/**
 * MINOR_CARE=on: the deep_understanding context builder feeds ten per-user profiles on every turn
 * (the caller's quotes, the people they name, avoided topics, desires, chapter signals). A held
 * call's end skips the save, but the profiles stayed in memory and a later unheld call's end saved
 * them. Now purgeHeldUser drops the held caller's profile in every system (no one else's), no save
 * runs for them until a session start reads them back, and the save itself holds. The builder,
 * the profiles and the purge run for real; only Firestore is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../../services/engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fake.db,
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}));

import { purgeHeldUser } from '../../../agents/voice-agent/minor-care-purge.js';
import { buildDeepUnderstanding } from '../../context-builders/intelligence/deep-understanding.js';
import {
  exportDeepUnderstandingBundle,
  loadDeepUnderstandingProfiles,
  saveDeepUnderstandingProfiles,
} from '../persistence.js';
import { analyzeSilence, getSilencePattern, recordSilence } from '../silence.js';
import { getLifeRhythmProfile } from '../life-rhythm.js';
import { getRelationalNetwork } from '../relationships.js';
import { getResistanceProfile } from '../resistance.js';
import { getEnergyPattern } from '../energy.js';
import { getSubconsciousProfile } from '../subconscious.js';
import { getFlowProfile } from '../flow.js';
import { getRepairProfile } from '../repair.js';
import { getHopeProfile } from '../hope.js';
import { getChapterProfile } from '../life-chapter.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
fake.db = firestore.db;

const FIFTEEN = "I'm 15 and kind of bored tonight.";
const WORDS =
  "My mom Sarah and I keep fighting about school... I wish I could be a vet someday. What if I just ran away? I don't want to talk about my dad.";
const writesFor = (userId: string) =>
  [...firestore.docs.keys()].filter((path) => path.includes(`/${userId}/`));

/** Every system's profile for this user, as the save at a call's end reads it. */
const SYSTEMS: Array<[string, (userId: string) => unknown]> = [
  ['silence', getSilencePattern],
  ['life rhythm', getLifeRhythmProfile],
  ['relational network', getRelationalNetwork],
  ['resistance', getResistanceProfile],
  ['energy', getEnergyPattern],
  ['subconscious', getSubconsciousProfile],
  ['conversational flow', getFlowProfile],
  ['repair', getRepairProfile],
  ['hope', getHopeProfile],
  ['life chapter', getChapterProfile],
];

let n = 0;
type Case = 'held' | 'owner' | 'off';

/** A member caller on a live session, flag on (off for 'off'); holds() says they're 15. */
function caller(c: Case = 'held') {
  n++;
  const sessionId = `session-du${n}-1792867440000`;
  const userId = `Du7vNw8QzR2tLx6Kc9Jm1Bd${String(n).padStart(5, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId); // session-init-handler does this at session start
  const hold = () => {
    heldAfter(sessionId, FIFTEEN, { userId });
    expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  };
  return { userId, sessionId, hold };
}

/** Two live turns through the real builder, plus a silence the caller broke themselves. */
async function speak(userId: string, sessionId: string): Promise<void> {
  for (let turn = 0; turn < 2; turn++) {
    await buildDeepUnderstanding({
      services: { userId, sessionId },
      userText: WORDS,
      analysis: {
        emotion: { primary: 'sad', intensity: 0.7 },
        topics: { detected: ['family', 'school'] },
      },
      userData: {},
    } as never);
  }
  recordSilence(userId, analyzeSilence(6000, WORDS, 'sad', 0.7, ['family'], false), 'self');
}

afterEach(() => {
  firestore.docs.clear();
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: purgeHeldUser drops a held caller from deep understanding', () => {
  it('their words are in the profiles before the purge and gone after', async () => {
    const a = caller();
    await speak(a.userId, a.sessionId);
    const kept = () => JSON.stringify(exportDeepUnderstandingBundle(a.userId));
    expect(kept()).toContain('Sarah'); // the builder really kept their words
    a.hold();
    purgeHeldUser(a.userId);
    expect(kept()).not.toContain('Sarah');
  });

  it.each(SYSTEMS)('%s: the held caller is dropped, another caller is kept', async (_, get) => {
    const a = caller();
    const b = caller();
    await speak(a.userId, a.sessionId);
    await speak(b.userId, b.sessionId);
    const [aBefore, bBefore] = [get(a.userId), get(b.userId)];
    expect(aBefore).toBeDefined();
    a.hold();
    purgeHeldUser(a.userId);
    expect(get(a.userId)).not.toBe(aBefore); // gone (a fresh default, or none)
    expect(get(b.userId)).toBe(bBefore);
  });

  it('a later save for them writes nothing until a session start reads them back', async () => {
    const a = caller();
    await speak(a.userId, a.sessionId);
    a.hold();
    purgeHeldUser(a.userId);
    vi.stubEnv('MINOR_CARE', 'off'); // only the reload marker stands between them and a save
    await speak(a.userId, a.sessionId); // an owner session still live for the same user
    await saveDeepUnderstandingProfiles(a.userId);
    expect(writesFor(a.userId)).toEqual([]);
    await loadDeepUnderstandingProfiles(a.userId);
    await saveDeepUnderstandingProfiles(a.userId);
    expect(writesFor(a.userId).length).toBeGreaterThan(0);
  });
});

describe('MINOR_CARE: the deep understanding save at a call end or periodic sync', () => {
  it.each(['held', 'owner', 'off'] as Case[])(
    'writes none of their profiles when held (%s)',
    async (c) => {
      const who = caller(c);
      await speak(who.userId, who.sessionId);
      who.hold();
      const { saved } = await saveDeepUnderstandingProfiles(who.userId);
      if (c === 'held') {
        expect(saved).toEqual([]);
        expect(writesFor(who.userId)).toEqual([]);
      } else {
        expect(saved).toHaveLength(SYSTEMS.length);
        expect(writesFor(who.userId)).toHaveLength(SYSTEMS.length);
      }
    }
  );
});
