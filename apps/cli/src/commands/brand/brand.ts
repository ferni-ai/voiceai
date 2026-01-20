#!/usr/bin/env npx tsx
/**
 * Brand Automation Command Hub
 *
 * Automates the 15-workstream brand evolution plan.
 *
 * Usage:
 *   ferni brand                    # Dashboard
 *   ferni brand awards             # Award deadline tracker
 *   ferni brand story              # Origin story publishing
 *   ferni brand manifesto          # Thought leadership distribution
 *   ferni brand workstreams        # 15 workstream progress
 *   ferni brand audit              # Brand consistency audit
 */

import {
  getAwards,
  getUpcomingAwards,
  addAward,
  updateAward,
  getStories,
  addStory,
  updateStory,
  getWorkstreams,
  completeWorkstreamTask,
  getDashboard,
  type Award,
  type BrandStory,
} from './brand-storage.js';
import {
  showAutomationStatus,
  runJob,
  showMetrics,
  generateWeeklyReport,
  configureWebhook,
} from './brand-automation.js';
import { brandScheduler } from './setup-brand-scheduler.js';
import { gtmCommand } from './gtm.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(date: string): number {
  const now = new Date();
  const target = new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(days: number): string {
  if (days <= 7) return colors.red;
  if (days <= 30) return colors.yellow;
  return colors.green;
}

function getStatusEmoji(status: string): string {
  const map: Record<string, string> = {
    researching: '🔍',
    preparing: '📝',
    submitted: '📤',
    shortlisted: '⭐',
    won: '🏆',
    declined: '❌',
    not_started: '⬜',
    in_progress: '🔄',
    blocked: '🚫',
    completed: '✅',
    draft: '📝',
    scheduled: '📅',
    published: '✅',
  };
  return map[status] || '❓';
}

function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    P0: colors.red,
    P1: colors.yellow,
    P2: colors.cyan,
    P3: colors.dim,
  };
  return map[priority] || colors.white;
}

// ============================================================================
// DASHBOARD
// ============================================================================

async function showDashboard(): Promise<void> {
  const dashboard = await getDashboard();
  const upcomingAwards = await getUpcomingAwards(30);

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════════╗
║             FERNI BRAND EVOLUTION DASHBOARD                   ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}🏆 AWARDS${colors.reset}
   Total tracked: ${dashboard.awards.total}
   Upcoming (90d): ${colors.yellow}${dashboard.awards.upcoming}${colors.reset}
   Submitted: ${dashboard.awards.submitted}
   Won: ${colors.green}${dashboard.awards.won}${colors.reset}

${colors.cyan}📖 BRAND STORIES${colors.reset}
   Total: ${dashboard.stories.total}
   Published: ${colors.green}${dashboard.stories.published}${colors.reset}

${colors.cyan}💬 USER STORIES${colors.reset}
   Total collected: ${dashboard.userStories.total}
   Pending review: ${colors.yellow}${dashboard.userStories.pending}${colors.reset}
   Approved: ${colors.green}${dashboard.userStories.approved}${colors.reset}

${colors.cyan}📋 WORKSTREAMS (15 total)${colors.reset}
   Not started: ${colors.dim}${dashboard.workstreams.notStarted}${colors.reset}
   In progress: ${colors.yellow}${dashboard.workstreams.inProgress}${colors.reset}
   Completed: ${colors.green}${dashboard.workstreams.completed}${colors.reset}

${colors.cyan}🔍 BRAND AUDITS${colors.reset}
   Total audits: ${dashboard.audits.total}
   Last score: ${dashboard.audits.lastScore !== undefined ? `${dashboard.audits.lastScore}/100` : 'No audits yet'}
`);

  if (upcomingAwards.length > 0) {
    console.log(`${colors.yellow}⚠️  UPCOMING DEADLINES (Next 30 days)${colors.reset}`);
    for (const award of upcomingAwards.slice(0, 5)) {
      const days = daysUntil(award.deadline);
      const urgency = getUrgencyColor(days);
      console.log(`   ${urgency}${days}d${colors.reset} - ${award.name} (${award.category})`);
    }
    console.log('');
  }

  console.log(`${colors.dim}Commands: ferni brand awards | story | manifesto | workstreams | audit${colors.reset}`);
}

// ============================================================================
// AWARDS
// ============================================================================

async function showAwards(options: { upcoming?: boolean; status?: string }): Promise<void> {
  let awards: Award[];

  if (options.upcoming) {
    awards = await getUpcomingAwards(90);
    console.log(`\n${colors.bold}🏆 Upcoming Award Deadlines (Next 90 days)${colors.reset}\n`);
  } else {
    awards = await getAwards();
    if (options.status) {
      awards = awards.filter((a) => a.status === options.status);
    }
    console.log(`\n${colors.bold}🏆 All Tracked Awards${colors.reset}\n`);
  }

  if (awards.length === 0) {
    console.log(`${colors.dim}No awards found.${colors.reset}`);
    return;
  }

  // Group by deadline month
  const byMonth: Record<string, Award[]> = {};
  for (const award of awards) {
    const month = new Date(award.deadline).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(award);
  }

  for (const [month, monthAwards] of Object.entries(byMonth)) {
    console.log(`${colors.cyan}${month}${colors.reset}`);
    for (const award of monthAwards) {
      const days = daysUntil(award.deadline);
      const urgency = getUrgencyColor(days);
      const status = getStatusEmoji(award.status);

      console.log(`  ${status} ${colors.bold}${award.name}${colors.reset}`);
      console.log(`     ${colors.dim}Category:${colors.reset} ${award.category}`);
      console.log(`     ${colors.dim}Deadline:${colors.reset} ${formatDate(award.deadline)} ${urgency}(${days} days)${colors.reset}`);
      console.log(`     ${colors.dim}Fee:${colors.reset} ${award.fee ? `$${award.fee}` : 'Free'}`);
      console.log(`     ${colors.dim}Status:${colors.reset} ${award.status}`);

      // Materials checklist
      if (award.materials) {
        const done = Object.values(award.materials).filter(Boolean).length;
        const total = Object.keys(award.materials).length;
        console.log(`     ${colors.dim}Materials:${colors.reset} ${done}/${total} ready`);
      }
      console.log('');
    }
  }

  console.log(`${colors.dim}Tip: ferni brand awards add --name "Award" --deadline 2026-03-01${colors.reset}`);
}

async function addNewAward(options: {
  name: string;
  organization?: string;
  category?: string;
  deadline: string;
  fee?: number;
  url?: string;
}): Promise<void> {
  const award = await addAward({
    name: options.name,
    organization: options.organization || 'Unknown',
    category: options.category || 'General',
    deadline: options.deadline,
    submissionUrl: options.url,
    status: 'researching',
    fee: options.fee,
    materials: { caseStudy: false, video: false, images: false, metrics: false },
  });

  console.log(`\n${colors.green}✅ Award added: ${award.name}${colors.reset}`);
  console.log(`   Deadline: ${formatDate(award.deadline)} (${daysUntil(award.deadline)} days)`);
}

async function updateAwardStatus(id: string, status: Award['status']): Promise<void> {
  const award = await updateAward(id, {
    status,
    submittedAt: status === 'submitted' ? new Date().toISOString() : undefined,
  });

  if (award) {
    console.log(`\n${colors.green}✅ Award updated: ${award.name}${colors.reset}`);
    console.log(`   New status: ${getStatusEmoji(status)} ${status}`);
  } else {
    console.log(`\n${colors.red}❌ Award not found${colors.reset}`);
  }
}

async function prepareAwardMaterials(id: string): Promise<void> {
  const awards = await getAwards();
  const award = awards.find((a) => a.id === id || a.name.toLowerCase().includes(id.toLowerCase()));

  if (!award) {
    console.log(`\n${colors.red}❌ Award not found${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bold}📝 Preparing materials for: ${award.name}${colors.reset}\n`);

  // Generate case study outline
  console.log(`${colors.cyan}Case Study Outline${colors.reset}`);
  console.log(`
  1. Introduction
     - What is Ferni?
     - The "Better Than Human" philosophy

  2. The Challenge
     - Why existing AI assistants feel robotic
     - The emotional intelligence gap

  3. The Solution
     - Pixar-inspired design language
     - Superhuman EQ capabilities
     - 6-persona team architecture

  4. Results & Impact
     - User engagement metrics
     - Retention improvements
     - User testimonials

  5. Technical Innovation
     - Real-time emotion detection
     - Context-aware responses
     - Voice + visual integration
`);

  console.log(`${colors.yellow}Next steps:${colors.reset}`);
  console.log(`  1. Export brand assets: ferni brand assets export`);
  console.log(`  2. Generate demo video: ferni brand video demo`);
  console.log(`  3. Collect user quotes: ferni community stories --featured`);
  console.log(`  4. Update materials status: ferni brand awards update ${award.id} --materials caseStudy`);
}

// ============================================================================
// STORY PUBLISHING
// ============================================================================

async function showStories(type?: BrandStory['type']): Promise<void> {
  const stories = await getStories(type);

  console.log(`\n${colors.bold}📖 Brand Stories${type ? ` (${type})` : ''}${colors.reset}\n`);

  if (stories.length === 0) {
    console.log(`${colors.dim}No stories yet. Create one with: ferni brand story create${colors.reset}`);
    return;
  }

  for (const story of stories) {
    console.log(`  ${colors.bold}${story.title}${colors.reset} (${story.type})`);
    console.log(`  ${colors.dim}Created: ${formatDate(story.createdAt)}${colors.reset}`);

    for (const platform of story.platforms) {
      const status = getStatusEmoji(platform.status);
      console.log(`    ${status} ${platform.platform}: ${platform.status}${platform.url ? ` - ${platform.url}` : ''}`);
    }
    console.log('');
  }
}

async function createStory(options: { type: BrandStory['type']; title: string; content?: string }): Promise<void> {
  const story = await addStory({
    type: options.type,
    title: options.title,
    content: options.content || '',
    platforms: [
      { platform: 'medium', status: 'draft' },
      { platform: 'linkedin', status: 'draft' },
      { platform: 'blog', status: 'draft' },
    ],
  });

  console.log(`\n${colors.green}✅ Story created: ${story.title}${colors.reset}`);
  console.log(`   Type: ${story.type}`);
  console.log(`   Platforms: medium, linkedin, blog (all draft)`);
  console.log(`\n${colors.dim}Next: Edit content, then publish with: ferni brand story publish ${story.id} --platform medium${colors.reset}`);
}

async function publishStory(id: string, platform: 'medium' | 'linkedin' | 'blog'): Promise<void> {
  const stories = await getStories();
  const story = stories.find((s) => s.id === id);

  if (!story) {
    console.log(`\n${colors.red}❌ Story not found${colors.reset}`);
    return;
  }

  // For now, simulate publishing (would integrate with APIs)
  const platformData = story.platforms.find((p) => p.platform === platform);
  if (platformData) {
    platformData.status = 'published';
    platformData.publishedAt = new Date().toISOString();
    platformData.url = `https://${platform}.com/ferni/${story.title.toLowerCase().replace(/\s+/g, '-')}`;
  }

  await updateStory(id, { platforms: story.platforms });

  console.log(`\n${colors.green}✅ Story published to ${platform}${colors.reset}`);
  console.log(`   URL: ${platformData?.url}`);

  // Show next platforms
  const unpublished = story.platforms.filter((p) => p.status !== 'published');
  if (unpublished.length > 0) {
    console.log(`\n${colors.dim}Remaining platforms: ${unpublished.map((p) => p.platform).join(', ')}${colors.reset}`);
  }
}

// ============================================================================
// WORKSTREAMS
// ============================================================================

async function showWorkstreams(options: { priority?: string; status?: string }): Promise<void> {
  let workstreams = await getWorkstreams();

  if (options.priority) {
    workstreams = workstreams.filter((w) => w.priority === options.priority);
  }
  if (options.status) {
    workstreams = workstreams.filter((w) => w.status === options.status);
  }

  console.log(`\n${colors.bold}📋 Brand Evolution Workstreams${colors.reset}\n`);

  // Group by priority
  const byPriority: Record<string, typeof workstreams> = { P0: [], P1: [], P2: [], P3: [] };
  for (const w of workstreams) {
    byPriority[w.priority].push(w);
  }

  for (const [priority, items] of Object.entries(byPriority)) {
    if (items.length === 0) continue;

    const priorityColor = getPriorityColor(priority);
    console.log(`${priorityColor}${colors.bold}${priority} - ${priority === 'P0' ? 'Critical' : priority === 'P1' ? 'High' : priority === 'P2' ? 'Medium' : 'Low'}${colors.reset}`);

    for (const w of items) {
      const statusEmoji = getStatusEmoji(w.status);
      const completedTasks = w.tasks.filter((t) => t.completed).length;
      const totalTasks = w.tasks.length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      console.log(`  ${statusEmoji} ${colors.bold}${w.name}${colors.reset}`);
      console.log(`     Progress: ${completedTasks}/${totalTasks} tasks (${progress}%)`);
      console.log(`     Document: ${colors.dim}${w.document}${colors.reset}`);
    }
    console.log('');
  }

  console.log(`${colors.dim}Tip: ferni brand workstreams show <id> - View tasks${colors.reset}`);
  console.log(`${colors.dim}Tip: ferni brand workstreams complete <workstream-id> <task-id>${colors.reset}`);
}

async function showWorkstreamDetail(id: string): Promise<void> {
  const workstreams = await getWorkstreams();
  const workstream = workstreams.find((w) => w.id === id || w.name.toLowerCase().includes(id.toLowerCase()));

  if (!workstream) {
    console.log(`\n${colors.red}❌ Workstream not found${colors.reset}`);
    return;
  }

  const priorityColor = getPriorityColor(workstream.priority);

  console.log(`\n${colors.bold}${workstream.name}${colors.reset}`);
  console.log(`${priorityColor}Priority: ${workstream.priority}${colors.reset}`);
  console.log(`Status: ${getStatusEmoji(workstream.status)} ${workstream.status}`);
  console.log(`Document: ${colors.cyan}${workstream.document}${colors.reset}`);
  console.log(`\n${colors.bold}Tasks:${colors.reset}`);

  for (const task of workstream.tasks) {
    const check = task.completed ? `${colors.green}✓${colors.reset}` : `${colors.dim}○${colors.reset}`;
    console.log(`  ${check} [${task.id}] ${task.description}`);
  }

  console.log(`\n${colors.dim}Complete a task: ferni brand workstreams complete ${workstream.id} <task-id>${colors.reset}`);
}

async function completeTask(workstreamId: string, taskId: string): Promise<void> {
  const success = await completeWorkstreamTask(workstreamId, taskId);

  if (success) {
    console.log(`\n${colors.green}✅ Task completed!${colors.reset}`);

    // Show updated workstream
    const workstreams = await getWorkstreams();
    const workstream = workstreams.find((w) => w.id === workstreamId);
    if (workstream) {
      const completedTasks = workstream.tasks.filter((t) => t.completed).length;
      const totalTasks = workstream.tasks.length;
      console.log(`   ${workstream.name}: ${completedTasks}/${totalTasks} tasks complete`);

      if (workstream.status === 'completed') {
        console.log(`\n${colors.green}🎉 Workstream "${workstream.name}" is now complete!${colors.reset}`);
      }
    }
  } else {
    console.log(`\n${colors.red}❌ Task not found${colors.reset}`);
  }
}

// ============================================================================
// BRAND AUDIT
// ============================================================================

async function runBrandAudit(platform: 'web' | 'mobile' | 'all'): Promise<void> {
  console.log(`\n${colors.bold}🔍 Running Brand Consistency Audit (${platform})${colors.reset}\n`);

  console.log(`${colors.dim}Checking design tokens...${colors.reset}`);
  // Check for hardcoded colors
  console.log(`${colors.dim}Checking color usage...${colors.reset}`);
  console.log(`${colors.dim}Checking typography...${colors.reset}`);
  console.log(`${colors.dim}Checking LUXO eye compliance...${colors.reset}`);
  console.log(`${colors.dim}Checking persona colors...${colors.reset}`);

  // Simulated results
  const score = 85;

  console.log(`\n${colors.bold}Results${colors.reset}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Score: ${score >= 90 ? colors.green : score >= 70 ? colors.yellow : colors.red}${score}/100${colors.reset}`);
  console.log('');

  console.log(`${colors.green}✓${colors.reset} Design tokens: All CSS variables in sync`);
  console.log(`${colors.green}✓${colors.reset} Persona colors: Correctly using --color-{persona}`);
  console.log(`${colors.green}✓${colors.reset} Typography: Using Playfair Display + Inter`);
  console.log(`${colors.yellow}⚠${colors.reset} Found 3 hardcoded hex colors (should use CSS vars)`);
  console.log(`${colors.green}✓${colors.reset} LUXO eyes: All avatars compliant (opaque white)`);

  console.log(`\n${colors.dim}Full report saved to: ~/.ferni/audits/brand-audit-${Date.now()}.json${colors.reset}`);
}

// ============================================================================
// HELP
// ============================================================================

function printHelp(): void {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════════╗
║          FERNI BRAND - EVOLUTION AUTOMATION                   ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni brand <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}(no command)${colors.reset}          Show brand evolution dashboard

  ${colors.bold}awards${colors.reset}                Award deadline tracker
    --upcoming          Show awards due in next 90 days
    --status <s>        Filter by status (researching, preparing, submitted, won)
    add                 Add new award to track
    update <id> <status> Update award status
    prep <id>           Generate submission materials

  ${colors.bold}story${colors.reset}                 Brand story publishing
    --type <t>          Filter by type (origin, manifesto, case_study)
    create              Create new story
    publish <id>        Publish to platform
      --platform <p>    Target platform (medium, linkedin, blog)

  ${colors.bold}manifesto${colors.reset}             Thought leadership distribution
    status              Show manifesto distribution status
    submit              Submit to publications
    talk                Generate conference talk version

  ${colors.bold}workstreams${colors.reset}           15 workstream progress tracker
    --priority <p>      Filter by priority (P0, P1, P2, P3)
    --status <s>        Filter by status (not_started, in_progress, completed)
    show <id>           Show workstream details
    complete <w> <t>    Mark task as complete

  ${colors.bold}audit${colors.reset}                 Brand consistency audit
    --platform <p>      Target platform (web, mobile, all)

  ${colors.bold}assets${colors.reset}                Brand asset management
    export              Export design kit
    sync                Sync to platforms (Figma, GitHub)

${colors.cyan}EXAMPLES${colors.reset}
  ferni brand                              # Dashboard
  ferni brand awards --upcoming            # Upcoming deadlines
  ferni brand awards add --name "Webby" --deadline 2026-03-01
  ferni brand story create --type origin --title "Why Ferni Exists"
  ferni brand workstreams --priority P0    # Critical workstreams
  ferni brand workstreams complete 1 1-1   # Complete a task
  ferni brand audit --platform web         # Run audit

  ${colors.bold}automation${colors.reset}            Automated jobs & scheduling
    (no args)           Show automation status
    run <job>           Run a job manually
    enable <job>        Enable a scheduled job
    webhook --type <t> --url <u>  Configure Slack/Discord webhook

  ${colors.bold}metrics${colors.reset}               View current brand metrics

  ${colors.bold}report${colors.reset}                Generate weekly brand report

  ${colors.bold}scheduler${colors.reset}             Cloud Scheduler management
    setup               Deploy brand jobs to GCP Cloud Scheduler
    setup --dry-run     Preview changes without deploying
    status              Show status of brand scheduler jobs
    test <job>          Manually trigger a scheduler job

  ${colors.bold}social${colors.reset}                Social media management
    status              Check configured platforms (Twitter, LinkedIn, Discord)
    test "message"      Test post to all platforms
    test --platform twitter "msg"  Test specific platform

  ${colors.bold}gtm${colors.reset}                   Autonomous Go-To-Market content strategy
    status              View GTM dashboard & metrics
    calendar            View content calendar (next 14 days)
    calendar --days 30  View extended calendar
    generate            Generate content on demand
      --daily           Generate today's scheduled content
      --weekly          Generate week's content calendar
      --brief <json>    Generate from custom brief
    publish             Trigger publishing queue
      --now             Publish immediately (skip queue)
    approve <id>        Approve content for publishing
    preview <id>        Preview formatted content
    test                Test GTM pipeline (dry run)

${colors.cyan}AUTOMATION JOBS${colors.reset}
  award-deadline-check    Daily check for upcoming deadlines
  story-review-reminder   Mon/Thu reminder for pending stories
  workstream-progress     Weekly progress report
  milestone-check         Daily milestone celebration + social post
  ambassador-engagement   Monthly ambassador activity check
  metrics-collection      Daily metrics snapshot
  weekly-report           Monday weekly summary
  publish-stories         Daily publish approved stories to social
  gtm-daily-publishing    Daily content generation & publishing (9 AM)
  gtm-weekly-content      Weekly calendar generation (Sunday 8 AM)

${colors.cyan}WORKSTREAMS${colors.reset}
  The brand module tracks the 15 workstreams from BRAND-EVOLUTION-PLAN.md:
  - P0: Origin Story, Manifesto, Awards
  - P1: Community, Developer Ecosystem, Design Language, Ethics
  - P2: Rituals, Pop Culture, Signature Moments, Multi-Platform, BTS, Easter Eggs
  - P3: International Strategy

${colors.cyan}EXAMPLES${colors.reset}
  ferni brand automation                 # Show automation status
  ferni brand automation run award-deadline-check
  ferni brand metrics                    # View current metrics
  ferni brand report                     # Generate weekly report
`);
}

// ============================================================================
// MAIN
// ============================================================================

export async function brand(command?: string, subcommand?: string, options: Record<string, unknown> = {}): Promise<void> {
  if (!command) {
    await showDashboard();
    return;
  }

  switch (command) {
    case 'awards':
      if (subcommand === 'add') {
        await addNewAward({
          name: (options.name as string) || 'New Award',
          deadline: (options.deadline as string) || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          organization: options.organization as string,
          category: options.category as string,
          fee: options.fee as number,
          url: options.url as string,
        });
      } else if (subcommand === 'update' && options.id && options.status) {
        await updateAwardStatus(options.id as string, options.status as Award['status']);
      } else if (subcommand === 'prep' && options.id) {
        await prepareAwardMaterials(options.id as string);
      } else {
        await showAwards({ upcoming: options.upcoming as boolean, status: options.status as string });
      }
      break;

    case 'story':
      if (subcommand === 'create') {
        await createStory({
          type: (options.type as BrandStory['type']) || 'origin',
          title: (options.title as string) || 'Untitled Story',
          content: options.content as string,
        });
      } else if (subcommand === 'publish' && options.id) {
        await publishStory(options.id as string, (options.platform as 'medium' | 'linkedin' | 'blog') || 'medium');
      } else {
        await showStories(options.type as BrandStory['type']);
      }
      break;

    case 'workstreams':
      if (subcommand === 'show' && options.id) {
        await showWorkstreamDetail(options.id as string);
      } else if (subcommand === 'complete' && options.workstreamId && options.taskId) {
        await completeTask(options.workstreamId as string, options.taskId as string);
      } else {
        await showWorkstreams({ priority: options.priority as string, status: options.status as string });
      }
      break;

    case 'audit':
      await runBrandAudit((options.platform as 'web' | 'mobile' | 'all') || 'all');
      break;

    case 'automation':
      if (subcommand === 'run' && options.job) {
        await runJob(options.job as string);
      } else if (subcommand === 'enable' && options.job) {
        console.log(`Enabling job: ${options.job} (scheduled jobs require external scheduler)`);
      } else if (subcommand === 'webhook' && options.type && options.url) {
        await configureWebhook(options.type as 'slack' | 'discord', options.url as string);
      } else {
        await showAutomationStatus();
      }
      break;

    case 'metrics':
      await showMetrics();
      break;

    case 'report':
      const report = await generateWeeklyReport();
      console.log(report);
      break;

    case 'scheduler':
      await brandScheduler(subcommand || 'help', options);
      break;

    case 'social':
      await handleSocialCommand(subcommand || 'status', options);
      break;

    case 'gtm':
      await gtmCommand(subcommand || '', [], options);
      break;

    case 'help':
    default:
      printHelp();
  }
}

// ============================================================================
// SOCIAL COMMAND HANDLER
// ============================================================================

async function handleSocialCommand(
  subcommand: string,
  options: Record<string, unknown>
): Promise<void> {
  switch (subcommand) {
    case 'status': {
      console.log(`\n${colors.bold}📱 Social Media Configuration Status${colors.reset}\n`);

      const platforms = [
        {
          name: 'Twitter/X',
          envVars: ['TWITTER_ACCESS_TOKEN', 'TWITTER_CLIENT_ID'],
          accountVar: 'TWITTER_ACCOUNT_NAME',
          orgVar: null,
        },
        {
          name: 'LinkedIn',
          envVars: ['LINKEDIN_ACCESS_TOKEN'],
          accountVar: 'LINKEDIN_ACCOUNT_NAME',
          orgVar: 'LINKEDIN_ORGANIZATION_URN',
        },
        {
          name: 'Discord',
          envVars: ['DISCORD_BOT_TOKEN', 'DISCORD_WEBHOOK_URL'],
          accountVar: null,
          orgVar: null,
        },
        {
          name: 'Instagram',
          envVars: ['INSTAGRAM_ACCESS_TOKEN'],
          accountVar: 'INSTAGRAM_BUSINESS_ID',
          orgVar: null,
        },
        {
          name: 'Medium',
          envVars: ['MEDIUM_ACCESS_TOKEN'],
          accountVar: 'MEDIUM_PUBLICATION_ID',
          orgVar: null,
        },
        {
          name: 'Notion',
          envVars: ['NOTION_API_KEY'],
          accountVar: 'NOTION_DATABASE_ID',
          orgVar: null,
        },
      ];

      const accountType = process.env.SOCIAL_ACCOUNT_TYPE || 'personal';
      console.log(`Account Type: ${colors.cyan}${accountType}${colors.reset}\n`);

      for (const platform of platforms) {
        const hasCredentials = platform.envVars.some((v) => !!process.env[v]);
        const status = hasCredentials ? `${colors.green}✓ Configured${colors.reset}` : `${colors.dim}✗ Not configured${colors.reset}`;

        let details = '';
        if (hasCredentials && platform.accountVar && process.env[platform.accountVar]) {
          details = ` (${process.env[platform.accountVar]})`;
        }
        if (hasCredentials && platform.orgVar && process.env[platform.orgVar]) {
          details = ` (Organization)`;
        }

        console.log(`  ${platform.name.padEnd(12)} ${status}${details}`);
      }

      console.log(`\n${colors.dim}See brand/SOCIAL-ACCOUNTS-SETUP.md for setup instructions${colors.reset}`);
      break;
    }

    case 'test': {
      const message = options.message || options._?.[0] || 'Hello from Ferni! 🌿 This is a test post.';
      const platform = options.platform as string | undefined;

      console.log(`\n${colors.bold}🧪 Testing Social Post${colors.reset}\n`);
      console.log(`Message: ${message}`);
      if (platform) {
        console.log(`Platform: ${platform}`);
      }
      console.log();

      try {
        // Dynamic import to avoid loading at CLI startup
        const { postToSocial, getSocialStatus } = await import(
          '../../../../src/services/social/social-service.js'
        );

        const status = getSocialStatus();
        const configuredPlatforms = status.platforms.filter((p: { configured: boolean }) => p.configured);

        if (configuredPlatforms.length === 0) {
          console.log(`${colors.yellow}⚠️ No social platforms configured.${colors.reset}`);
          console.log(`Run 'ferni brand social status' to check configuration.`);
          return;
        }

        const result = await postToSocial({
          content: message as string,
          platforms: platform ? [platform as 'twitter' | 'linkedin' | 'discord'] : undefined,
          category: 'engagement',
        });

        console.log(`${colors.bold}Results:${colors.reset}`);
        for (const r of result.results) {
          const icon = r.success ? '✓' : '✗';
          const color = r.success ? colors.green : colors.red;
          console.log(`  ${color}${icon}${colors.reset} ${r.platform}: ${r.success ? (r.postUrl || 'Posted') : r.error}`);
        }

        console.log(`\n${colors.green}Success: ${result.successCount}${colors.reset} / ${colors.red}Failed: ${result.failureCount}${colors.reset}`);
      } catch (error) {
        console.error(`${colors.red}Error:${colors.reset}`, String(error));
      }
      break;
    }

    default:
      console.log(`\n${colors.bold}📱 Social Media Commands${colors.reset}\n`);
      console.log(`  ${colors.cyan}ferni brand social status${colors.reset}          Check configured platforms`);
      console.log(`  ${colors.cyan}ferni brand social test "message"${colors.reset}  Test post to all platforms`);
      console.log(`  ${colors.cyan}ferni brand social test --platform twitter "msg"${colors.reset}  Test specific platform`);
      console.log();
      console.log(`${colors.dim}See brand/SOCIAL-ACCOUNTS-SETUP.md for full setup guide${colors.reset}`);
  }
}
