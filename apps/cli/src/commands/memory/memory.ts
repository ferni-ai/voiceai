#!/usr/bin/env npx tsx
/**
 * Memory/Brain CLI Command
 *
 * Search and manage Ferni's memory of you.
 *
 * Usage:
 *   ferni brain                          # What Ferni knows about you
 *   ferni brain search "mom birthday"    # Search memories
 *   ferni brain about "Jordan"           # What Ferni knows about someone
 *   ferni brain remember "My dog's name is Max"  # Add a memory
 *   ferni brain insights                 # Get personalized insights
 *   ferni brain stats                    # Memory system stats
 *
 * @module cli/commands/memory
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

interface MemoryArgs {
  command: string;
  query?: string;
  options: {
    limit?: number;
    json?: boolean;
    category?: string;
  };
}

function parseArgs(args: string[]): MemoryArgs {
  const options: MemoryArgs['options'] = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--category' && args[i + 1]) {
      options.category = args[++i];
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
${colors.bold('🧠 Ferni Brain/Memory CLI')}

${colors.cyan('Usage:')}
  ferni brain <command> [options]

${colors.cyan('Commands:')}
  ${colors.green('summary')}                   Overview of what Ferni knows
  ${colors.green('search <query>')}            Search your memories
  ${colors.green('about <name>')}              What Ferni knows about someone
  ${colors.green('remember <fact>')}           Teach Ferni something new
  ${colors.green('insights')}                  Get personalized insights
  ${colors.green('stats')}                     Memory system statistics
  ${colors.green('recent')}                    Recently learned facts

${colors.cyan('Options:')}
  --limit <n>           Limit results (default: 10)
  --category <name>     Filter by category (people, places, preferences, etc.)
  --json                Output as JSON

${colors.cyan('Examples:')}
  ferni brain
  ferni brain search "favorite restaurant"
  ferni brain about "Jordan"
  ferni brain remember "My favorite color is blue"
  ferni brain insights
  ferni brain recent --limit 20
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
        source: 'cli-memory',
      }),
    });

    const data = await response.json();
    return { success: data.success, result: data.result, error: data.error };
  } catch (error) {
    return { success: false, error: `API error: ${error}` };
  }
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

interface Memory {
  id: string;
  content: string;
  category?: string;
  confidence?: number;
  createdAt?: string;
  source?: string;
}

interface MemoryStats {
  totalMemories: number;
  categories: Record<string, number>;
  entities: number;
  relationships: number;
  lastUpdated?: string;
}

function formatMemory(memory: Memory): string {
  const lines: string[] = [];

  let line = `• ${memory.content}`;
  if (memory.category) {
    line = `${colors.cyan(`[${memory.category}]`)} ${memory.content}`;
  }
  lines.push(line);

  if (memory.confidence !== undefined || memory.createdAt) {
    const meta: string[] = [];
    if (memory.confidence !== undefined) {
      meta.push(`${Math.round(memory.confidence * 100)}% confidence`);
    }
    if (memory.createdAt) {
      const date = new Date(memory.createdAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      meta.push(daysAgo === 0 ? 'Today' : `${daysAgo}d ago`);
    }
    lines.push(`  ${colors.dim(meta.join(' · '))}`);
  }

  return lines.join('\n');
}

async function handleSummary(options: MemoryArgs['options']): Promise<void> {
  console.log(colors.dim('Getting memory summary...'));

  const result = await executeTool('recallFromMemory', { query: 'summary of what you know about me' });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get memory summary"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  if (typeof result.result === 'string') {
    console.log(colors.bold('\n🧠 What Ferni Knows About You\n'));
    console.log(`  ${result.result}`);
    console.log('');
  } else {
    const memories = Array.isArray(result.result) ? result.result : [];
    console.log(colors.bold(`\n🧠 Memory Summary (${memories.length} facts)\n`));
    for (const memory of memories as Memory[]) {
      console.log(formatMemory(memory));
    }
    console.log('');
  }
}

async function handleSearch(query: string, options: MemoryArgs['options']): Promise<void> {
  console.log(colors.dim(`Searching memories for "${query}"...`));

  const args: Record<string, unknown> = { query };
  if (options.limit) args.limit = options.limit;
  if (options.category) args.category = options.category;

  const result = await executeTool('recallFromMemory', args);

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't search memories"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  if (typeof result.result === 'string') {
    console.log(colors.green(`\n🔍 ${result.result}\n`));
  } else {
    const memories = Array.isArray(result.result) ? result.result : [];
    if (memories.length === 0) {
      console.log(colors.yellow(`No memories found for "${query}"`));
      return;
    }
    console.log(colors.bold(`\n🔍 Search Results (${memories.length})\n`));
    for (const memory of memories as Memory[]) {
      console.log(formatMemory(memory));
    }
    console.log('');
  }
}

async function handleAbout(name: string, options: MemoryArgs['options']): Promise<void> {
  console.log(colors.dim(`Getting what Ferni knows about "${name}"...`));

  const result = await executeTool('recallFromMemory', { about: name, query: name });

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't recall memories"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.result, null, 2));
    return;
  }

  if (typeof result.result === 'string') {
    console.log(colors.bold(`\n👤 About ${name}\n`));
    console.log(`  ${result.result}`);
    console.log('');
  } else {
    const memories = Array.isArray(result.result) ? result.result : [];
    if (memories.length === 0) {
      console.log(colors.yellow(`No memories found about "${name}"`));
      return;
    }
    console.log(colors.bold(`\n👤 About ${name} (${memories.length} facts)\n`));
    for (const memory of memories as Memory[]) {
      console.log(formatMemory(memory));
    }
    console.log('');
  }
}

async function handleRemember(fact: string): Promise<void> {
  console.log(colors.dim('Teaching Ferni...'));

  const result = await executeTool('rememberAboutUser', { fact });

  if (result.success) {
    console.log(colors.green(`✅ Got it! I'll remember that.`));
    console.log(colors.dim(`   "${fact}"`));
  } else {
    console.log(colors.red(`❌ ${result.error || "Couldn't save memory"}`));
  }
}

async function handleInsights(options: MemoryArgs['options']): Promise<void> {
  console.log(colors.dim('Generating insights from memories...'));

  const result = await apiRequest('/api/memory/insights');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't generate insights"}`));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  const insights = (result.data as { insights?: string[] })?.insights || [];

  if (insights.length === 0) {
    console.log(colors.yellow('No insights available yet. Chat more with Ferni to generate insights!'));
    return;
  }

  console.log(colors.bold('\n💡 Personalized Insights\n'));
  for (const insight of insights) {
    console.log(`  • ${insight}`);
  }
  console.log('');
}

async function handleStats(options: MemoryArgs['options']): Promise<void> {
  console.log(colors.dim('Getting memory statistics...'));

  const result = await apiRequest('/api/memory/metrics');

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get stats"}`));
    return;
  }

  const stats = result.data as MemoryStats;

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(colors.bold('\n📊 Memory Statistics\n'));
  console.log(`  ${colors.cyan('Total Memories:')} ${stats.totalMemories || 0}`);
  console.log(`  ${colors.cyan('Entities:')} ${stats.entities || 0}`);
  console.log(`  ${colors.cyan('Relationships:')} ${stats.relationships || 0}`);

  if (stats.categories && Object.keys(stats.categories).length > 0) {
    console.log(colors.bold('\n  By Category:'));
    for (const [category, count] of Object.entries(stats.categories)) {
      console.log(`    ${colors.dim(category)}: ${count}`);
    }
  }

  if (stats.lastUpdated) {
    console.log(colors.dim(`\n  Last updated: ${stats.lastUpdated}`));
  }
  console.log('');
}

async function handleRecent(options: MemoryArgs['options']): Promise<void> {
  console.log(colors.dim('Getting recently learned facts...'));

  const result = await apiRequest(`/api/memory/recent?limit=${options.limit || 10}`);

  if (!result.success) {
    console.log(colors.red(`❌ ${result.error || "Couldn't get recent memories"}`));
    return;
  }

  const memories = (result.data as { memories?: Memory[] })?.memories || [];

  if (options.json) {
    console.log(JSON.stringify(memories, null, 2));
    return;
  }

  if (memories.length === 0) {
    console.log(colors.yellow('No recent memories'));
    return;
  }

  console.log(colors.bold(`\n🕐 Recently Learned (${memories.length})\n`));
  for (const memory of memories) {
    console.log(formatMemory(memory));
  }
  console.log('');
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
    case 'show':
      await handleSummary(parsed.options);
      break;

    case 'search':
    case 'find':
    case 'recall':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a search query: ferni brain search "..."'));
        return;
      }
      await handleSearch(parsed.query, parsed.options);
      break;

    case 'about':
    case 'person':
    case 'who':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify a name: ferni brain about "Jordan"'));
        return;
      }
      await handleAbout(parsed.query, parsed.options);
      break;

    case 'remember':
    case 'learn':
    case 'add':
    case 'save':
      if (!parsed.query) {
        console.log(colors.red('❌ Please specify what to remember: ferni brain remember "..."'));
        return;
      }
      await handleRemember(parsed.query);
      break;

    case 'insights':
    case 'analyze':
      await handleInsights(parsed.options);
      break;

    case 'stats':
    case 'metrics':
    case 'status':
      await handleStats(parsed.options);
      break;

    case 'recent':
    case 'new':
    case 'latest':
      await handleRecent(parsed.options);
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
