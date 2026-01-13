/**
 * Deep Understanding Systems Persistence
 *
 * Persists deep understanding profiles to Firestore so they survive across sessions.
 * This is critical - without persistence, understanding resets every server restart.
 *
 * Storage Strategy:
 * - Each system stores in a subcollection under the user
 * - bogle_users/{userId}/deep_understanding/{systemName}
 * - Automatic sync on session start/end
 *
 * @module DeepUnderstandingPersistence
 */
import { type SilencePattern } from './silence.js';
import { type LifeRhythmProfile } from './life-rhythm.js';
import { type RelationalNetwork } from './relationships.js';
import { type ResistanceProfile } from './resistance.js';
import { type EnergyPattern } from './energy.js';
import { type SubconsciousProfile } from './subconscious.js';
import { type FlowProfile } from './flow.js';
import { type RepairProfile } from './repair.js';
import { type HopeProfile } from './hope.js';
import { type ChapterProfile } from './life-chapter.js';
export interface DeepUnderstandingBundle {
    userId: string;
    silencePattern?: SilencePattern;
    lifeRhythm?: LifeRhythmProfile;
    relationalNetwork?: RelationalNetwork;
    resistance?: ResistanceProfile;
    energy?: EnergyPattern;
    subconscious?: SubconsciousProfile;
    conversationalFlow?: FlowProfile;
    repair?: RepairProfile;
    hope?: HopeProfile;
    lifeChapter?: ChapterProfile;
    lastSynced: Date;
    version: number;
}
/**
 * Save all deep understanding profiles for a user
 */
export declare function saveDeepUnderstandingProfiles(userId: string): Promise<{
    saved: string[];
    failed: string[];
}>;
/**
 * Load all deep understanding profiles for a user and import them into memory
 */
export declare function loadDeepUnderstandingProfiles(userId: string): Promise<{
    loaded: string[];
    notFound: string[];
}>;
/**
 * Call at session start to load deep understanding profiles
 */
export declare function onSessionStart(userId: string): Promise<void>;
/**
 * Call at session end to save deep understanding profiles
 */
export declare function onSessionEnd(userId: string): Promise<void>;
/**
 * Periodic sync during long sessions (every 5 minutes)
 */
export declare function periodicSync(userId: string): Promise<void>;
/**
 * Export all deep understanding profiles as a single bundle
 */
export declare function exportDeepUnderstandingBundle(userId: string): DeepUnderstandingBundle;
/**
 * Import a deep understanding bundle into memory
 */
export declare function importDeepUnderstandingBundle(bundle: DeepUnderstandingBundle): void;
/**
 * Delete all deep understanding profiles for a user (for GDPR deletion)
 */
export declare function deleteDeepUnderstandingProfiles(userId: string): Promise<void>;
declare const _default: {
    saveDeepUnderstandingProfiles: typeof saveDeepUnderstandingProfiles;
    loadDeepUnderstandingProfiles: typeof loadDeepUnderstandingProfiles;
    onSessionStart: typeof onSessionStart;
    onSessionEnd: typeof onSessionEnd;
    periodicSync: typeof periodicSync;
    exportDeepUnderstandingBundle: typeof exportDeepUnderstandingBundle;
    importDeepUnderstandingBundle: typeof importDeepUnderstandingBundle;
    deleteDeepUnderstandingProfiles: typeof deleteDeepUnderstandingProfiles;
};
export default _default;
//# sourceMappingURL=persistence.d.ts.map