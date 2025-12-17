/**
 * 💎 Premium Content Service
 *
 * Premium features for Partner tier subscribers:
 * - Exclusive curated content
 * - Advanced ML-powered recommendations
 * - Priority content access
 * - Deep personalization
 *
 * Premium Tiers:
 * - Free: Basic content, 5 convos/month
 * - Friend ($9.99): Unlimited, all core team
 * - Partner ($19.99): Everything + premium content + priority
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type PremiumTier = 'free' | 'friend' | 'partner';

export interface PremiumFeature {
  id: string;
  name: string;
  description: string;
  requiredTier: PremiumTier;
  icon: string;
}

export interface PremiumContent {
  id: string;
  type: 'video' | 'podcast' | 'guide' | 'course';
  title: string;
  description: string;
  requiredTier: PremiumTier;
  durationMinutes?: number;
  topics: string[];
  isExclusive: boolean;
  createdAt: Date;
}

export interface PersonalizedRecommendation {
  content: PremiumContent;
  reason: string;
  matchScore: number; // 0-1
  personalizedFor: string[]; // What aspects of user profile this matches
  priority: 'high' | 'medium' | 'low';
}

export interface UserPreferences {
  userId: string;
  favoriteTopics: string[];
  learningStyle: 'visual' | 'audio' | 'reading' | 'hands-on';
  preferredDuration: 'short' | 'medium' | 'long';
  engagementHistory: EngagementRecord[];
  mood: string;
  goals: string[];
}

export interface EngagementRecord {
  contentId: string;
  contentType: string;
  watchedPercentage: number;
  rating?: number; // 1-5
  timestamp: Date;
}

// ============================================================================
// PREMIUM FEATURES
// ============================================================================

export const PREMIUM_FEATURES: PremiumFeature[] = [
  // Partner-only features
  {
    id: 'advanced-recommendations',
    name: 'AI-Powered Recommendations',
    description: 'Deep learning recommendations based on your engagement patterns',
    requiredTier: 'partner',
    icon: '🧠',
  },
  {
    id: 'exclusive-content',
    name: 'Exclusive Content Library',
    description: 'Access to premium courses, guides, and early releases',
    requiredTier: 'partner',
    icon: '💎',
  },
  {
    id: 'priority-access',
    name: 'Priority Content Access',
    description: 'Get new content 7 days before others',
    requiredTier: 'partner',
    icon: '🚀',
  },
  {
    id: 'deep-personalization',
    name: 'Deep Personalization',
    description: 'Ferni learns your preferences at a deeper level',
    requiredTier: 'partner',
    icon: '🎯',
  },
  {
    id: 'our-song',
    name: 'Our Song Feature',
    description: 'Build a relationship soundtrack with Ferni',
    requiredTier: 'partner',
    icon: '🎵',
  },
  {
    id: 'nayan-access',
    name: 'Nayan the Wisdom Keeper',
    description: 'Access to our philosophy and wisdom specialist',
    requiredTier: 'partner',
    icon: '🦉',
  },

  // Friend tier features
  {
    id: 'unlimited-conversations',
    name: 'Unlimited Conversations',
    description: 'No monthly conversation limits',
    requiredTier: 'friend',
    icon: '♾️',
  },
  {
    id: 'full-team-access',
    name: 'Full Team Access',
    description: 'Access to all core team members',
    requiredTier: 'friend',
    icon: '👥',
  },
  {
    id: 'extended-memory',
    name: 'Extended Memory',
    description: 'Ferni remembers more of your journey',
    requiredTier: 'friend',
    icon: '🧠',
  },
];

// ============================================================================
// PREMIUM CONTENT DATABASE
// ============================================================================

const PREMIUM_CONTENT: PremiumContent[] = [
  // Partner-exclusive courses
  {
    id: 'course-emotional-mastery',
    type: 'course',
    title: 'Emotional Mastery: A 7-Day Journey',
    description:
      'A deep dive into understanding and managing your emotions with daily exercises and reflections.',
    requiredTier: 'partner',
    durationMinutes: 420,
    topics: ['emotional-intelligence', 'self-awareness', 'mindfulness'],
    isExclusive: true,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'course-habit-architect',
    type: 'course',
    title: 'The Habit Architect: Build Systems That Last',
    description:
      'Learn the science of habit formation and design a personalized system for lasting change.',
    requiredTier: 'partner',
    durationMinutes: 300,
    topics: ['habits', 'behavior-change', 'productivity', 'systems'],
    isExclusive: true,
    createdAt: new Date('2024-02-01'),
  },
  {
    id: 'course-relationship-deep-dive',
    type: 'course',
    title: 'Relationships Unlocked: Understanding Attachment',
    description:
      'Explore attachment theory and learn how to build healthier connections in all areas of life.',
    requiredTier: 'partner',
    durationMinutes: 360,
    topics: ['relationships', 'attachment', 'psychology', 'communication'],
    isExclusive: true,
    createdAt: new Date('2024-03-01'),
  },

  // Partner-exclusive guides
  {
    id: 'guide-morning-ritual',
    type: 'guide',
    title: 'The Ultimate Morning Ritual Guide',
    description: 'Design a personalized morning routine based on your chronotype and goals.',
    requiredTier: 'partner',
    durationMinutes: 30,
    topics: ['morning-routine', 'productivity', 'habits'],
    isExclusive: true,
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'guide-difficult-conversations',
    type: 'guide',
    title: 'Navigating Difficult Conversations',
    description: 'Frameworks and scripts for handling challenging discussions with grace.',
    requiredTier: 'partner',
    durationMinutes: 25,
    topics: ['communication', 'relationships', 'conflict-resolution'],
    isExclusive: true,
    createdAt: new Date('2024-02-15'),
  },
  {
    id: 'guide-decision-making',
    type: 'guide',
    title: 'The Decision Matrix: Choose Wisely',
    description: 'A step-by-step framework for making better decisions in life and work.',
    requiredTier: 'partner',
    durationMinutes: 20,
    topics: ['decision-making', 'productivity', 'psychology'],
    isExclusive: true,
    createdAt: new Date('2024-03-15'),
  },

  // Partner-exclusive videos
  {
    id: 'video-ferni-philosophy',
    type: 'video',
    title: 'The Philosophy of Ferni: Making AI Human',
    description: 'An exclusive look at the principles that guide Ferni and our approach to AI.',
    requiredTier: 'partner',
    durationMinutes: 15,
    topics: ['ferni', 'philosophy', 'ai', 'humanity'],
    isExclusive: true,
    createdAt: new Date('2024-01-10'),
  },
  {
    id: 'video-founder-story',
    type: 'video',
    title: "Founder's Story: Why We Built Ferni",
    description: 'The personal journey that led to creating Ferni and what drives us.',
    requiredTier: 'partner',
    durationMinutes: 20,
    topics: ['ferni', 'entrepreneurship', 'mission'],
    isExclusive: true,
    createdAt: new Date('2024-02-10'),
  },

  // Friend tier content
  {
    id: 'guide-stress-toolkit',
    type: 'guide',
    title: 'Quick Stress Relief Toolkit',
    description: '10 evidence-based techniques you can use in under 5 minutes.',
    requiredTier: 'friend',
    durationMinutes: 15,
    topics: ['stress', 'mental-health', 'wellness'],
    isExclusive: false,
    createdAt: new Date('2024-01-20'),
  },
  {
    id: 'guide-sleep-optimization',
    type: 'guide',
    title: 'Sleep Optimization Checklist',
    description: 'A practical guide to improving your sleep quality tonight.',
    requiredTier: 'friend',
    durationMinutes: 10,
    topics: ['sleep', 'health', 'wellness'],
    isExclusive: false,
    createdAt: new Date('2024-02-20'),
  },
];

// ============================================================================
// STORAGE
// ============================================================================

const userPreferencesStore = new Map<string, UserPreferences>();

// ============================================================================
// FEATURE ACCESS
// ============================================================================

/**
 * Check if user has access to a premium feature
 */
export function hasFeatureAccess(userTier: PremiumTier, featureId: string): boolean {
  const feature = PREMIUM_FEATURES.find((f) => f.id === featureId);
  if (!feature) return false;

  const tierHierarchy: Record<PremiumTier, number> = {
    free: 0,
    friend: 1,
    partner: 2,
  };

  return tierHierarchy[userTier] >= tierHierarchy[feature.requiredTier];
}

/**
 * Get available features for a user's tier
 */
export function getAvailableFeatures(userTier: PremiumTier): PremiumFeature[] {
  return PREMIUM_FEATURES.filter((f) => hasFeatureAccess(userTier, f.id));
}

/**
 * Get locked features for upsell
 */
export function getLockedFeatures(userTier: PremiumTier): PremiumFeature[] {
  return PREMIUM_FEATURES.filter((f) => !hasFeatureAccess(userTier, f.id));
}

// ============================================================================
// CONTENT ACCESS
// ============================================================================

/**
 * Get available premium content for a user
 */
export function getAvailableContent(userTier: PremiumTier): PremiumContent[] {
  const tierHierarchy: Record<PremiumTier, number> = {
    free: 0,
    friend: 1,
    partner: 2,
  };

  return PREMIUM_CONTENT.filter(
    (c) => tierHierarchy[userTier] >= tierHierarchy[c.requiredTier]
  );
}

/**
 * Get exclusive content preview (for upsell)
 */
export function getExclusiveContentPreview(): Array<{
  content: PremiumContent;
  unlocksWith: PremiumTier;
}> {
  return PREMIUM_CONTENT.filter((c) => c.isExclusive).map((content) => ({
    content,
    unlocksWith: content.requiredTier,
  }));
}

// ============================================================================
// PERSONALIZED RECOMMENDATIONS
// ============================================================================

/**
 * Get personalized recommendations based on user preferences
 */
export function getPersonalizedRecommendations(
  userId: string,
  userTier: PremiumTier,
  options?: {
    limit?: number;
    contentType?: 'video' | 'podcast' | 'guide' | 'course';
    topic?: string;
  }
): PersonalizedRecommendation[] {
  const preferences = userPreferencesStore.get(userId);
  const availableContent = getAvailableContent(userTier);

  let filteredContent = availableContent;

  // Filter by content type if specified
  if (options?.contentType) {
    filteredContent = filteredContent.filter((c) => c.type === options.contentType);
  }

  // Filter by topic if specified
  if (options?.topic) {
    const topicLower = options.topic.toLowerCase();
    filteredContent = filteredContent.filter((c) =>
      c.topics.some((t) => t.toLowerCase().includes(topicLower))
    );
  }

  // Score and rank content
  const recommendations: PersonalizedRecommendation[] = filteredContent.map((content) => {
    const { score, reasons, priority } = calculateMatchScore(content, preferences);
    const reason = generateRecommendationReason(content, reasons, preferences);

    return {
      content,
      reason,
      matchScore: score,
      personalizedFor: reasons,
      priority,
    };
  });

  // Sort by match score
  recommendations.sort((a, b) => b.matchScore - a.matchScore);

  return recommendations.slice(0, options?.limit || 10);
}

/**
 * Update user preferences based on engagement
 */
export function updateUserPreferences(
  userId: string,
  update: Partial<UserPreferences>
): UserPreferences {
  const existing = userPreferencesStore.get(userId) || createDefaultPreferences(userId);

  const updated: UserPreferences = {
    ...existing,
    ...update,
    userId,
    engagementHistory: [
      ...(existing.engagementHistory || []),
      ...(update.engagementHistory || []),
    ].slice(-100), // Keep last 100
  };

  userPreferencesStore.set(userId, updated);
  log.debug({ userId }, '💎 User preferences updated');

  return updated;
}

/**
 * Record content engagement
 */
export function recordContentEngagement(
  userId: string,
  contentId: string,
  contentType: string,
  watchedPercentage: number,
  rating?: number
): void {
  const record: EngagementRecord = {
    contentId,
    contentType,
    watchedPercentage,
    rating,
    timestamp: new Date(),
  };

  updateUserPreferences(userId, {
    engagementHistory: [record],
  });

  // Update favorite topics based on high engagement
  if (watchedPercentage > 0.8 || (rating && rating >= 4)) {
    const content = PREMIUM_CONTENT.find((c) => c.id === contentId);
    if (content) {
      const prefs = userPreferencesStore.get(userId);
      if (prefs) {
        const newTopics = [...new Set([...prefs.favoriteTopics, ...content.topics])];
        updateUserPreferences(userId, { favoriteTopics: newTopics.slice(0, 20) });
      }
    }
  }

  log.debug({ userId, contentId, watchedPercentage }, '💎 Content engagement recorded');
}

/**
 * Get user preferences
 */
export function getUserPreferences(userId: string): UserPreferences {
  return userPreferencesStore.get(userId) || createDefaultPreferences(userId);
}

// ============================================================================
// HELPERS
// ============================================================================

function createDefaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    favoriteTopics: [],
    learningStyle: 'visual',
    preferredDuration: 'medium',
    engagementHistory: [],
    mood: 'curious',
    goals: [],
  };
}

function calculateMatchScore(
  content: PremiumContent,
  preferences?: UserPreferences
): { score: number; reasons: string[]; priority: 'high' | 'medium' | 'low' } {
  if (!preferences) {
    return { score: 0.5, reasons: ['General recommendation'], priority: 'medium' };
  }

  let score = 0.3; // Base score
  const reasons: string[] = [];

  // Topic match
  const topicMatches = content.topics.filter((t) =>
    preferences.favoriteTopics.some((ft) => ft.toLowerCase().includes(t.toLowerCase()))
  );
  if (topicMatches.length > 0) {
    score += 0.3 * Math.min(topicMatches.length / 2, 1);
    reasons.push(`Matches your interests: ${topicMatches.join(', ')}`);
  }

  // Duration match
  const durationMins = content.durationMinutes || 30;
  const durationPrefs: Record<string, [number, number]> = {
    short: [0, 20],
    medium: [20, 45],
    long: [45, 999],
  };
  const [min, max] = durationPrefs[preferences.preferredDuration];
  if (durationMins >= min && durationMins <= max) {
    score += 0.15;
    reasons.push(`Right length for you (${durationMins} min)`);
  }

  // Content type match based on learning style
  const styleToType: Record<string, string[]> = {
    visual: ['video', 'course'],
    audio: ['podcast'],
    reading: ['guide'],
    'hands-on': ['course', 'guide'],
  };
  if (styleToType[preferences.learningStyle]?.includes(content.type)) {
    score += 0.15;
    reasons.push(`Matches your ${preferences.learningStyle} learning style`);
  }

  // Engagement history boost (similar content was enjoyed)
  const similarEngagement = preferences.engagementHistory.find(
    (e) =>
      e.contentType === content.type &&
      (e.watchedPercentage > 0.7 || (e.rating && e.rating >= 4))
  );
  if (similarEngagement) {
    score += 0.1;
    reasons.push(`You enjoyed similar content`);
  }

  // Priority calculation
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (score >= 0.7) priority = 'high';
  else if (score < 0.4) priority = 'low';

  return { score: Math.min(score, 1), reasons, priority };
}

function generateRecommendationReason(
  content: PremiumContent,
  reasons: string[],
  preferences?: UserPreferences
): string {
  if (reasons.length === 0) {
    return `"${content.title}" - A ${content.type} that might interest you`;
  }

  if (reasons.some((r) => r.includes('interests'))) {
    return `Based on your interest in ${preferences?.favoriteTopics[0] || 'similar topics'}`;
  }

  if (reasons.some((r) => r.includes('learning style'))) {
    return `Perfect for your ${preferences?.learningStyle || 'visual'} learning style`;
  }

  return reasons[0];
}

// Note: All exports are done inline with their declarations
