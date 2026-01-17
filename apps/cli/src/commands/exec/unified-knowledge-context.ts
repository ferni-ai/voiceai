#!/usr/bin/env npx tsx
/**
 * Unified Knowledge Context
 *
 * Superhuman capability: Total recall across all executive functions.
 *
 * A human assistant might know bits and pieces, but this system:
 * - Remembers every decision, its context, and outcome
 * - Tracks patterns across months of data
 * - Connects insights from different time periods
 * - Never forgets a commitment or promise
 * - Maintains relationship context with stakeholders
 *
 * This is the "institutional memory" that companies usually lose.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

// Import CEO storage for real decision data
import {
  getUserId,
  getPendingDecisions,
  getRecentWins,
  getActiveBlockers,
  getPriorities,
} from '../ceo/storage-client.js';

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
};

// ============================================================================
// TYPES
// ============================================================================

interface KnowledgeEntry {
  id: string;
  type: 'decision' | 'commitment' | 'insight' | 'relationship' | 'milestone' | 'lesson' | 'goal';
  content: string;
  context?: string;
  domain?: string;
  stakeholders?: string[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  linkedEntries?: string[];
  outcome?: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
}

interface Stakeholder {
  id: string;
  name: string;
  role: string;
  relationship: 'investor' | 'board' | 'team' | 'customer' | 'partner' | 'advisor';
  lastInteraction?: string;
  notes: string[];
  preferences?: string[];
  commitmentsMade?: string[];
  commitmentsReceived?: string[];
}

interface TimelineEvent {
  date: string;
  type: string;
  description: string;
  impact?: 'positive' | 'negative' | 'neutral';
  entryId?: string;
}

interface KnowledgeStore {
  entries: KnowledgeEntry[];
  stakeholders: Stakeholder[];
  timeline: TimelineEvent[];
  searchIndex: Record<string, string[]>; // tag -> entryIds
}

// ============================================================================
// STORAGE
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const KNOWLEDGE_FILE = join(CONFIG_DIR, 'unified-knowledge.json');

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function loadKnowledge(): Promise<KnowledgeStore> {
  // Load local knowledge store
  let store: KnowledgeStore;
  try {
    const data = await fs.readFile(KNOWLEDGE_FILE, 'utf-8');
    store = JSON.parse(data);
  } catch {
    store = { entries: [], stakeholders: [], timeline: [], searchIndex: {} };
  }

  // Merge in CEO decisions and data from Firestore
  try {
    const userId = await getUserId();
    if (userId) {
      const [decisions, wins, blockers, priorities] = await Promise.all([
        getPendingDecisions().catch(() => []),
        getRecentWins(30).catch(() => []),
        getActiveBlockers().catch(() => []),
        getPriorities().catch(() => []),
      ]);

      // Convert CEO decisions to knowledge entries (if not already present)
      for (const decision of decisions) {
        const existingEntry = store.entries.find(e => e.id === `ceo-decision-${decision.id}`);
        if (!existingEntry) {
          store.entries.push({
            id: `ceo-decision-${decision.id}`,
            type: 'decision',
            content: decision.description,
            domain: 'ceo',
            tags: ['ceo', 'decision', decision.status],
            importance: decision.deadline ? 'high' : 'medium',
            createdAt: decision.createdAt,
            updatedAt: decision.decidedAt || decision.createdAt,
            outcome: decision.status === 'decided' ? 'positive' : undefined,
          });
        }
      }

      // Convert wins to milestones
      for (const win of wins) {
        const existingEntry = store.entries.find(e => e.id === `ceo-win-${win.id}`);
        if (!existingEntry) {
          store.entries.push({
            id: `ceo-win-${win.id}`,
            type: 'milestone',
            content: win.text,
            domain: 'ceo',
            tags: ['win', 'milestone', win.category || 'general'].filter(Boolean),
            importance: 'medium',
            createdAt: win.createdAt,
            updatedAt: win.createdAt,
            outcome: 'positive',
          });
        }
      }

      // Convert blockers to insights
      for (const blocker of blockers) {
        const existingEntry = store.entries.find(e => e.id === `ceo-blocker-${blocker.id}`);
        if (!existingEntry) {
          store.entries.push({
            id: `ceo-blocker-${blocker.id}`,
            type: 'insight',
            content: `BLOCKER: ${blocker.text}`,
            domain: 'ceo',
            tags: ['blocker', 'obstacle', 'ceo'],
            importance: 'high',
            createdAt: blocker.createdAt,
            updatedAt: blocker.resolvedAt || blocker.createdAt,
            outcome: blocker.status === 'resolved' ? 'positive' : undefined,
          });
        }
      }

      // Convert priorities to goals
      for (const priority of priorities) {
        const existingEntry = store.entries.find(e => e.id === `ceo-priority-${priority.id}`);
        if (!existingEntry) {
          store.entries.push({
            id: `ceo-priority-${priority.id}`,
            type: 'goal',
            content: priority.text,
            domain: 'ceo',
            tags: ['priority', 'goal', 'ceo'],
            importance: priority.order <= 3 ? 'critical' : 'high',
            createdAt: priority.createdAt,
            updatedAt: priority.completedAt || priority.createdAt,
            outcome: priority.status === 'completed' ? 'achieved' : undefined,
          });
        }
      }

      // Sort entries by date (most recent first)
      store.entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  } catch (e) {
    // Firestore not available, continue with local data only
    console.error('Could not sync with CEO data:', e);
  }

  return store;
}

async function saveKnowledge(store: KnowledgeStore): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(KNOWLEDGE_FILE, JSON.stringify(store, null, 2));
}

// ============================================================================
// KNOWLEDGE OPERATIONS
// ============================================================================

function addEntry(store: KnowledgeStore, entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeEntry {
  const now = new Date().toISOString();
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };

  store.entries.unshift(newEntry);

  // Update search index
  for (const tag of newEntry.tags) {
    if (!store.searchIndex[tag]) {
      store.searchIndex[tag] = [];
    }
    store.searchIndex[tag].push(newEntry.id);
  }

  // Add to timeline
  store.timeline.unshift({
    date: now,
    type: newEntry.type,
    description: newEntry.content.substring(0, 100),
    entryId: newEntry.id,
  });

  return newEntry;
}

function searchKnowledge(store: KnowledgeStore, query: string): KnowledgeEntry[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  return store.entries.filter(entry => {
    const searchText = `${entry.content} ${entry.context || ''} ${entry.tags.join(' ')}`.toLowerCase();
    return queryWords.every(word => searchText.includes(word));
  }).slice(0, 20);
}

function getRelatedEntries(store: KnowledgeStore, entryId: string): KnowledgeEntry[] {
  const entry = store.entries.find(e => e.id === entryId);
  if (!entry) return [];

  // Find entries with overlapping tags
  const relatedIds = new Set<string>();
  for (const tag of entry.tags) {
    const tagEntries = store.searchIndex[tag] || [];
    tagEntries.forEach(id => {
      if (id !== entryId) relatedIds.add(id);
    });
  }

  return store.entries.filter(e => relatedIds.has(e.id)).slice(0, 10);
}

function getCommitments(store: KnowledgeStore): KnowledgeEntry[] {
  return store.entries.filter(e => e.type === 'commitment' && !e.outcome);
}

function getUnfulfilledPromises(store: KnowledgeStore, stakeholderId?: string): string[] {
  const commitments = getCommitments(store);

  if (stakeholderId) {
    return commitments
      .filter(c => c.stakeholders?.includes(stakeholderId))
      .map(c => c.content);
  }

  return commitments.map(c => c.content);
}

function getStakeholderContext(store: KnowledgeStore, name: string): Stakeholder | undefined {
  return store.stakeholders.find(
    s => s.name.toLowerCase().includes(name.toLowerCase())
  );
}

function getRecentInteractions(store: KnowledgeStore, stakeholderId: string): TimelineEvent[] {
  return store.timeline.filter(e => {
    const entry = store.entries.find(en => en.id === e.entryId);
    return entry?.stakeholders?.includes(stakeholderId);
  }).slice(0, 10);
}

// ============================================================================
// SUPERHUMAN FEATURES
// ============================================================================

function detectPatterns(store: KnowledgeStore): string[] {
  const patterns: string[] = [];

  // Decision pattern analysis
  const decisions = store.entries.filter(e => e.type === 'decision');
  const positiveDecisions = decisions.filter(e => e.outcome === 'positive');
  const negativeDecisions = decisions.filter(e => e.outcome === 'negative');

  if (decisions.length >= 5) {
    const successRate = positiveDecisions.length / decisions.filter(d => d.outcome).length;
    patterns.push(`Decision success rate: ${Math.round(successRate * 100)}% (${positiveDecisions.length}/${decisions.filter(d => d.outcome).length})`);

    // Domain-specific patterns
    const domainDecisions: Record<string, { positive: number; total: number }> = {};
    for (const d of decisions.filter(d => d.outcome && d.domain)) {
      if (!domainDecisions[d.domain!]) {
        domainDecisions[d.domain!] = { positive: 0, total: 0 };
      }
      domainDecisions[d.domain!].total++;
      if (d.outcome === 'positive') {
        domainDecisions[d.domain!].positive++;
      }
    }

    for (const [domain, stats] of Object.entries(domainDecisions)) {
      if (stats.total >= 3) {
        const rate = Math.round((stats.positive / stats.total) * 100);
        if (rate >= 80) {
          patterns.push(`Strong in ${domain.toUpperCase()} decisions (${rate}% success)`);
        } else if (rate <= 40) {
          patterns.push(`Consider more input on ${domain.toUpperCase()} decisions (${rate}% success)`);
        }
      }
    }
  }

  // Commitment tracking
  const openCommitments = getCommitments(store);
  if (openCommitments.length > 5) {
    patterns.push(`${openCommitments.length} open commitments - consider reviewing priorities`);
  }

  // Stakeholder engagement
  const stakeholders = store.stakeholders;
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  for (const stakeholder of stakeholders) {
    if (stakeholder.lastInteraction && new Date(stakeholder.lastInteraction) < oneMonthAgo) {
      if (stakeholder.relationship === 'investor' || stakeholder.relationship === 'board') {
        patterns.push(`Haven't connected with ${stakeholder.name} in over a month`);
      }
    }
  }

  // Tag frequency analysis
  const tagCounts: Record<string, number> = {};
  for (const entry of store.entries.slice(0, 50)) {
    for (const tag of entry.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topTags.length >= 3) {
    patterns.push(`Top focus areas: ${topTags.map(([tag, count]) => `${tag} (${count})`).join(', ')}`);
  }

  return patterns;
}

function generateInsights(store: KnowledgeStore): string[] {
  const insights: string[] = [];

  // Lesson extraction
  const lessons = store.entries.filter(e => e.type === 'lesson');
  if (lessons.length > 0) {
    insights.push(`${lessons.length} lessons captured. Most recent: "${lessons[0].content.substring(0, 50)}..."`);
  }

  // Goal progress
  const goals = store.entries.filter(e => e.type === 'goal');
  const completedGoals = goals.filter(g => g.outcome === 'achieved');
  if (goals.length > 0) {
    insights.push(`Goal completion: ${completedGoals.length}/${goals.length} (${Math.round((completedGoals.length / goals.length) * 100)}%)`);
  }

  // Timeline analysis
  const recentEvents = store.timeline.slice(0, 30);
  const positiveEvents = recentEvents.filter(e => e.impact === 'positive');
  const negativeEvents = recentEvents.filter(e => e.impact === 'negative');

  if (positiveEvents.length > negativeEvents.length * 2) {
    insights.push('Recent trend: Positive momentum building');
  } else if (negativeEvents.length > positiveEvents.length) {
    insights.push('Recent trend: Challenging period - focus on what you can control');
  }

  return insights;
}

// ============================================================================
// DISPLAY
// ============================================================================

function displayEntry(entry: KnowledgeEntry): void {
  const typeIcon = entry.type === 'decision' ? '🎯' :
                   entry.type === 'commitment' ? '🤝' :
                   entry.type === 'insight' ? '💡' :
                   entry.type === 'relationship' ? '👥' :
                   entry.type === 'milestone' ? '🏁' :
                   entry.type === 'lesson' ? '📚' : '🎯';

  const importanceColor = entry.importance === 'critical' ? colors.red :
                          entry.importance === 'high' ? colors.yellow :
                          entry.importance === 'medium' ? colors.cyan : colors.dim;

  console.log(`${typeIcon} ${importanceColor}[${entry.importance.toUpperCase()}]${colors.reset} ${colors.bold}${entry.content}${colors.reset}`);
  if (entry.context) {
    console.log(`   ${colors.dim}Context: ${entry.context}${colors.reset}`);
  }
  console.log(`   ${colors.dim}Tags: ${entry.tags.join(', ')} | Created: ${new Date(entry.createdAt).toLocaleDateString()}${colors.reset}`);
  if (entry.outcome) {
    const outcomeColor = entry.outcome === 'positive' ? colors.green : entry.outcome === 'negative' ? colors.red : colors.dim;
    console.log(`   ${outcomeColor}Outcome: ${entry.outcome}${colors.reset}`);
  }
  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

export async function unifiedKnowledge(options: {
  add?: string;
  type?: string;
  tags?: string;
  importance?: string;
  search?: string;
  commitments?: boolean;
  patterns?: boolean;
  stakeholder?: string;
  timeline?: boolean;
  json?: boolean;
}): Promise<void> {
  const store = await loadKnowledge();

  if (options.json) {
    console.log(JSON.stringify({
      entryCount: store.entries.length,
      stakeholderCount: store.stakeholders.length,
      timelineLength: store.timeline.length,
      patterns: detectPatterns(store),
      insights: generateInsights(store),
    }, null, 2));
    return;
  }

  // Add new entry
  if (options.add) {
    const entry = addEntry(store, {
      type: (options.type as KnowledgeEntry['type']) || 'insight',
      content: options.add,
      tags: options.tags ? options.tags.split(',').map(t => t.trim()) : ['general'],
      importance: (options.importance as KnowledgeEntry['importance']) || 'medium',
    });
    await saveKnowledge(store);
    console.log(`${colors.green}✓ Knowledge captured${colors.reset}`);
    displayEntry(entry);
    return;
  }

  // Search
  if (options.search) {
    const results = searchKnowledge(store, options.search);
    console.log(`${colors.bold}Search Results for "${options.search}"${colors.reset} (${results.length} found)\n`);
    for (const entry of results) {
      displayEntry(entry);
    }
    return;
  }

  // Commitments
  if (options.commitments) {
    const commitments = getCommitments(store);
    console.log(`${colors.bold}Open Commitments${colors.reset} (${commitments.length})\n`);
    if (commitments.length === 0) {
      console.log(`${colors.dim}No open commitments. Good job keeping promises!${colors.reset}`);
      return;
    }
    for (const commitment of commitments) {
      displayEntry(commitment);
    }
    return;
  }

  // Patterns
  if (options.patterns) {
    const patterns = detectPatterns(store);
    const insights = generateInsights(store);

    console.log(`${colors.bold}${colors.magenta}Pattern Analysis${colors.reset} ${colors.dim}(Better Than Human: total recall across all data)${colors.reset}\n`);

    console.log(`${colors.bold}Detected Patterns:${colors.reset}`);
    for (const pattern of patterns) {
      console.log(`  ${colors.cyan}•${colors.reset} ${pattern}`);
    }

    console.log(`\n${colors.bold}Insights:${colors.reset}`);
    for (const insight of insights) {
      console.log(`  ${colors.yellow}💡${colors.reset} ${insight}`);
    }
    return;
  }

  // Stakeholder
  if (options.stakeholder) {
    const stakeholder = getStakeholderContext(store, options.stakeholder);
    if (!stakeholder) {
      console.log(`${colors.yellow}Stakeholder "${options.stakeholder}" not found${colors.reset}`);
      console.log(`${colors.dim}Add with: ferni knowledge --add "Met with X" --type relationship --tags "stakeholder,X"${colors.reset}`);
      return;
    }

    console.log(`${colors.bold}Stakeholder: ${stakeholder.name}${colors.reset}`);
    console.log(`  Role: ${stakeholder.role}`);
    console.log(`  Relationship: ${stakeholder.relationship}`);
    if (stakeholder.lastInteraction) {
      console.log(`  Last interaction: ${new Date(stakeholder.lastInteraction).toLocaleDateString()}`);
    }
    if (stakeholder.notes.length > 0) {
      console.log(`\n  ${colors.bold}Notes:${colors.reset}`);
      for (const note of stakeholder.notes.slice(0, 5)) {
        console.log(`    • ${note}`);
      }
    }
    return;
  }

  // Timeline
  if (options.timeline) {
    console.log(`${colors.bold}Recent Timeline${colors.reset}\n`);
    for (const event of store.timeline.slice(0, 20)) {
      const date = new Date(event.date).toLocaleDateString();
      const impactIcon = event.impact === 'positive' ? '✅' :
                         event.impact === 'negative' ? '❌' : '➖';
      console.log(`  ${date} ${impactIcon} [${event.type}] ${event.description}`);
    }
    return;
  }

  // Default: show overview
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║         UNIFIED KNOWLEDGE CONTEXT                         ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}About${colors.reset}
This is your institutional memory - every decision, commitment,
insight, and relationship, with total recall and pattern detection.

${colors.bold}What a human assistant forgets, this remembers:${colors.reset}
  • Every promise you made (and received)
  • The context behind past decisions
  • Patterns in your decision-making
  • Stakeholder preferences and history
  • Lessons learned over months/years

${colors.bold}Current Stats${colors.reset}
  Knowledge entries: ${store.entries.length}
  Stakeholders tracked: ${store.stakeholders.length}
  Timeline events: ${store.timeline.length}
  Open commitments: ${getCommitments(store).length}

${colors.bold}Quick Patterns${colors.reset}
${detectPatterns(store).slice(0, 3).map(p => `  • ${p}`).join('\n') || '  (Need more data to detect patterns)'}

${colors.dim}Commands:
  ferni knowledge --add "Content" --type decision --tags "tag1,tag2"
  ferni knowledge --search "query"
  ferni knowledge --commitments
  ferni knowledge --patterns
  ferni knowledge --stakeholder "Name"
  ferni knowledge --timeline
${colors.reset}
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  const getArgValue = (flag: string): string | undefined => {
    const idx = args.findIndex(a => a === flag);
    return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : undefined;
  };

  unifiedKnowledge({
    add: getArgValue('--add'),
    type: getArgValue('--type'),
    tags: getArgValue('--tags'),
    importance: getArgValue('--importance'),
    search: getArgValue('--search'),
    commitments: args.includes('--commitments'),
    patterns: args.includes('--patterns'),
    stakeholder: getArgValue('--stakeholder'),
    timeline: args.includes('--timeline'),
    json: args.includes('--json'),
  }).catch(console.error);
}
