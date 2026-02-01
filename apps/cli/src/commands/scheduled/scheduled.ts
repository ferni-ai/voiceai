#!/usr/bin/env npx tsx
/**
 * Scheduled Actions CLI Command
 *
 * Schedule calls, messages, and reminders for later.
 *
 * Usage:
 *   ferni schedule call "Jordan" "tomorrow 3pm" --reason "birthday"
 *   ferni schedule message "mom" "8am" --message "Good morning!"
 *   ferni schedule reminder "Take vitamins" "every day 9am"
 *   ferni schedule list                   # List all scheduled items
 *   ferni schedule cancel <id>            # Cancel a scheduled item
 *
 * @module cli/commands/scheduled
 */

import { isAuthenticated, getCurrentUser, getAuthHeaders } from '../../services/cli-auth.service.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL =
  process.env.FERNI_API_URL || 'https://john-bogle-ui-1031920444452.us-central1.run.app';

// ANSI colors for terminal output
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface ScheduledArgs {
  command: string;
  target?: string;
  time?: string;
  options: {
    reason?: string;
    message?: string;
    json?: boolean;
  };
}

function parseArgs(args: string[]): ScheduledArgs {
  const options: ScheduledArgs['options'] = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--reason' && args[i + 1]) {
      options.reason = args[++i];
    } else if ((arg === '--message' || arg === '-m') && args[i + 1]) {
      options.message = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const command = positional[0]?.toLowerCase() || 'list';
  const target = positional[1];
  const time = positional[2];

  return { command, target, time, options };
}

function showHelp(): void {
  console.log(`
${colors.bold('📅 Ferni Schedule CLI')}

${colors.cyan('Usage:')}
  ferni schedule <command> [options]

${colors.cyan('Commands:')}
  ${colors.green('call <contact> <time>')}       Schedule a call
  ${colors.green('message <contact> <time>')}    Schedule a message
  ${colors.green('reminder <text> <time>')}      Schedule a reminder
  ${colors.green('list')}                        List all scheduled items
  ${colors.green('cancel <id>')}                 Cancel a scheduled item

${colors.cyan('Options:')}
  --reason <text>       Reason for the call/message
  --message <text>      Message content
  --json                Output as JSON

${colors.cyan('Time Formats:')}
  "tomorrow 3pm"        Tomorrow at 3 PM
  "next monday 10am"    Next Monday at 10 AM
  "in 2 hours"          2 hours from now
  "every day 9am"       Recurring daily at 9 AM

${colors.cyan('Examples:')}
  ferni schedule call "Jordan" "tomorrow 3pm" --reason "birthday"
  ferni schedule message "mom" "8am" --message "Good morning!"
  ferni schedule reminder "Take vitamins" "every day 9am"
  ferni schedule list
  ferni schedule cancel abc123
`);
}

async function apiRequest(endpoint: string, method = 'GET', body?: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!isAuthenticated()) {
    return { success: false, error: 'Not authenticated. Run: ferni auth login' };
  }

  const user = getCurrentUser();
  if (!user) {
    return { success: false, error: 'No user found. Run: ferni auth login' };
  }

  try {
    const headers = await getAuthHeaders();
    const options: RequestInit = {
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify({ ...body as object, userId: user.userId });
    }

    const url = method === 'GET'
      ? `${API_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}userId=${user.userId}`
      : `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: `API error: ${error}` };
  }
}

async function handleScheduleCall(target: string, time: string, options: ScheduledArgs['options']): Promise<void> {
  console.log(colors.dim(`Scheduling call to "${target}" for ${time}...`));

  const result = await apiRequest('/api/scheduled/call', 'POST', {
    contact: target,
    scheduledTime: time,
    reason: options.reason,
  });

  if (result.success) {
    const data = result.data as { id?: string };
    console.log(colors.green(`✅ Call scheduled to ${target}`));
    if (data?.id) {
      console.log(colors.dim(`   ID: ${data.id}`));
    }
    console.log(colors.dim(`   Time: ${time}`));
    if (options.reason) {
      console.log(colors.dim(`   Reason: ${options.reason}`));
    }
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't schedule call"}`));
  }
}

async function handleScheduleMessage(target: string, time: string, options: ScheduledArgs['options']): Promise<void> {
  if (!options.message) {
    console.log(colors.red('❌ Please specify a message: --message "Hello!"'));
    return;
  }

  console.log(colors.dim(`Scheduling message to "${target}" for ${time}...`));

  const result = await apiRequest('/api/scheduled/message', 'POST', {
    contact: target,
    scheduledTime: time,
    message: options.message,
  });

  if (result.success) {
    console.log(colors.green(`✅ Message scheduled to ${target}`));
    console.log(colors.dim(`   Time: ${time}`));
    console.log(colors.dim(`   Message: "${options.message}"`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't schedule message"}`));
  }
}

async function handleScheduleReminder(text: string, time: string): Promise<void> {
  console.log(colors.dim(`Scheduling reminder for ${time}...`));

  const result = await apiRequest('/api/scheduled/reminder', 'POST', {
    message: text,
    scheduledTime: time,
  });

  if (result.success) {
    console.log(colors.green(`✅ Reminder scheduled`));
    console.log(colors.dim(`   Time: ${time}`));
    console.log(colors.dim(`   Reminder: "${text}"`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't schedule reminder"}`));
  }
}

interface ScheduledItem {
  id: string;
  type: string;
  target?: string;
  message?: string;
  scheduledTime: string;
  status: string;
}

async function handleList(options: ScheduledArgs['options']): Promise<void> {
  console.log(colors.dim('Fetching scheduled items...'));

  const result = await apiRequest('/api/scheduled');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const items = (result.data as { items?: ScheduledItem[] })?.items || [];

  if (options.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log(colors.yellow('No scheduled items'));
    return;
  }

  console.log(colors.bold(`\n📅 Scheduled Items (${items.length})\n`));

  for (const item of items) {
    const typeIcon = item.type === 'call' ? '📞' : item.type === 'message' ? '💬' : '⏰';
    let line = `${typeIcon} ${colors.bold(item.type.charAt(0).toUpperCase() + item.type.slice(1))}`;
    if (item.target) {
      line += ` to ${colors.cyan(item.target)}`;
    }
    line += colors.dim(` · ${item.scheduledTime}`);
    console.log(`  ${line}`);
    if (item.message) {
      console.log(`     ${colors.dim(`"${item.message}"`)}`);
    }
    console.log(`     ${colors.dim(`ID: ${item.id}`)}`);
    console.log('');
  }
}

async function handleCancel(id: string): Promise<void> {
  console.log(colors.dim(`Canceling scheduled item ${id}...`));

  const result = await apiRequest(`/api/scheduled/${id}`, 'DELETE');

  if (result.success) {
    console.log(colors.green(`✅ Scheduled item canceled`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't cancel item"}`));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'call':
      if (!parsed.target || !parsed.time) {
        console.log(colors.red('❌ Usage: ferni schedule call <contact> <time> [--reason "..."]'));
        return;
      }
      await handleScheduleCall(parsed.target, parsed.time, parsed.options);
      break;

    case 'message':
    case 'msg':
    case 'text':
      if (!parsed.target || !parsed.time) {
        console.log(colors.red('❌ Usage: ferni schedule message <contact> <time> --message "..."'));
        return;
      }
      await handleScheduleMessage(parsed.target, parsed.time, parsed.options);
      break;

    case 'reminder':
    case 'remind':
      if (!parsed.target || !parsed.time) {
        console.log(colors.red('❌ Usage: ferni schedule reminder <text> <time>'));
        return;
      }
      await handleScheduleReminder(parsed.target, parsed.time);
      break;

    case 'list':
    case 'ls':
      await handleList(parsed.options);
      break;

    case 'cancel':
    case 'delete':
    case 'remove':
      if (!parsed.target) {
        console.log(colors.red('❌ Please specify item ID: ferni schedule cancel <id>'));
        return;
      }
      await handleCancel(parsed.target);
      break;

    default:
      console.log(colors.red(`❌ Unknown command: ${parsed.command}`));
      showHelp();
  }
}

// Run
main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
