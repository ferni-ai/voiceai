/**
 * Team Unlock Service - Frontend
 *
 * Manages team member unlock state based on relationship with Ferni.
 * Syncs with backend and provides UI state for locked/unlocked members.
 *
 * Philosophy: "Get to know Ferni first" - Team unlocks naturally as
 * your friendship deepens. Subscribers skip the wait, free users earn it.
 */

import { createLogger } from '../utils/logger.js';
import { relationshipStageService, type RelationshipStage } from './relationship-stage.service.js';

const log = createLogger('TeamUnlock');

// ============================================================================
// TYPES
// ============================================================================

export type TeamMemberId =
  | 'ferni'
  | 'maya-santos'
  | 'peter-john'
  | 'alex-chen'
  | 'jordan-taylor'
  | 'nayan-patel';

export interface TeamMemberConfig {
  id: TeamMemberId;
  displayName: string;
  role: string;
  description: string;
  unlocksAt: RelationshipStage;
  introductionMessage: string;
  teaserMessage: string;
  premium?: boolean;
}

export interface TeamUnlockState {
  /** Current relationship stage with Ferni */
  stage: RelationshipStage;
  /** Subscription tier */
  tier: 'free' | 'friend' | 'partner';
  /** Which members are unlocked */
  unlockedMembers: Set<TeamMemberId>;
  /** Member unlock statuses */
  memberStatuses: Map<TeamMemberId, MemberUnlockStatus>;
  /** Most recently unlocked (for celebration) */
  newlyUnlocked: TeamMemberId | null;
  /** Next member to unlock */
  nextUnlock: NextUnlockInfo | null;
}

export interface MemberUnlockStatus {
  unlocked: boolean;
  progress: number; // 0-1
  lockReason?: string;
  unlockHint?: string;
}

export interface NextUnlockInfo {
  member: TeamMemberConfig;
  conversationsNeeded: number;
  daysNeeded: number;
}

// ============================================================================
// TEAM MEMBER DEFINITIONS
// ============================================================================

/**
 * Team members and when they unlock.
 * Order = introduction order.
 */
export const TEAM_MEMBERS: TeamMemberConfig[] = [
  {
    id: 'ferni',
    displayName: 'Ferni',
    role: 'Your Life Coach',
    description: 'Your main point of contact. Asks the questions that unlock insight.',
    unlocksAt: 'first-meeting',
    introductionMessage: "Hey! I'm Ferni. I'm so glad you're here.",
    teaserMessage: '',
  },
  {
    id: 'maya-santos',
    displayName: 'Maya',
    role: 'Habits Coach',
    description: 'Helps you build habits that stick. Start embarrassingly small.',
    unlocksAt: 'getting-started',
    introductionMessage: "I want you to meet Maya. She's incredible at habits.",
    teaserMessage:
      "I have a friend who's amazing at habits... once we talk more, I'll introduce you.",
  },
  {
    id: 'peter-john',
    displayName: 'Peter',
    role: 'The Quant',
    description: 'Spots patterns nobody else sees. Turns data into insights.',
    unlocksAt: 'building-trust',
    introductionMessage: "You're ready for Peter. He sees patterns most people miss.",
    teaserMessage: 'Peter can show you incredible patterns, but I need to know you better first.',
  },
  {
    id: 'alex-chen',
    displayName: 'Alex',
    role: 'Chief of Staff',
    description: 'Communication coach. Helps you say what you mean.',
    unlocksAt: 'established',
    introductionMessage: 'Alex is going to change how you communicate.',
    teaserMessage: "There's someone who can transform your communication... keep talking to me.",
  },
  {
    id: 'jordan-taylor',
    displayName: 'Jordan',
    role: 'Lifetime Planner',
    description: 'Turns vague dreams into lived experiences.',
    unlocksAt: 'established',
    introductionMessage: 'Jordan helps people turn dreams into actual plans.',
    teaserMessage: 'I know someone who can help you plan your whole life... soon.',
  },
  {
    id: 'nayan-patel',
    displayName: 'Nayan',
    role: 'The Sage',
    description: 'Lifetime coach. Small, consistent actions create extraordinary results.',
    unlocksAt: 'deep-partnership',
    introductionMessage: "Nayan is the wisest person I know. You've earned this.",
    teaserMessage: "The sage only speaks to those who've proven their commitment.",
    premium: true,
  },
];

// ============================================================================
// STAGE THRESHOLDS (matches backend)
// ============================================================================

const STAGE_THRESHOLDS: Record<RelationshipStage, { minConversations: number; minDays: number }> = {
  'first-meeting': { minConversations: 0, minDays: 0 },
  'getting-started': { minConversations: 2, minDays: 0 },
  'building-trust': { minConversations: 7, minDays: 3 },
  established: { minConversations: 20, minDays: 14 },
  'deep-partnership': { minConversations: 50, minDays: 30 },
};

const STAGE_ORDER: RelationshipStage[] = [
  'first-meeting',
  'getting-started',
  'building-trust',
  'established',
  'deep-partnership',
];

// ============================================================================
// STATE
// ============================================================================

let currentState: TeamUnlockState | null = null;
let subscriptionTier: 'free' | 'friend' | 'partner' = 'free';
const unlockListeners: Set<(state: TeamUnlockState) => void> = new Set();
const memberUnlockListeners: Set<(member: TeamMemberConfig) => void> = new Set();

// ============================================================================
// CORE LOGIC
// ============================================================================

function stageAtOrBeyond(current: RelationshipStage, target: RelationshipStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);
}

function getMemberUnlockStatus(
  member: TeamMemberConfig,
  stage: RelationshipStage,
  tier: 'free' | 'friend' | 'partner',
  metrics: { totalConversations: number; daysSinceFirstMeeting: number }
): MemberUnlockStatus {
  // Ferni always unlocked
  if (member.id === 'ferni') {
    return { unlocked: true, progress: 1 };
  }

  // Subscribers get everyone except Nayan immediately
  // Nayan requires partner tier OR deep-partnership
  if (tier === 'friend' || tier === 'partner') {
    if (member.premium && tier !== 'partner' && !stageAtOrBeyond(stage, member.unlocksAt)) {
      const threshold = STAGE_THRESHOLDS[member.unlocksAt];
      return {
        unlocked: false,
        progress: calculateProgress(metrics, threshold),
        lockReason: "The sage speaks only to those who've proven their commitment.",
        unlockHint: 'Reach deep partnership or upgrade to Partner tier.',
      };
    }
    return { unlocked: true, progress: 1 };
  }

  // Free users unlock through relationship
  if (stageAtOrBeyond(stage, member.unlocksAt)) {
    return { unlocked: true, progress: 1 };
  }

  const threshold = STAGE_THRESHOLDS[member.unlocksAt];
  return {
    unlocked: false,
    progress: calculateProgress(metrics, threshold),
    lockReason: member.teaserMessage,
    unlockHint: getUnlockHint(member.unlocksAt, threshold),
  };
}

function calculateProgress(
  metrics: { totalConversations: number; daysSinceFirstMeeting: number },
  threshold: { minConversations: number; minDays: number }
): number {
  if (threshold.minConversations === 0) return 1;

  const convProgress = Math.min(1, metrics.totalConversations / threshold.minConversations);
  const daysProgress =
    threshold.minDays > 0 ? Math.min(1, metrics.daysSinceFirstMeeting / threshold.minDays) : 1;

  return (convProgress + daysProgress) / 2;
}

function getUnlockHint(
  _stage: RelationshipStage,
  threshold: { minConversations: number; minDays: number }
): string {
  if (threshold.minDays === 0) {
    return `${threshold.minConversations} conversations to unlock`;
  }
  return `${threshold.minConversations} conversations over ${threshold.minDays} days`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize team unlock service
 */
export function initTeamUnlockService(): void {
  // Subscribe to relationship stage changes
  relationshipStageService.onStageChange(() => {
    void updateUnlockState();
  });

  // Initial state
  void updateUnlockState();

  log.info('Team unlock service initialized');
}

/**
 * Set the user's subscription tier
 */
export function setSubscriptionTier(tier: 'free' | 'friend' | 'partner'): void {
  if (subscriptionTier !== tier) {
    subscriptionTier = tier;
    void updateUnlockState();
  }
}

/**
 * Update unlock state from current relationship and subscription
 */
export function updateUnlockState(): TeamUnlockState {
  const stage = relationshipStageService.getStage();
  const metrics = relationshipStageService.getMetrics();

  const previousUnlocked = currentState?.unlockedMembers ?? new Set<TeamMemberId>();

  const unlockedMembers = new Set<TeamMemberId>();
  const memberStatuses = new Map<TeamMemberId, MemberUnlockStatus>();
  let nextUnlock: NextUnlockInfo | null = null;
  let newlyUnlocked: TeamMemberId | null = null;

  const metricsData = {
    totalConversations: metrics.totalConversations,
    daysSinceFirstMeeting: metrics.daysSinceFirstMeeting,
  };

  for (const member of TEAM_MEMBERS) {
    const status = getMemberUnlockStatus(member, stage, subscriptionTier, metricsData);
    memberStatuses.set(member.id, status);

    if (status.unlocked) {
      unlockedMembers.add(member.id);

      // Check if newly unlocked
      if (!previousUnlocked.has(member.id) && member.id !== 'ferni') {
        newlyUnlocked = member.id;
      }
    } else if (!nextUnlock) {
      const threshold = STAGE_THRESHOLDS[member.unlocksAt];
      nextUnlock = {
        member,
        conversationsNeeded: Math.max(
          0,
          threshold.minConversations - metricsData.totalConversations
        ),
        daysNeeded: Math.max(0, threshold.minDays - metricsData.daysSinceFirstMeeting),
      };
    }
  }

  currentState = {
    stage,
    tier: subscriptionTier,
    unlockedMembers,
    memberStatuses,
    newlyUnlocked,
    nextUnlock,
  };

  // Notify listeners
  unlockListeners.forEach((listener) => listener(currentState!));

  // Notify member unlock listeners if someone new was unlocked
  if (newlyUnlocked) {
    const member = TEAM_MEMBERS.find((m) => m.id === newlyUnlocked);
    if (member) {
      log.info({ memberId: newlyUnlocked }, '🎉 Team member unlocked!');
      memberUnlockListeners.forEach((listener) => listener(member));
    }
  }

  return currentState;
}

/**
 * Get current unlock state
 */
export function getUnlockState(): TeamUnlockState | null {
  return currentState;
}

/**
 * Check if a specific team member is unlocked
 */
export function isTeamMemberUnlocked(memberId: TeamMemberId): boolean {
  if (!currentState) return memberId === 'ferni';
  return currentState.unlockedMembers.has(memberId);
}

/**
 * Get unlock status for a specific member
 */
export function getMemberStatus(memberId: TeamMemberId): MemberUnlockStatus {
  if (!currentState) {
    return { unlocked: memberId === 'ferni', progress: memberId === 'ferni' ? 1 : 0 };
  }
  return currentState.memberStatuses.get(memberId) ?? { unlocked: false, progress: 0 };
}

/**
 * Get team member config by ID
 */
export function getTeamMember(memberId: TeamMemberId): TeamMemberConfig | undefined {
  return TEAM_MEMBERS.find((m) => m.id === memberId);
}

/** Alias for getTeamMember */
export function getTeamMemberConfig(memberId: TeamMemberId): TeamMemberConfig | undefined {
  return getTeamMember(memberId);
}

/**
 * Get introduction message for a newly unlocked member
 */
export function getIntroductionMessage(memberId: TeamMemberId): string | null {
  const member = TEAM_MEMBERS.find((m) => m.id === memberId);
  return member?.introductionMessage ?? null;
}

/**
 * Subscribe to unlock state changes
 */
export function onUnlockStateChange(listener: (state: TeamUnlockState) => void): () => void {
  unlockListeners.add(listener);
  // Immediately call with current state
  if (currentState) {
    listener(currentState);
  }
  return () => unlockListeners.delete(listener);
}

/**
 * Subscribe to member unlock events (for celebrations)
 */
export function onMemberUnlocked(listener: (member: TeamMemberConfig) => void): () => void {
  memberUnlockListeners.add(listener);
  return () => memberUnlockListeners.delete(listener);
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Check if all core team members are unlocked.
 * Marketplace agents require the full team to be unlocked first.
 */
export function isFullTeamUnlocked(): boolean {
  if (!currentState) return false;

  // Check that all team members are unlocked
  for (const member of TEAM_MEMBERS) {
    if (!currentState.unlockedMembers.has(member.id)) {
      return false;
    }
  }
  return true;
}

/**
 * Get CSS classes for a team member based on unlock status
 */
export function getTeamMemberClasses(memberId: TeamMemberId): string[] {
  const classes: string[] = [];
  const status = getMemberStatus(memberId);

  if (status.unlocked) {
    classes.push('team-member--unlocked');
  } else {
    classes.push('team-member--locked');
    if (status.progress > 0.5) {
      classes.push('team-member--almost-unlocked');
    }
  }

  const member = getTeamMember(memberId);
  if (member?.premium) {
    classes.push('team-member--premium');
  }

  return classes;
}

/**
 * Get formatted progress text
 */
export function getProgressText(memberId: TeamMemberId): string {
  const status = getMemberStatus(memberId);

  if (status.unlocked) return 'Unlocked';

  const state = getUnlockState();
  if (!state?.nextUnlock || state.nextUnlock.member.id !== memberId) {
    return status.unlockHint ?? 'Keep talking to Ferni';
  }

  const { conversationsNeeded, daysNeeded } = state.nextUnlock;

  if (conversationsNeeded > 0 && daysNeeded > 0) {
    return `${conversationsNeeded} more conversation${conversationsNeeded === 1 ? '' : 's'}, ${daysNeeded} more day${daysNeeded === 1 ? '' : 's'}`;
  }
  if (conversationsNeeded > 0) {
    return `${conversationsNeeded} more conversation${conversationsNeeded === 1 ? '' : 's'}`;
  }
  if (daysNeeded > 0) {
    return `${daysNeeded} more day${daysNeeded === 1 ? '' : 's'}`;
  }

  return 'Almost there!';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const teamUnlockService = {
  init: initTeamUnlockService,
  setTier: setSubscriptionTier,
  update: updateUnlockState,
  getState: getUnlockState,
  isUnlocked: isTeamMemberUnlocked,
  isFullTeamUnlocked,
  getMemberStatus,
  getTeamMember,
  getIntroduction: getIntroductionMessage,
  onStateChange: onUnlockStateChange,
  onUnlock: onMemberUnlocked,
  getClasses: getTeamMemberClasses,
  getProgress: getProgressText,
  TEAM_MEMBERS,
};
