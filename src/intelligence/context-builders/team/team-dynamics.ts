/**
 * Team Dynamics Context Builder
 *
 * Injects awareness of how the current persona relates to other team members.
 * This creates natural, organic references to teammates in conversations.
 *
 * When to inject:
 * - User mentions another team member by name
 * - Conversation topic is relevant to another team member's expertise
 * - Natural opportunity to suggest a handoff
 * - Celebrating what the team brings together
 *
 * WIRED (Jan 2026): Now uses personas/shared/team-chemistry.ts for rich content
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { createBuilderRng } from '../core/rng-utils.js';
import { isTeamMemberUnlocked } from './team-availability.js';

// WIRED: Import team chemistry content from personas/shared
import {
  getTeamChemistryConfig,
  getContextualTeamReference,
  getMostRelevantTeamMember,
  isTeamReferenceRelevant,
  type TeamReferenceContext,
} from '../../../personas/shared/team-chemistry.js';

const log = createLogger({ module: 'TeamDynamics' });

// ============================================================================
// TEAM MEMBER PATTERNS (Used for mention detection & basic descriptions)
// Rich content comes from team-chemistry.ts via bundle loading
// ============================================================================

interface TeamMemberPattern {
  id: string;
  aliases: string[];
  description: string;
}

const TEAM_MEMBERS: TeamMemberPattern[] = [
  {
    id: 'ferni',
    aliases: ['ferni', 'coach', 'life coach'],
    description: 'life coach and coordinator',
  },
  {
    id: 'peter-john',
    aliases: ['peter', 'john', 'peter john', 'the quant'],
    description: 'research analyst',
  },
  {
    id: 'maya-santos',
    aliases: ['maya', 'santos', 'maya santos'],
    description: 'habits and routines coach',
  },
  {
    id: 'jordan-taylor',
    aliases: ['jordan', 'taylor', 'jordan taylor'],
    description: "life's milestone planner",
  },
  {
    id: 'alex-chen',
    aliases: ['alex', 'chen', 'alex chen'],
    description: 'communications coordinator',
  },
  {
    id: 'nayan-patel',
    aliases: ['nayan', 'patel', 'nayan patel'],
    description: 'wisdom and philosophy guide',
  },
];

// ============================================================================
// DETECTION HELPERS
// ============================================================================

/**
 * Detect if user mentions a team member
 */
function detectTeamMemberMention(text: string): TeamMemberPattern | null {
  const lowerText = text.toLowerCase();

  for (const member of TEAM_MEMBERS) {
    for (const alias of member.aliases) {
      if (lowerText.includes(alias.toLowerCase())) {
        return member;
      }
    }
  }

  return null;
}

/**
 * Get the ID format used in sensory-world.json (snake_case)
 */
function normalizeTeamMemberId(id: string): string {
  return id.replace(/-/g, '_');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildTeamDynamicsContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, bundleRuntime, persona, userData, analysis, userProfile } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Create deterministic RNG for this builder
  const rng = createBuilderRng(input, 'team-dynamics');

  // Get subscription tier for unlock checking
  const tier: 'free' | 'friend' | 'partner' =
    (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

  // Get team chemistry config for minimum session requirements
  const chemistryConfig = getTeamChemistryConfig();

  // Skip on early turns to let conversation establish
  if (turnCount < chemistryConfig.teamReferenceMinSessions) {
    return injections;
  }

  // Don't over-inject team dynamics (40% chance to proceed)
  if (!rng.chance(0.4)) {
    return injections;
  }

  const currentPersonaId = persona.id;

  // Check if user mentioned a team member
  const mentionedMember = detectTeamMemberMention(userText);

  if (mentionedMember && mentionedMember.id !== currentPersonaId) {
    // Check if the mentioned member is unlocked
    const memberUnlocked = isTeamMemberUnlocked(mentionedMember.id, userProfile, tier);

    // User mentioned a different team member - inject how we feel about them
    if (bundleRuntime) {
      const dynamic = bundleRuntime.getTeamDynamic(mentionedMember.id);

      if (dynamic) {
        // If member is locked, don't give details - just acknowledge vaguely
        if (!memberUnlocked) {
          const content = `[TEAM MENTION: User mentioned someone on your team, but they haven't unlocked access yet. Acknowledge you have a colleague who helps with that topic, but you need to get to know them better first.]`;
          injections.push(createHintInjection('team_mention', content));
        } else {
          const content = `[TEAM MENTION: User mentioned ${mentionedMember.description}. You have a warm working relationship with them - speak naturally about your colleague as you would about a trusted friend.]`;
          injections.push(createHintInjection('team_mention', content));
        }

        log.debug(
          { personaId: persona.id, mentioned: mentionedMember.id, unlocked: memberUnlocked },
          'Team member mentioned - injecting dynamics'
        );
      }
    }

    return injections;
  }

  // WIRED: Use team-chemistry's context-aware relevance check
  // Note: TeamReferenceContext requires sessionNumber and lastTeamReferenceSession
  const referenceContext: TeamReferenceContext = {
    currentTopic: analysis.topics?.detected?.[0],
    currentMessage: userText,
    mentionedTeammate: mentionedMember?.id,
    hasEmotionalMoment: (analysis.state?.distressLevel ?? 0) > 0.5,
    isHandoffCandidate: false, // Will be set by getMostRelevantTeamMember
    sessionNumber: userProfile?.totalConversations || 1,
    lastTeamReferenceSession: 0, // Track this in user profile eventually
  };

  // Find contextually relevant team member using team-chemistry intelligence
  const relevantMember = getMostRelevantTeamMember(currentPersonaId, referenceContext);

  if (relevantMember && relevantMember.persona !== currentPersonaId) {
    // Only suggest handoff if the member is unlocked
    const expertUnlocked = isTeamMemberUnlocked(relevantMember.persona, userProfile, tier);

    if (!expertUnlocked) {
      // Member is locked - team-availability.ts handles locked member teasers properly
      return injections;
    }

    // Get contextual team reference with rich content from team-chemistry
    const contextualRef = getContextualTeamReference(currentPersonaId, referenceContext);

    if (contextualRef && rng.fork('handoff').chance(0.25)) {
      const teamMemberInfo = TEAM_MEMBERS.find((m) => m.id === relevantMember.persona);
      const memberDesc = teamMemberInfo?.description || relevantMember.persona;

      // Inject expertise opportunity with context from team-chemistry
      const handoffHint = `[EXPERTISE OPPORTUNITY: This topic relates to ${memberDesc}'s specialty (${relevantMember.reason}). If appropriate, you could mention your colleague naturally or offer to connect the user.]`;

      injections.push(createHintInjection('team_expertise', handoffHint));

      log.debug(
        { personaId: persona.id, expertMatch: relevantMember.persona, reason: relevantMember.reason },
        'Team expertise match via team-chemistry - suggesting natural reference'
      );
    }

    return injections;
  }

  // Occasional organic team reference (10% chance after turn 5)
  // Only reference UNLOCKED team members
  const organicRng = rng.fork('organic');
  if (turnCount > 5 && organicRng.chance(0.1) && bundleRuntime) {
    const teamMembers = bundleRuntime.getTeamMemberIds();

    if (teamMembers.length > 0) {
      // Pick a random team member (not self, and must be unlocked)
      const otherMembers = teamMembers.filter((id) => {
        if (id === currentPersonaId || id === persona.id) return false;
        return isTeamMemberUnlocked(id, userProfile, tier);
      });

      if (otherMembers.length > 0) {
        const randomMember = organicRng.pick(otherMembers);
        if (!randomMember) return injections;
        const dynamic = bundleRuntime.getTeamDynamic(randomMember);

        if (dynamic?.whatIAdmire) {
          const teamMemberInfo = TEAM_MEMBERS.find((m) => m.id === randomMember);
          const memberDesc = teamMemberInfo?.description || randomMember;

          injections.push(
            createHintInjection(
              'team_organic',
              `[TEAM COLOR: If natural, you might briefly reference your colleague ${memberDesc} - speak about them warmly as a friend, only if it fits.]`
            )
          );
        }
      }
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'team_dynamics',
  description: 'Injects team member awareness and relationship context',
  priority: 45, // Medium-low priority - should run after core builders
  build: buildTeamDynamicsContext,
});

export { buildTeamDynamicsContext, detectTeamMemberMention, TEAM_MEMBERS };
