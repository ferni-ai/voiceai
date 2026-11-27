/**
 * Pure person rules of the memory context, for callers outside it. Importing these leaf
 * modules, not src/memory/index.ts, keeps the store adapters (redis, Firestore) out of
 * bundles that only need a rule, such as the web build.
 *
 * @module memory/domain
 */

export { couldBePerson, nameAsSaid } from './person-name.js';
export { placeAfter, properNameAsSaid } from './place-name.js';
export {
  groupOf,
  keepLetters,
  nameTokens,
  OWNER_LEAD,
  personKey,
  relationOf,
} from './person-key.js';
export { relationWordNearest, relationWords } from './person-key.js';
export type { RelationGroup } from './person-key.js';
