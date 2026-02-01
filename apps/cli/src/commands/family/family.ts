#!/usr/bin/env npx tsx
/**
 * Family Check-in CLI Command
 *
 * Manage family check-ins and messages.
 *
 * Usage:
 *   ferni family checkin             # Start a family check-in call
 *   ferni family status              # View check-in status
 *   ferni family summary             # Get family wellness summary
 *   ferni family message "mom" "Hi!" # Send a message to family
 *
 * @module cli/commands/family
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
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

interface FamilyArgs {
  command: string;
  member?: string;
  message?: string;
  options: {
    json?: boolean;
  };
}

function parseArgs(args: string[]): FamilyArgs {
  const options: FamilyArgs['options'] = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const command = positional[0]?.toLowerCase() || 'status';
  const member = positional[1];
  const message = positional[2];

  return { command, member, message, options };
}

function showHelp(): void {
  console.log(`
${colors.bold('👨‍👩‍👧‍👦 Ferni Family CLI')}

${colors.cyan('Usage:')}
  ferni family <command> [options]

${colors.cyan('Commands:')}
  ${colors.green('checkin')}                   Start a family check-in round
  ${colors.green('checkin <member>')}          Check in on a specific family member
  ${colors.green('status')}                    View pending check-ins
  ${colors.green('summary')}                   Family wellness summary
  ${colors.green('message <member> <msg>')}    Send a message to family member
  ${colors.green('members')}                   List family members

${colors.cyan('Options:')}
  --json                Output as JSON

${colors.cyan('Examples:')}
  ferni family checkin
  ferni family checkin mom
  ferni family status
  ferni family summary
  ferni family message "mom" "Hope you're doing well!"
  ferni family members
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

interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  lastCheckin?: string;
  wellnessScore?: number;
  phone?: string;
}

interface CheckinStatus {
  pending: number;
  completed: number;
  lastRound?: string;
  members: FamilyMember[];
}

async function handleCheckin(member?: string): Promise<void> {
  if (member) {
    console.log(colors.dim(`Starting check-in with ${member}...`));
    const result = await apiRequest('/api/family/checkin', 'POST', { member });

    if (result.success) {
      console.log(colors.green(`✅ Check-in call initiated with ${member}`));
      const data = result.data as { callId?: string };
      if (data?.callId) {
        console.log(colors.dim(`   Call ID: ${data.callId}`));
      }
    } else {
      console.log(colors.red(`❌ ${result.error || "Couldn't start check-in"}`));
    }
  } else {
    console.log(colors.dim('Starting family check-in round...'));
    const result = await apiRequest('/api/family/checkin/round', 'POST');

    if (result.success) {
      console.log(colors.green('✅ Family check-in round started'));
      const data = result.data as { members?: string[] };
      if (data?.members?.length) {
        console.log(colors.dim(`   Checking in with: ${data.members.join(', ')}`));
      }
    } else {
      console.log(colors.red(`❌ ${result.error || "Couldn't start check-in round"}`));
    }
  }
}

async function handleStatus(options: FamilyArgs['options']): Promise<void> {
  console.log(colors.dim('Getting check-in status...'));

  const result = await apiRequest('/api/family/status');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const status = result.data as CheckinStatus;

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(colors.bold('\n👨‍👩‍👧‍👦 Family Check-in Status\n'));
  console.log(`  ${colors.cyan('Pending:')} ${status.pending || 0}`);
  console.log(`  ${colors.green('Completed:')} ${status.completed || 0}`);
  if (status.lastRound) {
    console.log(`  ${colors.dim('Last round:')} ${status.lastRound}`);
  }
  console.log('');
}

async function handleSummary(options: FamilyArgs['options']): Promise<void> {
  console.log(colors.dim('Getting family wellness summary...'));

  const result = await apiRequest('/api/family/summary');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  const data = result.data as { members?: FamilyMember[]; insights?: string[] };
  const members = data?.members || [];
  const insights = data?.insights || [];

  console.log(colors.bold('\n💚 Family Wellness Summary\n'));

  if (members.length === 0) {
    console.log(colors.yellow('  No family members configured'));
    console.log(colors.dim('  Add family members in the app to enable check-ins'));
  } else {
    for (const member of members) {
      let line = `  ${colors.bold(member.name)}`;
      if (member.relationship) {
        line += colors.dim(` (${member.relationship})`);
      }
      if (member.wellnessScore !== undefined) {
        const scoreColor = member.wellnessScore >= 70 ? colors.green : member.wellnessScore >= 40 ? colors.yellow : colors.red;
        line += ` ${scoreColor(`${member.wellnessScore}%`)}`;
      }
      console.log(line);
      if (member.lastCheckin) {
        const date = new Date(member.lastCheckin);
        const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`     ${colors.dim(`Last check-in: ${daysAgo === 0 ? 'Today' : `${daysAgo} days ago`}`)}`);
      }
    }
  }

  if (insights.length > 0) {
    console.log(colors.bold('\n  📋 Insights:\n'));
    for (const insight of insights) {
      console.log(`    • ${insight}`);
    }
  }
  console.log('');
}

async function handleMessage(member: string, message: string): Promise<void> {
  console.log(colors.dim(`Sending message to ${member}...`));

  const result = await apiRequest('/api/family/message', 'POST', {
    member,
    message,
  });

  if (result.success) {
    console.log(colors.green(`✅ Message sent to ${member}`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't send message"}`));
  }
}

async function handleMembers(options: FamilyArgs['options']): Promise<void> {
  console.log(colors.dim('Getting family members...'));

  const result = await apiRequest('/api/family/members');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const members = (result.data as { members?: FamilyMember[] })?.members || [];

  if (options.json) {
    console.log(JSON.stringify(members, null, 2));
    return;
  }

  if (members.length === 0) {
    console.log(colors.yellow('No family members configured'));
    return;
  }

  console.log(colors.bold(`\n👨‍👩‍👧‍👦 Family Members (${members.length})\n`));

  for (const member of members) {
    let line = `  ${colors.bold(member.name)}`;
    if (member.relationship) {
      line += colors.cyan(` · ${member.relationship}`);
    }
    console.log(line);
    if (member.phone) {
      console.log(`     ${colors.dim(`📱 ${member.phone}`)}`);
    }
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'checkin':
    case 'check-in':
    case 'call':
      await handleCheckin(parsed.member);
      break;

    case 'status':
      await handleStatus(parsed.options);
      break;

    case 'summary':
    case 'wellness':
    case 'health':
      await handleSummary(parsed.options);
      break;

    case 'message':
    case 'msg':
    case 'send':
      if (!parsed.member || !parsed.message) {
        console.log(colors.red('❌ Usage: ferni family message <member> <message>'));
        return;
      }
      await handleMessage(parsed.member, parsed.message);
      break;

    case 'members':
    case 'list':
      await handleMembers(parsed.options);
      break;

    default:
      // Default to status
      await handleStatus(parsed.options);
  }
}

// Run
main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
