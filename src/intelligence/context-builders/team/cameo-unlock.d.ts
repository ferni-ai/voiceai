/**
 * Cameo Unlock Context Builder
 *
 * Detects when Ferni should naturally introduce a new team member based on:
 * 1. User has reached the conversation threshold for that member
 * 2. A relevant topic has come up in conversation
 * 3. The member hasn't been introduced yet
 *
 * This creates a "cameo introduction" where Ferni speaks the intro aloud,
 * followed by a visual modal on the frontend.
 *
 * Philosophy:
 * - Team unlocks should feel natural, not transactional
 * - Ferni introduces teammates like a friend introducing their friends
 * - The topic should genuinely call for that teammate's expertise
 * - One introduction per conversation max
 *
 * @see src/services/team-unlocks.ts for threshold definitions
 */
import { type TeamMemberId, type TeamUnlockState } from '../../../services/team-unlocks.js';
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Maps team members to topics that would trigger their introduction.
 * These are broader than cameo-opportunities.ts because we want to catch
 * the moment to INTRODUCE them, not just reference them.
 */
declare const SPECIALTY_TOPICS: Record<TeamMemberId, string[]>;
export interface CameoUnlockCandidate {
    memberId: TeamMemberId;
    displayName: string;
    role: string;
    introductionMessage: string;
    matchedTopics: string[];
    isFallback: boolean;
}
export interface CameoUnlockResult {
    candidate: CameoUnlockCandidate | null;
    reason: string;
}
/**
 * Check if text contains any of the specialty topics for a member.
 * Returns matched topics.
 */
declare function detectTopicMatch(text: string, memberId: TeamMemberId): string[];
/**
 * Find the best candidate for cameo introduction.
 */
export declare function findCameoUnlockCandidate(input: ContextBuilderInput, state: TeamUnlockState, introducedThisSession: Set<TeamMemberId>): CameoUnlockResult;
/**
 * Mark a member as introduced this session.
 */
export declare function markIntroduced(memberId: TeamMemberId): void;
/**
 * Clear session tracking (call when session ends).
 */
export declare function clearSessionTracking(): void;
/**
 * Check if a member was already introduced this session.
 */
export declare function wasIntroducedThisSession(memberId: TeamMemberId): boolean;
declare function buildCameoUnlockContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildCameoUnlockContext, detectTopicMatch, SPECIALTY_TOPICS };
//# sourceMappingURL=cameo-unlock.d.ts.map