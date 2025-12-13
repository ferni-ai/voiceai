/**
 * Pure context-building helpers.
 *
 * These functions are deterministic and side-effect free.
 * They transform user profile and conversation state into context strings
 * for LLM prompt injection.
 *
 * @module context/context-builders
 */

import {
  formatForPrompt,
  injectSharedContent,
  type InjectedContent,
} from '../personas/shared/index.js';
import type { PersonaId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import type { ConversationState, EmotionResult, HandoffRecord, PhaseGuidance } from './types.js';

// ============================================================================
// RELATIONSHIP CONTEXT
// ============================================================================

export function buildRelationshipContext(userProfile?: UserProfile): string {
  if (!userProfile) {
    return 'New user - no prior history.';
  }

  const p = userProfile;
  const sections: string[] = [];

  if (p.name) {
    sections.push(`User: ${p.name}`);
  }

  if (p.totalConversations > 1) {
    sections.push(`Conversations: ${p.totalConversations}`);
    sections.push(`Relationship: ${p.relationshipStage.replace('_', ' ')}`);
  }

  if (p.lastConversationSummary) {
    sections.push(`Last time: ${p.lastConversationSummary}`);
  }

  if ((p.pendingFollowUps?.length ?? 0) > 0) {
    const followUp = p.pendingFollowUps[0];
    sections.push(`Follow-up needed: ${followUp.topic} (${followUp.reason})`);
  }

  if ((p.openQuestions?.length ?? 0) > 0) {
    sections.push(`Unanswered questions: ${p.openQuestions.slice(0, 2).join('; ')}`);
  }

  const recentMoments = (p.keyMoments ?? [])
    .filter((m) => m.followUpNeeded)
    .slice(0, 2)
    .map((m) => m.summary);
  if (recentMoments.length > 0) {
    sections.push(`Key moments: ${recentMoments.join('; ')}`);
  }

  if (p.communicationStyle !== 'mixed') {
    sections.push(`Prefers: ${p.communicationStyle} communication`);
  }

  return sections.join('\n');
}

// ============================================================================
// EMOTIONAL CONTEXT
// ============================================================================

export function buildEmotionalContext(
  userProfile: UserProfile | undefined,
  emotion?: EmotionResult,
  state?: ConversationState
): string {
  const sections: string[] = [];

  if (emotion) {
    sections.push(`Current mood: ${emotion.primary} (intensity: ${emotion.intensity.toFixed(1)})`);

    if (emotion.distressLevel > 0.5) {
      sections.push(
        `⚠️ DISTRESS DETECTED (${emotion.distressLevel.toFixed(2)}) - prioritize emotional support`
      );
    }
  }

  if (state?.emotionalTrend && state.emotionalTrend !== 'unknown') {
    sections.push(`Emotional trend: ${state.emotionalTrend}`);
  }

  const emotionalPatterns = userProfile?.emotionalPatterns ?? [];
  if (emotionalPatterns.length > 0) {
    const recent = emotionalPatterns.slice(-3);
    const emotions = recent.map((p) => p.emotion).join(' → ');
    if (emotions) {
      sections.push(`Recent pattern: ${emotions}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// TOPIC CONTEXT
// ============================================================================

export function buildTopicContext(
  userProfile: UserProfile | undefined,
  state?: ConversationState
): string {
  const parts = [
    maybeCurrentTopic(state),
    maybeTopicsCovered(state),
    maybeCircleBack(state),
    maybeUserInterests(userProfile),
    maybeAvoidTopics(userProfile),
  ].filter((p): p is string => Boolean(p));

  return parts.join('\n');
}

function maybeCurrentTopic(state?: ConversationState): string | undefined {
  return state?.currentTopic ? `Current topic: ${state.currentTopic}` : undefined;
}

function maybeTopicsCovered(state?: ConversationState): string | undefined {
  const topics = state?.topicsDiscussed ?? [];
  return topics.length > 0 ? `Topics covered: ${topics.join(', ')}` : undefined;
}

function maybeCircleBack(state?: ConversationState): string | undefined {
  const topics = state?.topicsToCircleBack ?? [];
  return topics.length > 0 ? `Circle back to: ${topics.join(', ')}` : undefined;
}

function maybeUserInterests(userProfile?: UserProfile): string | undefined {
  const preferredTopics = userProfile?.preferredTopics ?? [];
  return preferredTopics.length > 0
    ? `User interests: ${preferredTopics.slice(0, 5).join(', ')}`
    : undefined;
}

function maybeAvoidTopics(userProfile?: UserProfile): string | undefined {
  const avoidTopics = userProfile?.avoidTopics ?? [];
  return avoidTopics.length > 0 ? `Avoid: ${avoidTopics.join(', ')}` : undefined;
}

// ============================================================================
// PHASE GUIDANCE
// ============================================================================

export function buildPhaseGuidance(guidance: PhaseGuidance): string {
  return `\nPhase: ${guidance.phase}\nVoice: ${guidance.voiceMode}\nFocus: ${guidance.focus}\nAsk: ${guidance.shouldAsk.slice(0, 2).join(' | ')}\nAvoid: ${guidance.shouldAvoid.slice(0, 2).join(' | ')}\n`.trim();
}

// ============================================================================
// CONTINUITY CONTEXT
// ============================================================================

export function buildContinuityContext(userProfile?: UserProfile): string {
  if (!userProfile || userProfile.totalConversations <= 1) {
    return '';
  }

  const sections: string[] = [];
  const p = userProfile;

  const lastContact = new Date(p.lastContact);
  const daysSince = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince >= 1) {
    sections.push(`Last talked: ${daysSince} day${daysSince > 1 ? 's' : ''} ago`);
  }

  if (p.lastConversationSummary) {
    sections.push(`Last time: "${p.lastConversationSummary}"`);
  }

  if ((p.goals?.length ?? 0) > 0) {
    const activeGoals = p.goals.filter((g) => g.status === 'active' || g.status === 'on_track');
    if (activeGoals.length > 0) {
      sections.push(`Working on: ${activeGoals.map((g) => g.name).join(', ')}`);
    }
  }

  if ((p.sharedStories?.length ?? 0) > 0) {
    const themes = [...new Set(p.sharedStories.map((s) => s.theme))];
    sections.push(`Stories told: ${themes.slice(0, 3).join(', ')}`);
  }

  return sections.length > 0 ? `[CONTINUITY]\n${sections.join('\n')}` : '';
}

// ============================================================================
// HANDOFF CHAIN
// ============================================================================

/**
 * Build a description of the handoff chain for context.
 * Example: "Ferni → Peter (turn 5) → Maya (turn 12)"
 */
export function buildHandoffChainDescription(
  handoffHistory: HandoffRecord[],
  currentPersona?: PersonaId
): string {
  if (handoffHistory.length === 0) {
    return currentPersona || '';
  }

  const parts: string[] = [handoffHistory[0].fromPersona];

  for (const handoff of handoffHistory) {
    parts.push(`→ ${handoff.toPersona} (turn ${handoff.turnCount})`);
  }

  return parts.join(' ');
}

/**
 * Get persona names that have been involved in this conversation.
 */
export function getInvolvedPersonas(
  currentPersona: PersonaId,
  handoffHistory: HandoffRecord[]
): PersonaId[] {
  const personas = new Set<PersonaId>();
  personas.add(currentPersona);

  for (const handoff of handoffHistory) {
    personas.add(handoff.fromPersona);
    personas.add(handoff.toPersona);
  }

  return Array.from(personas);
}

// ============================================================================
// SHARED CONTENT OPTIONS
// ============================================================================

export interface SharedContentOptions {
  userProfile?: UserProfile;
  currentPersona: PersonaId;
  previousPersona?: PersonaId;
  /** Full handoff history for richer context */
  handoffHistory?: HandoffRecord[];
}

export interface InjectionOptions {
  isGreeting?: boolean;
  isClosing?: boolean;
  isHandoff?: boolean;
  mentionTeammate?: string;
  lastUserMessage?: string;
}

// ============================================================================
// SHARED CONTENT BUILDING
// ============================================================================

export function buildSharedContent(
  options: SharedContentOptions,
  injectionOptions?: InjectionOptions
): InjectedContent {
  const { userProfile, currentPersona, previousPersona, handoffHistory } = options;

  // Calculate derived values
  let daysSinceLastContact: number | undefined;
  if (userProfile?.lastContact) {
    const lastContact = new Date(userProfile.lastContact);
    daysSinceLastContact = Math.floor(
      (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Build active life events
  let activeLifeEvents:
    | Array<{
        type: string;
        title: string;
        status: string;
        date?: Date;
        emotionalSignificance: string;
      }>
    | undefined;
  let recentLifeMilestones: string[] | undefined;

  if (userProfile?.lifeEvents && userProfile.lifeEvents.length > 0) {
    const activeEvents = userProfile.lifeEvents.filter(
      (e) => e.status === 'planning' || e.status === 'upcoming' || e.status === 'in_progress'
    );

    if (activeEvents.length > 0) {
      activeLifeEvents = activeEvents.map((e) => ({
        type: e.type,
        title: e.title,
        status: e.status,
        date: e.date,
        emotionalSignificance: e.emotionalSignificance,
      }));
    }

    const recentCompletions = userProfile.lifeEvents.filter((e) => {
      if (e.status !== 'completed' || !e.completedAt) return false;
      const daysSinceCompletion = Math.floor(
        (Date.now() - new Date(e.completedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceCompletion <= 30;
    });

    if (recentCompletions.length > 0) {
      recentLifeMilestones = recentCompletions.map((e) => e.title);
    }
  }

  // Build the shared context object matching SharedContentContext interface
  const sharedContext = {
    currentPersona,
    userName: userProfile?.name,
    relationshipStage: userProfile?.relationshipStage,
    conversationCount: userProfile?.totalConversations,
    lastConversationSummary: userProfile?.lastConversationSummary,
    previousPersona,
    daysSinceLastContact,
    activeLifeEvents,
    recentLifeMilestones,
    // Add handoff chain metadata
    handoffChain:
      handoffHistory && handoffHistory.length > 0
        ? buildHandoffChainDescription(handoffHistory, currentPersona)
        : undefined,
    involvedPersonas:
      handoffHistory && handoffHistory.length > 0
        ? getInvolvedPersonas(currentPersona, handoffHistory)
        : undefined,
    handoffCount: handoffHistory?.length,
  };

  return injectSharedContent(sharedContext, injectionOptions);
}

export function getFormattedSharedContent(
  options: SharedContentOptions,
  injectionOptions?: InjectionOptions
): string {
  return formatForPrompt(buildSharedContent(options, injectionOptions));
}
