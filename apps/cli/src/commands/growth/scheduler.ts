/**
 * Autonomous Growth Scheduler
 *
 * Runs growth automation tasks on a schedule:
 * - Content generation (TikTok scripts, blog posts, Reddit posts)
 * - Content posting (when scheduled time arrives)
 * - Engagement tasks (Reddit karma building)
 * - Metrics collection
 * - Influencer outreach follow-ups
 *
 * Can run as a long-running process or be invoked periodically.
 */

import chalk from 'chalk';
import {
  getSettings,
  getPendingTasks,
  updateTaskStatus,
  scheduleTask,
  getContentQueue,
  updateContentStatus,
  getTikTokAccounts,
  getInfluencerLeads,
  recordMetrics,
  type ScheduledTask,
} from './growth-storage.js';
import {
  generateTikTokScript,
  generateRedditPost,
  generateInfluencerEmail,
  batchGenerateTikTokScripts,
  TIKTOK_TOPIC_BANK,
  REDDIT_TOPICS,
} from './content-engine.js';
import {
  getGrowthMetrics,
  trackOperation,
} from './growth-metrics.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SchedulerConfig {
  checkIntervalMs: number;
  contentGenerationHour: number; // 0-23, when to generate new content
  postingHours: number[]; // Hours when posting is allowed
  redditEngagementHour: number;
  metricsCollectionHour: number;
  dryRun: boolean;
}

export interface SchedulerStats {
  tasksExecuted: number;
  tasksFailed: number;
  contentGenerated: number;
  contentPosted: number;
  lastRun: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: SchedulerConfig = {
  checkIntervalMs: 5 * 60 * 1000, // Check every 5 minutes
  contentGenerationHour: 9, // Generate at 9 AM
  postingHours: [9, 12, 15, 18, 21], // Post at these hours
  redditEngagementHour: 10, // Reddit engagement at 10 AM
  metricsCollectionHour: 23, // Collect metrics at 11 PM
  dryRun: false,
};

const colors = {
  primary: chalk.hex('#4a6741'),
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  bold: chalk.bold,
};

// ============================================================================
// TASK EXECUTORS
// ============================================================================

/**
 * Execute a content generation task
 */
async function executeGenerateContent(
  task: ScheduledTask,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const { platform, count = 1, topic, angle } = task.data as {
    platform: string;
    count?: number;
    topic?: string;
    angle?: string;
  };

  if (dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would generate ${count} ${platform} content pieces`,
    };
  }

  if (platform === 'tiktok') {
    const accounts = await getTikTokAccounts();
    const targetAccount = angle
      ? accounts.find((a) => a.angle === angle)
      : accounts[0];

    if (!targetAccount) {
      return { success: false, message: 'No TikTok account found' };
    }

    // Get topics from bank or use provided topic
    const topics = topic
      ? [topic]
      : (TIKTOK_TOPIC_BANK[targetAccount.angle as keyof typeof TIKTOK_TOPIC_BANK] || []).slice(
          0,
          count
        );

    const result = await batchGenerateTikTokScripts(topics, targetAccount);

    return {
      success: result.failed.length === 0,
      message: `Generated ${result.generated.length} TikTok scripts, ${result.failed.length} failed`,
    };
  }

  if (platform === 'reddit') {
    const subreddit = (task.data as { subreddit?: string }).subreddit || 'selfimprovement';
    const topics =
      REDDIT_TOPICS[subreddit as keyof typeof REDDIT_TOPICS] ||
      REDDIT_TOPICS.selfimprovement;
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];

    await generateRedditPost(randomTopic, subreddit, 'value_post');

    return {
      success: true,
      message: `Generated Reddit post for r/${subreddit}`,
    };
  }

  return { success: false, message: `Unknown platform: ${platform}` };
}

/**
 * Execute a content posting task
 */
async function executePostContent(
  task: ScheduledTask,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const { contentId } = task.data as { contentId: string };

  if (dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would post content ${contentId}`,
    };
  }

  // In a real implementation, this would:
  // 1. Retrieve the content from storage
  // 2. Post to the appropriate platform via API
  // 3. Update the content status

  // For now, mark as posted (API integration TODO)
  await updateContentStatus(contentId, 'posted');

  return {
    success: true,
    message: `Marked content ${contentId} as posted (API integration pending)`,
  };
}

/**
 * Execute an influencer outreach task
 */
async function executeSendOutreach(
  task: ScheduledTask,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const { leadId, emailType = 'follow_up' } = task.data as {
    leadId: string;
    emailType?: 'cold_outreach' | 'follow_up' | 'partnership_proposal';
  };

  if (dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would send ${emailType} to lead ${leadId}`,
    };
  }

  const leads = await getInfluencerLeads();
  const lead = leads.find((l) => l.id === leadId);

  if (!lead) {
    return { success: false, message: `Lead ${leadId} not found` };
  }

  await generateInfluencerEmail(lead, emailType);

  return {
    success: true,
    message: `Generated ${emailType} email for ${lead.name}`,
  };
}

/**
 * Execute Reddit engagement task
 */
async function executeRedditEngagement(
  task: ScheduledTask,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const { subreddits = ['selfimprovement'], commentCount = 5 } = task.data as {
    subreddits?: string[];
    commentCount?: number;
  };

  if (dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would engage with ${commentCount} posts in ${subreddits.join(', ')}`,
    };
  }

  // In a real implementation, this would:
  // 1. Fetch top posts from target subreddits
  // 2. Generate thoughtful value comments
  // 3. Post comments via Reddit API

  return {
    success: true,
    message: `Reddit engagement task scheduled (API integration pending)`,
  };
}

/**
 * Execute metrics collection task
 */
async function executeCheckMetrics(
  task: ScheduledTask,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  if (dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would collect metrics from all platforms`,
    };
  }

  // In a real implementation, this would:
  // 1. Fetch metrics from TikTok API
  // 2. Fetch metrics from Google Analytics
  // 3. Fetch Reddit karma
  // 4. Aggregate and store

  // For now, record placeholder metrics
  await recordMetrics({
    total: {
      signups: 0,
      spend: 0,
      cac: 0,
    },
  });

  return {
    success: true,
    message: `Metrics collection completed (API integration pending)`,
  };
}

// ============================================================================
// TASK ROUTER
// ============================================================================

async function executeTask(
  task: ScheduledTask,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const metrics = getGrowthMetrics();

  // Track task execution with metrics
  return trackOperation(task.type, async () => {
    let result: { success: boolean; message: string };

    switch (task.type) {
      case 'generate_content':
        result = await executeGenerateContent(task, dryRun);
        if (result.success && !dryRun) {
          metrics.recordContentGenerated((task.data as { platform?: string }).platform || 'unknown');
        }
        break;
      case 'post_content':
        result = await executePostContent(task, dryRun);
        if (result.success && !dryRun) {
          metrics.recordContentPosted('unknown');
        }
        break;
      case 'send_outreach':
        result = await executeSendOutreach(task, dryRun);
        if (result.success && !dryRun) {
          metrics.recordInfluencerContacted();
        }
        break;
      case 'engage_reddit':
        result = await executeRedditEngagement(task, dryRun);
        break;
      case 'check_metrics':
        result = await executeCheckMetrics(task, dryRun);
        break;
      default:
        result = { success: false, message: `Unknown task type: ${task.type}` };
    }

    // Track task lifecycle
    if (result.success) {
      metrics.recordTaskCompleted();
    } else {
      metrics.recordTaskFailed();
      metrics.recordContentFailed();
    }

    return result;
  }, { taskId: task.id, taskType: task.type });
}

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Run all pending tasks
 */
export async function runPendingTasks(dryRun = false): Promise<SchedulerStats> {
  const stats: SchedulerStats = {
    tasksExecuted: 0,
    tasksFailed: 0,
    contentGenerated: 0,
    contentPosted: 0,
    lastRun: new Date().toISOString(),
  };

  const tasks = await getPendingTasks();

  if (tasks.length === 0) {
    console.log(colors.muted('No pending tasks to run.'));
    return stats;
  }

  console.log(colors.bold(`\n⚡ Running ${tasks.length} pending tasks...`));

  for (const task of tasks) {
    console.log(`\n${colors.primary('→')} ${task.type}...`);

    try {
      await updateTaskStatus(task.id, 'running');

      const result = await executeTask(task, dryRun);

      if (result.success) {
        await updateTaskStatus(task.id, 'completed', result.message);
        console.log(colors.success(`  ✓ ${result.message}`));
        stats.tasksExecuted++;

        // Update specific counters
        if (task.type === 'generate_content') stats.contentGenerated++;
        if (task.type === 'post_content') stats.contentPosted++;
      } else {
        await updateTaskStatus(task.id, 'failed', undefined, result.message);
        console.log(colors.error(`  ✗ ${result.message}`));
        stats.tasksFailed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateTaskStatus(task.id, 'failed', undefined, message);
      console.log(colors.error(`  ✗ Error: ${message}`));
      stats.tasksFailed++;
    }
  }

  return stats;
}

/**
 * Schedule daily tasks based on settings
 */
export async function scheduleDailyTasks(): Promise<void> {
  const settings = await getSettings();
  const metrics = getGrowthMetrics();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  console.log(colors.bold('\n📅 Scheduling daily tasks...'));

  // Schedule content generation if auto-generate is enabled
  if (settings.autoGenerate) {
    const accounts = await getTikTokAccounts();

    for (const account of accounts) {
      const generateTime = new Date(tomorrow);
      generateTime.setHours(9, 0, 0, 0);

      await scheduleTask(
        'generate_content',
        {
          platform: 'tiktok',
          angle: account.angle,
          count: Math.ceil(settings.contentPerDay / accounts.length),
        },
        generateTime.toISOString()
      );
      metrics.recordTaskScheduled();

      console.log(
        colors.success(
          `  ✓ Scheduled TikTok generation for ${account.handle} at ${generateTime.toLocaleString()}`
        )
      );
    }

    // Schedule Reddit content
    const redditTime = new Date(tomorrow);
    redditTime.setHours(10, 0, 0, 0);

    await scheduleTask(
      'generate_content',
      { platform: 'reddit', subreddit: 'selfimprovement' },
      redditTime.toISOString()
    );
    metrics.recordTaskScheduled();

    console.log(colors.success(`  ✓ Scheduled Reddit post generation at ${redditTime.toLocaleString()}`));
  }

  // Schedule posting if auto-post is enabled
  if (settings.autoPost) {
    const scheduled = await getContentQueue({ status: 'scheduled' });

    for (const content of scheduled) {
      if (content.scheduledFor && new Date(content.scheduledFor) <= tomorrow) {
        await scheduleTask(
          'post_content',
          { contentId: content.id },
          content.scheduledFor
        );
        metrics.recordTaskScheduled();

        console.log(
          colors.success(
            `  ✓ Scheduled posting for ${content.title || content.id} at ${new Date(
              content.scheduledFor
            ).toLocaleString()}`
          )
        );
      }
    }
  }

  // Schedule Reddit engagement if auto-engage is enabled
  if (settings.autoEngage) {
    const engageTime = new Date(tomorrow);
    engageTime.setHours(11, 0, 0, 0);

    await scheduleTask(
      'engage_reddit',
      {
        subreddits: ['selfimprovement', 'productivity', 'getdisciplined'],
        commentCount: settings.engagementPerDay,
      },
      engageTime.toISOString()
    );
    metrics.recordTaskScheduled();

    console.log(colors.success(`  ✓ Scheduled Reddit engagement at ${engageTime.toLocaleString()}`));
  }

  // Always schedule metrics collection
  const metricsTime = new Date(tomorrow);
  metricsTime.setHours(23, 0, 0, 0);

  await scheduleTask('check_metrics', {}, metricsTime.toISOString());
  metrics.recordTaskScheduled();

  console.log(colors.success(`  ✓ Scheduled metrics collection at ${metricsTime.toLocaleString()}`));
}

/**
 * Run the scheduler in continuous mode
 */
export async function runContinuousScheduler(config: Partial<SchedulerConfig> = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(colors.bold('\n🤖 Starting Autonomous Growth Scheduler'));
  console.log(colors.muted(`Check interval: ${fullConfig.checkIntervalMs / 1000}s`));
  console.log(colors.muted(`Dry run: ${fullConfig.dryRun}`));
  console.log(colors.muted('Press Ctrl+C to stop\n'));

  // Initial task run
  await runPendingTasks(fullConfig.dryRun);

  // Schedule tomorrow's tasks
  await scheduleDailyTasks();

  // Set up interval
  const interval = setInterval(async () => {
    const now = new Date();
    console.log(colors.muted(`\n[${now.toLocaleString()}] Checking for tasks...`));

    try {
      await runPendingTasks(fullConfig.dryRun);
    } catch (error) {
      console.log(colors.error(`Scheduler error: ${error}`));
    }
  }, fullConfig.checkIntervalMs);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log(colors.warning('\n\nShutting down scheduler...'));
    clearInterval(interval);
    process.exit(0);
  });

  // Keep process alive
  await new Promise<void>(() => {});
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

/**
 * Generate content immediately for a platform
 */
export async function quickGenerate(
  platform: 'tiktok' | 'reddit' | 'seo',
  count = 1
): Promise<void> {
  console.log(colors.bold(`\n✨ Quick Generate: ${count} ${platform} content pieces`));

  if (platform === 'tiktok') {
    const accounts = await getTikTokAccounts();
    if (accounts.length === 0) {
      console.log(colors.error('No TikTok accounts configured. Run: ferni growth tiktok add <handle> --angle <angle>'));
      return;
    }

    for (const account of accounts) {
      const topics = TIKTOK_TOPIC_BANK[account.angle as keyof typeof TIKTOK_TOPIC_BANK] || [];
      const selectedTopics = topics.slice(0, count);

      console.log(colors.muted(`\nGenerating ${selectedTopics.length} scripts for @${account.handle}...`));

      for (const topic of selectedTopics) {
        try {
          const content = await generateTikTokScript(topic, account);
          console.log(colors.success(`  ✓ Generated: ${content.title}`));
        } catch (error) {
          console.log(colors.error(`  ✗ Failed: ${error}`));
        }
      }
    }
  } else if (platform === 'reddit') {
    const subreddits = Object.keys(REDDIT_TOPICS);
    const selectedSub = subreddits[Math.floor(Math.random() * subreddits.length)];
    const topics = REDDIT_TOPICS[selectedSub as keyof typeof REDDIT_TOPICS];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    console.log(colors.muted(`\nGenerating post for r/${selectedSub}...`));

    try {
      const content = await generateRedditPost(topic, selectedSub);
      console.log(colors.success(`  ✓ Generated: ${content.title}`));
    } catch (error) {
      console.log(colors.error(`  ✗ Failed: ${error}`));
    }
  }
}

/**
 * Schedule content for optimal posting times
 */
export async function autoScheduleContent(): Promise<void> {
  const content = await getContentQueue({ status: 'draft' });
  const accounts = await getTikTokAccounts();

  if (content.length === 0) {
    console.log(colors.muted('No draft content to schedule.'));
    return;
  }

  console.log(colors.bold(`\n📅 Auto-scheduling ${content.length} content pieces...`));

  // Optimal posting hours for TikTok
  const optimalHours = [7, 10, 14, 17, 21];

  let dayOffset = 0;
  let hourIndex = 0;

  for (const piece of content) {
    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + dayOffset);
    scheduleDate.setHours(optimalHours[hourIndex], 0, 0, 0);

    // Find appropriate account
    const account = accounts.find((a) => a.id === piece.accountId) || accounts[0];

    if (piece.platform === 'tiktok' && account) {
      await scheduleTask(
        'post_content',
        { contentId: piece.id },
        scheduleDate.toISOString()
      );

      console.log(
        colors.success(
          `  ✓ Scheduled "${piece.title || piece.id}" for ${scheduleDate.toLocaleString()}`
        )
      );
    }

    // Move to next slot
    hourIndex++;
    if (hourIndex >= optimalHours.length) {
      hourIndex = 0;
      dayOffset++;
    }
  }
}
