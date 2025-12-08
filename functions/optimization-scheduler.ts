/**
 * Cloud Functions for Tool Optimization
 *
 * Standalone scheduled functions for automated tool optimization.
 * These functions run independently and access Firestore directly.
 *
 * Deploy with: firebase deploy --only functions
 */

import { onSchedule, ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { onRequest, Request } from 'firebase-functions/v2/https';
import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';

const db = new Firestore();

// Slack webhook URLs - set via environment variables or Cloud Run secrets
const SLACK_ALERTS_URL = process.env.SLACK_ALERTS_WEBHOOK_URL || 'https://hooks.slack.com/services/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';
const SLACK_REPORTS_URL = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/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';

// ============================================================================
// TYPES
// ============================================================================

interface ToolStats {
  toolId: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
}

interface FeedbackSummary {
  toolId: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
}

interface DailySummary {
  date: string;
  feedback: {
    total: number;
    positive: number;
    negative: number;
    positiveRate: number;
  };
  sessions: {
    total: number;
  };
  tools: {
    totalCalls: number;
    topTools: Array<{ toolId: string; calls: number }>;
    errorTools: Array<{ toolId: string; errorRate: number }>;
  };
  createdAt: Timestamp | FieldValue;
}

interface OptimizationCycle {
  startTime: Timestamp | FieldValue;
  endTime?: Timestamp | FieldValue;
  status: 'running' | 'completed' | 'failed';
  type: string;
  feedbackAnalyzed: number;
  patternsFound: number;
  recommendationsGenerated: number;
  alertsSent: number;
  errorMessage?: string;
}

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Run optimization analysis every 15 minutes
 * Analyzes tool usage, generates insights, and sends alerts
 */
export const runOptimizationCycle = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'America/Los_Angeles',
  retryCount: 1,
  memory: '512MiB',
}, async (event: ScheduledEvent) => {
  console.log('Starting scheduled optimization cycle', { scheduledTime: event.scheduleTime });

  const cycleRef = db.collection('optimization_cycles').doc();
  const cycle: OptimizationCycle = {
    startTime: FieldValue.serverTimestamp(),
    status: 'running',
    type: 'scheduled',
    feedbackAnalyzed: 0,
    patternsFound: 0,
    recommendationsGenerated: 0,
    alertsSent: 0,
  };

  try {
    await cycleRef.set(cycle);

    // 1. Analyze recent feedback
    const feedbackSnapshot = await db
      .collection('optimization_feedback')
      .where('timestamp', '>=', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .get();
    
    cycle.feedbackAnalyzed = feedbackSnapshot.size;

    // 2. Analyze tool usage patterns
    const statsSnapshot = await db.collection('tool_usage_stats').get();
    const stats = statsSnapshot.docs.map(doc => doc.data() as ToolStats);

    // Find co-occurring tools (simplified pattern detection)
    const coOccurrences = await analyzeCoOccurrences();
    cycle.patternsFound = coOccurrences.length;

    // 3. Generate recommendations
    const recommendations = await generateRecommendations(stats, feedbackSnapshot.docs);
    cycle.recommendationsGenerated = recommendations.length;

    // Save recommendations
    for (const rec of recommendations) {
      await db.collection('optimization_recommendations').add({
        ...rec,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // 4. Check for alerts
    const alertsSent = await checkAndSendAlerts(stats);
    cycle.alertsSent = alertsSent;

    // Update cycle as completed
    await cycleRef.update({
      endTime: FieldValue.serverTimestamp(),
      status: 'completed',
      feedbackAnalyzed: cycle.feedbackAnalyzed,
      patternsFound: cycle.patternsFound,
      recommendationsGenerated: cycle.recommendationsGenerated,
      alertsSent: cycle.alertsSent,
    });

    console.log('Optimization cycle complete', {
      cycleId: cycleRef.id,
      feedbackAnalyzed: cycle.feedbackAnalyzed,
      recommendations: cycle.recommendationsGenerated,
      patterns: cycle.patternsFound,
      alerts: cycle.alertsSent,
    });

  } catch (error) {
    console.error('Optimization cycle failed', { error: String(error) });
    await cycleRef.update({
      endTime: FieldValue.serverTimestamp(),
      status: 'failed',
      errorMessage: String(error),
    });
    throw error;
  }
});

/**
 * Daily analytics summary - runs at 6 AM
 */
export const dailyAnalyticsSummary = onSchedule({
  schedule: '0 6 * * *',
  timeZone: 'America/Los_Angeles',
  retryCount: 2,
  memory: '256MiB',
}, async () => {
  console.log('Generating daily analytics summary');

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get feedback from yesterday
    const feedbackSnapshot = await db
      .collection('optimization_feedback')
      .where('timestamp', '>=', yesterday.toISOString())
      .where('timestamp', '<', today.toISOString())
      .get();

    const feedback = feedbackSnapshot.docs.map(d => d.data());
    const positiveCount = feedback.filter(f => f.sentiment === 'positive').length;
    const negativeCount = feedback.filter(f => f.sentiment === 'negative').length;

    // Get sessions from yesterday
    const sessionsSnapshot = await db
      .collection('optimization_sessions')
      .where('startTime', '>=', yesterday.toISOString())
      .where('startTime', '<', today.toISOString())
      .get();

    // Get tool usage stats
    const statsSnapshot = await db.collection('tool_usage_stats').get();
    const stats = statsSnapshot.docs.map(d => d.data() as ToolStats);
    
    const topTools = stats
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 5)
      .map(s => ({ toolId: s.toolId, calls: s.totalCalls }));

    const errorTools = stats
      .filter(s => s.totalCalls > 0 && s.failureCount / s.totalCalls > 0.1)
      .map(s => ({ toolId: s.toolId, errorRate: s.failureCount / s.totalCalls }));

    // Store daily summary
    const summary: DailySummary = {
      date: yesterday.toISOString().split('T')[0],
      feedback: {
        total: feedback.length,
        positive: positiveCount,
        negative: negativeCount,
        positiveRate: feedback.length > 0 ? positiveCount / feedback.length : 0,
      },
      sessions: {
        total: sessionsSnapshot.size,
      },
      tools: {
        totalCalls: stats.reduce((sum, s) => sum + s.totalCalls, 0),
        topTools,
        errorTools,
      },
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection('optimization_daily_summaries').doc(summary.date).set(summary);
    console.log('Daily summary generated', summary);

  } catch (error) {
    console.error('Daily summary failed', { error: String(error) });
    throw error;
  }
});

/**
 * Weekly recommendations report - runs every Monday at 8 AM
 */
export const weeklyRecommendationsReport = onSchedule({
  schedule: '0 8 * * 1',
  timeZone: 'America/Los_Angeles',
  retryCount: 2,
  memory: '256MiB',
}, async () => {
  console.log('Generating weekly recommendations report');

  try {
    // Get pending recommendations
    const recsSnapshot = await db
      .collection('optimization_recommendations')
      .where('status', '==', 'pending')
      .orderBy('priority', 'desc')
      .limit(20)
      .get();

    const recommendations = recsSnapshot.docs.map(d => ({
      id: d.id,
      ...d.data() as { title: string; type: string; priority: string; description: string },
    }));

    // Get last week's daily summaries
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const summariesSnapshot = await db
      .collection('optimization_daily_summaries')
      .where('date', '>=', lastWeek.toISOString().split('T')[0])
      .get();

    const summaries = summariesSnapshot.docs.map(d => d.data() as DailySummary);
    const totalFeedback = summaries.reduce((sum, s) => sum + (s.feedback?.total || 0), 0);
    const avgPositiveRate = summaries.length > 0
      ? summaries.reduce((sum, s) => sum + (s.feedback?.positiveRate || 0), 0) / summaries.length
      : 0;

    // Create weekly report
    const report = {
      weekEnding: new Date().toISOString().split('T')[0],
      stats: {
        totalFeedback,
        avgPositiveRate: Math.round(avgPositiveRate * 100),
        totalSessions: summaries.reduce((sum, s) => sum + (s.sessions?.total || 0), 0),
      },
      topRecommendations: recommendations.slice(0, 10).map(r => ({
        title: r.title,
        type: r.type,
        priority: r.priority,
      })),
      pendingCount: recommendations.length,
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection('optimization_weekly_reports').add(report);

    // Send to Slack if configured
    const webhook = process.env.SLACK_WEBHOOK_URL || SLACK_REPORTS_URL;
    if (webhook) {
      await sendSlackReport(webhook, report);
    }

    console.log('Weekly report generated', { recommendations: recommendations.length });

  } catch (error) {
    console.error('Weekly report failed', { error: String(error) });
    throw error;
  }
});

// ============================================================================
// HTTP TRIGGERS
// ============================================================================

/**
 * HTTP endpoint to manually trigger optimization
 */
export const triggerOptimization = onRequest({
  memory: '512MiB',
  timeoutSeconds: 120,
}, async (req: Request, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Simple auth check
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.OPTIMIZATION_API_TOKEN;
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    // Run a mini optimization cycle
    const stats = await db.collection('tool_usage_stats').get();
    const statsData = stats.docs.map(d => d.data() as ToolStats);
    const recommendations = await generateRecommendations(statsData, []);

    res.json({
      success: true,
      toolsAnalyzed: stats.size,
      recommendationsGenerated: recommendations.length,
    });
  } catch (error) {
    console.error('Manual optimization trigger failed', { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * HTTP endpoint to get dashboard data
 */
export const dashboardData = onRequest({
  memory: '256MiB',
  timeoutSeconds: 30,
}, async (req: Request, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    // Get tool usage stats
    const statsSnapshot = await db.collection('tool_usage_stats').get();
    const stats = statsSnapshot.docs.map(d => d.data() as ToolStats);

    // Get recent recommendations
    const recsSnapshot = await db
      .collection('optimization_recommendations')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    // Get recent experiments
    const experimentsSnapshot = await db
      .collection('optimization_experiments')
      .limit(10)
      .get();

    // Get feedback summary
    const feedbackSummarySnapshot = await db
      .collection('optimization_feedback_summary')
      .limit(20)
      .get();

    const topTools = stats
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 10)
      .map(s => ({
        toolId: s.toolId,
        calls: s.totalCalls,
        avgLatencyMs: s.avgLatencyMs || (s.totalCalls > 0 ? s.totalLatencyMs / s.totalCalls : 0),
      }));

    const slowTools = stats
      .filter(s => s.totalCalls > 0)
      .sort((a, b) => (b.totalLatencyMs / b.totalCalls) - (a.totalLatencyMs / a.totalCalls))
      .slice(0, 5)
      .map(s => ({
        toolId: s.toolId,
        avgLatencyMs: Math.round(s.totalLatencyMs / s.totalCalls),
      }));

    const errorTools = stats
      .filter(s => s.totalCalls > 0 && s.failureCount > 0)
      .map(s => ({
        toolId: s.toolId,
        errorRate: s.failureCount / s.totalCalls,
      }))
      .filter(t => t.errorRate > 0.05)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 5);

    // Build response
    res.json({
      registry: {
        totalTools: stats.length,
        byDomain: stats.reduce((acc, s) => {
          const domain = s.toolId.split('_')[0] || 'unknown';
          acc[domain] = (acc[domain] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      experiments: experimentsSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })),
      topTools,
      slowTools,
      errorTools,
      recommendations: recsSnapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })),
      feedback: {
        summaries: feedbackSummarySnapshot.docs.map(d => d.data()),
      },
    });
  } catch (error) {
    console.error('Dashboard data fetch failed', { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function analyzeCoOccurrences(): Promise<Array<{ toolA: string; toolB: string; count: number }>> {
  // Get recent sessions
  const sessionsSnapshot = await db
    .collection('optimization_sessions')
    .orderBy('startTime', 'desc')
    .limit(100)
    .get();

  const coOccurrences = new Map<string, number>();

  for (const doc of sessionsSnapshot.docs) {
    const session = doc.data();
    const tools: string[] = session.toolCalls?.map((tc: { toolId: string }) => tc.toolId) || [];
    
    // Count pairs
    for (let i = 0; i < tools.length; i++) {
      for (let j = i + 1; j < tools.length; j++) {
        const pair = [tools[i], tools[j]].sort().join('|');
        coOccurrences.set(pair, (coOccurrences.get(pair) || 0) + 1);
      }
    }
  }

  return Array.from(coOccurrences.entries())
    .map(([pair, count]) => {
      const [toolA, toolB] = pair.split('|');
      return { toolA, toolB, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

interface Recommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  toolId?: string;
}

async function generateRecommendations(
  stats: ToolStats[],
  _feedbackDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Find high-error tools
  for (const tool of stats) {
    if (tool.totalCalls >= 10) {
      const errorRate = tool.failureCount / tool.totalCalls;
      if (errorRate > 0.2) {
        recommendations.push({
          type: 'fix',
          priority: 'critical',
          title: `Fix high error rate in ${tool.toolId}`,
          description: `Tool ${tool.toolId} has ${Math.round(errorRate * 100)}% error rate (${tool.failureCount}/${tool.totalCalls} failures)`,
          toolId: tool.toolId,
        });
      } else if (errorRate > 0.1) {
        recommendations.push({
          type: 'improve',
          priority: 'high',
          title: `Improve reliability of ${tool.toolId}`,
          description: `Tool ${tool.toolId} has ${Math.round(errorRate * 100)}% error rate`,
          toolId: tool.toolId,
        });
      }
    }
  }

  // Find slow tools
  for (const tool of stats) {
    if (tool.totalCalls >= 5) {
      const avgLatency = tool.totalLatencyMs / tool.totalCalls;
      if (avgLatency > 5000) {
        recommendations.push({
          type: 'optimize',
          priority: 'high',
          title: `Optimize slow tool ${tool.toolId}`,
          description: `Tool ${tool.toolId} averages ${Math.round(avgLatency)}ms per call`,
          toolId: tool.toolId,
        });
      } else if (avgLatency > 2000) {
        recommendations.push({
          type: 'optimize',
          priority: 'medium',
          title: `Consider optimizing ${tool.toolId}`,
          description: `Tool ${tool.toolId} averages ${Math.round(avgLatency)}ms per call`,
          toolId: tool.toolId,
        });
      }
    }
  }

  // Find unused tools (no calls in stats)
  const unusedTools = stats.filter(s => s.totalCalls === 0);
  if (unusedTools.length > 5) {
    recommendations.push({
      type: 'cleanup',
      priority: 'low',
      title: `Review ${unusedTools.length} unused tools`,
      description: `Consider deprecating or improving discoverability of unused tools`,
    });
  }

  return recommendations;
}

async function checkAndSendAlerts(stats: ToolStats[]): Promise<number> {
  if (!SLACK_ALERTS_URL) return 0;

  let alertsSent = 0;

  // Check for critical error rates
  const criticalTools = stats.filter(s => 
    s.totalCalls >= 10 && (s.failureCount / s.totalCalls) > 0.25
  );

  if (criticalTools.length > 0) {
    await sendSlackAlert(SLACK_ALERTS_URL, {
      type: 'critical_errors',
      message: `🚨 ${criticalTools.length} tools have >25% error rate`,
      tools: criticalTools.map(t => ({
        toolId: t.toolId,
        errorRate: Math.round((t.failureCount / t.totalCalls) * 100),
      })),
    });
    alertsSent++;
  }

  return alertsSent;
}

async function sendSlackAlert(
  webhookUrl: string,
  alert: { type: string; message: string; [key: string]: unknown }
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: alert.message,
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '```' + JSON.stringify(alert, null, 2) + '```',
            },
          },
        ],
      }),
    });
    console.log('Slack alert sent', { type: alert.type });
  } catch (error) {
    console.error('Failed to send Slack alert', { error: String(error) });
  }
}

async function sendSlackReport(
  webhookUrl: string,
  report: {
    weekEnding: string;
    stats: { totalFeedback: number; avgPositiveRate: number; totalSessions: number };
    topRecommendations: Array<{ title: string; type: string; priority: string }>;
    pendingCount: number;
  }
): Promise<void> {
  try {
    const recList = report.topRecommendations
      .map((r, i) => `${i + 1}. [${r.priority.toUpperCase()}] ${r.title}`)
      .join('\n');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `📊 Weekly Tool Optimization Report (${report.weekEnding})`,
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Total Feedback*\n${report.stats.totalFeedback}` },
              { type: 'mrkdwn', text: `*Satisfaction Rate*\n${report.stats.avgPositiveRate}%` },
              { type: 'mrkdwn', text: `*Total Sessions*\n${report.stats.totalSessions}` },
              { type: 'mrkdwn', text: `*Pending Recommendations*\n${report.pendingCount}` },
            ],
          },
          { type: 'divider' },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Top Recommendations:*\n${recList || 'None'}` },
          },
        ],
      }),
    });
    console.log('Slack weekly report sent');
  } catch (error) {
    console.error('Failed to send Slack report', { error: String(error) });
  }
}
