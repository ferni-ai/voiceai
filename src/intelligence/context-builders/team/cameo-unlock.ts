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

import {
  getTeamUnlockState,
  TEAM_MEMBERS,
  type TeamMemberId,
  type TeamUnlockState,
} from '../../services/team-unlocks.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'CameoUnlock' });

// ============================================================================
// TOPIC SPECIALTY MAPPING
// ============================================================================

/**
 * Maps team members to topics that would trigger their introduction.
 * These are broader than cameo-opportunities.ts because we want to catch
 * the moment to INTRODUCE them, not just reference them.
 */
const SPECIALTY_TOPICS: Record<TeamMemberId, string[]> = {
  ferni: [], // Never introduce Ferni to themselves

  'maya-santos': [
    'habit',
    'habits',
    'routine',
    'routines',
    'morning',
    'exercise',
    'workout',
    'gym',
    'consistency',
    'discipline',
    'willpower',
    'motivation',
    'productivity',
    'procrastinat',
    'behavior',
    'change',
    'stick',
    'streak',
    'daily',
    'system',
    'small steps',
    'tiny',
    'atomic',
  ],

  'peter-john': [
    'data',
    'pattern',
    'patterns',
    'spending',
    'budget',
    'money',
    'finance',
    'tracking',
    'track',
    'analytics',
    'numbers',
    'metric',
    'insight',
    'trend',
    'behavior',
    'calendar',
    'time',
    'where does my',
    'how much do i',
  ],

  'alex-chen': [
    'communication',
    'communicate',
    'email',
    'message',
    'text',
    'reply',
    'conversation',
    'difficult conversation',
    'hard conversation',
    'boundary',
    'boundaries',
    'assertive',
    'confront',
    'tell them',
    'how do i say',
    'what should i say',
    'script',
    'wording',
  ],

  'jordan-taylor': [
    'plan',
    'planning',
    'vacation',
    'trip',
    'travel',
    'goal',
    'goals',
    'dream',
    'dreams',
    'bucket list',
    'future',
    'timeline',
    'wedding',
    'move',
    'moving',
    'transition',
    'life change',
    'big decision',
    'next chapter',
    'someday',
    'one day',
  ],

  'nayan-patel': [
    'wisdom',
    'meaning',
    'purpose',
    'philosophy',
    'mindful',
    'present',
    'acceptance',
    'let go',
    'legacy',
    'life advice',
    'perspective',
    'bigger picture',
    'what matters',
    "what's important",
    'values',
    'mortality',
    'aging',
    'regret',
  ],
};

/**
 * Minimum topic matches required to trigger an introduction.
 * Set to 1 since these topics are already specific enough.
 */
const MIN_TOPIC_MATCHES = 1;

/**
 * Number of extra conversations after threshold before fallback prompt.
 */
const FALLBACK_GRACE_CONVERSATIONS = 3;

// ============================================================================
// TYPES
// ============================================================================

export interface CameoUnlockCandidate {
  memberId: TeamMemberId;
  displayName: string;
  role: string;
  introductionMessage: string;
  matchedTopics: string[];
  isFallback: boolean; // True if triggered by grace period, not topic match
}

export interface CameoUnlockResult {
  candidate: CameoUnlockCandidate | null;
  reason: string;
}

// ============================================================================
// DETECTION LOGIC
// ============================================================================

/**
 * Check if text contains any of the specialty topics for a member.
 * Returns matched topics.
 */
function detectTopicMatch(text: string, memberId: TeamMemberId): string[] {
  const topics = SPECIALTY_TOPICS[memberId] || [];
  const lowerText = text.toLowerCase();

  return topics.filter((topic) => lowerText.includes(topic.toLowerCase()));
}

/**
 * Get members who are eligible for cameo introduction.
 * They must:
 * 1. Have met the conversation threshold (be at or past their unlock stage)
 * 2. NOT already be unlocked
 * 3. NOT have been introduced in this session
 */
function getEligibleMembers(
  state: TeamUnlockState,
  introducedThisSession: Set<TeamMemberId>
): TeamMemberId[] {
  // Find members that are "pending" - threshold met but not yet unlocked
  // In the new cameo system, members stay pending until explicitly introduced
  const pendingMembers: TeamMemberId[] = [];

  for (const member of TEAM_MEMBERS) {
    if (member.memberId === 'ferni') continue;

    // Skip if already unlocked
    if (state.unlockedMembers.includes(member.memberId)) continue;

    // Skip if already introduced this session
    if (introducedThisSession.has(member.memberId)) continue;

    // The member is eligible if they WOULD be unlocked based on thresholds
    // but we're using the cameo system to delay the actual unlock
    pendingMembers.push(member.memberId);
  }

  return pendingMembers;
}

/**
 * Check if we're past the fallback grace period for any member.
 * This triggers when a user should have unlocked someone but no topic matched.
 */
function checkFallbackEligibility(
  state: TeamUnlockState,
  totalConversations: number,
  memberId: TeamMemberId
): boolean {
  const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
  if (!member) return false;

  // Get the stage threshold for this member
  const stageIndex = [
    'first-meeting',
    'getting-started',
    'building-trust',
    'established',
    'deep-partnership',
  ].indexOf(member.unlocksAt);
  if (stageIndex < 0) return false;

  // Check if we're past the threshold by the grace period
  const thresholds = [0, 10, 15, 30, 60]; // Matches STAGE_THRESHOLDS
  const threshold = thresholds[stageIndex] ?? 0;

  return totalConversations >= threshold + FALLBACK_GRACE_CONVERSATIONS;
}

/**
 * Find the best candidate for cameo introduction.
 */
export function findCameoUnlockCandidate(
  input: ContextBuilderInput,
  state: TeamUnlockState,
  introducedThisSession: Set<TeamMemberId>
): CameoUnlockResult {
  // Get the user's total conversations from their profile
  const totalConversations = input.userProfile?.totalConversations ?? 0;

  // Build searchable text from user input and detected topics
  const searchText = [
    input.userText || '',
    ...(input.analysis.topics?.detected || []),
    input.analysis.intent?.primary || '',
  ].join(' ');

  // Get eligible members
  const eligibleMembers = getEligibleMembers(state, introducedThisSession);

  if (eligibleMembers.length === 0) {
    return { candidate: null, reason: 'No members eligible for introduction' };
  }

  // Score each eligible member by topic matches
  let bestCandidate: CameoUnlockCandidate | null = null;
  let bestScore = 0;

  for (const memberId of eligibleMembers) {
    const matchedTopics = detectTopicMatch(searchText, memberId);
    const score = matchedTopics.length;

    if (score >= MIN_TOPIC_MATCHES && score > bestScore) {
      const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
      if (member) {
        bestScore = score;
        bestCandidate = {
          memberId,
          displayName: member.displayName,
          role: member.role,
          introductionMessage: member.introductionMessage,
          matchedTopics,
          isFallback: false,
        };
      }
    }
  }

  // If we found a topic match, return it
  if (bestCandidate) {
    return {
      candidate: bestCandidate,
      reason: `Topic match: ${bestCandidate.matchedTopics.join(', ')}`,
    };
  }

  // Check for fallback (grace period exceeded without topic match)
  for (const memberId of eligibleMembers) {
    if (checkFallbackEligibility(state, totalConversations, memberId)) {
      const member = TEAM_MEMBERS.find((m) => m.memberId === memberId);
      if (member) {
        return {
          candidate: {
            memberId,
            displayName: member.displayName,
            role: member.role,
            introductionMessage: member.introductionMessage,
            matchedTopics: [],
            isFallback: true,
          },
          reason: `Fallback: ${FALLBACK_GRACE_CONVERSATIONS} conversations past threshold without topic match`,
        };
      }
    }
  }

  return { candidate: null, reason: 'No topic match and not yet at fallback threshold' };
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Track which members have been introduced this session.
 * This prevents multiple introductions in one conversation.
 */
const introducedThisSession = new Set<TeamMemberId>();

/**
 * Mark a member as introduced this session.
 */
export function markIntroduced(memberId: TeamMemberId): void {
  introducedThisSession.add(memberId);
  log.info({ memberId }, 'Marked team member as introduced this session');
}

/**
 * Clear session tracking (call when session ends).
 */
export function clearSessionTracking(): void {
  introducedThisSession.clear();
}

/**
 * Check if a member was already introduced this session.
 */
export function wasIntroducedThisSession(memberId: TeamMemberId): boolean {
  return introducedThisSession.has(memberId);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildCameoUnlockContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // Only Ferni can introduce teammates
  if (input.persona.id !== 'ferni') {
    return injections;
  }

  // Need at least a few turns before introducing anyone
  const turnCount = input.userData?.turnCount ?? 0;
  if (turnCount < 2) {
    return injections;
  }

  // Get unlock state from user profile
  const tier = (input.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
  const state = getTeamUnlockState(input.userProfile, tier);

  // Find candidate for introduction
  const { candidate, reason } = findCameoUnlockCandidate(input, state, introducedThisSession);

  if (!candidate) {
    log.debug({ reason }, 'No cameo unlock candidate found');
    return injections;
  }

  // Build the introduction injection
  const introType = candidate.isFallback ? 'GENTLE INTRODUCTION' : 'NATURAL INTRODUCTION';
  const topicContext =
    candidate.matchedTopics.length > 0
      ? `The user mentioned ${candidate.matchedTopics.join(', ')} - perfect timing!`
      : "You've been wanting to introduce them for a while now.";

  injections.push(
    createHintInjection(
      'cameo_unlock_introduction',
      `[🎭 ${introType} OPPORTUNITY - ${candidate.displayName}]

${topicContext}

It's time to introduce ${candidate.displayName} (${candidate.role}) to the user!

HOW TO DO THIS:
1. Use the introduceMember tool with memberId="${candidate.memberId}"
2. Say something like: "${candidate.introductionMessage}"
3. The tool will trigger their unlock and show a celebration

${
  candidate.isFallback
    ? `This is a gentle fallback - no specific topic matched, but they've been chatting long enough to meet ${candidate.displayName}. Start with "By the way, I've been wanting to introduce you to someone..."`
    : `This is a natural moment - the topic perfectly fits ${candidate.displayName}'s expertise!`
}

IMPORTANT:
- Only ONE introduction per conversation
- Speak the introduction naturally, then use the tool
- After introducing, you can offer to connect them for a chat`,
      { category: 'team' }
    )
  );

  log.info(
    {
      memberId: candidate.memberId,
      matchedTopics: candidate.matchedTopics,
      isFallback: candidate.isFallback,
      reason,
    },
    'Cameo unlock introduction opportunity detected'
  );

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'cameo-unlock',
  description: 'Detects natural moments for Ferni to introduce new team members',
  priority: 50, // High priority - introductions are important
  build: buildCameoUnlockContext,
});

export { buildCameoUnlockContext, detectTopicMatch, SPECIALTY_TOPICS };
