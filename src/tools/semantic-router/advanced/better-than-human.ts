/**
 * Better Than Human Intelligence
 *
 * Superhuman capabilities that transcend human limitations:
 *
 * 1. **Voice Prosody → Tool Boost** - Detect stress/excitement and adjust routing
 * 2. **Explanation Transparency** - Tell users WHY we routed to a tool
 * 3. **Emotional Arc Tracking** - 7-day emotional trend with proactive interventions
 * 4. **Speaking Pace Detection** - Rushed = urgent, slow = reflective
 *
 * @module semantic-router/advanced/better-than-human
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'SemanticRouter.BetterThanHuman' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceProsodySignals {
  // Core voice signals
  stressLevel: number; // 0-1
  arousal: number; // 0-1 (energy level)
  valence: number; // -1 to 1 (negative to positive)

  // Speaking pace
  wordsPerMinute?: number;
  averagePauseDuration?: number;
  hesitationCount?: number;

  // Anxiety markers
  anxietyMarkers?: string[];
  voiceTremor?: boolean;
  breathingPattern?: 'normal' | 'rapid' | 'shallow';
}

export interface SpeakingPaceAnalysis {
  pace: 'very_slow' | 'slow' | 'normal' | 'fast' | 'very_fast';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  interpretation: string;
  suggestedResponse: 'match_pace' | 'slow_down' | 'speed_up' | 'stay_calm';
}

export interface EmotionalDataPoint {
  timestamp: Date;
  emotion: string;
  intensity: number; // 0-1
  valence: number; // -1 to 1
  source: 'voice' | 'text' | 'inferred';
  context?: string;
}

export interface EmotionalArc {
  userId: string;
  period: '24h' | '7d' | '30d';

  // Aggregated metrics
  dominantEmotion: string;
  averageValence: number;
  volatility: number; // How much emotions swing
  trend: 'improving' | 'declining' | 'stable';

  // Time series
  dataPoints: EmotionalDataPoint[];

  // Alerts
  concerningPatterns: Array<{
    pattern: string;
    severity: 'low' | 'medium' | 'high';
    recommendation: string;
    toolSuggestion?: string;
  }>;

  // Proactive intervention opportunities
  interventionOpportunities: Array<{
    type: 'check_in' | 'wellness' | 'celebration' | 'support';
    reason: string;
    urgency: 'low' | 'medium' | 'high';
    suggestedTool: string;
    suggestedMessage: string;
  }>;
}

export interface ToolBoostDecision {
  boostedTools: string[];
  suppressedTools: string[];
  reason: string;
  prosodySignals: Partial<VoiceProsodySignals>;
  confidence: number;
}

export interface RoutingExplanation {
  primaryReason: string;
  factors: Array<{
    factor: string;
    weight: number;
    evidence: string;
  }>;
  alternatives: Array<{
    toolId: string;
    whyNotChosen: string;
    confidence: number;
  }>;
  userFriendlyExplanation: string;
}

// ============================================================================
// 1. VOICE PROSODY → TOOL BOOST
// ============================================================================

/**
 * Analyze voice prosody and determine which tools to boost/suppress
 */
export function analyzeVoiceProsodyForToolBoost(prosody: VoiceProsodySignals): ToolBoostDecision {
  const boostedTools: string[] = [];
  const suppressedTools: string[] = [];
  const reasons: string[] = [];

  // High stress → boost wellness tools
  if (prosody.stressLevel > 0.6) {
    boostedTools.push(
      'wellness_checkin',
      'grounding_exercise',
      'breathing_exercise',
      'mindfulness',
      'stress_relief'
    );
    reasons.push(`High stress detected (${(prosody.stressLevel * 100).toFixed(0)}%)`);

    // Suppress potentially overwhelming tools
    suppressedTools.push('calendar_create_event', 'task_create', 'bill_reminder');
  }

  // Anxiety markers → boost calming tools
  if (prosody.anxietyMarkers && prosody.anxietyMarkers.length > 0) {
    boostedTools.push('anxiety_support', 'calm_down', 'safe_space');
    reasons.push(`Anxiety markers detected: ${prosody.anxietyMarkers.join(', ')}`);
  }

  // Voice tremor → check in gently
  if (prosody.voiceTremor) {
    boostedTools.push('emotional_support', 'active_listening');
    reasons.push('Voice tremor detected');
  }

  // High arousal + positive valence → boost engagement tools
  if (prosody.arousal > 0.7 && prosody.valence > 0.3) {
    boostedTools.push('celebration', 'goal_progress', 'habit_streak');
    reasons.push('Excitement detected');
  }

  // Low arousal + negative valence → boost energy/support tools
  if (prosody.arousal < 0.3 && prosody.valence < -0.2) {
    boostedTools.push('mood_boost', 'gentle_motivation', 'self_compassion');
    suppressedTools.push('intense_workout', 'challenging_task');
    reasons.push('Low energy/mood detected');
  }

  // Rapid breathing → prioritize calming
  if (prosody.breathingPattern === 'rapid' || prosody.breathingPattern === 'shallow') {
    boostedTools.push('breathing_exercise', 'grounding_exercise');
    reasons.push('Rapid breathing pattern');
  }

  return {
    boostedTools: [...new Set(boostedTools)],
    suppressedTools: [...new Set(suppressedTools)],
    reason: reasons.join('; ') || 'Normal prosody',
    prosodySignals: prosody,
    confidence: calculateProsodyConfidence(prosody),
  };
}

function calculateProsodyConfidence(prosody: VoiceProsodySignals): number {
  // More signals = higher confidence
  let signals = 0;
  let total = 0;

  if (prosody.stressLevel !== undefined) {
    signals++;
    total++;
  }
  if (prosody.arousal !== undefined) {
    signals++;
    total++;
  }
  if (prosody.valence !== undefined) {
    signals++;
    total++;
  }
  if (prosody.anxietyMarkers && prosody.anxietyMarkers.length > 0) {
    signals++;
    total++;
  }
  if (prosody.wordsPerMinute !== undefined) {
    signals++;
    total++;
  }

  return total > 0 ? signals / total : 0.5;
}

// ============================================================================
// 2. EXPLANATION TRANSPARENCY
// ============================================================================

/**
 * Generate a human-readable explanation for why we routed to a tool
 */
export function generateRoutingExplanation(
  selectedToolId: string,
  confidence: number,
  factors: {
    matchedPhrases?: string[];
    matchedKeywords?: string[];
    patternMatches?: string[];
    entityMatches?: Array<{ type: string; value: string }>;
    userVocabulary?: boolean;
    timePattern?: boolean;
    emotionBoost?: boolean;
    chainPrediction?: boolean;
  },
  alternatives: Array<{ toolId: string; confidence: number }>
): RoutingExplanation {
  const factorList: RoutingExplanation['factors'] = [];

  // Build factor list with weights
  if (factors.matchedPhrases && factors.matchedPhrases.length > 0) {
    factorList.push({
      factor: 'Phrase match',
      weight: 0.4,
      evidence: `You said "${factors.matchedPhrases[0]}"`,
    });
  }

  if (factors.matchedKeywords && factors.matchedKeywords.length > 0) {
    factorList.push({
      factor: 'Keyword match',
      weight: 0.2,
      evidence: `Keywords: ${factors.matchedKeywords.slice(0, 3).join(', ')}`,
    });
  }

  if (factors.entityMatches && factors.entityMatches.length > 0) {
    factorList.push({
      factor: 'Entity recognition',
      weight: 0.15,
      evidence: `Detected: ${factors.entityMatches.map((e) => `${e.type}="${e.value}"`).join(', ')}`,
    });
  }

  if (factors.emotionBoost) {
    factorList.push({
      factor: 'Emotional context',
      weight: 0.15,
      evidence: 'Your voice suggested you might benefit from this',
    });
  }

  if (factors.userVocabulary) {
    factorList.push({
      factor: 'Personal vocabulary',
      weight: 0.1,
      evidence: "I've learned this is what you usually mean",
    });
  }

  if (factors.timePattern) {
    factorList.push({
      factor: 'Time pattern',
      weight: 0.05,
      evidence: 'You often use this tool at this time',
    });
  }

  if (factors.chainPrediction) {
    factorList.push({
      factor: 'Anticipated need',
      weight: 0.05,
      evidence: 'Based on what you typically do next',
    });
  }

  // Generate user-friendly explanation
  const primaryFactor = factorList.length > 0 ? factorList[0] : null;
  let userFriendlyExplanation = '';

  if (primaryFactor) {
    userFriendlyExplanation = primaryFactor.evidence;

    if (factorList.length > 1) {
      userFriendlyExplanation += ` (${factorList.length - 1} other factors)`;
    }
  } else {
    userFriendlyExplanation = 'This seemed like the best match for what you asked.';
  }

  // Build alternatives explanation
  const alternativeExplanations = alternatives.slice(0, 3).map((alt) => ({
    toolId: alt.toolId,
    whyNotChosen:
      alt.confidence < confidence
        ? `Lower confidence (${(alt.confidence * 100).toFixed(0)}% vs ${(confidence * 100).toFixed(0)}%)`
        : 'Less relevant to your request',
    confidence: alt.confidence,
  }));

  return {
    primaryReason: primaryFactor?.factor || 'Best overall match',
    factors: factorList,
    alternatives: alternativeExplanations,
    userFriendlyExplanation,
  };
}

/**
 * Generate a spoken explanation (shorter, more natural)
 */
export function generateSpokenExplanation(explanation: RoutingExplanation): string {
  const { userFriendlyExplanation, alternatives } = explanation;

  if (alternatives.length > 0 && alternatives[0].confidence > 0.5) {
    return `${userFriendlyExplanation}. I could also help with ${alternatives[0].toolId.replace(/_/g, ' ')} if that's not what you meant.`;
  }

  return userFriendlyExplanation;
}

// ============================================================================
// 3. EMOTIONAL ARC TRACKING
// ============================================================================

// In-memory storage for emotional data (would be Firestore in production)
const emotionalHistory = new Map<string, EmotionalDataPoint[]>();

/**
 * Record an emotional data point
 */
export function recordEmotionalDataPoint(
  userId: string,
  emotion: string,
  intensity: number,
  valence: number,
  source: 'voice' | 'text' | 'inferred',
  context?: string
): void {
  const dataPoint: EmotionalDataPoint = {
    timestamp: new Date(),
    emotion,
    intensity,
    valence,
    source,
    context,
  };

  const history = emotionalHistory.get(userId) || [];
  history.push(dataPoint);

  // Keep last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const filtered = history.filter((dp) => dp.timestamp > thirtyDaysAgo);

  emotionalHistory.set(userId, filtered);

  log.debug({ userId, emotion, intensity, valence }, 'Emotional data point recorded');
}

/**
 * Analyze emotional arc over a time period
 */
export function analyzeEmotionalArc(
  userId: string,
  period: '24h' | '7d' | '30d' = '7d'
): EmotionalArc {
  const history = emotionalHistory.get(userId) || [];

  // Calculate period cutoff
  const now = new Date();
  const cutoff = new Date();
  switch (period) {
    case '24h':
      cutoff.setHours(cutoff.getHours() - 24);
      break;
    case '7d':
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case '30d':
      cutoff.setDate(cutoff.getDate() - 30);
      break;
  }

  const relevantData = history.filter((dp) => dp.timestamp > cutoff);

  if (relevantData.length === 0) {
    return {
      userId,
      period,
      dominantEmotion: 'unknown',
      averageValence: 0,
      volatility: 0,
      trend: 'stable',
      dataPoints: [],
      concerningPatterns: [],
      interventionOpportunities: [],
    };
  }

  // Calculate metrics
  const emotionCounts = new Map<string, number>();
  let totalValence = 0;
  const valences: number[] = [];

  for (const dp of relevantData) {
    emotionCounts.set(dp.emotion, (emotionCounts.get(dp.emotion) || 0) + 1);
    totalValence += dp.valence;
    valences.push(dp.valence);
  }

  // Find dominant emotion
  let dominantEmotion = 'neutral';
  let maxCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  // Calculate average valence
  const averageValence = totalValence / relevantData.length;

  // Calculate volatility (standard deviation of valence)
  const variance =
    valences.reduce((sum, v) => sum + Math.pow(v - averageValence, 2), 0) / valences.length;
  const volatility = Math.sqrt(variance);

  // Determine trend (compare first half to second half)
  const midpoint = Math.floor(relevantData.length / 2);
  const firstHalf = relevantData.slice(0, midpoint);
  const secondHalf = relevantData.slice(midpoint);

  const firstHalfAvg = firstHalf.reduce((sum, dp) => sum + dp.valence, 0) / (firstHalf.length || 1);
  const secondHalfAvg =
    secondHalf.reduce((sum, dp) => sum + dp.valence, 0) / (secondHalf.length || 1);

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (secondHalfAvg - firstHalfAvg > 0.2) {
    trend = 'improving';
  } else if (firstHalfAvg - secondHalfAvg > 0.2) {
    trend = 'declining';
  }

  // Detect concerning patterns
  const concerningPatterns = detectConcerningPatterns(relevantData, averageValence, volatility);

  // Generate intervention opportunities
  const interventionOpportunities = generateInterventionOpportunities(
    relevantData,
    dominantEmotion,
    trend,
    concerningPatterns
  );

  return {
    userId,
    period,
    dominantEmotion,
    averageValence,
    volatility,
    trend,
    dataPoints: relevantData,
    concerningPatterns,
    interventionOpportunities,
  };
}

function detectConcerningPatterns(
  data: EmotionalDataPoint[],
  avgValence: number,
  volatility: number
): EmotionalArc['concerningPatterns'] {
  const patterns: EmotionalArc['concerningPatterns'] = [];

  // Pattern 1: Consistently negative
  if (avgValence < -0.3) {
    patterns.push({
      pattern: 'Persistent negative mood',
      severity: avgValence < -0.5 ? 'high' : 'medium',
      recommendation: 'Consider a wellness check-in',
      toolSuggestion: 'wellness_checkin',
    });
  }

  // Pattern 2: High volatility
  if (volatility > 0.5) {
    patterns.push({
      pattern: 'Emotional volatility',
      severity: volatility > 0.7 ? 'high' : 'medium',
      recommendation: 'Grounding exercises may help stabilize',
      toolSuggestion: 'grounding_exercise',
    });
  }

  // Pattern 3: Consecutive stressed days
  const stressedDays = countConsecutiveEmotionDays(data, ['stressed', 'anxious', 'overwhelmed']);
  if (stressedDays >= 3) {
    patterns.push({
      pattern: `${stressedDays} consecutive days of stress`,
      severity: stressedDays >= 5 ? 'high' : 'medium',
      recommendation: 'Extended stress period detected',
      toolSuggestion: 'stress_relief',
    });
  }

  // Pattern 4: Declining trend
  const recentData = data.slice(-5);
  const recentTrend =
    recentData.length > 1 ? recentData[recentData.length - 1].valence - recentData[0].valence : 0;

  if (recentTrend < -0.3) {
    patterns.push({
      pattern: 'Recent emotional decline',
      severity: 'medium',
      recommendation: 'Check in on how things are going',
      toolSuggestion: 'emotional_support',
    });
  }

  // Pattern 5: Loneliness indicators
  const lonelyCount = data.filter((dp) =>
    ['lonely', 'isolated', 'disconnected'].includes(dp.emotion.toLowerCase())
  ).length;
  if (lonelyCount >= 2) {
    patterns.push({
      pattern: 'Loneliness signals',
      severity: lonelyCount >= 4 ? 'high' : 'low',
      recommendation: 'Social connection may help',
      toolSuggestion: 'connection_support',
    });
  }

  return patterns;
}

function countConsecutiveEmotionDays(data: EmotionalDataPoint[], emotions: string[]): number {
  // Group by day
  const byDay = new Map<string, EmotionalDataPoint[]>();
  for (const dp of data) {
    const dayKey = dp.timestamp.toISOString().split('T')[0];
    const dayData = byDay.get(dayKey) || [];
    dayData.push(dp);
    byDay.set(dayKey, dayData);
  }

  // Check consecutive days
  const sortedDays = [...byDay.keys()].sort();
  let maxConsecutive = 0;
  let currentConsecutive = 0;

  for (const day of sortedDays) {
    const dayData = byDay.get(day) || [];
    const hasTargetEmotion = dayData.some((dp) =>
      emotions.some((e) => dp.emotion.toLowerCase().includes(e))
    );

    if (hasTargetEmotion) {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 0;
    }
  }

  return maxConsecutive;
}

function generateInterventionOpportunities(
  data: EmotionalDataPoint[],
  dominantEmotion: string,
  trend: string,
  concerningPatterns: EmotionalArc['concerningPatterns']
): EmotionalArc['interventionOpportunities'] {
  const opportunities: EmotionalArc['interventionOpportunities'] = [];

  // Based on concerning patterns
  for (const pattern of concerningPatterns) {
    if (pattern.severity === 'high') {
      opportunities.push({
        type: 'support',
        reason: pattern.pattern,
        urgency: 'high',
        suggestedTool: pattern.toolSuggestion || 'wellness_checkin',
        suggestedMessage: `Hey, I've noticed ${pattern.pattern.toLowerCase()}. Would you like to talk about it?`,
      });
    }
  }

  // Positive interventions
  if (trend === 'improving') {
    opportunities.push({
      type: 'celebration',
      reason: 'Emotional trend improving',
      urgency: 'low',
      suggestedTool: 'celebration',
      suggestedMessage:
        "I've noticed you've been feeling better lately. That's wonderful! What's been helping?",
    });
  }

  // Check-in for stable but negative
  if (trend === 'stable' && dominantEmotion.match(/sad|stressed|anxious/i)) {
    opportunities.push({
      type: 'check_in',
      reason: 'Consistent negative emotion',
      urgency: 'medium',
      suggestedTool: 'emotional_support',
      suggestedMessage: "How are you really doing? I'm here if you want to talk.",
    });
  }

  // Wellness suggestion for neutral
  if (data.length < 3) {
    opportunities.push({
      type: 'wellness',
      reason: 'Limited emotional data',
      urgency: 'low',
      suggestedTool: 'mood_check',
      suggestedMessage: "I'd love to understand how you're feeling. Mind sharing?",
    });
  }

  return opportunities;
}

/**
 * Get emotional arc summary for display
 */
export function getEmotionalArcSummary(arc: EmotionalArc): string {
  const trendEmoji = arc.trend === 'improving' ? '📈' : arc.trend === 'declining' ? '📉' : '➡️';
  const valenceEmoji = arc.averageValence > 0.2 ? '😊' : arc.averageValence < -0.2 ? '😔' : '😐';

  let summary = `${trendEmoji} ${valenceEmoji} `;
  summary += `Over the last ${arc.period}, your dominant emotion has been ${arc.dominantEmotion}. `;

  if (arc.trend === 'improving') {
    summary += 'Things seem to be getting better! ';
  } else if (arc.trend === 'declining') {
    summary += "I've noticed things have been tougher lately. ";
  }

  if (arc.concerningPatterns.length > 0) {
    summary += `I'm keeping an eye on ${arc.concerningPatterns.length} pattern(s) that might need attention.`;
  }

  return summary;
}

// ============================================================================
// 4. SPEAKING PACE DETECTION
// ============================================================================

/**
 * Analyze speaking pace and determine user state
 */
export function analyzeSpeakingPace(
  wordsPerMinute: number,
  pausePatterns?: {
    averagePauseDuration: number;
    pauseCount: number;
    longestPause: number;
  }
): SpeakingPaceAnalysis {
  // Normal speaking pace is 120-150 WPM
  let pace: SpeakingPaceAnalysis['pace'];
  let urgency: SpeakingPaceAnalysis['urgency'];
  let interpretation: string;
  let suggestedResponse: SpeakingPaceAnalysis['suggestedResponse'];

  if (wordsPerMinute < 80) {
    pace = 'very_slow';
    urgency = 'low';
    interpretation = 'User is being thoughtful/careful, possibly tired or sad';
    suggestedResponse = 'match_pace';
  } else if (wordsPerMinute < 110) {
    pace = 'slow';
    urgency = 'low';
    interpretation = 'User is relaxed or being deliberate';
    suggestedResponse = 'match_pace';
  } else if (wordsPerMinute <= 160) {
    pace = 'normal';
    urgency = 'medium';
    interpretation = 'Normal conversational pace';
    suggestedResponse = 'match_pace';
  } else if (wordsPerMinute <= 200) {
    pace = 'fast';
    urgency = 'high';
    interpretation = 'User is excited or in a hurry';
    suggestedResponse = 'speed_up';
  } else {
    pace = 'very_fast';
    urgency = 'critical';
    interpretation = 'User is very rushed, anxious, or urgent';
    suggestedResponse = 'stay_calm';
  }

  // Adjust based on pauses
  if (pausePatterns) {
    // Many long pauses + slow speech = contemplative or struggling
    if (pausePatterns.averagePauseDuration > 2 && pace === 'slow') {
      interpretation = 'User is thinking deeply or struggling to express something';
      suggestedResponse = 'slow_down';
    }

    // Fast speech with few pauses = urgent stream of consciousness
    if (pausePatterns.pauseCount < 2 && pace === 'very_fast') {
      urgency = 'critical';
      interpretation = 'User is anxious or panicking';
      suggestedResponse = 'stay_calm';
    }
  }

  // Calculate confidence based on data available
  const confidence = pausePatterns ? 0.85 : 0.7;

  return {
    pace,
    urgency,
    confidence,
    interpretation,
    suggestedResponse,
  };
}

/**
 * Get tool boost based on speaking pace
 */
export function getToolBoostFromPace(paceAnalysis: SpeakingPaceAnalysis): string[] {
  const boostedTools: string[] = [];

  switch (paceAnalysis.pace) {
    case 'very_slow':
      // User might be sad or tired
      boostedTools.push('gentle_support', 'rest_reminder', 'mood_check');
      break;

    case 'very_fast':
      // User is rushed or anxious
      boostedTools.push('quick_answer', 'breathing_exercise', 'calm_down');
      break;

    case 'fast':
      // User wants efficiency
      boostedTools.push('quick_answer', 'summary', 'shortcut');
      break;
  }

  if (paceAnalysis.urgency === 'critical') {
    boostedTools.push('priority_response', 'immediate_help');
  }

  return boostedTools;
}

// ============================================================================
// COMBINED ANALYSIS
// ============================================================================

export interface BetterThanHumanAnalysis {
  // From prosody
  toolBoost: ToolBoostDecision;

  // From pace
  paceAnalysis?: SpeakingPaceAnalysis;
  paceBoostTools: string[];

  // Combined
  allBoostedTools: string[];
  allSuppressedTools: string[];

  // Emotional context
  recentEmotionalState?: {
    dominantEmotion: string;
    trend: string;
    needsAttention: boolean;
  };

  // Suggested intervention
  suggestedIntervention?: {
    type: string;
    message: string;
    tool: string;
    urgency: string;
  };
}

/**
 * Perform full "Better Than Human" analysis
 */
export function performBetterThanHumanAnalysis(
  userId: string,
  prosody?: VoiceProsodySignals,
  wordsPerMinute?: number
): BetterThanHumanAnalysis {
  // Analyze prosody
  const toolBoost = prosody
    ? analyzeVoiceProsodyForToolBoost(prosody)
    : {
        boostedTools: [],
        suppressedTools: [],
        reason: 'No prosody data',
        prosodySignals: {},
        confidence: 0,
      };

  // Analyze pace
  const paceAnalysis = wordsPerMinute ? analyzeSpeakingPace(wordsPerMinute) : undefined;
  const paceBoostTools = paceAnalysis ? getToolBoostFromPace(paceAnalysis) : [];

  // Get emotional arc
  const emotionalArc = analyzeEmotionalArc(userId, '7d');

  // Combine all boosted tools
  const allBoostedTools = [...new Set([...toolBoost.boostedTools, ...paceBoostTools])];

  // Get intervention opportunity
  const intervention = emotionalArc.interventionOpportunities[0];

  return {
    toolBoost,
    paceAnalysis,
    paceBoostTools,
    allBoostedTools,
    allSuppressedTools: toolBoost.suppressedTools,
    recentEmotionalState: {
      dominantEmotion: emotionalArc.dominantEmotion,
      trend: emotionalArc.trend,
      needsAttention: emotionalArc.concerningPatterns.length > 0,
    },
    suggestedIntervention: intervention
      ? {
          type: intervention.type,
          message: intervention.suggestedMessage,
          tool: intervention.suggestedTool,
          urgency: intervention.urgency,
        }
      : undefined,
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

/**
 * Save emotional history to Firestore
 */
export async function persistEmotionalHistory(userId: string): Promise<void> {
  const history = emotionalHistory.get(userId);
  if (!history || history.length === 0) return;

  try {
    const { getFirestore, initializeFirestorePersistence } =
      await import('../persistence/firestore-persistence.js');
    await initializeFirestorePersistence();
    const db = getFirestore();
    if (!db) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .collection('emotional_history')
      .doc(userId)
      .set(cleanForFirestore({
        userId,
        dataPoints: history.map((dp) => ({
          ...dp,
          timestamp: dp.timestamp.toISOString(),
        })),
        lastUpdated: new Date().toISOString(),
      }));

    log.debug({ userId, dataPointCount: history.length }, 'Emotional history persisted');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist emotional history');
  }
}

/**
 * Load emotional history from Firestore
 */
export async function loadEmotionalHistory(userId: string): Promise<void> {
  try {
    const { getFirestore, initializeFirestorePersistence } =
      await import('../persistence/firestore-persistence.js');
    await initializeFirestorePersistence();
    const db = getFirestore();
    if (!db) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (db as any).collection('emotional_history').doc(userId).get();
    if (!doc.exists) return;

    const data = doc.data();
    if (!data?.dataPoints) return;

    const history = data.dataPoints.map(
      (dp: {
        timestamp: string;
        emotion: string;
        intensity: number;
        valence: number;
        source: string;
        context?: string;
      }) => ({
        ...dp,
        timestamp: new Date(dp.timestamp),
      })
    );

    emotionalHistory.set(userId, history);
    log.debug({ userId, dataPointCount: history.length }, 'Emotional history loaded');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load emotional history');
  }
}
