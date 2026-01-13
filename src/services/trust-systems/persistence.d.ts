/**
 * Trust Systems Persistence
 *
 * Persists trust profiles to Firestore so they survive across sessions.
 * This is critical - without persistence, trust resets every server restart.
 *
 * Storage Strategy:
 * - Each trust system stores in a subcollection under the user
 * - bogle_users/{userId}/trust_profiles/{systemName}
 * - Automatic sync on session start/end
 *
 * @module TrustPersistence
 */
import { type BoundaryProfile } from './boundary-memory.js';
import { type GrowthProfile } from './growth-reflection.js';
import { type InsideJokesProfile } from './inside-jokes.js';
import { type SmallWinsProfile } from './small-wins.js';
import { type ThinkingOfYouProfile } from './thinking-of-you.js';
import { type PersistedUserUnsaidProfile } from './reading-between-lines.js';
import { type RelationshipHealthScore } from './relationship-health.js';
import { type MomentumProfile } from './celebration-momentum.js';
import { type SentimentTimeline } from './sentiment-timeline.js';
import { type PersonalBaseline } from './voice-prosody-learning.js';
import { type JournalingPattern } from './journaling-prompts.js';
import { type SeasonalProfile } from './seasonal-awareness.js';
import { type LearningProfile } from './learning-style.js';
import { type MediaPreferences } from './media-suggestions.js';
import { type InsightsReport } from './relationship-insights.js';
export interface TrustProfileBundle {
    userId: string;
    boundaries?: BoundaryProfile;
    growth?: GrowthProfile;
    insideJokes?: InsideJokesProfile;
    smallWins?: SmallWinsProfile;
    thinkingOfYou?: ThinkingOfYouProfile;
    unsaid?: PersistedUserUnsaidProfile;
    relationshipHealth?: RelationshipHealthScore;
    celebrationMomentum?: MomentumProfile;
    sentimentTimeline?: SentimentTimeline;
    voiceProsody?: PersonalBaseline;
    journaling?: JournalingPattern;
    seasonal?: SeasonalProfile;
    learningStyle?: LearningProfile;
    mediaPreferences?: MediaPreferences;
    insightsReports?: InsightsReport[];
    lastSynced: Date;
    version: number;
}
/**
 * Save all trust profiles for a user
 */
export declare function saveTrustProfiles(userId: string): Promise<{
    saved: string[];
    failed: string[];
}>;
/**
 * Load all trust profiles for a user and import them into memory
 */
export declare function loadTrustProfiles(userId: string): Promise<{
    loaded: string[];
    notFound: string[];
}>;
/**
 * Call at session start to load trust profiles
 */
export declare function onSessionStart(userId: string): Promise<void>;
/**
 * Call at session end to save trust profiles
 */
export declare function onSessionEnd(userId: string): Promise<void>;
/**
 * Periodic sync during long sessions (every 5 minutes)
 */
export declare function periodicSync(userId: string): Promise<void>;
/**
 * Export all trust profiles as a single bundle
 */
export declare function exportTrustBundle(userId: string): TrustProfileBundle;
/**
 * Import a trust bundle into memory
 */
export declare function importTrustBundle(bundle: TrustProfileBundle): void;
/**
 * Migrate trust data from old storage format (if needed)
 */
export declare function migrateTrustData(userId: string): Promise<void>;
/**
 * Delete all trust profiles for a user (for GDPR deletion)
 */
export declare function deleteTrustProfiles(userId: string): Promise<void>;
declare const _default: {
    saveTrustProfiles: typeof saveTrustProfiles;
    loadTrustProfiles: typeof loadTrustProfiles;
    onSessionStart: typeof onSessionStart;
    onSessionEnd: typeof onSessionEnd;
    periodicSync: typeof periodicSync;
    exportTrustBundle: typeof exportTrustBundle;
    importTrustBundle: typeof importTrustBundle;
    deleteTrustProfiles: typeof deleteTrustProfiles;
};
export default _default;
//# sourceMappingURL=persistence.d.ts.map