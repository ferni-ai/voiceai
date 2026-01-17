#!/usr/bin/env npx tsx
/**
 * Proactive Outreach System
 *
 * Superhuman capability: Reaches out BEFORE you know you need it.
 *
 * Features:
 * - Morning briefing at your ideal time
 * - Pre-meeting context preparation
 * - End-of-day reflection prompts
 * - Milestone celebrations
 * - Energy check-ins at optimal intervals
 * - Blocker escalation reminders
 * - Decision follow-up prompts
 *
 * Unlike a human assistant who waits to be asked,
 * this system anticipates and initiates.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

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
// TYPES
// ============================================================================

interface OutreachPreference {
  morningBriefingTime: string; // '07:00'
  eveningReflectionTime: string; // '18:00'
  energyCheckInterval: number; // hours
  preferredChannel: 'cli' | 'slack' | 'email';
  slackWebhookUrl?: string; // Slack incoming webhook URL
  emailAddress?: string; // Email for notifications
  quietHoursStart: string;
  quietHoursEnd: string;
  celebrateMilestones: boolean;
  proactiveCoaching: boolean;
}

interface ScheduledOutreach {
  id: string;
  type: 'morning-briefing' | 'evening-reflection' | 'energy-check' | 'milestone' | 'decision-follow-up' | 'blocker-escalation' | 'meeting-prep';
  scheduledFor: string;
  message: string;
  context?: Record<string, unknown>;
  delivered: boolean;
  deliveredAt?: string;
}

interface OutreachHistory {
  lastMorningBriefing?: string;
  lastEveningReflection?: string;
  lastEnergyCheck?: string;
  outreachCount: number;
  responseRate: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const OUTREACH_PREFS_FILE = join(CONFIG_DIR, 'outreach-preferences.json');
const OUTREACH_QUEUE_FILE = join(CONFIG_DIR, 'outreach-queue.json');
const OUTREACH_HISTORY_FILE = join(CONFIG_DIR, 'outreach-history.json');

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function loadPreferences(): Promise<OutreachPreference> {
  try {
    const data = await fs.readFile(OUTREACH_PREFS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return getDefaultPreferences();
  }
}

async function savePreferences(prefs: OutreachPreference): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(OUTREACH_PREFS_FILE, JSON.stringify(prefs, null, 2));
}

async function loadOutreachQueue(): Promise<ScheduledOutreach[]> {
  try {
    const data = await fs.readFile(OUTREACH_QUEUE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveOutreachQueue(queue: ScheduledOutreach[]): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(OUTREACH_QUEUE_FILE, JSON.stringify(queue, null, 2));
}

async function loadHistory(): Promise<OutreachHistory> {
  try {
    const data = await fs.readFile(OUTREACH_HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { outreachCount: 0, responseRate: 0.5 };
  }
}

function getDefaultPreferences(): OutreachPreference {
  return {
    morningBriefingTime: '07:00',
    eveningReflectionTime: '18:00',
    energyCheckInterval: 4,
    preferredChannel: 'cli',
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    celebrateMilestones: true,
    proactiveCoaching: true,
  };
}

// ============================================================================
// OUTREACH GENERATION
// ============================================================================

function generateMorningBriefing(): ScheduledOutreach {
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  const messages: Record<string, string> = {
    Monday: "Fresh week ahead. What's the one thing that would make this week a success?",
    Tuesday: "Tuesday - momentum day. How did yesterday's focus pay off?",
    Wednesday: "Midweek check: Are you on track for your weekly priorities?",
    Thursday: "Thursday - the day to push through. What needs to be wrapped up?",
    Friday: "Friday - finishing strong. What wins can you celebrate this week?",
    Saturday: "Weekend time. Are you actually resting, or just pretending to?",
    Sunday: "Sunday reset. What are you looking forward to tomorrow?",
  };

  return {
    id: `morning-${now.toISOString().split('T')[0]}`,
    type: 'morning-briefing',
    scheduledFor: now.toISOString(),
    message: messages[dayOfWeek] || "Good morning. What's your focus today?",
    delivered: false,
  };
}

function generateEveningReflection(): ScheduledOutreach {
  const now = new Date();

  const prompts = [
    "What's one thing you accomplished today that you're proud of?",
    "What drained your energy today? What restored it?",
    "If you could redo one decision from today, what would you change?",
    "Who did you help today? Who helped you?",
    "What did you learn today that you didn't know yesterday?",
    "Rate your day 1-10. What would have made it a 10?",
    "What are you grateful for from today?",
    "Did you move closer to your goals today? How?",
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  return {
    id: `evening-${now.toISOString().split('T')[0]}`,
    type: 'evening-reflection',
    scheduledFor: now.toISOString(),
    message: prompt,
    delivered: false,
  };
}

function generateEnergyCheck(): ScheduledOutreach {
  const now = new Date();
  const hour = now.getHours();

  let message: string;
  if (hour < 12) {
    message = "Morning energy check: How are you feeling? (1-10)";
  } else if (hour < 17) {
    message = "Afternoon check-in: Energy level? Consider a quick break if below 5.";
  } else {
    message = "Evening energy: How did today treat you? Time to wind down if you're depleted.";
  }

  return {
    id: `energy-${now.toISOString()}`,
    type: 'energy-check',
    scheduledFor: now.toISOString(),
    message,
    delivered: false,
  };
}

function generateMilestoneOutreach(milestone: string, context: Record<string, unknown>): ScheduledOutreach {
  const celebrations = [
    `🎉 Milestone reached: ${milestone}! Take a moment to appreciate this.`,
    `🏆 You did it! ${milestone} - worth celebrating.`,
    `⭐ Achievement unlocked: ${milestone}. What made this possible?`,
  ];

  return {
    id: `milestone-${Date.now()}`,
    type: 'milestone',
    scheduledFor: new Date().toISOString(),
    message: celebrations[Math.floor(Math.random() * celebrations.length)],
    context,
    delivered: false,
  };
}

function generateDecisionFollowUp(decisionId: string, description: string): ScheduledOutreach {
  return {
    id: `decision-followup-${decisionId}`,
    type: 'decision-follow-up',
    scheduledFor: new Date().toISOString(),
    message: `Decision follow-up: "${description}" - What was the outcome? (positive/negative/neutral)`,
    context: { decisionId, description },
    delivered: false,
  };
}

function generateBlockerEscalation(blockerDescription: string, daysSinceCreated: number): ScheduledOutreach {
  let urgency: string;
  if (daysSinceCreated > 7) {
    urgency = `🚨 Critical: This blocker is ${daysSinceCreated} days old. Escalate or remove it.`;
  } else if (daysSinceCreated > 3) {
    urgency = `⚠️ Warning: Blocker aging at ${daysSinceCreated} days. What's needed to unblock?`;
  } else {
    urgency = `📌 Reminder: Blocker "${blockerDescription}" needs attention.`;
  }

  return {
    id: `blocker-${Date.now()}`,
    type: 'blocker-escalation',
    scheduledFor: new Date().toISOString(),
    message: urgency,
    context: { blockerDescription, daysSinceCreated },
    delivered: false,
  };
}

// ============================================================================
// DELIVERY CHANNELS
// ============================================================================

/**
 * Send outreach via Slack incoming webhook
 */
async function deliverViaSlack(outreach: ScheduledOutreach, webhookUrl: string): Promise<boolean> {
  const icon = outreach.type === 'milestone' ? ':tada:' :
               outreach.type === 'morning-briefing' ? ':sunny:' :
               outreach.type === 'evening-reflection' ? ':crescent_moon:' :
               outreach.type === 'energy-check' ? ':zap:' :
               outreach.type === 'decision-follow-up' ? ':clipboard:' :
               outreach.type === 'blocker-escalation' ? ':construction:' : ':speech_balloon:';

  const typeLabel = outreach.type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${icon} Ferni: ${typeLabel}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: outreach.message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_${new Date(outreach.scheduledFor).toLocaleString()}_`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`${colors.red}Slack delivery failed: ${response.status}${colors.reset}`);
      return false;
    }

    console.log(`${colors.green}✓ Sent to Slack${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Slack delivery error:${colors.reset}`, error);
    return false;
  }
}

/**
 * Send outreach via email (using SendGrid or similar)
 * For now, this logs a message - implement with your email provider
 */
async function deliverViaEmail(outreach: ScheduledOutreach, emailAddress: string): Promise<boolean> {
  // TODO: Integrate with SendGrid, SES, or other email provider
  // For now, we'll log that email would be sent
  console.log(`${colors.yellow}⚠ Email delivery not yet implemented${colors.reset}`);
  console.log(`${colors.dim}Would send to: ${emailAddress}${colors.reset}`);
  console.log(`${colors.dim}Subject: Ferni ${outreach.type}${colors.reset}`);
  console.log(`${colors.dim}Body: ${outreach.message}${colors.reset}`);
  return false;
}

// ============================================================================
// DELIVERY ROUTER
// ============================================================================

async function deliverOutreach(outreach: ScheduledOutreach, prefs?: OutreachPreference): Promise<void> {
  // Determine delivery channel
  const channel = prefs?.preferredChannel || 'cli';

  // Try Slack first if configured
  if (channel === 'slack' && prefs?.slackWebhookUrl) {
    const success = await deliverViaSlack(outreach, prefs.slackWebhookUrl);
    if (success) return;
    // Fall back to CLI if Slack fails
    console.log(`${colors.dim}Falling back to CLI output...${colors.reset}`);
  }

  // Try email if configured
  if (channel === 'email' && prefs?.emailAddress) {
    const success = await deliverViaEmail(outreach, prefs.emailAddress);
    if (success) return;
    // Fall back to CLI if email fails
    console.log(`${colors.dim}Falling back to CLI output...${colors.reset}`);
  }

  // CLI delivery (default/fallback)
  deliverViaCLI(outreach);
}

function deliverViaCLI(outreach: ScheduledOutreach): void {
  const typeColors: Record<string, string> = {
    'morning-briefing': colors.cyan,
    'evening-reflection': colors.magenta,
    'energy-check': colors.yellow,
    'milestone': colors.green,
    'decision-follow-up': colors.blue,
    'blocker-escalation': colors.red,
    'meeting-prep': colors.cyan,
  };

  const color = typeColors[outreach.type] || colors.white;
  const icon = outreach.type === 'milestone' ? '🎉' :
               outreach.type === 'morning-briefing' ? '☀️' :
               outreach.type === 'evening-reflection' ? '🌙' :
               outreach.type === 'energy-check' ? '⚡' :
               outreach.type === 'decision-follow-up' ? '📋' :
               outreach.type === 'blocker-escalation' ? '🚧' : '💬';

  console.log(`
${colors.bold}${color}┌─────────────────────────────────────────────────────────┐${colors.reset}
${color}│${colors.reset} ${icon} ${colors.bold}Proactive Outreach${colors.reset}                                  ${color}│${colors.reset}
${colors.bold}${color}└─────────────────────────────────────────────────────────┘${colors.reset}

${outreach.message}

${colors.dim}Type: ${outreach.type} | Time: ${new Date(outreach.scheduledFor).toLocaleString()}${colors.reset}
`);
}

// ============================================================================
// MAIN
// ============================================================================

export async function proactiveOutreach(options: {
  configure?: boolean;
  check?: boolean;
  deliver?: string;
  queue?: boolean;
  trigger?: 'morning' | 'evening' | 'energy' | 'milestone';
  setSlack?: string;
  setEmail?: string;
  setChannel?: 'cli' | 'slack' | 'email';
  json?: boolean;
}): Promise<void> {
  let prefs = await loadPreferences();
  const queue = await loadOutreachQueue();
  const history = await loadHistory();

  // Handle configuration updates
  if (options.setSlack) {
    prefs.slackWebhookUrl = options.setSlack;
    prefs.preferredChannel = 'slack';
    await savePreferences(prefs);
    console.log(`${colors.green}✓ Slack webhook configured${colors.reset}`);
    console.log(`${colors.dim}Preferred channel set to: slack${colors.reset}`);
    return;
  }

  if (options.setEmail) {
    prefs.emailAddress = options.setEmail;
    prefs.preferredChannel = 'email';
    await savePreferences(prefs);
    console.log(`${colors.green}✓ Email address configured: ${options.setEmail}${colors.reset}`);
    console.log(`${colors.dim}Preferred channel set to: email${colors.reset}`);
    return;
  }

  if (options.setChannel) {
    prefs.preferredChannel = options.setChannel;
    await savePreferences(prefs);
    console.log(`${colors.green}✓ Preferred channel set to: ${options.setChannel}${colors.reset}`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ prefs, queue: queue.slice(0, 10), history }, null, 2));
    return;
  }

  // Configure preferences
  if (options.configure) {
    const slackStatus = prefs.slackWebhookUrl
      ? `${colors.green}Configured${colors.reset}`
      : `${colors.dim}Not set${colors.reset}`;
    const emailStatus = prefs.emailAddress
      ? `${colors.green}${prefs.emailAddress}${colors.reset}`
      : `${colors.dim}Not set${colors.reset}`;

    console.log(`
${colors.bold}${colors.cyan}Proactive Outreach Configuration${colors.reset}

${colors.bold}Schedule${colors.reset}
  Morning briefing:    ${prefs.morningBriefingTime}
  Evening reflection:  ${prefs.eveningReflectionTime}
  Energy check every:  ${prefs.energyCheckInterval} hours
  Quiet hours:         ${prefs.quietHoursStart} - ${prefs.quietHoursEnd}

${colors.bold}Delivery${colors.reset}
  Preferred channel:   ${colors.bold}${prefs.preferredChannel}${colors.reset}
  Slack webhook:       ${slackStatus}
  Email address:       ${emailStatus}

${colors.bold}Features${colors.reset}
  Milestone celebrations: ${prefs.celebrateMilestones ? `${colors.green}On${colors.reset}` : `${colors.dim}Off${colors.reset}`}
  Proactive coaching:     ${prefs.proactiveCoaching ? `${colors.green}On${colors.reset}` : `${colors.dim}Off${colors.reset}`}

${colors.dim}To modify, edit ~/.ferni/outreach-preferences.json
Or use: ferni exec outreach --set-slack <webhook-url>
        ferni exec outreach --set-channel slack|email|cli${colors.reset}
`);
    return;
  }

  // Check for pending outreach
  if (options.check) {
    const now = new Date();
    const pending = queue.filter(o => !o.delivered && new Date(o.scheduledFor) <= now);

    if (pending.length === 0) {
      console.log(`${colors.green}✓ No pending outreach${colors.reset}`);
      console.log(`${colors.dim}Outreach history: ${history.outreachCount} total, ${Math.round(history.responseRate * 100)}% response rate${colors.reset}`);
      return;
    }

    console.log(`${colors.yellow}${pending.length} pending outreach(es):${colors.reset}\n`);
    for (const outreach of pending) {
      await deliverOutreach(outreach, prefs);
    }

    // Mark as delivered
    for (const outreach of pending) {
      outreach.delivered = true;
      outreach.deliveredAt = now.toISOString();
    }
    await saveOutreachQueue(queue);
    return;
  }

  // View queue
  if (options.queue) {
    const pending = queue.filter(o => !o.delivered);
    console.log(`${colors.bold}Outreach Queue${colors.reset} (${pending.length} pending)\n`);

    if (pending.length === 0) {
      console.log(`${colors.dim}No scheduled outreach. Use --trigger to create one.${colors.reset}`);
      return;
    }

    for (const outreach of pending.slice(0, 10)) {
      const time = new Date(outreach.scheduledFor).toLocaleString();
      console.log(`  ${outreach.type.padEnd(20)} ${time}`);
      console.log(`  ${colors.dim}${outreach.message.substring(0, 60)}...${colors.reset}\n`);
    }
    return;
  }

  // Trigger specific outreach
  if (options.trigger) {
    let outreach: ScheduledOutreach;

    switch (options.trigger) {
      case 'morning':
        outreach = generateMorningBriefing();
        break;
      case 'evening':
        outreach = generateEveningReflection();
        break;
      case 'energy':
        outreach = generateEnergyCheck();
        break;
      case 'milestone':
        outreach = generateMilestoneOutreach('Manual milestone', {});
        break;
      default:
        console.log(`${colors.red}Unknown trigger type: ${options.trigger}${colors.reset}`);
        return;
    }

    await deliverOutreach(outreach, prefs);
    outreach.delivered = true;
    outreach.deliveredAt = new Date().toISOString();
    queue.push(outreach);
    await saveOutreachQueue(queue);
    return;
  }

  // Default: show status
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           PROACTIVE OUTREACH SYSTEM                       ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}About${colors.reset}
Unlike a human assistant who waits to be asked, this system
anticipates your needs and reaches out proactively.

${colors.bold}Outreach Types${colors.reset}
  ☀️  Morning briefings     - Start your day with focus
  🌙  Evening reflections   - End with gratitude and learning
  ⚡  Energy check-ins      - Monitor your sustainable pace
  🎉  Milestone celebrations - Don't let wins go unnoticed
  📋  Decision follow-ups   - Track outcomes, improve decisions
  🚧  Blocker escalations   - Don't let issues fester

${colors.bold}Stats${colors.reset}
  Total outreach sent: ${history.outreachCount}
  Response rate: ${Math.round(history.responseRate * 100)}%
  Last morning briefing: ${history.lastMorningBriefing ? new Date(history.lastMorningBriefing).toLocaleDateString() : 'Never'}
  Last evening reflection: ${history.lastEveningReflection ? new Date(history.lastEveningReflection).toLocaleDateString() : 'Never'}

${colors.dim}Commands:
  ferni outreach --trigger morning     # Trigger morning briefing now
  ferni outreach --trigger evening     # Trigger evening reflection now
  ferni outreach --trigger energy      # Trigger energy check now
  ferni outreach --check               # Check for pending outreach
  ferni outreach --queue               # View scheduled outreach
  ferni outreach --configure           # View/edit preferences

Delivery configuration:
  ferni outreach --set-slack <url>     # Set Slack webhook URL
  ferni outreach --set-email <email>   # Set email address
  ferni outreach --set-channel slack   # Switch to Slack delivery
  ferni outreach --set-channel email   # Switch to email delivery
  ferni outreach --set-channel cli     # Switch to CLI delivery (default)
${colors.reset}
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  // Parse --trigger <type>
  const triggerIdx = args.findIndex(a => a === '--trigger');
  const trigger = triggerIdx >= 0 ? args[triggerIdx + 1] as 'morning' | 'evening' | 'energy' | 'milestone' : undefined;

  // Parse --set-slack <url>
  const setSlackIdx = args.findIndex(a => a === '--set-slack');
  const setSlack = setSlackIdx >= 0 ? args[setSlackIdx + 1] : undefined;

  // Parse --set-email <email>
  const setEmailIdx = args.findIndex(a => a === '--set-email');
  const setEmail = setEmailIdx >= 0 ? args[setEmailIdx + 1] : undefined;

  // Parse --set-channel <channel>
  const setChannelIdx = args.findIndex(a => a === '--set-channel');
  const setChannel = setChannelIdx >= 0 ? args[setChannelIdx + 1] as 'cli' | 'slack' | 'email' : undefined;

  proactiveOutreach({
    configure: args.includes('--configure'),
    check: args.includes('--check'),
    queue: args.includes('--queue'),
    trigger,
    setSlack,
    setEmail,
    setChannel,
    json: args.includes('--json'),
  }).catch(console.error);
}
