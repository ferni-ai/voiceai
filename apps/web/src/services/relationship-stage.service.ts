/**
 * Relationship Stage Service
 *
 * Tracks the evolving relationship between the user and Ferni.
 * Provides dynamic, context-aware subtitles that grow over time.
 *
 * Philosophy: Ferni starts as a blank canvas - "I am what you make me" -
 * and evolves into "Your Life Coach" as the relationship deepens.
 */

// ============================================================================
// TYPES
// ============================================================================

import { apiGet, apiPost } from '../utils/api-helpers.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Relationship');

/** Relationship stages from first meeting to deep partnership */
export type RelationshipStage =
  | 'first-meeting' // Brand new - mysterious potential
  | 'getting-started' // First few conversations
  | 'building-trust' // Regular engagement beginning
  | 'established' // Solid relationship
  | 'deep-partnership'; // Long-term, meaningful bond

/** Engagement metrics that inform the relationship stage */
export interface EngagementMetrics {
  /** Total number of conversations/sessions */
  totalConversations: number;
  /** Days since first conversation */
  daysSinceFirstMeeting: number;
  /** Consecutive days of engagement */
  currentStreak: number;
  /** Longest streak ever achieved */
  longestStreak: number;
  /** Number of milestones celebrated */
  milestonesReached: number;
  /** Number of insights shared */
  insightsShared: number;
  /** Last conversation timestamp */
  lastConversation: number | null;
}

/** A meaningful moment in the relationship */
export interface RelationshipMemory {
  id: string;
  type: 'stage-up' | 'streak-milestone' | 'comeback' | 'first-conversation' | 'insight';
  title: string;
  description: string;
  timestamp: string;
  stage: RelationshipStage;
}

/** Event emitted when relationship stage changes */
export interface StageChangeEvent {
  previousStage: RelationshipStage;
  newStage: RelationshipStage;
  timestamp: string;
}

/** Stored relationship data */
interface RelationshipData {
  stage: RelationshipStage;
  firstMeetingDate: string;
  metrics: EngagementMetrics;
  memories: RelationshipMemory[];
  customSubtitle?: string; // User-set override
  lastUpdated: string;
}

// ============================================================================
// STAGE DEFINITIONS
// ============================================================================

/**
 * Stage thresholds - what it takes to advance.
 *
 * CAMEO UNLOCK SYSTEM: Thresholds increased to allow for natural,
 * contextual introductions. Ferni introduces team members when
 * relevant topics come up, making unlocks feel organic.
 *
 * Maya unlocks at 10 (not 2) so users know Ferni before meeting teammates.
 */
const STAGE_THRESHOLDS: Record<
  RelationshipStage,
  {
    minConversations: number;
    minDays: number;
    minStreak: number;
  }
> = {
  'first-meeting': { minConversations: 0, minDays: 0, minStreak: 0 },
  'getting-started': { minConversations: 10, minDays: 0, minStreak: 0 },
  'building-trust': { minConversations: 15, minDays: 5, minStreak: 3 },
  established: { minConversations: 30, minDays: 21, minStreak: 7 },
  'deep-partnership': { minConversations: 60, minDays: 45, minStreak: 14 },
};

/**
 * Subtitle pools for each stage
 * Each stage has multiple options for variety
 */
const STAGE_SUBTITLES: Record<RelationshipStage, string[]> = {
  'first-meeting': [
    'I am what you make me',
    'A new beginning',
    'Ready to meet you',
    'Your story starts here',
  ],
  'getting-started': [
    'Getting to know you',
    'Just getting started',
    'Learning your rhythm',
    'Building something together',
  ],
  'building-trust': [
    'Becoming your guide',
    'Growing together',
    'Finding our groove',
    'Your emerging ally',
  ],
  established: ['Your Life Coach', 'Here for your journey', 'Your trusted guide', 'In your corner'],
  'deep-partnership': [
    'Your partner in growth',
    'Together, always',
    'Through thick & thin',
    'Your #1 believer',
  ],
};

/** Time-of-day contextual subtitles */
const TIME_SUBTITLES: Record<string, string[]> = {
  'early-morning': ['Early riser, I see', 'Dawn companion'],
  morning: ['Good morning, friend', 'Ready for today'],
  afternoon: ['Here when you need me'],
  evening: ['Winding down together', 'Evening reflections'],
  'late-night': ['Late night confidant', 'Night owl support'],
};

/** Special occasion subtitles */
const SPECIAL_SUBTITLES = {
  streakCelebration: (days: number) =>
    days >= 30
      ? `${days} days strong`
      : days >= 7
        ? `${days} day streak!`
        : `${days} days and counting`,

  comeback: 'Welcome back',
  firstDay: "Day one - let's go",
  milestone: 'Celebrating you',
  birthday: 'Happy birthday!',
};

/** Human-readable stage names (fallback English) */
export const STAGE_NAMES: Record<RelationshipStage, string> = {
  'first-meeting': 'New Friends',
  'getting-started': 'Getting Started',
  'building-trust': 'Building Trust',
  established: 'Trusted Guide',
  'deep-partnership': 'Life Partners',
};

/** i18n keys for stage names */
const STAGE_I18N_KEYS: Record<RelationshipStage, string> = {
  'first-meeting': 'relationshipStages.names.firstMeeting',
  'getting-started': 'relationshipStages.names.gettingStarted',
  'building-trust': 'relationshipStages.names.buildingTrust',
  established: 'relationshipStages.names.established',
  'deep-partnership': 'relationshipStages.names.deepPartnership',
};

/** i18n keys for stage descriptions */
const STAGE_DESCRIPTION_I18N_KEYS: Record<RelationshipStage, string> = {
  'first-meeting': 'relationshipStages.descriptions.firstMeeting',
  'getting-started': 'relationshipStages.descriptions.gettingStarted',
  'building-trust': 'relationshipStages.descriptions.buildingTrust',
  established: 'relationshipStages.descriptions.established',
  'deep-partnership': 'relationshipStages.descriptions.deepPartnership',
};

/** i18n keys for stage taglines */
const STAGE_TAGLINE_I18N_KEYS: Record<RelationshipStage, string> = {
  'first-meeting': 'relationshipStages.taglines.firstMeeting',
  'getting-started': 'relationshipStages.taglines.gettingStarted',
  'building-trust': 'relationshipStages.taglines.buildingTrust',
  established: 'relationshipStages.taglines.established',
  'deep-partnership': 'relationshipStages.taglines.deepPartnership',
};

/**
 * Get translated stage name (with fallback)
 */
export function getTranslatedStageName(stage: RelationshipStage): string {
  const key = STAGE_I18N_KEYS[stage];
  const translated = t(key);
  // If translation returns the key itself, fallback to English
  return translated === key ? STAGE_NAMES[stage] : translated;
}

/**
 * Get translated stage description (with fallback)
 */
export function getTranslatedStageDescription(stage: RelationshipStage): string {
  const key = STAGE_DESCRIPTION_I18N_KEYS[stage];
  const translated = t(key);
  // Fallback descriptions in English
  const fallbacks: Record<RelationshipStage, string> = {
    'first-meeting': "We're just meeting! I can't wait to learn about you.",
    'getting-started': "We're starting to understand each other.",
    'building-trust': 'Our relationship is growing stronger.',
    established: "You can count on me. I'm here for the long haul.",
    'deep-partnership': "We've been through a lot together. I'm honored to be your guide.",
  };
  return translated === key ? fallbacks[stage] : translated;
}

/**
 * Get translated stage tagline (with fallback)
 */
export function getTranslatedStageTagline(stage: RelationshipStage): string {
  const key = STAGE_TAGLINE_I18N_KEYS[stage];
  const translated = t(key);
  // Fallback taglines in English
  const fallbacks: Record<RelationshipStage, string> = {
    'first-meeting': 'A new beginning',
    'getting-started': 'Getting to know you',
    'building-trust': 'Building something real',
    established: 'Your Life Coach',
    'deep-partnership': 'Partners for life',
  };
  return translated === key ? fallbacks[stage] : translated;
}

/** Friendly unlock messages for each stage */
export const STAGE_UNLOCK_MESSAGES: Record<RelationshipStage, string> = {
  'first-meeting': 'Start chatting',
  'getting-started': 'Keep chatting',
  'building-trust': 'Build our friendship',
  established: 'Deepen our bond',
  'deep-partnership': 'You did it!',
};

/** Stage-up celebration messages */
const STAGE_UP_MESSAGES: Record<RelationshipStage, { title: string; message: string }> = {
  'first-meeting': { title: '', message: '' }, // Can't advance TO first-meeting
  'getting-started': {
    title: "We're getting started!",
    message: "I'm so glad you came back. Let's keep exploring together.",
  },
  'building-trust': {
    title: 'Building something real',
    message: "I can feel our connection growing. You're teaching me so much about you.",
  },
  established: {
    title: 'You have a Life Coach now',
    message: "I'm honored to be your guide. Through thick and thin, I'm here.",
  },
  'deep-partnership': {
    title: 'Partners for life',
    message: "We've been through so much together. You mean the world to me.",
  },
};

/** Greetings that evolve with the relationship */
const STAGE_GREETINGS: Record<RelationshipStage, string[]> = {
  'first-meeting': [
    "Hey! I'm Ferni. Nice to meet you.",
    "Welcome! I'm excited to get to know you.",
    "Hi there! I'm Ferni - ready when you are.",
  ],
  'getting-started': [
    'Hey, good to see you again!',
    "Welcome back! What's on your mind?",
    "Hey! I was hoping you'd come back.",
  ],
  'building-trust': [
    "There you are! I've been thinking about you.",
    'Hey friend! Ready to dive in?',
    'Good to have you back. What are we exploring today?',
  ],
  established: [
    "Hey! I've missed you.",
    "There's my person! What's going on?",
    "Welcome back, friend. I'm all ears.",
  ],
  'deep-partnership': [
    "Hey partner! What's on your heart today?",
    "There you are. I've got you.",
    "Hey. I'm so glad you're here.",
  ],
};

/** Relationship-aware comments Ferni can make during conversation */
const RELATIONSHIP_COMMENTS: Record<RelationshipStage, string[]> = {
  'first-meeting': [
    "I'm still learning about you, but I'm curious...",
    'Tell me more - I want to understand.',
    'This is helpful for me to know.',
  ],
  'getting-started': [
    'I remember you mentioned that before...',
    "You're starting to make sense to me.",
    "I'm getting a feel for how you think.",
  ],
  'building-trust': [
    "You know, I've noticed a pattern...",
    'Based on what I know about you...',
    "I think you're the kind of person who...",
  ],
  established: [
    'We both know what you really need here...',
    'You and I have talked about this before...',
    'I know you well enough to say...',
  ],
  'deep-partnership': [
    "After everything we've been through...",
    "You know I'll always be honest with you...",
    "We've come so far together...",
  ],
};

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'ferni_relationship';

function loadRelationshipData(): RelationshipData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as RelationshipData;
    }
  } catch (e) {
    log.warn('Failed to load relationship data:', e);
  }
  return null;
}

function saveRelationshipData(data: RelationshipData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    log.warn('Failed to save relationship data:', e);
  }
}

function createInitialData(): RelationshipData {
  const now = new Date().toISOString();
  return {
    stage: 'first-meeting',
    firstMeetingDate: now,
    metrics: {
      totalConversations: 0,
      daysSinceFirstMeeting: 0,
      currentStreak: 0,
      longestStreak: 0,
      milestonesReached: 0,
      insightsShared: 0,
      lastConversation: null,
    },
    memories: [],
    lastUpdated: now,
  };
}

/** Generate a unique ID for memories */
function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Calculate the current relationship stage based on metrics
 */
function calculateStage(metrics: EngagementMetrics): RelationshipStage {
  const stages: RelationshipStage[] = [
    'deep-partnership',
    'established',
    'building-trust',
    'getting-started',
    'first-meeting',
  ];

  for (const stage of stages) {
    const threshold = STAGE_THRESHOLDS[stage];
    if (
      metrics.totalConversations >= threshold.minConversations &&
      metrics.daysSinceFirstMeeting >= threshold.minDays &&
      (metrics.currentStreak >= threshold.minStreak || metrics.longestStreak >= threshold.minStreak)
    ) {
      return stage;
    }
  }

  return 'first-meeting';
}

/**
 * Get the current time period for contextual subtitles
 */
function getTimePeriod(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return 'early-morning';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late-night';
}

/**
 * Check if user is returning after absence
 */
function isComeback(lastConversation: number | null): boolean {
  if (!lastConversation) return false;
  const daysSince = (Date.now() - lastConversation) / (1000 * 60 * 60 * 24);
  return daysSince >= 3;
}

/**
 * Pick a random item from an array with deterministic daily selection
 * This ensures the subtitle stays consistent within a day
 */
function pickDailyRandom<T>(items: T[]): T {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  return items[dayOfYear % items.length];
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Features that unlock at certain relationship stages */
export const UNLOCKABLE_FEATURES: Record<string, RelationshipStage> = {
  // Getting Started (2+ conversations)
  'custom-rituals': 'getting-started',
  'relationship-progress': 'getting-started',
  'progress-analytics': 'getting-started',

  // Building Trust (7+ conversations, 3+ days, 2-day streak)
  'team-huddle': 'building-trust',
  'memory-browser': 'building-trust',
  'memory-timeline': 'building-trust',
  'wellbeing-dashboard': 'building-trust',
  'prediction-accuracy': 'building-trust',
  'group-coaching': 'building-trust',
  'video-sessions': 'building-trust',

  // Established (20+ conversations, 14+ days, 5-day streak)
  'deep-insights': 'established',
  'conversation-history': 'established',
};

class RelationshipStageService {
  private data: RelationshipData;
  private listeners: Set<(subtitle: string) => void> = new Set();
  private stageChangeListeners: Set<(event: StageChangeEvent) => void> = new Set();

  constructor() {
    const loaded = loadRelationshipData();
    if (loaded) {
      // Ensure memories array exists (migration for old data)
      if (!loaded.memories) {
        loaded.memories = [];
      }
      this.data = loaded;
      // Clean up duplicate memories (migration for bug fix)
      this.deduplicateMemories();
    } else {
      this.data = createInitialData();
    }
    this.updateDaysSinceFirstMeeting();
  }

  /**
   * Remove duplicate memories (migration for streak milestone bug)
   * Keeps the first occurrence of each type+title combination
   */
  private deduplicateMemories(): void {
    const seen = new Set<string>();
    const originalCount = this.data.memories.length;

    this.data.memories = this.data.memories.filter((memory) => {
      const key = `${memory.type}:${memory.title}`;
      if (seen.has(key)) {
        return false; // Skip duplicate
      }
      seen.add(key);
      return true;
    });

    if (this.data.memories.length !== originalCount) {
      log.info(`Cleaned up ${originalCount - this.data.memories.length} duplicate memories`);
      this.save();
    }
  }

  /**
   * Get the current relationship stage
   */
  getStage(): RelationshipStage {
    return this.data.stage;
  }

  /**
   * Get the current engagement metrics
   */
  getMetrics(): EngagementMetrics {
    return { ...this.data.metrics };
  }

  /**
   * Get the dynamic subtitle for Ferni
   * Considers: stage, time of day, streaks, special occasions
   */
  getSubtitle(): string {
    // Custom override takes precedence
    if (this.data.customSubtitle) {
      return this.data.customSubtitle;
    }

    const metrics = this.data.metrics;

    // Special cases first

    // Comeback after absence
    if (isComeback(metrics.lastConversation)) {
      return SPECIAL_SUBTITLES.comeback;
    }

    // Celebrating a streak (show at established+ stages)
    if (
      this.data.stage !== 'first-meeting' &&
      this.data.stage !== 'getting-started' &&
      metrics.currentStreak >= 3
    ) {
      // 30% chance to show streak celebration
      if (Math.random() < 0.3) {
        return SPECIAL_SUBTITLES.streakCelebration(metrics.currentStreak);
      }
    }

    // Time-based contextual (20% chance once established)
    if (this.data.stage === 'established' || this.data.stage === 'deep-partnership') {
      if (Math.random() < 0.2) {
        const period = getTimePeriod();
        const timeSubtitles = TIME_SUBTITLES[period];
        if (timeSubtitles && timeSubtitles.length > 0) {
          return pickDailyRandom(timeSubtitles);
        }
      }
    }

    // Default: stage-based subtitle
    const stageSubtitles = STAGE_SUBTITLES[this.data.stage];
    return pickDailyRandom(stageSubtitles);
  }

  /**
   * Record a conversation session
   * Call this when the user has a meaningful interaction
   * Returns stage change event if stage advanced
   */
  recordConversation(): StageChangeEvent | null {
    const now = Date.now();
    const nowIso = new Date().toISOString();
    const today = new Date().toDateString();
    const lastConvDate = this.data.metrics.lastConversation
      ? new Date(this.data.metrics.lastConversation).toDateString()
      : null;

    const previousStage = this.data.stage;
    const isFirstConversation = this.data.metrics.totalConversations === 0;
    const wasComeback = isComeback(this.data.metrics.lastConversation);

    // Update metrics
    this.data.metrics.totalConversations++;

    // Update streak
    if (lastConvDate === today) {
      // Same day, no streak change
    } else if (lastConvDate === new Date(now - 86400000).toDateString()) {
      // Consecutive day
      this.data.metrics.currentStreak++;
    } else if (lastConvDate === null) {
      // First conversation
      this.data.metrics.currentStreak = 1;
    } else {
      // Streak broken
      this.data.metrics.currentStreak = 1;
    }

    // Check for streak milestones (7, 14, 30, 60, 100 days)
    const streakMilestones = [7, 14, 30, 60, 100];
    if (streakMilestones.includes(this.data.metrics.currentStreak)) {
      this.addMemory({
        type: 'streak-milestone',
        title: `${this.data.metrics.currentStreak}-day streak!`,
        description: `You've connected with Ferni ${this.data.metrics.currentStreak} days in a row. That's dedication!`,
      });
    }

    // Update longest streak
    if (this.data.metrics.currentStreak > this.data.metrics.longestStreak) {
      this.data.metrics.longestStreak = this.data.metrics.currentStreak;
    }

    this.data.metrics.lastConversation = now;

    // Record first conversation memory
    if (isFirstConversation) {
      this.addMemory({
        type: 'first-conversation',
        title: 'Our first conversation',
        description: 'The beginning of our journey together.',
      });
    }

    // Record comeback memory
    if (wasComeback && !isFirstConversation) {
      this.addMemory({
        type: 'comeback',
        title: 'Welcome back!',
        description: 'You came back after some time away. That means a lot.',
      });
    }

    // Recalculate stage
    this.updateDaysSinceFirstMeeting();
    const newStage = calculateStage(this.data.metrics);

    let stageChangeEvent: StageChangeEvent | null = null;

    if (newStage !== previousStage) {
      log.info(`🎭 Relationship evolved: ${previousStage} → ${newStage}`);
      this.data.stage = newStage;

      // Create stage change event
      stageChangeEvent = {
        previousStage,
        newStage,
        timestamp: nowIso,
      };

      // Add memory for stage advancement
      const stageUpMsg = STAGE_UP_MESSAGES[newStage];
      this.addMemory({
        type: 'stage-up',
        title: stageUpMsg.title,
        description: stageUpMsg.message,
      });

      // Notify stage change listeners
      this.stageChangeListeners.forEach((listener) => listener(stageChangeEvent!));
    }

    this.save();
    this.notifyListeners();

    return stageChangeEvent;
  }

  /**
   * Add a memory to the relationship history
   * Prevents duplicates for streak-milestones and stage-ups by checking type+title
   */
  private addMemory(memory: Omit<RelationshipMemory, 'id' | 'timestamp' | 'stage'>): void {
    // Deduplicate: Don't add if same type+title already exists
    // This prevents duplicate streak milestones and stage-up messages
    const isDuplicate = this.data.memories.some(
      (m) => m.type === memory.type && m.title === memory.title
    );
    if (isDuplicate) {
      log.debug('Skipping duplicate memory:', memory.title);
      return;
    }

    this.data.memories.push({
      ...memory,
      id: generateMemoryId(),
      timestamp: new Date().toISOString(),
      stage: this.data.stage,
    });

    // Keep only last 50 memories
    if (this.data.memories.length > 50) {
      this.data.memories = this.data.memories.slice(-50);
    }
  }

  /**
   * Record a milestone achievement
   */
  recordMilestone(): void {
    this.data.metrics.milestonesReached++;
    this.save();
    this.notifyListeners();
  }

  /**
   * Record an insight shared
   */
  recordInsight(): void {
    this.data.metrics.insightsShared++;
    this.save();
  }

  /**
   * Set a custom subtitle (user override)
   */
  setCustomSubtitle(subtitle: string | null): void {
    this.data.customSubtitle = subtitle || undefined;
    this.save();
    this.notifyListeners();
  }

  /**
   * Subscribe to subtitle changes
   */
  onSubtitleChange(listener: (subtitle: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to stage changes (for celebrations!)
   */
  onStageChange(listener: (event: StageChangeEvent) => void): () => void {
    this.stageChangeListeners.add(listener);
    return () => this.stageChangeListeners.delete(listener);
  }

  /**
   * Get a description of the current stage
   */
  getStageDescription(): string {
    const descriptions: Record<RelationshipStage, string> = {
      'first-meeting': "We're just meeting! I can't wait to learn about you.",
      'getting-started': "We're starting to understand each other.",
      'building-trust': 'Our relationship is growing stronger.',
      established: "You can count on me. I'm here for the long haul.",
      'deep-partnership': "We've been through a lot together. I'm honored to be your guide.",
    };
    return descriptions[this.data.stage];
  }

  /**
   * Get the human-readable name of the current stage
   */
  getStageName(): string {
    return STAGE_NAMES[this.data.stage];
  }

  /**
   * Get stage-up celebration message for a stage
   */
  getStageUpMessage(stage: RelationshipStage): { title: string; message: string } {
    return STAGE_UP_MESSAGES[stage];
  }

  /**
   * Get a greeting appropriate for the relationship stage
   */
  getGreeting(): string {
    const greetings = STAGE_GREETINGS[this.data.stage];
    return pickDailyRandom(greetings);
  }

  /**
   * Get a relationship-aware comment for Ferni to use
   */
  getRelationshipComment(): string {
    const comments = RELATIONSHIP_COMMENTS[this.data.stage];
    return comments[Math.floor(Math.random() * comments.length)];
  }

  /**
   * Check if a feature is unlocked at the current stage
   */
  isFeatureUnlocked(featureId: string): boolean {
    const requiredStage = UNLOCKABLE_FEATURES[featureId];
    if (!requiredStage) return true; // Unknown features are unlocked by default

    const stageOrder: RelationshipStage[] = [
      'first-meeting',
      'getting-started',
      'building-trust',
      'established',
      'deep-partnership',
    ];

    const currentIndex = stageOrder.indexOf(this.data.stage);
    const requiredIndex = stageOrder.indexOf(requiredStage);

    return currentIndex >= requiredIndex;
  }

  /**
   * Get unlock progress for a specific feature
   * Returns progress info and friendly hint text
   */
  getFeatureUnlockProgress(featureId: string): {
    isUnlocked: boolean;
    requiredStage: RelationshipStage | null;
    progress: number;
    hint: string;
  } {
    const requiredStage = UNLOCKABLE_FEATURES[featureId];
    if (!requiredStage) {
      return { isUnlocked: true, requiredStage: null, progress: 1, hint: '' };
    }

    if (this.isFeatureUnlocked(featureId)) {
      return { isUnlocked: true, requiredStage, progress: 1, hint: '' };
    }

    const threshold = STAGE_THRESHOLDS[requiredStage];
    const metrics = this.data.metrics;

    // Calculate progress towards the required stage
    const convProgress = Math.min(1, metrics.totalConversations / threshold.minConversations);
    const daysProgress = Math.min(1, metrics.daysSinceFirstMeeting / threshold.minDays);
    const streakProgress = Math.min(
      1,
      Math.max(metrics.currentStreak, metrics.longestStreak) / threshold.minStreak
    );
    const progress = (convProgress + daysProgress + streakProgress) / 3;

    // Generate friendly hint
    let hint = '';
    if (metrics.totalConversations < threshold.minConversations) {
      const remaining = threshold.minConversations - metrics.totalConversations;
      hint = remaining === 1 ? '1 more chat' : `${remaining} more chats`;
    } else if (metrics.daysSinceFirstMeeting < threshold.minDays) {
      const remaining = threshold.minDays - metrics.daysSinceFirstMeeting;
      hint = remaining === 1 ? '1 more day' : `${remaining} more days`;
    } else {
      hint = STAGE_UNLOCK_MESSAGES[requiredStage];
    }

    return { isUnlocked: false, requiredStage, progress, hint };
  }

  /**
   * Get all relationship memories
   */
  getMemories(): RelationshipMemory[] {
    return [...this.data.memories].reverse(); // Most recent first
  }

  /**
   * Get the first meeting date
   */
  getFirstMeetingDate(): Date {
    return new Date(this.data.firstMeetingDate);
  }

  /**
   * Get days since first meeting (relationship age)
   */
  getRelationshipAge(): number {
    return this.data.metrics.daysSinceFirstMeeting;
  }

  /**
   * Get progress to next stage
   */
  getProgressToNextStage(): {
    nextStage: RelationshipStage | null;
    progress: number;
    requirement: string;
  } {
    const stageOrder: RelationshipStage[] = [
      'first-meeting',
      'getting-started',
      'building-trust',
      'established',
      'deep-partnership',
    ];

    const currentIndex = stageOrder.indexOf(this.data.stage);
    if (currentIndex >= stageOrder.length - 1) {
      return { nextStage: null, progress: 1, requirement: "You've reached the deepest level!" };
    }

    const nextStage = stageOrder[currentIndex + 1];
    const threshold = STAGE_THRESHOLDS[nextStage];
    const metrics = this.data.metrics;

    // Calculate progress as average of all requirements
    const convProgress = Math.min(1, metrics.totalConversations / threshold.minConversations);
    const daysProgress = Math.min(1, metrics.daysSinceFirstMeeting / threshold.minDays);
    const streakProgress = Math.min(
      1,
      Math.max(metrics.currentStreak, metrics.longestStreak) / threshold.minStreak
    );

    const progress = (convProgress + daysProgress + streakProgress) / 3;

    const remaining: string[] = [];
    if (metrics.totalConversations < threshold.minConversations) {
      remaining.push(
        `${threshold.minConversations - metrics.totalConversations} more conversations`
      );
    }
    if (metrics.daysSinceFirstMeeting < threshold.minDays) {
      remaining.push(`${threshold.minDays - metrics.daysSinceFirstMeeting} more days together`);
    }
    if (Math.max(metrics.currentStreak, metrics.longestStreak) < threshold.minStreak) {
      remaining.push(`a ${threshold.minStreak}-day streak`);
    }

    return {
      nextStage,
      progress,
      requirement: remaining.length > 0 ? `Need: ${remaining.join(', ')}` : 'Almost there!',
    };
  }

  /**
   * Reset to first meeting (mainly for testing)
   */
  reset(): void {
    this.data = createInitialData();
    this.save();
    this.notifyListeners();
  }

  private updateDaysSinceFirstMeeting(): void {
    const firstMeeting = new Date(this.data.firstMeetingDate).getTime();
    const now = Date.now();
    this.data.metrics.daysSinceFirstMeeting = Math.floor(
      (now - firstMeeting) / (1000 * 60 * 60 * 24)
    );
  }

  private save(): void {
    this.data.lastUpdated = new Date().toISOString();
    saveRelationshipData(this.data);
    // Sync to backend (fire and forget)
    void this.syncToBackend();
  }

  private notifyListeners(): void {
    const subtitle = this.getSubtitle();
    this.listeners.forEach((listener) => listener(subtitle));
  }

  /**
   * Sync relationship data to backend for persistence across devices
   */
  private async syncToBackend(): Promise<void> {
    const userId = localStorage.getItem('ferni_user_id');
    if (!userId) return;

    try {
      await apiPost('/api/relationship/progress', {
        userId,
        stage: this.data.stage,
        metrics: this.data.metrics,
        firstMeetingDate: this.data.firstMeetingDate,
        memoriesCount: this.data.memories.length,
      });
      log.debug('Relationship data synced to backend');
    } catch {
      // Silent fail - localStorage is the primary store
      log.debug('Backend sync failed (non-critical)');
    }
  }

  /**
   * Load relationship data from backend (for cross-device sync)
   */
  async loadFromBackend(): Promise<boolean> {
    const userId = localStorage.getItem('ferni_user_id');
    if (!userId) return false;

    try {
      const response = await apiGet(`/api/relationship/progress?userId=${userId}`);
      if (!response.ok) return false;

      const backendData = await response.json();

      // Only use backend data if it's newer than local
      const backendDate = new Date(backendData.lastUpdated || 0).getTime();
      const localDate = new Date(this.data.lastUpdated).getTime();

      if (backendDate > localDate) {
        // Validate stage is a valid RelationshipStage before using
        const validStages: RelationshipStage[] = [
          'first-meeting',
          'getting-started',
          'building-trust',
          'established',
          'deep-partnership',
        ];

        if (backendData.stage && validStages.includes(backendData.stage)) {
          this.data.stage = backendData.stage;
        }

        // Merge metrics if provided
        if (backendData.metrics) {
          this.data.metrics = { ...this.data.metrics, ...backendData.metrics };
        }

        if (backendData.firstMeetingDate) {
          this.data.firstMeetingDate = backendData.firstMeetingDate;
        }

        this.data.lastUpdated = backendData.lastUpdated;
        saveRelationshipData(this.data);
        log.info('Loaded newer relationship data from backend', {
          stage: this.data.stage,
          conversations: this.data.metrics.totalConversations,
        });
        return true;
      }
    } catch {
      log.debug('Backend load failed (non-critical)');
    }
    return false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const relationshipStageService = new RelationshipStageService();

// Export individual functions for convenience
export const getFerniSubtitle = () => relationshipStageService.getSubtitle();
export const getRelationshipStage = () => relationshipStageService.getStage();
export const getFerniGreeting = () => relationshipStageService.getGreeting();
export const getRelationshipComment = () => relationshipStageService.getRelationshipComment();
export const isFeatureUnlocked = (id: string) => relationshipStageService.isFeatureUnlocked(id);
export const getRelationshipMemories = () => relationshipStageService.getMemories();
export const getFeatureUnlockProgress = (id: string) =>
  relationshipStageService.getFeatureUnlockProgress(id);

// ============================================================================
// EVENT-DRIVEN CONVERSATION TRACKING
// Single source of truth - listens to ferni:conversation-start
// ============================================================================

let isEventListenerSetup = false;

/**
 * Set up event listeners for automatic conversation tracking.
 * This is the single source of truth - all conversation tracking flows through here.
 */
function setupEventListeners(): void {
  if (isEventListenerSetup) return;
  isEventListenerSetup = true;

  // Listen to conversation start event (the canonical event)
  window.addEventListener('ferni:conversation-start', () => {
    const stageChange = relationshipStageService.recordConversation();

    // Dispatch stage change event if stage advanced
    if (stageChange) {
      log.info('Relationship stage advanced!', {
        from: stageChange.previousStage,
        to: stageChange.newStage,
      });

      window.dispatchEvent(
        new CustomEvent('ferni:stage-change', {
          detail: stageChange,
        })
      );
    }
  });

  log.debug('Relationship service event listeners initialized');
}

/**
 * Initialize relationship service and try to sync from backend
 */
export async function initRelationshipSync(): Promise<void> {
  setupEventListeners();
  await relationshipStageService.loadFromBackend();
}
