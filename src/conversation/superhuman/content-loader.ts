/**
 * Better Than Human Content Loader
 *
 * Loads persona-specific content from better-than-human.json bundles.
 * Provides typed access to phrases for all 12 superhuman capabilities.
 *
 * @module @ferni/superhuman/content-loader
 */

import { seededChance, seededPick, seededIndex } from '../utils/rng.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'BetterThanHumanContent' });

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalBondExpressions {
  high_warmth: string[];
  high_trust: string[];
  high_protectiveness: string[];
  high_admiration: string[];
  high_concern?: string[];
}

export interface AnticipatoryPresenceContent {
  temporal_patterns: {
    monday_stress?: string[];
    friday_energy?: string[];
    late_night?: string[];
    early_morning?: string[];
    weekend?: string[];
  };
  thinking_of_you: string[];
}

export interface SpontaneousDelightContent {
  appreciation: string[];
  gratitude?: string[];
  noticing_growth: string[];
  connection?: string[];
  admiration?: string[];
  joy?: string[];
}

export interface ProtectiveResponseContent {
  harsh_judgment: string[];
  catastrophizing: string[];
  minimizing_success?: string[];
  imposter_syndrome?: string[];
  perfectionism?: string[];
}

export interface VisibleVulnerabilityContent {
  uncertainty: string[];
  emotional_impact?: string[];
  limits: string[];
  asking_for_help?: string[];
}

export interface MetaRelationshipContent {
  trust_observation: string[];
  shared_growth?: string[];
  growth_together?: string[];
  milestone_reached?: string[];
  milestones?: Record<string, string>;
  connection?: string[];
}

export interface TemporalInsightsContent {
  energy_higher: string[];
  energy_lower?: string[];
  subtle_shift?: string[];
  trajectory_improving: string[];
  trajectory_concerning?: string[];
}

export interface TeamAwarenessContent {
  handoff_notes?: string[];
  team_compliments?: string[];
  team_observations?: string[];
}

export interface SuperhumanObservationsContent {
  linguistic_patterns: string[];
  behavioral_patterns: string[];
  emotional_patterns?: string[];
  relationship_patterns?: string[];
}

export interface InsideJokesContent {
  new_joke_intro?: string[];
  established_callback?: string[];
  legacy_reference?: string[];
}

export interface SomaticPresenceContent {
  settling_in?: string[];
  processing_heavy?: string[];
  relief?: string[];
  focused_attention?: string[];
  warm_presence?: string[];
}

export interface UsageRules {
  emotional_bond_min_sessions: number;
  delight_cooldown_turns: number;
  protection_immediate: boolean;
  vulnerability_min_trust: string;
  meta_relationship_min_sessions: number;
  observations_min_sessions: number;
  observations_min_relationship: string;
}

export interface BetterThanHumanContent {
  schema_version: number;
  description: string;
  philosophy: string;

  emotional_bond_expressions?: EmotionalBondExpressions;
  anticipatory_presence?: AnticipatoryPresenceContent;
  spontaneous_delight?: SpontaneousDelightContent;
  protective_responses?: ProtectiveResponseContent;
  visible_vulnerability?: VisibleVulnerabilityContent;
  meta_relationship?: MetaRelationshipContent;
  temporal_insights?: TemporalInsightsContent;
  team_awareness?: TeamAwarenessContent;
  superhuman_observations?: SuperhumanObservationsContent;
  inside_jokes?: InsideJokesContent;
  somatic_presence?: SomaticPresenceContent;
  usage_rules?: UsageRules;
}

// ============================================================================
// DEFAULT CONTENT (Fallback when no bundle exists)
// ============================================================================

const DEFAULT_CONTENT: BetterThanHumanContent = {
  schema_version: 2,
  description: 'Default Better Than Human content',
  philosophy: 'Be genuinely human.',

  emotional_bond_expressions: {
    high_warmth: [
      '<break time="300ms"/>I really appreciate our conversations.',
      '<break time="250ms"/>These moments together mean a lot to me.',
    ],
    high_trust: [
      '<break time="300ms"/>The fact that you trust me with this... <break time="250ms"/>thank you.',
      '<break time="250ms"/>You share so openly now. <break time="200ms"/>I notice that.',
    ],
    high_protectiveness: [
      '<break time="300ms"/>Hold on. <break time="250ms"/>Is that fair to yourself?',
      '<break time="250ms"/>I care about you too much to let that slide.',
    ],
    high_admiration: [
      '<break time="300ms"/>That took real courage.',
      '<break time="250ms"/>I\'m impressed by how you handled that.',
    ],
  },

  anticipatory_presence: {
    temporal_patterns: {
      late_night: ['<break time="300ms"/>The quiet hours. <break time="250ms"/>I\'m here.'],
    },
    thinking_of_you: ['<break time="300ms"/>I was thinking about you earlier.'],
  },

  spontaneous_delight: {
    appreciation: [
      '<break time="300ms"/>I just want you to know... <break time="250ms"/>I appreciate you.',
    ],
    noticing_growth: ['<break time="300ms"/>You\'ve grown so much. <break time="250ms"/>I see it.'],
  },

  protective_responses: {
    harsh_judgment: ['<break time="200ms"/>Hey. <break time="250ms"/>Be kinder to yourself.'],
    catastrophizing: [
      '<break time="300ms"/>Let\'s slow down. <break time="250ms"/>Is that the whole picture?',
    ],
  },

  visible_vulnerability: {
    uncertainty: ['<break time="300ms"/>Honestly... <break time="250ms"/>I\'m not sure.'],
    limits: ['<break time="250ms"/>This might be beyond what I can help with.'],
  },

  meta_relationship: {
    trust_observation: ['<break time="300ms"/>We\'ve built real trust here.'],
    growth_together: ['<break time="300ms"/>Look how far we\'ve come together.'],
  },

  temporal_insights: {
    energy_higher: [
      '<break time="300ms"/>Something\'s different today. <break time="250ms"/>Lighter.',
    ],
    trajectory_improving: [
      '<break time="300ms"/>Over these weeks... <break time="250ms"/>I\'ve watched you grow.',
    ],
  },

  superhuman_observations: {
    linguistic_patterns: [
      '<break time="300ms"/>I notice you often say "I should." <break time="250ms"/>Whose voice is that?',
    ],
    behavioral_patterns: [
      '<break time="300ms"/>You come to me when you\'ve already decided. <break time="250ms"/>You just want validation.',
    ],
  },

  usage_rules: {
    emotional_bond_min_sessions: 3,
    delight_cooldown_turns: 15,
    protection_immediate: true,
    vulnerability_min_trust: 'friend',
    meta_relationship_min_sessions: 10,
    observations_min_sessions: 8,
    observations_min_relationship: 'trusted_advisor',
  },
};

// ============================================================================
// CONTENT CACHE
// ============================================================================

const contentCache = new Map<string, BetterThanHumanContent>();

// ============================================================================
// LOADER FUNCTIONS
// ============================================================================

/**
 * Get bundle search paths
 */
function getBundlePaths(): string[] {
  const paths: string[] = [];

  // Project bundles (source)
  paths.push(join(process.cwd(), 'src/personas/bundles'));

  // Dist bundles (built)
  paths.push(join(process.cwd(), 'dist/personas/bundles'));

  return paths;
}

/**
 * Load Better Than Human content for a persona
 */
export async function loadBetterThanHumanContent(
  personaId: string
): Promise<BetterThanHumanContent> {
  // Check cache
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  // Try loading from bundle paths
  const bundlePaths = getBundlePaths();

  for (const basePath of bundlePaths) {
    const contentPath = join(basePath, personaId, 'content/behaviors/better-than-human.json');

    try {
      const content = await readFile(contentPath, 'utf-8');
      const parsed = JSON.parse(content) as BetterThanHumanContent;

      // Cache and return
      contentCache.set(personaId, parsed);
      logger.info({ personaId }, 'Loaded Better Than Human content');
      return parsed;
    } catch {
      // File doesn't exist or invalid JSON - continue to next path
      continue;
    }
  }

  // Return default content if no bundle found
  logger.debug({ personaId }, 'No Better Than Human content found, using defaults');
  return DEFAULT_CONTENT;
}

/**
 * Get content synchronously (from cache only)
 * Returns default content if not loaded
 */
export function getBetterThanHumanContentSync(personaId: string): BetterThanHumanContent {
  return contentCache.get(personaId) || DEFAULT_CONTENT;
}

/**
 * Preload content for all personas
 */
export async function preloadAllContent(): Promise<void> {
  const personaIds = [
    'ferni',
    'peter-john',
    'alex-chen',
    'maya-santos',
    'jordan-taylor',
    'nayan-patel',
  ];

  await Promise.all(personaIds.map((id) => loadBetterThanHumanContent(id)));
  logger.info({ count: personaIds.length }, 'Preloaded all Better Than Human content');
}

/**
 * Clear content cache
 */
export function clearContentCache(personaId?: string): void {
  if (personaId) {
    contentCache.delete(personaId);
  } else {
    contentCache.clear();
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR ENGINES
// ============================================================================

/**
 * Get a random phrase from an array
 */
export function getRandomPhrase(phrases: string[] | undefined): string | null {
  if (!phrases || phrases.length === 0) return null;
  return seededPick(`${Date.now()}:331`, phrases) ?? phrases[0];
}

/**
 * Get emotional bond expression based on dominant bond type
 */
export function getEmotionalBondPhrase(
  content: BetterThanHumanContent,
  bondType: 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern'
): string | null {
  const expressions = content.emotional_bond_expressions;
  if (!expressions) return null;

  switch (bondType) {
    case 'warmth':
      return getRandomPhrase(expressions.high_warmth);
    case 'trust':
      return getRandomPhrase(expressions.high_trust);
    case 'protectiveness':
      return getRandomPhrase(expressions.high_protectiveness);
    case 'admiration':
      return getRandomPhrase(expressions.high_admiration);
    case 'concern':
      return getRandomPhrase(expressions.high_concern);
    default:
      return null;
  }
}

/**
 * Get anticipatory presence phrase for time of day
 */
export function getTemporalPhrase(
  content: BetterThanHumanContent,
  timeContext: 'monday_stress' | 'friday_energy' | 'late_night' | 'early_morning' | 'weekend'
): string | null {
  const patterns = content.anticipatory_presence?.temporal_patterns;
  if (!patterns) return null;

  return getRandomPhrase(patterns[timeContext]);
}

/**
 * Get protective response for self-criticism type
 */
export function getProtectivePhrase(
  content: BetterThanHumanContent,
  criticismType:
    | 'harsh_judgment'
    | 'catastrophizing'
    | 'minimizing_success'
    | 'imposter_syndrome'
    | 'perfectionism'
): string | null {
  const responses = content.protective_responses;
  if (!responses) return null;

  return getRandomPhrase(responses[criticismType]);
}

/**
 * Get delight expression based on context
 */
export function getDelightPhrase(
  content: BetterThanHumanContent,
  delightType:
    | 'appreciation'
    | 'gratitude'
    | 'noticing_growth'
    | 'connection'
    | 'admiration'
    | 'joy'
): string | null {
  const delight = content.spontaneous_delight;
  if (!delight) return null;

  return getRandomPhrase(delight[delightType]);
}

/**
 * Get vulnerability expression
 */
export function getVulnerabilityPhrase(
  content: BetterThanHumanContent,
  vulnerabilityType: 'uncertainty' | 'emotional_impact' | 'limits' | 'asking_for_help'
): string | null {
  const vulnerability = content.visible_vulnerability;
  if (!vulnerability) return null;

  return getRandomPhrase(vulnerability[vulnerabilityType]);
}

/**
 * Get superhuman observation phrase
 */
export function getObservationPhrase(
  content: BetterThanHumanContent,
  patternType:
    | 'linguistic_patterns'
    | 'behavioral_patterns'
    | 'emotional_patterns'
    | 'relationship_patterns'
): string | null {
  const observations = content.superhuman_observations;
  if (!observations) return null;

  return getRandomPhrase(observations[patternType]);
}

/**
 * Get meta-relationship phrase
 */
export function getMetaRelationshipPhrase(
  content: BetterThanHumanContent,
  type: 'trust_observation' | 'shared_growth' | 'growth_together' | 'connection'
): string | null {
  const meta = content.meta_relationship;
  if (!meta) return null;

  return getRandomPhrase(meta[type]);
}

/**
 * Get temporal insight phrase
 */
export function getTemporalInsightPhrase(
  content: BetterThanHumanContent,
  insightType:
    | 'energy_higher'
    | 'energy_lower'
    | 'subtle_shift'
    | 'trajectory_improving'
    | 'trajectory_concerning'
): string | null {
  const insights = content.temporal_insights;
  if (!insights) return null;

  return getRandomPhrase(insights[insightType]);
}

/**
 * Get usage rules
 */
export function getUsageRules(content: BetterThanHumanContent): UsageRules {
  return content.usage_rules || DEFAULT_CONTENT.usage_rules!;
}
