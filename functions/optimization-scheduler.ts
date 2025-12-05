/**
 * Cloud Functions for Tool Optimization
 *
 * Scheduled functions for automated tool optimization:
 * - Periodic optimization cycles (every 15 minutes)
 * - Daily analytics summary
 * - Weekly recommendations report
 * - Alerting for high error rates
 *
 * Deploy with: firebase deploy --only functions
 */

import { onSchedule, ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { onRequest, Request } from 'firebase-functions/v2/https';
import { Firestore, FieldValue } from '@google-cloud/firestore';

const db = new Firestore();

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Run optimization cycle every 15 minutes
 * Analyzes patterns, generates recommendations, checks experiments
 */
export const runOptimizationCycle = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'America/Los_Angeles',
  retryCount: 1,
  memory: '512MiB',
}, async (event: ScheduledEvent) => {
  console.log('Starting scheduled optimization cycle', { scheduledTime: event.scheduleTime });

  try {
    // Record cycle start
    const cycleRef = db.collection('optimization_cycles').doc();
    await cycleRef.set({
      startTime: FieldValue.serverTimestamp(),
      status: 'running',
      type: 'scheduled',
    });

    // Import and run the optimizer
    const { autoOptimizer } = await import('../src/tools/auto-optimizer.js');
    const cycle = await autoOptimizer.runOptimizationCycle();

    // Update cycle record
    await cycleRef.update({
      endTime: FieldValue.serverTimestamp(),
      status: cycle.status,
      feedbackProcessed: cycle.feedbackProcessed,
      patternsFound: cycle.patternsFound,
      recommendationsCreated: cycle.recommendationsCreated,
      experimentsStarted: cycle.experimentsStarted,
    });

    console.log('Optimization cycle complete', {
      cycleId: cycleRef.id,
      recommendations: cycle.recommendationsCreated,
      patterns: cycle.patternsFound,
    });

    // Check for alerts
    await checkForAlerts();

  } catch (error) {
    console.error('Optimization cycle failed', { error: String(error) });
    throw error;
  }
});

/**
 * Daily analytics summary - runs at 6 AM
 * Compiles and stores daily stats
 */
export const dailyAnalyticsSummary = onSchedule({
  schedule: '0 6 * * *', // 6 AM daily
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

    // Get recommendations generated yesterday
    const recsSnapshot = await db
      .collection('optimization_recommendations')
      .where('createdAt', '>=', yesterday.toISOString())
      .where('createdAt', '<', today.toISOString())
      .get();

    // Store daily summary
    const summary = {
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
      recommendations: {
        generated: recsSnapshot.size,
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
 * Compiles actionable recommendations and sends to Slack
 */
export const weeklyRecommendationsReport = onSchedule({
  schedule: '0 8 * * 1', // 8 AM every Monday
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

    // Get last week's stats
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const summariesSnapshot = await db
      .collection('optimization_daily_summaries')
      .where('date', '>=', lastWeek.toISOString().split('T')[0])
      .get();

    const summaries = summariesSnapshot.docs.map(d => d.data());
    const totalFeedback = summaries.reduce((sum, s) => sum + (s.feedback?.total || 0), 0);
    const avgPositiveRate = summaries.length > 0
      ? summaries.reduce((sum, s) => sum + (s.feedback?.positiveRate || 0), 0) / summaries.length
      : 0;

    // Create report
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
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook) {
      await sendSlackReport(slackWebhook, report);
    }

    console.log('Weekly report generated', { recommendations: recommendations.length });

  } catch (error) {
    console.error('Weekly report failed', { error: String(error) });
    throw error;
  }
});

// ============================================================================
// HTTP TRIGGERS (for manual operations)
// ============================================================================

/**
 * HTTP endpoint to manually trigger optimization
 * POST /triggerOptimization
 */
export const triggerOptimization = onRequest({
  memory: '512MiB',
  timeoutSeconds: 120,
}, async (req: Request, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Simple auth check (use proper auth in production)
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.OPTIMIZATION_API_TOKEN;
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    const { autoOptimizer } = await import('../src/tools/auto-optimizer.js');
    const cycle = await autoOptimizer.runOptimizationCycle();

    res.json({
      success: true,
      cycle: {
        status: cycle.status,
        recommendations: cycle.recommendationsCreated,
        patterns: cycle.patternsFound,
      },
    });
  } catch (error) {
    console.error('Manual optimization trigger failed', { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * HTTP endpoint to get dashboard data
 * GET /dashboardData
 */
export const dashboardData = onRequest({
  memory: '256MiB',
  timeoutSeconds: 30,
}, async (req: Request, res) => {
  // CORS headers for dashboard access
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const { getDashboardData } = await import('../src/services/optimization-api.js');
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    console.error('Dashboard data fetch failed', { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// ALERTING
// ============================================================================

/**
 * Check for conditions that warrant alerts
 */
async function checkForAlerts(): Promise<void> {
  const slackWebhook = process.env.SLACK_ALERTS_WEBHOOK_URL;
  if (!slackWebhook) {
    console.log('No Slack webhook configured for alerts');
    return;
  }

  try {
    // Get recent tool stats
    const statsSnapshot = await db
      .collection('tool_usage_stats')
      .where('failureCount', '>', 0)
      .get();

    const problemTools: Array<{ toolId: string; errorRate: number }> = [];

    statsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const errorRate = data.failureCount / data.totalCalls;
      if (errorRate > 0.1 && data.totalCalls >= 10) {
        problemTools.push({
          toolId: data.toolId,
          errorRate: Math.round(errorRate * 100),
        });
      }
    });

    if (problemTools.length > 0) {
      await sendSlackAlert(slackWebhook, {
        type: 'high_error_rate',
        message: `🚨 ${problemTools.length} tools with >10% error rate`,
        tools: problemTools,
      });
    }

    // Check for feedback drops
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdaySummary = await db
      .collection('optimization_daily_summaries')
      .doc(yesterday.toISOString().split('T')[0])
      .get();

    if (yesterdaySummary.exists) {
      const data = yesterdaySummary.data();
      if (data?.feedback?.positiveRate < 0.5 && data?.feedback?.total >= 10) {
        await sendSlackAlert(slackWebhook, {
          type: 'low_satisfaction',
          message: `⚠️ Feedback satisfaction dropped to ${Math.round(data.feedback.positiveRate * 100)}%`,
          details: {
            total: data.feedback.total,
            positive: data.feedback.positive,
            negative: data.feedback.negative,
          },
        });
      }
    }

  } catch (error) {
    console.error('Alert check failed', { error: String(error) });
  }
}

/**
 * Send alert to Slack
 */
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
            fields: Object.entries(alert)
              .filter(([k]) => k !== 'type' && k !== 'message')
              .map(([key, value]) => ({
                type: 'mrkdwn',
                text: `*${key}:*\n${JSON.stringify(value, null, 2)}`,
              })),
          },
        ],
      }),
    });
    console.log('Slack alert sent', { type: alert.type });
  } catch (error) {
    console.error('Failed to send Slack alert', { error: String(error) });
  }
}

/**
 * Send weekly report to Slack
 */
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
              {
                type: 'mrkdwn',
                text: `*Total Feedback*\n${report.stats.totalFeedback}`,
              },
              {
                type: 'mrkdwn',
                text: `*Satisfaction Rate*\n${report.stats.avgPositiveRate}%`,
              },
              {
                type: 'mrkdwn',
                text: `*Total Sessions*\n${report.stats.totalSessions}`,
              },
              {
                type: 'mrkdwn',
                text: `*Pending Recommendations*\n${report.pendingCount}`,
              },
            ],
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Top Recommendations:*\n${recList}`,
            },
          },
        ],
      }),
    });
    console.log('Slack weekly report sent');
  } catch (error) {
    console.error('Failed to send Slack report', { error: String(error) });
  }
}

