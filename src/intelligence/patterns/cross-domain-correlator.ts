/**
 * Cross-Domain Correlator - Unified Intelligence Level 4
 *
 * "Connects dots humans miss"
 *
 * Detects patterns across different life domains that humans
 * couldn't track themselves:
 *
 * - "Your sleep quality drops before big presentations"
 * - "You mention mom more when work stress is high"
 * - "Monday productivity correlates with Sunday sleep"
 *
 * This is a "Better Than Human" capability - no human friend
 * could consistently track these cross-domain patterns.
 *
 * @module intelligence/patterns/cross-domain-correlator
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'cross-domain-correlator' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Domains we track for correlation
 */
export type CorrelationDomain =
  | 'sleep'
  | 'energy'
  | 'mood'
  | 'stress'
  | 'productivity'
  | 'exercise'
  | 'social'
  | 'work'
  | 'family'
  | 'health'
  | 'habits'
  | 'time_of_day'
  | 'day_of_week'
  | 'weather'
  | 'person_mentioned'
  | 'topic_discussed'
  // Extended domains
  | 'calendar'
  | 'financial'
  | 'habit' // singular alias for habits
  | 'task'
  | 'milestone'
  | 'emotion'
  | 'wellness'
  | 'relationships';

/**
 * A signal from a specific domain
 */
export interface DomainSignal {
  domain: CorrelationDomain;
  store: string;
  metric: string;
  direction: 'increased' | 'decreased' | 'changed' | 'stable' | 'completed' | 'missed';
  magnitude: 'minor' | 'moderate' | 'significant';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * A detected correlation between domains
 */
export interface CrossDomainCorrelation {
  id: string;
  userId: string;

  // The two domains being correlated
  domainA: {
    domain: CorrelationDomain;
    pattern: string;
    direction?: string;
  };
  domainB: {
    domain: CorrelationDomain;
    pattern: string;
    direction?: string;
  };

  // Correlation strength and confidence
  strength: number; // -1 to 1 (negative = inverse correlation)
  confidence: 'suspected' | 'likely' | 'confirmed';
  observationCount: number;

  // Generated insight
  insight: string;
  suggestion?: string;

  // Timing
  firstObserved: Date;
  lastObserved: Date;

  // How to surface this
  surfaceStrategy: 'proactively' | 'when_relevant' | 'on_request';
  surfacedCount: number;
  lastSurfaced?: Date;
}

/**
 * Options for getting correlations
 */
export interface CorrelationFilterOptions {
  minConfidence?: 'suspected' | 'likely' | 'confirmed';
  domains?: CorrelationDomain[];
  limit?: number;
}

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

interface UserCorrelationState {
  signals: DomainSignal[];
  correlations: CrossDomainCorrelation[];
  lastAnalysis: number;
}

const userStates = new Map<string, UserCorrelationState>();

function getOrCreateState(userId: string): UserCorrelationState {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      signals: [],
      correlations: [],
      lastAnalysis: 0,
    });
  }
  return userStates.get(userId)!;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_OBSERVATIONS_FOR_SUSPECTED: 2,
  MIN_OBSERVATIONS_FOR_LIKELY: 5,
  MIN_OBSERVATIONS_FOR_CONFIRMED: 10,
  MAX_SIGNALS_PER_USER: 200,
  MAX_CORRELATIONS_PER_USER: 50,
  CORRELATION_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 hours
  ANALYSIS_COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes
  SURFACING_COOLDOWN_DAYS: 7, // Don't surface same insight within 7 days
};

// ============================================================================
// SIGNAL RECORDING
// ============================================================================

/**
 * Record a domain signal for correlation analysis.
 *
 * Call this whenever you observe a meaningful change in any domain:
 * - User mentions being tired → sleep domain
 * - Habit completed → habits domain
 * - Stress detected in voice → stress domain
 * - Person mentioned → person_mentioned domain
 */
export function recordDomainSignal(userId: string, signal: DomainSignal): void {
  const state = getOrCreateState(userId);

  // Add timestamp if not present
  if (!signal.timestamp) {
    signal.timestamp = new Date();
  }

  state.signals.push(signal);

  // Keep buffer manageable
  if (state.signals.length > CONFIG.MAX_SIGNALS_PER_USER) {
    state.signals = state.signals.slice(-CONFIG.MAX_SIGNALS_PER_USER);
  }

  log.debug(
    { userId, domain: signal.domain, metric: signal.metric, direction: signal.direction },
    '📊 Domain signal recorded'
  );

  // Trigger analysis if enough time has passed
  const now = Date.now();
  if (now - state.lastAnalysis > CONFIG.ANALYSIS_COOLDOWN_MS) {
    void analyzeCorrelations(userId);
  }
}

// ============================================================================
// CORRELATION ANALYSIS
// ============================================================================

/**
 * Analyze signals to detect cross-domain correlations.
 */
async function analyzeCorrelations(userId: string): Promise<void> {
  const state = getOrCreateState(userId);
  state.lastAnalysis = Date.now();

  // Group signals by time windows
  const windows = groupSignalsByTimeWindow(state.signals);

  // Look for co-occurring patterns
  for (const windowSignals of windows) {
    if (windowSignals.length < 2) continue;

    // Check all pairs of signals in this window
    for (let i = 0; i < windowSignals.length; i++) {
      for (let j = i + 1; j < windowSignals.length; j++) {
        const signalA = windowSignals[i];
        const signalB = windowSignals[j];

        // Skip if same domain (we want cross-domain)
        if (signalA.domain === signalB.domain) continue;

        // Find or create correlation
        updateOrCreateCorrelation(userId, state, signalA, signalB);
      }
    }
  }

  // Prune weak correlations
  state.correlations = state.correlations
    .filter((c) => c.observationCount >= CONFIG.MIN_OBSERVATIONS_FOR_SUSPECTED || isRecent(c))
    .slice(0, CONFIG.MAX_CORRELATIONS_PER_USER);

  log.debug(
    { userId, correlationCount: state.correlations.length },
    '🔗 Correlation analysis complete'
  );
}

/**
 * Group signals into time windows for co-occurrence detection.
 */
function groupSignalsByTimeWindow(signals: DomainSignal[]): DomainSignal[][] {
  const windows: DomainSignal[][] = [];
  const sorted = [...signals].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let currentWindow: DomainSignal[] = [];
  let windowStart = 0;

  for (const signal of sorted) {
    const signalTime = new Date(signal.timestamp).getTime();

    if (currentWindow.length === 0) {
      windowStart = signalTime;
      currentWindow.push(signal);
    } else if (signalTime - windowStart <= CONFIG.CORRELATION_WINDOW_MS) {
      currentWindow.push(signal);
    } else {
      // Start new window
      if (currentWindow.length > 0) {
        windows.push(currentWindow);
      }
      currentWindow = [signal];
      windowStart = signalTime;
    }
  }

  // Don't forget last window
  if (currentWindow.length > 0) {
    windows.push(currentWindow);
  }

  return windows;
}

/**
 * Update existing correlation or create new one.
 */
function updateOrCreateCorrelation(
  userId: string,
  state: UserCorrelationState,
  signalA: DomainSignal,
  signalB: DomainSignal
): void {
  // Normalize order for consistent matching
  const [first, second] = signalA.domain < signalB.domain ? [signalA, signalB] : [signalB, signalA];

  // Look for existing correlation
  const existing = state.correlations.find(
    (c) =>
      c.domainA.domain === first.domain &&
      c.domainA.pattern === first.metric &&
      c.domainB.domain === second.domain &&
      c.domainB.pattern === second.metric
  );

  if (existing) {
    // Update existing
    existing.observationCount++;
    existing.lastObserved = new Date();
    existing.confidence = calculateConfidence(existing.observationCount);

    // Update strength based on direction correlation
    existing.strength = calculateStrength(existing, first, second);

    // Regenerate insight if confidence increased
    if (
      existing.confidence === 'likely' &&
      existing.observationCount === CONFIG.MIN_OBSERVATIONS_FOR_LIKELY
    ) {
      const { insight, suggestion } = generateInsightAndSuggestion(existing);
      existing.insight = insight;
      existing.suggestion = suggestion;
    }
  } else {
    // Create new correlation
    const correlation: CrossDomainCorrelation = {
      id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      domainA: {
        domain: first.domain,
        pattern: first.metric,
        direction: first.direction,
      },
      domainB: {
        domain: second.domain,
        pattern: second.metric,
        direction: second.direction,
      },
      strength: 0.5, // Initial moderate strength
      confidence: 'suspected',
      observationCount: 1,
      insight: `Possible connection: ${first.metric} (${first.domain}) and ${second.metric} (${second.domain})`,
      firstObserved: new Date(),
      lastObserved: new Date(),
      surfaceStrategy: 'when_relevant',
      surfacedCount: 0,
    };

    state.correlations.push(correlation);
  }
}

/**
 * Calculate confidence level based on observation count.
 */
function calculateConfidence(observationCount: number): 'suspected' | 'likely' | 'confirmed' {
  if (observationCount >= CONFIG.MIN_OBSERVATIONS_FOR_CONFIRMED) {
    return 'confirmed';
  }
  if (observationCount >= CONFIG.MIN_OBSERVATIONS_FOR_LIKELY) {
    return 'likely';
  }
  return 'suspected';
}

/**
 * Calculate correlation strength based on direction patterns.
 */
function calculateStrength(
  correlation: CrossDomainCorrelation,
  signalA: DomainSignal,
  signalB: DomainSignal
): number {
  // Simple heuristic: if directions match, positive correlation
  // If opposite, negative correlation
  const directionScore = getDirectionScore(signalA.direction, signalB.direction);

  // Moving average with previous strength
  const previousWeight = Math.min(0.8, correlation.observationCount / 20);
  return correlation.strength * previousWeight + directionScore * (1 - previousWeight);
}

/**
 * Get directional correlation score.
 */
function getDirectionScore(dirA: string, dirB: string): number {
  const positives = ['increased', 'completed', 'stable'];
  const negatives = ['decreased', 'missed', 'changed'];

  const aPositive = positives.includes(dirA);
  const bPositive = positives.includes(dirB);
  const aNegative = negatives.includes(dirA);
  const bNegative = negatives.includes(dirB);

  if ((aPositive && bPositive) || (aNegative && bNegative)) {
    return 0.7; // Positive correlation
  }
  if ((aPositive && bNegative) || (aNegative && bPositive)) {
    return -0.7; // Negative correlation
  }
  return 0.3; // Weak/unclear correlation
}

/**
 * Check if correlation was observed recently.
 */
function isRecent(correlation: CrossDomainCorrelation): boolean {
  const daysSinceObserved =
    (Date.now() - new Date(correlation.lastObserved).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceObserved < 30;
}

/**
 * Generate human-readable insight and suggestion.
 */
function generateInsightAndSuggestion(correlation: CrossDomainCorrelation): {
  insight: string;
  suggestion?: string;
} {
  const { domainA, domainB, strength } = correlation;

  // Templates based on domain combinations
  const templates = getInsightTemplates();
  const key = `${domainA.domain}_${domainB.domain}`;
  const reverseKey = `${domainB.domain}_${domainA.domain}`;

  const template = templates[key] || templates[reverseKey];

  if (template) {
    return {
      insight: template.insight(domainA.pattern, domainB.pattern, strength),
      suggestion: template.suggestion?.(domainA.pattern, domainB.pattern, strength),
    };
  }

  // Generic fallback
  const relationWord = strength > 0 ? 'connected to' : 'inversely related to';
  return {
    insight: `${domainA.pattern} seems ${relationWord} ${domainB.pattern}`,
    suggestion: undefined,
  };
}

/**
 * Get insight templates for domain combinations.
 */
function getInsightTemplates(): Record<
  string,
  {
    insight: (a: string, b: string, strength: number) => string;
    suggestion?: (a: string, b: string, strength: number) => string;
  }
> {
  return {
    // ═══════════════════════════════════════════════════════════════════════════
    // SLEEP CORRELATIONS - Core wellbeing indicator
    // ═══════════════════════════════════════════════════════════════════════════
    sleep_mood: {
      insight: (a, b, s) =>
        s > 0
          ? `Your ${a} sleep quality connects with feeling ${b}`
          : `When sleep is ${a}, your mood tends toward ${b}`,
      suggestion: (a, b, s) =>
        s > 0
          ? `Prioritizing sleep might help with ${b}`
          : `Consider how sleep quality might be affecting your mood`,
    },
    sleep_productivity: {
      insight: (a, b) => `${a} sleep patterns seem to affect your ${b} productivity`,
      suggestion: () => `Your sleep might be a lever for productivity`,
    },
    sleep_energy: {
      insight: (a, b) => `${a} sleep directly impacts your ${b} energy levels`,
      suggestion: () => `Sleep quality is your energy foundation`,
    },
    sleep_stress: {
      insight: (a, b) => `${a} stress levels appear connected to ${b} sleep`,
      suggestion: () => `Managing stress before bed might help sleep quality`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // STRESS CORRELATIONS - Impact on everything
    // ═══════════════════════════════════════════════════════════════════════════
    stress_habits: {
      insight: (a, b) => `When stress is ${a}, your ${b} habit consistency changes`,
      suggestion: () => `Stress management might help habit consistency`,
    },
    stress_social: {
      insight: (a, b) => `${a} stress levels correlate with ${b} social engagement`,
      suggestion: () => `Social support might help during stressful times`,
    },
    stress_exercise: {
      insight: (a, b) => `${a} stress and ${b} exercise seem connected`,
      suggestion: () => `Exercise could be a stress management tool for you`,
    },
    stress_health: {
      insight: (a, b) => `Your ${a} stress appears to affect your ${b} health`,
      suggestion: () => `Stress management might have health benefits`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ENERGY CORRELATIONS - Daily capacity
    // ═══════════════════════════════════════════════════════════════════════════
    energy_exercise: {
      insight: (a, b, s) =>
        s > 0 ? `${b} exercise correlates with ${a} energy` : `${b} might be affecting your energy`,
      suggestion: () => `Exercise could be a key energy lever for you`,
    },
    energy_productivity: {
      insight: (a, b) => `${a} energy levels predict ${b} productive days`,
      suggestion: () => `Protecting your energy protects your output`,
    },
    energy_mood: {
      insight: (a, b) => `${a} energy and ${b} mood tend to track together`,
      suggestion: () => `Energy management might improve mood`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // MOOD CORRELATIONS - Emotional patterns
    // ═══════════════════════════════════════════════════════════════════════════
    mood_social: {
      insight: (a, b) => `Feeling ${a} often coincides with ${b} social activity`,
      suggestion: () => `Social connection might be important for your mood`,
    },
    mood_exercise: {
      insight: (a, b) => `${a} moods and ${b} exercise patterns are connected`,
      suggestion: () => `Exercise might be a mood stabilizer for you`,
    },
    mood_habits: {
      insight: (a, b) => `Your mood affects your ${b} habit consistency`,
      suggestion: () => `Gentle self-compassion on hard days helps`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // WORK CORRELATIONS - Professional impact
    // ═══════════════════════════════════════════════════════════════════════════
    work_stress: {
      insight: (a, b) => `${a} at work connects with ${b} stress levels`,
      suggestion: () => `Work patterns might be worth examining`,
    },
    work_sleep: {
      insight: (a, b) => `Work ${a} seems to affect your ${b} sleep`,
      suggestion: () => `Work boundaries might protect your sleep`,
    },
    work_family: {
      insight: (a, b) => `Work ${a} correlates with ${b} family time`,
      suggestion: () => `Work-life balance patterns are emerging`,
    },
    work_mood: {
      insight: (a, b) => `Work ${a} connects with feeling ${b}`,
      suggestion: () => `Your work satisfaction affects wellbeing`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SOCIAL CORRELATIONS - Relationship impact
    // ═══════════════════════════════════════════════════════════════════════════
    social_energy: {
      insight: (a, b) => `Social ${a} affects your ${b} energy`,
      suggestion: () => `Understanding your social energy equation helps`,
    },
    social_habits: {
      insight: (a, b) => `Social ${a} impacts your ${b} habit consistency`,
      suggestion: () => `Social accountability might help habits`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PERSON-SPECIFIC CORRELATIONS - Relationship dynamics
    // ═══════════════════════════════════════════════════════════════════════════
    person_mentioned_mood: {
      insight: (a, b) => `Conversations about ${a} often come with ${b} feelings`,
      suggestion: () => `This relationship seems emotionally significant`,
    },
    person_mentioned_stress: {
      insight: (a, b) => `Mentions of ${a} correlate with ${b} stress`,
      suggestion: () => `This relationship might be worth exploring`,
    },
    person_mentioned_energy: {
      insight: (a, b) => `Talking about ${a} affects your ${b} energy`,
      suggestion: () => `Some relationships energize, others drain`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // TEMPORAL CORRELATIONS - When patterns
    // ═══════════════════════════════════════════════════════════════════════════
    time_of_day_energy: {
      insight: (a, b) => `Your energy tends to be ${b} during ${a}`,
      suggestion: () => `Consider scheduling important tasks around your energy patterns`,
    },
    time_of_day_mood: {
      insight: (a, b) => `Your mood tends toward ${b} during ${a}`,
      suggestion: () => `Time of day affects your emotional state`,
    },
    time_of_day_productivity: {
      insight: (a, b) => `You're most ${b} during ${a}`,
      suggestion: () => `Protect your peak hours for important work`,
    },
    day_of_week_mood: {
      insight: (a, b) => `${a}s often bring ${b} feelings`,
      suggestion: () => `Being aware of weekly patterns might help planning`,
    },
    day_of_week_energy: {
      insight: (a, b) => `${a}s tend to be ${b} energy days`,
      suggestion: () => `Plan around your weekly energy rhythm`,
    },
    day_of_week_stress: {
      insight: (a, b) => `${a}s correlate with ${b} stress`,
      suggestion: () => `Weekly stress patterns are emerging`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FINANCIAL CORRELATIONS - Money & mood
    // ═══════════════════════════════════════════════════════════════════════════
    financial_stress: {
      insight: (a, b) => `Financial ${a} connects with ${b} stress levels`,
      suggestion: () => `Financial clarity might reduce stress`,
    },
    financial_mood: {
      insight: (a, b) => `Financial ${a} affects your ${b} mood`,
      suggestion: () => `Money and emotions are connected for you`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // HEALTH CORRELATIONS - Physical wellbeing
    // ═══════════════════════════════════════════════════════════════════════════
    health_mood: {
      insight: (a, b) => `Health ${a} connects with ${b} mood`,
      suggestion: () => `Physical and emotional health are linked`,
    },
    health_energy: {
      insight: (a, b) => `Health ${a} affects your ${b} energy`,
      suggestion: () => `Physical health is an energy foundation`,
    },
    health_productivity: {
      insight: (a, b) => `Health ${a} impacts ${b} productivity`,
      suggestion: () => `Taking care of yourself is taking care of your work`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // HABIT CORRELATIONS - Consistency patterns
    // ═══════════════════════════════════════════════════════════════════════════
    habits_mood: {
      insight: (a, b) => `Habit consistency ${a} correlates with ${b} mood`,
      suggestion: () => `Small wins compound into bigger wellbeing`,
    },
    habits_energy: {
      insight: (a, b) => `Habit ${a} connects with ${b} energy`,
      suggestion: () => `Good habits might be energizing you`,
    },
    habits_productivity: {
      insight: (a, b) => `Habit ${a} predicts ${b} productive days`,
      suggestion: () => `Habits are your productivity foundation`,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FAMILY CORRELATIONS - Home life impact
    // ═══════════════════════════════════════════════════════════════════════════
    family_mood: {
      insight: (a, b) => `Family ${a} connects with feeling ${b}`,
      suggestion: () => `Family dynamics affect your emotional state`,
    },
    family_stress: {
      insight: (a, b) => `Family ${a} correlates with ${b} stress`,
      suggestion: () => `Family is a significant stress factor`,
    },
    family_energy: {
      insight: (a, b) => `Family ${a} affects your ${b} energy`,
      suggestion: () => `Family time has energy implications`,
    },
  };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get correlations for a user.
 */
export function getCorrelations(
  userId: string,
  options?: CorrelationFilterOptions
): CrossDomainCorrelation[] {
  const state = userStates.get(userId);
  if (!state) return [];

  let correlations = [...state.correlations];

  // Filter by confidence
  if (options?.minConfidence) {
    const confidenceOrder = { suspected: 0, likely: 1, confirmed: 2 };
    const minLevel = confidenceOrder[options.minConfidence];
    correlations = correlations.filter((c) => confidenceOrder[c.confidence] >= minLevel);
  }

  // Filter by domains
  if (options?.domains?.length) {
    correlations = correlations.filter(
      (c) =>
        options.domains!.includes(c.domainA.domain) || options.domains!.includes(c.domainB.domain)
    );
  }

  // Sort by confidence and observation count
  correlations.sort((a, b) => {
    const confOrder = { suspected: 0, likely: 1, confirmed: 2 };
    const confDiff = confOrder[b.confidence] - confOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    return b.observationCount - a.observationCount;
  });

  // Limit
  if (options?.limit) {
    correlations = correlations.slice(0, options.limit);
  }

  return correlations;
}

/**
 * Get correlations relevant to current context.
 */
export function getRelevantCorrelations(
  userId: string,
  context: {
    currentTopics?: string[];
    currentMood?: string;
    currentDomains?: CorrelationDomain[];
  }
): CrossDomainCorrelation[] {
  const all = getCorrelations(userId, { minConfidence: 'likely' });

  // Score by relevance
  const scored = all.map((corr) => {
    let relevance = 0;

    // Match current topics
    if (context.currentTopics) {
      for (const topic of context.currentTopics) {
        const topicLower = topic.toLowerCase();
        if (
          corr.domainA.pattern.toLowerCase().includes(topicLower) ||
          corr.domainB.pattern.toLowerCase().includes(topicLower)
        ) {
          relevance += 0.5;
        }
      }
    }

    // Match current mood
    if (context.currentMood) {
      if (
        corr.domainA.domain === 'mood' ||
        corr.domainB.domain === 'mood' ||
        corr.domainA.pattern.toLowerCase().includes(context.currentMood.toLowerCase()) ||
        corr.domainB.pattern.toLowerCase().includes(context.currentMood.toLowerCase())
      ) {
        relevance += 0.4;
      }
    }

    // Match current domains
    if (context.currentDomains) {
      if (
        context.currentDomains.includes(corr.domainA.domain) ||
        context.currentDomains.includes(corr.domainB.domain)
      ) {
        relevance += 0.3;
      }
    }

    // Confidence boost
    if (corr.confidence === 'confirmed') relevance += 0.2;

    // Recency boost
    const daysSince = (Date.now() - new Date(corr.lastObserved).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) relevance += 0.1;

    // Penalty if recently surfaced
    if (corr.lastSurfaced) {
      const daysSinceSurfaced =
        (Date.now() - new Date(corr.lastSurfaced).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSurfaced < CONFIG.SURFACING_COOLDOWN_DAYS) {
        relevance -= 0.5;
      }
    }

    return { correlation: corr, relevance };
  });

  return scored
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map((s) => s.correlation);
}

/**
 * Mark a correlation as surfaced (shown to user).
 */
export function markCorrelationSurfaced(userId: string, correlationId: string): void {
  const state = userStates.get(userId);
  if (!state) return;

  const correlation = state.correlations.find((c) => c.id === correlationId);
  if (correlation) {
    correlation.surfacedCount++;
    correlation.lastSurfaced = new Date();
    log.debug({ userId, correlationId }, '💬 Correlation surfaced');
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format correlations for LLM context injection.
 */
export function formatCorrelationsForPrompt(correlations: CrossDomainCorrelation[]): string {
  if (correlations.length === 0) return '';

  const lines = [
    '[PATTERN DETECTION - Cross-Domain Correlations]',
    "You notice patterns they can't see. Surface these gently with 'I notice...'",
    '',
  ];

  for (const corr of correlations) {
    const confIcon =
      corr.confidence === 'confirmed' ? '✓' : corr.confidence === 'likely' ? '~' : '?';
    lines.push(`${confIcon} ${corr.insight}`);
    if (corr.suggestion) {
      lines.push(`  → ${corr.suggestion}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear correlator state for a user.
 */
export function clearCorrelatorState(userId?: string): void {
  if (userId) {
    userStates.delete(userId);
  } else {
    userStates.clear();
  }
}

/**
 * Get domain signals for debugging/testing.
 */
export function getDomainSignals(userId: string): DomainSignal[] {
  const state = userStates.get(userId);
  return state?.signals ?? [];
}

// ============================================================================
// SINGLETON ACCESSOR
// ============================================================================

class CrossDomainCorrelatorSingleton {
  recordSignal = recordDomainSignal;
  getCorrelations = getCorrelations;
  getRelevant = getRelevantCorrelations;
  markSurfaced = markCorrelationSurfaced;
  format = formatCorrelationsForPrompt;
  clear = clearCorrelatorState;
  getSignals = getDomainSignals;
}

const singleton = new CrossDomainCorrelatorSingleton();

export function getCrossCorrelator(): CrossDomainCorrelatorSingleton {
  return singleton;
}

export const crossDomainCorrelator = singleton;
