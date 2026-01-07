/**
 * Ripple Effect Prediction - Better Than Human v4
 *
 * > "We see how one change will cascade through your whole life."
 *
 * SUPERHUMAN CAPABILITY: Predict how a change in one life domain
 * will ripple into other domains.
 *
 * Humans experience life holistically but think about it in silos.
 * A promotion at work affects their relationship. A fight with their
 * partner affects their focus at work. A health scare affects everything.
 *
 * We can:
 * - Track cross-domain influence patterns
 * - Predict cascade effects before they happen
 * - Identify leverage points (small changes, big impact)
 * - Warn about negative spirals early
 *
 * @module intelligence/predictive/ripple-effect-prediction
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RippleEffectPrediction' });

// ============================================================================
// TYPES
// ============================================================================

/** Life domains we track */
export type LifeDomain =
  | 'work'
  | 'relationships'
  | 'health'
  | 'finances'
  | 'family'
  | 'social'
  | 'mental_health'
  | 'physical_health'
  | 'creativity'
  | 'spirituality'
  | 'personal_growth'
  | 'habits'
  | 'energy'
  | 'sleep'
  | 'self_care';

/** Event that can trigger ripples */
export interface DomainEvent {
  domain: LifeDomain;
  eventType: EventType;
  magnitude: number;  // -1 (very negative) to 1 (very positive)
  description: string;
  timestamp: number;
}

export type EventType =
  // Work
  | 'promotion'
  | 'demotion'
  | 'new_project'
  | 'deadline_pressure'
  | 'conflict_at_work'
  | 'job_change'
  | 'work_success'
  | 'work_failure'
  // Relationships
  | 'relationship_start'
  | 'relationship_end'
  | 'major_conflict'
  | 'reconciliation'
  | 'deepening_connection'
  | 'growing_apart'
  // Health
  | 'health_scare'
  | 'health_improvement'
  | 'injury'
  | 'chronic_issue'
  | 'fitness_milestone'
  // Family
  | 'family_crisis'
  | 'family_celebration'
  | 'family_conflict'
  | 'caregiving_burden'
  | 'family_change'
  // Finances
  | 'financial_stress'
  | 'financial_relief'
  | 'major_expense'
  | 'windfall'
  // General
  | 'loss'
  | 'achievement'
  | 'transition'
  | 'routine_change'
  | 'external_stressor';

/** Predicted ripple effect */
export interface RipplePrediction {
  /** Source event */
  sourceEvent: DomainEvent;
  /** Predicted effects on other domains */
  ripples: Array<{
    targetDomain: LifeDomain;
    effect: RippleEffect;
    probability: number;
    timeframe: 'immediate' | 'days' | 'weeks' | 'months';
    magnitude: number;  // -1 to 1
    reasoning: string;
    mitigationOpportunity?: string;
  }>;
  /** Overall cascade risk */
  cascadeRisk: 'low' | 'moderate' | 'high' | 'critical';
  /** Key leverage points */
  leveragePoints: Array<{
    domain: LifeDomain;
    action: string;
    impact: number;
  }>;
  /** Warning if negative spiral detected */
  spiralWarning?: {
    domains: LifeDomain[];
    description: string;
    breakPoints: string[];
  };
}

export type RippleEffect =
  | 'increased_stress'
  | 'decreased_stress'
  | 'time_reduction'
  | 'time_increase'
  | 'energy_drain'
  | 'energy_boost'
  | 'attention_shift'
  | 'neglect'
  | 'improvement'
  | 'decline'
  | 'conflict_spillover'
  | 'mood_impact'
  | 'motivation_change'
  | 'routine_disruption'
  | 'financial_impact';

/** Cross-domain influence pattern */
interface InfluencePattern {
  sourceDomain: LifeDomain;
  targetDomain: LifeDomain;
  eventType: EventType;
  typicalEffect: RippleEffect;
  typicalMagnitude: number;
  typicalDelay: number;  // hours
  observationCount: number;
  reliability: number;
}

/** Domain state snapshot */
interface DomainState {
  domain: LifeDomain;
  health: number;  // 0-1
  stability: number;  // 0-1
  trend: 'improving' | 'stable' | 'declining';
  lastEvent?: DomainEvent;
  lastUpdated: number;
}

/** User's ripple profile */
interface UserRippleProfile {
  userId: string;
  /** Current state of each domain */
  domainStates: Map<LifeDomain, DomainState>;
  /** Learned influence patterns */
  influencePatterns: InfluencePattern[];
  /** Event history */
  eventHistory: DomainEvent[];
  /** Past ripple predictions and outcomes (for learning) */
  rippleOutcomes: Array<{
    prediction: RipplePrediction;
    actualEffects: Array<{ domain: LifeDomain; effect: RippleEffect; magnitude: number }>;
    accuracy: number;
  }>;
  lastUpdated: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Default influence weights between domains */
  DEFAULT_INFLUENCES: [
    // Work affects...
    { from: 'work', to: 'relationships', weight: 0.7 },
    { from: 'work', to: 'energy', weight: 0.8 },
    { from: 'work', to: 'mental_health', weight: 0.7 },
    { from: 'work', to: 'sleep', weight: 0.6 },
    { from: 'work', to: 'self_care', weight: 0.5 },
    { from: 'work', to: 'social', weight: 0.4 },
    // Relationships affect...
    { from: 'relationships', to: 'mental_health', weight: 0.9 },
    { from: 'relationships', to: 'energy', weight: 0.7 },
    { from: 'relationships', to: 'work', weight: 0.5 },
    { from: 'relationships', to: 'sleep', weight: 0.6 },
    { from: 'relationships', to: 'physical_health', weight: 0.4 },
    // Health affects...
    { from: 'health', to: 'energy', weight: 0.9 },
    { from: 'health', to: 'mental_health', weight: 0.8 },
    { from: 'health', to: 'work', weight: 0.7 },
    { from: 'health', to: 'relationships', weight: 0.5 },
    // Sleep affects...
    { from: 'sleep', to: 'energy', weight: 0.95 },
    { from: 'sleep', to: 'mental_health', weight: 0.7 },
    { from: 'sleep', to: 'work', weight: 0.6 },
    { from: 'sleep', to: 'physical_health', weight: 0.6 },
    // Mental health affects...
    { from: 'mental_health', to: 'relationships', weight: 0.8 },
    { from: 'mental_health', to: 'work', weight: 0.7 },
    { from: 'mental_health', to: 'energy', weight: 0.8 },
    { from: 'mental_health', to: 'self_care', weight: 0.7 },
    // Finances affect...
    { from: 'finances', to: 'mental_health', weight: 0.8 },
    { from: 'finances', to: 'relationships', weight: 0.6 },
    { from: 'finances', to: 'work', weight: 0.4 },
  ] as Array<{ from: LifeDomain; to: LifeDomain; weight: number }>,
  /** Maximum events to track */
  MAX_EVENT_HISTORY: 200,
  /** Learning rate for patterns */
  LEARNING_RATE: 0.1,
  /** Cascade risk thresholds */
  CASCADE_RISK_THRESHOLDS: {
    critical: 0.8,
    high: 0.6,
    moderate: 0.4,
  },
};

// ============================================================================
// STORAGE
// ============================================================================

const userProfiles = new Map<string, UserRippleProfile>();

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a domain event and predict ripples
 *
 * @param userId - User ID
 * @param event - The event that occurred
 * @returns Ripple prediction
 */
export function recordDomainEvent(
  userId: string,
  event: Omit<DomainEvent, 'timestamp'>
): RipplePrediction {
  const profile = getOrCreateProfile(userId);
  const now = Date.now();

  const fullEvent: DomainEvent = {
    ...event,
    timestamp: now,
  };

  // Record event
  profile.eventHistory.push(fullEvent);
  if (profile.eventHistory.length > CONFIG.MAX_EVENT_HISTORY) {
    profile.eventHistory = profile.eventHistory.slice(-CONFIG.MAX_EVENT_HISTORY);
  }

  // Update domain state
  updateDomainState(profile, fullEvent);

  // Generate ripple prediction
  const prediction = predictRipples(profile, fullEvent);

  profile.lastUpdated = now;

  log.info(
    {
      userId,
      domain: event.domain,
      eventType: event.eventType,
      magnitude: event.magnitude,
      rippleCount: prediction.ripples.length,
      cascadeRisk: prediction.cascadeRisk,
    },
    '🌊 Domain event recorded with ripple prediction'
  );

  return prediction;
}

/**
 * Record observed ripple effect (for learning)
 *
 * @param userId - User ID
 * @param sourceEvent - Original event
 * @param observedEffect - What actually happened
 */
export function recordObservedRipple(
  userId: string,
  sourceEvent: DomainEvent,
  observedEffect: {
    targetDomain: LifeDomain;
    effect: RippleEffect;
    magnitude: number;
    delayHours: number;
  }
): void {
  const profile = userProfiles.get(userId);
  if (!profile) return;

  // Find or create pattern
  let pattern = profile.influencePatterns.find(
    (p) =>
      p.sourceDomain === sourceEvent.domain &&
      p.targetDomain === observedEffect.targetDomain &&
      p.eventType === sourceEvent.eventType
  );

  if (!pattern) {
    pattern = {
      sourceDomain: sourceEvent.domain,
      targetDomain: observedEffect.targetDomain,
      eventType: sourceEvent.eventType,
      typicalEffect: observedEffect.effect,
      typicalMagnitude: observedEffect.magnitude,
      typicalDelay: observedEffect.delayHours,
      observationCount: 0,
      reliability: 0.3,
    };
    profile.influencePatterns.push(pattern);
  }

  // Update pattern
  const lr = CONFIG.LEARNING_RATE;
  pattern.observationCount++;
  pattern.typicalMagnitude = pattern.typicalMagnitude * (1 - lr) + observedEffect.magnitude * lr;
  pattern.typicalDelay = pattern.typicalDelay * (1 - lr) + observedEffect.delayHours * lr;
  pattern.reliability = Math.min(0.95, pattern.reliability + lr * 0.5);

  // Update domain state
  const domainState = profile.domainStates.get(observedEffect.targetDomain);
  if (domainState) {
    domainState.health = Math.max(0, Math.min(1, domainState.health + observedEffect.magnitude * 0.1));
    domainState.lastUpdated = Date.now();
  }

  profile.lastUpdated = Date.now();

  log.debug(
    {
      userId,
      from: sourceEvent.domain,
      to: observedEffect.targetDomain,
      effect: observedEffect.effect,
      patternReliability: pattern.reliability.toFixed(2),
    },
    '📊 Recorded observed ripple effect'
  );
}

/**
 * Update domain state directly (without event)
 *
 * @param userId - User ID
 * @param domain - Domain to update
 * @param health - New health value (0-1)
 */
export function updateDomainHealth(
  userId: string,
  domain: LifeDomain,
  health: number
): void {
  const profile = getOrCreateProfile(userId);
  
  const state = profile.domainStates.get(domain);
  if (state) {
    const previousHealth = state.health;
    state.health = Math.max(0, Math.min(1, health));
    
    // Update trend
    if (health > previousHealth + 0.1) {
      state.trend = 'improving';
    } else if (health < previousHealth - 0.1) {
      state.trend = 'declining';
    } else {
      state.trend = 'stable';
    }
    
    state.lastUpdated = Date.now();
  }

  profile.lastUpdated = Date.now();
}

// ============================================================================
// PREDICTION FUNCTIONS
// ============================================================================

/**
 * Predict ripple effects from an event
 *
 * @param profile - User's ripple profile
 * @param event - The triggering event
 * @returns Ripple prediction
 */
function predictRipples(
  profile: UserRippleProfile,
  event: DomainEvent
): RipplePrediction {
  const ripples: RipplePrediction['ripples'] = [];

  // Get all domains that could be affected
  const allDomains: LifeDomain[] = [
    'work', 'relationships', 'health', 'finances', 'family', 'social',
    'mental_health', 'physical_health', 'creativity', 'spirituality',
    'personal_growth', 'habits', 'energy', 'sleep', 'self_care'
  ];

  for (const targetDomain of allDomains) {
    if (targetDomain === event.domain) continue;

    // Check for learned pattern
    const learnedPattern = profile.influencePatterns.find(
      (p) =>
        p.sourceDomain === event.domain &&
        p.targetDomain === targetDomain &&
        p.eventType === event.eventType
    );

    // Check default influence
    const defaultInfluence = CONFIG.DEFAULT_INFLUENCES.find(
      (i) => i.from === event.domain && i.to === targetDomain
    );

    if (learnedPattern || defaultInfluence) {
      const baseWeight = learnedPattern?.reliability || defaultInfluence?.weight || 0;
      const magnitude = learnedPattern
        ? learnedPattern.typicalMagnitude * event.magnitude
        : event.magnitude * (defaultInfluence?.weight || 0.5);

      const probability = baseWeight * Math.abs(event.magnitude);

      if (probability > 0.2) {
        // Determine effect type based on event and magnitude
        const effect = determineEffect(event, targetDomain, magnitude);
        const timeframe = determineTimeframe(learnedPattern, event);
        const mitigation = determineMitigation(event, targetDomain, effect);

        ripples.push({
          targetDomain,
          effect,
          probability: Math.min(0.95, probability),
          timeframe,
          magnitude,
          reasoning: generateReasoning(event, targetDomain, effect, learnedPattern),
          mitigationOpportunity: mitigation,
        });
      }
    }
  }

  // Sort by probability
  ripples.sort((a, b) => b.probability - a.probability);

  // Determine cascade risk
  const cascadeRisk = determineCascadeRisk(ripples, profile);

  // Identify leverage points
  const leveragePoints = identifyLeveragePoints(profile, ripples);

  // Check for spiral
  const spiralWarning = detectSpiral(profile, event, ripples);

  return {
    sourceEvent: event,
    ripples,
    cascadeRisk,
    leveragePoints,
    spiralWarning,
  };
}

/**
 * Get current ripple status for all domains
 *
 * @param userId - User ID
 * @returns Current state and active ripples
 */
export function getRippleStatus(userId: string): {
  domainStates: Array<{ domain: LifeDomain; health: number; trend: string }>;
  activeRipples: RipplePrediction[];
  overallRisk: 'low' | 'moderate' | 'high';
} {
  const profile = userProfiles.get(userId);
  
  if (!profile) {
    return {
      domainStates: [],
      activeRipples: [],
      overallRisk: 'low',
    };
  }

  const domainStates = Array.from(profile.domainStates.entries()).map(([domain, state]) => ({
    domain,
    health: state.health,
    trend: state.trend,
  }));

  // Get recent events and their ripple predictions
  const recentEvents = profile.eventHistory.slice(-5);
  const activeRipples: RipplePrediction[] = [];

  for (const event of recentEvents) {
    const daysSinceEvent = (Date.now() - event.timestamp) / (1000 * 60 * 60 * 24);
    if (daysSinceEvent < 7) {  // Still "active" if within a week
      activeRipples.push(predictRipples(profile, event));
    }
  }

  // Determine overall risk
  const lowHealthDomains = domainStates.filter((d) => d.health < 0.4).length;
  const decliningDomains = domainStates.filter((d) => d.trend === 'declining').length;
  
  let overallRisk: 'low' | 'moderate' | 'high' = 'low';
  if (lowHealthDomains >= 3 || decliningDomains >= 3) {
    overallRisk = 'high';
  } else if (lowHealthDomains >= 1 || decliningDomains >= 2) {
    overallRisk = 'moderate';
  }

  return {
    domainStates,
    activeRipples,
    overallRisk,
  };
}

/**
 * Predict cascading effects of a hypothetical event
 *
 * @param userId - User ID
 * @param hypotheticalEvent - Event to simulate
 * @returns What would happen
 */
export function simulateRipples(
  userId: string,
  hypotheticalEvent: Omit<DomainEvent, 'timestamp'>
): RipplePrediction {
  const profile = getOrCreateProfile(userId);
  
  const event: DomainEvent = {
    ...hypotheticalEvent,
    timestamp: Date.now(),
  };

  return predictRipples(profile, event);
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build ripple effect context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildRippleContext(userId: string): string {
  const status = getRippleStatus(userId);
  
  if (status.domainStates.length === 0) return '';

  const sections: string[] = [];
  sections.push('[RIPPLE INTELLIGENCE - Life as a Connected System]');
  sections.push('You see how their life domains connect:');
  sections.push('');

  // Domain health overview
  const concerningDomains = status.domainStates
    .filter((d) => d.health < 0.5 || d.trend === 'declining')
    .sort((a, b) => a.health - b.health);

  if (concerningDomains.length > 0) {
    sections.push('**Domains Needing Attention:**');
    for (const domain of concerningDomains.slice(0, 3)) {
      const healthDesc = domain.health < 0.3 ? 'struggling' :
        domain.health < 0.5 ? 'strained' : 'moderate';
      sections.push(`• ${domain.domain}: ${healthDesc} (${domain.trend})`);
    }
    sections.push('');
  }

  // Active ripples
  if (status.activeRipples.length > 0) {
    const highImpactRipples = status.activeRipples
      .flatMap((r) => r.ripples)
      .filter((r) => r.probability > 0.5 && Math.abs(r.magnitude) > 0.3)
      .slice(0, 3);

    if (highImpactRipples.length > 0) {
      sections.push('**Cascading Effects:**');
      for (const ripple of highImpactRipples) {
        const direction = ripple.magnitude > 0 ? '↑' : '↓';
        sections.push(`• ${ripple.targetDomain}: ${ripple.effect.replace(/_/g, ' ')} ${direction}`);
        if (ripple.mitigationOpportunity) {
          sections.push(`  → Mitigation: ${ripple.mitigationOpportunity}`);
        }
      }
      sections.push('');
    }

    // Spiral warning
    const spiral = status.activeRipples.find((r) => r.spiralWarning);
    if (spiral?.spiralWarning) {
      sections.push('**⚠️ Spiral Risk:**');
      sections.push(`  ${spiral.spiralWarning.description}`);
      sections.push(`  Break points: ${spiral.spiralWarning.breakPoints.join(', ')}`);
      sections.push('');
    }
  }

  // Leverage points
  const leverage = status.activeRipples.flatMap((r) => r.leveragePoints).slice(0, 2);
  if (leverage.length > 0) {
    sections.push('**Leverage Points (Small Change, Big Impact):**');
    for (const point of leverage) {
      sections.push(`• ${point.domain}: ${point.action}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOrCreateProfile(userId: string): UserRippleProfile {
  let profile = userProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      domainStates: new Map(),
      influencePatterns: [],
      eventHistory: [],
      rippleOutcomes: [],
      lastUpdated: Date.now(),
    };

    // Initialize all domain states
    const allDomains: LifeDomain[] = [
      'work', 'relationships', 'health', 'finances', 'family', 'social',
      'mental_health', 'physical_health', 'creativity', 'spirituality',
      'personal_growth', 'habits', 'energy', 'sleep', 'self_care'
    ];

    for (const domain of allDomains) {
      profile.domainStates.set(domain, {
        domain,
        health: 0.6,  // Neutral-good starting point
        stability: 0.5,
        trend: 'stable',
        lastUpdated: Date.now(),
      });
    }

    userProfiles.set(userId, profile);
  }

  return profile;
}

function updateDomainState(profile: UserRippleProfile, event: DomainEvent): void {
  const state = profile.domainStates.get(event.domain);
  if (!state) return;

  const previousHealth = state.health;
  
  // Update health based on event magnitude
  state.health = Math.max(0, Math.min(1, state.health + event.magnitude * 0.2));
  
  // Update trend
  if (state.health > previousHealth + 0.1) {
    state.trend = 'improving';
  } else if (state.health < previousHealth - 0.1) {
    state.trend = 'declining';
  }
  
  // Stability decreases with events, especially negative ones
  state.stability = Math.max(0, state.stability - Math.abs(event.magnitude) * 0.1);
  
  state.lastEvent = event;
  state.lastUpdated = Date.now();
}

function determineEffect(
  event: DomainEvent,
  targetDomain: LifeDomain,
  magnitude: number
): RippleEffect {
  // Common patterns
  if (magnitude < -0.3) {
    if (targetDomain === 'energy') return 'energy_drain';
    if (targetDomain === 'mental_health') return 'increased_stress';
    if (targetDomain === 'sleep') return 'decline';
    if (targetDomain === 'relationships') return 'conflict_spillover';
    if (targetDomain === 'self_care') return 'neglect';
    return 'decline';
  }
  
  if (magnitude > 0.3) {
    if (targetDomain === 'energy') return 'energy_boost';
    if (targetDomain === 'mental_health') return 'decreased_stress';
    if (targetDomain === 'relationships') return 'improvement';
    return 'improvement';
  }

  // Moderate effects
  if (event.eventType.includes('stress') || event.eventType.includes('pressure')) {
    return 'increased_stress';
  }
  
  if (event.eventType.includes('success') || event.eventType.includes('improvement')) {
    return 'motivation_change';
  }

  return 'mood_impact';
}

function determineTimeframe(
  pattern: InfluencePattern | undefined,
  event: DomainEvent
): RipplePrediction['ripples'][0]['timeframe'] {
  if (pattern?.typicalDelay) {
    if (pattern.typicalDelay < 24) return 'immediate';
    if (pattern.typicalDelay < 72) return 'days';
    if (pattern.typicalDelay < 168) return 'weeks';
    return 'months';
  }

  // Default based on event magnitude
  if (Math.abs(event.magnitude) > 0.7) return 'immediate';
  if (Math.abs(event.magnitude) > 0.4) return 'days';
  return 'weeks';
}

function determineMitigation(
  event: DomainEvent,
  targetDomain: LifeDomain,
  effect: RippleEffect
): string | undefined {
  if (effect === 'energy_drain') {
    return 'Protect rest time and reduce commitments';
  }
  if (effect === 'increased_stress' && targetDomain === 'mental_health') {
    return 'Build in stress relief practices';
  }
  if (effect === 'neglect' && targetDomain === 'self_care') {
    return 'Schedule non-negotiable self-care time';
  }
  if (effect === 'conflict_spillover') {
    return 'Be aware of mood before difficult conversations';
  }
  if (effect === 'decline' && targetDomain === 'sleep') {
    return 'Establish wind-down routine';
  }

  return undefined;
}

function generateReasoning(
  event: DomainEvent,
  targetDomain: LifeDomain,
  effect: RippleEffect,
  pattern: InfluencePattern | undefined
): string {
  if (pattern && pattern.observationCount > 3) {
    return `Based on ${pattern.observationCount} past observations: ${event.domain} events typically cause ${effect.replace(/_/g, ' ')} in ${targetDomain}`;
  }

  return `${event.eventType.replace(/_/g, ' ')} in ${event.domain} commonly affects ${targetDomain}`;
}

function determineCascadeRisk(
  ripples: RipplePrediction['ripples'],
  profile: UserRippleProfile
): RipplePrediction['cascadeRisk'] {
  const highProbRipples = ripples.filter((r) => r.probability > 0.6);
  const negativeRipples = ripples.filter((r) => r.magnitude < -0.2);
  
  // Check domain health
  const weakDomains = Array.from(profile.domainStates.values()).filter((s) => s.health < 0.4);

  const riskScore =
    highProbRipples.length * 0.2 +
    negativeRipples.length * 0.15 +
    weakDomains.length * 0.1;

  if (riskScore >= CONFIG.CASCADE_RISK_THRESHOLDS.critical) return 'critical';
  if (riskScore >= CONFIG.CASCADE_RISK_THRESHOLDS.high) return 'high';
  if (riskScore >= CONFIG.CASCADE_RISK_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

function identifyLeveragePoints(
  profile: UserRippleProfile,
  ripples: RipplePrediction['ripples']
): RipplePrediction['leveragePoints'] {
  const points: RipplePrediction['leveragePoints'] = [];

  // Sleep is often a leverage point
  const sleepState = profile.domainStates.get('sleep');
  if (sleepState && sleepState.health < 0.6) {
    points.push({
      domain: 'sleep',
      action: 'Improving sleep quality would help multiple domains',
      impact: 0.8,
    });
  }

  // Self-care is a leverage point when neglected
  const selfCareState = profile.domainStates.get('self_care');
  if (selfCareState && selfCareState.health < 0.5) {
    points.push({
      domain: 'self_care',
      action: 'Small self-care acts create positive ripples',
      impact: 0.7,
    });
  }

  // Relationships during stress
  const mentalHealthState = profile.domainStates.get('mental_health');
  if (mentalHealthState && mentalHealthState.health < 0.5) {
    points.push({
      domain: 'relationships',
      action: 'Connection with supportive person would help',
      impact: 0.75,
    });
  }

  return points.slice(0, 3);
}

function detectSpiral(
  profile: UserRippleProfile,
  event: DomainEvent,
  ripples: RipplePrediction['ripples']
): RipplePrediction['spiralWarning'] | undefined {
  // Check for potential negative spiral
  const negativeRipples = ripples.filter((r) => r.magnitude < -0.2 && r.probability > 0.5);
  
  if (negativeRipples.length < 2) return undefined;

  // Check if affected domains are already weak
  const weakAffectedDomains = negativeRipples.filter((r) => {
    const state = profile.domainStates.get(r.targetDomain);
    return state && state.health < 0.5;
  });

  if (weakAffectedDomains.length >= 2) {
    const domains = weakAffectedDomains.map((r) => r.targetDomain);
    
    return {
      domains,
      description: `${event.domain} stress may cascade into already-strained ${domains.join(' and ')}`,
      breakPoints: [
        'Address one domain intentionally',
        'Build in recovery time',
        'Seek support before overwhelm',
      ],
    };
  }

  return undefined;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const rippleEffectPrediction = {
  recordDomainEvent,
  recordObservedRipple,
  updateDomainHealth,
  getRippleStatus,
  simulateRipples,
  buildRippleContext,
};

export default rippleEffectPrediction;
