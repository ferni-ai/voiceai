/**
 * "Delete my data" keeps the account, so it must keep the sign-in (#3292). The erasure
 * refused the user's tokens on this instance for the life of the process ('gone' is
 * sticky), so after a data-only erasure the app got a 401 here until a restart.
 *
 * With DATA_ERASE_KEEPS_SIGNIN on, a data-only erasure (deleteAllData(uid, true)) holds the
 * sign-in while it runs and restores it only once every step, the record sweep included,
 * has finished; an account deletion keeps it refused, and so does a failed erasure, until
 * a retry fully succeeds. Real erasure and token check; Firestore is an in-memory fake,
 * the other steps are stubs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  beforeDelete: async (_path: string): Promise<void> => {},
  lastStep: async (): Promise<void> => {},
  wellbeingFailures: 0,
  linked: [] as string[],
}));

vi.mock('../../identity/firebase-auth.js', () => ({ ensureFirebaseAdmin: () => true }));
vi.mock('../../../utils/firebase-admin-app.js', () => {
  const { docs } = control;
  const under = (path: string) => [...docs.keys()].filter((p) => p.startsWith(`${path}/`));
  const docRef = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    // As Firestore's: the document must exist (the erasure's `erasing` mark)
    update: async (d: Record<string, unknown>) => {
      if (!docs.has(path)) throw Object.assign(new Error('5 NOT_FOUND'), { code: 5 });
      docs.set(path, { ...docs.get(path), ...d });
    },
    listCollections: async () =>
      [...new Set(under(path).map((p) => p.slice(path.length + 1).split('/')[0]))].map((id) => ({
        id,
      })),
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
    recursiveDelete: async (ref: { path: string }) => {
      await control.beforeDelete(ref.path);
      for (const p of [ref.path, ...under(ref.path)]) docs.delete(p);
    },
  };
  return { getAdminFirestore: () => db };
});
vi.mock('../user-stores.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ERASED_STORES: [
    { collection: 'bogle_users', doc: 'uid' },
    { collection: 'users', doc: 'uid' },
  ],
}));
vi.mock('../erasure-keys.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  gatherErasureKeys: async (_db: unknown, userId: string) => ({
    userId,
    linkedUserIds: control.linked,
    phones: [],
    emails: [],
    sponsoredIdentityIds: [],
    stripeCustomerIds: [],
  }),
  keepStripeCustomersForCleanup: async () => {},
}));
vi.mock('../erase-other-keys.js', () => ({
  KEYED_STORES: [{ label: 'keyed', erase: async () => {}, remains: async () => false }],
}));
vi.mock('../../outreach/outreach-intelligence.js', () => ({ eraseUserOutreachData: vi.fn() }));
vi.mock('../../stores/conversation-history.js', () => ({ getConversationHistoryService: vi.fn() }));
vi.mock('../../memory/cognitive-memory.js', () => ({ getCognitiveMemoryService: vi.fn() }));
vi.mock('../../engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ deleteUserData: vi.fn() }),
}));
vi.mock('../../identity/gmail-send-as-user.js', () => ({ forgetGmailSendGrant: vi.fn() }));
vi.mock('../../identity/google-calendar-disconnect.js', () => ({
  disconnectGoogleCalendar: vi.fn(),
}));
vi.mock('../../../memory/index.js', () => ({
  getDefaultStore: () => ({ deleteProfile: vi.fn() }),
}));
vi.mock('../../wellbeing-tracking/persistence.js', () => ({
  deleteWellbeingData: async () => {
    if (control.wellbeingFailures > 0) {
      control.wellbeingFailures -= 1;
      throw new Error('unavailable');
    }
  },
}));
vi.mock('../../trust-systems/index.js', () => ({ deleteTrustProfiles: vi.fn() }));
vi.mock('../../contacts.js', () => ({ deleteAllContacts: vi.fn() }));
vi.mock('../../stores/productivity-store.js', () => ({
  getProductivityStore: () => ({ clearUserData: vi.fn() }),
}));
// The last step of deleteAllData
vi.mock('../../approvals/answer-cards.js', () => ({
  deleteAnswerCardsForUser: async () => control.lastStep(),
}));

import { getDataExportService } from '../data-export.js';
import { tokenCheckStatus, verifyIdTokenChecked } from '../../identity/token-revocation.js';
import { isErasedOrErasing } from '../../../utils/erasing-mark.js';

// The token check's state lives for the process, so every test erases its own (fictional) uid
let n = 0;
const nextUid = () => `RileyTestUid${String((n += 1)).padStart(16, '0')}`;

/** What the auth middleware answers this uid's (valid, unrevoked) ID token */
async function statusFor(uid: string): Promise<number> {
  const auth = {
    verifyIdToken: async () => ({ uid, auth_time: Math.floor(Date.now() / 1000) - 600 }),
    getUser: async () => ({ disabled: false, providerData: [{ providerId: 'password' }] }),
  };
  try {
    await verifyIdTokenChecked(auth, 'id-token');
    return 200;
  } catch (error) {
    return tokenCheckStatus(error, 401);
  }
}

/** The user's two records, with something under each, as a real account has */
function seed(...uids: string[]): void {
  for (const uid of uids) {
    for (const p of [`bogle_users/${uid}`, `bogle_users/${uid}/memories/m1`, `users/${uid}`])
      control.docs.set(p, { owner: 'Riley Test' });
  }
}
const remnants = (uid: string) => [...control.docs.keys()].filter((p) => p.includes(uid));
const record = (uid: string) => {
  const path = `bogle_users/${uid}`;
  return { exists: control.docs.has(path), data: () => control.docs.get(path) };
};
const erase = (uid: string, keepAccount?: boolean) =>
  getDataExportService().deleteAllData(uid, keepAccount);

beforeEach(() => {
  control.docs.clear();
  control.beforeDelete = async () => {};
  control.lastStep = async () => {};
  control.wellbeingFailures = 0;
  control.linked = [];
  vi.stubEnv('BQ_ERASURE', 'off');
});
afterEach(() => vi.unstubAllEnvs());

describe('flag off: as before', () => {
  beforeEach(() => vi.stubEnv('DATA_ERASE_KEEPS_SIGNIN', 'off'));

  it('a data-only erasure leaves the sign-in refused on this instance (401)', async () => {
    const uid = nextUid();
    seed(uid);
    expect(await statusFor(uid)).toBe(200);
    await erase(uid, true);
    expect(remnants(uid)).toEqual([]);
    expect(await statusFor(uid)).toBe(401);
  });
});

describe('DATA_ERASE_KEEPS_SIGNIN on', () => {
  beforeEach(() => vi.stubEnv('DATA_ERASE_KEEPS_SIGNIN', 'on'));

  it('a data-only erasure, then an authenticated request, is accepted (200)', async () => {
    const uid = nextUid();
    seed(uid);
    const results = await erase(uid, true);
    expect(Object.values(results)).not.toContain(false);
    expect(remnants(uid)).toEqual([]);
    expect(await statusFor(uid)).toBe(200);
  });

  it('mid-erasure the sign-in is refused and the record carries the mark that refuses writes', async () => {
    const uid = nextUid();
    seed(uid);
    const seen: Array<{ status: number; guarded: boolean }> = [];
    control.beforeDelete = async (path) => {
      if (path === `users/${uid}`)
        seen.push({ status: await statusFor(uid), guarded: isErasedOrErasing(record(uid)) });
    };
    await erase(uid, true);
    expect(seen).toEqual([{ status: 401, guarded: true }]);
    expect(await statusFor(uid)).toBe(200);
  });

  it('the sign-in comes back only after the sweep and every later step finished', async () => {
    const uid = nextUid();
    seed(uid);
    const atLastStep: Array<{ status: number; left: string[] }> = [];
    control.lastStep = async () => {
      atLastStep.push({ status: await statusFor(uid), left: remnants(uid) });
    };
    await erase(uid, true);
    expect(atLastStep).toEqual([{ status: 401, left: [] }]);
    expect(await statusFor(uid)).toBe(200);
  });

  it('a sweep that fails keeps the sign-in refused', async () => {
    const uid = nextUid();
    seed(uid);
    control.beforeDelete = async (path) => {
      if (path === `users/${uid}`) throw new Error('unavailable');
    };
    await expect(erase(uid, true)).rejects.toThrow('User record not fully erased');
    expect(await statusFor(uid)).toBe(401);
  });

  it('a later step that leaves data behind keeps the sign-in refused', async () => {
    const uid = nextUid();
    seed(uid);
    control.wellbeingFailures = 1;
    const results = await erase(uid, true);
    expect(results.wellbeing).toBe(false);
    expect(await statusFor(uid)).toBe(401);
  });

  it('account deletion (no keepAccount) still refuses the sign-in for good', async () => {
    const uid = nextUid();
    seed(uid);
    await erase(uid);
    expect(remnants(uid)).toEqual([]);
    expect(await statusFor(uid)).toBe(401);
  });

  it('a linked phone profile is held and restored the same way', async () => {
    const uid = nextUid();
    const phone = `phone:+1555000${String(n).padStart(4, '0')}`;
    seed(uid, phone);
    control.linked = [phone];
    const midway: number[] = [];
    control.lastStep = async () => {
      midway.push(await statusFor(phone));
    };
    await erase(uid, true);
    expect(midway).toEqual([401]);
    expect(remnants(phone)).toEqual([]);
    expect(await statusFor(phone)).toBe(200);
  });

  it('a linked phone profile stays refused when the erasure fails', async () => {
    const uid = nextUid();
    const phone = `phone:+1555000${String(n).padStart(4, '0')}`;
    seed(uid, phone);
    control.linked = [phone];
    control.wellbeingFailures = 1;
    await erase(uid, true);
    expect(await statusFor(phone)).toBe(401);
    expect(await statusFor(uid)).toBe(401);
  });

  it('P1: a later step fails (401), then a retry that fully succeeds signs back in (200)', async () => {
    const uid = nextUid();
    const phone = `phone:+1555000${String(n).padStart(4, '0')}`;
    seed(uid, phone);
    control.linked = [phone];
    control.wellbeingFailures = 1;
    expect((await erase(uid, true)).wellbeing).toBe(false);
    expect(await statusFor(uid)).toBe(401);
    const retry = await erase(uid, true);
    expect(Object.values(retry)).not.toContain(false);
    expect(remnants(uid)).toEqual([]);
    expect(await statusFor(uid)).toBe(200);
    expect(await statusFor(phone)).toBe(200);
  });

  it('P2: the record sweep throws (401), then a retry that fully succeeds signs back in (200)', async () => {
    const uid = nextUid();
    seed(uid);
    control.beforeDelete = async (path) => {
      if (path === `users/${uid}`) throw new Error('unavailable');
    };
    await expect(erase(uid, true)).rejects.toThrow('User record not fully erased');
    expect(await statusFor(uid)).toBe(401);
    control.beforeDelete = async () => {};
    await erase(uid, true);
    expect(remnants(uid)).toEqual([]);
    expect(await statusFor(uid)).toBe(200);
  });

  it('a retry that fails again keeps the sign-in refused', async () => {
    const uid = nextUid();
    seed(uid);
    control.wellbeingFailures = 2;
    await erase(uid, true);
    await erase(uid, true);
    expect(await statusFor(uid)).toBe(401);
  });
});

describe('DATA_ERASE_KEEPS_SIGNIN on: two data-only erasures at once, one fails', () => {
  beforeEach(() => vi.stubEnv('DATA_ERASE_KEEPS_SIGNIN', 'on'));

  /** Both erasures parked at their last step; each ends when its gate opens, in arrival order */
  async function twoAtOnce(uid: string, failing: 0 | 1) {
    const gates: Array<() => void> = [];
    let arrived = 0;
    control.lastStep = async () => {
      const mine = arrived;
      arrived += 1;
      await new Promise<void>((open) => {
        gates.push(open);
      });
      if (mine === failing) throw new Error('unavailable'); // answer_cards: false
    };
    const ended: boolean[] = [];
    const running = [erase(uid, true), erase(uid, true)].map(async (p) => {
      ended.push(!Object.values(await p).includes(false));
    });
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    const end = async (k: number) => {
      gates[k]();
      await vi.waitFor(() => expect(ended).toHaveLength(k + 1));
      return statusFor(uid);
    };
    const done = async () => {
      await Promise.all(running);
      control.lastStep = async () => {}; // the retry runs straight through
    };
    return { end, done, ended };
  }

  it('the success ends first: refused after both, until a retry fully succeeds', async () => {
    const uid = nextUid();
    seed(uid);
    const run = await twoAtOnce(uid, 1);
    expect(await run.end(0)).toBe(401); // the other still holds it
    expect(await run.end(1)).toBe(401); // it failed
    await run.done();
    expect(run.ended).toEqual([true, false]);
    await erase(uid, true);
    expect(await statusFor(uid)).toBe(200);
  });

  it('the failure ends first: the success that overlapped it does not clear it; a retry does', async () => {
    const uid = nextUid();
    seed(uid);
    const run = await twoAtOnce(uid, 0);
    expect(await run.end(0)).toBe(401);
    expect(await run.end(1)).toBe(401);
    await run.done();
    expect(run.ended).toEqual([false, true]);
    await erase(uid, true);
    expect(await statusFor(uid)).toBe(200);
  });
});
