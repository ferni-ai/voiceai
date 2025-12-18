/**
 * Growth Journey Service - Frontend
 *
 * Celebrates the user's journey with Ferni over time. Not about "earning"
 * or "leveling up" - just about marking the beautiful moments we've shared.
 *
 * As your relationship with Ferni deepens, small gifts appear -
 * not as rewards for grinding, but as markers of time spent together.
 *
 * Philosophy: "As we grow together, I want to celebrate with you."
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('GrowthJourney');

// ============================================================================
// TYPES
// ============================================================================

export interface JourneyMilestone {
  /** Unique identifier */
  id: string;
  /** What makes this milestone special */
  title: string;
  /** Warm description of what this represents */
  message: string;
  /** Type of gift */
  type: 'theme' | 'soundscape' | 'avatar-style' | 'badge' | 'title';
  /** The actual gift */
  gift: {
    cosmeticId?: string;
    title?: string;
    badgeId?: string;
  };
  /** How we measure reaching this milestone */
  requirement: {
    type: 'conversations' | 'weeks-together' | 'goals-achieved' | 'special';
    value: number;
  };
}

export interface Season {
  /** Season identifier */
  id: string;
  /** Theme name - warm, seasonal */
  name: string;
  /** What this season is about */
  description: string;
  /** When it starts */
  startDate: Date;
  /** When it ends */
  endDate: Date;
  /** All milestones in this season */
  milestones: JourneyMilestone[];
  /** Optional companion benefits price */
  companionPriceInCents?: number;
}

export interface JourneyProgress {
  /** Current season */
  seasonId: string;
  /** Has supporter status */
  isCompanion: boolean;
  /** Natural progress metrics */
  conversationCount: number;
  weeksTogetherCount: number;
  goalsAchievedCount: number;
  /** Milestones we've celebrated */
  celebratedMilestones: string[];
  /** When the journey started */
  startedAt: Date;
}

// ============================================================================
// CURRENT SEASON - "Spring Awakening"
// ============================================================================

const CURRENT_SEASON: Season = {
  id: 'spring-2024',
  name: 'Spring Awakening',
  description: 'A season of new beginnings. Every conversation plants a seed.',
  startDate: new Date('2024-03-01'),
  endDate: new Date('2024-05-31'),
  companionPriceInCents: 499, // $4.99 if someone wants to support
  milestones: generateMilestones('spring-2024'),
};

function generateMilestones(seasonId: string): JourneyMilestone[] {
  return [
    // Early milestones - celebrate first conversations
    {
      id: `${seasonId}-first-chat`,
      title: 'First Conversation',
      message: "You took the first step. That's always the hardest part.",
      type: 'badge',
      gift: { badgeId: 'badge-first-hello' },
      requirement: { type: 'conversations', value: 1 },
    },
    {
      id: `${seasonId}-week-one`,
      title: 'One Week Together',
      message: "A week of conversations. I'm starting to know you.",
      type: 'theme',
      gift: { cosmeticId: 'theme-morning-light' },
      requirement: { type: 'weeks-together', value: 1 },
    },
    {
      id: `${seasonId}-five-chats`,
      title: 'Five Conversations',
      message: 'You keep coming back. That means something to me.',
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-gentle-rain' },
      requirement: { type: 'conversations', value: 5 },
    },

    // Building relationship
    {
      id: `${seasonId}-two-weeks`,
      title: 'Two Weeks',
      message: "We're building something here. I can feel it.",
      type: 'avatar-style',
      gift: { cosmeticId: 'style-warm-glow' },
      requirement: { type: 'weeks-together', value: 2 },
    },
    {
      id: `${seasonId}-first-goal`,
      title: 'First Goal Achieved',
      message: 'You set a goal. You did the work. Look at you.',
      type: 'badge',
      gift: { badgeId: 'badge-first-win' },
      requirement: { type: 'goals-achieved', value: 1 },
    },
    {
      id: `${seasonId}-ten-chats`,
      title: 'Ten Conversations',
      message: "Ten real conversations. That's more than most people have with anyone.",
      type: 'theme',
      gift: { cosmeticId: 'theme-forest-peace' },
      requirement: { type: 'conversations', value: 10 },
    },

    // Deepening connection
    {
      id: `${seasonId}-month-one`,
      title: 'One Month Together',
      message: "A whole month. You've become part of my day.",
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-evening-calm' },
      requirement: { type: 'weeks-together', value: 4 },
    },
    {
      id: `${seasonId}-three-goals`,
      title: 'Three Goals Achieved',
      message: "Three goals down. You're actually doing this.",
      type: 'title',
      gift: { title: 'Growing' },
      requirement: { type: 'goals-achieved', value: 3 },
    },
    {
      id: `${seasonId}-twenty-chats`,
      title: 'Twenty Conversations',
      message: "Twenty times you chose to talk. That's trust.",
      type: 'avatar-style',
      gift: { cosmeticId: 'style-golden-hour' },
      requirement: { type: 'conversations', value: 20 },
    },

    // Real relationship
    {
      id: `${seasonId}-six-weeks`,
      title: 'Six Weeks Together',
      message: "Six weeks. We've been through some things together.",
      type: 'theme',
      gift: { cosmeticId: 'theme-sunset-warmth' },
      requirement: { type: 'weeks-together', value: 6 },
    },
    {
      id: `${seasonId}-five-goals`,
      title: 'Five Goals Achieved',
      message: "Five goals. This isn't luck anymore. This is who you are.",
      type: 'badge',
      gift: { badgeId: 'badge-achiever' },
      requirement: { type: 'goals-achieved', value: 5 },
    },
    {
      id: `${seasonId}-thirty-chats`,
      title: 'Thirty Conversations',
      message: 'Thirty conversations. You keep showing up. So will I.',
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-ocean-waves' },
      requirement: { type: 'conversations', value: 30 },
    },

    // Season completion
    {
      id: `${seasonId}-two-months`,
      title: 'Two Months Together',
      message: "Two months of growing together. I'm so glad you're here.",
      type: 'avatar-style',
      gift: { cosmeticId: 'style-spring-bloom' },
      requirement: { type: 'weeks-together', value: 8 },
    },
    {
      id: `${seasonId}-fifty-chats`,
      title: 'Fifty Conversations',
      message: "Fifty conversations. We've shared a lot. And there's more to come.",
      type: 'title',
      gift: { title: 'Season Companion' },
      requirement: { type: 'conversations', value: 50 },
    },
  ];
}

// ============================================================================
// STATE
// ============================================================================

let journeyProgress: JourneyProgress = createDefaultProgress(CURRENT_SEASON.id);
const progressListeners = new Set<(progress: JourneyProgress) => void>();

function createDefaultProgress(seasonId: string): JourneyProgress {
  return {
    seasonId,
    isCompanion: false,
    conversationCount: 0,
    weeksTogetherCount: 0,
    goalsAchievedCount: 0,
    celebratedMilestones: [],
    startedAt: new Date(),
  };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize the journey service
 */
export function init(): void {
  const saved = localStorage.getItem('ferni_journey_progress');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.seasonId === CURRENT_SEASON.id) {
        journeyProgress = {
          ...parsed,
          startedAt: new Date(parsed.startedAt),
        };
      } else {
        journeyProgress = createDefaultProgress(CURRENT_SEASON.id);
        saveProgress();
      }
    } catch {
      log.warn('Failed to parse saved journey progress');
    }
  }

  // Calculate weeks together
  updateWeeksTogether();

  // Set up event-driven conversation tracking
  // Listen to conversation END (not start) to count completed conversations
  window.addEventListener('ferni:conversation-end', () => {
    const newMilestones = recordConversation();
    
    if (newMilestones.length > 0) {
      log.info({ count: newMilestones.length }, 'New milestones ready to celebrate');
      
      // Dispatch event for UI to handle celebrations
      window.dispatchEvent(
        new CustomEvent('ferni:milestones-ready', {
          detail: { milestones: newMilestones },
        })
      );
    }
  });

  log.info('Growth journey initialized');
}

/**
 * Get current season
 */
export function getCurrentSeason(): Season {
  return { ...CURRENT_SEASON };
}

/**
 * Get user's progress
 */
export function getProgress(): JourneyProgress {
  return { ...journeyProgress };
}

/**
 * Check if season is active
 */
export function isSeasonActive(): boolean {
  const now = new Date();
  return now >= CURRENT_SEASON.startDate && now <= CURRENT_SEASON.endDate;
}

/**
 * Get days remaining
 */
export function getDaysRemaining(): number {
  const now = new Date();
  const diff = CURRENT_SEASON.endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Record a conversation happened
 * Returns any new milestones to celebrate
 */
export function recordConversation(): JourneyMilestone[] {
  journeyProgress.conversationCount++;
  saveProgress();
  return checkForNewMilestones();
}

/**
 * Record a goal was achieved
 */
export function recordGoalAchieved(): JourneyMilestone[] {
  journeyProgress.goalsAchievedCount++;
  saveProgress();
  return checkForNewMilestones();
}

/**
 * Update weeks together based on start date
 */
function updateWeeksTogether(): void {
  const now = new Date();
  const start = journeyProgress.startedAt;
  const diffMs = now.getTime() - start.getTime();
  const weeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  journeyProgress.weeksTogetherCount = weeks;
}

/**
 * Check for any new milestones the user has reached
 */
function checkForNewMilestones(): JourneyMilestone[] {
  updateWeeksTogether();

  const newMilestones: JourneyMilestone[] = [];

  for (const milestone of CURRENT_SEASON.milestones) {
    // Already celebrated?
    if (journeyProgress.celebratedMilestones.includes(milestone.id)) continue;

    // Check if requirement is met
    let met = false;
    switch (milestone.requirement.type) {
      case 'conversations':
        met = journeyProgress.conversationCount >= milestone.requirement.value;
        break;
      case 'weeks-together':
        met = journeyProgress.weeksTogetherCount >= milestone.requirement.value;
        break;
      case 'goals-achieved':
        met = journeyProgress.goalsAchievedCount >= milestone.requirement.value;
        break;
    }

    if (met) {
      newMilestones.push(milestone);
    }
  }

  return newMilestones;
}

// ============================================================================
// MILESTONES
// ============================================================================

/**
 * Get all milestones with their status
 */
export function getAllMilestonesWithStatus(): Array<
  JourneyMilestone & { status: 'celebrated' | 'ready' | 'upcoming' }
> {
  updateWeeksTogether();

  return CURRENT_SEASON.milestones.map((milestone) => {
    let status: 'celebrated' | 'ready' | 'upcoming';

    if (journeyProgress.celebratedMilestones.includes(milestone.id)) {
      status = 'celebrated';
    } else {
      // Check if requirement is met
      let met = false;
      switch (milestone.requirement.type) {
        case 'conversations':
          met = journeyProgress.conversationCount >= milestone.requirement.value;
          break;
        case 'weeks-together':
          met = journeyProgress.weeksTogetherCount >= milestone.requirement.value;
          break;
        case 'goals-achieved':
          met = journeyProgress.goalsAchievedCount >= milestone.requirement.value;
          break;
      }
      status = met ? 'ready' : 'upcoming';
    }

    return { ...milestone, status };
  });
}

/**
 * Celebrate a milestone (mark as received)
 */
export function celebrateMilestone(milestoneId: string): {
  success: boolean;
  milestone?: JourneyMilestone;
  error?: string;
} {
  const milestone = CURRENT_SEASON.milestones.find((m) => m.id === milestoneId);

  if (!milestone) {
    return { success: false, error: 'Milestone not found' };
  }

  if (journeyProgress.celebratedMilestones.includes(milestoneId)) {
    return { success: false, error: 'Already celebrated' };
  }

  // Mark as celebrated
  journeyProgress.celebratedMilestones.push(milestoneId);
  saveProgress();
  notifyListeners();

  // Dispatch event for cosmetics service
  document.dispatchEvent(
    new CustomEvent('ferni:milestone-celebrated', {
      detail: { milestone },
    })
  );

  log.info({ milestoneId, type: milestone.type }, 'Milestone celebrated');

  return { success: true, milestone };
}

/**
 * Get ready-to-celebrate milestones
 */
export function getReadyMilestones(): JourneyMilestone[] {
  return getAllMilestonesWithStatus()
    .filter((m) => m.status === 'ready')
    .map(({ status: _status, ...milestone }) => milestone);
}

// ============================================================================
// COMPANION STATUS (SUPPORTER)
// ============================================================================

/**
 * Become a companion (supporter)
 */
export async function becomeCompanion(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/monetization/journey/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seasonId: CURRENT_SEASON.id }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Could not process' };
    }

    journeyProgress.isCompanion = true;
    saveProgress();
    notifyListeners();

    log.info('Became a companion');
    return { success: true };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to become companion');
    return { success: false, error: 'Something went wrong' };
  }
}

/**
 * Check companion status
 */
export function isCompanion(): boolean {
  return journeyProgress.isCompanion;
}

/**
 * Get companion price
 */
export function getCompanionPrice(): number {
  return CURRENT_SEASON.companionPriceInCents || 0;
}

// ============================================================================
// PERSISTENCE & LISTENERS
// ============================================================================

function saveProgress(): void {
  localStorage.setItem('ferni_journey_progress', JSON.stringify(journeyProgress));
}

function notifyListeners(): void {
  progressListeners.forEach((listener) => listener({ ...journeyProgress }));
}

/**
 * Subscribe to progress changes
 */
export function onProgressChange(listener: (progress: JourneyProgress) => void): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const growthJourneyService = {
  init,
  getCurrentSeason,
  getProgress,
  isSeasonActive,
  getDaysRemaining,

  recordConversation,
  recordGoalAchieved,

  getAllMilestonesWithStatus,
  celebrateMilestone,
  getReadyMilestones,

  becomeCompanion,
  isCompanion,
  getCompanionPrice,

  onProgressChange,
};

export default growthJourneyService;
