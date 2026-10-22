/**
 * The shape of one flag-manifest entry. Flag files (src/config/flags/<NAME>.ts)
 * import FlagSpec from here, not from the legacy registry files, so those files
 * can be emptied and deleted without touching any flag file.
 *
 * For now this re-exports from flag-manifest-entries.ts; the definitions move
 * here when that file is migrated.
 *
 * @module config/flag-spec
 */
export { FLAG_KINDS, FLAG_OWNERS, type FlagSpec } from './flag-manifest-entries.js';
