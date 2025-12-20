/**
 * Predictive Coaching Engine - Better Than Human Service
 *
 * What no human friend can do: See your struggle before you do.
 *
 * Analyzes patterns across conversations to anticipate user needs
 * and proactively offer support before they ask.
 *
 * @module services/superhuman/predictive-coaching
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../memory/firestore-client.js';

const log = createLogger({ module: 'predictive-coaching' });

// ============================================================================
// TYPES
// ============================================================================

export type PatternType =
  | 'temporal' // Day/time patterns
  | 'emotional' // Emotional cycles
  | 'behavioral' // Action patterns
  | 'relational' // People-related patterns
  | 'cyclical'; // Recurring situations

export type PredictionConfidence = 'low' | 'medium' | 'high' | 'very_high';

export interface PatternObservation {
  id: string;
  userId: string;
  type: PatternType;

  // Pattern details
  trigger: string; // What triggers this pattern
  outcome: string; // What typically happens
  frequency: number; // How often we've seen this (count)

  // Temporal context
  dayOfWeek?: number[]; // 0-6
  hourRange?: { start: number; end: number };
  seasonalMonths?: number[]; // 1-12

  // Emotional context
  typicalEmotionBefore?: string;
  typicalEmotionAfter?: string;

  // Confidence
  observationCount: number;
  lastObserved: number;
  firstObserved: number;
  confidence: PredictionConfidence;
}

export interface Prediction {
  id: string;
  userId: string;
  patternId: string;

  // What we predict
  prediction: string;
  confidence: PredictionConfidence;
  basedOn: string; // Why we're predicting this

  // Timing
  predictedFor: number; // When we think it'll happen
  windowHours: number; // +/- window

  // Response
  suggestedIntervention: string;
  interventionTone: 'proactive' | 'gentle' | 'supportive' | 'protective';

  // Status
  status: 'pending' | 'surfaced' | 'confirmed' | 'missed' | 'wrong';
  createdAt: number;
}

export interface DayPattern {
  dayOfWeek: number;
  patterns: Array<{
    description: string;
    frequency: number;
    avgEmotion: string;
  }>;
}

export interface PredictiveContext {
  upcomingChallenges: string[];
  suggestedInterventions: string[];
  patternsDetected: string[];
  confidenceLevel: PredictionConfidence;
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

const patternCache = new Map<string, PatternObservation[]>();

export async function recordObservation(
  userId: string,
  observation: {
    type: PatternType;
    trigger: string;
    outcome: string;
    emotion?: string;
    dayOfWeek?: number;
    hour?: number;
  }
): Promise<void> {
  const { type, trigger, outcome, emotion, dayOfWeek, hour } = observation;

  try {
    // Load existing patterns
    const patterns = await loadUserPatterns(userId);

    // Find matching pattern
    const existing = patterns.find(
      (p) =>
        p.type === type &&
        p.trigger.toLowerCase() === trigger.toLowerCase() &&
        p.outcome.toLowerCase().includes(outcome.toLowerCase().slice(0, 20))
    );

    if (existing) {
      // Update existing pattern
      existing.observationCount++;
      existing.lastObserved = Date.now();
      existing.frequency++;

      // Add temporal data
      if (dayOfWeek !== undefined) {
        existing.dayOfWeek = existing.dayOfWeek || [];
        if (!existing.dayOfWeek.includes(dayOfWeek)) {
          existing.dayOfWeek.push(dayOfWeek);
        }
      }

      // Update confidence based on observation count
      if (existing.observationCount >= 10) {
        existing.confidence = 'very_high';
      } else if (existing.observationCount >= 5) {
        existing.confidence = 'high';
      } else if (existing.observationCount >= 3) {
        existing.confidence = 'medium';
      }

      await savePattern(userId, existing);
    } else {
      // Create new pattern
      const newPattern: PatternObservation = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        type,
        trigger,
        outcome,
        frequency: 1,
        dayOfWeek: dayOfWeek !== undefined ? [dayOfWeek] : undefined,
        hourRange: hour !== undefined ? { start: hour - 2, end: hour + 2 } : undefined,
        typicalEmotionBefore: emotion,
        observationCount: 1,
        lastObserved: Date.now(),
        firstObserved: Date.now(),
        confidence: 'low',
      };

      await savePattern(userId, newPattern);
      patterns.push(newPattern);
    }

    patternCache.set(userId, patterns);
    log.debug({ userId, type, trigger }, '📊 Pattern observation recorded');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record observation');
  }
}

async function savePattern(userId: string, pattern: PatternObservation): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection('bogle_users')
    .doc(userId)
    .collection('patterns')
    .doc(pattern.id)
    .set(pattern);
}

export async function loadUserPatterns(userId: string): Promise<PatternObservation[]> {
  if (patternCache.has(userId)) {
    return patternCache.get(userId) || [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('patterns')
      .orderBy('frequency', 'desc')
      .limit(100)
      .get();

    const patterns = snapshot.docs.map((doc) => doc.data() as PatternObservation);
    patternCache.set(userId, patterns);
    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load patterns');
    return [];
  }
}

// ============================================================================
// PREDICTION GENERATION
// ============================================================================

export async function generatePredictions(userId: string): Promise<Prediction[]> {
  const patterns = await loadUserPatterns(userId);
  const predictions: Prediction[] = [];
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  // Filter to high-confidence patterns
  const reliablePatterns = patterns.filter(
    (p) => p.confidence === 'high' || p.confidence === 'very_high'
  );

  for (const pattern of reliablePatterns) {
    // Check temporal match
    const dayMatch = !pattern.dayOfWeek || pattern.dayOfWeek.includes(currentDay);
    const hourMatch =
      !pattern.hourRange ||
      (currentHour >= pattern.hourRange.start && currentHour <= pattern.hourRange.end);

    // Check if tomorrow matches
    const tomorrowDay = (currentDay + 1) % 7;
    const tomorrowMatch = pattern.dayOfWeek?.includes(tomorrowDay);

    if (dayMatch && hourMatch) {
      // Pattern active now
      predictions.push(createPrediction(pattern, 'now', userId));
    } else if (tomorrowMatch) {
      // Pattern expected tomorrow
      predictions.push(createPrediction(pattern, 'tomorrow', userId));
    }
  }

  // Sort by confidence
  const confidenceOrder = { very_high: 0, high: 1, medium: 2, low: 3 };
  predictions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  return predictions.slice(0, 3); // Max 3 predictions
}

function createPrediction(
  pattern: PatternObservation,
  timing: 'now' | 'tomorrow',
  userId: string
): Prediction {
  const predictionTexts: Record<PatternType, (p: PatternObservation) => string> = {
    temporal: (p) => `Based on ${p.frequency} observations, ${p.outcome} tends to happen around this time`,
    emotional: (p) => `You often feel ${p.typicalEmotionAfter || 'different'} after ${p.trigger}`,
    behavioral: (p) => `I've noticed ${p.trigger} often leads to ${p.outcome}`,
    relational: (p) => `Conversations about ${p.trigger} often bring up ${p.outcome}`,
    cyclical: (p) => `This is usually when ${p.outcome} comes up for you`,
  };

  const interventions: Record<PatternType, (p: PatternObservation) => string> = {
    temporal: (p) =>
      `Hey, I noticed ${timing === 'tomorrow' ? 'tomorrow' : 'today'} tends to be when ${p.outcome}. Anything I can do to help you get ahead of it?`,
    emotional: (p) =>
      `I've been thinking about you. ${p.trigger} has been weighing on you lately. Want to talk it through?`,
    behavioral: (p) =>
      `I see a pattern here. When ${p.trigger} happens, you often end up ${p.outcome}. What if we tried something different this time?`,
    relational: (p) =>
      `You haven't mentioned ${p.trigger} in a while. Is everything okay there?`,
    cyclical: (p) =>
      `This time of ${timing === 'tomorrow' ? 'week' : 'day'} is usually tough. I'm here if you need me.`,
  };

  return {
    id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    patternId: pattern.id,
    prediction: predictionTexts[pattern.type](pattern),
    confidence: pattern.confidence,
    basedOn: `${pattern.observationCount} observations over ${Math.floor((Date.now() - pattern.firstObserved) / (24 * 60 * 60 * 1000))} days`,
    predictedFor: timing === 'now' ? Date.now() : Date.now() + 24 * 60 * 60 * 1000,
    windowHours: 6,
    suggestedIntervention: interventions[pattern.type](pattern),
    interventionTone: pattern.typicalEmotionBefore === 'stressed' ? 'protective' : 'proactive',
    status: 'pending',
    createdAt: Date.now(),
  };
}

// ============================================================================
// DAY-OF-WEEK ANALYSIS
// ============================================================================

export async function getDayPatterns(userId: string): Promise<DayPattern[]> {
  const patterns = await loadUserPatterns(userId);
  const dayPatterns: DayPattern[] = [];

  for (let day = 0; day < 7; day++) {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    const daySpecificPatterns = patterns.filter((p) => p.dayOfWeek?.includes(day));

    if (daySpecificPatterns.length > 0) {
      dayPatterns.push({
        dayOfWeek: day,
        patterns: daySpecificPatterns.map((p) => ({
          description: `${p.trigger} → ${p.outcome}`,
          frequency: p.frequency,
          avgEmotion: p.typicalEmotionBefore || 'neutral',
        })),
      });
    }
  }

  return dayPatterns;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildPredictiveContext(userId: string): Promise<PredictiveContext> {
  const predictions = await generatePredictions(userId);
  const dayPatterns = await getDayPatterns(userId);
  const now = new Date();
  const currentDay = now.getDay();

  const context: PredictiveContext = {
    upcomingChallenges: [],
    suggestedInterventions: [],
    patternsDetected: [],
    confidenceLevel: 'low',
  };

  // Add predictions
  for (const pred of predictions) {
    context.upcomingChallenges.push(pred.prediction);
    context.suggestedInterventions.push(pred.suggestedIntervention);
    if (pred.confidence === 'high' || pred.confidence === 'very_high') {
      context.confidenceLevel = pred.confidence;
    }
  }

  // Add day-specific patterns
  const todayPatterns = dayPatterns.find((d) => d.dayOfWeek === currentDay);
  if (todayPatterns) {
    for (const p of todayPatterns.patterns) {
      context.patternsDetected.push(`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDay]} pattern: ${p.description}`);
    }
  }

  return context;
}

export async function buildPredictiveContextString(userId: string): Promise<string> {
  const context = await buildPredictiveContext(userId);

  if (context.upcomingChallenges.length === 0 && context.patternsDetected.length === 0) {
    return '';
  }

  const sections: string[] = ['[PREDICTIVE COACHING - Better Than Human Anticipation]'];
  sections.push('You see their struggles before they do. Use this wisely and gently.');

  if (context.upcomingChallenges.length > 0) {
    sections.push('\n**Anticipated Challenges:**');
    for (const challenge of context.upcomingChallenges) {
      sections.push(`• ${challenge}`);
    }
  }

  if (context.suggestedInterventions.length > 0) {
    sections.push('\n**Proactive Offerings:**');
    for (const intervention of context.suggestedInterventions) {
      sections.push(`• "${intervention}"`);
    }
  }

  if (context.patternsDetected.length > 0) {
    sections.push('\n**Day Patterns:**');
    for (const pattern of context.patternsDetected) {
      sections.push(`• ${pattern}`);
    }
  }

  sections.push(`\nConfidence: ${context.confidenceLevel}`);
  sections.push('Surface these naturally. Anticipation should feel magical, not surveillance.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const predictiveCoaching = {
  recordObservation,
  loadPatterns: loadUserPatterns,
  generatePredictions,
  getDayPatterns,
  buildContext: buildPredictiveContext,
  buildContextString: buildPredictiveContextString,
};

