#!/usr/bin/env npx tsx
/**
 * Contacts CLI Command
 *
 * Manage contacts via the CLI.
 *
 * Usage:
 *   ferni contacts list           # List all contacts
 *   ferni contacts search "mom"   # Search contacts
 *   ferni contacts show "Jordan"  # Show contact details
 *   ferni contacts groups         # List contact groups
 *   ferni contacts add            # Add a new contact (interactive)
 *   ferni contacts needing-attention  # Contacts that need outreach
 *
 * @module cli/commands/contacts
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

interface Contact {
  id: string;
  name: string;
  nickname?: string;
  phone?: string;
  email?: string;
  relationship?: string;
  notes?: string;
  lastContact?: string;
  birthday?: string;
}

interface ContactGroup {
  id: string;
  name: string;
  memberCount: number;
}

interface ContactsArgs {
  command: string;
  query?: string;
  options: {
    limit?: number;
    group?: string;
    json?: boolean;
  };
}

function parseArgs(args: string[]): ContactsArgs {
  const options: ContactsArgs['options'] = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--group' && args[i + 1]) {
      options.group = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const command = positional[0]?.toLowerCase() || 'list';
  const query = positional.slice(1).join(' ') || undefined;

  return { command, query, options };
}

function showHelp(): void {
  console.log(`
${colors.bold('👥 Ferni Contacts CLI')}

${colors.cyan('Usage:')}
  ferni contacts <command> [options]

${colors.cyan('Commands:')}
  ${colors.green('list')}                  List all contacts
  ${colors.green('search <query>')}        Search contacts by name
  ${colors.green('show <name>')}           Show contact details
  ${colors.green('groups')}                List contact groups
  ${colors.green('needing-attention')}     Contacts that need outreach
  ${colors.green('add')}                   Add a new contact (coming soon)

${colors.cyan('Options:')}
  --limit <n>           Limit results (default: 20)
  --group <name>        Filter by group
  --json                Output as JSON

${colors.cyan('Examples:')}
  ferni contacts list
  ferni contacts search "mom"
  ferni contacts show "Jordan"
  ferni contacts list --group "Family"
  ferni contacts needing-attention --limit 5
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

    // Add userId as query param for GET requests
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

function formatContact(contact: Contact, detailed = false): string {
  const lines: string[] = [];

  // Name with relationship
  let nameLine = colors.bold(contact.name);
  if (contact.nickname) {
    nameLine += colors.dim(` (${contact.nickname})`);
  }
  if (contact.relationship) {
    nameLine += colors.cyan(` · ${contact.relationship}`);
  }
  lines.push(nameLine);

  if (detailed) {
    if (contact.phone) {
      lines.push(`  ${colors.dim('📱')} ${contact.phone}`);
    }
    if (contact.email) {
      lines.push(`  ${colors.dim('📧')} ${contact.email}`);
    }
    if (contact.birthday) {
      lines.push(`  ${colors.dim('🎂')} ${contact.birthday}`);
    }
    if (contact.lastContact) {
      const lastDate = new Date(contact.lastContact);
      const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      lines.push(`  ${colors.dim('📅')} Last contact: ${daysAgo === 0 ? 'Today' : `${daysAgo} days ago`}`);
    }
    if (contact.notes) {
      lines.push(`  ${colors.dim('📝')} ${contact.notes}`);
    }
  } else {
    // Compact view
    const details: string[] = [];
    if (contact.phone) details.push(contact.phone);
    if (contact.email) details.push(contact.email);
    if (details.length > 0) {
      lines.push(`  ${colors.dim(details.join(' · '))}`);
    }
  }

  return lines.join('\n');
}

async function handleList(options: ContactsArgs['options']): Promise<void> {
  console.log(colors.dim('Fetching contacts...'));

  const limit = options.limit || 20;
  let endpoint = `/api/contacts?limit=${limit}`;

  if (options.group) {
    endpoint += `&group=${encodeURIComponent(options.group)}`;
  }

  const result = await apiRequest(endpoint);

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const contacts = (result.data as { contacts?: Contact[] })?.contacts || [];

  if (options.json) {
    console.log(JSON.stringify(contacts, null, 2));
    return;
  }

  if (contacts.length === 0) {
    console.log(colors.yellow('No contacts found'));
    return;
  }

  console.log(colors.bold(`\n👥 Contacts (${contacts.length})\n`));

  for (const contact of contacts) {
    console.log(formatContact(contact));
    console.log('');
  }
}

async function handleSearch(query: string, options: ContactsArgs['options']): Promise<void> {
  console.log(colors.dim(`Searching for "${query}"...`));

  const limit = options.limit || 10;
  const endpoint = `/api/contacts/search?query=${encodeURIComponent(query)}&limit=${limit}`;

  const result = await apiRequest(endpoint);

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const contacts = (result.data as { contacts?: Contact[] })?.contacts || [];

  if (options.json) {
    console.log(JSON.stringify(contacts, null, 2));
    return;
  }

  if (contacts.length === 0) {
    console.log(colors.yellow(`No contacts matching "${query}"`));
    return;
  }

  console.log(colors.bold(`\n🔍 Search Results (${contacts.length})\n`));

  for (const contact of contacts) {
    console.log(formatContact(contact));
    console.log('');
  }
}

async function handleShow(name: string, options: ContactsArgs['options']): Promise<void> {
  console.log(colors.dim(`Looking up "${name}"...`));

  // First search for the contact
  const endpoint = `/api/contacts/search?query=${encodeURIComponent(name)}&limit=1`;
  const result = await apiRequest(endpoint);

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const contacts = (result.data as { contacts?: Contact[] })?.contacts || [];

  if (contacts.length === 0) {
    console.log(colors.yellow(`No contact found matching "${name}"`));
    return;
  }

  const contact = contacts[0];

  if (options.json) {
    console.log(JSON.stringify(contact, null, 2));
    return;
  }

  console.log(colors.bold(`\n👤 ${contact.name}\n`));
  console.log(formatContact(contact, true));
  console.log('');
}

async function handleGroups(options: ContactsArgs['options']): Promise<void> {
  console.log(colors.dim('Fetching groups...'));

  const result = await apiRequest('/api/contacts/groups');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const groups = (result.data as { groups?: ContactGroup[] })?.groups || [];

  if (options.json) {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  if (groups.length === 0) {
    console.log(colors.yellow('No groups found'));
    return;
  }

  console.log(colors.bold(`\n📁 Contact Groups (${groups.length})\n`));

  for (const group of groups) {
    console.log(`  ${colors.cyan(group.name)} ${colors.dim(`(${group.memberCount} members)`)}`);
  }
  console.log('');
}

async function handleNeedingAttention(options: ContactsArgs['options']): Promise<void> {
  console.log(colors.dim('Finding contacts needing attention...'));

  const limit = options.limit || 10;
  const endpoint = `/api/contacts/needing-attention?limit=${limit}`;

  const result = await apiRequest(endpoint);

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error}`));
    return;
  }

  const contacts = (result.data as { contacts?: Contact[] })?.contacts || [];

  if (options.json) {
    console.log(JSON.stringify(contacts, null, 2));
    return;
  }

  if (contacts.length === 0) {
    console.log(colors.green('✨ All caught up! No contacts need immediate attention.'));
    return;
  }

  console.log(colors.bold(`\n💭 Contacts Needing Attention (${contacts.length})\n`));

  for (const contact of contacts) {
    let line = colors.bold(contact.name);
    if (contact.relationship) {
      line += colors.cyan(` · ${contact.relationship}`);
    }
    if (contact.lastContact) {
      const lastDate = new Date(contact.lastContact);
      const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      line += colors.yellow(` · ${daysAgo} days since contact`);
    }
    console.log(`  ${line}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'list':
    case 'ls':
      await handleList(parsed.options);
      break;

    case 'search':
    case 'find':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a search query: ferni contacts search "mom"'));
        return;
      }
      await handleSearch(parsed.query, parsed.options);
      break;

    case 'show':
    case 'get':
    case 'view':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a contact name: ferni contacts show "Jordan"'));
        return;
      }
      await handleShow(parsed.query, parsed.options);
      break;

    case 'groups':
    case 'group':
      await handleGroups(parsed.options);
      break;

    case 'needing-attention':
    case 'attention':
    case 'overdue':
      await handleNeedingAttention(parsed.options);
      break;

    case 'add':
    case 'create':
    case 'new':
      console.log(colors.yellow('Interactive contact creation coming soon!'));
      console.log(colors.dim('For now, use: ferni chat "remember that John\'s email is john@example.com"'));
      break;

    default:
      // If no command, try to interpret as search
      if (parsed.command && !parsed.command.startsWith('-')) {
        await handleSearch(parsed.command + (parsed.query ? ' ' + parsed.query : ''), parsed.options);
      } else {
        await handleList(parsed.options);
      }
  }
}

// Run
main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
