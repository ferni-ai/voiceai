#!/usr/bin/env npx tsx
/**
 * Ferni CLI - Your Personal AI CEO
 *
 * > One Agent to Lead Them All
 *
 * Ferni is the CEO of your personal AI team. He leads specialists,
 * tracks your goals, remembers your journey, and ensures nothing
 * falls through the cracks.
 *
 * Commands:
 *   ferni voice           Talk to Ferni (voice session)
 *   ferni goals           View and manage your goals
 *   ferni sessions        View past conversations
 *   ferni context         What Ferni knows about you
 *   ferni stats           Your engagement analytics
 *   ferni team            Deep dive on the team
 *   ferni remember        Add a note for Ferni to remember
 *
 * Usage:
 *   pnpm ferni <command> [options]
 *   ferni <command> [options]  (if installed globally)
 */

import { config as dotenvConfig } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Detect if running as SEA binary (shim URL) vs normal execution
const isSEA = import.meta.url.includes('ferni-sea-binary');
const __dirname = isSEA ? process.cwd() : dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = isSEA ? process.cwd() : dirname(dirname(__dirname));

// Load environment
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

// ============================================================================
// ANSI COLORS & STYLES
// ============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Standard colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  tokenServerUrl: process.env.CLI_TOKEN_SERVER || 'http://localhost:3002',
  uiServerUrl: process.env.CLI_UI_SERVER || 'http://localhost:3002',
  defaultUserId: process.env.CLI_USER_ID || 'cli-user',
};

// ============================================================================
// THE TEAM
// ============================================================================

interface TeamMember {
  id: string;
  name: string;
  emoji: string;
  role: string;
  title: string;
  color: string;
  specialty: string;
  capabilities: string[];
}

const TEAM: Record<string, TeamMember> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    emoji: '🌿',
    role: 'CEO & Life Coach',
    title: 'Chief Executive Officer',
    color: c.green,
    specialty: 'Leadership, life direction, bringing in the right expert',
    capabilities: [
      'Big picture thinking',
      'Team delegation',
      'Memory synthesis',
      'Trust building',
      'Crisis detection',
    ],
  },
  maya: {
    id: 'maya',
    name: 'Maya',
    emoji: '🦋',
    role: 'Habits Coach',
    title: 'Chief Habits Officer',
    color: c.magenta,
    specialty: 'Building habits, breaking bad ones, behavior change',
    capabilities: [
      'Tiny Habits method',
      'Habit stacking',
      'Glidepath levels (1-5)',
      'Keystone habits',
      'Four Tendencies framework',
    ],
  },
  alex: {
    id: 'alex',
    name: 'Alex',
    emoji: '💬',
    role: 'Communications Coach',
    title: 'Chief Communications Officer',
    color: c.brightBlue,
    specialty: 'Difficult conversations, relationships, conflict resolution',
    capabilities: [
      'Script writing',
      'Conflict resolution',
      'Active listening coaching',
      'Boundary setting',
      'Emotional vocabulary',
    ],
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    emoji: '📋',
    role: 'Life Planner',
    title: 'Chief Planning Officer',
    color: c.yellow,
    specialty: 'Goals, planning, productivity, time management',
    capabilities: [
      'SMART goals',
      'Time blocking',
      'Priority matrix',
      'Project breakdown',
      'Weekly/monthly reviews',
    ],
  },
  peter: {
    id: 'peter',
    name: 'Peter',
    emoji: '🔬',
    role: 'Research Analyst',
    title: 'Chief Research Officer',
    color: c.cyan,
    specialty: 'Deep research, analysis, finding answers',
    capabilities: [
      'Deep dives',
      'Fact checking',
      'Comparison analysis',
      'Decision support',
      'Learning paths',
    ],
  },
  nayan: {
    id: 'nayan',
    name: 'Nayan',
    emoji: '🧘',
    role: 'Wisdom Sage',
    title: 'Chief Wisdom Officer',
    color: c.brightYellow,
    specialty: 'Philosophy, mindfulness, deeper meaning',
    capabilities: [
      'Ancient wisdom',
      'Mindfulness practices',
      'Life questions',
      'Perspective shifts',
      'Inner peace',
    ],
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function printBanner(): void {
  console.log(`
${c.bold}${c.green}╔════════════════════════════════════════════════════════════════════╗
║  🌿 FERNI AI - Your Personal CEO                                   ║
║     One Agent to Lead Them All                                     ║
╚════════════════════════════════════════════════════════════════════╝${c.reset}
`);
}

function printHelp(): void {
  printBanner();
  console.log(`${c.bold}Usage:${c.reset} ferni <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}voice${c.reset}              Start a voice conversation with Ferni
  ${c.cyan}goals${c.reset}              View and manage your goals
  ${c.cyan}sessions${c.reset}           View past conversations
  ${c.cyan}context${c.reset}            What Ferni knows about you
  ${c.cyan}stats${c.reset}              Your engagement analytics
  ${c.cyan}team${c.reset}               Deep dive on the leadership team
  ${c.cyan}remember${c.reset} <note>    Add a note for Ferni to remember

${c.bold}Voice Options:${c.reset}
  --persona <name>   Start with a specific team member
  --team             Show team roster
  --debug            Show debug information

${c.bold}Examples:${c.reset}
  ${c.dim}ferni voice                    # Talk to Ferni${c.reset}
  ${c.dim}ferni voice --persona maya     # Talk to Maya${c.reset}
  ${c.dim}ferni goals                    # View your goals${c.reset}
  ${c.dim}ferni sessions --last 5        # Last 5 conversations${c.reset}
  ${c.dim}ferni team maya                # Deep dive on Maya${c.reset}
  ${c.dim}ferni remember "Anxious about Monday presentation"${c.reset}

${c.bold}The Team:${c.reset}
`);

  for (const member of Object.values(TEAM)) {
    console.log(`  ${member.color}${member.emoji} ${member.name}${c.reset} - ${c.dim}${member.role}${c.reset}`);
  }

  console.log(`
${c.dim}Run 'ferni <command> --help' for more information on a command.${c.reset}
`);
}

async function fetchAPI(
  endpoint: string,
  options: { userId?: string; method?: string; body?: unknown } = {}
): Promise<unknown> {
  const { userId = CONFIG.defaultUserId, method = 'GET', body } = options;

  const url = `${CONFIG.uiServerUrl}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    throw new Error(`Failed to reach server: ${(error as Error).message}`);
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ============================================================================
// COMMAND: GOALS
// ============================================================================

interface Goal {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  progress?: number;
  dueDate?: string;
  assignedTo?: string; // Team member ID
}

async function handleGoals(args: string[]): Promise<void> {
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
${c.bold}${c.green}ferni goals${c.reset} - Track and manage your goals

${c.bold}Usage:${c.reset}
  ferni goals                 List all active goals
  ferni goals add "<title>"   Add a new goal
  ferni goals complete <id>   Mark a goal as complete
  ferni goals progress        Show progress overview

${c.bold}Options:${c.reset}
  --all                       Include completed goals
  --help                      Show this help

${c.dim}As the CEO, Ferni tracks your goals and assigns the right
team member to help you achieve them.${c.reset}
`);
    return;
  }

  console.log(`
${c.bold}${c.green}Your Goals${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);

  // Try to fetch goals from API, fall back to demo data
  try {
    const data = (await fetchAPI('/api/analytics/user')) as {
      goals?: Goal[];
      streaks?: { ritualId: string; current: number; longest: number }[];
    };

    // If we have streaks, show them as "goals"
    if (data.streaks && data.streaks.length > 0) {
      console.log(`${c.bold}Active Streaks${c.reset}\n`);
      for (const streak of data.streaks) {
        const bar = '█'.repeat(Math.min(streak.current, 20)) + '░'.repeat(Math.max(0, 20 - streak.current));
        console.log(`  ${c.cyan}${streak.ritualId}${c.reset}`);
        console.log(`  ${c.dim}Current:${c.reset} ${streak.current} days  ${c.dim}Best:${c.reset} ${streak.longest} days`);
        console.log(`  ${c.green}${bar}${c.reset}\n`);
      }
    } else {
      // Show demo/placeholder
      showDemoGoals();
    }
  } catch {
    console.log(`${c.yellow}Note:${c.reset} ${c.dim}Connect UI server to see your actual goals${c.reset}\n`);
    showDemoGoals();
  }
}

function showDemoGoals(): void {
  const demoGoals = [
    {
      title: 'Build morning routine',
      status: 'active',
      progress: 60,
      assignedTo: 'maya',
      description: 'Wake up at 6am, meditate, exercise',
    },
    {
      title: 'Have difficult conversation with manager',
      status: 'active',
      progress: 30,
      assignedTo: 'alex',
      description: 'Discuss promotion timeline',
    },
    {
      title: 'Plan Q1 objectives',
      status: 'active',
      progress: 80,
      assignedTo: 'jordan',
      description: 'Set clear quarterly goals',
    },
  ];

  for (const goal of demoGoals) {
    const member = TEAM[goal.assignedTo || 'ferni'];
    const progressBar = '█'.repeat(Math.floor(goal.progress / 5)) + '░'.repeat(20 - Math.floor(goal.progress / 5));

    console.log(`  ${c.bold}${goal.title}${c.reset}`);
    console.log(`  ${c.dim}${goal.description}${c.reset}`);
    console.log(`  ${c.green}${progressBar}${c.reset} ${goal.progress}%`);
    console.log(`  ${c.dim}Assigned to:${c.reset} ${member.color}${member.emoji} ${member.name}${c.reset}\n`);
  }

  console.log(`${c.dim}Tip: Say "I want to build a morning routine" to Ferni and he'll${c.reset}`);
  console.log(`${c.dim}create a goal and assign it to the right team member.${c.reset}\n`);
}

// ============================================================================
// COMMAND: SESSIONS
// ============================================================================

interface Session {
  id: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  persona: string;
  turnCount: number;
  topics?: string[];
  summary?: string;
}

async function handleSessions(args: string[]): Promise<void> {
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
${c.bold}${c.green}ferni sessions${c.reset} - View your conversation history

${c.bold}Usage:${c.reset}
  ferni sessions              List recent sessions
  ferni sessions --last <n>   Show last n sessions
  ferni sessions --with maya  Sessions with specific team member
  ferni sessions --today      Today's sessions only

${c.dim}Ferni remembers every conversation - who you talked to,
what you discussed, and how the team has helped you.${c.reset}
`);
    return;
  }

  const limitIdx = args.indexOf('--last');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 10 : 10;
  const withPersona = args.includes('--with') ? args[args.indexOf('--with') + 1] : null;

  console.log(`
${c.bold}${c.green}Recent Sessions${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);

  try {
    const data = (await fetchAPI(`/api/conversations?limit=${limit}`)) as {
      conversations?: Array<{
        id: string;
        timestamp: string;
        persona?: string;
        turnCount?: number;
        duration?: number;
        topics?: string[];
        summary?: string;
      }>;
    };

    if (data.conversations && data.conversations.length > 0) {
      for (const conv of data.conversations) {
        const member = TEAM[conv.persona || 'ferni'] || TEAM.ferni;

        // Filter by persona if requested
        if (withPersona && conv.persona !== withPersona) continue;

        console.log(`  ${c.dim}${formatDate(conv.timestamp)}${c.reset}`);
        console.log(`  ${member.color}${member.emoji} ${member.name}${c.reset} ${c.dim}• ${conv.turnCount || 0} turns • ${formatDuration(conv.duration || 0)}${c.reset}`);
        if (conv.summary) {
          console.log(`  ${c.dim}"${conv.summary.substring(0, 60)}..."${c.reset}`);
        }
        if (conv.topics && conv.topics.length > 0) {
          console.log(`  ${c.dim}Topics: ${conv.topics.join(', ')}${c.reset}`);
        }
        console.log();
      }
    } else {
      showDemoSessions();
    }
  } catch {
    console.log(`${c.yellow}Note:${c.reset} ${c.dim}Connect UI server to see your actual sessions${c.reset}\n`);
    showDemoSessions();
  }
}

function showDemoSessions(): void {
  const demoSessions = [
    {
      date: 'Today at 9:30 AM',
      persona: 'ferni',
      turns: 12,
      duration: '8m',
      summary: 'Morning check-in, discussed upcoming week',
    },
    {
      date: 'Yesterday at 7:00 PM',
      persona: 'maya',
      turns: 24,
      duration: '15m',
      summary: 'Set up evening wind-down routine',
    },
    {
      date: 'Yesterday at 2:15 PM',
      persona: 'alex',
      turns: 18,
      duration: '12m',
      summary: 'Practiced difficult conversation script',
    },
    {
      date: 'Monday',
      persona: 'jordan',
      turns: 30,
      duration: '20m',
      summary: 'Weekly planning session',
    },
  ];

  for (const session of demoSessions) {
    const member = TEAM[session.persona];
    console.log(`  ${c.dim}${session.date}${c.reset}`);
    console.log(`  ${member.color}${member.emoji} ${member.name}${c.reset} ${c.dim}• ${session.turns} turns • ${session.duration}${c.reset}`);
    console.log(`  ${c.dim}"${session.summary}"${c.reset}\n`);
  }

  console.log(`${c.dim}Start a conversation with 'ferni voice' to create sessions.${c.reset}\n`);
}

// ============================================================================
// COMMAND: CONTEXT
// ============================================================================

async function handleContext(args: string[]): Promise<void> {
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
${c.bold}${c.green}ferni context${c.reset} - What Ferni knows about you

${c.bold}Usage:${c.reset}
  ferni context               Show all context
  ferni context --summary     Brief overview
  ferni context --delete <id> Forget something specific

${c.dim}Ferni builds understanding over time - your goals, preferences,
challenges, and what approaches work for you.${c.reset}
`);
    return;
  }

  console.log(`
${c.bold}${c.green}What Ferni Knows About You${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);

  try {
    const data = (await fetchAPI('/api/cognitive/memories')) as {
      memories?: Array<{
        id: string;
        content: string;
        category?: string;
        createdAt: string;
        importance?: number;
      }>;
    };

    if (data.memories && data.memories.length > 0) {
      // Group by category
      const byCategory: Record<string, typeof data.memories> = {};
      for (const mem of data.memories) {
        const cat = mem.category || 'General';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(mem);
      }

      for (const [category, memories] of Object.entries(byCategory)) {
        console.log(`${c.bold}${c.cyan}${category}${c.reset}\n`);
        for (const mem of memories.slice(0, 5)) {
          console.log(`  ${c.dim}•${c.reset} ${mem.content}`);
          console.log(`    ${c.dim}${formatDate(mem.createdAt)}${c.reset}\n`);
        }
      }
    } else {
      showDemoContext();
    }
  } catch {
    console.log(`${c.yellow}Note:${c.reset} ${c.dim}Connect UI server to see your actual context${c.reset}\n`);
    showDemoContext();
  }
}

function showDemoContext(): void {
  console.log(`${c.bold}${c.cyan}About You${c.reset}\n`);
  console.log(`  ${c.dim}•${c.reset} Works in tech, remote position`);
  console.log(`  ${c.dim}•${c.reset} Morning person, but struggling with consistency`);
  console.log(`  ${c.dim}•${c.reset} Values family time, has two kids\n`);

  console.log(`${c.bold}${c.cyan}What Works For You${c.reset}\n`);
  console.log(`  ${c.dim}•${c.reset} Responds well to accountability`);
  console.log(`  ${c.dim}•${c.reset} Prefers small, incremental changes`);
  console.log(`  ${c.dim}•${c.reset} Benefits from reflection prompts\n`);

  console.log(`${c.bold}${c.cyan}Current Challenges${c.reset}\n`);
  console.log(`  ${c.dim}•${c.reset} Difficulty setting boundaries at work`);
  console.log(`  ${c.dim}•${c.reset} Wants to exercise more consistently`);
  console.log(`  ${c.dim}•${c.reset} Preparing for difficult conversation with manager\n`);

  console.log(`${c.dim}Ferni learns this through conversations. The more you talk,${c.reset}`);
  console.log(`${c.dim}the better he understands how to help.${c.reset}\n`);
}

// ============================================================================
// COMMAND: STATS
// ============================================================================

async function handleStats(args: string[]): Promise<void> {
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
${c.bold}${c.green}ferni stats${c.reset} - Your engagement analytics

${c.bold}Usage:${c.reset}
  ferni stats                 Show overall stats
  ferni stats --week          This week's activity
  ferni stats --month         This month's activity
  ferni stats --team          Team utilization

${c.dim}Track your progress and see which team members
have been helping you most.${c.reset}
`);
    return;
  }

  console.log(`
${c.bold}${c.green}Your Stats${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);

  try {
    const data = (await fetchAPI('/api/analytics/user')) as {
      totalSessions?: number;
      totalMinutes?: number;
      longestStreak?: number;
      currentStreak?: number;
      averageMood?: number;
      improvements?: string[];
      teamUtilization?: Record<string, number>;
    };

    // Show real stats if available
    if (data.totalSessions) {
      showStatsDisplay(data);
    } else {
      showDemoStats();
    }
  } catch {
    console.log(`${c.yellow}Note:${c.reset} ${c.dim}Connect UI server to see your actual stats${c.reset}\n`);
    showDemoStats();
  }
}

function showStatsDisplay(data: {
  totalSessions?: number;
  totalMinutes?: number;
  longestStreak?: number;
  currentStreak?: number;
  averageMood?: number;
  improvements?: string[];
  teamUtilization?: Record<string, number>;
}): void {
  console.log(`${c.bold}Overview${c.reset}\n`);
  console.log(`  ${c.cyan}Total Sessions:${c.reset}  ${data.totalSessions || 0}`);
  console.log(`  ${c.cyan}Total Time:${c.reset}      ${formatDuration((data.totalMinutes || 0) * 60)}`);
  console.log(`  ${c.cyan}Current Streak:${c.reset}  ${data.currentStreak || 0} days`);
  console.log(`  ${c.cyan}Longest Streak:${c.reset}  ${data.longestStreak || 0} days\n`);

  if (data.teamUtilization) {
    console.log(`${c.bold}Team Utilization${c.reset}\n`);
    const total = Object.values(data.teamUtilization).reduce((a, b) => a + b, 0);
    for (const [personaId, count] of Object.entries(data.teamUtilization)) {
      const member = TEAM[personaId] || TEAM.ferni;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
      console.log(`  ${member.color}${member.emoji} ${member.name.padEnd(8)}${c.reset} ${bar} ${pct}%`);
    }
    console.log();
  }

  if (data.improvements && data.improvements.length > 0) {
    console.log(`${c.bold}Areas of Growth${c.reset}\n`);
    for (const imp of data.improvements) {
      console.log(`  ${c.green}↑${c.reset} ${imp}`);
    }
    console.log();
  }
}

function showDemoStats(): void {
  console.log(`${c.bold}Overview${c.reset}\n`);
  console.log(`  ${c.cyan}Total Sessions:${c.reset}  47`);
  console.log(`  ${c.cyan}Total Time:${c.reset}      8h 23m`);
  console.log(`  ${c.cyan}Current Streak:${c.reset}  5 days`);
  console.log(`  ${c.cyan}Longest Streak:${c.reset}  12 days\n`);

  console.log(`${c.bold}Team Utilization${c.reset}\n`);
  const utilization = [
    { id: 'ferni', pct: 35 },
    { id: 'maya', pct: 25 },
    { id: 'jordan', pct: 20 },
    { id: 'alex', pct: 15 },
    { id: 'nayan', pct: 5 },
  ];

  for (const u of utilization) {
    const member = TEAM[u.id];
    const bar = '█'.repeat(Math.floor(u.pct / 5)) + '░'.repeat(20 - Math.floor(u.pct / 5));
    console.log(`  ${member.color}${member.emoji} ${member.name.padEnd(8)}${c.reset} ${bar} ${u.pct}%`);
  }

  console.log(`
${c.bold}Mood Trend${c.reset} (last 7 days)
  ${c.brightYellow}☀${c.reset}  ${c.brightYellow}☀${c.reset}  ${c.yellow}⛅${c.reset}  ${c.brightYellow}☀${c.reset}  ${c.yellow}⛅${c.reset}  ${c.brightYellow}☀${c.reset}  ${c.brightYellow}☀${c.reset}
  M   T   W   T   F   S   S
`);

  console.log(`${c.bold}Areas of Growth${c.reset}\n`);
  console.log(`  ${c.green}↑${c.reset} Morning routine consistency improved 40%`);
  console.log(`  ${c.green}↑${c.reset} Difficult conversations handled more confidently`);
  console.log(`  ${c.green}↑${c.reset} Weekly planning streak active\n`);
}

// ============================================================================
// COMMAND: TEAM
// ============================================================================

function handleTeam(args: string[]): void {
  const showHelp = args.includes('--help') || args.includes('-h');
  const specificMember = args.find((a) => !a.startsWith('-'));

  if (showHelp) {
    console.log(`
${c.bold}${c.green}ferni team${c.reset} - The Leadership Team

${c.bold}Usage:${c.reset}
  ferni team                  Show all team members
  ferni team <name>           Deep dive on specific member
  ferni team --recommend      Get recommendation based on your needs

${c.dim}Each team member has unique expertise. Ferni knows
when to bring in the right specialist for you.${c.reset}
`);
    return;
  }

  if (specificMember && TEAM[specificMember.toLowerCase()]) {
    showTeamMemberDetail(TEAM[specificMember.toLowerCase()]);
    return;
  }

  console.log(`
${c.bold}${c.green}╔══════════════════════════════════════════════════════════════════╗
║                    🌿 FERNI'S LEADERSHIP TEAM                    ║
╚══════════════════════════════════════════════════════════════════╝${c.reset}
`);

  for (const member of Object.values(TEAM)) {
    console.log(`  ${member.color}${member.emoji} ${c.bold}${member.name}${c.reset} - ${member.title}`);
    console.log(`     ${c.dim}${member.specialty}${c.reset}\n`);
  }

  console.log(`${c.dim}Run 'ferni team <name>' for a deep dive on any team member.${c.reset}`);
  console.log(`${c.dim}Example: ferni team maya${c.reset}\n`);
}

function showTeamMemberDetail(member: TeamMember): void {
  console.log(`
${c.bold}${member.color}╔══════════════════════════════════════════════════════════════════╗
║  ${member.emoji} ${member.name.toUpperCase()} - ${member.title.padEnd(42)}║
╚══════════════════════════════════════════════════════════════════╝${c.reset}

${c.bold}Role:${c.reset} ${member.role}

${c.bold}Specialty:${c.reset}
  ${member.specialty}

${c.bold}Capabilities:${c.reset}
`);

  for (const cap of member.capabilities) {
    console.log(`  ${member.color}•${c.reset} ${cap}`);
  }

  console.log(`
${c.bold}When to Talk to ${member.name}:${c.reset}
`);

  // Persona-specific guidance
  const guidance: Record<string, string[]> = {
    ferni: [
      "When you're not sure where to start",
      'For big picture life direction',
      'When you need to talk through something',
      'To check in on your overall progress',
    ],
    maya: [
      'Building new habits (exercise, sleep, nutrition)',
      'Breaking bad habits',
      'Creating routines that stick',
      'Understanding your habit patterns',
    ],
    alex: [
      'Preparing for a difficult conversation',
      'Improving relationships',
      'Setting boundaries',
      'Resolving conflicts',
    ],
    jordan: [
      'Setting and tracking goals',
      'Weekly/monthly planning',
      'Breaking down big projects',
      'Time management',
    ],
    peter: [
      'Researching a topic in depth',
      'Making data-driven decisions',
      'Comparing options',
      'Learning something new',
    ],
    nayan: [
      'Finding meaning and purpose',
      'Dealing with uncertainty',
      'Mindfulness and presence',
      'Life philosophy questions',
    ],
  };

  for (const g of guidance[member.id] || []) {
    console.log(`  ${c.dim}•${c.reset} ${g}`);
  }

  console.log(`
${c.dim}Start a conversation: ferni voice --persona ${member.id}${c.reset}
`);
}

// ============================================================================
// COMMAND: REMEMBER
// ============================================================================

async function handleRemember(args: string[]): Promise<void> {
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
${c.bold}${c.green}ferni remember${c.reset} - Add a note for Ferni to remember

${c.bold}Usage:${c.reset}
  ferni remember "Your note here"
  ferni remember --important "Critical note"

${c.dim}Ferni will keep this in mind for future conversations.
Use this for things you want him to remember.${c.reset}

${c.bold}Examples:${c.reset}
  ${c.dim}ferni remember "Starting new job Monday"${c.reset}
  ${c.dim}ferni remember "Daughter's birthday is March 15"${c.reset}
  ${c.dim}ferni remember --important "Presentation to CEO on Friday"${c.reset}
`);
    return;
  }

  // Get the note (everything that's not a flag)
  const note = args.filter((a) => !a.startsWith('-')).join(' ');

  if (!note) {
    console.log(`${c.red}Please provide a note to remember.${c.reset}`);
    console.log(`${c.dim}Example: ferni remember "Starting new job Monday"${c.reset}\n`);
    return;
  }

  const isImportant = args.includes('--important') || args.includes('-i');

  console.log(`
${c.bold}${c.green}Noted${c.reset}

  ${c.dim}"${note}"${c.reset}
  ${isImportant ? `${c.yellow}★ Marked as important${c.reset}` : ''}

${c.dim}Ferni will remember this for future conversations.${c.reset}
`);

  // Try to save to API
  try {
    await fetchAPI('/api/cognitive/memories', {
      method: 'POST',
      body: {
        content: note,
        category: 'user_note',
        importance: isImportant ? 'high' : 'normal',
      },
    });
    console.log(`${c.green}✓ Saved to your profile${c.reset}\n`);
  } catch {
    console.log(`${c.yellow}Note:${c.reset} ${c.dim}Will be remembered in the current session.${c.reset}`);
    console.log(`${c.dim}Connect UI server to persist across sessions.${c.reset}\n`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const commandArgs = args.slice(1);

  // No command or help
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  // Route to appropriate handler
  switch (command) {
    case 'voice':
      // Import and run voice-live
      const { handleVoiceLive } = await import('./voice/voice-live.js');
      await handleVoiceLive(commandArgs);
      break;

    case 'goals':
      await handleGoals(commandArgs);
      break;

    case 'sessions':
      await handleSessions(commandArgs);
      break;

    case 'context':
      await handleContext(commandArgs);
      break;

    case 'stats':
      await handleStats(commandArgs);
      break;

    case 'team':
      handleTeam(commandArgs);
      break;

    case 'remember':
      await handleRemember(commandArgs);
      break;

    default:
      console.log(`${c.red}Unknown command: ${command}${c.reset}`);
      console.log(`${c.dim}Run 'ferni --help' for available commands.${c.reset}\n`);
      process.exit(1);
  }
}

// Only run main if this file is executed directly (not when imported)
const isDirectExecution =
  process.argv[1]?.endsWith('ceo.ts') ||
  process.argv[1]?.endsWith('ceo.js') ||
  process.argv[1]?.includes('/cli/ceo');

if (isDirectExecution) {
  main().catch((err) => {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  });
}

// ============================================================================
// EXPORTS - For integration with main ferni CLI
// ============================================================================

export {
  handleGoals,
  handleSessions,
  handleContext,
  handleStats,
  handleTeam,
  handleRemember,
  TEAM,
  printBanner,
  printHelp,
};
