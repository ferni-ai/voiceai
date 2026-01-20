/**
 * Brand Automation Jobs
 *
 * Scheduled jobs for automated brand execution:
 * - Award deadline alerts
 * - Story collection & publishing
 * - Ritual prompts
 * - Metrics collection
 * - Weekly reports
 */

import chalk from 'chalk';
import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import {
  getAwards,
  getWorkstreams,
} from './brand-storage.js';
import {
  getDashboard as getCommunityDashboard,
  getAmbassadors,
  getStories as getUserStories,
  type UserStory,
} from '../community/community-storage.js';
import {
  getRitualsDashboard,
  getMilestones,
} from '../rituals/rituals-storage.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AutomationJob {
  id: string;
  name: string;
  description: string;
  schedule: string; // cron expression
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  action: () => Promise<JobResult>;
}

export interface JobResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  alerts?: string[];
}

export interface BrandMetrics {
  timestamp: string;
  awards: {
    tracked: number;
    submitted: number;
    shortlisted: number;
    won: number;
    upcomingDeadlines: number;
    totalFees: number;
  };
  community: {
    discordMembers: number;
    storiesCollected: number;
    storiesApproved: number;
    ambassadorsActive: number;
  };
  rituals: {
    morningCompletionRate: number;
    weeklyReflectionRate: number;
    averageStreak: number;
  };
  workstreams: {
    total: number;
    notStarted: number;
    inProgress: number;
    completed: number;
    completionRate: number;
  };
}

export interface AutomationState {
  jobs: {
    id: string;
    enabled: boolean;
    lastRun?: string;
    lastResult?: JobResult;
  }[];
  metrics: BrandMetrics[];
  settings: {
    slackWebhook?: string;
    discordWebhook?: string;
    emailRecipients?: string[];
    notifyOnAlert: boolean;
  };
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const AUTOMATION_STATE_FILE = join(homedir(), '.ferni', 'brand-automation-state.json');

async function loadAutomationState(): Promise<AutomationState> {
  try {
    const data = await fs.readFile(AUTOMATION_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      jobs: [],
      metrics: [],
      settings: {
        notifyOnAlert: true,
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveAutomationState(state: AutomationState): Promise<void> {
  const dir = join(homedir(), '.ferni');
  await fs.mkdir(dir, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(AUTOMATION_STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function daysUntil(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

async function sendSlackAlert(message: string): Promise<void> {
  // Try env variable first, then stored state
  const webhookUrl = process.env.SLACK_WEBHOOK_URL || (await loadAutomationState()).settings.slackWebhook;

  if (!webhookUrl) {
    console.log(chalk.yellow(`[Slack] ${message}`));
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        username: 'Ferni Brand Bot',
        icon_emoji: ':seedling:',
      }),
    });
    console.log(chalk.green(`[Slack] ✓ Sent`));
  } catch (error) {
    console.error('Failed to send Slack alert:', error);
  }
}

async function sendDiscordAlert(message: string): Promise<void> {
  const state = await loadAutomationState();
  if (!state.settings.discordWebhook) {
    console.log(chalk.blue(`[Discord] ${message}`));
    return;
  }

  try {
    await fetch(state.settings.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (error) {
    console.error('Failed to send Discord alert:', error);
  }
}

// ============================================================================
// JOB DEFINITIONS
// ============================================================================

export async function runAwardDeadlineCheck(): Promise<JobResult> {
  const awards = await getAwards();
  const alerts: string[] = [];

  // Check for upcoming deadlines
  const upcoming = awards.filter((a) => {
    const days = daysUntil(a.deadline);
    return days > 0 && days <= 30 && a.status !== 'submitted' && a.status !== 'won';
  });

  // Categorize by urgency
  const urgent = upcoming.filter((a) => daysUntil(a.deadline) <= 7);
  const warning = upcoming.filter((a) => {
    const days = daysUntil(a.deadline);
    return days > 7 && days <= 14;
  });

  for (const award of urgent) {
    const days = daysUntil(award.deadline);
    const msg = `🚨 URGENT: ${award.name} deadline in ${days} day${days === 1 ? '' : 's'}!`;
    alerts.push(msg);
    await sendSlackAlert(msg);
  }

  for (const award of warning) {
    const days = daysUntil(award.deadline);
    const msg = `⏰ ${award.name} deadline in ${days} days`;
    alerts.push(msg);
  }

  return {
    success: true,
    message: `Checked ${awards.length} awards, ${upcoming.length} upcoming`,
    data: {
      total: awards.length,
      upcoming: upcoming.length,
      urgent: urgent.length,
    },
    alerts,
  };
}

export async function runStoryReviewReminder(): Promise<JobResult> {
  const stories = await getUserStories({ approved: false });
  const alerts: string[] = [];

  if (stories.length > 0) {
    const msg = `📖 ${stories.length} user stories pending review`;
    alerts.push(msg);
    await sendSlackAlert(msg);
  }

  return {
    success: true,
    message: `${stories.length} stories pending`,
    data: { pending: stories.length },
    alerts,
  };
}

export async function runWorkstreamProgressCheck(): Promise<JobResult> {
  const workstreams = await getWorkstreams();
  const alerts: string[] = [];

  const stale = workstreams.filter((w) => {
    if (w.status !== 'in_progress') return false;
    const lastUpdate = w.tasks.reduce((latest, t) => {
      if (t.completedAt && t.completedAt > latest) return t.completedAt;
      return latest;
    }, w.startedAt || '');
    return lastUpdate && daysSince(lastUpdate) > 14;
  });

  if (stale.length > 0) {
    const msg = `⚠️ ${stale.length} workstream${stale.length > 1 ? 's' : ''} stale (no update in 14+ days)`;
    alerts.push(msg);
    await sendSlackAlert(msg);
  }

  const completed = workstreams.filter((w) => w.status === 'completed').length;
  const inProgress = workstreams.filter((w) => w.status === 'in_progress').length;

  return {
    success: true,
    message: `${completed}/${workstreams.length} workstreams completed`,
    data: {
      total: workstreams.length,
      completed,
      inProgress,
      stale: stale.length,
    },
    alerts,
  };
}

export async function runMilestoneCheck(): Promise<JobResult> {
  const milestones = await getMilestones({ celebrated: false });
  const alerts: string[] = [];

  const today = new Date().toISOString().split('T')[0];
  const todayMilestones = milestones.filter((m) => m.date.startsWith(today));
  const upcoming = milestones.filter((m) => {
    const days = daysUntil(m.date);
    return days > 0 && days <= 7;
  });

  for (const milestone of todayMilestones) {
    const msg = `🎉 TODAY: ${milestone.name}! Time to celebrate!`;
    alerts.push(msg);
    await sendSlackAlert(msg);
    await sendDiscordAlert(msg);
  }

  for (const milestone of upcoming) {
    const days = daysUntil(milestone.date);
    alerts.push(`📅 ${milestone.name} in ${days} days`);
  }

  return {
    success: true,
    message: `${todayMilestones.length} milestones today, ${upcoming.length} upcoming`,
    data: {
      today: todayMilestones.length,
      upcoming: upcoming.length,
    },
    alerts,
  };
}

export async function runAmbassadorEngagementCheck(): Promise<JobResult> {
  const ambassadors = await getAmbassadors({ status: 'active' });
  const alerts: string[] = [];

  const inactive = ambassadors.filter((a) => {
    const lastContribution = a.contributions[a.contributions.length - 1];
    if (!lastContribution) return true;
    return daysSince(lastContribution.date) > 30;
  });

  if (inactive.length > 0) {
    const msg = `👥 ${inactive.length} ambassador${inactive.length > 1 ? 's' : ''} inactive (30+ days)`;
    alerts.push(msg);
    await sendSlackAlert(msg);
  }

  return {
    success: true,
    message: `${ambassadors.length - inactive.length}/${ambassadors.length} ambassadors active`,
    data: {
      total: ambassadors.length,
      active: ambassadors.length - inactive.length,
      inactive: inactive.length,
    },
    alerts,
  };
}

// ============================================================================
// METRICS COLLECTION
// ============================================================================

export async function collectMetrics(): Promise<BrandMetrics> {
  const awards = await getAwards();
  const stories = await getUserStories();
  const workstreams = await getWorkstreams();
  const communityDashboard = await getCommunityDashboard();
  const ritualsDashboard = await getRitualsDashboard();
  const ambassadors = await getAmbassadors();

  const metrics: BrandMetrics = {
    timestamp: new Date().toISOString(),
    awards: {
      tracked: awards.length,
      submitted: awards.filter((a) => a.status === 'submitted').length,
      shortlisted: awards.filter((a) => a.status === 'shortlisted').length,
      won: awards.filter((a) => a.status === 'won').length,
      upcomingDeadlines: awards.filter((a) => daysUntil(a.deadline) <= 30 && daysUntil(a.deadline) > 0).length,
      totalFees: awards.reduce((sum, a) => sum + (a.fee || 0), 0),
    },
    community: {
      discordMembers: communityDashboard.discord.channelsCreated > 0 ? 0 : 0, // Would need Discord API
      storiesCollected: stories.length,
      storiesApproved: stories.filter((s: UserStory) => s.approved).length,
      ambassadorsActive: ambassadors.filter((a) => a.status === 'active').length,
    },
    rituals: {
      morningCompletionRate: ritualsDashboard.today.completed / Math.max(ritualsDashboard.today.rituals.length, 1),
      weeklyReflectionRate: ritualsDashboard.weeklyReflectionStatus === 'completed' ? 1 : 0,
      averageStreak: ritualsDashboard.streaks.length > 0
        ? ritualsDashboard.streaks.reduce((sum, s) => sum + s.streak, 0) / ritualsDashboard.streaks.length
        : 0,
    },
    workstreams: {
      total: workstreams.length,
      notStarted: workstreams.filter((w) => w.status === 'not_started').length,
      inProgress: workstreams.filter((w) => w.status === 'in_progress').length,
      completed: workstreams.filter((w) => w.status === 'completed').length,
      completionRate: workstreams.filter((w) => w.status === 'completed').length / Math.max(workstreams.length, 1),
    },
  };

  // Save to history
  const state = await loadAutomationState();
  state.metrics.push(metrics);
  // Keep last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  state.metrics = state.metrics.filter((m) => new Date(m.timestamp) > cutoff);
  await saveAutomationState(state);

  return metrics;
}

// ============================================================================
// WEEKLY REPORT
// ============================================================================

export async function generateWeeklyReport(): Promise<string> {
  const metrics = await collectMetrics();
  const awards = await getAwards();
  const stories = await getUserStories();

  const upcomingAwards = awards
    .filter((a) => daysUntil(a.deadline) <= 30 && daysUntil(a.deadline) > 0)
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));

  const recentStories = stories
    .filter((s: UserStory) => s.approved)
    .sort((a: UserStory, b: UserStory) => (b.approvedAt || '').localeCompare(a.approvedAt || ''))
    .slice(0, 3);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const report = `# 🌿 Brand Evolution Weekly Report
Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

## 🏆 Awards
- **Tracked:** ${metrics.awards.tracked} | **Submitted:** ${metrics.awards.submitted} | **Won:** ${metrics.awards.won}
${upcomingAwards.length > 0 ? `- ⏰ Next: ${upcomingAwards[0].name} (${daysUntil(upcomingAwards[0].deadline)} days)` : '- No upcoming deadlines'}

## 🏘️ Community
- **Stories:** ${metrics.community.storiesCollected} collected, ${metrics.community.storiesApproved} approved
- **Ambassadors:** ${metrics.community.ambassadorsActive} active

## 🌿 Rituals
- **Daily completion:** ${Math.round(metrics.rituals.morningCompletionRate * 100)}%
- **Weekly reflection:** ${metrics.rituals.weeklyReflectionRate > 0 ? '✅ Completed' : '⚠️ Pending'}
- **Avg streak:** ${metrics.rituals.averageStreak.toFixed(1)} days

## 📋 Workstreams
- **Progress:** ${metrics.workstreams.completed}/${metrics.workstreams.total} completed (${Math.round(metrics.workstreams.completionRate * 100)}%)
- **In progress:** ${metrics.workstreams.inProgress}
- **Not started:** ${metrics.workstreams.notStarted}

${recentStories.length > 0 ? `## 📖 Recent Stories
${recentStories.map((s: UserStory) => `- "${s.story.slice(0, 50)}..." by ${s.userName}`).join('\n')}` : ''}

---
*Generated by ferni brand automation*
`;

  return report;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function showAutomationStatus(): Promise<void> {
  const state = await loadAutomationState();

  console.log(chalk.bold('\n⚙️  Brand Automation Status\n'));

  // Jobs status
  console.log(chalk.cyan.bold('Scheduled Jobs'));
  const jobs = [
    { id: 'award-deadline-check', name: 'Award Deadline Check', schedule: 'Daily 9 AM' },
    { id: 'story-review-reminder', name: 'Story Review Reminder', schedule: 'Mon/Thu 10 AM' },
    { id: 'workstream-progress', name: 'Workstream Progress', schedule: 'Monday 9 AM' },
    { id: 'milestone-check', name: 'Milestone Check', schedule: 'Daily 10 AM' },
    { id: 'ambassador-engagement', name: 'Ambassador Engagement', schedule: '1st of month' },
    { id: 'metrics-collection', name: 'Metrics Collection', schedule: 'Daily midnight' },
    { id: 'weekly-report', name: 'Weekly Report', schedule: 'Friday 5 PM' },
  ];

  for (const job of jobs) {
    const jobState = state.jobs.find((j) => j.id === job.id);
    const enabled = jobState?.enabled ?? false;
    const icon = enabled ? chalk.green('●') : chalk.gray('○');
    const lastRun = jobState?.lastRun
      ? chalk.dim(`Last: ${new Date(jobState.lastRun).toLocaleDateString()}`)
      : chalk.dim('Never run');

    console.log(`  ${icon} ${job.name}`);
    console.log(`     ${chalk.dim(job.schedule)} | ${lastRun}`);
  }
  console.log('');

  // Settings
  console.log(chalk.cyan.bold('Notification Settings'));
  console.log(`  Slack: ${state.settings.slackWebhook ? chalk.green('Configured') : chalk.yellow('Not set')}`);
  console.log(`  Discord: ${state.settings.discordWebhook ? chalk.green('Configured') : chalk.yellow('Not set')}`);
  console.log('');

  // Recent metrics
  if (state.metrics.length > 0) {
    const latest = state.metrics[state.metrics.length - 1];
    console.log(chalk.cyan.bold('Latest Metrics'));
    console.log(`  Collected: ${new Date(latest.timestamp).toLocaleString()}`);
    console.log(`  Awards: ${latest.awards.tracked} tracked, ${latest.awards.won} won`);
    console.log(`  Workstreams: ${Math.round(latest.workstreams.completionRate * 100)}% complete`);
  }

  console.log('');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('Commands:'));
  console.log(chalk.dim('  ferni brand automation run <job>  - Run a job manually'));
  console.log(chalk.dim('  ferni brand automation enable <job> - Enable a job'));
  console.log(chalk.dim('  ferni brand metrics              - View current metrics'));
  console.log(chalk.dim('  ferni brand report               - Generate weekly report'));
}

export async function runJob(jobId: string): Promise<void> {
  console.log(chalk.cyan(`\nRunning job: ${jobId}...\n`));

  let result: JobResult;

  switch (jobId) {
    case 'award-deadline-check':
      result = await runAwardDeadlineCheck();
      break;
    case 'story-review-reminder':
      result = await runStoryReviewReminder();
      break;
    case 'workstream-progress':
      result = await runWorkstreamProgressCheck();
      break;
    case 'milestone-check':
      result = await runMilestoneCheck();
      break;
    case 'ambassador-engagement':
      result = await runAmbassadorEngagementCheck();
      break;
    case 'metrics-collection':
      await collectMetrics();
      result = { success: true, message: 'Metrics collected' };
      break;
    case 'weekly-report':
      const report = await generateWeeklyReport();
      console.log(report);
      result = { success: true, message: 'Report generated' };
      break;
    default:
      console.log(chalk.red(`Unknown job: ${jobId}`));
      return;
  }

  console.log(result.success ? chalk.green('✅ ' + result.message) : chalk.red('❌ ' + result.message));

  if (result.alerts && result.alerts.length > 0) {
    console.log(chalk.yellow('\nAlerts:'));
    result.alerts.forEach((alert) => console.log(`  ${alert}`));
  }

  // Update job state
  const state = await loadAutomationState();
  const jobIndex = state.jobs.findIndex((j) => j.id === jobId);
  if (jobIndex >= 0) {
    state.jobs[jobIndex].lastRun = new Date().toISOString();
    state.jobs[jobIndex].lastResult = result;
  } else {
    state.jobs.push({
      id: jobId,
      enabled: true,
      lastRun: new Date().toISOString(),
      lastResult: result,
    });
  }
  await saveAutomationState(state);
}

export async function showMetrics(): Promise<void> {
  const metrics = await collectMetrics();

  console.log(chalk.bold('\n📊 Brand Metrics\n'));

  console.log(chalk.cyan.bold('🏆 Awards'));
  console.log(`  Tracked: ${metrics.awards.tracked}`);
  console.log(`  Submitted: ${metrics.awards.submitted}`);
  console.log(`  Won: ${chalk.green(metrics.awards.won)}`);
  console.log(`  Upcoming (30d): ${chalk.yellow(metrics.awards.upcomingDeadlines)}`);
  console.log(`  Total fees: $${metrics.awards.totalFees}`);
  console.log('');

  console.log(chalk.cyan.bold('🏘️ Community'));
  console.log(`  Stories collected: ${metrics.community.storiesCollected}`);
  console.log(`  Stories approved: ${chalk.green(metrics.community.storiesApproved)}`);
  console.log(`  Active ambassadors: ${metrics.community.ambassadorsActive}`);
  console.log('');

  console.log(chalk.cyan.bold('🌿 Rituals'));
  console.log(`  Daily completion: ${Math.round(metrics.rituals.morningCompletionRate * 100)}%`);
  console.log(`  Average streak: ${metrics.rituals.averageStreak.toFixed(1)} days`);
  console.log('');

  console.log(chalk.cyan.bold('📋 Workstreams'));
  console.log(`  Completed: ${metrics.workstreams.completed}/${metrics.workstreams.total}`);
  console.log(`  In progress: ${metrics.workstreams.inProgress}`);
  console.log(`  Completion rate: ${Math.round(metrics.workstreams.completionRate * 100)}%`);
}

export async function configureWebhook(type: 'slack' | 'discord', url: string): Promise<void> {
  const state = await loadAutomationState();

  if (type === 'slack') {
    state.settings.slackWebhook = url;
  } else {
    state.settings.discordWebhook = url;
  }

  await saveAutomationState(state);
  console.log(chalk.green(`✅ ${type} webhook configured`));
}
