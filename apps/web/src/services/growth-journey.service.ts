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

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { apiPost } from '../utils/api.js';
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
// SEASONAL THEMES
// ============================================================================

/**
 * Get the appropriate season based on current date.
 * Seasons rotate automatically - no manual updates needed!
 */
function determineCurrentSeason(): Season {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  // New Year (Dec 26 - Jan 31): Reflection and fresh starts
  if (month === 11 && now.getDate() >= 26) {
    return createNewYearSeason(year + 1);
  }
  if (month === 0) {
    return createNewYearSeason(year);
  }

  // Spring (Mar 1 - May 31): Growth and new beginnings
  if (month >= 2 && month <= 4) {
    return createSpringSeason(year);
  }

  // Summer (Jun 1 - Aug 31): Energy and exploration
  if (month >= 5 && month <= 7) {
    return createSummerSeason(year);
  }

  // Fall (Sep 1 - Nov 30): Harvest and gratitude
  if (month >= 8 && month <= 10) {
    return createFallSeason(year);
  }

  // Winter (Feb 1 - Feb 28): Cozy introspection
  return createWinterSeason(year);
}

function createNewYearSeason(year: number): Season {
  return {
    id: `new-year-${year}`,
    name: `Fresh Start ${year}`,
    description: `A new year, a new chapter. What will you create in ${year}?`,
    startDate: new Date(`${year - 1}-12-26`),
    endDate: new Date(`${year}-01-31`),
    companionPriceInCents: 499,
    milestones: generateNewYearMilestones(`new-year-${year}`),
  };
}

function createSpringSeason(year: number): Season {
  return {
    id: `spring-${year}`,
    name: t('growthJourney.seasons.spring.name'),
    description: t('growthJourney.seasons.spring.desc'),
    startDate: new Date(`${year}-03-01`),
    endDate: new Date(`${year}-05-31`),
    companionPriceInCents: 499,
    milestones: generateMilestones(`spring-${year}`),
  };
}

function createSummerSeason(year: number): Season {
  return {
    id: `summer-${year}`,
    name: t('growthJourney.seasons.summer.name'),
    description: t('growthJourney.seasons.summer.desc'),
    startDate: new Date(`${year}-06-01`),
    endDate: new Date(`${year}-08-31`),
    companionPriceInCents: 499,
    milestones: generateMilestones(`summer-${year}`),
  };
}

function createFallSeason(year: number): Season {
  return {
    id: `fall-${year}`,
    name: t('growthJourney.seasons.fall.name'),
    description: t('growthJourney.seasons.fall.desc'),
    startDate: new Date(`${year}-09-01`),
    endDate: new Date(`${year}-11-30`),
    companionPriceInCents: 499,
    milestones: generateMilestones(`fall-${year}`),
  };
}

function createWinterSeason(year: number): Season {
  return {
    id: `winter-${year}`,
    name: t('growthJourney.seasons.winter.name'),
    description: t('growthJourney.seasons.winter.desc'),
    startDate: new Date(`${year}-02-01`),
    endDate: new Date(`${year}-02-28`),
    companionPriceInCents: 499,
    milestones: generateMilestones(`winter-${year}`),
  };
}

/**
 * Generate New Year-specific milestones with fresh start themes
 */
function generateNewYearMilestones(seasonId: string): JourneyMilestone[] {
  return [
    // Fresh start milestones
    {
      id: `${seasonId}-first-chat`,
      title: t('growthJourney.milestones.newyear.firstchat'),
      message: t('growthJourney.milestones.newyear.firstchatmsg'),
      type: 'badge',
      gift: { badgeId: 'badge-new-year' },
      requirement: { type: 'conversations', value: 1 },
    },
    {
      id: `${seasonId}-week-one`,
      title: t('growthJourney.milestones.newyear.weekone'),
      message: t('growthJourney.milestones.newyear.weekonemsg'),
      type: 'theme',
      gift: { cosmeticId: 'theme-aurora' },
      requirement: { type: 'weeks-together', value: 1 },
    },
    {
      id: `${seasonId}-five-chats`,
      title: t('growthJourney.milestones.newyear.fivechats'),
      message: t('growthJourney.milestones.newyear.fivechatsmsg'),
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-morning-birds' },
      requirement: { type: 'conversations', value: 5 },
    },

    // Building momentum
    {
      id: `${seasonId}-two-weeks`,
      title: t('growthJourney.milestones.newyear.twoweeks'),
      message: t('growthJourney.milestones.newyear.twoweeksmsg'),
      type: 'avatar-style',
      gift: { cosmeticId: 'style-fresh-start' },
      requirement: { type: 'weeks-together', value: 2 },
    },
    {
      id: `${seasonId}-first-goal`,
      title: t('growthJourney.milestones.newyear.firstwin'),
      message: t('growthJourney.milestones.newyear.firstwinmsg'),
      type: 'badge',
      gift: { badgeId: 'badge-first-win-year' },
      requirement: { type: 'goals-achieved', value: 1 },
    },
    {
      id: `${seasonId}-ten-chats`,
      title: t('growthJourney.milestones.newyear.tenchats'),
      message: t('growthJourney.milestones.newyear.tenchatsmsg'),
      type: 'theme',
      gift: { cosmeticId: 'theme-sunrise' },
      requirement: { type: 'conversations', value: 10 },
    },

    // Deep commitment
    {
      id: `${seasonId}-three-weeks`,
      title: t('growthJourney.milestones.newyear.threeweeks'),
      message: t('growthJourney.milestones.newyear.threeweeksmsg'),
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-celebration' },
      requirement: { type: 'weeks-together', value: 3 },
    },
    {
      id: `${seasonId}-three-goals`,
      title: t('growthJourney.milestones.newyear.threegoals'),
      message: t('growthJourney.milestones.newyear.threegoalsmsg'),
      type: 'title',
      gift: { title: t('growthJourney.milestones.newyear.yearofgrowth') },
      requirement: { type: 'goals-achieved', value: 3 },
    },
    {
      id: `${seasonId}-twenty-chats`,
      title: t('growthJourney.milestones.newyear.twentychats'),
      message: t('growthJourney.milestones.newyear.twentychatsmsg'),
      type: 'avatar-style',
      gift: { cosmeticId: 'style-golden-dawn' },
      requirement: { type: 'conversations', value: 20 },
    },

    // Season completion
    {
      id: `${seasonId}-month-one`,
      title: t('growthJourney.milestones.newyear.januarycomplete'),
      message: t('growthJourney.milestones.newyear.januarycompletemsg'),
      type: 'badge',
      gift: { badgeId: 'badge-january-champion' },
      requirement: { type: 'weeks-together', value: 4 },
    },
    {
      id: `${seasonId}-thirty-chats`,
      title: t('growthJourney.milestones.newyear.thirtychats'),
      message: t('growthJourney.milestones.newyear.thirtychatsmsg'),
      type: 'title',
      gift: { title: t('growthJourney.milestones.newyear.freshstarter') },
      requirement: { type: 'conversations', value: 30 },
    },
  ];
}

// Current season is determined dynamically
const CURRENT_SEASON: Season = determineCurrentSeason();

function generateMilestones(seasonId: string): JourneyMilestone[] {
  return [
    // Early milestones - celebrate first conversations
    {
      id: `${seasonId}-first-chat`,
      title: t('growthJourney.milestones.reg.firstconvo'),
      message: t('growthJourney.milestones.reg.firstconvomsg'),
      type: 'badge',
      gift: { badgeId: 'badge-first-hello' },
      requirement: { type: 'conversations', value: 1 },
    },
    {
      id: `${seasonId}-week-one`,
      title: t('growthJourney.milestones.reg.oneweek'),
      message: t('growthJourney.milestones.reg.oneweekmsg'),
      type: 'theme',
      gift: { cosmeticId: 'theme-morning-light' },
      requirement: { type: 'weeks-together', value: 1 },
    },
    {
      id: `${seasonId}-five-chats`,
      title: t('growthJourney.milestones.reg.fiveconvo'),
      message: t('growthJourney.milestones.reg.fiveconvomsg'),
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-gentle-rain' },
      requirement: { type: 'conversations', value: 5 },
    },

    // Building relationship
    {
      id: `${seasonId}-two-weeks`,
      title: t('growthJourney.milestones.reg.twoweeks'),
      message: t('growthJourney.milestones.reg.twoweeksmsg'),
      type: 'avatar-style',
      gift: { cosmeticId: 'style-warm-glow' },
      requirement: { type: 'weeks-together', value: 2 },
    },
    {
      id: `${seasonId}-first-goal`,
      title: t('growthJourney.milestones.reg.firstgoal'),
      message: t('growthJourney.milestones.reg.firstgoalmsg'),
      type: 'badge',
      gift: { badgeId: 'badge-first-win' },
      requirement: { type: 'goals-achieved', value: 1 },
    },
    {
      id: `${seasonId}-ten-chats`,
      title: t('growthJourney.milestones.reg.tenchats'),
      message: t('growthJourney.milestones.reg.tenchatsmsg'),
      type: 'theme',
      gift: { cosmeticId: 'theme-forest-peace' },
      requirement: { type: 'conversations', value: 10 },
    },

    // Deepening connection
    {
      id: `${seasonId}-month-one`,
      title: t('growthJourney.milestones.reg.onemonth'),
      message: t('growthJourney.milestones.reg.onemonthmsg'),
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-evening-calm' },
      requirement: { type: 'weeks-together', value: 4 },
    },
    {
      id: `${seasonId}-three-goals`,
      title: t('growthJourney.milestones.reg.threegoals'),
      message: t('growthJourney.milestones.reg.threegoalsmsg'),
      type: 'title',
      gift: { title: t('growthJourney.milestones.reg.growing') },
      requirement: { type: 'goals-achieved', value: 3 },
    },
    {
      id: `${seasonId}-twenty-chats`,
      title: t('growthJourney.milestones.reg.twentychats'),
      message: t('growthJourney.milestones.reg.twentychatsmsg'),
      type: 'avatar-style',
      gift: { cosmeticId: 'style-golden-hour' },
      requirement: { type: 'conversations', value: 20 },
    },

    // Real relationship
    {
      id: `${seasonId}-six-weeks`,
      title: t('growthJourney.milestones.reg.sixweeks'),
      message: t('growthJourney.milestones.reg.sixweeksmsg'),
      type: 'theme',
      gift: { cosmeticId: 'theme-sunset-warmth' },
      requirement: { type: 'weeks-together', value: 6 },
    },
    {
      id: `${seasonId}-five-goals`,
      title: t('growthJourney.milestones.reg.fivegoals'),
      message: t('growthJourney.milestones.reg.fivegoalsmsg'),
      type: 'badge',
      gift: { badgeId: 'badge-achiever' },
      requirement: { type: 'goals-achieved', value: 5 },
    },
    {
      id: `${seasonId}-thirty-chats`,
      title: t('growthJourney.milestones.reg.thirtychats'),
      message: t('growthJourney.milestones.reg.thirtychatsmsg'),
      type: 'soundscape',
      gift: { cosmeticId: 'sounds-ocean-waves' },
      requirement: { type: 'conversations', value: 30 },
    },

    // Season completion
    {
      id: `${seasonId}-two-months`,
      title: t('growthJourney.milestones.reg.twomonths'),
      message: t('growthJourney.milestones.reg.twomonthmsg'),
      type: 'avatar-style',
      gift: { cosmeticId: 'style-spring-bloom' },
      requirement: { type: 'weeks-together', value: 8 },
    },
    {
      id: `${seasonId}-fifty-chats`,
      title: t('growthJourney.milestones.reg.fiftychats'),
      message: t('growthJourney.milestones.reg.fiftychatsmsg'),
      type: 'title',
      gift: { title: t('growthJourney.milestones.reg.seasoncompanion') },
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
  
  // 🤲 Sidekick: Dispatch progress tracked event for avatar sidekick
  document.dispatchEvent(new CustomEvent('ferni:progress-tracked', {
    detail: { 
      conversationCount: journeyProgress.conversationCount,
      weeksTogetherCount: journeyProgress.weeksTogetherCount
    }
  }));
  
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
    const response = await apiPost<{ message?: string }>(
      '/api/monetization/journey/companion',
      { seasonId: CURRENT_SEASON.id }
    );

    if (!response.ok) {
      return { success: false, error: response.error || 'Could not process' };
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
