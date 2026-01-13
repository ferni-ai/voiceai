/**
 * Team Availability Context Builder
 *
 * Injects information about which team members are available (unlocked) for this user.
 * This prevents the AI from trying to hand off to personas that haven't been unlocked yet.
 *
 * Philosophy:
 * - Users unlock team members through relationship progression OR subscription
 * - Ferni should know who's available and who's not
 * - Ferni can tease locked members naturally but shouldn't offer direct handoffs
 *
 * @see src/services/team-unlocks.ts for unlock logic
 */
import { type TeamMemberId } from '../../../services/team-unlocks.js';
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Check if an agent ID is a core team member (not a marketplace agent).
 */
export declare function isCoreTeamMember(agentId: string): boolean;
declare function buildTeamAvailabilityContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Get list of unlocked team member IDs for a user.
 * Used by handoff tools to filter available targets.
 */
export declare function getUnlockedTeamMemberIds(userProfile: import('../../../types/user-profile.js').UserProfile | null, tier?: 'free' | 'friend' | 'partner'): TeamMemberId[];
/**
 * Check if a specific team member is available for handoff.
 *
 * Honors BYPASS_TEAM_UNLOCKS env var for testing/demo:
 * - "all" or "true"     → All members unlocked
 * - "1", "2", "3", etc. → First N members unlocked
 * - "maya,peter"        → Specific members unlocked
 */
export declare function isTeamMemberUnlocked(memberId: string, userProfile: import('../../../types/user-profile.js').UserProfile | null, tier?: 'free' | 'friend' | 'partner'): boolean;
/**
 * Get the teaser message for a locked team member.
 */
export declare function getLockedMemberTeaser(memberId: string): string | null;
export { buildTeamAvailabilityContext };
//# sourceMappingURL=team-availability.d.ts.map