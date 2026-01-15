/**
 * Cameo Opportunities Context Builder
 *
 * Suggests natural opportunities for Ferni to use the inviteCameo tool - having a
 * teammate pop in briefly with a quick insight before handing back to Ferni.
 *
 * This is useful when:
 * - The user is asking for guidance in a specialist area
 * - A quick perspective from a teammate would add value
 * - A full handoff isn't needed, but their voice would help
 *
 * IMPORTANT:
 * - This builder suggests the inviteCameo tool, not just verbal references
 * - The cameo tool handles voice switching and LLM instruction updates
 * - This is a hint, not a command - Ferni chooses whether to use it
 */

import { TEAM_MEMBERS, type TeamMemberId } from '../../../services/monetization/team-unlocks.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

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

  const name = getMemberDisplayName(candidate.memberId);

  // Always suggest the inviteCameo tool regardless of unlock status
  // (The tool handles the actual execution and voice switching)
  injections.push(
    createHintInjection(
      'cameo_opportunity',
      `[🎬 CAMEO OPPORTUNITY]
This touches ${candidate.reason} - ${name}'s specialty.

You can use the inviteCameo tool to have ${name} pop in with a quick insight:
- They'll briefly speak (1-2 sentences) then hand back to you
- Their voice will switch to ${name}'s voice, then back
- Perfect for adding their unique perspective without a full handoff

How to do it naturally:
1. Say something like "Let me have ${name} share something on this..."
2. Use the inviteCameo tool with personaId="${candidate.memberId}"
3. Include the context so they know what topic to address

Only use if it genuinely adds value - cameos are special moments.`,
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
