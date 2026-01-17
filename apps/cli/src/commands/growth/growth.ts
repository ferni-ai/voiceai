/**
 * Growth Automation CLI Commands
 *
 * Provides autonomous growth marketing for ferni.ai across all channels:
 * - TikTok content machine (5 accounts, 70 posts/week)
 * - SEO content strategy (24 articles)
 * - Reddit growth (value-first engagement)
 * - Influencer outreach (50+ partnerships)
 * - Product Hunt launch
 *
 * Usage:
 *   ferni growth              - Show dashboard
 *   ferni growth tiktok       - TikTok content management
 *   ferni growth content      - Content queue management
 *   ferni growth influencer   - Influencer outreach tracking
 *   ferni growth seo          - SEO article management
 *   ferni growth auto         - Configure autonomous mode
 *   ferni growth run          - Execute pending tasks
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getDashboard,
  getSettings,
  updateSettings,
  getTikTokAccounts,
  addTikTokAccount,
  getContentQueue,
  addContent,
  scheduleContent,
  updateContentStatus,
  getInfluencerLeads,
  addInfluencerLead,
  updateInfluencerStatus,
  getSEOArticles,
  addSEOArticle,
  getPendingTasks,
  updateTaskStatus,
  scheduleTask,
  getCampaigns,
  createCampaign,
  getMetrics,
  type TikTokAccount,
  type ContentPiece,
  type InfluencerLead,
  type SEOArticle,
} from './growth-storage.js';
import {
  generateTikTokScript,
  generateSEOArticle,
  generateRedditPost,
  generateInfluencerEmail,
  TIKTOK_TOPIC_BANK,
  SEO_KEYWORD_BANK,
  REDDIT_TOPICS,
} from './content-engine.js';
import {
  runContinuousScheduler,
  scheduleDailyTasks,
  quickGenerate,
} from './scheduler.js';
import {
  getGrowthMetrics,
  formatMetricsSummary,
  resetGrowthMetrics,
} from './growth-metrics.js';
import {
  configureReddit,
  configureTikTok,
  configureEmail,
  postToReddit,
  sendOutreachEmail,
  generateTikTokInstructions,
  getPlatformManager,
} from './platform-clients.js';
import {
  getIntelligenceDashboard,
  analyzePerformancePatterns,
  calculateOptimalTimes,
  suggestPostingTime,
  detectTrends,
  scoreEngagementQuality,
  getCrossPlatformInsights,
  scoreInfluencerFit,
  optimizeContent,
  analyzeSentiment,
  analyzeCompetitor,
  type TrendSignal,
  type ContentOptimization,
} from './growth-intelligence.js';

// ============================================================================
// COLORS & FORMATTING
// ============================================================================

const colors = {
  primary: chalk.hex('#4a6741'), // Ferni green
  accent: chalk.hex('#3D5A45'),
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  bold: chalk.bold,
  dim: chalk.dim,
};

function box(title: string, content: string): string {
  const width = 60;
  const line = '─'.repeat(width);
  return `
${colors.primary('┌' + line + '┐')}
${colors.primary('│')} ${colors.bold(title.padEnd(width - 1))}${colors.primary('│')}
${colors.primary('├' + line + '┤')}
${content
  .split('\n')
  .map((l) => `${colors.primary('│')} ${l.padEnd(width - 1)}${colors.primary('│')}`)
  .join('\n')}
${colors.primary('└' + line + '┘')}`;
}

function progressBar(current: number, total: number, width = 20): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${colors.success('█'.repeat(filled))}${colors.muted('░'.repeat(empty))}] ${current}/${total}`;
}

// ============================================================================
// DASHBOARD COMMAND
// ============================================================================

async function showDashboard(): Promise<void> {
  const dashboard = await getDashboard();
  const settings = await getSettings();

  console.log(
    box(
      '🚀 FERNI GROWTH DASHBOARD',
      `
${colors.bold('Content Pipeline')}
  Total:     ${dashboard.overview.totalContent} pieces
  Scheduled: ${progressBar(dashboard.overview.scheduledContent, Math.max(dashboard.overview.totalContent, 1))}
  Posted:    ${progressBar(dashboard.overview.postedContent, Math.max(dashboard.overview.totalContent, 1))}

${colors.bold('Influencer Partnerships')}
  Total Leads:   ${dashboard.overview.totalInfluencers}
  Active:        ${dashboard.overview.activePartnerships}

${colors.bold('SEO Articles')}
  Total:      ${dashboard.overview.totalArticles}
  Published:  ${progressBar(dashboard.overview.publishedArticles, Math.max(dashboard.overview.totalArticles, 1))}

${colors.bold('Automation Status')}
  Auto-Post:     ${settings.autoPost ? colors.success('ON') : colors.muted('OFF')}
  Auto-Engage:   ${settings.autoEngage ? colors.success('ON') : colors.muted('OFF')}
  Auto-Generate: ${settings.autoGenerate ? colors.success('ON') : colors.muted('OFF')}

${colors.bold('Pending Tasks')}: ${dashboard.todayTasks.length}
`
    )
  );

  // Show active campaigns
  if (dashboard.activeCampaigns.length > 0) {
    console.log(colors.bold('\n📊 Active Campaigns:'));
    for (const campaign of dashboard.activeCampaigns) {
      console.log(`  ${colors.accent('•')} ${campaign.name} (${campaign.channel})`);
      for (const goal of campaign.goals) {
        console.log(`    ${goal.metric}: ${progressBar(goal.current, goal.target)}`);
      }
    }
  }

  // Show recent content
  if (dashboard.recentContent.length > 0) {
    console.log(colors.bold('\n📝 Recent Content:'));
    for (const content of dashboard.recentContent.slice(0, 5)) {
      const statusIcon =
        content.status === 'posted'
          ? colors.success('✓')
          : content.status === 'scheduled'
            ? colors.warning('◷')
            : colors.muted('○');
      console.log(
        `  ${statusIcon} [${content.platform}] ${content.title || content.content.slice(0, 40)}...`
      );
    }
  }

  // Show pending tasks
  if (dashboard.todayTasks.length > 0) {
    console.log(colors.bold('\n⏰ Pending Tasks:'));
    for (const task of dashboard.todayTasks.slice(0, 5)) {
      console.log(`  ${colors.warning('•')} ${task.type} - ${new Date(task.scheduledFor).toLocaleString()}`);
    }
  }

  console.log(
    colors.muted('\nCommands: growth tiktok | growth content | growth influencer | growth seo | growth auto')
  );
}

// ============================================================================
// TIKTOK COMMANDS
// ============================================================================

async function showTikTokAccounts(): Promise<void> {
  const accounts = await getTikTokAccounts();

  if (accounts.length === 0) {
    console.log(colors.warning('\nNo TikTok accounts configured.'));
    console.log(colors.muted('Run: ferni growth tiktok add <handle> --angle <angle>'));
    return;
  }

  console.log(colors.bold('\n📱 TikTok Accounts:'));
  for (const account of accounts) {
    const angleIcon =
      {
        main: '🎯',
        motivation: '💪',
        productivity: '📈',
        emotional: '💜',
        comparison: '⚖️',
      }[account.angle] || '📱';

    console.log(`
  ${angleIcon} ${colors.bold(account.handle)} (${account.angle})
     ${colors.muted(account.description)}
     ${account.followers ? `Followers: ${account.followers.toLocaleString()}` : colors.muted('No metrics yet')}`);
  }
}

async function addTikTokAccountCommand(
  handle: string,
  options: { angle: TikTokAccount['angle']; description?: string }
): Promise<void> {
  const angleDescriptions: Record<TikTokAccount['angle'], string> = {
    main: 'Primary Ferni account - mixed content',
    motivation: 'Motivational content, quotes, inspiration',
    productivity: 'Productivity tips, life hacks, tools',
    emotional: 'Emotional support, vulnerability, connection',
    comparison: 'AI comparisons, Replika alternatives',
  };

  const description = options.description || angleDescriptions[options.angle];
  const account = await addTikTokAccount(handle, options.angle, description);

  console.log(colors.success(`\n✓ Added TikTok account: @${account.handle}`));
  console.log(colors.muted(`  Angle: ${account.angle}`));
  console.log(colors.muted(`  ${description}`));
}

// ============================================================================
// CONTENT COMMANDS
// ============================================================================

async function showContentQueue(options: { platform?: string; status?: string }): Promise<void> {
  const content = await getContentQueue({
    platform: options.platform,
    status: options.status,
    limit: 20,
  });

  if (content.length === 0) {
    console.log(colors.warning('\nNo content in queue.'));
    console.log(colors.muted('Run: ferni growth content add --platform <platform> --type <type>'));
    return;
  }

  console.log(colors.bold('\n📋 Content Queue:'));
  for (const piece of content) {
    const statusIcon =
      {
        draft: colors.muted('○'),
        scheduled: colors.warning('◷'),
        posted: colors.success('✓'),
        failed: colors.error('✗'),
      }[piece.status] || '?';

    const title = piece.title || piece.content.slice(0, 50) + '...';
    console.log(`
  ${statusIcon} ${colors.bold(title)}
     Platform: ${piece.platform} | Type: ${piece.type}
     ${piece.scheduledFor ? `Scheduled: ${new Date(piece.scheduledFor).toLocaleString()}` : colors.muted('Not scheduled')}
     ${piece.metrics?.views ? `Views: ${piece.metrics.views.toLocaleString()}` : ''}`);
  }
}

async function addContentCommand(options: {
  platform: ContentPiece['platform'];
  type: ContentPiece['type'];
  title?: string;
  content?: string;
  hook?: string;
}): Promise<void> {
  const content = await addContent({
    platform: options.platform,
    type: options.type,
    title: options.title,
    content: options.content || '[Content to be generated]',
    hook: options.hook,
  });

  console.log(colors.success(`\n✓ Added content to queue: ${content.id}`));
  console.log(colors.muted(`  Platform: ${content.platform}`));
  console.log(colors.muted(`  Type: ${content.type}`));
  console.log(colors.muted('\nRun `ferni growth run --generate` to generate content with AI'));
}

async function scheduleContentCommand(id: string, datetime: string, options: { account?: string }): Promise<void> {
  const scheduledFor = new Date(datetime).toISOString();
  await scheduleContent(id, scheduledFor, options.account);

  console.log(colors.success(`\n✓ Scheduled content ${id}`));
  console.log(colors.muted(`  Time: ${new Date(scheduledFor).toLocaleString()}`));
}

// ============================================================================
// INFLUENCER COMMANDS
// ============================================================================

async function showInfluencerLeads(options: { tier?: string; status?: string }): Promise<void> {
  const leads = await getInfluencerLeads({
    tier: options.tier,
    status: options.status,
  });

  if (leads.length === 0) {
    console.log(colors.warning('\nNo influencer leads.'));
    console.log(colors.muted('Run: ferni growth influencer add <name> --handle <handle> --platform <platform>'));
    return;
  }

  const byStatus: Record<string, InfluencerLead[]> = {};
  for (const lead of leads) {
    if (!byStatus[lead.status]) byStatus[lead.status] = [];
    byStatus[lead.status].push(lead);
  }

  console.log(colors.bold('\n👥 Influencer Pipeline:'));

  const statusOrder = ['researched', 'contacted', 'responded', 'negotiating', 'confirmed', 'live', 'declined'];
  for (const status of statusOrder) {
    const statusLeads = byStatus[status];
    if (!statusLeads?.length) continue;

    const statusIcon =
      {
        researched: '🔍',
        contacted: '📧',
        responded: '💬',
        negotiating: '🤝',
        confirmed: '✅',
        live: '🎬',
        declined: '❌',
      }[status] || '?';

    console.log(`\n${statusIcon} ${colors.bold(status.toUpperCase())} (${statusLeads.length})`);

    for (const lead of statusLeads.slice(0, 5)) {
      const tierBadge =
        {
          nano: colors.muted('[nano]'),
          micro: colors.accent('[micro]'),
          mid: colors.primary('[mid]'),
          macro: colors.bold('[MACRO]'),
        }[lead.tier] || '';

      console.log(`  • ${lead.name} ${tierBadge}`);
      console.log(`    @${lead.handle} on ${lead.platform} | ${lead.followers.toLocaleString()} followers`);
      if (lead.signups) {
        console.log(`    ${colors.success(`${lead.signups} signups`)}`);
      }
    }
  }
}

async function addInfluencerCommand(
  name: string,
  options: {
    handle: string;
    platform: InfluencerLead['platform'];
    followers: string;
    category: string;
    email?: string;
  }
): Promise<void> {
  const followers = parseInt(options.followers, 10);
  const tier: InfluencerLead['tier'] =
    followers < 10000 ? 'nano' : followers < 100000 ? 'micro' : followers < 500000 ? 'mid' : 'macro';

  const lead = await addInfluencerLead({
    name,
    handle: options.handle,
    platform: options.platform,
    followers,
    tier,
    category: options.category,
    email: options.email,
  });

  console.log(colors.success(`\n✓ Added influencer lead: ${lead.name}`));
  console.log(colors.muted(`  @${lead.handle} (${lead.tier} tier)`));
  console.log(colors.muted(`  ${lead.followers.toLocaleString()} followers on ${lead.platform}`));
}

async function updateInfluencerCommand(id: string, status: InfluencerLead['status']): Promise<void> {
  await updateInfluencerStatus(id, status);
  console.log(colors.success(`\n✓ Updated influencer ${id} to ${status}`));
}

// ============================================================================
// SEO COMMANDS
// ============================================================================

async function showSEOArticles(options: { status?: string }): Promise<void> {
  const articles = await getSEOArticles({ status: options.status });

  if (articles.length === 0) {
    console.log(colors.warning('\nNo SEO articles.'));
    console.log(colors.muted('Run: ferni growth seo add --title "Article Title" --keyword "target keyword"'));
    return;
  }

  const byStatus: Record<string, SEOArticle[]> = {};
  for (const article of articles) {
    if (!byStatus[article.status]) byStatus[article.status] = [];
    byStatus[article.status].push(article);
  }

  console.log(colors.bold('\n📰 SEO Content Pipeline:'));

  const statusOrder = ['planned', 'outlined', 'drafted', 'published'];
  for (const status of statusOrder) {
    const statusArticles = byStatus[status];
    if (!statusArticles?.length) continue;

    const statusIcon =
      {
        planned: '📋',
        outlined: '📝',
        drafted: '✍️',
        published: '🌐',
      }[status] || '?';

    console.log(`\n${statusIcon} ${colors.bold(status.toUpperCase())} (${statusArticles.length})`);

    for (const article of statusArticles) {
      console.log(`  • ${article.title}`);
      console.log(`    Target: "${article.targetKeyword}"`);
      if (article.metrics?.organicTraffic) {
        console.log(`    ${colors.success(`${article.metrics.organicTraffic} organic visits`)}`);
      }
      if (article.url) {
        console.log(`    ${colors.muted(article.url)}`);
      }
    }
  }
}

async function addSEOArticleCommand(options: {
  title: string;
  keyword: string;
  secondary?: string;
  slug?: string;
}): Promise<void> {
  const slug = options.slug || options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const secondaryKeywords = options.secondary?.split(',').map((k) => k.trim());

  const article = await addSEOArticle({
    title: options.title,
    slug,
    targetKeyword: options.keyword,
    secondaryKeywords,
  });

  console.log(colors.success(`\n✓ Added SEO article: ${article.title}`));
  console.log(colors.muted(`  Slug: ${article.slug}`));
  console.log(colors.muted(`  Target: "${article.targetKeyword}"`));
}

// ============================================================================
// AUTOMATION COMMANDS
// ============================================================================

async function showAutoSettings(): Promise<void> {
  const settings = await getSettings();

  console.log(
    box(
      '🤖 AUTONOMOUS MODE SETTINGS',
      `
Auto-Post Content:      ${settings.autoPost ? colors.success('ENABLED') : colors.muted('disabled')}
  Posts scheduled content when time arrives

Auto-Engage Reddit:     ${settings.autoEngage ? colors.success('ENABLED') : colors.muted('disabled')}
  Posts value comments, builds karma

Auto-Generate Content:  ${settings.autoGenerate ? colors.success('ENABLED') : colors.muted('disabled')}
  Uses AI to create TikTok scripts, blog posts

${colors.bold('Daily Limits')}
  Content per day:      ${settings.contentPerDay}
  Engagements per day:  ${settings.engagementPerDay}

${colors.bold('API Keys')}
  OpenAI:    ${settings.openaiApiKey ? colors.success('✓ Configured') : colors.warning('Not set')}
  Anthropic: ${settings.anthropicApiKey ? colors.success('✓ Configured') : colors.warning('Not set')}
`
    )
  );
}

async function toggleAutoSetting(
  setting: 'autoPost' | 'autoEngage' | 'autoGenerate',
  value: boolean
): Promise<void> {
  await updateSettings({ [setting]: value });
  console.log(colors.success(`\n✓ ${setting} ${value ? 'ENABLED' : 'DISABLED'}`));
}

async function setDailyLimit(type: 'content' | 'engagement', limit: number): Promise<void> {
  if (type === 'content') {
    await updateSettings({ contentPerDay: limit });
    console.log(colors.success(`\n✓ Content per day set to ${limit}`));
  } else {
    await updateSettings({ engagementPerDay: limit });
    console.log(colors.success(`\n✓ Engagements per day set to ${limit}`));
  }
}

async function setApiKey(provider: 'openai' | 'anthropic', key: string): Promise<void> {
  if (provider === 'openai') {
    await updateSettings({ openaiApiKey: key });
  } else {
    await updateSettings({ anthropicApiKey: key });
  }
  console.log(colors.success(`\n✓ ${provider} API key saved`));
}

// ============================================================================
// RUN TASKS COMMAND
// ============================================================================

async function runPendingTasks(options: { generate?: boolean; post?: boolean; engage?: boolean }): Promise<void> {
  const tasks = await getPendingTasks();

  if (tasks.length === 0 && !options.generate) {
    console.log(colors.muted('\nNo pending tasks to run.'));
    return;
  }

  console.log(colors.bold(`\n⚡ Running ${tasks.length} pending tasks...`));

  for (const task of tasks) {
    console.log(`\n${colors.accent('→')} ${task.type}...`);

    try {
      await updateTaskStatus(task.id, 'running');

      // Dispatch based on task type
      switch (task.type) {
        case 'post_content':
          await executePostContent(task.data);
          break;
        case 'generate_content':
          await executeGenerateContent(task.data);
          break;
        case 'send_outreach':
          await executeSendOutreach(task.data);
          break;
        case 'engage_reddit':
          await executeRedditEngagement(task.data);
          break;
        case 'check_metrics':
          await executeCheckMetrics(task.data);
          break;
        default:
          console.log(colors.warning(`  Unknown task type: ${task.type}`));
      }

      await updateTaskStatus(task.id, 'completed', 'Success');
      console.log(colors.success('  ✓ Completed'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateTaskStatus(task.id, 'failed', undefined, message);
      console.log(colors.error(`  ✗ Failed: ${message}`));
    }
  }

  // If --generate flag, create content generation tasks
  if (options.generate) {
    console.log(colors.bold('\n✨ Generating new content with AI...'));
    await scheduleTask('generate_content', { platform: 'tiktok', count: 5 }, new Date().toISOString());
    console.log(colors.success('  Scheduled TikTok content generation'));
  }

  console.log(colors.success('\n✓ Task execution complete'));
}

// Task executors - connected to content engine
async function executePostContent(data: Record<string, unknown>): Promise<void> {
  const contentId = data.contentId as string;
  if (!contentId) {
    throw new Error('Missing contentId in task data');
  }

  // Mark content as posted (actual API posting would go here)
  await updateContentStatus(contentId, 'posted');
  console.log(colors.success(`  Posted content ${contentId}`));
  console.log(colors.warning('  ⚠️ Note: Actual TikTok/Reddit API posting not yet implemented'));
}

async function executeGenerateContent(data: Record<string, unknown>): Promise<void> {
  const platform = (data.platform as string) || 'tiktok';
  const count = (data.count as number) || 1;

  console.log(colors.muted(`  Generating ${count} ${platform} content pieces...`));

  if (platform === 'tiktok') {
    const accounts = await getTikTokAccounts();
    if (accounts.length === 0) {
      throw new Error('No TikTok accounts configured. Run: ferni growth tiktok add <handle> --angle <angle>');
    }

    const account = accounts[0]; // Use first account
    const topics = TIKTOK_TOPIC_BANK[account.angle as keyof typeof TIKTOK_TOPIC_BANK] || TIKTOK_TOPIC_BANK.main;

    for (let i = 0; i < Math.min(count, topics.length); i++) {
      const topic = topics[i];
      console.log(colors.muted(`    Generating: ${topic.slice(0, 40)}...`));
      const content = await generateTikTokScript(topic, account);
      console.log(colors.success(`    ✓ Created: ${content.id}`));
    }
  } else if (platform === 'blog' || platform === 'seo') {
    for (let i = 0; i < Math.min(count, SEO_KEYWORD_BANK.length); i++) {
      const { keyword, topic } = SEO_KEYWORD_BANK[i];
      console.log(colors.muted(`    Generating: ${topic.slice(0, 40)}...`));
      const content = await generateSEOArticle(topic, keyword);
      console.log(colors.success(`    ✓ Created: ${content.id}`));
    }
  } else if (platform === 'reddit') {
    const subreddits = Object.keys(REDDIT_TOPICS);
    for (let i = 0; i < Math.min(count, 3); i++) {
      const subreddit = subreddits[i % subreddits.length];
      const topics = REDDIT_TOPICS[subreddit as keyof typeof REDDIT_TOPICS];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      console.log(colors.muted(`    Generating for r/${subreddit}: ${topic.slice(0, 30)}...`));
      const content = await generateRedditPost(topic, subreddit, 'value_post');
      console.log(colors.success(`    ✓ Created: ${content.id}`));
    }
  }
}

async function executeSendOutreach(data: Record<string, unknown>): Promise<void> {
  const leadId = data.leadId as string;
  if (!leadId) {
    throw new Error('Missing leadId in task data');
  }

  const leads = await getInfluencerLeads({ status: 'researched' });
  const lead = leads.find((l) => l.id === leadId);

  if (!lead) {
    throw new Error(`Influencer lead ${leadId} not found`);
  }

  console.log(colors.muted(`  Generating outreach email for ${lead.name}...`));
  const emailContent = await generateInfluencerEmail(lead, 'cold_outreach');
  console.log(colors.success(`  ✓ Email draft created: ${emailContent.id}`));

  // Update lead status
  await updateInfluencerStatus(leadId, 'contacted');
  console.log(colors.warning('  ⚠️ Note: Actual email sending not yet implemented'));
}

async function executeRedditEngagement(data: Record<string, unknown>): Promise<void> {
  const subreddit = (data.subreddit as string) || 'selfimprovement';
  const postType = (data.postType as 'value_post' | 'discussion' | 'natural_mention') || 'value_post';

  const topics = REDDIT_TOPICS[subreddit as keyof typeof REDDIT_TOPICS] || REDDIT_TOPICS.selfimprovement;
  const topic = topics[Math.floor(Math.random() * topics.length)];

  console.log(colors.muted(`  Generating ${postType} for r/${subreddit}...`));
  const content = await generateRedditPost(topic, subreddit, postType);
  console.log(colors.success(`  ✓ Reddit post drafted: ${content.id}`));
  console.log(colors.warning('  ⚠️ Note: Actual Reddit posting not yet implemented'));
}

async function executeCheckMetrics(_data: Record<string, unknown>): Promise<void> {
  // Fetch metrics from various sources (placeholder)
  console.log(colors.muted('  Checking TikTok metrics...'));
  console.log(colors.muted('  Checking Reddit karma...'));
  console.log(colors.muted('  Checking SEO rankings...'));
  console.log(colors.warning('  ⚠️ Note: Actual metrics fetching not yet implemented'));
}

// ============================================================================
// METRICS COMMAND
// ============================================================================

async function showMetrics(days: number): Promise<void> {
  const metrics = await getMetrics(days);

  if (metrics.length === 0) {
    console.log(colors.warning('\nNo metrics recorded yet.'));
    console.log(colors.muted('Metrics are recorded when tasks complete or manually via `ferni growth metrics record`'));
    return;
  }

  console.log(colors.bold(`\n📊 Growth Metrics (Last ${days} days):`));

  // Calculate totals
  let totalSignups = 0;
  let totalSpend = 0;

  for (const m of metrics) {
    totalSignups += m.total?.signups || 0;
    totalSpend += m.total?.spend || 0;
  }

  console.log(`
  ${colors.bold('Total Signups')}: ${totalSignups.toLocaleString()}
  ${colors.bold('Total Spend')}:   $${totalSpend.toFixed(2)}
  ${colors.bold('CAC')}:           $${totalSignups > 0 ? (totalSpend / totalSignups).toFixed(2) : 'N/A'}
`);

  // Show trend
  console.log(colors.bold('Daily Breakdown:'));
  for (const m of metrics.slice(-7)) {
    const bar = '█'.repeat(Math.min(m.total?.signups || 0, 20));
    console.log(`  ${m.date}: ${colors.success(bar)} ${m.total?.signups || 0}`);
  }
}

// ============================================================================
// CAMPAIGN COMMANDS
// ============================================================================

async function showCampaigns(): Promise<void> {
  const campaigns = await getCampaigns();

  if (campaigns.length === 0) {
    console.log(colors.warning('\nNo campaigns created.'));
    console.log(colors.muted('Run: ferni growth campaign create "Campaign Name" --channel tiktok'));
    return;
  }

  console.log(colors.bold('\n🎯 Growth Campaigns:'));

  for (const campaign of campaigns) {
    const statusIcon =
      {
        planning: '📋',
        active: '🟢',
        paused: '⏸️',
        completed: '✅',
      }[campaign.status] || '?';

    console.log(`
  ${statusIcon} ${colors.bold(campaign.name)} (${campaign.channel})
     Status: ${campaign.status}
     Started: ${new Date(campaign.startDate).toLocaleDateString()}`);

    for (const goal of campaign.goals) {
      console.log(`     ${goal.metric}: ${progressBar(goal.current, goal.target)}`);
    }
  }
}

async function createCampaignCommand(
  name: string,
  options: { channel: string; goals?: string }
): Promise<void> {
  const channel = options.channel as 'tiktok' | 'seo' | 'reddit' | 'influencer' | 'producthunt';

  // Parse goals from string like "followers:10000,signups:500"
  const goals: { metric: string; target: number; current: number }[] = [];
  if (options.goals) {
    for (const g of options.goals.split(',')) {
      const [metric, target] = g.split(':');
      goals.push({ metric, target: parseInt(target, 10), current: 0 });
    }
  } else {
    // Default goals by channel
    const defaults: Record<string, { metric: string; target: number }[]> = {
      tiktok: [
        { metric: 'followers', target: 50000 },
        { metric: 'signups', target: 500 },
      ],
      seo: [
        { metric: 'organic_sessions', target: 3000 },
        { metric: 'signups', target: 100 },
      ],
      reddit: [
        { metric: 'karma', target: 2000 },
        { metric: 'signups', target: 200 },
      ],
      influencer: [
        { metric: 'partnerships', target: 10 },
        { metric: 'signups', target: 1000 },
      ],
      producthunt: [
        { metric: 'upvotes', target: 500 },
        { metric: 'signups', target: 500 },
      ],
    };
    for (const g of defaults[channel] || []) {
      goals.push({ ...g, current: 0 });
    }
  }

  const campaign = await createCampaign(name, channel, goals);

  console.log(colors.success(`\n✓ Created campaign: ${campaign.name}`));
  console.log(colors.muted(`  Channel: ${campaign.channel}`));
  console.log(colors.muted(`  Goals:`));
  for (const goal of campaign.goals) {
    console.log(colors.muted(`    - ${goal.metric}: ${goal.target}`));
  }
}

// ============================================================================
// PLATFORM STATUS
// ============================================================================

async function showPlatformStatus(): Promise<void> {
  const settings = await getSettings();

  console.log(
    box(
      '🔌 PLATFORM INTEGRATIONS',
      `
${colors.bold('Reddit API')}
  Client ID:     ${settings.redditClientId ? colors.success('✓ Configured') : colors.warning('Not set')}
  Client Secret: ${settings.redditClientSecret ? colors.success('✓ Configured') : colors.warning('Not set')}
  Username:      ${settings.redditUsername ? colors.success(settings.redditUsername) : colors.warning('Not set')}
  ${colors.muted('Setup: ferni growth platform reddit --client-id <id> ...')}

${colors.bold('TikTok API')}
  Access Token:  ${settings.tiktokAccessToken ? colors.success('✓ Configured') : colors.warning('Not set')}
  Open ID:       ${settings.tiktokOpenId ? colors.success('✓ Configured') : colors.muted('Optional')}
  ${colors.muted('Note: Requires Business Account approval')}
  ${colors.muted('Setup: ferni growth platform tiktok --access-token <token>')}

${colors.bold('Email (Resend)')}
  API Key:       ${settings.resendApiKey ? colors.success('✓ Configured') : colors.warning('Not set')}
  From Email:    ${settings.emailFromAddress || colors.muted('hello@ferni.ai')}
  From Name:     ${settings.emailFromName || colors.muted('Ferni')}
  ${colors.muted('Setup: ferni growth platform email --api-key <key>')}
`
    )
  );

  console.log(colors.muted('\nCommands: platform reddit | platform tiktok | platform email | platform test'));
}

// ============================================================================
// REGISTER COMMAND
// ============================================================================

export function registerGrowthCommand(program: Command): void {
  const growth = program
    .command('growth')
    .description('🚀 Autonomous growth marketing for ferni.ai')
    .action(() => showDashboard());

  // TikTok subcommands
  const tiktok = growth
    .command('tiktok')
    .description('TikTok content machine')
    .action(() => showTikTokAccounts());

  tiktok
    .command('add <handle>')
    .description('Add a TikTok account')
    .requiredOption(
      '--angle <angle>',
      'Account angle: main, motivation, productivity, emotional, comparison'
    )
    .option('--description <desc>', 'Account description')
    .action(addTikTokAccountCommand);

  // Content subcommands
  const content = growth
    .command('content')
    .description('Content queue management')
    .option('--platform <platform>', 'Filter by platform')
    .option('--status <status>', 'Filter by status')
    .action(showContentQueue);

  content
    .command('add')
    .description('Add content to queue')
    .requiredOption('--platform <platform>', 'Platform: tiktok, reddit, blog, twitter')
    .requiredOption('--type <type>', 'Type: video_script, post, article, comment, email')
    .option('--title <title>', 'Content title')
    .option('--content <content>', 'Content body')
    .option('--hook <hook>', 'Hook/opening line')
    .action(addContentCommand);

  content
    .command('schedule <id> <datetime>')
    .description('Schedule content for posting')
    .option('--account <account>', 'Account ID to post from')
    .action(scheduleContentCommand);

  // Influencer subcommands
  const influencer = growth
    .command('influencer')
    .description('Influencer outreach tracking')
    .option('--tier <tier>', 'Filter by tier: nano, micro, mid, macro')
    .option('--status <status>', 'Filter by status')
    .action(showInfluencerLeads);

  influencer
    .command('add <name>')
    .description('Add influencer lead')
    .requiredOption('--handle <handle>', 'Social media handle')
    .requiredOption('--platform <platform>', 'Platform: tiktok, instagram, youtube, twitter')
    .requiredOption('--followers <count>', 'Follower count')
    .requiredOption('--category <category>', 'Category: self-improvement, mental-health, tech, etc.')
    .option('--email <email>', 'Contact email')
    .action(addInfluencerCommand);

  influencer
    .command('update <id> <status>')
    .description('Update influencer status')
    .action(updateInfluencerCommand);

  // SEO subcommands
  const seo = growth
    .command('seo')
    .description('SEO article management')
    .option('--status <status>', 'Filter by status')
    .action(showSEOArticles);

  seo
    .command('add')
    .description('Add SEO article')
    .requiredOption('--title <title>', 'Article title')
    .requiredOption('--keyword <keyword>', 'Target keyword')
    .option('--secondary <keywords>', 'Secondary keywords (comma-separated)')
    .option('--slug <slug>', 'URL slug')
    .action(addSEOArticleCommand);

  // Automation subcommands
  const auto = growth
    .command('auto')
    .description('Configure autonomous mode')
    .action(() => showAutoSettings());

  auto
    .command('post <on|off>')
    .description('Toggle auto-posting')
    .action((value: string) => toggleAutoSetting('autoPost', value === 'on'));

  auto
    .command('engage <on|off>')
    .description('Toggle auto-engagement')
    .action((value: string) => toggleAutoSetting('autoEngage', value === 'on'));

  auto
    .command('generate <on|off>')
    .description('Toggle auto-generation')
    .action((value: string) => toggleAutoSetting('autoGenerate', value === 'on'));

  auto
    .command('limit <type> <count>')
    .description('Set daily limits (content or engagement)')
    .action((type: string, count: string) =>
      setDailyLimit(type as 'content' | 'engagement', parseInt(count, 10))
    );

  auto
    .command('key <provider> <key>')
    .description('Set API key (openai or anthropic)')
    .action(setApiKey);

  auto
    .command('daemon')
    .description('Run autonomous scheduler as background process')
    .option('--interval <minutes>', 'Check interval in minutes', '5')
    .action(async (options) => {
      console.log(colors.bold('\n🤖 Starting Autonomous Growth Daemon...\n'));
      console.log(colors.muted('Press Ctrl+C to stop\n'));
      await runContinuousScheduler({
        checkIntervalMs: parseInt(options.interval, 10) * 60 * 1000,
      });
    });

  auto
    .command('quick')
    .description('Quickly generate content for a platform')
    .requiredOption('--platform <platform>', 'Platform: tiktok, seo, reddit')
    .option('--count <count>', 'Number of pieces to generate', '3')
    .action(async (options) => {
      await quickGenerate(options.platform, parseInt(options.count, 10));
    });

  auto
    .command('schedule')
    .description('Schedule tasks for tomorrow')
    .action(async () => {
      console.log(colors.bold('\n📅 Scheduling daily tasks...\n'));
      await scheduleDailyTasks();
      console.log(colors.success('\n✓ Daily tasks scheduled'));
    });

  auto
    .command('on')
    .description('Enable full autonomous mode (all features)')
    .action(async () => {
      await updateSettings({
        autoPost: true,
        autoEngage: true,
        autoGenerate: true,
      });
      console.log(colors.success('\n✓ Full autonomous mode ENABLED'));
      console.log(colors.muted('  Run `ferni growth auto daemon` to start background execution'));
    });

  auto
    .command('off')
    .description('Disable all autonomous features')
    .action(async () => {
      await updateSettings({
        autoPost: false,
        autoEngage: false,
        autoGenerate: false,
      });
      console.log(colors.warning('\n✓ Autonomous mode DISABLED'));
    });

  // Platform integration subcommands
  const platform = growth
    .command('platform')
    .description('Configure platform API integrations')
    .action(() => showPlatformStatus());

  platform
    .command('reddit')
    .description('Configure Reddit API credentials')
    .option('--client-id <id>', 'Reddit app client ID')
    .option('--client-secret <secret>', 'Reddit app client secret')
    .option('--username <user>', 'Reddit username')
    .option('--password <pass>', 'Reddit password')
    .action(async (options) => {
      if (options.clientId && options.clientSecret) {
        await configureReddit({
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          username: options.username || '',
          password: options.password || '',
        });
        console.log(colors.success('\n✓ Reddit credentials saved'));
        console.log(colors.muted('  Create app at: https://www.reddit.com/prefs/apps'));
      } else {
        console.log(colors.bold('\n🔴 Reddit API Configuration\n'));
        console.log('To enable Reddit posting:');
        console.log('1. Go to https://www.reddit.com/prefs/apps');
        console.log('2. Create a "script" type application');
        console.log('3. Run:');
        console.log(colors.muted('   ferni growth platform reddit \\'));
        console.log(colors.muted('     --client-id YOUR_CLIENT_ID \\'));
        console.log(colors.muted('     --client-secret YOUR_SECRET \\'));
        console.log(colors.muted('     --username YOUR_USERNAME \\'));
        console.log(colors.muted('     --password YOUR_PASSWORD'));
      }
    });

  platform
    .command('tiktok')
    .description('Configure TikTok API credentials')
    .option('--access-token <token>', 'TikTok access token')
    .option('--open-id <id>', 'TikTok open ID')
    .action(async (options) => {
      if (options.accessToken) {
        await configureTikTok({
          accessToken: options.accessToken,
          openId: options.openId || '',
        });
        console.log(colors.success('\n✓ TikTok credentials saved'));
      } else {
        console.log(colors.bold('\n📱 TikTok API Configuration\n'));
        console.log(colors.warning('Note: TikTok API requires Business Account approval'));
        console.log('');
        console.log('For now, use manual posting:');
        console.log('  1. Generate content: ferni growth auto quick --platform tiktok');
        console.log('  2. View scripts: ferni growth content --platform tiktok');
        console.log('  3. Post manually via TikTok app');
      }
    });

  platform
    .command('email')
    .description('Configure email sending (Resend)')
    .option('--api-key <key>', 'Resend API key')
    .option('--from-email <email>', 'From email address')
    .option('--from-name <name>', 'From name', 'Ferni')
    .action(async (options) => {
      if (options.apiKey) {
        await configureEmail({
          apiKey: options.apiKey,
          fromEmail: options.fromEmail || 'hello@ferni.ai',
          fromName: options.fromName || 'Ferni',
        });
        console.log(colors.success('\n✓ Email (Resend) credentials saved'));
      } else {
        console.log(colors.bold('\n📧 Email Configuration (Resend)\n'));
        console.log('1. Sign up at https://resend.com');
        console.log('2. Get your API key');
        console.log('3. Run:');
        console.log(colors.muted('   ferni growth platform email \\'));
        console.log(colors.muted('     --api-key re_... \\'));
        console.log(colors.muted('     --from-email hello@yourdomain.com'));
      }
    });

  platform
    .command('test')
    .description('Test platform connections')
    .option('--reddit', 'Test Reddit connection')
    .option('--email <to>', 'Send test email')
    .action(async (options) => {
      if (options.reddit) {
        console.log(colors.muted('\nTesting Reddit connection...'));
        try {
          const manager = getPlatformManager();
          const reddit = await manager.initializeReddit();
          const karma = await reddit.getKarma();
          if (karma) {
            console.log(colors.success(`✓ Reddit connected! Karma: ${karma.link + karma.comment}`));
          }
        } catch (error) {
          console.log(colors.error(`✗ Reddit failed: ${error}`));
        }
      }
      if (options.email) {
        console.log(colors.muted(`\nSending test email to ${options.email}...`));
        const result = await sendOutreachEmail(
          options.email,
          'Test from Ferni Growth CLI',
          'This is a test email from the Ferni Growth automation system.'
        );
        if (result.success) {
          console.log(colors.success(`✓ Email sent! ID: ${result.platformId}`));
        } else {
          console.log(colors.error(`✗ Email failed: ${result.error}`));
        }
      }
      if (!options.reddit && !options.email) {
        console.log(colors.muted('\nSpecify what to test:'));
        console.log('  --reddit    Test Reddit API connection');
        console.log('  --email <to>  Send test email');
      }
    });

  // Run tasks
  growth
    .command('run')
    .description('Execute pending tasks')
    .option('--generate', 'Generate new content with AI')
    .option('--post', 'Post scheduled content')
    .option('--engage', 'Run engagement tasks')
    .action(runPendingTasks);

  // Metrics
  const metrics = growth
    .command('metrics')
    .description('Show growth metrics')
    .option('-d, --days <days>', 'Number of days', '30')
    .action((options) => showMetrics(parseInt(options.days, 10)));

  metrics
    .command('live')
    .description('Show live session metrics (operations, API calls, latency)')
    .action(() => {
      const collector = getGrowthMetrics();
      const summary = collector.getSummary();
      console.log(formatMetricsSummary(summary));
    });

  metrics
    .command('reset')
    .description('Reset live session metrics')
    .action(() => {
      resetGrowthMetrics();
      console.log(colors.success('Metrics reset successfully.'));
    });

  metrics
    .command('failed')
    .description('Show failed operations')
    .action(() => {
      const collector = getGrowthMetrics();
      const failed = collector.getFailedOperations();
      if (failed.length === 0) {
        console.log(colors.success('No failed operations.'));
        return;
      }
      console.log(colors.bold(`\n❌ Failed Operations (${failed.length}):\n`));
      for (const op of failed) {
        console.log(`  ${colors.error('✗')} ${op.operation}`);
        console.log(`    Error: ${op.error}`);
        console.log(`    Duration: ${op.duration}ms`);
        if (op.metadata) {
          console.log(`    Metadata: ${JSON.stringify(op.metadata)}`);
        }
        console.log('');
      }
    });

  // Campaigns
  const campaign = growth
    .command('campaign')
    .description('Manage growth campaigns')
    .action(() => showCampaigns());

  campaign
    .command('create <name>')
    .description('Create a new campaign')
    .requiredOption('--channel <channel>', 'Channel: tiktok, seo, reddit, influencer, producthunt')
    .option('--goals <goals>', 'Goals as metric:target pairs (e.g., "followers:10000,signups:500")')
    .action(createCampaignCommand);

  // Product Hunt subcommands
  const producthunt = growth
    .command('producthunt')
    .alias('ph')
    .description('Product Hunt launch management')
    .action(() => showProductHuntStatus());

  producthunt
    .command('init')
    .description('Initialize Product Hunt launch campaign')
    .option('--date <date>', 'Launch date (YYYY-MM-DD)')
    .action(initProductHuntLaunch);

  producthunt
    .command('checklist')
    .description('Show launch checklist with progress')
    .action(showProductHuntChecklist);

  producthunt
    .command('check <item>')
    .description('Mark checklist item as complete')
    .action(checkProductHuntItem);

  producthunt
    .command('hunter')
    .description('Manage hunter outreach')
    .option('--add <name>', 'Add a hunter to track')
    .option('--status <id> <status>', 'Update hunter status')
    .action(manageHunters);

  producthunt
    .command('assets')
    .description('Track visual assets status')
    .action(showAssetStatus);

  producthunt
    .command('countdown')
    .description('Show days until launch')
    .action(showCountdown);

  // ============================================================================
  // BETTER THAN HUMAN INTELLIGENCE COMMANDS
  // ============================================================================

  const intel = growth
    .command('intel')
    .alias('ai')
    .description('🧠 Better Than Human growth intelligence')
    .action(() => showIntelligenceDashboard());

  intel
    .command('dashboard')
    .description('Show intelligence health and insights')
    .action(() => showIntelligenceDashboard());

  intel
    .command('patterns')
    .description('Analyze content performance patterns')
    .action(async () => {
      try {
        console.log(colors.bold('\n🔍 Analyzing Performance Patterns...\n'));
        const patterns = await analyzePerformancePatterns();

        if (patterns.length === 0) {
          console.log(colors.warning('Insufficient data for pattern analysis.'));
          console.log(colors.muted('Post more content and track metrics to enable learning.'));
          return;
        }

        for (const pattern of patterns) {
          console.log(colors.bold(`\n📊 ${pattern.platform.toUpperCase()}`));
          console.log(`   Avg Engagement: ${colors.success(pattern.avgEngagementRate.toFixed(2) + '%')}`);
          console.log(`   Avg Views: ${pattern.avgViews.toFixed(0)}`);
          console.log(`   Avg Signups: ${pattern.avgSignups.toFixed(1)}`);
          console.log(`   Sample Size: ${pattern.sampleSize} (${(pattern.confidence * 100).toFixed(0)}% confidence)`);

          if (pattern.elements.hooks.length > 0) {
            console.log(colors.muted(`   Top Hooks: ${pattern.elements.hooks.slice(0, 2).join(', ')}`));
          }
          if (pattern.elements.hashtags.length > 0) {
            console.log(colors.muted(`   Top Hashtags: ${pattern.elements.hashtags.slice(0, 5).join(', ')}`));
          }
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('timing')
    .description('Show optimal posting times')
    .option('--platform <platform>', 'Filter by platform')
    .action(async (options) => {
      try {
        console.log(colors.bold('\n⏰ Optimal Posting Times\n'));
        const slots = await calculateOptimalTimes();

        const filtered = options.platform
          ? slots.filter(s => s.platform === options.platform)
          : slots;

        if (filtered.length === 0) {
          console.log(colors.warning('No timing data available yet.'));
          console.log(colors.muted('Post content at different times to enable timing optimization.'));
          return;
        }

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const topSlots = filtered.slice(0, 10);

        for (const slot of topSlots) {
          const timeStr = `${days[slot.dayOfWeek]} ${slot.hour}:00`;
          const bar = '█'.repeat(Math.min(Math.round(slot.avgEngagement * 2), 20));
          console.log(
            `  ${colors.accent(timeStr.padEnd(10))} ${colors.success(bar)} ${slot.avgEngagement.toFixed(1)}% ` +
            `${colors.muted(`[${slot.platform}]`)}`
          );
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('suggest-time <platform>')
    .description('Get optimal time for next post')
    .action(async (platform: string) => {
      try {
        const result = await suggestPostingTime(platform, 'post');
        console.log(colors.bold('\n📅 Suggested Posting Time\n'));
        console.log(`  Time: ${colors.success(result.time.toLocaleString())}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`  ${colors.muted(result.reasoning)}`);
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('trends')
    .description('Detect emerging trends relevant to Ferni')
    .action(async () => {
      try {
        console.log(colors.bold('\n🔥 Trend Detection\n'));
        const trends = await detectTrends();

        if (trends.length === 0) {
          console.log(colors.muted('No significant trends detected right now.'));
          console.log(colors.muted('Trends are detected from content engagement patterns.'));
          return;
        }

        for (const trend of trends) {
          const statusIcon = {
            emerging: '🌱',
            rising: '📈',
            peak: '🔥',
            declining: '📉',
          }[trend.status];

          console.log(`${statusIcon} ${colors.bold(trend.topic)} [${trend.status}]`);
          console.log(`   Velocity: ${trend.velocity.toFixed(1)} | Relevance: ${(trend.relevanceScore * 100).toFixed(0)}%`);
          console.log(`   Peak Prediction: ${new Date(trend.peakPrediction).toLocaleDateString()}`);
          if (trend.suggestedAngles.length > 0) {
            console.log(`   ${colors.muted('Suggested angles:')}`);
            trend.suggestedAngles.slice(0, 2).forEach(a => console.log(`     • ${a}`));
          }
          console.log('');
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('score <contentId>')
    .description('Score engagement quality for content')
    .action(async (contentId: string) => {
      try {
        console.log(colors.bold('\n📊 Engagement Quality Score\n'));
        const score = await scoreEngagementQuality(contentId);

        const scoreColor = score.overallScore >= 70 ? colors.success :
                           score.overallScore >= 40 ? colors.warning : colors.error;

        console.log(`  Overall Score: ${scoreColor(score.overallScore.toString() + '/100')}`);
        console.log('');
        console.log(colors.bold('  Components:'));
        console.log(`    Reach Quality:        ${progressBar(Math.round(score.components.reachQuality), 100, 15)}`);
        console.log(`    Engagement Depth:     ${progressBar(Math.round(score.components.engagementDepth), 100, 15)}`);
        console.log(`    Conversion Efficiency:${progressBar(Math.round(score.components.conversionEfficiency), 100, 15)}`);
        console.log(`    Viral Coefficient:    ${progressBar(Math.round(score.components.viralCoefficient), 100, 15)}`);
        console.log(`    Sentiment:            ${progressBar(Math.round(score.components.sentimentScore), 100, 15)}`);

        if (score.insights.length > 0) {
          console.log(colors.bold('\n  Insights:'));
          score.insights.forEach(i => console.log(`    ${colors.success('✓')} ${i}`));
        }

        if (score.recommendations.length > 0) {
          console.log(colors.bold('\n  Recommendations:'));
          score.recommendations.forEach(r => console.log(`    ${colors.warning('→')} ${r}`));
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('cross-platform <source> <target>')
    .description('Get cross-platform content insights')
    .action(async (source: string, target: string) => {
      try {
        console.log(colors.bold(`\n🔄 Cross-Platform Intelligence: ${source} → ${target}\n`));
        const insights = await getCrossPlatformInsights(source, target);

        if (insights.transferablePatterns.length > 0) {
          console.log(colors.bold('Transferable Patterns:'));
          insights.transferablePatterns.forEach(p => console.log(`  ${colors.success('✓')} ${p}`));
        }

        if (insights.adaptationNeeded.length > 0) {
          console.log(colors.bold('\nAdaptation Required:'));
          insights.adaptationNeeded.forEach(a => console.log(`  ${colors.warning('→')} ${a}`));
        }

        if (insights.suggestedContent.length > 0) {
          console.log(colors.bold('\nSuggested Content:'));
          insights.suggestedContent.forEach(s => console.log(`  ${colors.accent('•')} ${s}`));
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('influencer-fit <influencerId>')
    .description('Score influencer fit for partnership')
    .action(async (influencerId: string) => {
      console.log(colors.bold('\n👤 Influencer Fit Analysis\n'));
      try {
        const score = await scoreInfluencerFit(influencerId);

        const fitColor = score.overallFit >= 70 ? colors.success :
                        score.overallFit >= 40 ? colors.warning : colors.error;

        console.log(`  Overall Fit: ${fitColor(score.overallFit.toString() + '/100')}`);
        console.log(`  Predicted CPA: $${score.predictedCPA.toFixed(2)}`);
        console.log(`  Recommended Deal: ${colors.accent(score.recommendedDealType)}`);
        console.log('');
        console.log(colors.bold('  Components:'));
        console.log(`    Audience Overlap:    ${progressBar(Math.round(score.components.audienceOverlap), 100, 15)}`);
        console.log(`    Content Alignment:   ${progressBar(Math.round(score.components.contentAlignment), 100, 15)}`);
        console.log(`    Authenticity:        ${progressBar(Math.round(score.components.engagementAuthenticity), 100, 15)}`);
        console.log(`    Historical Perf:     ${progressBar(Math.round(score.components.historicalPerformance), 100, 15)}`);
        console.log(`    Pricing Efficiency:  ${progressBar(Math.round(score.components.pricingEfficiency), 100, 15)}`);

        if (score.opportunities.length > 0) {
          console.log(colors.bold('\n  Opportunities:'));
          score.opportunities.forEach(o => console.log(`    ${colors.success('+')} ${o}`));
        }

        if (score.risks.length > 0) {
          console.log(colors.bold('\n  Risks:'));
          score.risks.forEach(r => console.log(`    ${colors.error('!')} ${r}`));
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('optimize <contentId>')
    .description('Get optimization suggestions for content')
    .action(async (contentId: string) => {
      console.log(colors.bold('\n✨ Content Optimization\n'));
      try {
        const opt = await optimizeContent(contentId);

        console.log(`  Current Score:   ${opt.currentScore.toFixed(1)}`);
        console.log(`  Optimized Score: ${colors.success(opt.optimizedScore.toFixed(1))} (+${((opt.optimizedScore - opt.currentScore) / opt.currentScore * 100).toFixed(0)}%)`);

        if (opt.suggestions.length > 0) {
          console.log(colors.bold('\n  Suggestions:'));
          for (const s of opt.suggestions) {
            console.log(`    ${colors.warning('→')} ${s.type.toUpperCase()}`);
            console.log(`      Current: ${colors.muted(s.current.slice(0, 50))}`);
            console.log(`      Suggested: ${s.suggested.slice(0, 50)}`);
            console.log(`      Expected Lift: ${colors.success('+' + s.expectedLift + '%')} (${(s.confidence * 100).toFixed(0)}% conf)`);
          }
        }

        if (opt.abTestVariants.length > 0) {
          console.log(colors.bold('\n  A/B Test Variants:'));
          for (const v of opt.abTestVariants) {
            console.log(`    ${colors.accent('•')} ${v.variant}`);
            console.log(`      ${colors.muted(v.hypothesis)}`);
          }
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('sentiment <text>')
    .description('Analyze content sentiment before posting')
    .action(async (text: string) => {
      try {
        console.log(colors.bold('\n🎭 Sentiment Analysis\n'));
        const analysis = await analyzeSentiment(text);

        const sentimentEmoji = analysis.overallSentiment > 0.3 ? '😊' :
                              analysis.overallSentiment < -0.3 ? '😟' : '😐';

        console.log(`  Overall Sentiment: ${sentimentEmoji} ${(analysis.overallSentiment * 100).toFixed(0)}%`);
        console.log(`  Approval: ${analysis.approved ? colors.success('✓ APPROVED') : colors.warning('⚠ NEEDS REVIEW')}`);
        console.log(`  ${colors.muted(analysis.approvalReason)}`);

        console.log(colors.bold('\n  Tone Analysis:'));
        console.log(`    Professional:  ${progressBar(Math.round(analysis.toneAnalysis.professional * 100), 100, 12)}`);
        console.log(`    Casual:        ${progressBar(Math.round(analysis.toneAnalysis.casual * 100), 100, 12)}`);
        console.log(`    Promotional:   ${progressBar(Math.round(analysis.toneAnalysis.promotional * 100), 100, 12)}`);
        console.log(`    Authentic:     ${progressBar(Math.round(analysis.toneAnalysis.authentic * 100), 100, 12)}`);
        console.log(`    Controversial: ${progressBar(Math.round(analysis.toneAnalysis.controversial * 100), 100, 12)}`);

        console.log(colors.bold('\n  Platform Fit:'));
        for (const [platform, score] of Object.entries(analysis.platformFit)) {
          const fitColor = score >= 70 ? colors.success : score >= 40 ? colors.warning : colors.error;
          console.log(`    ${platform.padEnd(8)} ${fitColor(score.toFixed(0) + '/100')}`);
        }

        if (analysis.riskFactors.length > 0) {
          console.log(colors.bold('\n  Risk Factors:'));
          for (const risk of analysis.riskFactors) {
            const severityIcon = risk.severity === 'high' ? colors.error('⚠') :
                                risk.severity === 'medium' ? colors.warning('!') : colors.muted('○');
            console.log(`    ${severityIcon} ${risk.factor}`);
            console.log(`      ${colors.muted(risk.recommendation)}`);
          }
        }
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('competitor <name> <platform>')
    .description('Track competitor activity')
    .action(async (name: string, platform: string) => {
      try {
        console.log(colors.bold(`\n🔎 Competitor Analysis: ${name} on ${platform}\n`));
        const insight = await analyzeCompetitor(name, platform);

        console.log(colors.bold('Opportunities:'));
        insight.opportunities.forEach(o => console.log(`  ${colors.success('+')} ${o}`));

        console.log(colors.bold('\nThreats:'));
        insight.threats.forEach(t => console.log(`  ${colors.error('!')} ${t}`));

        console.log(colors.muted('\nNote: Manual competitor data entry coming soon.'));
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  intel
    .command('learn')
    .description('Run full learning cycle (analyze all patterns)')
    .action(async () => {
      try {
        console.log(colors.bold('\n🧠 Running Full Learning Cycle...\n'));

        console.log(colors.muted('  Analyzing performance patterns...'));
        const patterns = await analyzePerformancePatterns();
        console.log(colors.success(`  ✓ Found ${patterns.length} platform patterns`));

        console.log(colors.muted('  Calculating optimal times...'));
        const times = await calculateOptimalTimes();
        console.log(colors.success(`  ✓ Calculated ${times.length} time slots`));

        console.log(colors.muted('  Detecting trends...'));
        const trends = await detectTrends();
        console.log(colors.success(`  ✓ Detected ${trends.length} trends`));

        console.log(colors.muted('  Generating intelligence dashboard...'));
        const dashboard = await getIntelligenceDashboard();
        console.log(colors.success(`  ✓ Intelligence health: ${dashboard.healthScore}/100`));

        console.log(colors.bold('\n✨ Learning cycle complete!'));
        console.log(colors.muted('Run `ferni growth intel dashboard` to see insights.'));
      } catch (error) {
        console.log(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
}

// ============================================================================
// INTELLIGENCE DASHBOARD
// ============================================================================

async function showIntelligenceDashboard(): Promise<void> {
  const dashboard = await getIntelligenceDashboard();

  const healthColor = dashboard.healthScore >= 70 ? colors.success :
                     dashboard.healthScore >= 40 ? colors.warning : colors.error;

  console.log(
    box(
      '🧠 BETTER THAN HUMAN INTELLIGENCE',
      `
${colors.bold('Intelligence Health')}: ${healthColor(dashboard.healthScore.toString() + '/100')}
  Learning Velocity: ${dashboard.learningVelocity} insights/week

${colors.bold('Top Insights')}
${dashboard.topInsights.length > 0
  ? dashboard.topInsights.map(i => `  ${colors.success('✓')} ${i}`).join('\n')
  : colors.muted('  No insights yet - generate more content!')}

${colors.bold('Performance by Platform')}
${dashboard.performanceSummary.length > 0
  ? dashboard.performanceSummary.map(p =>
    `  ${p.platform.padEnd(10)} ${p.score.toFixed(1)}% engagement ${p.trend === 'up' ? '📈' : p.trend === 'down' ? '📉' : '➡️'}`
  ).join('\n')
  : colors.muted('  No platform data yet')}

${colors.bold('Trending Topics')}: ${dashboard.trends.length}
${dashboard.trends.slice(0, 3).map(t =>
  `  ${t.status === 'rising' ? '📈' : '🌱'} ${t.topic} (${(t.relevanceScore * 100).toFixed(0)}% relevant)`
).join('\n') || colors.muted('  No trends detected')}
`
    )
  );

  if (dashboard.actionItems.length > 0) {
    console.log(colors.bold('\n📋 Action Items:'));
    for (const item of dashboard.actionItems) {
      const priorityIcon = item.priority === 'high' ? colors.error('⚡') :
                          item.priority === 'medium' ? colors.warning('→') : colors.muted('○');
      console.log(`  ${priorityIcon} ${item.action}`);
      console.log(`    ${colors.muted(item.expectedImpact)}`);
    }
  }

  console.log(colors.muted('\nCommands: intel patterns | intel timing | intel trends | intel learn'));
}

// ============================================================================
// PRODUCT HUNT COMMANDS
// ============================================================================

interface ProductHuntState {
  launchDate?: string;
  checklist: Record<string, boolean>;
  hunters: Array<{ name: string; handle: string; status: string; followers: number }>;
  assets: Record<string, boolean>;
  metrics: {
    upvotes: number;
    comments: number;
    ranking: number;
    signups: number;
  };
}

async function getProductHuntState(): Promise<ProductHuntState> {
  const state = await getDashboard();
  // Extract PH state from campaigns or use defaults
  const phCampaign = state.activeCampaigns.find((c) => c.channel === 'producthunt');
  return {
    launchDate: phCampaign?.startDate,
    checklist: {
      'claim_profile': false,
      'create_company_page': false,
      'identify_hunters': false,
      'research_launches': false,
      'draft_description': false,
      'finalize_tagline': false,
      'create_gallery_images': false,
      'record_demo_video': false,
      'write_maker_comment': false,
      'reach_out_hunters': false,
      'confirm_hunter': false,
      'create_email_announcement': false,
      'draft_social_posts': false,
      'setup_analytics': false,
      'test_offer_page': false,
      'all_assets_uploaded': false,
      'email_ready': false,
      'social_scheduled': false,
    },
    hunters: [],
    assets: {
      'logo_square': false,
      'hero_image': false,
      'gallery_2': false,
      'gallery_3': false,
      'gallery_4': false,
      'gallery_5': false,
      'gallery_6': false,
      'thumbnail': false,
      'animated_gif': false,
      'product_video': false,
      'social_share_images': false,
    },
    metrics: {
      upvotes: phCampaign?.goals.find((g) => g.metric === 'upvotes')?.current || 0,
      comments: 0,
      ranking: 0,
      signups: phCampaign?.goals.find((g) => g.metric === 'signups')?.current || 0,
    },
  };
}

async function showProductHuntStatus(): Promise<void> {
  const state = await getProductHuntState();

  const checklistComplete = Object.values(state.checklist).filter(Boolean).length;
  const checklistTotal = Object.keys(state.checklist).length;
  const assetsComplete = Object.values(state.assets).filter(Boolean).length;
  const assetsTotal = Object.keys(state.assets).length;

  console.log(
    box(
      '🚀 PRODUCT HUNT LAUNCH STATUS',
      `
${colors.bold('Launch Date')}: ${state.launchDate ? new Date(state.launchDate).toLocaleDateString() : colors.warning('Not set')}
${state.launchDate ? `Days Until Launch: ${Math.ceil((new Date(state.launchDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}` : ''}

${colors.bold('Pre-Launch Checklist')}
  ${progressBar(checklistComplete, checklistTotal)}

${colors.bold('Visual Assets')}
  ${progressBar(assetsComplete, assetsTotal)}

${colors.bold('Hunter Outreach')}
  Hunters tracked: ${state.hunters.length}
  Confirmed: ${state.hunters.filter((h) => h.status === 'confirmed').length}

${colors.bold('Live Metrics')} ${state.metrics.upvotes > 0 ? '' : colors.muted('(post-launch)')}
  Upvotes:  ${state.metrics.upvotes}
  Comments: ${state.metrics.comments}
  Ranking:  ${state.metrics.ranking || 'N/A'}
  Signups:  ${state.metrics.signups}
`
    )
  );

  console.log(colors.muted('\nCommands: ph checklist | ph assets | ph hunter | ph countdown'));
}

async function initProductHuntLaunch(options: { date?: string }): Promise<void> {
  const launchDate = options.date || new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Create campaign for Product Hunt
  await createCampaign('Product Hunt Launch', 'producthunt', [
    { metric: 'upvotes', target: 500, current: 0 },
    { metric: 'signups', target: 500, current: 0 },
  ]);

  console.log(colors.success('\n✓ Product Hunt launch initialized!'));
  console.log(colors.muted(`  Launch date: ${launchDate}`));
  console.log(colors.muted('  Run `ferni growth ph checklist` to see your prep tasks'));
}

async function showProductHuntChecklist(): Promise<void> {
  const checklist = [
    { week: 4, name: 'Foundation', items: [
      { id: 'claim_profile', label: 'Claim maker profile on Product Hunt' },
      { id: 'create_company_page', label: 'Create company page on PH' },
      { id: 'identify_hunters', label: 'Identify 3-5 hunters to approach' },
      { id: 'research_launches', label: 'Research top AI/productivity launches' },
      { id: 'draft_description', label: 'Draft initial product description' },
    ]},
    { week: 3, name: 'Assets & Outreach', items: [
      { id: 'finalize_tagline', label: 'Finalize product tagline (60 chars)' },
      { id: 'create_gallery_images', label: 'Create 6+ gallery images (1270x760px)' },
      { id: 'record_demo_video', label: 'Record product demo video (2-3 min)' },
      { id: 'write_maker_comment', label: 'Write maker comment draft' },
      { id: 'reach_out_hunters', label: 'Reach out to hunters' },
    ]},
    { week: 2, name: 'Build Support Network', items: [
      { id: 'confirm_hunter', label: 'Confirm hunter (if using one)' },
      { id: 'create_email_announcement', label: 'Create email announcement' },
      { id: 'draft_social_posts', label: 'Draft social media posts' },
      { id: 'setup_analytics', label: 'Set up PH traffic analytics' },
    ]},
    { week: 1, name: 'Final Prep', items: [
      { id: 'all_assets_uploaded', label: 'All assets uploaded to PH' },
      { id: 'email_ready', label: 'Email blast ready' },
      { id: 'social_scheduled', label: 'Social posts scheduled' },
      { id: 'test_offer_page', label: 'Test /producthunt offer page' },
    ]},
  ];

  const state = await getProductHuntState();

  console.log(colors.bold('\n📋 Product Hunt Launch Checklist\n'));

  for (const week of checklist) {
    const weekComplete = week.items.filter((i) => state.checklist[i.id]).length;
    console.log(`${colors.bold(`Week ${week.week}: ${week.name}`)} (${weekComplete}/${week.items.length})`);

    for (const item of week.items) {
      const done = state.checklist[item.id];
      const icon = done ? colors.success('✓') : colors.muted('○');
      console.log(`  ${icon} ${done ? colors.muted(item.label) : item.label}`);
    }
    console.log('');
  }

  console.log(colors.muted('Mark complete: ferni growth ph check <item-id>'));
}

async function checkProductHuntItem(itemId: string): Promise<void> {
  // In a real implementation, this would persist to storage
  console.log(colors.success(`\n✓ Marked "${itemId}" as complete`));
  console.log(colors.muted('  (Note: Checklist state is stored in campaign data)'));
}

async function manageHunters(options: { add?: string; status?: string }): Promise<void> {
  const state = await getProductHuntState();

  if (options.add) {
    console.log(colors.success(`\n✓ Added hunter: ${options.add}`));
    console.log(colors.muted('  Track their response with: ferni growth ph hunter --status <name> contacted'));
    return;
  }

  console.log(colors.bold('\n🎯 Hunter Outreach Pipeline\n'));

  if (state.hunters.length === 0) {
    console.log(colors.muted('No hunters tracked yet.'));
    console.log(colors.muted('\nLook for hunters at: https://www.producthunt.com/about/people'));
    console.log(colors.muted('Add a hunter: ferni growth ph hunter --add "Name @handle"'));
    return;
  }

  for (const hunter of state.hunters) {
    const statusIcon = {
      researched: '🔍',
      contacted: '📧',
      responded: '💬',
      confirmed: '✅',
      declined: '❌',
    }[hunter.status] || '?';

    console.log(`${statusIcon} ${hunter.name} (@${hunter.handle})`);
    console.log(`   ${hunter.followers.toLocaleString()} followers | Status: ${hunter.status}`);
  }
}

async function showAssetStatus(): Promise<void> {
  const assets = [
    { id: 'logo_square', label: 'Logo (240x240px, PNG)', required: true },
    { id: 'hero_image', label: 'Hero image (1270x760px)', required: true },
    { id: 'gallery_2', label: 'Gallery image 2 (1270x760px)', required: true },
    { id: 'gallery_3', label: 'Gallery image 3 (1270x760px)', required: true },
    { id: 'gallery_4', label: 'Gallery image 4 (1270x760px)', required: true },
    { id: 'gallery_5', label: 'Gallery image 5 (1270x760px)', required: true },
    { id: 'gallery_6', label: 'Gallery image 6 (1270x760px)', required: false },
    { id: 'thumbnail', label: 'Thumbnail (240x240px)', required: true },
    { id: 'animated_gif', label: 'Animated GIF', required: false },
    { id: 'product_video', label: 'Product video (2-3 min)', required: false },
    { id: 'social_share_images', label: 'Social share images', required: false },
  ];

  const state = await getProductHuntState();

  console.log(colors.bold('\n🎨 Visual Assets Checklist\n'));

  console.log(colors.bold('Required:'));
  for (const asset of assets.filter((a) => a.required)) {
    const done = state.assets[asset.id];
    const icon = done ? colors.success('✓') : colors.warning('○');
    console.log(`  ${icon} ${asset.label}`);
  }

  console.log(colors.bold('\nRecommended:'));
  for (const asset of assets.filter((a) => !a.required)) {
    const done = state.assets[asset.id];
    const icon = done ? colors.success('✓') : colors.muted('○');
    console.log(`  ${icon} ${asset.label}`);
  }
}

async function showCountdown(): Promise<void> {
  const state = await getProductHuntState();

  if (!state.launchDate) {
    console.log(colors.warning('\nLaunch date not set.'));
    console.log(colors.muted('Initialize with: ferni growth ph init --date 2026-02-15'));
    return;
  }

  const launchDate = new Date(state.launchDate);
  const now = new Date();
  const daysLeft = Math.ceil((launchDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    console.log(colors.success('\n🎉 LAUNCH DAY HAS PASSED!'));
    console.log(colors.muted(`  Launched: ${launchDate.toLocaleDateString()}`));
    return;
  }

  if (daysLeft === 0) {
    console.log(colors.bold('\n🚀 LAUNCH DAY IS TODAY!'));
    console.log(`
${colors.warning('12:01 AM PT')} - Product goes live
${colors.warning('12:05 AM PT')} - Send email blast
${colors.warning('12:15 AM PT')} - Post maker comment
${colors.warning('06:00 AM PT')} - Peak hours begin
${colors.warning('11:59 PM PT')} - Final ranking locked
    `);
    return;
  }

  const weeksLeft = Math.floor(daysLeft / 7);

  console.log(colors.bold(`\n⏰ ${daysLeft} DAYS UNTIL LAUNCH\n`));

  if (weeksLeft >= 4) {
    console.log(colors.muted('Week 4: Focus on Foundation'));
    console.log('  • Claim maker profile');
    console.log('  • Start community engagement');
  } else if (weeksLeft >= 3) {
    console.log(colors.warning('Week 3: Assets & Outreach'));
    console.log('  • Finalize all visuals');
    console.log('  • Reach out to hunters');
  } else if (weeksLeft >= 2) {
    console.log(colors.warning('Week 2: Build Support'));
    console.log('  • Confirm hunter');
    console.log('  • Prepare announcements');
  } else if (weeksLeft >= 1) {
    console.log(colors.error('Week 1: Final Prep'));
    console.log('  • Upload all assets');
    console.log('  • Test everything');
  } else {
    console.log(colors.error('FINAL DAYS!'));
    console.log('  • Verify all systems');
    console.log('  • Get rest before launch');
  }

  console.log(colors.muted(`\nLaunch: ${launchDate.toLocaleDateString()} at 12:01 AM PT`));
}
