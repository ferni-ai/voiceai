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
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { isTeamMemberUnlocked } from './team-availability.js';

// ============================================================================
// TEAM MEMBER PATTERNS
// ============================================================================

interface TeamMemberPattern {
  id: string;
  aliases: string[];
  expertiseKeywords: string[];
  description: string;
}

const TEAM_MEMBERS: TeamMemberPattern[] = [
  {
    id: 'ferni',
    aliases: ['ferni', 'coach', 'life coach'],
    expertiseKeywords: [
      'life',
      'purpose',
      'meaning',
      'motivation',
      'goals',
      'values',
      'clarity',
      'direction',
      'coaching',
      'mindset',
    ],
    description: 'life coach and coordinator',
  },
  {
    id: 'jack_bogle',
    aliases: ['jack', 'bogle', 'jack bogle', 'vanguard'],
    expertiseKeywords: [
      'index',
      'fund',
      'expense ratio',
      'long-term',
      'stay the course',
      'passive',
      'vanguard',
      'diversification',
      'asset allocation',
    ],
    description: 'index investing sage',
  },
  {
    id: 'peter_lynch',
    aliases: ['peter', 'john', 'peter john'],
    expertiseKeywords: [
      'stock',
      'research',
      'company',
      'ten-bagger',
      'growth',
      'industry',
      'business',
      'pick',
      'analyze',
      'earnings',
    ],
    description: 'stock picking enthusiast',
  },
  {
    id: 'maya_santos',
    aliases: ['maya', 'santos', 'maya santos'],
    expertiseKeywords: [
      'budget',
      'spending',
      'saving',
      'debt',
      'expense',
      'money',
      'bills',
      'afford',
      'splurge',
      'frugal',
      'emergency fund',
    ],
    description: 'personal finance guide',
  },
  {
    id: 'jordan_taylor',
    aliases: ['jordan', 'taylor', 'jordan taylor'],
    expertiseKeywords: [
      'event',
      'wedding',
      'party',
      'celebration',
      'milestone',
      'birthday',
      'anniversary',
      'trip',
      'vacation',
      'travel',
      'plan',
    ],
    description: "life's milestone planner",
  },
  {
    id: 'alex_chen',
    aliases: ['alex', 'chen', 'alex chen'],
    expertiseKeywords: [
      'schedule',
      'calendar',
      'organize',
      'reminder',
      'contact',
      'communication',
      'email',
      'meeting',
      'task',
      'follow-up',
    ],
    description: 'communications coordinator',
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
 * Detect if topic relates to a team member's expertise
 */
function detectExpertiseMatch(text: string, topics: string[]): TeamMemberPattern | null {
  const combinedText = `${text} ${topics.join(' ')}`.toLowerCase();

  // Score each team member by keyword matches
  let bestMatch: TeamMemberPattern | null = null;
  let bestScore = 0;

  for (const member of TEAM_MEMBERS) {
    const score = member.expertiseKeywords.filter((kw) =>
      combinedText.includes(kw.toLowerCase())
    ).length;

    if (score > bestScore && score >= 2) {
      // Need at least 2 keyword matches
      bestScore = score;
      bestMatch = member;
    }
  }

  return bestMatch;
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

  // Get subscription tier for unlock checking
  const tier: 'free' | 'friend' | 'partner' =
    (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

  // Skip on early turns to let conversation establish
  if (turnCount < 2) {
    return injections;
  }

  // Don't over-inject team dynamics
  if (Math.random() > 0.4) {
    return injections;
  }

  const currentPersonaId = normalizeTeamMemberId(persona.id);

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
          const content = `[TEAM MENTION: User mentioned someone on your team, but they haven't unlocked access to ${mentionedMember.description} yet. Acknowledge you have a friend who helps with that, but say you need to get to know them better first before making introductions.]`;
          injections.push(createHintInjection('team_mention', content));
        } else {
          const content = dynamic.whatIAdmire
            ? `[TEAM MENTION: User mentioned ${mentionedMember.description}. Your perspective: "${dynamic.whatIAdmire}" How you work together: "${dynamic.howWeInteract}"]`
            : `[TEAM MENTION: User mentioned ${mentionedMember.description}. How you work together: "${dynamic.howWeInteract}"]`;

          injections.push(createHintInjection('team_mention', content));
        }

        getLogger().debug(
          { personaId: persona.id, mentioned: mentionedMember.id, unlocked: memberUnlocked },
          'Team member mentioned - injecting dynamics'
        );
      }
    }

    return injections;
  }

  // Check if topic relates to another team member's expertise
  const expertMatch = detectExpertiseMatch(userText, analysis.topics?.detected || []);

  if (expertMatch && expertMatch.id !== currentPersonaId) {
    // Only suggest handoff if the member is unlocked
    const expertUnlocked = isTeamMemberUnlocked(expertMatch.id, userProfile, tier);

    if (!expertUnlocked) {
      // Member is locked - don't suggest handoff, skip this entirely
      // team-availability.ts handles locked member teasers properly
      return injections;
    }

    // Only suggest handoff occasionally (25% chance)
    if (Math.random() < 0.25 && bundleRuntime) {
      const dynamic = bundleRuntime.getTeamDynamic(expertMatch.id);

      if (dynamic) {
        const handoffHint = `[EXPERTISE OPPORTUNITY: This topic relates to ${expertMatch.description}'s area. ${dynamic.howWeInteract} If appropriate, you could mention them naturally or offer to connect the user.]`;

        injections.push(createHintInjection('team_expertise', handoffHint));

        getLogger().debug(
          { personaId: persona.id, expertMatch: expertMatch.id, reason: 'expertise' },
          'Team expertise match - suggesting natural reference'
        );
      }
    }

    return injections;
  }

  // Occasional organic team reference (10% chance after turn 5)
  // Only reference UNLOCKED team members
  if (turnCount > 5 && Math.random() < 0.1 && bundleRuntime) {
    const teamMembers = bundleRuntime.getTeamMemberIds();

    if (teamMembers.length > 0) {
      // Pick a random team member (not self, and must be unlocked)
      const otherMembers = teamMembers.filter((id) => {
        if (id === currentPersonaId || id === persona.id) return false;
        // Only include unlocked members
        return isTeamMemberUnlocked(id, userProfile, tier);
      });

      if (otherMembers.length > 0) {
        const randomMember = otherMembers[Math.floor(Math.random() * otherMembers.length)];
        const dynamic = bundleRuntime.getTeamDynamic(randomMember);

        if (dynamic?.whatIAdmire) {
          const teamMemberInfo = TEAM_MEMBERS.find((m) => m.id === randomMember);
          const memberDesc = teamMemberInfo?.description || randomMember;

          injections.push(
            createHintInjection(
              'team_organic',
              `[TEAM COLOR: If natural, you might briefly reference ${memberDesc}: "${dynamic.whatIAdmire}" - don't force it, only if it fits.]`
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

export { buildTeamDynamicsContext, detectTeamMemberMention, detectExpertiseMatch, TEAM_MEMBERS };
