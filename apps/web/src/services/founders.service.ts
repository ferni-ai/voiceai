/**
 * Founders Service
 *
 * Manages founder data, personal impact tracking, milestone celebrations,
 * and the Founders Wall gallery.
 *
 * PHILOSOPHY:
 * - Every founder is a co-creator, not a customer
 * - Celebrate milestones together as a community
 * - Show the real impact of collective support
 */

import { apiFetch } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';
import { toast } from '../ui/whisper.ui.js';
import { formatNumber, t } from '../i18n/index.js';

const log = createLogger('FoundersService');

// ============================================================================
// TYPES
// ============================================================================

export interface Founder {
  id: string;
  displayName: string | null; // null = anonymous
  initials: string;
  avatar?: string; // Optional custom avatar
  joinedAt: string;
  tier: 'seed' | 'sprout' | 'tree' | 'forest';
  isEarlyBird: boolean;
  badge?: 'og' | 'champion' | 'believer';
}

export interface FounderStats {
  totalFounders: number;
  thisMonthFounders: number;
  conversationsSupported: number;
  conversationsThisMonth: number;
  featuresUnlocked: string[];
  monthlyRecurring: number; // Total MRR (anonymized)
}

export interface PersonalImpact {
  userId: string;
  memberSince: string;
  totalContributed: number;
  conversationsEnabled: number;
  percentileRank: number; // Top X% of supporters
  streak: number; // Consecutive months
  badges: FounderBadge[];
  impact: {
    conversationsThisMonth: number;
    familiesHelped: number; // Estimated families you've helped
    featuresYouUnlocked: string[];
  };
}

export interface FounderBadge {
  id: string;
  name: string;
  description: string;
  earnedAt: string;
  icon: string;
}

export interface FounderStory {
  id: string;
  quote: string;
  attribution: string; // "A founding member" or first name only
  memberSince: string;
  theme: 'gratitude' | 'impact' | 'journey' | 'community';
}

export interface CommunityMilestone {
  id: string;
  target: number;
  current: number;
  type: 'founders' | 'conversations' | 'features' | 'streak';
  title: string;
  celebration: string;
  reached: boolean;
  reachedAt?: string;
}

// ============================================================================
// SEASONAL THEMES
// ============================================================================

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface SeasonalTheme {
  season: Season;
  name: string;
  icon: string;
  primaryColor: string;
  accentColor: string;
  metaphor: string;
  description: string;
}

// Seasonal themes use CSS variable references for design system compliance.
// Built on demand so the display text follows the active locale.
export const getSeasonalThemes = (): Record<Season, SeasonalTheme> => ({
  spring: {
    season: 'spring',
    name: t('founders.seasons.springName'),
    icon: 'sprout',
    primaryColor: 'var(--color-ferni)',
    accentColor: 'var(--color-ferni-light)',
    metaphor: t('founders.seasons.springMetaphor'),
    description: t('founders.seasons.springDescription'),
  },
  summer: {
    season: 'summer',
    name: t('founders.seasons.summerName'),
    icon: 'sun',
    primaryColor: 'var(--color-jordan)',
    accentColor: 'var(--color-jordan-light)',
    metaphor: t('founders.seasons.summerMetaphor'),
    description: t('founders.seasons.summerDescription'),
  },
  fall: {
    season: 'fall',
    name: t('founders.seasons.fallName'),
    icon: 'leaf',
    primaryColor: 'var(--color-maya)',
    accentColor: 'var(--color-maya-light)',
    metaphor: t('founders.seasons.fallMetaphor'),
    description: t('founders.seasons.fallDescription'),
  },
  winter: {
    season: 'winter',
    name: t('founders.seasons.winterName'),
    icon: 'snowflake',
    primaryColor: 'var(--color-peter)',
    accentColor: 'var(--color-peter-light)',
    metaphor: t('founders.seasons.winterMetaphor'),
    description: t('founders.seasons.winterDescription'),
  },
});

export function getCurrentSeason(): Season {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

export function getSeasonalTheme(): SeasonalTheme {
  return getSeasonalThemes()[getCurrentSeason()];
}

// ============================================================================
// STATE & CACHE
// ============================================================================

/** Cache TTL - 5 minutes for most data, refreshed on demand */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedStats: FounderStats | null = null;
let cachedStatsTime = 0;

let cachedFounders: Founder[] | null = null;
let cachedFoundersTime = 0;

let cachedStories: FounderStory[] | null = null;
let cachedStoriesTime = 0;

let cachedMilestones: CommunityMilestone[] | null = null;
let cachedMilestonesTime = 0;

let cachedPersonalImpact: PersonalImpact | null = null;
let cachedPersonalImpactTime = 0;

let lastMilestoneCheck: number = 0;

/** Check if cache is still valid */
function isCacheValid(cacheTime: number): boolean {
  return Date.now() - cacheTime < CACHE_TTL_MS;
}

// ============================================================================
// DEFAULT DATA (Used when API unavailable)
// ============================================================================
//
// PHILOSOPHY: Honesty over hype.
// These are real numbers or honest placeholders.
// We'd rather show "7 founding members" than inflate to 142.
// Trust is built through transparency, not manufactured success.

const DEFAULT_STATS: FounderStats = {
  totalFounders: 0, // Will be populated from real data - don't fake this
  thisMonthFounders: 0,
  conversationsSupported: 0, // Real conversations, real impact
  conversationsThisMonth: 0,
  featuresUnlocked: [], // Features that founders specifically helped fund
  monthlyRecurring: 0, // Always hidden - respect privacy
};

// Empty by default - the wall shows real people, not placeholders
// When we have real founders, they appear here with their permission
const DEFAULT_FOUNDERS: Founder[] = [];

// We don't manufacture testimonials.
// Real stories appear when real people share them.
// Empty is more honest than fabricated.
const DEFAULT_STORIES: FounderStory[] = [];

// Honest milestones - start small, celebrate genuinely
const getDefaultMilestones = (): CommunityMilestone[] => [
  {
    id: 'founders-10',
    target: 10,
    current: 0, // Real count
    type: 'founders',
    title: t('founders.milestones.first10Title'),
    celebration: t('founders.milestones.first10Celebration'),
    reached: false,
  },
  {
    id: 'founders-50',
    target: 50,
    current: 0,
    type: 'founders',
    title: t('founders.milestones.founders50Title'),
    celebration: t('founders.milestones.founders50Celebration'),
    reached: false,
  },
  {
    id: 'conversations-1k',
    target: 1000,
    current: 0,
    type: 'conversations',
    title: t('founders.milestones.conversations1kTitle'),
    celebration: t('founders.milestones.conversations1kCelebration'),
    reached: false,
  },
  {
    id: 'founders-100',
    target: 100,
    current: 0,
    type: 'founders',
    title: t('founders.milestones.founders100Title'),
    celebration: t('founders.milestones.founders100Celebration'),
    reached: false,
  },
];

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

export async function fetchFounderStats(forceRefresh = false): Promise<FounderStats> {
  // Return cached if valid
  if (!forceRefresh && cachedStats && isCacheValid(cachedStatsTime)) {
    return cachedStats;
  }

  try {
    const response = await apiFetch('/api/garden/founder-stats');
    if (!response.ok) throw new Error('Failed to fetch founder stats');
    cachedStats = await response.json();
    cachedStatsTime = Date.now();
    return cachedStats!;
  } catch (error) {
    log.warn('Using default founder stats', error);
    // Return stale cache if available, else default
    return cachedStats || DEFAULT_STATS;
  }
}

export async function fetchFoundersWall(forceRefresh = false): Promise<Founder[]> {
  if (!forceRefresh && cachedFounders && isCacheValid(cachedFoundersTime)) {
    return cachedFounders;
  }

  try {
    const response = await apiFetch('/api/garden/founders-wall');
    if (!response.ok) throw new Error('Failed to fetch founders wall');
    cachedFounders = await response.json();
    cachedFoundersTime = Date.now();
    return cachedFounders!;
  } catch (error) {
    log.warn('Using default founders wall', error);
    return cachedFounders || DEFAULT_FOUNDERS;
  }
}

export async function fetchFounderStories(forceRefresh = false): Promise<FounderStory[]> {
  if (!forceRefresh && cachedStories && isCacheValid(cachedStoriesTime)) {
    return cachedStories;
  }

  try {
    const response = await apiFetch('/api/garden/founder-stories');
    if (!response.ok) throw new Error('Failed to fetch founder stories');
    cachedStories = await response.json();
    cachedStoriesTime = Date.now();
    return cachedStories!;
  } catch (error) {
    log.warn('Using default founder stories', error);
    return cachedStories || DEFAULT_STORIES;
  }
}

export async function fetchCommunityMilestones(forceRefresh = false): Promise<CommunityMilestone[]> {
  if (!forceRefresh && cachedMilestones && isCacheValid(cachedMilestonesTime)) {
    return cachedMilestones;
  }

  try {
    const response = await apiFetch('/api/garden/milestones');
    if (!response.ok) throw new Error('Failed to fetch milestones');
    cachedMilestones = await response.json();
    cachedMilestonesTime = Date.now();
    return cachedMilestones!;
  } catch (error) {
    log.warn('Using default milestones', error);
    return cachedMilestones || getDefaultMilestones();
  }
}

export async function fetchPersonalImpact(userId: string, forceRefresh = false): Promise<PersonalImpact | null> {
  if (!forceRefresh && cachedPersonalImpact?.userId === userId && isCacheValid(cachedPersonalImpactTime)) {
    return cachedPersonalImpact;
  }

  try {
    const response = await apiFetch(`/api/garden/personal-impact/${userId}`);
    if (!response.ok) return cachedPersonalImpact;
    cachedPersonalImpact = await response.json();
    cachedPersonalImpactTime = Date.now();
    return cachedPersonalImpact;
  } catch (error) {
    log.warn('Could not fetch personal impact', error);
    return cachedPersonalImpact;
  }
}

// ============================================================================
// MILESTONE CELEBRATIONS
// ============================================================================

const shownMilestoneIds = new Set<string>();

export async function checkForNewMilestones(): Promise<void> {
  // Throttle checks to every 5 minutes
  const now = Date.now();
  if (now - lastMilestoneCheck < 5 * 60 * 1000) return;
  lastMilestoneCheck = now;

  try {
    const milestones = await fetchCommunityMilestones();
    const newlyReached = milestones.filter(
      (m) => m.reached && !shownMilestoneIds.has(m.id) && isRecentMilestone(m.reachedAt)
    );

    for (const milestone of newlyReached) {
      celebrateMilestone(milestone);
      shownMilestoneIds.add(milestone.id);
    }
  } catch (error) {
    log.debug('Milestone check failed', error);
  }
}

function isRecentMilestone(reachedAt?: string): boolean {
  if (!reachedAt) return false;
  const reachedDate = new Date(reachedAt);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return reachedDate > dayAgo;
}

function celebrateMilestone(milestone: CommunityMilestone): void {
  log.info('Celebrating milestone', milestone.id);

  // Show a special celebration toast
  toast.success(t('toasts.milestoneReached', { title: milestone.title }));

  // Dispatch event for other components to react
  document.dispatchEvent(
    new CustomEvent('ferni:milestone-reached', {
      detail: { milestone },
    })
  );
}

// ============================================================================
// ANIMATED COUNTER
// ============================================================================

export interface CounterAnimation {
  start: number;
  end: number;
  duration: number;
  format: 'number' | 'compact' | 'percentage';
}

export function animateCounter(
  element: HTMLElement,
  config: CounterAnimation,
  onComplete?: () => void
): void {
  const { start, end, duration, format } = config;
  const startTime = performance.now();

  function formatValue(value: number): string {
    switch (format) {
      case 'compact':
        return formatNumber(value, { notation: 'compact', maximumFractionDigits: value >= 1e6 ? 1 : 0 });
      case 'percentage':
        return formatNumber(value / 100, { style: 'percent', maximumFractionDigits: 0 });
      default:
        return formatNumber(value);
    }
  }

  function easeOutExpo(t: number): number {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function update(currentTime: number): void {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutExpo(progress);
    const currentValue = Math.round(start + (end - start) * easedProgress);

    element.textContent = formatValue(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = formatValue(end);
      onComplete?.();
    }
  }

  requestAnimationFrame(update);
}

// ============================================================================
// TIER COLORS & BADGES
// ============================================================================

export const TIER_COLORS: Record<Founder['tier'], { bg: string; text: string; border: string }> = {
  seed: {
    bg: 'var(--color-semantic-info-bg, #e8f4fd)',
    text: 'var(--color-semantic-info, #2563eb)',
    border: 'var(--color-semantic-info, #2563eb)',
  },
  sprout: {
    bg: 'var(--persona-tint)',
    text: 'var(--persona-primary)',
    border: 'var(--persona-primary)',
  },
  tree: {
    bg: 'var(--color-semantic-warning-bg, #fff8e6)',
    text: 'var(--color-semantic-warning, #d97706)',
    border: 'var(--color-semantic-warning, #d97706)',
  },
  forest: {
    bg: 'var(--color-semantic-success-bg, #ecfdf5)',
    text: 'var(--color-semantic-success, #10b981)',
    border: 'var(--color-semantic-success, #10b981)',
  },
};

// Badge icons use Lucide SVG names - NO EMOJIS per brand guidelines
// label/description resolve through t() on each read so they follow the active locale
const badgeInfo = (name: string, icon: string, desc: string) => ({
  get label() {
    return t(name);
  },
  icon,
  get description() {
    return t(desc);
  },
});

export const BADGE_INFO: Record<NonNullable<Founder['badge']>, { label: string; icon: string; description: string }> = {
  og: badgeInfo('founders.badges.ogLabel', 'star', 'founders.badges.ogDescription'),
  champion: badgeInfo('founders.badges.championLabel', 'trophy', 'founders.badges.championDescription'),
  believer: badgeInfo('founders.badges.believerLabel', 'heart', 'founders.badges.believerDescription'),
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearFoundersCache(): void {
  cachedStats = null;
  cachedStatsTime = 0;
  cachedFounders = null;
  cachedFoundersTime = 0;
  cachedStories = null;
  cachedStoriesTime = 0;
  cachedMilestones = null;
  cachedMilestonesTime = 0;
  cachedPersonalImpact = null;
  cachedPersonalImpactTime = 0;
}

// Note: Auto-refresh removed - TTL-based caching handles this now

// ============================================================================
// EXPORTS
// ============================================================================

export const foundersService = {
  fetchStats: fetchFounderStats,
  fetchFoundersWall,
  fetchStories: fetchFounderStories,
  fetchMilestones: fetchCommunityMilestones,
  fetchPersonalImpact,
  checkForNewMilestones,
  animateCounter,
  getSeasonalTheme,
  getCurrentSeason,
  clearCache: clearFoundersCache,
  TIER_COLORS,
  BADGE_INFO,
  getSeasonalThemes,
};

export default foundersService;

