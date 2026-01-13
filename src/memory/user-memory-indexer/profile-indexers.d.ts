/**
 * Profile Indexers
 *
 * Index profile-related data: key moments, people, threads, follow-ups,
 * life events, goals, persona memories, shared content, preferences, entertainment.
 *
 * @module memory/user-memory-indexer/profile-indexers
 */
import type { UserProfile, KeyMoment, FamilyMember, LifeEvent, FinancialGoal } from '../../types/user-profile.js';
import { type AnyVectorStore } from './types.js';
/**
 * Index key moments (breakthroughs, vulnerabilities, celebrations)
 */
export declare function indexKeyMoments(userId: string, moments: KeyMoment[], store: AnyVectorStore): Promise<number>;
/**
 * Index family members and people mentioned
 */
export declare function indexPeople(userId: string, userName: string | undefined, familyMembers: FamilyMember[], store: AnyVectorStore): Promise<number>;
/**
 * Index open threads (cross-session topics to resume)
 */
export declare function indexOpenThreads(userId: string, threads: UserProfile['openThreads'], store: AnyVectorStore): Promise<number>;
/**
 * Index pending follow-ups (commitments to user)
 */
export declare function indexFollowUps(userId: string, followUps: UserProfile['pendingFollowUps'], store: AnyVectorStore): Promise<number>;
/**
 * Index life events (weddings, babies, career changes, etc.)
 */
export declare function indexLifeEvents(userId: string, events: LifeEvent[], store: AnyVectorStore): Promise<number>;
/**
 * Index financial goals with notes
 */
export declare function indexGoals(userId: string, goals: FinancialGoal[], store: AnyVectorStore): Promise<number>;
/**
 * Index per-persona specific memories
 */
export declare function indexPersonaMemories(userId: string, personaMemories: UserProfile['personaMemories'], store: AnyVectorStore): Promise<number>;
/**
 * Index shared stories and content
 */
export declare function indexSharedContent(userId: string, sharedStories: UserProfile['sharedStories'], humanizingState: UserProfile['humanizingState'], store: AnyVectorStore): Promise<number>;
/**
 * Index user preferences and communication style
 */
export declare function indexPreferences(userId: string, profile: UserProfile, store: AnyVectorStore): Promise<number>;
/**
 * Index music and entertainment memories
 */
export declare function indexEntertainment(userId: string, musicMemory: UserProfile['musicMemory'], gameMemory: UserProfile['gameMemory'], store: AnyVectorStore): Promise<number>;
//# sourceMappingURL=profile-indexers.d.ts.map