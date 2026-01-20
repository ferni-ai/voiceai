import { cleanForFirestore } from '../../../utils/firestore-utils.js';
/**
 * Context Builder Categories
 *
 * Organizes the 70+ context builders into logical categories
 * for better discoverability, debugging, and documentation.
 *
 * @module intelligence/context-builders/categories
 */

// ============================================================================
// CATEGORY ENUM
// ============================================================================

/**
 * Categories for context builders
 *
 * Used to group related builders and enable category-based filtering.
 */
export enum BuilderCategory {
  /**
   * SAFETY - Crisis detection, wellbeing alerts
   * Priority: Runs first, can override everything
   */
  SAFETY = 'safety',

  /**
   * EMOTIONAL - Emotion detection, validation, support
   * Priority: High - informs tone and approach
   */
  EMOTIONAL = 'emotional',

  /**
   * VOICE - Voice emotion, prosody, speech adaptation
   * Priority: High - "better than human" listening
   */
  VOICE = 'voice',

  /**
   * MEMORY - Cross-session memory, context recall
   * Priority: High - personalization foundation
   */
  MEMORY = 'memory',

  /**
   * PERSONA - Persona identity, quirks, vulnerability
   * Priority: Medium - character consistency
   */
  PERSONA = 'persona',

  /**
   * COACHING - Life coaching, goals, growth
   * Priority: Medium - domain-specific guidance
   */
  COACHING = 'coaching',

  /**
   * COGNITIVE - Cognitive style, distortions, frameworks
   * Priority: Medium - "better than PhD" capabilities
   */
  COGNITIVE = 'cognitive',

  /**
   * ENGAGEMENT - Engagement patterns, rituals, games
   * Priority: Medium - relationship building
   */
  ENGAGEMENT = 'engagement',

  /**
   * TEAM - Team dynamics, handoffs, availability
   * Priority: Medium - multi-persona coordination
   */
  TEAM = 'team',

  /**
   * CONTEXT - Situational awareness, topics, intent
   * Priority: Medium - conversation flow
   */
  CONTEXT = 'context',

  /**
   * EXTERNAL - Biometrics, calendar, weather, finance
   * Priority: Low - external data integration
   */
  EXTERNAL = 'external',

  /**
   * HUMANIZING - Natural uncertainty, response length, personality
   * Priority: Low - polish and naturalness
   */
  HUMANIZING = 'humanizing',

  /**
   * LEARNING - Community learning, wisdom synthesis
   * Priority: Low - collective intelligence
   */
  LEARNING = 'learning',
}

// ============================================================================
// BUILDER → CATEGORY MAPPING
// ============================================================================

/**
 * Maps builder names to their categories
 *
 * This is the canonical mapping. If a builder is not listed here,
 * it defaults to CONTEXT category.
 */
export const BUILDER_CATEGORIES: Record<string, BuilderCategory> = {
  // SAFETY
  crisis: BuilderCategory.SAFETY,
  'wellbeing-context': BuilderCategory.SAFETY,
  'principal-alignment': BuilderCategory.SAFETY, // Added Dec 2024

  // EMOTIONAL
  emotional: BuilderCategory.EMOTIONAL,
  celebration: BuilderCategory.EMOTIONAL,
  'celebration-growth': BuilderCategory.EMOTIONAL,
  'somatic-context': BuilderCategory.EMOTIONAL,

  // VOICE
  'voice-emotion': BuilderCategory.VOICE,
  'advanced-voice-emotion': BuilderCategory.VOICE,
  'voice-emotion-intelligence': BuilderCategory.VOICE,
  'human-listening': BuilderCategory.VOICE,
  'voice-mismatch-critical': BuilderCategory.VOICE,
  'dynamic-speech-guidance': BuilderCategory.VOICE, // Real-time speech adaptation

  // MEMORY
  memory: BuilderCategory.MEMORY,
  'advanced-memory': BuilderCategory.MEMORY,
  'proactive-memory': BuilderCategory.MEMORY,
  'persona-memory': BuilderCategory.MEMORY,
  'conversation-recap': BuilderCategory.MEMORY,
  'cross-session-reflection': BuilderCategory.MEMORY,
  'cross-session-threading': BuilderCategory.MEMORY,
  'unified-memory-orchestrator': BuilderCategory.MEMORY,
  'knowledge-graph': BuilderCategory.MEMORY, // Unified entity knowledge graph
  'thinking-of-you': BuilderCategory.MEMORY,
  'commitment-follow-up': BuilderCategory.MEMORY, // Track and surface commitments
  'proactive-noticing': BuilderCategory.MEMORY, // Surface noticed patterns

  // PERSONA
  'persona-identity': BuilderCategory.PERSONA,
  'persona-quirks': BuilderCategory.PERSONA,
  'persona-playful': BuilderCategory.PERSONA,
  'persona-vulnerability': BuilderCategory.PERSONA,
  'persona-mood': BuilderCategory.PERSONA,
  'alive-awareness': BuilderCategory.PERSONA,
  'inner-world-injector': BuilderCategory.PERSONA,
  'spontaneous-vulnerability': BuilderCategory.PERSONA,
  'physical-presence': BuilderCategory.PERSONA,
  'lovable-presence': BuilderCategory.PERSONA,
  'twin-profile-context': BuilderCategory.PERSONA,
  'human-personality': BuilderCategory.PERSONA,
  'ferni-personality': BuilderCategory.PERSONA,
  'ferni-coordinator-insights': BuilderCategory.PERSONA,
  'better-than-human-direct': BuilderCategory.PERSONA,
  'conversational-superpowers': BuilderCategory.PERSONA,
  // Cross-persona insight builders
  'peter-research-insights': BuilderCategory.PERSONA,
  'maya-coaching-insights': BuilderCategory.PERSONA, // Also COACHING but persona-specific
  'jordan-milestone-insights': BuilderCategory.PERSONA,
  'alex-communication-insights': BuilderCategory.PERSONA,
  'nayan-wisdom-insights': BuilderCategory.PERSONA,

  // COACHING
  'coaching-context': BuilderCategory.COACHING,
  'life-coaching-context': BuilderCategory.COACHING,
  'scientific-coaching': BuilderCategory.COACHING,
  'therapeutic-frameworks': BuilderCategory.COACHING,
  'behavioral-economics': BuilderCategory.COACHING,
  'maya-habit-insights': BuilderCategory.COACHING,
  'prediction-surfacing': BuilderCategory.COACHING,
  methodology: BuilderCategory.COACHING, // Coaching methodology guidance

  // COGNITIVE
  cognitive: BuilderCategory.COGNITIVE,
  'cognitive-quirks': BuilderCategory.COGNITIVE,
  'cognitive-distortions': BuilderCategory.COGNITIVE,
  'cognitive-insights': BuilderCategory.COGNITIVE,
  'pattern-surfacing': BuilderCategory.COGNITIVE,
  'superhuman-insights': BuilderCategory.COGNITIVE,
  awareness: BuilderCategory.COGNITIVE,
  'deep-understanding': BuilderCategory.COGNITIVE,
  'life-context-synthesis': BuilderCategory.COGNITIVE,
  'semantic-intelligence-integration': BuilderCategory.COGNITIVE,
  'temporal-intelligence': BuilderCategory.COGNITIVE, // Time-based pattern detection

  // ENGAGEMENT
  engagement: BuilderCategory.ENGAGEMENT,
  'engagement-context': BuilderCategory.ENGAGEMENT,
  'game-context': BuilderCategory.ENGAGEMENT,
  storytelling: BuilderCategory.ENGAGEMENT,
  music: BuilderCategory.ENGAGEMENT,
  'music-emotion-offers': BuilderCategory.ENGAGEMENT,
  'daily-rituals': BuilderCategory.ENGAGEMENT, // Daily engagement rituals

  // TEAM
  'team-availability': BuilderCategory.TEAM,
  'team-dynamics': BuilderCategory.TEAM,
  handoff: BuilderCategory.TEAM,
  'role-boundaries': BuilderCategory.TEAM,
  'cameo-opportunities': BuilderCategory.TEAM,
  'cameo-unlock': BuilderCategory.TEAM,
  'team-gossip': BuilderCategory.TEAM, // Cross-persona team awareness

  // CONTEXT
  intent: BuilderCategory.CONTEXT,
  topics: BuilderCategory.CONTEXT,
  discovery: BuilderCategory.CONTEXT,
  personal: BuilderCategory.CONTEXT,
  pacing: BuilderCategory.CONTEXT,
  'meta-conversation': BuilderCategory.CONTEXT,
  'situational-awareness': BuilderCategory.CONTEXT,
  'trust-context': BuilderCategory.CONTEXT,
  'relationship-behaviors': BuilderCategory.CONTEXT,
  'session-flow': BuilderCategory.CONTEXT,
  goodbye: BuilderCategory.CONTEXT,
  rag: BuilderCategory.CONTEXT,
  tasks: BuilderCategory.CONTEXT,
  'domain-fluency': BuilderCategory.CONTEXT,
  'dynamic-tool-guidance': BuilderCategory.CONTEXT,
  'outbound-call-context': BuilderCategory.CONTEXT,
  'semantic-intent-guidance': BuilderCategory.CONTEXT,
  'tool-capabilities': BuilderCategory.CONTEXT,
  'tool-timing-context': BuilderCategory.CONTEXT,

  // EXTERNAL
  biometrics: BuilderCategory.EXTERNAL,
  'financial-prediction': BuilderCategory.EXTERNAL,
  anticipation: BuilderCategory.EXTERNAL,
  'social-relationships': BuilderCategory.EXTERNAL,
  'world-awareness': BuilderCategory.EXTERNAL,
  'personal-journey': BuilderCategory.EXTERNAL,
  'calendar-awareness': BuilderCategory.EXTERNAL,
  'career-awareness': BuilderCategory.EXTERNAL,
  'contact-awareness': BuilderCategory.EXTERNAL,
  'device-awareness': BuilderCategory.EXTERNAL,
  'linkedin-awareness': BuilderCategory.EXTERNAL,
  'macos-context': BuilderCategory.EXTERNAL,
  'message-review-awareness': BuilderCategory.EXTERNAL,
  'outreach-awareness': BuilderCategory.EXTERNAL,

  // HUMANIZING
  humanizing: BuilderCategory.HUMANIZING,
  'deep-humanization': BuilderCategory.HUMANIZING,
  'conversation-humanizing': BuilderCategory.HUMANIZING,
  'natural-uncertainty': BuilderCategory.HUMANIZING,
  'response-length': BuilderCategory.HUMANIZING,
  'energy-mirroring': BuilderCategory.HUMANIZING,
  'energy-awareness': BuilderCategory.HUMANIZING,
  'conversation-forward': BuilderCategory.HUMANIZING,
  'deep-relationship': BuilderCategory.HUMANIZING,
  'tool-humanization': BuilderCategory.HUMANIZING, // Natural tool usage framing
  'unified-humanizing': BuilderCategory.HUMANIZING, // Consolidated humanization orchestrator
  // RELATIONSHIP ARC (complete relationship development system)
  'first-meeting-magic': BuilderCategory.HUMANIZING, // Stage: Stranger (turns 0-3)
  'acquaintance-deepening': BuilderCategory.HUMANIZING, // Stage: Acquaintance (sessions 2-5)
  'friendship-flowering': BuilderCategory.HUMANIZING, // Stage: Friend (sessions 6-15)
  'trusted-advisor': BuilderCategory.HUMANIZING, // Stage: Trusted Advisor (15+ sessions)
  'revelation-awareness': BuilderCategory.HUMANIZING, // Anti-surveillance, throttling

  // LEARNING
  'community-learning': BuilderCategory.LEARNING,
  'wisdom-synthesis': BuilderCategory.LEARNING,

  // RELATIONSHIP MEMORY (Core Principle #2: Relationship Over Transaction)
  'relationship-stage': BuilderCategory.HUMANIZING, // Relationship stage awareness
  'callback-opportunities': BuilderCategory.MEMORY, // Callbacks to past moments

  // PREDICTIVE INTELLIGENCE (Core Principle #5: Presence Over Performance)
  'persona-proactive': BuilderCategory.COGNITIVE, // Persona-specific proactive patterns

  // COGNITIVE DIFFERENTIATION (Core Principle #4: Authentic Personality)
  'cognitive-style': BuilderCategory.PERSONA, // Persona thinking style
};

// ============================================================================
// CATEGORY METADATA
// ============================================================================

export interface CategoryMetadata {
  name: string;
  description: string;
  priorityRange: { min: number; max: number };
  builderCount: number;
}

/**
 * Get metadata for a category
 */
export function getCategoryMetadata(category: BuilderCategory): CategoryMetadata {
  const builderCount = Object.values(BUILDER_CATEGORIES).filter((c) => c === category).length;

  const metadata: Record<BuilderCategory, Omit<CategoryMetadata, 'builderCount'>> = {
    [BuilderCategory.SAFETY]: {
      name: 'Safety',
      description: 'Crisis detection, wellbeing monitoring',
      priorityRange: { min: 0, max: 20 },
    },
    [BuilderCategory.EMOTIONAL]: {
      name: 'Emotional',
      description: 'Emotion detection, validation, celebration',
      priorityRange: { min: 15, max: 35 },
    },
    [BuilderCategory.VOICE]: {
      name: 'Voice',
      description: 'Voice emotion, prosody, speech adaptation',
      priorityRange: { min: 20, max: 40 },
    },
    [BuilderCategory.MEMORY]: {
      name: 'Memory',
      description: 'Cross-session memory and context recall',
      priorityRange: { min: 25, max: 45 },
    },
    [BuilderCategory.PERSONA]: {
      name: 'Persona',
      description: 'Persona identity, quirks, character',
      priorityRange: { min: 40, max: 60 },
    },
    [BuilderCategory.COACHING]: {
      name: 'Coaching',
      description: 'Life coaching, therapeutic frameworks',
      priorityRange: { min: 45, max: 65 },
    },
    [BuilderCategory.COGNITIVE]: {
      name: 'Cognitive',
      description: 'Cognitive style, distortions, patterns',
      priorityRange: { min: 50, max: 70 },
    },
    [BuilderCategory.ENGAGEMENT]: {
      name: 'Engagement',
      description: 'Games, music, storytelling',
      priorityRange: { min: 55, max: 75 },
    },
    [BuilderCategory.TEAM]: {
      name: 'Team',
      description: 'Team dynamics, handoffs',
      priorityRange: { min: 60, max: 80 },
    },
    [BuilderCategory.CONTEXT]: {
      name: 'Context',
      description: 'Topics, intent, situational awareness',
      priorityRange: { min: 50, max: 70 },
    },
    [BuilderCategory.EXTERNAL]: {
      name: 'External',
      description: 'Biometrics, calendar, weather, finance',
      priorityRange: { min: 65, max: 85 },
    },
    [BuilderCategory.HUMANIZING]: {
      name: 'Humanizing',
      description: 'Natural speech, personality polish',
      priorityRange: { min: 75, max: 95 },
    },
    [BuilderCategory.LEARNING]: {
      name: 'Learning',
      description: 'Community learning, wisdom synthesis',
      priorityRange: { min: 80, max: 100 },
    },
  };

  return { ...metadata[category], builderCount };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the category for a builder
 *
 * @param builderName - Name of the builder
 * @returns The builder's category (defaults to CONTEXT)
 */
export function getBuilderCategory(builderName: string): BuilderCategory {
  return BUILDER_CATEGORIES[builderName] || BuilderCategory.CONTEXT;
}

/**
 * Get all builders in a category
 *
 * @param category - Category to filter by
 * @returns Array of builder names
 */
export function getBuildersInCategory(category: BuilderCategory): string[] {
  return Object.entries(BUILDER_CATEGORIES)
    .filter(([_, cat]) => cat === category)
    .map(([name]) => name);
}

/**
 * Get all categories with their builder counts
 */
export function getCategorySummary(): Array<{ category: BuilderCategory; count: number }> {
  const counts = new Map<BuilderCategory, number>();

  for (const category of Object.values(BUILDER_CATEGORIES)) {
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Validate that all builders have appropriate priorities for their category
 */
export function validateBuilderPriorities(
  builders: Array<{ name: string; priority: number }>
): string[] {
  const warnings: string[] = [];

  for (const builder of builders) {
    const category = getBuilderCategory(builder.name);
    const metadata = getCategoryMetadata(category);

    if (builder.priority < metadata.priorityRange.min) {
      warnings.push(
        `Builder "${builder.name}" priority ${builder.priority} is below category "${category}" range (${metadata.priorityRange.min}-${metadata.priorityRange.max})`
      );
    } else if (builder.priority > metadata.priorityRange.max) {
      warnings.push(
        `Builder "${builder.name}" priority ${builder.priority} is above category "${category}" range (${metadata.priorityRange.min}-${metadata.priorityRange.max})`
      );
    }
  }

  return warnings;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  BuilderCategory,
  BUILDER_CATEGORIES,
  getBuilderCategory,
  getBuildersInCategory,
  getCategoryMetadata,
  getCategorySummary,
  validateBuilderPriorities,
};
