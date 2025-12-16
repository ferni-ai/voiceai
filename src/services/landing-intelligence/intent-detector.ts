/**
 * Intent Detector
 *
 * Analyzes visitor behavior signals to infer intent and optimize content.
 * Uses Gemini for sophisticated pattern analysis.
 *
 * @module services/landing-intelligence/intent-detector
 */

import { createLogger } from '../../utils/safe-logger.js';
import { generateJSON } from './gemini-client.js';

const log = createLogger({ module: 'IntentDetector' });

// ============================================================================
// TYPES
// ============================================================================

export interface BehaviorSignals {
  /** Scroll pattern based on speed and pauses */
  scrollPattern: 'scanning' | 'reading' | 'searching' | 'bouncing';

  /** Sections they spent time on */
  sectionsViewed: string[];

  /** Time spent per section in seconds */
  timePerSection: Record<string, number>;

  /** Scroll depth percentage */
  scrollDepth: number;

  /** Total time on page in seconds */
  timeOnPage: number;

  /** Number of clicks (excluding navigation) */
  clickCount: number;

  /** Sections they hovered over but didn't engage */
  sectionsHovered: string[];

  /** Mouse movement pattern */
  mousePattern: 'calm' | 'erratic' | 'decisive' | 'hesitant';

  /** CTA hover without click */
  ctaHoverWithoutClick: boolean;

  /** Scroll direction changes (indicates searching) */
  scrollReversals: number;

  /** Device type */
  device: 'mobile' | 'tablet' | 'desktop';

  /** Referrer source category */
  referrerType: 'search' | 'social' | 'direct' | 'ad' | 'referral' | 'unknown';
}

export interface VisitorIntent {
  /** Primary concern or need */
  primaryConcern:
    | 'anxiety'
    | 'loneliness'
    | 'career'
    | 'relationship'
    | 'habits'
    | 'overwhelm'
    | 'self-improvement'
    | 'curiosity'
    | 'unknown';

  /** Where they are in the buying journey */
  buyingStage: 'awareness' | 'consideration' | 'decision' | 'skeptical';

  /** Confidence in this assessment (0-1) */
  confidence: number;

  /** Emotional state indicators */
  emotionalState: 'calm' | 'anxious' | 'hopeful' | 'skeptical' | 'urgent';

  /** What content would resonate */
  recommendedContent: string[];

  /** Suggested action to take */
  suggestedAction: string;

  /** Why we think this */
  reasoning: string;
}

export interface IntentDetectionResult {
  intent: VisitorIntent;
  signals: BehaviorSignals;
  timestamp: Date;
}

// ============================================================================
// HEURISTIC ANALYSIS (Fast, No AI)
// ============================================================================

function analyzeHeuristically(signals: BehaviorSignals): Partial<VisitorIntent> {
  const result: Partial<VisitorIntent> = {
    confidence: 0.5, // Base confidence for heuristics
  };

  // Determine buying stage from engagement
  if (signals.timeOnPage < 10) {
    result.buyingStage = 'awareness';
  } else if (signals.scrollDepth > 75 && signals.timeOnPage > 60) {
    result.buyingStage = 'decision';
  } else if (signals.ctaHoverWithoutClick || signals.scrollReversals > 3) {
    result.buyingStage = 'skeptical';
  } else {
    result.buyingStage = 'consideration';
  }

  // Determine emotional state from behavior patterns
  if (signals.mousePattern === 'erratic' || signals.scrollPattern === 'bouncing') {
    result.emotionalState = 'anxious';
  } else if (signals.scrollPattern === 'reading' && signals.timeOnPage > 120) {
    result.emotionalState = 'hopeful';
  } else if (signals.ctaHoverWithoutClick) {
    result.emotionalState = 'skeptical';
  } else {
    result.emotionalState = 'calm';
  }

  // Infer concern from sections viewed
  const sectionConcernMap: Record<string, VisitorIntent['primaryConcern']> = {
    'two-am': 'anxiety',
    memory: 'loneliness',
    'memory-demo': 'loneliness',
    team: 'curiosity',
    'use-cases': 'self-improvement',
    journey: 'relationship',
    pricing: 'curiosity',
    proof: 'skeptical' as unknown as VisitorIntent['primaryConcern'],
  };

  // Find most engaged section
  let maxTime = 0;
  let topSection = '';
  for (const [section, time] of Object.entries(signals.timePerSection)) {
    if (time > maxTime) {
      maxTime = time;
      topSection = section;
    }
  }

  if (topSection && sectionConcernMap[topSection]) {
    result.primaryConcern = sectionConcernMap[topSection];
  }

  return result;
}

// ============================================================================
// AI-POWERED ANALYSIS
// ============================================================================

const INTENT_DETECTION_PROMPT = `You are analyzing a landing page visitor's behavior to understand their intent.

VISITOR BEHAVIOR:
{signals}

FERNI CONTEXT:
Ferni is an AI life coach that offers:
- 24/7 availability (2am presence)
- Perfect memory (infinite recall)
- Six specialist personas (life coach, researcher, communicator, habits expert, planner, sage)
- Emotional intelligence (reading between the lines)
- No judgment, constant support

ANALYZE and return JSON:
{
  "primaryConcern": "anxiety" | "loneliness" | "career" | "relationship" | "habits" | "overwhelm" | "self-improvement" | "curiosity" | "unknown",
  "buyingStage": "awareness" | "consideration" | "decision" | "skeptical",
  "confidence": 0.0-1.0,
  "emotionalState": "calm" | "anxious" | "hopeful" | "skeptical" | "urgent",
  "recommendedContent": ["content_id", ...],
  "suggestedAction": "what to do next",
  "reasoning": "brief explanation"
}

Content IDs available: "two-am-demo", "memory-showcase", "team-intro", "pricing-friendly", "proof-table", "use-case-career", "use-case-anxiety", "use-case-habits", "use-case-relationships", "presence-mode", "faq-expanded"`;

export async function detectVisitorIntent(
  signals: BehaviorSignals
): Promise<IntentDetectionResult> {
  const startTime = Date.now();

  // First, get heuristic baseline
  const heuristicIntent = analyzeHeuristically(signals);

  // Then enhance with AI if available
  try {
    const prompt = INTENT_DETECTION_PROMPT.replace('{signals}', JSON.stringify(signals, null, 2));

    const aiIntent = await generateJSON<VisitorIntent>(prompt, {
      timeout: 3000,
      cacheTTL: 60 * 1000, // Cache for 1 minute (behavior changes)
    });

    if (aiIntent) {
      log.info(
        {
          latency: Date.now() - startTime,
          concern: aiIntent.primaryConcern,
          stage: aiIntent.buyingStage,
        },
        'AI intent detection complete'
      );

      return {
        intent: aiIntent,
        signals,
        timestamp: new Date(),
      };
    }
  } catch (error) {
    log.warn({ error }, 'AI intent detection failed, using heuristics');
  }

  // Fall back to heuristics
  const fallbackIntent: VisitorIntent = {
    primaryConcern: heuristicIntent.primaryConcern || 'unknown',
    buyingStage: heuristicIntent.buyingStage || 'awareness',
    confidence: heuristicIntent.confidence || 0.3,
    emotionalState: heuristicIntent.emotionalState || 'calm',
    recommendedContent: getDefaultContent(heuristicIntent.buyingStage || 'awareness'),
    suggestedAction: 'Show default experience',
    reasoning: 'Heuristic analysis based on behavior patterns',
  };

  return {
    intent: fallbackIntent,
    signals,
    timestamp: new Date(),
  };
}

function getDefaultContent(stage: VisitorIntent['buyingStage']): string[] {
  switch (stage) {
    case 'awareness':
      return ['two-am-demo', 'memory-showcase'];
    case 'consideration':
      return ['team-intro', 'use-case-career', 'use-case-habits'];
    case 'decision':
      return ['pricing-friendly', 'proof-table', 'faq-expanded'];
    case 'skeptical':
      return ['proof-table', 'faq-expanded', 'presence-mode'];
    default:
      return ['two-am-demo'];
  }
}

// ============================================================================
// BATCH ANALYSIS (for A/B testing insights)
// ============================================================================

export interface AggregatedIntentData {
  totalVisitors: number;
  concernDistribution: Record<VisitorIntent['primaryConcern'], number>;
  stageDistribution: Record<VisitorIntent['buyingStage'], number>;
  averageConfidence: number;
  topRecommendedContent: string[];
}

export function aggregateIntentData(results: IntentDetectionResult[]): AggregatedIntentData {
  const concernCounts: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  const contentCounts: Record<string, number> = {};
  let totalConfidence = 0;

  for (const result of results) {
    const { intent } = result;

    // Count concerns
    concernCounts[intent.primaryConcern] = (concernCounts[intent.primaryConcern] || 0) + 1;

    // Count stages
    stageCounts[intent.buyingStage] = (stageCounts[intent.buyingStage] || 0) + 1;

    // Count content recommendations
    for (const content of intent.recommendedContent) {
      contentCounts[content] = (contentCounts[content] || 0) + 1;
    }

    totalConfidence += intent.confidence;
  }

  // Sort content by count
  const sortedContent = Object.entries(contentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([content]) => content);

  return {
    totalVisitors: results.length,
    concernDistribution: concernCounts as Record<VisitorIntent['primaryConcern'], number>,
    stageDistribution: stageCounts as Record<VisitorIntent['buyingStage'], number>,
    averageConfidence: results.length > 0 ? totalConfidence / results.length : 0,
    topRecommendedContent: sortedContent,
  };
}
