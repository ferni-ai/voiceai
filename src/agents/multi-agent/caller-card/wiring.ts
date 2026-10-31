/**
 * The production readers behind the caller card's ports (spec §5.4.2). Existing readers only,
 * plus one narrow dynamic_facts query for the home fact (homeFactValue).
 *
 * @module agents/multi-agent/caller-card/wiring
 */
import { forgottenInProcess } from '../../../memory/index.js';
import { sharedHeld } from '../../../services/outreach/minor-care-shared-hold.js';
import { profileOnceLoaded } from '../../../services/session/deferred-profile.js';
import type { SessionServices } from '../../../services/types.js';
import { getUserPreferences } from '../../../tools/domains/information/preferences/index.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { userHeld } from '../../../utils/minor-care.js';
import { firestoreRecallStore } from '../recall-firestore-store.js';
import { within } from './load.js';
import { choosePlace } from './place.js';
import type { CallerCardPorts } from './ports.js';

const HOME_SOURCE_MS = 300; // each home source alone, inside the budget (minor care runs first)
/** What the card reads from the session: the caller's id and the profile once it has loaded. */
export type CardServices = Pick<SessionServices, 'userId' | 'userProfile'>;

/** The newest live home fact (entityName User, key home). Equality filters: no composite index. */
async function homeFactValue(userId: string): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('dynamic_facts')
    .where('entityName', '==', 'User')
    .where('key', '==', 'home')
    .limit(20)
    .get();
  const live = snap.docs
    .map((d) => d.data())
    .filter((f) => typeof f.value === 'string' && !f.supersededAt && !f.forgottenAt);
  const at = (f: { extractedAt?: unknown }): number => Date.parse(String(f.extractedAt)) || 0;
  return (live.sort((a, b) => at(b) - at(a))[0]?.value as string | undefined) ?? null;
}

async function source<T>(work: Promise<T>, what: string): Promise<T | null> {
  const got = await within(work, HOME_SOURCE_MS, what);
  return typeof got === 'object' ? got.value : null;
}

export function callerCardPorts(services: CardServices): CallerCardPorts {
  return {
    async home(userId) {
      const [prefs, profile, fact] = await Promise.all([
        source(getUserPreferences(userId), 'caller card saved home'),
        source(profileOnceLoaded(services), 'caller card profile'),
        source(homeFactValue(userId), 'caller card home fact'),
      ]);
      const where = profile?.location;
      return choosePlace({
        prefs: prefs?.homeLocation?.address,
        profile: where?.city ? { value: where.city, source: where.source } : null,
        fact,
      });
    },
    // The reader recall's snapshot uses, plus forgets made in this process mid-call.
    async forgotten(userId) {
      const stored = (await firestoreRecallStore.forgotten?.(userId)) ?? null;
      return stored && [...stored, ...forgottenInProcess(userId)];
    },
    // The account-level MINOR_CARE hold: any held session here, or the shared hold record.
    minorCare: async (userId) => userHeld(userId) || sharedHeld(userId),
  };
}
