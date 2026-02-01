#!/usr/bin/env npx tsx
/**
 * Email Intelligence CLI Command
 *
 * View email insights, follow-ups, and priorities.
 *
 * Usage:
 *   ferni email summary           # Email inbox summary
 *   ferni email followups         # Emails needing follow-up
 *   ferni email important         # Important/high-priority emails
 *   ferni email from "John"       # Emails from a contact
 *   ferni email unread            # Unread email summary
 *
 * @module cli/commands/email
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

interface EmailArgs {
  command: string;
  query?: string;
  options: {
    limit?: number;
    json?: boolean;
  };
}

function parseArgs(args: string[]): EmailArgs {
  const options: EmailArgs['options'] = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const command = positional[0]?.toLowerCase() || 'summary';
  const query = positional.slice(1).join(' ') || undefined;

  return { command, query, options };
}

function showHelp(): void {
  console.log(`
${colors.bold('📧 Ferni Email Intelligence CLI')}

${colors.cyan('Usage:')}
  ferni email <command> [options]

${colors.cyan('Commands:')}
  ${colors.green('summary')}               Inbox overview and stats
  ${colors.green('followups')}             Emails needing follow-up
  ${colors.green('important')}             High-priority emails
  ${colors.green('unread')}                Unread email summary
  ${colors.green('from <name>')}           Emails from a specific person
  ${colors.green('search <query>')}        Search emails

${colors.cyan('Options:')}
  --limit <n>           Limit results (default: 10)
  --json                Output as JSON

${colors.cyan('Examples:')}
  ferni email summary
  ferni email followups --limit 5
  ferni email from "John"
  ferni email important
`);
}

async function executeTool(fn: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (!isAuthenticated()) {
    return { success: false, error: 'Not authenticated. Run: ferni auth login' };
  }

  const user = getCurrentUser();
  if (!user) {
    return { success: false, error: 'No user found. Run: ferni auth login' };
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/chat/tool`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fn,
        args,
        userId: user.userId,
        source: 'cli-email',
      }),
    });

    const data = await response.json();
    return { success: data.success, result: data.result, error: data.error };
  } catch (error) {
    return { success: false, error: `API error: ${error}` };
  }
}

interface Email {
  id: string;
  from: string;
  subject: string;
  snippet?: string;
  date: string;
  priority?: 'high' | 'normal' | 'low';
  needsFollowUp?: boolean;
  isRead?: boolean;
}

interface EmailSummary {
  total: number;
  unread: number;
  important: number;
  needsFollowUp: number;
  categories: Record<string, number>;
}

function formatEmail(email: Email): string {
  const lines: string[] = [];

  let subjectLine = colors.bold(email.subject || '(No subject)');
  if (email.priority === 'high') {
    subjectLine = colors.red('!') + ' ' + subjectLine;
  }
  if (email.needsFollowUp) {
    subjectLine += colors.yellow(' ⏳');
  }
  if (!email.isRead) {
    subjectLine = colors.cyan('●') + ' ' + subjectLine;
  }

  lines.push(subjectLine);
  lines.push(`  ${colors.dim('From:')} ${email.from}`);
  lines.push(`  ${colors.dim('Date:')} ${email.date}`);

  if (email.snippet) {
    const snippet = email.snippet.length > 80 ? email.snippet.slice(0, 80) + '...' : email.snippet;
    lines.push(`  ${colors.dim(snippet)}`);
  }

  return lines.join('\n');
}

async function handleSummary(options: EmailArgs['options']): Promise<void> {
  console.log(colors.dim('Getting email summary...'));

  const result = await executeTool('getUnreadEmails', {});

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get email summary"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  const summary = result.result as EmailSummary | string;

  if (typeof summary === 'string') {
    console.log(colors.green(`📧 ${summary}`));
    return;
  }

  console.log(colors.bold('\n📧 Email Summary\n'));
  console.log(`  ${colors.cyan('Total:')} ${summary.total || 0}`);
  console.log(`  ${colors.cyan('Unread:')} ${summary.unread || 0}`);
  console.log(`  ${colors.yellow('Important:')} ${summary.important || 0}`);
  console.log(`  ${colors.magenta('Needs Follow-up:')} ${summary.needsFollowUp || 0}`);
  console.log('');
}

async function handleFollowups(options: EmailArgs['options']): Promise<void> {
  console.log(colors.dim('Getting emails needing follow-up...'));

  const result = await executeTool('getEmailFollowups', { limit: options.limit || 10 });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get follow-ups"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  const emails = Array.isArray(result.result) ? result.result : [];

  if (emails.length === 0) {
    console.log(colors.green('✨ No emails need follow-up!'));
    return;
  }

  console.log(colors.bold(`\n⏳ Emails Needing Follow-up (${emails.length})\n`));

  for (const email of emails as Email[]) {
    console.log(formatEmail(email));
    console.log('');
  }
}

async function handleImportant(options: EmailArgs['options']): Promise<void> {
  console.log(colors.dim('Getting important emails...'));

  const result = await executeTool('getImportantEmails', { limit: options.limit || 10 });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get important emails"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  const emails = Array.isArray(result.result) ? result.result : [];

  if (emails.length === 0) {
    console.log(colors.yellow('No important emails found'));
    return;
  }

  console.log(colors.bold(`\n🔥 Important Emails (${emails.length})\n`));

  for (const email of emails as Email[]) {
    console.log(formatEmail(email));
    console.log('');
  }
}

async function handleUnread(options: EmailArgs['options']): Promise<void> {
  console.log(colors.dim('Getting unread emails...'));

  const result = await executeTool('getUnreadEmails', { limit: options.limit || 10 });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get unread emails"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  // Result might be a summary string
  if (typeof result.result === 'string') {
    console.log(colors.green(`📧 ${result.result}`));
    return;
  }

  const emails = Array.isArray(result.result) ? result.result : [];

  if (emails.length === 0) {
    console.log(colors.green('✨ No unread emails!'));
    return;
  }

  console.log(colors.bold(`\n📬 Unread Emails (${emails.length})\n`));

  for (const email of emails as Email[]) {
    console.log(formatEmail(email));
    console.log('');
  }
}

async function handleFrom(name: string, options: EmailArgs['options']): Promise<void> {
  console.log(colors.dim(`Getting emails from "${name}"...`));

  const result = await executeTool('searchEmails', {
    from: name,
    limit: options.limit || 10
  });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't search emails"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  const emails = Array.isArray(result.result) ? result.result : [];

  if (emails.length === 0) {
    console.log(colors.yellow(`No emails found from "${name}"`));
    return;
  }

  console.log(colors.bold(`\n📧 Emails from ${name} (${emails.length})\n`));

  for (const email of emails as Email[]) {
    console.log(formatEmail(email));
    console.log('');
  }
}

async function handleSearch(query: string, options: EmailArgs['options']): Promise<void> {
  console.log(colors.dim(`Searching emails for "${query}"...`));

  const result = await executeTool('searchEmails', {
    query,
    limit: options.limit || 10
  });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't search emails"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  const emails = Array.isArray(result.result) ? result.result : [];

  if (emails.length === 0) {
    console.log(colors.yellow(`No emails matching "${query}"`));
    return;
  }

  console.log(colors.bold(`\n🔍 Search Results (${emails.length})\n`));

  for (const email of emails as Email[]) {
    console.log(formatEmail(email));
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Default to summary if no args
  if (args.length === 0) {
    await handleSummary({ json: false });
    return;
  }

  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'summary':
    case 'inbox':
      await handleSummary(parsed.options);
      break;

    case 'followups':
    case 'followup':
    case 'follow-up':
    case 'follow-ups':
      await handleFollowups(parsed.options);
      break;

    case 'important':
    case 'priority':
    case 'urgent':
      await handleImportant(parsed.options);
      break;

    case 'unread':
    case 'new':
      await handleUnread(parsed.options);
      break;

    case 'from':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a name: ferni email from "John"'));
        return;
      }
      await handleFrom(parsed.query, parsed.options);
      break;

    case 'search':
    case 'find':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a search query: ferni email search "project"'));
        return;
      }
      await handleSearch(parsed.query, parsed.options);
      break;

    default:
      // Treat as search query
      if (parsed.command) {
        await handleSearch(parsed.command + (parsed.query ? ' ' + parsed.query : ''), parsed.options);
      } else {
        await handleSummary(parsed.options);
      }
  }
}

// Run
main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
