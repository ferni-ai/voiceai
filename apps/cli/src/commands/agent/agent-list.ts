#!/usr/bin/env npx tsx
/**
 * Agent List Command
 *
 * Lists all custom agents for the authenticated user.
 *
 * Usage:
 *   ferni agent list        # Table view
 *   ferni agent list --json # JSON output
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface CustomAgent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';
  status: 'draft' | 'active' | 'paused' | 'archived';
  voice: {
    status: 'pending' | 'processing' | 'ready' | 'failed';
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

const STATUS_COLORS: Record<string, (s: string) => string> = {
  draft: color.yellow,
  active: color.green,
  paused: color.dim,
  archived: color.dim,
};

const VOICE_ICONS: Record<string, string> = {
  pending: '⏳',
  processing: '⚙️',
  ready: '✓',
  failed: '✗',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  if (!jsonOutput) {
    p.intro(color.bgCyan(color.black(' Your Custom Agents ')));
  }

  // Check authentication
  if (!isAuthenticated()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Not authenticated' }));
    } else {
      p.log.warn("You're not logged in.");
      p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
      p.outro(color.yellow('Authentication required.'));
    }
    process.exit(1);
  }

  const spinner = jsonOutput ? null : p.spinner();
  spinner?.start('Fetching agents...');

  try {
    const agents = await cliAuth.apiRequest<CustomAgent[]>('/api/custom-agents');

    spinner?.stop('Agents loaded.');

    if (agents.length === 0) {
      if (jsonOutput) {
        console.log(JSON.stringify([]));
      } else {
        p.log.info('No agents yet.');
        p.log.info(`Create one with: ${color.cyan('ferni agent create')}`);
        p.outro(color.dim('Get started by creating your first agent!'));
      }
      return;
    }

    if (jsonOutput) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    // Display table
    console.log('');
    console.log(
      color.bold(
        `  ${'ID'.padEnd(20)} ${'Name'.padEnd(20)} ${'Type'.padEnd(14)} ${'Status'.padEnd(10)} ${'Voice'.padEnd(6)} ${'Created'.padEnd(12)}`
      )
    );
    console.log(color.dim('  ' + '─'.repeat(90)));

    for (const agent of agents) {
      const typeIcon = TYPE_ICONS[agent.type] || '📦';
      const statusColor = STATUS_COLORS[agent.status] || color.dim;
      const voiceIcon = VOICE_ICONS[agent.voice?.status] || '?';

      console.log(
        `  ${color.dim(truncate(agent.id, 20).padEnd(20))} ` +
        `${color.cyan(truncate(agent.displayName, 20).padEnd(20))} ` +
        `${typeIcon} ${agent.type.padEnd(12)} ` +
        `${statusColor(agent.status.padEnd(10))} ` +
        `${voiceIcon.padEnd(6)} ` +
        `${color.dim(formatDate(agent.createdAt))}`
      );
    }

    console.log('');
    p.log.info(`Total: ${color.cyan(agents.length.toString())} agent${agents.length === 1 ? '' : 's'}`);
    p.outro(color.dim(`View details: ${color.cyan('ferni agent show <id>')}`));
  } catch (error) {
    spinner?.stop('Failed to fetch agents.');
    if (jsonOutput) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    } else {
      p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
      p.outro(color.red('Please try again.'));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
