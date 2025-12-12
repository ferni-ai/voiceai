/**
 * Landing Optimization Agent
 *
 * An AI-powered agent that automatically optimizes the landing page.
 * Uses Ferni's team personas to handle different aspects:
 *
 * - **Ferni**: Overall coordination, tone consistency
 * - **Peter**: Data analysis, pattern recognition
 * - **Alex**: Copy generation, A/B variant creation
 * - **Maya**: User behavior patterns, conversion habits
 * - **Jordan**: Experiment scheduling, campaign planning
 *
 * @module services/landing-intelligence/optimization-agent
 */

import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { generateJSON, generateText } from './gemini-client.js';
import type { VisitorIntent } from './intent-detector.js';

const log = createLogger({ module: 'LandingOptimizationAgent' });

// ============================================================================
// TYPES
// ============================================================================

export interface OptimizationInsight {
  id: string;
  persona: 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan';
  type: 'observation' | 'recommendation' | 'experiment' | 'alert';
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
  data?: Record<string, unknown>;
  createdAt: Date;
}

export interface ExperimentSuggestion {
  id: string;
  name: string;
  hypothesis: string;
  variants: {
    control: Record<string, string>;
    treatment: Record<string, string>;
  };
  targetMetric: string;
  suggestedDuration: number; // days
  estimatedImpact: 'low' | 'medium' | 'high';
  persona: string;
  reasoning: string;
}

export interface LandingMetrics {
  period: 'day' | 'week' | 'month';
  visitors: number;
  uniqueVisitors: number;
  returningVisitors: number;
  avgTimeOnPage: number;
  avgScrollDepth: number;
  ctaClicks: number;
  conversions: number;
  conversionRate: number;
  topSections: Array<{ section: string; avgTime: number }>;
  topIntents: Array<{ intent: string; count: number }>;
  timeDistribution: Record<string, number>;
}

export interface AgentReport {
  id: string;
  generatedAt: Date;
  period: string;
  metrics: LandingMetrics;
  insights: OptimizationInsight[];
  experiments: ExperimentSuggestion[];
  summary: string;
}

// ============================================================================
// METRICS COLLECTION
// ============================================================================

export async function collectLandingMetrics(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<LandingMetrics> {
  const db = getFirestore();

  const now = new Date();
  const periodMs = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  }[period];

  const startDate = new Date(now.getTime() - periodMs);

  try {
    // Get sessions from Firestore
    const sessionsRef = db.collection('landing_sessions');
    const sessionsQuery = sessionsRef.where('startTime', '>=', startDate);
    const sessionsSnapshot = await sessionsQuery.get();

    const sessions = sessionsSnapshot.docs.map((doc) => doc.data());

    // Calculate metrics
    const visitors = sessions.length;
    const uniqueVisitorIds = new Set(sessions.map((s) => s.visitorId));
    const uniqueVisitors = uniqueVisitorIds.size;

    // Get returning visitors
    const visitorsRef = db.collection('landing_visitors');
    const returningQuery = visitorsRef.where('visitCount', '>', 1);
    const returningSnapshot = await returningQuery.get();
    const returningVisitors = returningSnapshot.size;

    // Calculate averages
    let totalTime = 0;
    let totalScrollDepth = 0;
    let totalCtaClicks = 0;
    let totalConversions = 0;
    const sectionTimes: Record<string, number[]> = {};
    const intentCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};

    for (const session of sessions) {
      // Time on page
      if (session.endTime && session.startTime) {
        const duration =
          (session.endTime.toDate?.() || new Date(session.endTime)).getTime() -
          (session.startTime.toDate?.() || new Date(session.startTime)).getTime();
        totalTime += duration / 1000;
      }

      // Scroll depth
      totalScrollDepth += session.scrollDepth || 0;

      // CTA clicks
      totalCtaClicks += session.ctaClicks || 0;

      // Conversions
      if (session.converted) totalConversions++;

      // Section times
      if (session.timePerSection) {
        for (const [section, time] of Object.entries(session.timePerSection)) {
          if (!sectionTimes[section]) sectionTimes[section] = [];
          sectionTimes[section].push(time as number);
        }
      }

      // Hour distribution
      const hour = (session.startTime.toDate?.() || new Date(session.startTime)).getHours();
      const hourKey = `${hour}:00`;
      hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
    }

    // Top sections by average time
    const topSections = Object.entries(sectionTimes)
      .map(([section, times]) => ({
        section,
        avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    // Top intents
    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      period,
      visitors,
      uniqueVisitors,
      returningVisitors,
      avgTimeOnPage: visitors > 0 ? totalTime / visitors : 0,
      avgScrollDepth: visitors > 0 ? totalScrollDepth / visitors : 0,
      ctaClicks: totalCtaClicks,
      conversions: totalConversions,
      conversionRate: visitors > 0 ? (totalConversions / visitors) * 100 : 0,
      topSections,
      topIntents,
      timeDistribution: hourCounts,
    };
  } catch (error) {
    log.error({ error }, 'Failed to collect landing metrics');
    return {
      period,
      visitors: 0,
      uniqueVisitors: 0,
      returningVisitors: 0,
      avgTimeOnPage: 0,
      avgScrollDepth: 0,
      ctaClicks: 0,
      conversions: 0,
      conversionRate: 0,
      topSections: [],
      topIntents: [],
      timeDistribution: {},
    };
  }
}

// ============================================================================
// PERSONA ANALYSIS
// ============================================================================

const PERSONA_PROMPTS = {
  peter: `You are Peter, Ferni's research specialist. Analyze this landing page data with scientific rigor.
Focus on: statistical patterns, data anomalies, segment analysis, correlation insights.
Be precise, cite numbers, and suggest data-driven improvements.`,

  alex: `You are Alex, Ferni's communications expert. Analyze this landing page data for messaging opportunities.
Focus on: copy effectiveness, tone resonance, headline performance, CTA clarity.
Suggest specific copy variations that would resonate better.`,

  maya: `You are Maya, Ferni's habits specialist. Analyze this landing page data for behavioral patterns.
Focus on: user journey friction, drop-off points, engagement habits, scroll patterns.
Suggest micro-improvements that reduce friction.`,

  jordan: `You are Jordan, Ferni's planning expert. Analyze this landing page data for optimization strategy.
Focus on: experiment prioritization, campaign timing, resource allocation, roadmap.
Suggest a structured plan for improvements.`,

  ferni: `You are Ferni, the life coach and team coordinator. Review the team's analysis and synthesize.
Focus on: overall narrative, brand consistency, emotional resonance, user experience.
Ensure all suggestions align with "better than human" positioning.`,
};

async function getPersonaInsights(
  persona: keyof typeof PERSONA_PROMPTS,
  metrics: LandingMetrics
): Promise<OptimizationInsight[]> {
  const prompt = `${PERSONA_PROMPTS[persona]}

LANDING PAGE METRICS (${metrics.period}):
${JSON.stringify(metrics, null, 2)}

Provide 2-3 actionable insights. Return JSON array:
[
  {
    "type": "observation" | "recommendation" | "experiment" | "alert",
    "title": "short title",
    "description": "detailed explanation",
    "confidence": 0.0-1.0,
    "actionable": true/false,
    "suggestedAction": "specific action to take"
  }
]`;

  const insights = await generateJSON<
    Array<{
      type: string;
      title: string;
      description: string;
      confidence: number;
      actionable: boolean;
      suggestedAction?: string;
    }>
  >(prompt, { timeout: 10000 });

  if (!insights) return [];

  return insights.map((insight, idx) => ({
    id: `${persona}_${Date.now()}_${idx}`,
    persona,
    type: insight.type as OptimizationInsight['type'],
    title: insight.title,
    description: insight.description,
    confidence: insight.confidence,
    actionable: insight.actionable,
    suggestedAction: insight.suggestedAction,
    createdAt: new Date(),
  }));
}

// ============================================================================
// EXPERIMENT GENERATION
// ============================================================================

async function generateExperimentSuggestions(
  metrics: LandingMetrics,
  insights: OptimizationInsight[]
): Promise<ExperimentSuggestion[]> {
  const prompt = `Based on these landing page metrics and insights, suggest A/B experiments.

METRICS:
${JSON.stringify(metrics, null, 2)}

INSIGHTS:
${insights.map((i) => `[${i.persona}] ${i.title}: ${i.description}`).join('\n')}

FERNI BRAND RULES:
- Never use: "chatbot", "AI assistant", "platform", "user"
- Voice: Warm, Grounded, Wise, Present, Human
- Compare to humans, not other AI
- Lead with emotion, not features

Suggest 2-3 high-impact experiments. Return JSON array:
[
  {
    "name": "experiment name",
    "hypothesis": "If we X, then Y because Z",
    "variants": {
      "control": { "element": "current value" },
      "treatment": { "element": "new value" }
    },
    "targetMetric": "metric to measure",
    "suggestedDuration": days,
    "estimatedImpact": "low" | "medium" | "high",
    "persona": "which persona suggested this",
    "reasoning": "why this will work"
  }
]`;

  const experiments = await generateJSON<ExperimentSuggestion[]>(prompt, {
    timeout: 15000,
  });

  if (!experiments) return [];

  return experiments.map((exp, idx) => ({
    ...exp,
    id: `exp_${Date.now()}_${idx}`,
  }));
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

export async function generateOptimizationReport(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<AgentReport> {
  log.info({ period }, 'Generating optimization report');

  // Collect metrics
  const metrics = await collectLandingMetrics(period);

  // Get insights from each persona
  const allInsights: OptimizationInsight[] = [];

  // Run persona analyses in parallel
  const personaResults = await Promise.all([
    getPersonaInsights('peter', metrics),
    getPersonaInsights('alex', metrics),
    getPersonaInsights('maya', metrics),
    getPersonaInsights('jordan', metrics),
  ]);

  for (const insights of personaResults) {
    allInsights.push(...insights);
  }

  // Ferni synthesizes
  const ferniInsights = await getPersonaInsights('ferni', metrics);
  allInsights.push(...ferniInsights);

  // Generate experiment suggestions
  const experiments = await generateExperimentSuggestions(metrics, allInsights);

  // Generate summary
  const summary = await generateText(
    `Summarize this landing page optimization report in 2-3 sentences for the team:
Visitors: ${metrics.visitors}, Conversion: ${metrics.conversionRate.toFixed(1)}%
Top insights: ${allInsights
      .slice(0, 3)
      .map((i) => i.title)
      .join(', ')}
Suggested experiments: ${experiments.length}`,
    { maxTokens: 150 }
  );

  const report: AgentReport = {
    id: `report_${Date.now()}`,
    generatedAt: new Date(),
    period,
    metrics,
    insights: allInsights,
    experiments,
    summary: summary || 'Report generated successfully.',
  };

  // Persist report
  await persistReport(report);

  log.info(
    {
      reportId: report.id,
      insightCount: allInsights.length,
      experimentCount: experiments.length,
    },
    'Optimization report generated'
  );

  return report;
}

async function persistReport(report: AgentReport): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection('landing_optimization_reports').doc(report.id).set({
      ...report,
      generatedAt: report.generatedAt,
    });
  } catch (error) {
    log.warn({ error }, 'Failed to persist optimization report');
  }
}

// ============================================================================
// AUTOMATED ACTIONS
// ============================================================================

export interface AutomationConfig {
  autoApproveExperiments: boolean;
  minConfidenceForAction: number;
  notifyOnAlerts: boolean;
  slackWebhook?: string;
}

const DEFAULT_CONFIG: AutomationConfig = {
  autoApproveExperiments: false,
  minConfidenceForAction: 0.8,
  notifyOnAlerts: true,
};

export async function runAutomatedOptimization(
  config: AutomationConfig = DEFAULT_CONFIG
): Promise<{
  report: AgentReport;
  actionsExecuted: string[];
}> {
  const report = await generateOptimizationReport('week');
  const actionsExecuted: string[] = [];

  // Handle high-confidence alerts
  const alerts = report.insights.filter(
    (i) => i.type === 'alert' && i.confidence >= config.minConfidenceForAction
  );

  if (alerts.length > 0 && config.notifyOnAlerts) {
    // Could send to Slack, email, etc.
    log.warn({ alertCount: alerts.length }, 'High-confidence alerts detected');
    actionsExecuted.push(`Flagged ${alerts.length} alerts for review`);
  }

  // Auto-approve high-impact experiments if configured
  if (config.autoApproveExperiments) {
    const highImpactExperiments = report.experiments.filter(
      (e) => e.estimatedImpact === 'high'
    );

    for (const experiment of highImpactExperiments) {
      // Create experiment in the experiments system
      // This would integrate with the existing A/B testing infrastructure
      log.info({ experimentId: experiment.id }, 'Auto-approved experiment');
      actionsExecuted.push(`Auto-approved experiment: ${experiment.name}`);
    }
  }

  return { report, actionsExecuted };
}

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

export async function dailyOptimizationCheck(): Promise<void> {
  log.info('Running daily optimization check');

  try {
    const { report, actionsExecuted } = await runAutomatedOptimization({
      autoApproveExperiments: false,
      minConfidenceForAction: 0.9,
      notifyOnAlerts: true,
    });

    log.info(
      {
        reportId: report.id,
        actions: actionsExecuted.length,
      },
      'Daily optimization check complete'
    );
  } catch (error) {
    log.error({ error }, 'Daily optimization check failed');
  }
}

export async function weeklyOptimizationReport(): Promise<AgentReport> {
  log.info('Generating weekly optimization report');
  return generateOptimizationReport('week');
}

// ============================================================================
// ADDITIONAL EXPORTS (for direct imports)
// ============================================================================

export { getPersonaInsights, generateExperimentSuggestions };

