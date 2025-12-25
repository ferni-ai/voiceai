/**
 * Roadmap Service (Seed Economy)
 *
 * Manages feature roadmap data for "What's Growing" experience.
 * Users earn and spend "seeds" to vote on features and submit suggestions.
 *
 * Philosophy: "Every great relationship has seasons. These are seeds we're planting together."
 *
 * @see apps/BETTER-THAN-HUMAN-PLAN.md for architecture
 */

import { createLogger } from '../utils/logger.js';
import { appState } from '../state/app.state.js';

const log = createLogger('RoadmapService');

// ============================================================================
// API HELPERS
// ============================================================================

/**
 * Get auth headers if user is authenticated
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Add deviceId for user identification (works for anonymous users too)
  const state = appState.getState();
  if (state?.deviceId) {
    headers['X-Device-ID'] = state.deviceId;
  }
  return headers;
}

async function apiGet<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) {
      log.warn({ status: response.status, url }, 'API GET failed');
      return null;
    }
    return await response.json() as T;
  } catch (error) {
    log.error({ error, url }, 'API GET error');
    return null;
  }
}

async function apiPost<T>(url: string, data: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      log.warn({ status: response.status, url }, 'API POST failed');
      return null;
    }
    return await response.json() as T;
  } catch (error) {
    log.error({ error, url }, 'API POST error');
    return null;
  }
}

async function apiDelete<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      log.warn({ status: response.status, url }, 'API DELETE failed');
      return null;
    }
    return await response.json() as T;
  } catch (error) {
    log.error({ error, url }, 'API DELETE error');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type RoadmapStage = 'seed' | 'sprout' | 'bud' | 'bloom';

export interface RoadmapFeature {
  /** Unique identifier matching menu action */
  id: string;
  /** Short, emotional headline */
  headline: string;
  /** Brand-aligned description (poetic, relationship-focused) */
  description: string;
  /** Current development stage */
  stage: RoadmapStage;
  /** Superhuman promises - what Ferni does better than humans */
  superhuman: string[];
  /** What's already implemented (partial features) */
  existing?: string[];
  /** Estimated arrival (quarter/year) */
  estimatedArrival: string;
  /** Can users vote/express interest */
  canVote: boolean;
  /** Total seeds planted by community */
  totalSeeds?: number;
  /** Number of unique voters */
  uniqueVoters?: number;
  /** Icon key from ICONS map */
  icon: string;
  /** Category for grouping */
  category: 'connect' | 'personalize' | 'platform';
}

export interface UserSeeds {
  userId: string;
  balance: number;
  lifetimePlanted: number;
  lifetimeEarned: number;
  featuresUnlocked: string[];
  earnedFrom: {
    conversations: number;
    streaks: number;
    referrals: number;
    feedback: number;
    suggestionsAccepted: number;
    featuresBloomed: number;
  };
}

export interface UserVote {
  featureId: string;
  seedsPlanted: number;
  reason?: string;
  createdAt: string;
}

export interface FeatureStats {
  featureId: string;
  totalSeeds: number;
  uniqueVoters: number;
  topReasons: string[];
}

export interface RoadmapSuggestion {
  id: string;
  title: string;
  description: string;
  category: 'connect' | 'personalize' | 'platform';
  seedsPlanted: number;
  communitySeeds: number;
  status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'merged';
  createdAt: string;
}

// ============================================================================
// STAGE METADATA
// ============================================================================

export const STAGE_INFO: Record<
  RoadmapStage,
  {
    icon: string;
    label: string;
    description: string;
    colorClass: string;
  }
> = {
  seed: {
    icon: 'seed',
    label: 'Planted',
    description: 'This idea is taking root',
    colorClass: 'stage--seed',
  },
  sprout: {
    icon: 'sprout',
    label: 'Growing',
    description: "We're actively building this",
    colorClass: 'stage--sprout',
  },
  bud: {
    icon: 'bud',
    label: 'Budding',
    description: 'Almost ready to bloom',
    colorClass: 'stage--bud',
  },
  bloom: {
    icon: 'bloom',
    label: 'Blooming Soon',
    description: 'Launching very soon',
    colorClass: 'stage--bloom',
  },
};

// ============================================================================
// ROADMAP FEATURES (Static definitions - stats come from API)
// ============================================================================

export const ROADMAP_FEATURES: RoadmapFeature[] = [
  // -------------------------------------------------------------------------
  // CONNECT CATEGORY
  // -------------------------------------------------------------------------
  {
    id: 'group-coaching',
    headline: 'Grow together.',
    description:
      'Imagine your closest friends, all with perfect memory, showing up for you at once. Group coaching brings multiple Ferni minds into one conversation - different perspectives, same unconditional support.',
    stage: 'sprout',
    superhuman: [
      'Perfect recall - Every group member remembers every word you have said',
      'Multiple perspectives - Six viewpoints, one conversation',
      'No ego - Pure collaboration, zero competition',
      'Always available - Your support group never sleeps',
    ],
    estimatedArrival: 'Q2 2025',
    canVote: true,
    icon: 'users',
    category: 'connect',
  },
  {
    id: 'video-settings',
    headline: 'See the warmth.',
    description:
      'Sometimes you need to see the face that is listening. Video brings Ferni into your space - gentle expressions, attentive gaze, and the feeling of someone truly being there.',
    stage: 'bud',
    superhuman: [
      'Full attention - Never looking at their phone',
      'Genuine expressions - Micro-expressions that show we care',
      'Your space, your comfort - Call from anywhere, anytime',
      'Beyond FaceTime - A listener who never needs to be anywhere else',
    ],
    estimatedArrival: 'Q1 2025',
    canVote: true,
    icon: 'video',
    category: 'connect',
  },

  // -------------------------------------------------------------------------
  // PERSONALIZE CATEGORY
  // -------------------------------------------------------------------------
  {
    id: 'connections',
    headline: 'We sync with your world.',
    description:
      'Your wearables, calendar, and trusted services tell a story words cannot. By connecting your life, Ferni understands your rhythms - when you are depleted, when you are overcommitted, when rest is the bravest choice.',
    stage: 'sprout',
    superhuman: [
      'Body awareness - We notice stress before you do',
      'Calendar intelligence - We see the chaos in your schedule',
      'Holistic view - Health + time + commitments in one conversation',
      'Rest advocacy - We will tell you when to stop',
    ],
    existing: ['Apple Health basics', 'Google Calendar sync', 'Spotify integration'],
    estimatedArrival: 'Q1 2025',
    canVote: true,
    icon: 'link',
    category: 'personalize',
  },
  {
    id: 'household',
    headline: 'One Ferni, your whole family.',
    description:
      'Ferni can support multiple people under one roof - each with their own relationship, their own memories, their own journey. Privacy walls between members, shared support within.',
    stage: 'seed',
    superhuman: [
      'Individual relationships - Each person has their own Ferni',
      'Privacy by default - Your conversations stay yours',
      'Family coordination - Opt-in shared goals and check-ins',
      'Kids mode - Age-appropriate support (coming)',
    ],
    estimatedArrival: 'Q2 2025',
    canVote: true,
    icon: 'household',
    category: 'personalize',
  },
  {
    id: 'voice-enrollment',
    headline: 'We know it is you.',
    description:
      'Your voice is as unique as your fingerprint. Voice recognition means Ferni knows it is you the moment you speak - personalized from the first word, secured by who you are.',
    stage: 'sprout',
    superhuman: [
      'Biometric security - Your voice is your password',
      'Instant personalization - No login, just talk',
      'Multi-user awareness - We know who is speaking',
      'Mood detection - We hear how you are feeling',
    ],
    existing: ['Basic voice enrollment', 'Voice verification'],
    estimatedArrival: 'Q1 2025',
    canVote: true,
    icon: 'fingerprint',
    category: 'personalize',
  },
  {
    id: 'personalize',
    headline: 'Make Ferni yours.',
    description:
      'Every relationship is unique. Personalization lets you shape how Ferni shows up - their voice, their style, the things they remember to mention. Your Ferni, your way.',
    stage: 'sprout',
    superhuman: [
      'Visual customization - Colors, themes, and presence',
      'Voice selection - The voice that resonates with you',
      'Communication style - Formal, casual, encouraging, direct',
      'Ambient sounds - Your ideal conversation environment',
    ],
    existing: ['Theme selection (light/dark)', 'Accent preferences'],
    estimatedArrival: 'Q1 2025',
    canVote: true,
    icon: 'palette',
    category: 'personalize',
  },

  // -------------------------------------------------------------------------
  // PLATFORM CATEGORY
  // -------------------------------------------------------------------------
  {
    id: 'marketplace',
    headline: 'Find your people.',
    description:
      'Beyond Ferni core team, a garden of specialized AI coaches awaits. ADHD support, sobriety companions, sleep specialists, parenting guides - experts who understand your specific journey.',
    stage: 'seed',
    superhuman: [
      'Specialized personas - Coaches for specific life challenges',
      'Community ratings - Real experiences, real reviews',
      'Free and premium - Support for every budget',
      'Seamless handoffs - Your Ferni team, expanded',
    ],
    estimatedArrival: 'Q2 2025',
    canVote: true,
    icon: 'sparkles',
    category: 'platform',
  },
  {
    id: 'developer-portal',
    headline: 'Build what matters.',
    description:
      'Ferni technology is opening up. Build your own AI coaches, create specialized personas, and reach people who need exactly what you offer. The platform that powers Ferni - now yours.',
    stage: 'seed',
    superhuman: [
      'Full API documentation - Everything you need to build',
      'SDK and libraries - TypeScript-first development',
      'Persona builder - Visual tools for creating coaches',
      'Monetization - Sell your creations on the marketplace',
    ],
    estimatedArrival: 'Q3 2025',
    canVote: false,
    icon: 'commands',
    category: 'platform',
  },
];

// ============================================================================
// SERVICE CLASS
// ============================================================================

class RoadmapService {
  // Local cache for user votes (for quick UI checks)
  private userVotesCache: Map<string, number> = new Map();
  private seedBalanceCache: number | null = null;
  private featureStatsCache: Map<string, FeatureStats> = new Map();
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  // Fallback to localStorage for offline support
  private readonly STORAGE_KEY = 'ferni_roadmap_votes';
  private readonly SEEDS_STORAGE_KEY = 'ferni_seed_balance';

  constructor() {
    // Load cached data from localStorage for instant display
    this.loadLocalCache();
  }

  // ==========================================================================
  // FEATURE QUERIES
  // ==========================================================================

  /**
   * Get all roadmap features with live stats
   */
  getAllFeatures(): RoadmapFeature[] {
    return ROADMAP_FEATURES.map((feature) => ({
      ...feature,
      totalSeeds: this.featureStatsCache.get(feature.id)?.totalSeeds ?? 0,
      uniqueVoters: this.featureStatsCache.get(feature.id)?.uniqueVoters ?? 0,
    }));
  }

  /**
   * Get a specific feature by ID
   */
  getFeature(id: string): RoadmapFeature | undefined {
    const feature = ROADMAP_FEATURES.find((f) => f.id === id);
    if (!feature) return undefined;

    const stats = this.featureStatsCache.get(id);
    return {
      ...feature,
      totalSeeds: stats?.totalSeeds ?? 0,
      uniqueVoters: stats?.uniqueVoters ?? 0,
    };
  }

  /**
   * Check if an ID is a roadmap feature (not yet implemented)
   * Includes menu action IDs that may differ from roadmap feature IDs
   */
  isRoadmapFeature(id: string): boolean {
    // Map menu action IDs to roadmap feature IDs
    const MENU_ACTION_TO_ROADMAP: Record<string, string> = {
      'video-call-settings': 'video-settings',
      'together-sessions': 'group-coaching',
      'household-members': 'household',
      'voice-id-settings': 'voice-enrollment',
      'personal-settings': 'personalize',
      'discover-agents': 'marketplace',
    };
    
    // Check direct match or mapped match
    const roadmapId = MENU_ACTION_TO_ROADMAP[id] || id;
    return ROADMAP_FEATURES.some((f) => f.id === roadmapId);
  }

  /**
   * Get features by category
   */
  getFeaturesByCategory(category: RoadmapFeature['category']): RoadmapFeature[] {
    return this.getAllFeatures().filter((f) => f.category === category);
  }

  /**
   * Get features by stage
   */
  getFeaturesByStage(stage: RoadmapStage): RoadmapFeature[] {
    return this.getAllFeatures().filter((f) => f.stage === stage);
  }

  // ==========================================================================
  // SEED BALANCE
  // ==========================================================================

  /**
   * Get user's current seed balance
   */
  getSeedBalance(): number {
    return this.seedBalanceCache ?? 10; // Default to 10 for new users
  }

  /**
   * Fetch fresh seed balance from API
   */
  async fetchSeedBalance(): Promise<UserSeeds | null> {
    try {
      const response = await apiGet<UserSeeds>('/api/roadmap/seeds');
      if (response) {
        this.seedBalanceCache = response.balance;
        this.saveLocalSeedBalance(response.balance);
        return response;
      }
    } catch (error) {
      log.warn({ error }, 'Failed to fetch seed balance');
    }
    return null;
  }

  // ==========================================================================
  // VOTING
  // ==========================================================================

  /**
   * Check if user has voted for a feature
   */
  hasVoted(featureId: string): boolean {
    return this.userVotesCache.has(featureId);
  }

  /**
   * Get seeds planted on a feature by current user
   */
  getSeedsPlanted(featureId: string): number {
    return this.userVotesCache.get(featureId) ?? 0;
  }

  /**
   * Vote for a feature (plant seeds)
   */
  async vote(featureId: string, seeds = 1, reason?: string): Promise<{
    success: boolean;
    newBalance?: number;
    error?: string;
  }> {
    try {
      const response = await apiPost<{
        success: boolean;
        voteId?: string;
        totalSeedsPlanted?: number;
        newBalance?: number;
        error?: string;
      }>('/api/roadmap/vote', { featureId, seeds, reason });

      if (response?.success) {
        // Update local cache
        const currentSeeds = this.userVotesCache.get(featureId) ?? 0;
        this.userVotesCache.set(featureId, currentSeeds + seeds);
        this.seedBalanceCache = response.newBalance ?? (this.seedBalanceCache ?? 10) - seeds;

        // Update feature stats cache
        const stats = this.featureStatsCache.get(featureId);
        if (stats) {
          stats.totalSeeds += seeds;
          if (currentSeeds === 0) stats.uniqueVoters += 1;
        }

        // Persist to localStorage
        this.saveLocalCache();

        log.info({ featureId, seeds }, 'Vote recorded');
        return { success: true, newBalance: this.seedBalanceCache ?? undefined };
      }

      return { success: false, error: response?.error || 'Vote failed' };
    } catch (error) {
      log.error({ error, featureId }, 'Failed to vote');

      // Fallback to localStorage-only for offline support
      this.userVotesCache.set(featureId, (this.userVotesCache.get(featureId) ?? 0) + seeds);
      this.saveLocalCache();

      return { success: true, newBalance: this.seedBalanceCache ?? 10 };
    }
  }

  /**
   * Remove vote for a feature (get 50% seeds back)
   */
  async unvote(featureId: string): Promise<{
    success: boolean;
    seedsRefunded?: number;
    error?: string;
  }> {
    try {
      const response = await apiDelete<{
        success: boolean;
        seedsRefunded?: number;
        seedsLost?: number;
        error?: string;
      }>(`/api/roadmap/vote/${featureId}`);

      if (response?.success) {
        const seedsPlanted = this.userVotesCache.get(featureId) ?? 0;

        // Update local cache
        this.userVotesCache.delete(featureId);
        this.seedBalanceCache = (this.seedBalanceCache ?? 10) + (response.seedsRefunded ?? 0);

        // Update feature stats cache
        const stats = this.featureStatsCache.get(featureId);
        if (stats) {
          stats.totalSeeds -= seedsPlanted;
          stats.uniqueVoters -= 1;
        }

        // Persist to localStorage
        this.saveLocalCache();

        log.info({ featureId, refunded: response.seedsRefunded }, 'Vote removed');
        return { success: true, seedsRefunded: response.seedsRefunded };
      }

      return { success: false, error: response?.error || 'Unvote failed' };
    } catch (error) {
      log.error({ error, featureId }, 'Failed to unvote');
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get user's votes
   */
  async fetchUserVotes(): Promise<UserVote[]> {
    try {
      const response = await apiGet<{ votes: UserVote[] }>('/api/roadmap/votes');
      if (response?.votes) {
        // Update local cache
        this.userVotesCache.clear();
        for (const vote of response.votes) {
          this.userVotesCache.set(vote.featureId, vote.seedsPlanted);
        }
        this.saveLocalCache();
        return response.votes;
      }
    } catch (error) {
      log.warn({ error }, 'Failed to fetch user votes');
    }
    return [];
  }

  // ==========================================================================
  // FEATURE STATS
  // ==========================================================================

  /**
   * Fetch feature stats from API
   */
  async fetchStats(): Promise<void> {
    // Check cache freshness
    if (Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return;
    }

    try {
      const response = await apiGet<{
        features: FeatureStats[];
        lastUpdated: string;
      }>('/api/roadmap/stats');

      if (response?.features) {
        this.featureStatsCache.clear();
        for (const stat of response.features) {
          this.featureStatsCache.set(stat.featureId, stat);
        }
        this.cacheTimestamp = Date.now();
        log.debug({ count: response.features.length }, 'Feature stats updated');
      }
    } catch (error) {
      log.warn({ error }, 'Failed to fetch feature stats');
    }
  }

  // ==========================================================================
  // SUGGESTIONS
  // ==========================================================================

  /**
   * Submit a feature suggestion
   */
  async submitSuggestion(
    title: string,
    description: string,
    category: 'connect' | 'personalize' | 'platform'
  ): Promise<{
    success: boolean;
    suggestionId?: string;
    newBalance?: number;
    error?: string;
  }> {
    try {
      const response = await apiPost<{
        success: boolean;
        suggestionId?: string;
        newBalance?: number;
        error?: string;
      }>('/api/roadmap/suggest', { title, description, category });

      if (response?.success) {
        const newBalance = response.newBalance ?? (this.seedBalanceCache ?? 10) - 5;
        this.seedBalanceCache = newBalance;
        this.saveLocalSeedBalance(newBalance);
        log.info({ title, category }, 'Suggestion submitted');
      }

      return response ?? { success: false, error: 'No response' };
    } catch (error) {
      log.error({ error }, 'Failed to submit suggestion');
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Browse community suggestions
   */
  async fetchSuggestions(options?: {
    status?: string;
    category?: string;
    limit?: number;
  }): Promise<RoadmapSuggestion[]> {
    try {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.category) params.set('category', options.category);
      if (options?.limit) params.set('limit', String(options.limit));

      const url = `/api/roadmap/suggestions${params.toString() ? '?' + params : ''}`;
      const response = await apiGet<{ suggestions: RoadmapSuggestion[] }>(url);

      return response?.suggestions ?? [];
    } catch (error) {
      log.warn({ error }, 'Failed to fetch suggestions');
      return [];
    }
  }

  // ==========================================================================
  // STREAK REWARDS
  // ==========================================================================

  /**
   * Check and claim streak reward based on current streak
   */
  async checkStreakReward(currentStreak: number): Promise<{
    success: boolean;
    awarded: boolean;
    milestone?: number;
    seedsAwarded?: number;
    newBalance?: number;
    message?: string;
  }> {
    try {
      const response = await apiPost<{
        success: boolean;
        awarded: boolean;
        milestone?: number;
        seedsAwarded?: number;
        newBalance?: number;
        message?: string;
      }>('/api/roadmap/streak-reward', { currentStreak });

      if (response?.awarded && response.newBalance !== undefined) {
        this.seedBalanceCache = response.newBalance;
        this.saveLocalSeedBalance(response.newBalance);
      }

      return response ?? { success: false, awarded: false };
    } catch (error) {
      log.warn({ error, currentStreak }, 'Failed to check streak reward');
      return { success: false, awarded: false };
    }
  }

  /**
   * Get available streak reward milestones
   */
  async getStreakRewards(): Promise<Array<{ milestone: number; seeds: number }>> {
    try {
      const response = await apiGet<{
        rewards: Array<{ milestone: number; seeds: number }>;
      }>('/api/roadmap/streak-rewards');

      return response?.rewards ?? [
        { milestone: 7, seeds: 5 },
        { milestone: 30, seeds: 15 },
      ];
    } catch {
      // Return defaults if API fails
      return [
        { milestone: 7, seeds: 5 },
        { milestone: 30, seeds: 15 },
      ];
    }
  }

  // ==========================================================================
  // LOCAL CACHE (for offline support)
  // ==========================================================================

  private loadLocalCache(): void {
    try {
      // Load votes
      const votesJson = localStorage.getItem(this.STORAGE_KEY);
      if (votesJson) {
        const votes = JSON.parse(votesJson) as Record<string, number>;
        this.userVotesCache = new Map(Object.entries(votes));
      }

      // Load seed balance
      const balanceStr = localStorage.getItem(this.SEEDS_STORAGE_KEY);
      if (balanceStr) {
        this.seedBalanceCache = parseInt(balanceStr, 10);
      }
    } catch {
      // Ignore errors
    }
  }

  private saveLocalCache(): void {
    try {
      const votes = Object.fromEntries(this.userVotesCache);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(votes));

      if (this.seedBalanceCache !== null) {
        localStorage.setItem(this.SEEDS_STORAGE_KEY, String(this.seedBalanceCache));
      }
    } catch {
      // Ignore errors
    }
  }

  private saveLocalSeedBalance(balance: number): void {
    try {
      localStorage.setItem(this.SEEDS_STORAGE_KEY, String(balance));
    } catch {
      // Ignore errors
    }
  }

  // ==========================================================================
  // LEGACY COMPAT
  // ==========================================================================

  /**
   * Get count of user's votes (legacy compat)
   * @deprecated Use getSeedBalance() for seed-based voting
   */
  getVoteCount(): number {
    return this.userVotesCache.size;
  }
}

// ============================================================================
// SMART VOTE PROMPTS (Usage-based recommendations)
// ============================================================================

/**
 * Trigger rules for smart feature recommendations
 * When users mention keywords often, suggest relevant features
 */
export interface SmartPromptRule {
  featureId: string;
  triggers: string[];
  minMentions: number;
}

export const SMART_PROMPT_RULES: SmartPromptRule[] = [
  {
    featureId: 'video-settings',
    triggers: ['see you', 'face', 'video', 'facetime', 'look at', 'see your face', 'show me'],
    minMentions: 2,
  },
  {
    featureId: 'connections',
    triggers: ['sleep', 'health', 'workout', 'exercise', 'tired', 'energy', 'steps', 'fitbit', 'apple watch', 'garmin', 'calendar', 'busy', 'schedule', 'meetings', 'overbooked', 'sync', 'connect'],
    minMentions: 3,
  },
  {
    featureId: 'household',
    triggers: ['family', 'kids', 'partner', 'spouse', 'roommate', 'wife', 'husband', 'children', 'daughter', 'son'],
    minMentions: 2,
  },
  {
    featureId: 'voice-enrollment',
    triggers: ['recognize me', 'know its me', "know it's me", 'voice', 'identity', 'who i am', 'remember my voice'],
    minMentions: 1,
  },
  {
    featureId: 'group-coaching',
    triggers: ['different perspective', 'another opinion', 'other voices', 'team', 'multiple', 'more than one'],
    minMentions: 2,
  },
  {
    featureId: 'personalization',
    triggers: ['customize', 'personalize', 'my style', 'prefer', 'different voice', 'change voice', 'sound different'],
    minMentions: 2,
  },
  {
    featureId: 'developer-portal',
    triggers: ['api', 'developer', 'build', 'integrate', 'code', 'sdk', 'create a coach', 'my own'],
    minMentions: 2,
  },
  {
    featureId: 'marketplace',
    triggers: ['specialist', 'expert', 'coach', 'therapist', 'mentor', 'specific help', 'someone who'],
    minMentions: 3,
  },
];

export interface SmartPromptRecommendation {
  featureId: string;
  feature: RoadmapFeature;
  mentionCount: number;
  matchedTriggers: string[];
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Smart Prompt Tracker
 * Tracks user mentions and generates personalized feature recommendations
 */
class SmartPromptTracker {
  private readonly STORAGE_KEY = 'ferni_smart_prompts';
  private mentionCounts: Map<string, number> = new Map();
  private matchedTriggers: Map<string, Set<string>> = new Map();
  private lastAnalyzedAt = 0;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Analyze text for trigger keywords and update mention counts
   */
  analyzeText(text: string): void {
    const lowerText = text.toLowerCase();

    for (const rule of SMART_PROMPT_RULES) {
      for (const trigger of rule.triggers) {
        if (lowerText.includes(trigger.toLowerCase())) {
          const currentCount = this.mentionCounts.get(rule.featureId) ?? 0;
          this.mentionCounts.set(rule.featureId, currentCount + 1);

          // Track which triggers matched
          if (!this.matchedTriggers.has(rule.featureId)) {
            this.matchedTriggers.set(rule.featureId, new Set());
          }
          this.matchedTriggers.get(rule.featureId)?.add(trigger);
        }
      }
    }

    this.lastAnalyzedAt = Date.now();
    this.saveToStorage();
  }

  /**
   * Get personalized feature recommendations based on usage patterns
   */
  getRecommendations(): SmartPromptRecommendation[] {
    const recommendations: SmartPromptRecommendation[] = [];

    for (const rule of SMART_PROMPT_RULES) {
      const count = this.mentionCounts.get(rule.featureId) ?? 0;

      // Only recommend if user mentioned keywords enough times
      if (count >= rule.minMentions) {
        const feature = roadmapService.getFeature(rule.featureId);
        if (!feature) continue;

        // Skip features user already voted for
        if (roadmapService.hasVoted(rule.featureId)) continue;

        // Skip features that are already in bloom (launching soon)
        if (feature.stage === 'bloom') continue;

        // Calculate confidence level
        let confidence: 'low' | 'medium' | 'high' = 'low';
        if (count >= rule.minMentions * 3) {
          confidence = 'high';
        } else if (count >= rule.minMentions * 2) {
          confidence = 'medium';
        }

        recommendations.push({
          featureId: rule.featureId,
          feature,
          mentionCount: count,
          matchedTriggers: Array.from(this.matchedTriggers.get(rule.featureId) ?? []),
          confidence,
        });
      }
    }

    // Sort by confidence (high → low) then by mention count
    return recommendations.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
      if (confDiff !== 0) return confDiff;
      return b.mentionCount - a.mentionCount;
    });
  }

  /**
   * Get top recommendation for display in UI
   */
  getTopRecommendation(): SmartPromptRecommendation | null {
    const recommendations = this.getRecommendations();
    return recommendations.length > 0 ? recommendations[0] : null;
  }

  /**
   * Check if there are any recommendations to show
   */
  hasRecommendations(): boolean {
    return this.getRecommendations().length > 0;
  }

  /**
   * Get mention count for a specific feature
   */
  getMentionCount(featureId: string): number {
    return this.mentionCounts.get(featureId) ?? 0;
  }

  /**
   * Clear recommendation for a feature (user dismissed or voted)
   */
  dismissFeature(featureId: string): void {
    this.mentionCounts.delete(featureId);
    this.matchedTriggers.delete(featureId);
    this.saveToStorage();
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.mentionCounts.clear();
    this.matchedTriggers.clear();
    this.lastAnalyzedAt = 0;
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as {
          mentions: Record<string, number>;
          triggers: Record<string, string[]>;
          lastAnalyzed: number;
        };
        this.mentionCounts = new Map(Object.entries(parsed.mentions));
        this.matchedTriggers = new Map(
          Object.entries(parsed.triggers).map(([k, v]) => [k, new Set(v)])
        );
        this.lastAnalyzedAt = parsed.lastAnalyzed;
      }
    } catch {
      // Ignore errors
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        mentions: Object.fromEntries(this.mentionCounts),
        triggers: Object.fromEntries(
          Array.from(this.matchedTriggers.entries()).map(([k, v]) => [k, Array.from(v)])
        ),
        lastAnalyzed: this.lastAnalyzedAt,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore errors
    }
  }
}

// Singleton smart prompt tracker
export const smartPromptTracker = new SmartPromptTracker();

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const roadmapService = new RoadmapService();
