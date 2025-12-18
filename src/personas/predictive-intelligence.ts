/**
 * Predictive Intelligence Loader
 *
 * > "We hear what you're not saying."
 *
 * Loads and processes predictive intelligence behaviors from persona bundles.
 * Detects patterns, generates proactive follow-ups, and anticipates user needs.
 */

import { getLogger } from '../utils/safe-logger.js';
import { loadBundleById } from './bundles/loader.js';
import type { EmotionalTrajectory, RelationshipMemory } from './relationship-memory/types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pattern detection result
 */
export interface DetectedPattern {
  patternId: string;
  patternType: 'temporal' | 'emotional' | 'behavioral' | 'habit' | 'existential' | 'wisdom';
  name: string;
  description: string;
  confidence: number;
  triggers: string[];
  proactiveResponses: string[];
}

/**
 * Proactive follow-up suggestion
 */
export interface ProactiveFollowUp {
  type: string;
  timing: string;
  phrases: string[];
  context?: string;
}

/**
 * Anticipatory insight
 */
export interface AnticipatoryInsight {
  category: 'seasonal' | 'life_stage' | 'temporal' | 'spiritual' | 'behavioral';
  id: string;
  period?: string;
  detection?: string;
  proactiveResponses: string[];
}

/**
 * Concern detection result
 */
export interface DetectedConcern {
  concernId: string;
  severity: 'low' | 'medium' | 'high';
  detection: string;
  responses: string[];
}

/**
 * Complete predictive intelligence for a persona
 */
export interface PredictiveIntelligence {
  personaId: string;
  patterns: {
    temporal: Record<string, PatternConfig>;
    emotional: Record<string, PatternConfig>;
    behavioral: Record<string, PatternConfig>;
  };
  proactiveFollowUps: Record<string, ProactiveFollowUpConfig>;
  anticipatoryInsights: {
    seasonal?: Record<string, SeasonalConfig>;
    lifeStage?: Record<string, LifeStageConfig>;
    temporal?: Record<string, TemporalConfig>;
  };
  concernDetection?: {
    warningSigns: Record<string, ConcernConfig>;
  };
  usageRules: UsageRules;
}

interface PatternConfig {
  triggers?: string[];
  detection: string;
  insight?: string;
  response?: string[];
  proactive_response?: string[];
}

interface ProactiveFollowUpConfig {
  timing: string;
  phrases: string[];
}

interface SeasonalConfig {
  period: string;
  proactive: string[];
}

interface LifeStageConfig {
  detection: string;
  proactive: string[];
}

interface TemporalConfig {
  detection: string;
  proactive: string[];
}

interface ConcernConfig {
  detection: string;
  response: string[];
}

interface UsageRules {
  pattern_recognition_min_sessions: number;
  proactive_followup_min_sessions: number;
  concern_detection_immediate?: boolean;
  max_proactive_mentions_per_session: number;
  min_sessions_between_same_pattern: number;
  seasonal_insights_per_season?: number;
}

// ============================================================================
// CONTEXT FOR PATTERN MATCHING
// ============================================================================

export interface PatternMatchContext {
  /** Current message text */
  currentMessage: string;
  /** Current time */
  timestamp: Date;
  /** Day of week (0-6, Sunday = 0) */
  dayOfWeek: number;
  /** Hour of day (0-23) */
  hour: number;
  /** User's relationship memory */
  relationshipMemory?: RelationshipMemory;
  /** Recent topics discussed */
  recentTopics?: string[];
  /** Recent emotional trajectory */
  emotionalTrajectory?: EmotionalTrajectory;
  /** Session number */
  sessionNumber: number;
}

// ============================================================================
// LOADER
// ============================================================================

// Cache loaded predictive intelligence
const predictiveCache = new Map<string, PredictiveIntelligence>();

/**
 * Load predictive intelligence for a persona
 */
export async function loadPredictiveIntelligence(
  personaId: string
): Promise<PredictiveIntelligence | null> {
  // Check cache
  if (predictiveCache.has(personaId)) {
    return predictiveCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      log.debug({ personaId }, 'No bundle found for predictive intelligence');
      return null;
    }

    // Load behaviors from bundle
    let behaviors: Record<string, unknown> | undefined;
    if (typeof bundle.getBehaviors === 'function') {
      const result = bundle.getBehaviors();
      behaviors = result instanceof Promise ? await result : (result as Record<string, unknown>);
    } else {
      behaviors = (bundle as unknown as { behaviors?: Record<string, unknown> }).behaviors;
    }

    if (!behaviors) {
      log.debug({ personaId }, 'No behaviors in bundle');
      return null;
    }

    // Look for predictive-intelligence in behaviors
    const predictive = (behaviors as Record<string, unknown>)['predictive-intelligence'] as
      | Record<string, unknown>
      | undefined;
    if (!predictive) {
      log.debug({ personaId }, 'No predictive-intelligence behavior found');
      return null;
    }

    // Parse the JSON structure
    const intelligence: PredictiveIntelligence = {
      personaId,
      patterns: {
        temporal:
          ((predictive.pattern_recognition as Record<string, unknown>)?.temporal_patterns as Record<
            string,
            PatternConfig
          >) || {},
        emotional:
          ((predictive.pattern_recognition as Record<string, unknown>)
            ?.emotional_patterns as Record<string, PatternConfig>) || {},
        behavioral:
          ((predictive.pattern_recognition as Record<string, unknown>)
            ?.behavioral_patterns as Record<string, PatternConfig>) || {},
      },
      proactiveFollowUps:
        (predictive.proactive_follow_ups as Record<string, ProactiveFollowUpConfig>) || {},
      anticipatoryInsights: {
        seasonal: (predictive.anticipatory_insights as Record<string, unknown>)?.seasonal as Record<
          string,
          SeasonalConfig
        >,
        lifeStage: (predictive.anticipatory_insights as Record<string, unknown>)
          ?.life_stage as Record<string, LifeStageConfig>,
      },
      concernDetection: predictive.concern_detection as {
        warningSigns: Record<string, ConcernConfig>;
      },
      usageRules: (predictive.usage_rules as UsageRules) || {
        pattern_recognition_min_sessions: 5,
        proactive_followup_min_sessions: 3,
        max_proactive_mentions_per_session: 2,
        min_sessions_between_same_pattern: 3,
      },
    };

    predictiveCache.set(personaId, intelligence);
    log.debug({ personaId }, 'Loaded predictive intelligence');

    return intelligence;
  } catch (error) {
    log.error({ error, personaId }, 'Failed to load predictive intelligence');
    return null;
  }
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect patterns in the current context
 */
export async function detectPatterns(
  personaId: string,
  context: PatternMatchContext
): Promise<DetectedPattern[]> {
  const intelligence = await loadPredictiveIntelligence(personaId);
  if (!intelligence) return [];

  const detected: DetectedPattern[] = [];
  const { usageRules } = intelligence;

  // Check minimum sessions
  if (context.sessionNumber < usageRules.pattern_recognition_min_sessions) {
    return [];
  }

  // Check temporal patterns
  for (const [patternId, config] of Object.entries(intelligence.patterns.temporal)) {
    if (matchesTemporalPattern(context, config)) {
      detected.push({
        patternId,
        patternType: 'temporal',
        name: patternId,
        description: config.detection,
        confidence: 0.7,
        triggers: config.triggers || [],
        proactiveResponses: config.proactive_response || [],
      });
    }
  }

  // Check emotional patterns
  for (const [patternId, config] of Object.entries(intelligence.patterns.emotional)) {
    if (matchesEmotionalPattern(context, config)) {
      detected.push({
        patternId,
        patternType: 'emotional',
        name: patternId,
        description: config.detection,
        confidence: 0.6,
        triggers: config.triggers || [],
        proactiveResponses: config.response || [],
      });
    }
  }

  // Check behavioral patterns
  for (const [patternId, config] of Object.entries(intelligence.patterns.behavioral)) {
    if (matchesBehavioralPattern(context, config)) {
      detected.push({
        patternId,
        patternType: 'behavioral',
        name: patternId,
        description: config.detection,
        confidence: 0.65,
        triggers: config.triggers || [],
        proactiveResponses: config.response || [],
      });
    }
  }

  return detected.slice(0, usageRules.max_proactive_mentions_per_session);
}

/**
 * Check if context matches a temporal pattern
 * NOW FULLY USES BUNDLE TRIGGERS - checks both time conditions AND message content
 */
function matchesTemporalPattern(context: PatternMatchContext, config: PatternConfig): boolean {
  const { dayOfWeek, hour, currentMessage } = context;
  const triggers = config.triggers || [];
  const messageLower = currentMessage.toLowerCase();

  let timeMatches = false;
  let messageMatches = false;

  // === TIME-BASED CONDITIONS ===
  // Sunday evening anxiety (Sunday = 0, evening = 17-21)
  if (triggers.includes('sunday') && dayOfWeek === 0 && hour >= 17 && hour <= 21) {
    timeMatches = true;
  }

  // Friday reflective (Friday = 5, afternoon+)
  if (triggers.includes('friday') && dayOfWeek === 5 && hour >= 14) {
    timeMatches = true;
  }

  // Late night processing
  if (triggers.includes('late') && (hour >= 22 || hour < 5)) {
    timeMatches = true;
  }

  // Morning clarity
  if (triggers.includes('morning') && hour >= 6 && hour < 10) {
    timeMatches = true;
  }

  // === MESSAGE-BASED MATCHING ===
  // Count how many triggers match the message
  let triggerMatchCount = 0;
  for (const trigger of triggers) {
    const triggerLower = trigger.toLowerCase();
    if (messageLower.includes(triggerLower)) {
      triggerMatchCount++;
      messageMatches = true;
      log.debug({ trigger, message: currentMessage.slice(0, 50) }, 'Predictive trigger matched');
    }
  }

  // Match if: (time matches AND user mentions relevant content) OR (multiple triggers in message)
  if (timeMatches && messageMatches) {
    return true;
  }

  // Strong message match (2+ triggers) can override time requirement
  if (triggerMatchCount >= 2) {
    return true;
  }

  // Single trigger + time context is enough
  if (timeMatches && messageLower.length > 10) {
    // Time is right, just engaging is enough
    return true;
  }

  return false;
}

/**
 * Check if context matches an emotional pattern
 * NOW USES BUNDLE'S INSIGHT + DETECTION FIELDS for smarter matching
 */
function matchesEmotionalPattern(context: PatternMatchContext, config: PatternConfig): boolean {
  const { currentMessage, emotionalTrajectory } = context;
  const messageLower = currentMessage.toLowerCase();
  const detection = config.detection?.toLowerCase() || '';
  const insight = config.insight?.toLowerCase() || '';

  // === DEFLECTION WITH HUMOR ===
  if (detection.includes('joke') || detection.includes('humor') || insight.includes('humor')) {
    const humorIndicators = [
      'haha',
      'lol',
      'just kidding',
      'anyway',
      'but yeah',
      'ha!',
      'lmao',
      'jk',
      '😂',
      'joking',
    ];
    if (humorIndicators.some((h) => messageLower.includes(h))) {
      log.debug({ pattern: 'deflection_with_humor' }, 'Detected humor after vulnerable share');
      return true;
    }
  }

  // === MINIMIZING SUCCESS ===
  if (detection.includes('downplay') || detection.includes('minimiz') || insight.includes('win')) {
    const minimizers = [
      "it's not a big deal",
      "it's nothing",
      'just lucky',
      "doesn't matter",
      'whatever',
      'no big deal',
      'not really',
      "wasn't that hard",
      'anyone could',
      'got lucky',
    ];
    if (minimizers.some((m) => messageLower.includes(m))) {
      log.debug({ pattern: 'minimizing_success' }, 'Detected success minimization');
      return true;
    }
  }

  // === COMPARISON SPIRAL ===
  if (detection.includes('compar') || insight.includes('benchmark')) {
    const comparisons = [
      'compared to',
      'not as good as',
      'everyone else',
      'other people',
      'unlike me',
      'they have',
      'she has',
      'he has',
      'wish I was',
      'better than me',
      'ahead of me',
    ];
    if (comparisons.some((c) => messageLower.includes(c))) {
      log.debug({ pattern: 'comparison_spiral' }, 'Detected unfavorable comparison');
      return true;
    }
  }

  // === PREEMPTIVE APOLOGY ===
  if (detection.includes('apolog') || insight.includes('burden')) {
    const apologies = [
      'sorry to',
      'sorry for',
      "i'm sorry but",
      'sorry if',
      "sorry i'm",
      'sorry this is',
      'i know this is',
      'hope this is okay',
      'feel bad',
    ];
    if (apologies.some((a) => messageLower.includes(a))) {
      log.debug({ pattern: 'preemptive_apology' }, 'Detected preemptive apology');
      return true;
    }
  }

  // === EMOTIONAL TRAJECTORY CHECK ===
  if (emotionalTrajectory && emotionalTrajectory.trendDirection === 'declining') {
    // If user is in decline AND message seems negative, match
    const negativeIndicators = ["can't", "won't", 'never', 'nothing', 'pointless', 'tired'];
    if (negativeIndicators.some((n) => messageLower.includes(n))) {
      log.debug({ pattern: 'declining_trajectory' }, 'Matched with declining emotional trajectory');
      return true;
    }
  }

  return false;
}

/**
 * Check if context matches a behavioral pattern
 */
function matchesBehavioralPattern(context: PatternMatchContext, config: PatternConfig): boolean {
  const { currentMessage, recentTopics, relationshipMemory } = context;
  const messageLower = currentMessage.toLowerCase();

  // Check for avoidance loop
  if (config.detection.includes('avoid') || config.detection.includes('circling')) {
    // Would need conversation history to detect properly
    // For now, check if user redirects from topic
    const redirects = ["let's talk about", 'anyway', 'moving on', 'never mind'];
    if (redirects.some((r) => messageLower.includes(r))) {
      return true;
    }
  }

  // Check for decision delay
  if (config.detection.includes('decision')) {
    const delays = ['still thinking', "can't decide", 'not sure yet', 'still considering'];
    if (delays.some((d) => messageLower.includes(d))) {
      return true;
    }
  }

  // Check for progress plateau (using relationship memory)
  if (config.detection.includes('plateau') || config.detection.includes('stopped')) {
    // Would check if goals mentioned but not updated recently
    // Simplified check for now
    if (messageLower.includes("haven't been") || messageLower.includes('stopped')) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// PROACTIVE FOLLOW-UPS
// ============================================================================

/**
 * Get proactive follow-up suggestions
 */
export async function getProactiveFollowUps(
  personaId: string,
  context: PatternMatchContext
): Promise<ProactiveFollowUp[]> {
  const intelligence = await loadPredictiveIntelligence(personaId);
  if (!intelligence) return [];

  const { usageRules, proactiveFollowUps } = intelligence;

  // Check minimum sessions
  if (context.sessionNumber < usageRules.proactive_followup_min_sessions) {
    return [];
  }

  const followUps: ProactiveFollowUp[] = [];

  for (const [type, config] of Object.entries(proactiveFollowUps)) {
    followUps.push({
      type,
      timing: config.timing,
      phrases: config.phrases,
    });
  }

  return followUps;
}

// ============================================================================
// CONCERN DETECTION
// ============================================================================

/**
 * Detect potential concerns
 */
export async function detectConcerns(
  personaId: string,
  context: PatternMatchContext
): Promise<DetectedConcern[]> {
  const intelligence = await loadPredictiveIntelligence(personaId);
  const concerns: DetectedConcern[] = [];
  const messageLower = context.currentMessage.toLowerCase();

  // Get warning signs from loaded intelligence, or use defaults
  const warningSigns = intelligence?.concernDetection?.warningSigns || {};

  // Always check for built-in concerns even without loaded intelligence
  const builtInConcerns: Record<string, ConcernConfig> = {
    hopelessness_language: {
      detection: "Phrases like 'what's the point', 'nothing matters' indicate despair",
      response: ["I heard that. That's important. Tell me more."],
    },
    isolation_mentions: {
      detection: 'User mentions having no one to talk to or being alone',
      response: ["You're not alone - we're talking right now."],
    },
    ...warningSigns,
  };

  // Always check concerns immediately
  for (const [concernId, config] of Object.entries(builtInConcerns)) {
    // Check for hopelessness language
    if (concernId === 'hopelessness_language') {
      const hopelessPhrases = [
        "what's the point",
        'nothing matters',
        'why bother',
        "don't care anymore",
      ];
      if (hopelessPhrases.some((p) => messageLower.includes(p))) {
        concerns.push({
          concernId,
          severity: 'high',
          detection: config.detection,
          responses: config.response,
        });
      }
    }

    // Check for isolation mentions
    if (concernId === 'isolation_mentions') {
      const isolationPhrases = [
        'no one to talk to',
        "i'm alone",
        'nobody understands',
        'all alone',
      ];
      if (isolationPhrases.some((p) => messageLower.includes(p))) {
        concerns.push({
          concernId,
          severity: 'medium',
          detection: config.detection,
          responses: config.response,
        });
      }
    }

    // Check for escalating negativity (would need session history)
    if (concernId === 'escalating_negativity' && context.emotionalTrajectory) {
      if (context.emotionalTrajectory.trendDirection === 'declining') {
        concerns.push({
          concernId,
          severity: 'medium',
          detection: config.detection,
          responses: config.response,
        });
      }
    }
  }

  return concerns;
}

// ============================================================================
// ANTICIPATORY INSIGHTS
// ============================================================================

/**
 * Get anticipatory insights based on current date/context
 */
export async function getAnticipatoryInsights(
  personaId: string,
  context: PatternMatchContext
): Promise<AnticipatoryInsight[]> {
  const intelligence = await loadPredictiveIntelligence(personaId);
  if (!intelligence || !intelligence.anticipatoryInsights) return [];

  const insights: AnticipatoryInsight[] = [];
  const { timestamp } = context;
  const month = timestamp.getMonth();
  const day = timestamp.getDate();

  // Check seasonal insights
  if (intelligence.anticipatoryInsights.seasonal) {
    for (const [id, config] of Object.entries(intelligence.anticipatoryInsights.seasonal)) {
      // New Year (Dec 20 - Jan 15)
      if (id === 'new_year' && ((month === 11 && day >= 20) || (month === 0 && day <= 15))) {
        insights.push({
          category: 'seasonal',
          id,
          period: config.period,
          proactiveResponses: config.proactive,
        });
      }

      // Spring renewal (March 15 - April 30)
      if (id === 'spring_renewal' && ((month === 2 && day >= 15) || month === 3)) {
        insights.push({
          category: 'seasonal',
          id,
          period: config.period,
          proactiveResponses: config.proactive,
        });
      }

      // End of year (Nov 15 - Dec 20)
      if (id === 'end_of_year' && month === 10 && day >= 15) {
        insights.push({
          category: 'seasonal',
          id,
          period: config.period,
          proactiveResponses: config.proactive,
        });
      }
    }
  }

  return insights;
}

// ============================================================================
// UNIFIED PREDICTIVE CONTEXT
// ============================================================================

/**
 * Complete predictive analysis result
 */
export interface PredictiveAnalysis {
  patterns: DetectedPattern[];
  followUps: ProactiveFollowUp[];
  concerns: DetectedConcern[];
  insights: AnticipatoryInsight[];
  promptInjection: string;
}

/**
 * Run complete predictive analysis
 */
export async function analyzePredictively(
  personaId: string,
  context: PatternMatchContext
): Promise<PredictiveAnalysis> {
  const [patterns, followUps, concerns, insights] = await Promise.all([
    detectPatterns(personaId, context),
    getProactiveFollowUps(personaId, context),
    detectConcerns(personaId, context),
    getAnticipatoryInsights(personaId, context),
  ]);

  // Build prompt injection
  const sections: string[] = [];

  if (concerns.length > 0) {
    sections.push('[CONCERN DETECTED]');
    for (const concern of concerns) {
      sections.push(`- ${concern.detection}`);
      if (concern.responses.length > 0) {
        sections.push(`  Suggested response: ${concern.responses[0]}`);
      }
    }
  }

  if (patterns.length > 0) {
    sections.push('[PATTERNS NOTICED]');
    for (const pattern of patterns) {
      sections.push(`- ${pattern.name}: ${pattern.description}`);
    }
  }

  if (insights.length > 0) {
    sections.push('[ANTICIPATORY AWARENESS]');
    for (const insight of insights) {
      sections.push(`- ${insight.id}: ${insight.proactiveResponses[0] || ''}`);
    }
  }

  return {
    patterns,
    followUps,
    concerns,
    insights,
    promptInjection: sections.join('\n'),
  };
}

export default {
  loadPredictiveIntelligence,
  detectPatterns,
  getProactiveFollowUps,
  detectConcerns,
  getAnticipatoryInsights,
  analyzePredictively,
};
