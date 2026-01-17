/**
 * Social Media Automation for Ferni Launch
 *
 * Commands:
 *   ferni launch post twitter    - Post to Twitter/X
 *   ferni launch post linkedin   - Post to LinkedIn
 *   ferni launch post discord    - Post to Discord
 *   ferni launch post all        - Post to all platforms
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SocialConfig {
  twitter: {
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    accessSecret?: string;
  };
  linkedin: {
    accessToken?: string;
    organizationId?: string;
  };
  discord: {
    webhookUrl?: string;
  };
}

function loadConfig(): SocialConfig {
  const configPath = join(process.cwd(), '.social-config.json');
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  }
  return { twitter: {}, linkedin: {}, discord: {} };
}

// ============================================================================
// CONTENT LOADERS
// ============================================================================

interface ThreadTweet {
  text: string;
  media?: string[];
}

function loadTwitterThread(): ThreadTweet[] {
  const threadFile = join(process.cwd(), 'docs/marketing/TWITTER-LAUNCH.md');
  if (!existsSync(threadFile)) {
    throw new Error('Twitter launch file not found: docs/marketing/TWITTER-LAUNCH.md');
  }

  const content = readFileSync(threadFile, 'utf-8');
  const tweets: ThreadTweet[] = [];

  // Extract tweets from markdown
  const tweetMatches = content.matchAll(/### Tweet \d+.*?\n```\n([\s\S]*?)```/g);

  for (const match of tweetMatches) {
    const tweetText = match[1].trim();
    if (tweetText) {
      tweets.push({ text: tweetText });
    }
  }

  return tweets;
}

function loadLinkedInPost(): string {
  const linkedinFile = join(process.cwd(), 'docs/marketing/LINKEDIN-LAUNCH.md');
  if (!existsSync(linkedinFile)) {
    throw new Error('LinkedIn launch file not found: docs/marketing/LINKEDIN-LAUNCH.md');
  }

  const content = readFileSync(linkedinFile, 'utf-8');

  // Extract launch post
  const postMatch = content.match(/## Launch Post\n\n```\n([\s\S]*?)```/);
  if (postMatch) {
    return postMatch[1].trim();
  }

  throw new Error('Could not find launch post in LinkedIn file');
}

function loadDiscordAnnouncement(): { content: string; embeds: Array<Record<string, unknown>> } {
  return {
    content: '🚀 **Ferni Agent Builder is LIVE!**',
    embeds: [
      {
        title: 'Build Voice AI Agents in 3 Commands',
        description:
          '```bash\nferni agent init my-advisor\nferni agent preview my-advisor\nferni agent publish my-advisor\n```',
        color: 0x3d5a45,
        fields: [
          {
            name: '📦 Install',
            value: '`npm install -g @ferni/cli`',
            inline: true,
          },
          {
            name: '📚 Docs',
            value: '[developers.ferni.ai](https://developers.ferni.ai)',
            inline: true,
          },
        ],
        footer: {
          text: 'Try it free • No credit card required',
        },
      },
    ],
  };
}

// ============================================================================
// POSTING FUNCTIONS
// ============================================================================

async function postToTwitter(): Promise<boolean> {
  const config = loadConfig();

  if (!config.twitter.apiKey) {
    console.log(chalk.yellow('\n⚠ Twitter not configured.'));
    console.log(chalk.gray('Add credentials to .social-config.json or use environment variables.'));
    console.log(chalk.gray('\nAlternative: Copy content and post manually.\n'));

    const tweets = loadTwitterThread();
    console.log(chalk.cyan('Thread content:'));
    console.log(chalk.gray('─'.repeat(40)));

    tweets.slice(0, 3).forEach((tweet, i) => {
      console.log(chalk.dim(`Tweet ${i + 1}:`));
      console.log(tweet.text.substring(0, 200) + '...');
      console.log('');
    });

    // Copy first tweet to clipboard
    try {
      await execAsync(`echo "${tweets[0].text}" | pbcopy`);
      console.log(chalk.green('✓ First tweet copied to clipboard'));
    } catch {
      // Not on macOS
    }

    console.log(chalk.gray('\nOpen: https://twitter.com/compose/tweet'));
    return false;
  }

  const spinner = p.spinner();
  spinner.start('Posting Twitter thread...');

  try {
    const tweets = loadTwitterThread();

    // Post thread using Twitter API
    let previousTweetId: string | null = null;

    for (const tweet of tweets) {
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.twitter.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: tweet.text,
          reply: previousTweetId ? { in_reply_to_tweet_id: previousTweetId } : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Twitter API error: ${response.status}`);
      }

      const data = await response.json();
      previousTweetId = data.data.id;
    }

    spinner.stop(chalk.green('✓ Twitter thread posted!'));
    return true;
  } catch (error) {
    spinner.stop(chalk.red('✗ Failed'));
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    return false;
  }
}

async function postToLinkedIn(): Promise<boolean> {
  const config = loadConfig();

  if (!config.linkedin.accessToken) {
    console.log(chalk.yellow('\n⚠ LinkedIn not configured.'));
    console.log(chalk.gray('Add credentials to .social-config.json'));
    console.log(chalk.gray('\nAlternative: Copy content and post manually.\n'));

    const post = loadLinkedInPost();
    console.log(chalk.cyan('LinkedIn post:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(post.substring(0, 500) + '...');

    // Copy to clipboard
    try {
      await execAsync(`echo "${post}" | pbcopy`);
      console.log(chalk.green('\n✓ Post copied to clipboard'));
    } catch {
      // Not on macOS
    }

    console.log(chalk.gray('\nOpen: https://www.linkedin.com/feed/'));
    return false;
  }

  const spinner = p.spinner();
  spinner.start('Posting to LinkedIn...');

  try {
    const post = loadLinkedInPost();

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.linkedin.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        author: `urn:li:organization:${config.linkedin.organizationId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: post },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`LinkedIn API error: ${response.status}`);
    }

    spinner.stop(chalk.green('✓ LinkedIn post published!'));
    return true;
  } catch (error) {
    spinner.stop(chalk.red('✗ Failed'));
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    return false;
  }
}

async function postToDiscord(): Promise<boolean> {
  const config = loadConfig();

  if (!config.discord.webhookUrl) {
    // Try environment variable
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log(chalk.yellow('\n⚠ Discord webhook not configured.'));
      console.log(chalk.gray('Set DISCORD_WEBHOOK_URL environment variable or add to .social-config.json'));
      return false;
    }
    config.discord.webhookUrl = webhookUrl;
  }

  const spinner = p.spinner();
  spinner.start('Posting to Discord...');

  try {
    const announcement = loadDiscordAnnouncement();

    const response = await fetch(config.discord.webhookUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(announcement),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook error: ${response.status}`);
    }

    spinner.stop(chalk.green('✓ Discord announcement posted!'));
    return true;
  } catch (error) {
    spinner.stop(chalk.red('✗ Failed'));
    console.log(chalk.red(`Error: ${(error as Error).message}`));
    return false;
  }
}

// ============================================================================
// MAIN COMMANDS
// ============================================================================

export async function postSocial(platform: string): Promise<void> {
  console.log(chalk.bold('\n📢 Social Media Posting\n'));

  const results: Record<string, boolean> = {};

  if (platform === 'twitter' || platform === 'all') {
    results.twitter = await postToTwitter();
  }

  if (platform === 'linkedin' || platform === 'all') {
    results.linkedin = await postToLinkedIn();
  }

  if (platform === 'discord' || platform === 'all') {
    results.discord = await postToDiscord();
  }

  // Summary
  console.log(chalk.gray('\n─'.repeat(40)));
  console.log(chalk.bold('Summary:'));

  for (const [p, success] of Object.entries(results)) {
    const icon = success ? chalk.green('✓') : chalk.yellow('○');
    const status = success ? 'Posted' : 'Manual';
    console.log(`  ${icon} ${p}: ${status}`);
  }
}

export async function configureSocial(): Promise<void> {
  console.log(chalk.bold('\n⚙️ Configure Social Media Accounts\n'));

  const platform = await p.select({
    message: 'Which platform?',
    options: [
      { value: 'twitter', label: '🐦 Twitter' },
      { value: 'linkedin', label: '💼 LinkedIn' },
      { value: 'discord', label: '💬 Discord' },
    ],
  });

  const config = loadConfig();

  if (platform === 'twitter') {
    console.log(chalk.gray('\nTwitter API credentials (get from developer.twitter.com):\n'));

    const apiKey = await p.text({ message: 'API Key:' });
    const apiSecret = await p.text({ message: 'API Secret:' });
    const accessToken = await p.text({ message: 'Access Token:' });
    const accessSecret = await p.text({ message: 'Access Secret:' });

    config.twitter = {
      apiKey: apiKey as string,
      apiSecret: apiSecret as string,
      accessToken: accessToken as string,
      accessSecret: accessSecret as string,
    };
  } else if (platform === 'linkedin') {
    console.log(chalk.gray('\nLinkedIn API credentials:\n'));

    const accessToken = await p.text({ message: 'Access Token:' });
    const organizationId = await p.text({ message: 'Organization ID:' });

    config.linkedin = {
      accessToken: accessToken as string,
      organizationId: organizationId as string,
    };
  } else if (platform === 'discord') {
    console.log(chalk.gray('\nDiscord webhook URL (from channel settings > Integrations):\n'));

    const webhookUrl = await p.text({ message: 'Webhook URL:' });

    config.discord = {
      webhookUrl: webhookUrl as string,
    };
  }

  const configPath = join(process.cwd(), '.social-config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green('\n✓ Configuration saved to .social-config.json'));
  console.log(chalk.yellow('⚠ Add .social-config.json to .gitignore!'));
}

// ============================================================================
// SCHEDULING
// ============================================================================

interface ScheduledPost {
  id: string;
  platform: string;
  content: string;
  scheduledTime: string;
  status: 'pending' | 'posted' | 'failed';
}

export async function schedulePost(): Promise<void> {
  console.log(chalk.bold('\n📅 Schedule Social Media Post\n'));

  const platform = await p.select({
    message: 'Platform:',
    options: [
      { value: 'twitter', label: '🐦 Twitter' },
      { value: 'linkedin', label: '💼 LinkedIn' },
      { value: 'discord', label: '💬 Discord' },
    ],
  });

  const timing = await p.select({
    message: 'When:',
    options: [
      { value: 'optimal', label: '⏰ Optimal time (9 AM PT)' },
      { value: '1h', label: '1 hour from now' },
      { value: '3h', label: '3 hours from now' },
      { value: 'custom', label: '📆 Custom time' },
    ],
  });

  let scheduledTime = new Date();

  if (timing === 'optimal') {
    scheduledTime.setHours(9, 0, 0, 0);
    if (scheduledTime < new Date()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
  } else if (timing === '1h') {
    scheduledTime = new Date(Date.now() + 60 * 60 * 1000);
  } else if (timing === '3h') {
    scheduledTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
  } else if (timing === 'custom') {
    const dateStr = await p.text({
      message: 'Enter date/time (YYYY-MM-DD HH:MM):',
      placeholder: '2024-01-15 09:00',
    });
    if (typeof dateStr === 'string') {
      scheduledTime = new Date(dateStr);
    }
  }

  // Load content
  let content = '';
  if (platform === 'twitter') {
    const tweets = loadTwitterThread();
    content = tweets[0]?.text || '';
  } else if (platform === 'linkedin') {
    content = loadLinkedInPost();
  } else if (platform === 'discord') {
    content = JSON.stringify(loadDiscordAnnouncement());
  }

  // Save scheduled post
  const schedulePath = join(process.cwd(), '.scheduled-posts.json');
  let posts: ScheduledPost[] = [];

  if (existsSync(schedulePath)) {
    posts = JSON.parse(readFileSync(schedulePath, 'utf-8'));
  }

  const newPost: ScheduledPost = {
    id: Date.now().toString(),
    platform: platform as string,
    content,
    scheduledTime: scheduledTime.toISOString(),
    status: 'pending',
  };

  posts.push(newPost);
  writeFileSync(schedulePath, JSON.stringify(posts, null, 2));

  console.log(chalk.green(`\n✓ Post scheduled for ${scheduledTime.toLocaleString()}`));
  console.log(chalk.gray('\nTo post scheduled content, run:'));
  console.log(chalk.cyan('  ferni launch post-scheduled'));
}

export async function postScheduled(): Promise<void> {
  const schedulePath = join(process.cwd(), '.scheduled-posts.json');

  if (!existsSync(schedulePath)) {
    console.log(chalk.yellow('No scheduled posts found.'));
    return;
  }

  const posts: ScheduledPost[] = JSON.parse(readFileSync(schedulePath, 'utf-8'));
  const now = new Date();

  const due = posts.filter((p) => p.status === 'pending' && new Date(p.scheduledTime) <= now);

  if (due.length === 0) {
    console.log(chalk.yellow('No posts due yet.'));

    const pending = posts.filter((p) => p.status === 'pending');
    if (pending.length > 0) {
      console.log(chalk.gray(`\n${pending.length} posts scheduled:`));
      pending.forEach((p) => {
        console.log(chalk.gray(`  • ${p.platform} at ${new Date(p.scheduledTime).toLocaleString()}`));
      });
    }
    return;
  }

  console.log(chalk.bold(`\n📤 Posting ${due.length} scheduled post(s)...\n`));

  for (const post of due) {
    await postSocial(post.platform);
    post.status = 'posted';
  }

  writeFileSync(schedulePath, JSON.stringify(posts, null, 2));
  console.log(chalk.green('\n✓ All due posts processed'));
}
