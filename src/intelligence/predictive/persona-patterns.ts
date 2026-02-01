/**
 * Persona Pattern Integration
 *
 * > "We hear what you're not saying."
 *
 * Connects persona-specific predictive patterns from bundles to the
 * core predictive intelligence infrastructure.
 *
 * This module bridges:
 * - Persona bundles (content/behaviors/predictive-patterns.json)
 * - Existing predictive infrastructure (34 files)
 *
 * Implements Core Principle #5: Presence Over Performance
 * "Being truly present matters more than being impressive."
 *
 * @module intelligence/predictive/persona-patterns
 */

import { createLogger } from '../../utils/safe-logger.js';
import { loadBundleById } from '../../personas/bundles/loader.js';
import type { PersonaId } from '../../personas/types.js';

const log = createLogger({ module: 'PersonaPatterns' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Temporal pattern - detects time-based patterns
 */
export interface TemporalPattern {
  triggers?: string[];
  detection: string;
  insight?: string;
  response?: string[];
  proactiveResponse?: string[];
  dayOfWeekAffinity?: number[]; // 0 = Sunday
  hourRangeAffinity?: [number, number]; // [start, end] in 24h
}

/**
 * Emotional pattern - detects emotional states
 */
export interface EmotionalPattern {
  triggers?: string[];
  detection: string;
  insight?: string;
  response?: string[];
  proactiveResponse?: string[];
  valenceMatch?: 'positive' | 'negative' | 'neutral';
  intensityThreshold?: number;
}

/**
 * Behavioral pattern - detects behavioral signals
 */
export interface BehavioralPattern {
  triggers?: string[];
  detection: string;
  insight?: string;
  response?: string[];
  proactiveResponse?: string[];
}

/**
 * Concern configuration
 */
export interface ConcernConfig {
  detection: string;
  response: string[];
  severity: 'low' | 'medium' | 'high';
  warningSigns?: string[];
}

/**
 * Follow-up configuration
 */
export interface FollowUpConfig {
  timing: string;
  phrases: string[];
  minSessionsToSurface?: number;
}

/**
 * Complete persona predictive configuration
 */
export interface PersonaPredictiveConfig {
  patterns: {
    temporal: Record<string, TemporalPattern>;
    emotional: Record<string, EmotionalPattern>;
    behavioral: Record<string, BehavioralPattern>;
  };
  concernDetection: {
    warningSigns: Record<string, ConcernConfig>;
  };
  proactiveFollowUps: Record<string, FollowUpConfig>;
  usageRules?: {
    minSessionsForPatterns?: number;
    minSessionsForProactive?: number;
    maxProactiveMentionsPerSession?: number;
  };
}

/**
 * Pattern match context
 */
export interface PatternMatchContext {
  userMessage: string;
  topics: string[];
  emotion?: {
    primary?: string;
    intensity?: number;
    valence?: 'positive' | 'negative' | 'neutral';
  };
  dayOfWeek: number;
  hour: number;
  sessionNumber: number;
  relationshipStage?: string;
  trustScore?: number;
}

/**
 * Detected pattern result
 */
export interface DetectedPattern {
  patternId: string;
  patternType: 'temporal' | 'emotional' | 'behavioral';
  name: string;
  description: string;
  confidence: number;
  proactiveResponse?: string[];
  insight?: string;
}

/**
 * Proactive follow-up result
 */
export interface ProactiveFollowUp {
  id: string;
  timing: string;
  phrase: string;
  confidence: number;
}

/**
 * Detected concern result
 */
export interface DetectedConcern {
  concernId: string;
  severity: 'low' | 'medium' | 'high';
  detection: string;
  responses: string[];
}

// ============================================================================
// PATTERN CACHE
// ============================================================================

const patternCache = new Map<string, PersonaPredictiveConfig>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

// ============================================================================
// LOADER
// ============================================================================

/**
 * Load persona-specific patterns from bundles
 */
export async function loadPersonaPatterns(
  personaId: PersonaId
): Promise<PersonaPredictiveConfig | null> {
  // Check cache
  const cached = patternCache.get(personaId);
  const cacheTime = cacheTimestamps.get(personaId) || 0;
  if (cached && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }

  try {
    // Load bundle
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      log.debug({ personaId }, 'No bundle found for persona');
      return null;
    }

    // Try to load predictive patterns from behaviors (via accessor function)
    const behaviors = await bundle.getBehaviors();
    const predictivePatterns =
      behaviors['predictive-patterns'] || behaviors['predictive-intelligence'];

    if (!predictivePatterns) {
      log.debug({ personaId }, 'No predictive patterns in bundle');
      return createDefaultConfig();
    }

    // Parse and normalize the patterns
    const config = normalizePredictiveConfig(predictivePatterns);

    // Cache
    patternCache.set(personaId, config);
    cacheTimestamps.set(personaId, Date.now());

    log.debug(
      {
        personaId,
        temporalPatterns: Object.keys(config.patterns.temporal).length,
        emotionalPatterns: Object.keys(config.patterns.emotional).length,
        behavioralPatterns: Object.keys(config.patterns.behavioral).length,
      },
      'Loaded persona predictive patterns'
    );

    return config;
  } catch (error) {
    log.error({ error, personaId }, 'Failed to load persona patterns');
    return null;
  }
}

/**
 * Normalize raw bundle config into typed config
 *
 * Handles multiple JSON structures:
 * - New structure: patterns.temporal, patterns.emotional, patterns.behavioral
 * - Existing structure: pattern_recognition.temporal_patterns, etc.
 */
function normalizePredictiveConfig(raw: unknown): PersonaPredictiveConfig {
  const rawConfig = raw as Record<string, unknown>;

  // Handle both new structure (patterns.*) and existing structure (pattern_recognition.*_patterns)
  const patterns = rawConfig.patterns as Record<string, unknown> | undefined;
  const patternRecognition = rawConfig.pattern_recognition as Record<string, unknown> | undefined;

  return {
    patterns: {
      temporal: normalizePatterns(
        patterns?.temporal ||
          patternRecognition?.temporal_patterns ||
          patternRecognition?.temporal ||
          {}
      ),
      emotional: normalizePatterns(
        patterns?.emotional ||
          patternRecognition?.emotional_patterns ||
          patternRecognition?.emotional ||
          // Also check for persona-specific pattern categories (e.g., existential_patterns, wisdom_patterns)
          patternRecognition?.existential_patterns ||
          patternRecognition?.wisdom_patterns ||
          {}
      ),
      behavioral: normalizePatterns(
        patterns?.behavioral ||
          patternRecognition?.behavioral_patterns ||
          patternRecognition?.behavioral ||
          patternRecognition?.growth_patterns ||
          {}
      ),
    },
    concernDetection: {
      warningSigns: normalizeConcerns(
        (rawConfig.concernDetection as Record<string, unknown>)?.warningSigns ||
          (rawConfig.concern_detection as Record<string, unknown>)?.warning_signs ||
          {}
      ),
    },
    proactiveFollowUps: normalizeFollowUps(
      rawConfig.proactiveFollowUps || rawConfig.proactive_follow_ups || {}
    ),
    usageRules:
      rawConfig.usageRules || rawConfig.usage_rules
        ? {
            minSessionsForPatterns:
              (rawConfig.usageRules as Record<string, number>)?.minSessionsForPatterns ||
              (rawConfig.usage_rules as Record<string, number>)?.pattern_recognition_min_sessions,
            minSessionsForProactive:
              (rawConfig.usageRules as Record<string, number>)?.minSessionsForProactive ||
              (rawConfig.usage_rules as Record<string, number>)?.proactive_followup_min_sessions,
            maxProactiveMentionsPerSession:
              (rawConfig.usageRules as Record<string, number>)?.maxProactiveMentionsPerSession ||
              (rawConfig.usage_rules as Record<string, number>)
                ?.max_proactive_mentions_per_session ||
              (rawConfig.usage_rules as Record<string, number>)?.max_proactive_per_session,
          }
        : undefined,
  };
}

function normalizePatterns(
  raw: unknown
): Record<string, TemporalPattern | EmotionalPattern | BehavioralPattern> {
  if (!raw || typeof raw !== 'object') return {};

  const result: Record<string, TemporalPattern | EmotionalPattern | BehavioralPattern> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      result[key] = {
        triggers: v.triggers as string[] | undefined,
        detection: (v.detection as string) || '',
        insight: v.insight as string | undefined,
        response: v.response as string[] | undefined,
        proactiveResponse: (v.proactive_response || v.proactiveResponse) as string[] | undefined,
      };
    }
  }
  return result;
}

function normalizeConcerns(raw: unknown): Record<string, ConcernConfig> {
  if (!raw || typeof raw !== 'object') return {};

  const result: Record<string, ConcernConfig> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      result[key] = {
        detection: (v.detection as string) || '',
        response: (v.response as string[]) || [],
        severity: (v.severity as 'low' | 'medium' | 'high') || 'medium',
        warningSigns: v.warning_signs as string[] | undefined,
      };
    }
  }
  return result;
}

function normalizeFollowUps(raw: unknown): Record<string, FollowUpConfig> {
  if (!raw || typeof raw !== 'object') return {};

  const result: Record<string, FollowUpConfig> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      result[key] = {
        timing: (v.timing as string) || 'whenever appropriate',
        phrases: (v.phrases as string[]) || [],
        minSessionsToSurface: v.min_sessions as number | undefined,
      };
    }
  }
  return result;
}

function createDefaultConfig(): PersonaPredictiveConfig {
  return {
    patterns: {
      temporal: {},
      emotional: {},
      behavioral: {},
    },
    concernDetection: {
      warningSigns: {},
    },
    proactiveFollowUps: {},
  };
}

// ============================================================================
// PATTERN MATCHING
// ============================================================================

/**
 * Match user message against persona patterns
 */
export function matchPersonaPatterns(
  personaId: PersonaId,
  config: PersonaPredictiveConfig,
  context: PatternMatchContext
): DetectedPattern[] {
  const results: DetectedPattern[] = [];
  const { userMessage, topics, emotion, dayOfWeek, hour } = context;
  const messageWords = userMessage.toLowerCase().split(/\s+/);

  // Match temporal patterns
  for (const [id, pattern] of Object.entries(config.patterns.temporal)) {
    const confidence = matchPattern(pattern, messageWords, topics);
    if (confidence > 0.3) {
      // Check temporal affinity
      let temporalBoost = 0;
      if (pattern.dayOfWeekAffinity?.includes(dayOfWeek)) {
        temporalBoost += 0.1;
      }
      if (pattern.hourRangeAffinity) {
        const [start, end] = pattern.hourRangeAffinity;
        if (hour >= start && hour <= end) {
          temporalBoost += 0.1;
        }
      }

      results.push({
        patternId: `${personaId}_temporal_${id}`,
        patternType: 'temporal',
        name: id,
        description: pattern.detection,
        confidence: Math.min(1, confidence + temporalBoost),
        proactiveResponse: pattern.proactiveResponse,
        insight: pattern.insight,
      });
    }
  }

  // Match emotional patterns
  for (const [id, pattern] of Object.entries(config.patterns.emotional)) {
    let confidence = matchPattern(pattern, messageWords, topics);

    // Boost confidence if emotion matches
    if (emotion && pattern.valenceMatch === emotion.valence) {
      confidence += 0.15;
    }
    if (emotion && pattern.intensityThreshold && emotion.intensity) {
      if (emotion.intensity >= pattern.intensityThreshold) {
        confidence += 0.1;
      }
    }

    if (confidence > 0.3) {
      results.push({
        patternId: `${personaId}_emotional_${id}`,
        patternType: 'emotional',
        name: id,
        description: pattern.detection,
        confidence: Math.min(1, confidence),
        proactiveResponse: pattern.proactiveResponse,
        insight: pattern.insight,
      });
    }
  }

  // Match behavioral patterns
  for (const [id, pattern] of Object.entries(config.patterns.behavioral)) {
    const confidence = matchPattern(pattern, messageWords, topics);
    if (confidence > 0.3) {
      results.push({
        patternId: `${personaId}_behavioral_${id}`,
        patternType: 'behavioral',
        name: id,
        description: pattern.detection,
        confidence: Math.min(1, confidence),
        proactiveResponse: pattern.proactiveResponse,
        insight: pattern.insight,
      });
    }
  }

  // Sort by confidence
  return results.sort((a, b) => b.confidence - a.confidence);
}

function matchPattern(
  pattern: TemporalPattern | EmotionalPattern | BehavioralPattern,
  messageWords: string[],
  topics: string[]
): number {
  let score = 0;
  let matches = 0;
  const triggers = pattern.triggers || [];

  // Check trigger word matches
  for (const trigger of triggers) {
    const triggerWords = trigger.toLowerCase().split(/\s+/);
    for (const tw of triggerWords) {
      if (messageWords.includes(tw)) {
        matches++;
      }
    }
  }

  if (triggers.length > 0) {
    score = matches / triggers.length;
  }

  // Boost if topics overlap with detection keywords
  const detectionWords = pattern.detection.toLowerCase().split(/\s+/);
  for (const topic of topics) {
    if (detectionWords.some((w) => w.includes(topic.toLowerCase()))) {
      score += 0.1;
    }
  }

  return score;
}

// ============================================================================
// FOLLOW-UP SUGGESTIONS
// ============================================================================

/**
 * Get proactive follow-ups based on conversation context
 */
export function getPersonaFollowUps(
  personaId: PersonaId,
  config: PersonaPredictiveConfig,
  context: PatternMatchContext
): ProactiveFollowUp[] {
  const results: ProactiveFollowUp[] = [];
  const minSessions = config.usageRules?.minSessionsForProactive || 3;

  // Only suggest follow-ups after building some relationship
  if (context.sessionNumber < minSessions) {
    return [];
  }

  const messageWords = context.userMessage.toLowerCase().split(/\s+/);

  for (const [id, followUp] of Object.entries(config.proactiveFollowUps)) {
    if (followUp.minSessionsToSurface && context.sessionNumber < followUp.minSessionsToSurface) {
      continue;
    }

    // Check if any phrase is relevant to current context
    for (const phrase of followUp.phrases) {
      const phraseWords = phrase.toLowerCase().split(/\s+/);
      let relevance = 0;

      // Check topic overlap
      for (const topic of context.topics) {
        if (phraseWords.some((w) => w.includes(topic.toLowerCase()))) {
          relevance += 0.3;
        }
      }

      // Check message word overlap
      for (const word of messageWords) {
        if (phraseWords.includes(word)) {
          relevance += 0.1;
        }
      }

      if (relevance > 0.2) {
        results.push({
          id: `${personaId}_followup_${id}`,
          timing: followUp.timing,
          phrase,
          confidence: Math.min(1, relevance),
        });
        break; // Only one phrase per follow-up type
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// CONCERN DETECTION
// ============================================================================

/**
 * Detect persona-specific concerns
 */
export function detectPersonaConcerns(
  personaId: PersonaId,
  config: PersonaPredictiveConfig,
  context: PatternMatchContext
): DetectedConcern[] {
  const results: DetectedConcern[] = [];
  const messageWords = context.userMessage.toLowerCase().split(/\s+/);

  for (const [id, concern] of Object.entries(config.concernDetection.warningSigns)) {
    const detectionWords = concern.detection.toLowerCase().split(/\s+/);
    let matches = 0;

    // Check warning signs
    const warningSigns = concern.warningSigns || [];
    for (const sign of warningSigns) {
      if (messageWords.some((w) => sign.toLowerCase().includes(w))) {
        matches++;
      }
    }

    // Check detection string
    for (const word of detectionWords) {
      if (messageWords.includes(word)) {
        matches++;
      }
    }

    // Boost for high emotion intensity with negative valence
    if (context.emotion?.valence === 'negative' && (context.emotion?.intensity || 0) > 0.7) {
      matches++;
    }

    if (matches >= 2) {
      results.push({
        concernId: `${personaId}_concern_${id}`,
        severity: concern.severity,
        detection: concern.detection,
        responses: concern.response,
      });
    }
  }

  return results.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// ============================================================================
// SIGNAL INTEGRATION
// ============================================================================

/**
 * Get persona pattern signal for multi-signal fusion
 */
export async function getPersonaPatternSignal(
  personaId: PersonaId,
  context: PatternMatchContext
): Promise<{
  patterns: DetectedPattern[];
  concerns: DetectedConcern[];
  followUps: ProactiveFollowUp[];
  confidence: number;
}> {
  const config = await loadPersonaPatterns(personaId);
  if (!config) {
    return { patterns: [], concerns: [], followUps: [], confidence: 0 };
  }

  const patterns = matchPersonaPatterns(personaId, config, context);
  const concerns = detectPersonaConcerns(personaId, config, context);
  const followUps = getPersonaFollowUps(personaId, config, context);

  // Overall confidence is the max of all signals
  const confidence = Math.max(
    patterns[0]?.confidence || 0,
    concerns.length > 0 ? 0.8 : 0,
    followUps[0]?.confidence || 0
  );

  return { patterns, concerns, followUps, confidence };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear pattern cache (for testing)
 */
export function clearPatternCache(): void {
  patternCache.clear();
  cacheTimestamps.clear();
}

/**
 * Pre-warm pattern cache for a persona
 */
export async function warmPatternCache(personaId: PersonaId): Promise<void> {
  await loadPersonaPatterns(personaId);
}
