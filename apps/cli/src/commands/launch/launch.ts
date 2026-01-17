/**
 * ferni launch - Automated launch sequence for Ferni Agent Builder
 *
 * Commands:
 *   ferni launch checklist    - Interactive pre-launch checklist
 *   ferni launch day          - Execute launch day sequence
 *   ferni launch schedule     - Schedule social media posts
 *   ferni launch analytics    - Pull analytics from all platforms
 *   ferni launch content      - Generate marketing content
 *   ferni launch gifs         - Record demo GIFs
 */

import { Command } from 'commander';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { exec, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cliAuth } from '../../lib/cli-auth.js';

const program = new Command();

// ============================================================================
// LAUNCH CHECKLIST
// ============================================================================

interface ChecklistItem {
  id: string;
  label: string;
  category: 'content' | 'technical' | 'social' | 'support';
  required: boolean;
  automated?: () => Promise<boolean>;
}

const LAUNCH_CHECKLIST: ChecklistItem[] = [
  // Content
  { id: 'blog', label: 'Blog post ready (Dev.to)', category: 'content', required: true },
  { id: 'twitter', label: 'Twitter thread drafted', category: 'content', required: true },
  { id: 'linkedin', label: 'LinkedIn post drafted', category: 'content', required: true },
  { id: 'ph', label: 'Product Hunt submission ready', category: 'content', required: true },
  { id: 'hn', label: 'Hacker News post drafted', category: 'content', required: true },
  { id: 'gifs', label: 'Demo GIFs recorded (5)', category: 'content', required: true },
  { id: 'video', label: 'YouTube tutorial recorded', category: 'content', required: false },

  // Technical
  {
    id: 'cli',
    label: 'CLI published to npm',
    category: 'technical',
    required: true,
    automated: async () => {
      try {
        execSync('npm view @ferni/cli version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'docs',
    label: 'Documentation deployed',
    category: 'technical',
    required: true,
    automated: async () => {
      try {
        const res = await fetch('https://developers.ferni.ai/health');
        return res.ok;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'api',
    label: 'API healthy',
    category: 'technical',
    required: true,
    automated: async () => {
      try {
        const res = await fetch('https://api.ferni.ai/health');
        return res.ok;
      } catch {
        return false;
      }
    },
  },
  { id: 'analytics', label: 'Analytics tracking configured', category: 'technical', required: true },

  // Social
  { id: 'supporters', label: '20 supporters briefed for upvotes', category: 'social', required: false },
  { id: 'influencers', label: 'Influencer outreach sent', category: 'social', required: false },
  { id: 'discord', label: 'Discord community notified', category: 'social', required: true },
  { id: 'email', label: 'Email list drafted', category: 'social', required: true },

  // Support
  { id: 'support_team', label: 'Support team briefed', category: 'support', required: true },
  { id: 'faq', label: 'FAQ answers prepared', category: 'support', required: true },
  { id: 'emergency', label: 'Emergency playbook reviewed', category: 'support', required: false },
];

async function runChecklist(): Promise<void> {
  console.log(chalk.bold('\n🚀 Ferni Launch Checklist\n'));

  const checklistFile = join(process.cwd(), '.launch-checklist.json');
  let completed: Record<string, boolean> = {};

  if (existsSync(checklistFile)) {
    completed = JSON.parse(readFileSync(checklistFile, 'utf-8'));
  }

  const categories = ['content', 'technical', 'social', 'support'] as const;

  for (const category of categories) {
    const items = LAUNCH_CHECKLIST.filter((i) => i.category === category);
    console.log(chalk.cyan(`\n${category.toUpperCase()}`));
    console.log(chalk.gray('─'.repeat(40)));

    for (const item of items) {
      let status = completed[item.id] || false;

      // Run automated check if available
      if (item.automated && !status) {
        const spinner = p.spinner();
        spinner.start(`Checking ${item.label}...`);
        status = await item.automated();
        spinner.stop(status ? chalk.green('✓') : chalk.red('✗'));
        completed[item.id] = status;
      }

      const icon = status ? chalk.green('✓') : item.required ? chalk.red('✗') : chalk.yellow('○');
      const label = status ? chalk.dim(item.label) : item.label;
      const req = item.required ? '' : chalk.gray(' (optional)');

      console.log(`  ${icon} ${label}${req}`);
    }
  }

  // Summary
  const total = LAUNCH_CHECKLIST.length;
  const done = Object.values(completed).filter(Boolean).length;
  const required = LAUNCH_CHECKLIST.filter((i) => i.required).length;
  const requiredDone = LAUNCH_CHECKLIST.filter((i) => i.required && completed[i.id]).length;

  console.log(chalk.gray('\n─'.repeat(40)));
  console.log(`\n${chalk.bold('Progress:')} ${done}/${total} complete`);
  console.log(`${chalk.bold('Required:')} ${requiredDone}/${required} complete`);

  if (requiredDone === required) {
    console.log(chalk.green('\n✓ Ready to launch! 🚀'));
  } else {
    console.log(chalk.yellow(`\n⚠ ${required - requiredDone} required items remaining`));
  }

  // Save progress
  writeFileSync(checklistFile, JSON.stringify(completed, null, 2));

  // Interactive mode
  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'mark', label: 'Mark items complete' },
      { value: 'unmark', label: 'Unmark items' },
      { value: 'reset', label: 'Reset checklist' },
      { value: 'exit', label: 'Exit' },
    ],
  });

  if (action === 'mark') {
    const incomplete = LAUNCH_CHECKLIST.filter((i) => !completed[i.id]);
    const toMark = await p.multiselect({
      message: 'Select items to mark complete:',
      options: incomplete.map((i) => ({ value: i.id, label: i.label })),
    });

    if (Array.isArray(toMark)) {
      toMark.forEach((id) => (completed[id as string] = true));
      writeFileSync(checklistFile, JSON.stringify(completed, null, 2));
      console.log(chalk.green(`\n✓ Marked ${toMark.length} items complete`));
    }
  } else if (action === 'reset') {
    writeFileSync(checklistFile, '{}');
    console.log(chalk.yellow('\n✓ Checklist reset'));
  }
}

// ============================================================================
// LAUNCH DAY AUTOMATION
// ============================================================================

interface LaunchStep {
  time: string;
  action: string;
  automated: boolean;
  command?: string;
  manual?: string;
}

const LAUNCH_SEQUENCE: LaunchStep[] = [
  {
    time: '12:01 AM PT',
    action: 'Submit to Product Hunt',
    automated: false,
    manual: 'Open https://producthunt.com/posts/new and submit',
  },
  {
    time: '12:05 AM PT',
    action: 'Post maker comment',
    automated: false,
    manual: 'Copy from docs/marketing/PRODUCT-HUNT-LAUNCH.md',
  },
  {
    time: '6:00 AM PT',
    action: 'Post Twitter thread',
    automated: true,
    command: 'ferni launch post twitter',
  },
  {
    time: '7:00 AM PT',
    action: 'Post LinkedIn',
    automated: true,
    command: 'ferni launch post linkedin',
  },
  {
    time: '8:00 AM PT',
    action: 'Submit Hacker News',
    automated: false,
    manual: 'Open https://news.ycombinator.com/submit',
  },
  {
    time: '9:00 AM PT',
    action: 'Send email blast',
    automated: true,
    command: 'ferni launch email send',
  },
  {
    time: '10:00 AM PT',
    action: 'Discord announcement',
    automated: true,
    command: 'ferni launch discord announce',
  },
];

async function runLaunchDay(): Promise<void> {
  console.log(chalk.bold('\n🚀 LAUNCH DAY SEQUENCE\n'));
  console.log(chalk.gray('This will guide you through the launch day timeline.\n'));

  const now = new Date();
  console.log(chalk.dim(`Current time: ${now.toLocaleTimeString()}\n`));

  for (let i = 0; i < LAUNCH_SEQUENCE.length; i++) {
    const step = LAUNCH_SEQUENCE[i];
    const num = chalk.cyan(`[${i + 1}/${LAUNCH_SEQUENCE.length}]`);
    const time = chalk.yellow(step.time);

    console.log(`${num} ${time} - ${step.action}`);

    if (step.automated && step.command) {
      console.log(chalk.gray(`    Command: ${step.command}`));
    } else {
      console.log(chalk.gray(`    Manual: ${step.manual}`));
    }

    const action = await p.select({
      message: `${step.action}:`,
      options: [
        { value: 'execute', label: step.automated ? 'Execute now' : 'Mark complete' },
        { value: 'skip', label: 'Skip for now' },
        { value: 'abort', label: 'Abort launch sequence' },
      ],
    });

    if (action === 'abort') {
      console.log(chalk.red('\n✗ Launch sequence aborted'));
      return;
    }

    if (action === 'execute') {
      if (step.automated && step.command) {
        const spinner = p.spinner();
        spinner.start(`Executing ${step.action}...`);
        try {
          execSync(step.command, { stdio: 'pipe' });
          spinner.stop(chalk.green('✓ Complete'));
        } catch (error) {
          spinner.stop(chalk.red('✗ Failed'));
          console.log(chalk.red(`    Error: ${(error as Error).message}`));
        }
      } else {
        console.log(chalk.green('    ✓ Marked complete'));
      }
    } else {
      console.log(chalk.yellow('    ○ Skipped'));
    }

    console.log('');
  }

  console.log(chalk.green.bold('\n🎉 Launch sequence complete!\n'));
  console.log(chalk.gray('Remember to:'));
  console.log(chalk.gray('  • Respond to ALL comments within 1 hour'));
  console.log(chalk.gray('  • Thank upvoters on Twitter'));
  console.log(chalk.gray('  • Monitor error rates'));
}

// ============================================================================
// SOCIAL MEDIA SCHEDULING
// ============================================================================

interface ScheduledPost {
  platform: 'twitter' | 'linkedin' | 'discord';
  content: string;
  scheduledTime: Date;
  media?: string[];
}

async function scheduleContent(): Promise<void> {
  console.log(chalk.bold('\n📅 Schedule Social Media Posts\n'));

  const platform = await p.select({
    message: 'Select platform:',
    options: [
      { value: 'twitter', label: '🐦 Twitter' },
      { value: 'linkedin', label: '💼 LinkedIn' },
      { value: 'all', label: '📢 All platforms' },
    ],
  });

  const timing = await p.select({
    message: 'When to post:',
    options: [
      { value: 'now', label: 'Now' },
      { value: 'optimal', label: 'Optimal time (9 AM PT tomorrow)' },
      { value: 'launch', label: 'Launch day sequence' },
      { value: 'custom', label: 'Custom time' },
    ],
  });

  let scheduledTime = new Date();

  if (timing === 'optimal') {
    // Next 9 AM PT
    scheduledTime = new Date();
    scheduledTime.setHours(9, 0, 0, 0);
    if (scheduledTime < new Date()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
  } else if (timing === 'custom') {
    const dateStr = await p.text({
      message: 'Enter date/time (YYYY-MM-DD HH:MM):',
      placeholder: '2024-01-15 09:00',
    });
    if (typeof dateStr === 'string') {
      scheduledTime = new Date(dateStr);
    }
  }

  const contentSource = await p.select({
    message: 'Content source:',
    options: [
      { value: 'thread', label: 'Launch thread (from TWITTER-LAUNCH.md)' },
      { value: 'single', label: 'Single post' },
      { value: 'custom', label: 'Custom content' },
    ],
  });

  let content = '';

  if (contentSource === 'thread') {
    const threadFile = join(process.cwd(), 'docs/marketing/TWITTER-LAUNCH.md');
    if (existsSync(threadFile)) {
      content = readFileSync(threadFile, 'utf-8');
      // Extract first tweet from markdown
      const match = content.match(/### Tweet 1[\s\S]*?```\n([\s\S]*?)```/);
      if (match) {
        content = match[1].trim();
      }
    }
  } else if (contentSource === 'custom') {
    const customContent = await p.text({
      message: 'Enter your post:',
      placeholder: 'Your post content...',
    });
    if (typeof customContent === 'string') {
      content = customContent;
    }
  }

  console.log(chalk.gray('\n─'.repeat(40)));
  console.log(chalk.cyan('Preview:'));
  console.log(content.substring(0, 280));
  console.log(chalk.gray('─'.repeat(40)));

  const confirm = await p.confirm({
    message: `Schedule for ${scheduledTime.toLocaleString()}?`,
  });

  if (confirm) {
    // Save to scheduled posts file
    const scheduleFile = join(process.cwd(), '.scheduled-posts.json');
    let posts: ScheduledPost[] = [];

    if (existsSync(scheduleFile)) {
      posts = JSON.parse(readFileSync(scheduleFile, 'utf-8'));
    }

    posts.push({
      platform: platform as 'twitter' | 'linkedin',
      content,
      scheduledTime,
    });

    writeFileSync(scheduleFile, JSON.stringify(posts, null, 2));

    console.log(chalk.green('\n✓ Post scheduled!'));
    console.log(chalk.gray(`  Run 'ferni launch post' at the scheduled time to publish.`));
  }
}

// ============================================================================
// ANALYTICS DASHBOARD
// ============================================================================

interface AnalyticsData {
  npm: {
    downloads: number;
    weeklyDownloads: number;
  };
  github: {
    stars: number;
    forks: number;
    issues: number;
  };
  website: {
    visitors: number;
    signups: number;
  };
  productHunt?: {
    rank: number;
    upvotes: number;
  };
}

async function showAnalytics(): Promise<void> {
  console.log(chalk.bold('\n📊 Launch Analytics Dashboard\n'));

  const spinner = p.spinner();
  spinner.start('Fetching analytics...');

  const analytics: AnalyticsData = {
    npm: { downloads: 0, weeklyDownloads: 0 },
    github: { stars: 0, forks: 0, issues: 0 },
    website: { visitors: 0, signups: 0 },
  };

  try {
    // npm downloads
    const npmRes = await fetch('https://api.npmjs.org/downloads/point/last-week/@ferni/cli');
    if (npmRes.ok) {
      const data = await npmRes.json();
      analytics.npm.weeklyDownloads = data.downloads || 0;
    }
  } catch {
    // Ignore errors
  }

  try {
    // GitHub stats
    const ghRes = await fetch('https://api.github.com/repos/ferni-ai/agent-builder');
    if (ghRes.ok) {
      const data = await ghRes.json();
      analytics.github.stars = data.stargazers_count || 0;
      analytics.github.forks = data.forks_count || 0;
      analytics.github.issues = data.open_issues_count || 0;
    }
  } catch {
    // Ignore errors
  }

  try {
    // Ferni API stats
    const apiRes = await cliAuth.apiRequest('/api/analytics/launch');
    if (apiRes.ok) {
      const data = await apiRes.json();
      analytics.website = data.website || analytics.website;
      analytics.npm.downloads = data.npmDownloads || 0;
    }
  } catch {
    // Ignore errors
  }

  spinner.stop('Done');

  // Display dashboard
  console.log(chalk.cyan('\n📦 npm'));
  console.log(`   Weekly downloads: ${chalk.bold(analytics.npm.weeklyDownloads.toLocaleString())}`);

  console.log(chalk.cyan('\n⭐ GitHub'));
  console.log(`   Stars: ${chalk.bold(analytics.github.stars.toLocaleString())}`);
  console.log(`   Forks: ${chalk.bold(analytics.github.forks.toLocaleString())}`);
  console.log(`   Open issues: ${chalk.bold(analytics.github.issues.toLocaleString())}`);

  console.log(chalk.cyan('\n🌐 Website'));
  console.log(`   Visitors: ${chalk.bold(analytics.website.visitors.toLocaleString())}`);
  console.log(`   Sign-ups: ${chalk.bold(analytics.website.signups.toLocaleString())}`);

  if (analytics.productHunt) {
    console.log(chalk.cyan('\n🏆 Product Hunt'));
    console.log(`   Rank: #${chalk.bold(analytics.productHunt.rank)}`);
    console.log(`   Upvotes: ${chalk.bold(analytics.productHunt.upvotes.toLocaleString())}`);
  }

  // Targets comparison
  console.log(chalk.gray('\n─'.repeat(40)));
  console.log(chalk.bold('\n📈 vs Launch Day Targets\n'));

  const targets = {
    npmInstalls: 500,
    websiteVisits: 5000,
    signups: 200,
  };

  const npmPct = Math.round((analytics.npm.weeklyDownloads / targets.npmInstalls) * 100);
  const visitsPct = Math.round((analytics.website.visitors / targets.websiteVisits) * 100);
  const signupsPct = Math.round((analytics.website.signups / targets.signups) * 100);

  console.log(`   npm installs:  ${progressBar(npmPct)} ${npmPct}% of ${targets.npmInstalls}`);
  console.log(`   Website visits: ${progressBar(visitsPct)} ${visitsPct}% of ${targets.websiteVisits}`);
  console.log(`   Sign-ups:      ${progressBar(signupsPct)} ${signupsPct}% of ${targets.signups}`);
}

function progressBar(pct: number): string {
  const filled = Math.min(Math.round(pct / 5), 20);
  const empty = 20 - filled;
  const color = pct >= 100 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled) + '░'.repeat(empty));
}

// ============================================================================
// CONTENT GENERATION
// ============================================================================

async function generateContent(): Promise<void> {
  console.log(chalk.bold('\n✍️ Generate Marketing Content\n'));

  const contentType = await p.select({
    message: 'What would you like to generate?',
    options: [
      { value: 'changelog', label: '📝 Changelog from git history' },
      { value: 'release', label: '🚀 Release notes' },
      { value: 'tweet', label: '🐦 Tweet from changelog' },
      { value: 'newsletter', label: '📧 Newsletter draft' },
    ],
  });

  if (contentType === 'changelog') {
    await generateChangelog();
  } else if (contentType === 'release') {
    await generateReleaseNotes();
  } else if (contentType === 'tweet') {
    await generateTweetFromChangelog();
  } else if (contentType === 'newsletter') {
    await generateNewsletter();
  }
}

async function generateChangelog(): Promise<void> {
  const spinner = p.spinner();
  spinner.start('Analyzing git history...');

  try {
    // Get recent commits
    const commits = execSync('git log --oneline -20 --format="%s"', { encoding: 'utf-8' })
      .trim()
      .split('\n');

    spinner.stop('Done');

    // Categorize commits
    const features: string[] = [];
    const fixes: string[] = [];
    const other: string[] = [];

    commits.forEach((commit) => {
      const lower = commit.toLowerCase();
      if (lower.includes('feat') || lower.includes('add')) {
        features.push(commit);
      } else if (lower.includes('fix') || lower.includes('bug')) {
        fixes.push(commit);
      } else {
        other.push(commit);
      }
    });

    console.log(chalk.cyan('\n## Changelog\n'));

    if (features.length > 0) {
      console.log(chalk.bold('### ✨ New Features'));
      features.forEach((f) => console.log(`- ${f}`));
      console.log('');
    }

    if (fixes.length > 0) {
      console.log(chalk.bold('### 🐛 Bug Fixes'));
      fixes.forEach((f) => console.log(`- ${f}`));
      console.log('');
    }

    const save = await p.confirm({
      message: 'Save to CHANGELOG.md?',
    });

    if (save) {
      const content = [
        `# Changelog`,
        ``,
        `## [Unreleased] - ${new Date().toISOString().split('T')[0]}`,
        ``,
        features.length > 0 ? `### ✨ New Features\n${features.map((f) => `- ${f}`).join('\n')}\n` : '',
        fixes.length > 0 ? `### 🐛 Bug Fixes\n${fixes.map((f) => `- ${f}`).join('\n')}\n` : '',
      ].join('\n');

      writeFileSync('CHANGELOG.md', content);
      console.log(chalk.green('\n✓ Saved to CHANGELOG.md'));
    }
  } catch (error) {
    spinner.stop('Failed');
    console.log(chalk.red(`Error: ${(error as Error).message}`));
  }
}

async function generateReleaseNotes(): Promise<void> {
  const version = await p.text({
    message: 'Version number:',
    placeholder: '1.0.0',
  });

  const highlights = await p.text({
    message: 'Key highlights (comma-separated):',
    placeholder: 'New CLI, faster builds, better docs',
  });

  if (typeof version !== 'string' || typeof highlights !== 'string') return;

  const highlightList = highlights.split(',').map((h) => h.trim());

  const releaseNotes = `
# 🚀 Ferni Agent Builder v${version}

We're excited to announce v${version}!

## Highlights

${highlightList.map((h) => `- ${h}`).join('\n')}

## Getting Started

\`\`\`bash
npm install -g @ferni/cli@${version}
ferni agent init my-agent
\`\`\`

## Documentation

Full docs: https://developers.ferni.ai

## Feedback

Questions? Join our Discord: https://discord.gg/ferni

---

*Thanks to all contributors who made this release possible!*
`;

  console.log(chalk.gray('\n─'.repeat(40)));
  console.log(releaseNotes);
  console.log(chalk.gray('─'.repeat(40)));

  const save = await p.confirm({
    message: 'Save to release-notes.md?',
  });

  if (save) {
    writeFileSync('release-notes.md', releaseNotes);
    console.log(chalk.green('\n✓ Saved to release-notes.md'));
  }
}

async function generateTweetFromChangelog(): Promise<void> {
  // Read changelog
  if (!existsSync('CHANGELOG.md')) {
    console.log(chalk.yellow('No CHANGELOG.md found. Run changelog generator first.'));
    return;
  }

  const changelog = readFileSync('CHANGELOG.md', 'utf-8');

  // Extract features
  const featuresMatch = changelog.match(/### ✨ New Features\n([\s\S]*?)(\n###|$)/);
  const features = featuresMatch ? featuresMatch[1].trim().split('\n').slice(0, 3) : [];

  const tweet = `
🚀 New in Ferni CLI:

${features.map((f) => `✨ ${f.replace('- ', '')}`).join('\n')}

Try it:
npm install -g @ferni/cli

#buildinpublic #voiceai
`.trim();

  console.log(chalk.cyan('\nGenerated tweet:\n'));
  console.log(tweet);
  console.log(chalk.gray(`\n(${tweet.length}/280 characters)`));

  // Copy to clipboard (macOS)
  try {
    execSync(`echo "${tweet}" | pbcopy`, { stdio: 'pipe' });
    console.log(chalk.green('\n✓ Copied to clipboard'));
  } catch {
    // Ignore if not on macOS
  }
}

async function generateNewsletter(): Promise<void> {
  const subject = await p.text({
    message: 'Email subject:',
    placeholder: "What's new in Ferni",
  });

  if (typeof subject !== 'string') return;

  const newsletter = `
Subject: ${subject}

---

Hey there! 👋

Quick update on what we've been building:

## This Week

[Add highlights here]

## Coming Soon

[Add roadmap items]

## From the Community

[Add user stories]

---

Questions? Just reply to this email.

Cheers,
The Ferni Team

---
Unsubscribe: {unsubscribe_link}
`;

  console.log(chalk.cyan('\nNewsletter draft:\n'));
  console.log(newsletter);

  const save = await p.confirm({
    message: 'Save to newsletter-draft.md?',
  });

  if (save) {
    writeFileSync('newsletter-draft.md', newsletter);
    console.log(chalk.green('\n✓ Saved to newsletter-draft.md'));
  }
}

// ============================================================================
// GIF RECORDING
// ============================================================================

async function recordGifs(): Promise<void> {
  console.log(chalk.bold('\n🎬 Record Demo GIFs\n'));

  // Check for required tools
  const hasAsciinema = checkCommand('asciinema');
  const hasSvgTerm = checkCommand('svg-term');

  if (!hasAsciinema) {
    console.log(chalk.yellow('⚠ asciinema not found. Install with: brew install asciinema'));
  }

  if (!hasSvgTerm) {
    console.log(chalk.yellow('⚠ svg-term-cli not found. Install with: npm install -g svg-term-cli'));
  }

  const gifs = [
    { name: 'three-commands', description: 'Hero GIF - init/preview/publish', duration: 15 },
    { name: 'wizard', description: 'Interactive creation wizard', duration: 20 },
    { name: 'hot-reload', description: 'Edit file, see change instantly', duration: 12 },
    { name: 'voice-demo', description: 'Actual voice conversation', duration: 10 },
    { name: 'deploy', description: 'One-click production deploy', duration: 15 },
  ];

  console.log(chalk.cyan('GIFs to record:\n'));
  gifs.forEach((gif, i) => {
    const status = existsSync(`assets/gifs/${gif.name}.gif`) ? chalk.green('✓') : chalk.gray('○');
    console.log(`  ${status} ${i + 1}. ${gif.name} (${gif.duration}s) - ${gif.description}`);
  });

  const selection = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'record', label: 'Record a GIF' },
      { value: 'script', label: 'View recording scripts' },
      { value: 'convert', label: 'Convert .cast to .gif' },
    ],
  });

  if (selection === 'record') {
    const gifToRecord = await p.select({
      message: 'Which GIF?',
      options: gifs.map((g, i) => ({
        value: i.toString(),
        label: `${g.name} - ${g.description}`,
      })),
    });

    const gif = gifs[parseInt(gifToRecord as string)];

    console.log(chalk.cyan(`\nRecording: ${gif.name}`));
    console.log(chalk.gray(`Duration target: ${gif.duration}s`));
    console.log(chalk.gray('\nTips:'));
    console.log(chalk.gray('  • Type deliberately, not too fast'));
    console.log(chalk.gray('  • Pause after commands complete'));
    console.log(chalk.gray('  • Press Ctrl+D or type "exit" to stop\n'));

    const ready = await p.confirm({
      message: 'Ready to record?',
    });

    if (ready && hasAsciinema) {
      mkdirSync('assets/gifs', { recursive: true });
      const castFile = `assets/gifs/${gif.name}.cast`;

      console.log(chalk.yellow('\n🔴 Recording started...\n'));

      try {
        execSync(`asciinema rec ${castFile}`, { stdio: 'inherit' });
        console.log(chalk.green(`\n✓ Saved to ${castFile}`));

        if (hasSvgTerm) {
          const convert = await p.confirm({
            message: 'Convert to GIF now?',
          });

          if (convert) {
            const svgFile = `assets/gifs/${gif.name}.svg`;
            execSync(`svg-term --in ${castFile} --out ${svgFile} --window`, { stdio: 'inherit' });
            console.log(chalk.green(`✓ Saved to ${svgFile}`));
            console.log(chalk.gray('  Convert SVG to GIF with: https://ezgif.com/svg-to-gif'));
          }
        }
      } catch (error) {
        console.log(chalk.red(`Error: ${(error as Error).message}`));
      }
    }
  } else if (selection === 'script') {
    // Show scripts from VIDEO-SCRIPTS.md
    const scriptsFile = join(process.cwd(), 'docs/marketing/VIDEO-SCRIPTS.md');
    if (existsSync(scriptsFile)) {
      const content = readFileSync(scriptsFile, 'utf-8');
      console.log(chalk.cyan('\n─'.repeat(40)));
      console.log(content.substring(0, 2000) + '...');
      console.log(chalk.cyan('─'.repeat(40)));
      console.log(chalk.gray('\nFull scripts in: docs/marketing/VIDEO-SCRIPTS.md'));
    }
  } else if (selection === 'convert') {
    // List .cast files
    const castFiles = execSync('ls assets/gifs/*.cast 2>/dev/null || true', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (castFiles.length === 0) {
      console.log(chalk.yellow('No .cast files found. Record a GIF first.'));
      return;
    }

    const fileToConvert = await p.select({
      message: 'Select file to convert:',
      options: castFiles.map((f) => ({ value: f, label: f })),
    });

    if (typeof fileToConvert === 'string' && hasSvgTerm) {
      const svgFile = fileToConvert.replace('.cast', '.svg');
      execSync(`svg-term --in ${fileToConvert} --out ${svgFile} --window`, { stdio: 'inherit' });
      console.log(chalk.green(`✓ Saved to ${svgFile}`));
    }
  }
}

function checkCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// MAIN COMMAND
// ============================================================================

program
  .name('ferni launch')
  .description('Automated launch sequence for Ferni Agent Builder')
  .version('1.0.0');

program
  .command('checklist')
  .description('Interactive pre-launch checklist')
  .action(runChecklist);

program
  .command('day')
  .description('Execute launch day sequence')
  .action(runLaunchDay);

program
  .command('schedule')
  .description('Schedule social media posts')
  .action(scheduleContent);

program
  .command('analytics')
  .description('Show launch analytics dashboard')
  .action(showAnalytics);

program
  .command('content')
  .description('Generate marketing content')
  .action(generateContent);

program
  .command('gifs')
  .description('Record demo GIFs')
  .action(recordGifs);

// Default action - show menu
program.action(async () => {
  console.log(chalk.bold('\n🚀 Ferni Launch Automation\n'));

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'checklist', label: '📋 Pre-launch checklist' },
      { value: 'day', label: '🚀 Launch day sequence' },
      { value: 'schedule', label: '📅 Schedule posts' },
      { value: 'analytics', label: '📊 Analytics dashboard' },
      { value: 'content', label: '✍️ Generate content' },
      { value: 'gifs', label: '🎬 Record GIFs' },
    ],
  });

  switch (action) {
    case 'checklist':
      await runChecklist();
      break;
    case 'day':
      await runLaunchDay();
      break;
    case 'schedule':
      await scheduleContent();
      break;
    case 'analytics':
      await showAnalytics();
      break;
    case 'content':
      await generateContent();
      break;
    case 'gifs':
      await recordGifs();
      break;
  }
});

export { program as launchCommand };
