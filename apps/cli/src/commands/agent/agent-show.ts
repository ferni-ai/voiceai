#!/usr/bin/env npx tsx
/**
 * Agent Show Command
 *
 * Display detailed information about a custom agent.
 *
 * Usage:
 *   ferni agent show <agent-id>
 *   ferni agent show <agent-id> --json
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface CustomAgentDetail {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';
  status: 'draft' | 'active' | 'paused' | 'archived';
  relationship?: string;
  voice: {
    type: 'cloned' | 'selected' | 'generated';
    status: 'pending' | 'processing' | 'ready' | 'failed';
    voiceId?: string;
  };
  personality: {
    warmth: number;
    humorLevel: number;
    directness: number;
    energy: number;
    traits: string[];
  };
  behaviors: {
    greetings: string[];
    catchphrases: string[];
    neverSay: string[];
  };
  memories: {
    stories: { id: string; title?: string }[];
    wisdom: { id: string; title?: string }[];
    sharedMoments: { id: string; title?: string }[];
  };
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const TYPE_ICONS: Record<string, string> = {
  legacy: '🕯️',
  mentor: '🎓',
  twin: '🪞',
  fictional: '📚',
  professional: '💼',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderBar(value: number, label: string, width = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const bar = color.green('█'.repeat(filled)) + color.dim('░'.repeat(empty));
  const pct = Math.round(value * 100);
  return `${label.padEnd(12)} ${bar} ${color.dim(`${pct}%`)}`;
}

function statusBadge(status: string): string {
  const badges: Record<string, string> = {
    draft: color.bgYellow(color.black(' DRAFT ')),
    active: color.bgGreen(color.black(' ACTIVE ')),
    paused: color.bgGray(color.white(' PAUSED ')),
    archived: color.bgGray(color.white(' ARCHIVED ')),
    pending: color.bgYellow(color.black(' PENDING ')),
    processing: color.bgBlue(color.white(' PROCESSING ')),
    ready: color.bgGreen(color.black(' READY ')),
    failed: color.bgRed(color.white(' FAILED ')),
  };
  return badges[status] || status;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const agentId = args.find((a) => !a.startsWith('--'));

  if (!agentId) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Agent ID required' }));
    } else {
      p.log.error('Agent ID required');
      p.log.info(`Usage: ${color.cyan('ferni agent show <agent-id>')}`);
    }
    process.exit(1);
  }

  if (!jsonOutput) {
    p.intro(color.bgCyan(color.black(' Agent Details ')));
  }

  // Check authentication
  if (!isAuthenticated()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Not authenticated' }));
    } else {
      p.log.warn("You're not logged in.");
      p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    }
    process.exit(1);
  }

  const spinner = jsonOutput ? null : p.spinner();
  spinner?.start('Loading agent...');

  try {
    const agent = await cliAuth.apiRequest<CustomAgentDetail>(`/api/custom-agents/${agentId}`);

    spinner?.stop('Agent loaded.');

    if (jsonOutput) {
      console.log(JSON.stringify(agent, null, 2));
      return;
    }

    // Display agent details
    console.log('');
    console.log(`  ${TYPE_ICONS[agent.type] || '📦'} ${color.bold(color.cyan(agent.displayName))}`);
    console.log(`  ${color.dim(agent.id)}`);
    console.log('');
    console.log(`  ${statusBadge(agent.status)}  Voice: ${statusBadge(agent.voice?.status || 'pending')}`);
    console.log('');

    // Description
    console.log(color.bold('  Description'));
    console.log(`  ${color.dim(agent.description)}`);
    console.log('');

    // Relationship (if present)
    if (agent.relationship) {
      console.log(color.bold('  Relationship'));
      console.log(`  ${agent.relationship}`);
      console.log('');
    }

    // Personality
    console.log(color.bold('  Personality'));
    console.log(`  ${renderBar(agent.personality.warmth, 'Warmth')}`);
    console.log(`  ${renderBar(agent.personality.humorLevel, 'Humor')}`);
    console.log(`  ${renderBar(agent.personality.directness, 'Directness')}`);
    console.log(`  ${renderBar(agent.personality.energy, 'Energy')}`);
    if (agent.personality.traits.length > 0) {
      console.log(`  Traits: ${color.cyan(agent.personality.traits.join(', '))}`);
    }
    console.log('');

    // Behaviors
    if (agent.behaviors?.greetings?.length > 0 || agent.behaviors?.catchphrases?.length > 0) {
      console.log(color.bold('  Speech Patterns'));
      if (agent.behaviors.greetings.length > 0) {
        console.log(`  Greetings: ${color.dim(agent.behaviors.greetings.slice(0, 2).map(g => `"${g}"`).join(', '))}`);
      }
      if (agent.behaviors.catchphrases.length > 0) {
        console.log(`  Catchphrases: ${color.dim(agent.behaviors.catchphrases.slice(0, 2).map(c => `"${c}"`).join(', '))}`);
      }
      console.log('');
    }

    // Memories
    const storyCount = agent.memories?.stories?.length || 0;
    const wisdomCount = agent.memories?.wisdom?.length || 0;
    const momentCount = agent.memories?.sharedMoments?.length || 0;
    const totalMemories = storyCount + wisdomCount + momentCount;

    console.log(color.bold('  Memories'));
    console.log(`  Stories: ${color.cyan(storyCount.toString())}  Wisdom: ${color.cyan(wisdomCount.toString())}  Moments: ${color.cyan(momentCount.toString())}`);
    if (totalMemories === 0) {
      console.log(`  ${color.dim('No memories yet. Add some with:')} ${color.cyan(`ferni agent memory add ${agent.id}`)}`);
    }
    console.log('');

    // Timestamps
    console.log(color.dim(`  Created: ${formatDate(agent.createdAt)}`));
    console.log(color.dim(`  Updated: ${formatDate(agent.updatedAt)}`));
    console.log('');

    // Quick actions
    const actions = [];
    if (agent.voice?.status !== 'ready') {
      actions.push(`Add voice: ${color.cyan(`ferni agent voice upload ${agent.id} <file>`)}`);
    }
    if (totalMemories < 3) {
      actions.push(`Add memories: ${color.cyan(`ferni agent memory add ${agent.id}`)}`);
    }
    if (agent.status === 'draft') {
      actions.push(`Deploy: ${color.cyan(`ferni agent deploy ${agent.id}`)}`);
    }
    actions.push(`Test: ${color.cyan(`ferni agent test ${agent.id}`)}`);

    if (actions.length > 0) {
      p.note(actions.join('\n'), 'Quick Actions');
    }

    p.outro('');
  } catch (error) {
    spinner?.stop('Failed to load agent.');
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    } else {
      p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
