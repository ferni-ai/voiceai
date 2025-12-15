/**
 * Roadmap Service
 *
 * Manages feature roadmap data for "What's Growing" experience.
 * Transforms incomplete features into inspiring promises that align with Ferni's brand.
 *
 * Philosophy: "Every great relationship has seasons. These are seeds we're planting together."
 */

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
  /** Number of interested users (social proof) */
  interestCount?: number;
  /** Icon key from ICONS map */
  icon: string;
  /** Category for grouping */
  category: 'connect' | 'personalize' | 'platform';
}

export interface RoadmapVote {
  featureId: string;
  userId: string;
  timestamp: Date;
}

// ============================================================================
// STAGE METADATA
// ============================================================================

export const STAGE_INFO: Record<
  RoadmapStage,
  {
    emoji: string;
    label: string;
    description: string;
    color: string;
  }
> = {
  seed: {
    emoji: '🌱',
    label: 'Planted',
    description: 'This idea is taking root',
    color: 'var(--color-text-muted)',
  },
  sprout: {
    emoji: '🌿',
    label: 'Growing',
    description: "We're actively building this",
    color: 'var(--persona-primary)',
  },
  bud: {
    emoji: '🌸',
    label: 'Budding',
    description: 'Almost ready to bloom',
    color: 'var(--color-warning)',
  },
  bloom: {
    emoji: '🌺',
    label: 'Blooming Soon',
    description: 'Launching very soon',
    color: 'var(--color-success)',
  },
};

// ============================================================================
// ROADMAP FEATURES
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
    interestCount: 2847,
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
    interestCount: 3215,
    icon: 'video',
    category: 'connect',
  },

  // -------------------------------------------------------------------------
  // PERSONALIZE CATEGORY
  // -------------------------------------------------------------------------
  {
    id: 'wearable-settings',
    headline: 'We notice what you cannot.',
    description:
      'Your body tells stories your words do not. By connecting your wearables, Ferni understands your rhythms - when you are depleted, when you are ready to push, when rest is the bravest choice.',
    stage: 'sprout',
    superhuman: [
      'Pattern recognition - We see trends you would miss',
      'Rest advocacy - We will tell you when to stop',
      'Holistic view - Mind + body in one conversation',
      'Sleep understanding - Your nights inform your days',
    ],
    existing: ['Apple Health connection', 'Basic metrics awareness'],
    estimatedArrival: 'Q1 2025',
    canVote: true,
    interestCount: 1893,
    icon: 'watch',
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
    interestCount: 1456,
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
    interestCount: 2134,
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
    interestCount: 1678,
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
    interestCount: 987,
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
    interestCount: 523,
    icon: 'commands',
    category: 'platform',
  },
];

// ============================================================================
// SERVICE CLASS
// ============================================================================

class RoadmapService {
  private votedFeatures: Set<string>;
  private readonly STORAGE_KEY = 'ferni_roadmap_votes';

  constructor() {
    this.votedFeatures = this.loadVotes();
  }

  /**
   * Get all roadmap features
   */
  getAllFeatures(): RoadmapFeature[] {
    return ROADMAP_FEATURES;
  }

  /**
   * Get a specific feature by ID
   */
  getFeature(id: string): RoadmapFeature | undefined {
    return ROADMAP_FEATURES.find((f) => f.id === id);
  }

  /**
   * Check if an ID is a roadmap feature (not yet implemented)
   */
  isRoadmapFeature(id: string): boolean {
    return ROADMAP_FEATURES.some((f) => f.id === id);
  }

  /**
   * Get features by category
   */
  getFeaturesByCategory(category: RoadmapFeature['category']): RoadmapFeature[] {
    return ROADMAP_FEATURES.filter((f) => f.category === category);
  }

  /**
   * Get features by stage
   */
  getFeaturesByStage(stage: RoadmapStage): RoadmapFeature[] {
    return ROADMAP_FEATURES.filter((f) => f.stage === stage);
  }

  /**
   * Check if user has voted for a feature
   */
  hasVoted(featureId: string): boolean {
    return this.votedFeatures.has(featureId);
  }

  /**
   * Vote for a feature (express interest)
   */
  async vote(featureId: string): Promise<boolean> {
    if (this.votedFeatures.has(featureId)) {
      return false; // Already voted
    }

    this.votedFeatures.add(featureId);
    this.saveVotes();

    // TODO: Send vote to backend for aggregation
    // await apiPost('/api/roadmap/vote', { featureId });

    return true;
  }

  /**
   * Remove vote for a feature
   */
  async unvote(featureId: string): Promise<boolean> {
    if (!this.votedFeatures.has(featureId)) {
      return false;
    }

    this.votedFeatures.delete(featureId);
    this.saveVotes();

    // TODO: Send unvote to backend
    // await apiPost('/api/roadmap/unvote', { featureId });

    return true;
  }

  /**
   * Get count of user's votes
   */
  getVoteCount(): number {
    return this.votedFeatures.size;
  }

  /**
   * Load votes from localStorage
   */
  private loadVotes(): Set<string> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }

  /**
   * Save votes to localStorage
   */
  private saveVotes(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(this.votedFeatures)));
    } catch {
      // Ignore storage errors
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const roadmapService = new RoadmapService();
