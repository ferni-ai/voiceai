/**
 * Cameo Opportunities Context Builder
 *
 * Creates natural opportunities for Ferni to briefly reference a teammate's perspective
 * without forcing a handoff. This is especially useful when:
 * - The user is asking for guidance in a specialist area
 * - A teammate is available (unlocked), but a full transfer may be unnecessary
 * - Ferni can "borrow a lens" to make the response feel richer and more human
 *
 * IMPORTANT:
 * - If a teammate is locked, do NOT name them.
 * - This builder should never hard-require a tool call. It is a hint, not a command.
 */

import { TEAM_MEMBERS, type TeamMemberId } from '../../services/team-unlocks.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { isTeamMemberUnlocked } from './team-availability.js';

const logger = createLogger({ module: 'CameoOpportunities' });

// ----------------------------------------------------------------------------
// Heuristics
// ----------------------------------------------------------------------------

interface CameoCandidate {
  memberId: TeamMemberId;
  reason: string;
}

function getCameoCandidate(input: ContextBuilderInput): CameoCandidate | null {
  const text =
    `${input.userText} ${(input.analysis.topics?.detected || []).join(' ')}`.toLowerCase();

  // This maps *topic/intent cues* to teammates. It is intentionally simple and cheap.
  // It should be deterministic and safe, not "smart".
  const cues: Array<{ memberId: TeamMemberId; keywords: string[]; reason: string }> = [
    {
      memberId: 'maya-santos',
      keywords: ['habit', 'routine', 'discipline', 'consistency', 'streak', 'system', 'behavior'],
      reason: 'habits and routines',
    },
    {
      memberId: 'alex-chen',
      keywords: [
        'email',
        'message',
        'text',
        'reply',
        'conversation',
        'communicat',
        'boundary',
        'script',
      ],
      reason: 'communication and wording',
    },
    {
      memberId: 'jordan-taylor',
      keywords: [
        'plan',
        'planning',
        'timeline',
        'trip',
        'vacation',
        'wedding',
        'move',
        'transition',
      ],
      reason: 'planning and life transitions',
    },
    {
      memberId: 'peter-john',
      keywords: ['pattern', 'data', 'trend', 'track', 'metrics', 'numbers', 'signal'],
      reason: 'patterns and tracking',
    },
    {
      memberId: 'nayan-patel',
      keywords: ['meaning', 'purpose', 'philosophy', 'mindful', 'accept', 'surrender', 'presence'],
      reason: 'wisdom and perspective',
    },
  ];

  // Score each teammate by keyword matches; require at least 2 hits to avoid noisy cameos.
  let best: CameoCandidate | null = null;
  let bestScore = 0;

  for (const cue of cues) {
    const score = cue.keywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
    if (score > bestScore && score >= 2) {
      bestScore = score;
      best = { memberId: cue.memberId, reason: cue.reason };
    }
  }

  return best;
}

function getMemberDisplayName(memberId: TeamMemberId): string {
  const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
  return member?.displayName || memberId;
}

// ----------------------------------------------------------------------------
// Builder
// ----------------------------------------------------------------------------

async function buildCameoOpportunitiesContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // Only Ferni should do "cameos" (others should stay in-role).
  if (input.persona.id !== 'ferni') {
    return injections;
  }

  // Let the relationship establish first.
  const turnCount = input.userData?.turnCount ?? 0;
  if (turnCount < 3) {
    return injections;
  }

  // Only do this when the user is seeking guidance or action.
  const intent = input.analysis.intent?.primary || '';
  const isAdviceMoment =
    intent === 'seeking_advice' ||
    intent === 'seeking_support' ||
    Boolean(input.analysis.intent?.requiresAction) ||
    Boolean(input.analysis.intent?.requiresEmpathy);
  if (!isAdviceMoment) {
    return injections;
  }

  const candidate = getCameoCandidate(input);
  if (!candidate) {
    return injections;
  }

  // Never cameo self.
  if (candidate.memberId === 'ferni') {
    return injections;
  }

  // Check subscription tier for unlock logic.
  const tier: 'free' | 'friend' | 'partner' =
    (input.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
  const unlocked = isTeamMemberUnlocked(candidate.memberId, input.userProfile, tier);

  if (!unlocked) {
    // Do NOT name locked teammates.
    injections.push(
      createHintInjection(
        'cameo_opportunity_locked',
        `[CAMEO OPPORTUNITY]
This topic touches ${candidate.reason}. You have a teammate who'd be perfect for this, but they aren't available yet.
If it fits, say something like: "I have a friend who's incredible at that — we'll meet them as we get to know each other better. For now, let's work through it together."`,
        { category: 'team' }
      )
    );
    return injections;
  }

  const name = getMemberDisplayName(candidate.memberId);
  injections.push(
    createHintInjection(
      'cameo_opportunity',
      `[CAMEO OPPORTUNITY]
This touches ${candidate.reason}. If it feels natural, you can briefly reference ${name}'s lens (without transferring):
- "One thing ${name} tends to look for here is…"
- "If ${name} were sitting with us, they'd probably ask…"
Keep it short. Don't force it. Only do this if it genuinely helps.`,
      { category: 'team' }
    )
  );

  logger.debug(
    { memberId: candidate.memberId, reason: candidate.reason, turnCount, intent },
    'Cameo opportunity identified'
  );

  return injections;
}

// ----------------------------------------------------------------------------
// Register
// ----------------------------------------------------------------------------

registerContextBuilder({
  name: 'cameo-opportunities',
  description: 'Suggests lightweight teammate "cameo" references without forcing a handoff',
  priority: 44, // Around team-dynamics/handoff level (mid priority)
  build: buildCameoOpportunitiesContext,
});

export { buildCameoOpportunitiesContext, getCameoCandidate };
