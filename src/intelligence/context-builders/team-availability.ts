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

import { createLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getTeamUnlockState,
  TEAM_MEMBERS,
  getContextualUnlockTeaser,
  type TeamMemberId,
  type TeamUnlockState,
} from '../../services/team-unlocks.js';

const log = createLogger({ module: 'TeamAvailability' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format team member name for display
 */
function formatMemberName(memberId: TeamMemberId): string {
  const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
  return member?.displayName || memberId;
}

/**
 * Get team member role description
 */
function getMemberRole(memberId: TeamMemberId): string {
  const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
  return member?.role || '';
}

/**
 * Build the available team section for the prompt
 */
function buildAvailableTeamSection(state: TeamUnlockState): string {
  const available = state.unlockedMembers
    .filter((id) => id !== 'ferni') // Don't list Ferni as available to Ferni
    .map((id) => `- ${formatMemberName(id)} (${getMemberRole(id)})`)
    .join('\n');

  if (!available) {
    return '[TEAM STATUS: You are the only team member this user has access to right now. They need to talk with you more to unlock teammates. When topics come up that a teammate could help with, mention you have friends who specialize in that, but you need to get to know them better first.]';
  }

  return `[AVAILABLE TEAM MEMBERS - You can hand off to these people:]
${available}

When the user needs help in one of their areas, feel free to offer to connect them.`;
}

/**
 * Build the locked team section (so Ferni can tease but not handoff)
 */
function buildLockedTeamSection(state: TeamUnlockState): string {
  const lockedMembers = TEAM_MEMBERS.filter(
    (m) => !state.unlockedMembers.includes(m.memberId) && m.memberId !== 'ferni'
  );

  if (lockedMembers.length === 0) {
    return ''; // All unlocked!
  }

  const locked = lockedMembers
    .map((m) => `- ${m.displayName}: ${m.teaserMessage || 'Not yet available'}`)
    .join('\n');

  return `[LOCKED TEAM MEMBERS - Do NOT offer to hand off to these people. You can mention them exist but say you need to get to know the user better first:]
${locked}

IMPORTANT: Do NOT use handoff tools for these people. The tools will fail if you try.`;
}

/**
 * Build next unlock teaser
 */
function buildNextUnlockHint(state: TeamUnlockState): string {
  if (!state.nextUnlock) return '';

  const { member, conversationsNeeded } = state.nextUnlock;

  if (conversationsNeeded <= 2) {
    return `[HINT: ${member.displayName} is almost unlocked! Just ${conversationsNeeded} more conversations. You can hint that someone special will be joining soon.]`;
  }

  return '';
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildTeamAvailabilityContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { persona, services, userProfile, analysis } = input;
  const injections: ContextInjection[] = [];

  // Only inject for Ferni (the coordinator)
  // Other personas should focus on their specialty and return to Ferni for handoffs
  if (persona.id !== 'ferni' && persona.id !== 'jack-b') {
    return injections;
  }

  // Determine user's subscription tier from profile
  const tier: 'free' | 'friend' | 'partner' =
    (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

  // Get team unlock state
  const state = getTeamUnlockState(userProfile, tier);

  log.debug(
    {
      userId: services.userId,
      stage: state.stage,
      tier: state.tier,
      unlocked: state.unlockedMembers,
    },
    'Building team availability context'
  );

  // Always inject available team section
  const availableSection = buildAvailableTeamSection(state);
  injections.push(
    createStandardInjection('team_availability', availableSection, {
      category: 'team',
    })
  );

  // Inject locked team section if there are locked members
  const lockedSection = buildLockedTeamSection(state);
  if (lockedSection) {
    injections.push(
      createStandardInjection('team_locked', lockedSection, {
        category: 'team',
      })
    );
  }

  // Maybe inject next unlock hint
  const nextUnlockHint = buildNextUnlockHint(state);
  if (nextUnlockHint) {
    injections.push(
      createHintInjection('team_next_unlock', nextUnlockHint, {
        category: 'team',
      })
    );
  }

  // Maybe inject contextual teaser based on topic
  const currentTopic = analysis.topics?.primary || analysis.topics?.detected?.[0];
  const teaser = getContextualUnlockTeaser(state, currentTopic || undefined);
  if (teaser) {
    injections.push(
      createHintInjection(
        'team_teaser',
        `[NATURAL MENTION: If it fits the conversation, you could say something like: "${teaser}"]`,
        { category: 'team' }
      )
    );
  }

  return injections;
}

// ============================================================================
// EXPORTS FOR HANDOFF SYSTEM
// ============================================================================

/**
 * Get list of unlocked team member IDs for a user.
 * Used by handoff tools to filter available targets.
 */
export function getUnlockedTeamMemberIds(
  userProfile: import('../../types/user-profile.js').UserProfile | null,
  tier: 'free' | 'friend' | 'partner' = 'free'
): TeamMemberId[] {
  const state = getTeamUnlockState(userProfile, tier);
  return state.unlockedMembers;
}

/**
 * Check if a specific team member is available for handoff.
 */
export function isTeamMemberUnlocked(
  memberId: string,
  userProfile: import('../../types/user-profile.js').UserProfile | null,
  tier: 'free' | 'friend' | 'partner' = 'free'
): boolean {
  const state = getTeamUnlockState(userProfile, tier);
  // Normalize the member ID (handle different formats)
  const normalizedId = memberId.toLowerCase().replace(/_/g, '-');
  return state.unlockedMembers.some((id) => {
    const normalizedUnlocked = id.toLowerCase().replace(/_/g, '-');
    return (
      normalizedUnlocked === normalizedId ||
      normalizedUnlocked.includes(normalizedId) ||
      normalizedId.includes(normalizedUnlocked)
    );
  });
}

/**
 * Get the teaser message for a locked team member.
 */
export function getLockedMemberTeaser(memberId: string): string | null {
  const member = TEAM_MEMBERS.find((m) => {
    const normalizedId = memberId.toLowerCase().replace(/_/g, '-');
    const normalizedMemberId = m.memberId.toLowerCase().replace(/_/g, '-');
    return (
      normalizedMemberId === normalizedId ||
      normalizedMemberId.includes(normalizedId) ||
      normalizedId.includes(normalizedMemberId)
    );
  });
  return member?.teaserMessage || null;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'team_availability',
  description: 'Injects which team members are available/locked for this user',
  priority: 80, // High priority - should run early so other builders can use this info
  build: buildTeamAvailabilityContext,
});

export { buildTeamAvailabilityContext };
