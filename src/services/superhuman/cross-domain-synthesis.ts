/**
 * Cross-Domain Synthesis - Unified Life Intelligence
 *
 * The most "AGI-like" capability: seeing connections across all life domains
 * that no human friend, therapist, or coach could possibly track.
 *
 * A human might notice: "You seem stressed lately"
 * Ferni can synthesize: "Your sleep dropped 20% when you took on the new project,
 * which correlates with reduced workout frequency, declining mood scores,
 * and increased conflict mentions with your partner. The compound effect
 * suggests burnout within 6 weeks if unchanged."
 *
 * @module services/superhuman/cross-domain-synthesis
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'CrossDomainSynthesis' });

// ============================================================================
// Types
// ============================================================================

export interface LifeDomain {
  name: DomainName;
  currentScore: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  momentum: number; // -100 to 100
  keyMetrics: DomainMetric[];
  recentChanges: DomainChange[];
}

export type DomainName =
  | 'health'
  | 'career'
  | 'relationships'
  | 'finances'
  | 'personal_growth'
  | 'emotional_wellbeing';

export interface DomainMetric {
  name: string;
  value: number;
  unit?: string;
  trend: 'up' | 'stable' | 'down';
  significance: 'high' | 'medium' | 'low';
}

export interface DomainChange {
  date: string;
  description: string;
  impact: number; // -10 to 10
  source: string; // What detected this change
}

export interface CrossDomainConnection {
  fromDomain: DomainName;
  toDomain: DomainName;
  connectionType: ConnectionType;
  strength: number; // 0-100
  description: string;
  evidence: string[];
  recommendation?: string;
}

export type ConnectionType =
  | 'causal' // A causes B
  | 'correlational' // A and B move together
  | 'enabling' // A enables B to improve
  | 'blocking' // A blocks B from improving
  | 'competing' // A and B compete for resources;

export interface CascadeEffect {
  trigger: {
    domain: DomainName;
    change: string;
    magnitude: number;
  };
  propagation: Array<{
    domain: DomainName;
    expectedChange: string;
    probability: number;
    timeframe: string;
  }>;
  netEffect: string;
  recommendation: string;
}

export interface LifeSynthesis {
  userId: string;
  generatedAt: string;

  // Current state across domains
  domains: LifeDomain[];

  // Connections between domains
  connections: CrossDomainConnection[];

  // Active cascade effects
  cascades: CascadeEffect[];

  // Key insights (the "AGI magic")
  insights: SynthesisInsight[];

  // Unified recommendations
  recommendations: UnifiedRecommendation[];

  // Risk alerts
  riskAlerts: RiskAlert[];

  // Opportunity windows
  opportunities: OpportunityWindow[];
}

export interface SynthesisInsight {
  id: string;
  title: string;
  description: string;
  domains: DomainName[];
  confidence: number;
  actionable: boolean;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  evidence: string[];
  humanEquivalent: string; // What a human might say
  ferniInsight: string; // What Ferni sees that humans can't
}

export interface UnifiedRecommendation {
  id: string;
  title: string;
  description: string;
  affectedDomains: DomainName[];
  expectedImpact: {
    domain: DomainName;
    change: number;
    timeframe: string;
  }[];
  effort: 'low' | 'medium' | 'high';
  priority: number;
  reasoning: string;
}

export interface RiskAlert {
  id: string;
  title: string;
  description: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  domains: DomainName[];
  indicators: string[];
  projectedConsequence: string;
  preventionSteps: string[];
  timeToImpact?: string;
}

export interface OpportunityWindow {
  id: string;
  title: string;
  description: string;
  domains: DomainName[];
  windowOpenUntil?: string;
  catalysts: string[];
  potentialGain: string;
  actionRequired: string;
}

// ============================================================================
// Data Gathering
// ============================================================================

/**
 * Gather cross-domain data for synthesis
 */
async function gatherSynthesisData(
  userId: string
): Promise<{
  health: unknown[];
  career: unknown[];
  relationships: unknown[];
  finances: unknown[];
  growth: unknown[];
  emotional: unknown[];
  habits: unknown[];
  conversations: unknown[];
}> {
  const db = getFirestoreDb();
  if (!db) {
    return {
      health: [],
      career: [],
      relationships: [],
      finances: [],
      growth: [],
      emotional: [],
      habits: [],
      conversations: [],
    };
  }

  const userRef = db.collection('bogle_users').doc(userId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      healthSnap,
      careerSnap,
      relationshipsSnap,
      financesSnap,
      growthSnap,
      emotionalSnap,
      habitsSnap,
      conversationsSnap,
    ] = await Promise.all([
      userRef.collection('health_metrics').orderBy('timestamp', 'desc').limit(30).get(),
      userRef.collection('career_data').orderBy('timestamp', 'desc').limit(30).get(),
      userRef.collection('relationships').get(),
      userRef.collection('financial_data').orderBy('timestamp', 'desc').limit(30).get(),
      userRef.collection('growth_activities').orderBy('timestamp', 'desc').limit(30).get(),
      userRef.collection('moods').where('timestamp', '>=', thirtyDaysAgo).get(),
      userRef.collection('habits').get(),
      userRef.collection('conversation_summaries').orderBy('timestamp', 'desc').limit(50).get(),
    ]);

    return {
      health: healthSnap.docs.map((d) => d.data()),
      career: careerSnap.docs.map((d) => d.data()),
      relationships: relationshipsSnap.docs.map((d) => d.data()),
      finances: financesSnap.docs.map((d) => d.data()),
      growth: growthSnap.docs.map((d) => d.data()),
      emotional: emotionalSnap.docs.map((d) => d.data()),
      habits: habitsSnap.docs.map((d) => d.data()),
      conversations: conversationsSnap.docs.map((d) => d.data()),
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to gather synthesis data');
    return {
      health: [],
      career: [],
      relationships: [],
      finances: [],
      growth: [],
      emotional: [],
      habits: [],
      conversations: [],
    };
  }
}

// ============================================================================
// Domain Analysis
// ============================================================================

/**
 * Analyze a single domain
 */
function analyzeDomain(
  name: DomainName,
  data: unknown[],
  habits: unknown[],
  conversations: unknown[]
): LifeDomain {
  // Extract relevant habits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const domainHabits = (habits as any[]).filter((h) => {
    const category = (h.category || '').toLowerCase();
    switch (name) {
      case 'health':
        return ['health', 'fitness', 'nutrition', 'sleep'].includes(category);
      case 'career':
        return ['productivity', 'learning', 'work'].includes(category);
      case 'relationships':
        return ['relationships', 'social', 'family'].includes(category);
      case 'finances':
        return ['finance', 'budget', 'saving', 'investing'].includes(category);
      case 'personal_growth':
        return ['growth', 'learning', 'creativity', 'mindfulness'].includes(category);
      case 'emotional_wellbeing':
        return ['mindfulness', 'meditation', 'self-care'].includes(category);
      default:
        return false;
    }
  });

  // Calculate metrics
  const metrics: DomainMetric[] = [];
  let score = 50;
  let momentum = 0;

  // Habit consistency metric
  if (domainHabits.length > 0) {
    const avgConsistency = domainHabits.reduce((sum, h) => sum + (h.consistency || 50), 0) / domainHabits.length;
    metrics.push({
      name: 'Habit Consistency',
      value: Math.round(avgConsistency),
      unit: '%',
      trend: avgConsistency > 60 ? 'up' : avgConsistency < 40 ? 'down' : 'stable',
      significance: 'high',
    });
    score = (score + avgConsistency) / 2;
  }

  // Conversation mentions metric
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mentionCount = conversations.filter((c: any) =>
    c.topics?.some((t: string) => t.toLowerCase().includes(name.replace('_', ' ')))
  ).length;
  if (mentionCount > 0) {
    metrics.push({
      name: 'Recent Discussions',
      value: mentionCount,
      trend: mentionCount > 5 ? 'up' : 'stable',
      significance: 'medium',
    });
  }

  // Determine trend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentScores = data.slice(0, 7).map((d: any) => d.score || d.value || 50);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const olderScores = data.slice(7, 14).map((d: any) => d.score || d.value || 50);

  if (recentScores.length > 0 && olderScores.length > 0) {
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
    momentum = recentAvg - olderAvg;
  }

  const trend: LifeDomain['trend'] =
    momentum > 5 ? 'improving' : momentum < -5 ? 'declining' : 'stable';

  return {
    name,
    currentScore: Math.round(Math.min(100, Math.max(0, score))),
    trend,
    momentum: Math.round(momentum),
    keyMetrics: metrics,
    recentChanges: [], // Would be populated from change detection
  };
}

// ============================================================================
// Connection Detection
// ============================================================================

/**
 * Detect connections between domains
 */
function detectConnections(domains: LifeDomain[]): CrossDomainConnection[] {
  const connections: CrossDomainConnection[] = [];

  // Known connection patterns
  const knownConnections: Array<{
    from: DomainName;
    to: DomainName;
    type: ConnectionType;
    baseStrength: number;
    description: string;
  }> = [
    {
      from: 'health',
      to: 'career',
      type: 'enabling',
      baseStrength: 70,
      description: 'Physical health enables sustained career performance',
    },
    {
      from: 'health',
      to: 'emotional_wellbeing',
      type: 'causal',
      baseStrength: 80,
      description: 'Physical health directly affects mood and emotional state',
    },
    {
      from: 'emotional_wellbeing',
      to: 'relationships',
      type: 'enabling',
      baseStrength: 75,
      description: 'Emotional stability enables better relationship engagement',
    },
    {
      from: 'career',
      to: 'finances',
      type: 'causal',
      baseStrength: 85,
      description: 'Career success drives financial outcomes',
    },
    {
      from: 'relationships',
      to: 'emotional_wellbeing',
      type: 'correlational',
      baseStrength: 80,
      description: 'Strong relationships correlate with emotional wellbeing',
    },
    {
      from: 'personal_growth',
      to: 'career',
      type: 'enabling',
      baseStrength: 65,
      description: 'Personal growth enables career advancement',
    },
    {
      from: 'finances',
      to: 'emotional_wellbeing',
      type: 'correlational',
      baseStrength: 60,
      description: 'Financial security reduces stress',
    },
    {
      from: 'career',
      to: 'relationships',
      type: 'competing',
      baseStrength: 50,
      description: 'Career and relationships compete for time and energy',
    },
  ];

  for (const conn of knownConnections) {
    const fromDomain = domains.find((d) => d.name === conn.from);
    const toDomain = domains.find((d) => d.name === conn.to);

    if (!fromDomain || !toDomain) continue;

    // Adjust strength based on current state
    let adjustedStrength = conn.baseStrength;

    // If from domain is declining, connection becomes more apparent
    if (fromDomain.trend === 'declining') {
      adjustedStrength += 10;
    }

    // Generate evidence based on metrics
    const evidence: string[] = [];
    if (fromDomain.trend !== 'stable') {
      evidence.push(`${conn.from} is ${fromDomain.trend} (momentum: ${fromDomain.momentum})`);
    }
    if (toDomain.trend !== 'stable') {
      evidence.push(`${conn.to} is ${toDomain.trend} (momentum: ${toDomain.momentum})`);
    }

    connections.push({
      fromDomain: conn.from,
      toDomain: conn.to,
      connectionType: conn.type,
      strength: adjustedStrength,
      description: conn.description,
      evidence,
      recommendation:
        conn.type === 'blocking'
          ? `Address ${conn.from} issues to unblock ${conn.to} progress`
          : conn.type === 'competing'
            ? `Balance time between ${conn.from} and ${conn.to}`
            : undefined,
    });
  }

  return connections;
}

// ============================================================================
// Insight Generation
// ============================================================================

/**
 * Generate cross-domain insights
 */
function generateInsights(
  domains: LifeDomain[],
  connections: CrossDomainConnection[]
): SynthesisInsight[] {
  const insights: SynthesisInsight[] = [];

  // Detect cascading decline
  const decliningDomains = domains.filter((d) => d.trend === 'declining');
  if (decliningDomains.length >= 2) {
    const affectedConnections = connections.filter(
      (c) =>
        decliningDomains.some((d) => d.name === c.fromDomain) &&
        (c.connectionType === 'causal' || c.connectionType === 'enabling')
    );

    if (affectedConnections.length > 0) {
      insights.push({
        id: `insight_cascade_${Date.now()}`,
        title: 'Cross-Domain Decline Detected',
        description: `Multiple connected areas are declining simultaneously: ${decliningDomains.map((d) => d.name).join(', ')}`,
        domains: decliningDomains.map((d) => d.name),
        confidence: 85,
        actionable: true,
        urgency: 'high',
        evidence: [
          ...decliningDomains.map((d) => `${d.name} declining with momentum ${d.momentum}`),
          ...affectedConnections.map((c) => `${c.fromDomain} → ${c.toDomain}: ${c.description}`),
        ],
        humanEquivalent: 'You seem stressed in a few areas lately',
        ferniInsight: `I see a cascade pattern: the decline in ${decliningDomains[0]?.name} is likely propagating to ${affectedConnections.map((c) => c.toDomain).join(', ')} through established connections. Intervening at the source (${decliningDomains[0]?.name}) would have compound positive effects.`,
      });
    }
  }

  // Detect positive momentum
  const improvingDomains = domains.filter((d) => d.trend === 'improving');
  if (improvingDomains.length >= 2) {
    insights.push({
      id: `insight_momentum_${Date.now()}`,
      title: 'Positive Momentum Across Domains',
      description: `Multiple areas showing improvement: ${improvingDomains.map((d) => d.name).join(', ')}`,
      domains: improvingDomains.map((d) => d.name),
      confidence: 80,
      actionable: true,
      urgency: 'low',
      evidence: improvingDomains.map((d) => `${d.name} improving with momentum +${d.momentum}`),
      humanEquivalent: 'Things seem to be going well!',
      ferniInsight: `This is an optimal time to introduce new challenges. Your momentum in ${improvingDomains[0]?.name} can be leveraged to make progress in connected areas. The compound effect of multiple domains improving simultaneously creates exponential life satisfaction gains.`,
    });
  }

  // Detect imbalance
  const scores = domains.map((d) => d.currentScore);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  if (maxScore - minScore > 30) {
    const strongest = domains.find((d) => d.currentScore === maxScore);
    const weakest = domains.find((d) => d.currentScore === minScore);

    if (strongest && weakest) {
      // Check if connected
      const connection = connections.find(
        (c) =>
          (c.fromDomain === strongest.name && c.toDomain === weakest.name) ||
          (c.fromDomain === weakest.name && c.toDomain === strongest.name)
      );

      insights.push({
        id: `insight_imbalance_${Date.now()}`,
        title: 'Life Imbalance Detected',
        description: `Significant gap between ${strongest.name} (${strongest.currentScore}) and ${weakest.name} (${weakest.currentScore})`,
        domains: [strongest.name, weakest.name],
        confidence: 90,
        actionable: true,
        urgency: 'medium',
        evidence: [
          `${strongest.name} score: ${strongest.currentScore}`,
          `${weakest.name} score: ${weakest.currentScore}`,
          `Gap: ${maxScore - minScore} points`,
          ...(connection ? [`These domains are connected: ${connection.description}`] : []),
        ],
        humanEquivalent: `You're doing great at ${strongest.name} but ${weakest.name} might need attention`,
        ferniInsight: `The ${maxScore - minScore} point gap suggests potential for optimization. ${
          connection?.connectionType === 'competing'
            ? `These domains compete for resources - conscious allocation would help.`
            : connection?.connectionType === 'enabling'
              ? `Improving ${weakest.name} could actually boost ${strongest.name} further.`
              : `Redirecting 10% of ${strongest.name} energy to ${weakest.name} would likely yield better overall life satisfaction.`
        }`,
      });
    }
  }

  // Detect hidden connections (domains moving in sync)
  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const d1 = domains[i];
      const d2 = domains[j];

      // Same trend with similar momentum suggests hidden connection
      if (
        d1.trend === d2.trend &&
        d1.trend !== 'stable' &&
        Math.abs(d1.momentum - d2.momentum) < 10
      ) {
        const existingConnection = connections.find(
          (c) =>
            (c.fromDomain === d1.name && c.toDomain === d2.name) ||
            (c.fromDomain === d2.name && c.toDomain === d1.name)
        );

        if (!existingConnection) {
          insights.push({
            id: `insight_hidden_${Date.now()}_${i}_${j}`,
            title: 'Hidden Connection Detected',
            description: `${d1.name} and ${d2.name} are moving in sync`,
            domains: [d1.name, d2.name],
            confidence: 60,
            actionable: false,
            urgency: 'low',
            evidence: [
              `${d1.name}: ${d1.trend} (momentum ${d1.momentum})`,
              `${d2.name}: ${d2.trend} (momentum ${d2.momentum})`,
              'Similar patterns suggest shared underlying factor',
            ],
            humanEquivalent: 'Interesting coincidence',
            ferniInsight: `I'm detecting a correlation that may reveal a shared root cause. This could be a lifestyle factor, a significant life event, or an unconscious priority shift. Worth exploring what changed that affects both areas.`,
          });
        }
      }
    }
  }

  return insights;
}

/**
 * Generate unified recommendations
 */
function generateRecommendations(
  domains: LifeDomain[],
  connections: CrossDomainConnection[],
  insights: SynthesisInsight[]
): UnifiedRecommendation[] {
  const recommendations: UnifiedRecommendation[] = [];

  // Find high-leverage intervention points
  const decliningDomains = domains.filter((d) => d.trend === 'declining');

  for (const domain of decliningDomains) {
    // Find what this domain enables
    const downstreamEffects = connections.filter(
      (c) => c.fromDomain === domain.name && c.connectionType === 'enabling'
    );

    if (downstreamEffects.length > 0) {
      recommendations.push({
        id: `rec_leverage_${domain.name}_${Date.now()}`,
        title: `Prioritize ${domain.name} - High Leverage Point`,
        description: `Improving ${domain.name} will cascade positive effects to ${downstreamEffects.map((e) => e.toDomain).join(', ')}`,
        affectedDomains: [domain.name, ...downstreamEffects.map((e) => e.toDomain)],
        expectedImpact: [
          { domain: domain.name, change: 15, timeframe: '30 days' },
          ...downstreamEffects.map((e) => ({
            domain: e.toDomain,
            change: Math.round(10 * (e.strength / 100)),
            timeframe: '60 days',
          })),
        ],
        effort: 'medium',
        priority: 90,
        reasoning: `${domain.name} is currently declining and enables ${downstreamEffects.length} other domains. Focusing here provides maximum return on effort.`,
      });
    }
  }

  // Balance recommendations for competing domains
  const competingConnections = connections.filter((c) => c.connectionType === 'competing');
  for (const conn of competingConnections) {
    const from = domains.find((d) => d.name === conn.fromDomain);
    const to = domains.find((d) => d.name === conn.toDomain);

    if (from && to && Math.abs(from.currentScore - to.currentScore) > 20) {
      recommendations.push({
        id: `rec_balance_${conn.fromDomain}_${conn.toDomain}_${Date.now()}`,
        title: `Balance ${conn.fromDomain} and ${conn.toDomain}`,
        description: `These domains compete for your resources. Conscious allocation would improve overall satisfaction.`,
        affectedDomains: [conn.fromDomain, conn.toDomain],
        expectedImpact: [
          { domain: conn.fromDomain, change: -5, timeframe: '30 days' },
          { domain: conn.toDomain, change: 15, timeframe: '30 days' },
        ],
        effort: 'low',
        priority: 70,
        reasoning: `Transferring 10-15% of effort from ${from.currentScore > to.currentScore ? conn.fromDomain : conn.toDomain} would balance your life without significant loss.`,
      });
    }
  }

  // Sort by priority
  return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

/**
 * Generate risk alerts
 */
function generateRiskAlerts(
  domains: LifeDomain[],
  connections: CrossDomainConnection[]
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  // Burnout risk - multiple domains declining + low emotional wellbeing
  const emotional = domains.find((d) => d.name === 'emotional_wellbeing');
  const decliningCount = domains.filter((d) => d.trend === 'declining').length;

  if (decliningCount >= 3 || (decliningCount >= 2 && emotional && emotional.currentScore < 40)) {
    alerts.push({
      id: `alert_burnout_${Date.now()}`,
      title: 'Burnout Risk Detected',
      description: 'Multiple life domains declining with compromised emotional state',
      riskLevel: decliningCount >= 3 ? 'high' : 'moderate',
      domains: domains.filter((d) => d.trend === 'declining').map((d) => d.name),
      indicators: [
        `${decliningCount} domains declining`,
        ...(emotional ? [`Emotional wellbeing: ${emotional.currentScore}/100`] : []),
        'Pattern consistent with burnout trajectory',
      ],
      projectedConsequence: 'Without intervention, full burnout likely within 4-8 weeks',
      preventionSteps: [
        'Reduce commitments immediately',
        'Prioritize sleep and recovery',
        'Reach out to support network',
        'Consider professional support',
      ],
      timeToImpact: '4-8 weeks',
    });
  }

  // Relationship drift risk
  const relationships = domains.find((d) => d.name === 'relationships');
  const career = domains.find((d) => d.name === 'career');

  if (
    relationships &&
    career &&
    relationships.trend === 'declining' &&
    career.trend === 'improving'
  ) {
    alerts.push({
      id: `alert_relationship_drift_${Date.now()}`,
      title: 'Relationship Drift Risk',
      description: 'Career growth appears to be coming at the cost of relationships',
      riskLevel: 'moderate',
      domains: ['career', 'relationships'],
      indicators: [
        `Career improving (momentum: +${career.momentum})`,
        `Relationships declining (momentum: ${relationships.momentum})`,
        'Classic trade-off pattern detected',
      ],
      projectedConsequence: 'Continued trajectory may damage key relationships irreparably',
      preventionSteps: [
        'Schedule non-negotiable relationship time',
        'Set work boundaries',
        'Communicate priorities with loved ones',
        'Review what success means to you',
      ],
    });
  }

  return alerts;
}

/**
 * Detect opportunity windows
 */
function detectOpportunities(
  domains: LifeDomain[],
  connections: CrossDomainConnection[]
): OpportunityWindow[] {
  const opportunities: OpportunityWindow[] = [];

  // High momentum opportunity
  const highMomentum = domains.filter((d) => d.momentum > 10);
  if (highMomentum.length >= 2) {
    opportunities.push({
      id: `opp_momentum_${Date.now()}`,
      title: 'Momentum Window Open',
      description: 'Multiple domains with strong positive momentum create opportunity for breakthrough',
      domains: highMomentum.map((d) => d.name),
      catalysts: highMomentum.map((d) => `${d.name} momentum: +${d.momentum}`),
      potentialGain: 'Significant life upgrade possible with focused effort',
      actionRequired: 'Consider adding stretch goals or new challenges while energy is high',
    });
  }

  // Foundation ready for growth
  const health = domains.find((d) => d.name === 'health');
  const emotional = domains.find((d) => d.name === 'emotional_wellbeing');

  if (
    health &&
    emotional &&
    health.currentScore > 70 &&
    emotional.currentScore > 70 &&
    health.trend !== 'declining' &&
    emotional.trend !== 'declining'
  ) {
    opportunities.push({
      id: `opp_foundation_${Date.now()}`,
      title: 'Strong Foundation Opportunity',
      description: 'Health and emotional wellbeing are solid - ideal time for ambitious goals',
      domains: ['health', 'emotional_wellbeing', 'career', 'personal_growth'],
      catalysts: [
        `Health: ${health.currentScore}/100`,
        `Emotional wellbeing: ${emotional.currentScore}/100`,
        'Stable foundation enables risk-taking',
      ],
      potentialGain: 'Launch major initiative with full capacity available',
      actionRequired: 'Identify one ambitious goal that has been waiting for the right moment',
    });
  }

  return opportunities;
}

// ============================================================================
// Main Synthesis Function
// ============================================================================

/**
 * Generate complete life synthesis
 */
export async function generateLifeSynthesis(userId: string): Promise<LifeSynthesis> {
  const startTime = Date.now();
  log.info({ userId }, 'Generating cross-domain life synthesis');

  // Gather data
  const data = await gatherSynthesisData(userId);

  // Analyze each domain
  const domains: LifeDomain[] = [
    analyzeDomain('health', data.health, data.habits, data.conversations),
    analyzeDomain('career', data.career, data.habits, data.conversations),
    analyzeDomain('relationships', data.relationships, data.habits, data.conversations),
    analyzeDomain('finances', data.finances, data.habits, data.conversations),
    analyzeDomain('personal_growth', data.growth, data.habits, data.conversations),
    analyzeDomain('emotional_wellbeing', data.emotional, data.habits, data.conversations),
  ];

  // Detect connections
  const connections = detectConnections(domains);

  // Generate insights
  const insights = generateInsights(domains, connections);

  // Generate recommendations
  const recommendations = generateRecommendations(domains, connections, insights);

  // Generate risk alerts
  const riskAlerts = generateRiskAlerts(domains, connections);

  // Detect opportunities
  const opportunities = detectOpportunities(domains, connections);

  const synthesis: LifeSynthesis = {
    userId,
    generatedAt: new Date().toISOString(),
    domains,
    connections,
    cascades: [], // Would be populated from change detection over time
    insights,
    recommendations,
    riskAlerts,
    opportunities,
  };

  // Store synthesis
  const db = getFirestoreDb();
  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('life_synthesis')
        .doc(synthesis.generatedAt)
        .set(synthesis);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store synthesis');
    }
  }

  const duration = Date.now() - startTime;
  log.info(
    {
      userId,
      duration,
      insightCount: insights.length,
      alertCount: riskAlerts.length,
      opportunityCount: opportunities.length,
    },
    'Cross-domain synthesis generated'
  );

  return synthesis;
}

/**
 * Get the latest synthesis for a user
 */
export async function getLatestSynthesis(userId: string): Promise<LifeSynthesis | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('life_synthesis')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as LifeSynthesis;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get latest synthesis');
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const crossDomainSynthesis = {
  generate: generateLifeSynthesis,
  getLatest: getLatestSynthesis,
};

export default crossDomainSynthesis;
