#!/usr/bin/env npx tsx
/**
 * Agent Delete Command
 *
 * Delete a custom agent with confirmation.
 *
 * Usage:
 *   ferni agent delete <agent-id>
 *   ferni agent delete <agent-id> --force  # Skip confirmation
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
  displayName: string;
  type: string;
  status: string;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const agentId = args.find((a) => !a.startsWith('-'));

  if (!agentId) {
    p.log.error('Agent ID required');
    p.log.info(`Usage: ${color.cyan('ferni agent delete <agent-id>')}`);
    process.exit(1);
  }

  p.intro(color.bgRed(color.white(' Delete Agent ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  const spinner = p.spinner();

  // First, fetch the agent to show what's being deleted
  spinner.start('Loading agent...');

  let agent: CustomAgent;
  try {
    agent = await cliAuth.apiRequest<CustomAgent>(`/api/custom-agents/${agentId}`);
    spinner.stop('Agent found.');
  } catch (error) {
    spinner.stop('Agent not found.');
    p.log.error(`${error instanceof Error ? error.message : 'Could not find agent'}`);
    process.exit(1);
  }

  p.log.info(`Agent: ${color.cyan(agent.displayName)} (${color.dim(agent.id)})`);
  p.log.info(`Type: ${agent.type}`);
  p.log.info(`Status: ${agent.status}`);
  console.log('');

  // Confirm deletion
  if (!force) {
    p.log.warn(color.yellow('This action cannot be undone.'));
    p.log.warn(color.yellow('Voice clones and memories will be permanently deleted.'));
    console.log('');

    const confirm = await p.confirm({
      message: `Delete ${color.cyan(agent.displayName)} permanently?`,
      initialValue: false,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Deletion cancelled.');
      process.exit(0);
    }

    // Double confirm for active agents
    if (agent.status === 'active') {
      const doubleConfirm = await p.text({
        message: `Type "${agent.displayName}" to confirm deletion:`,
        validate: (value) => {
          if (value !== agent.displayName) {
            return 'Name does not match. Type the exact name to confirm.';
          }
          return undefined;
        },
      });

      if (p.isCancel(doubleConfirm)) {
        p.cancel('Deletion cancelled.');
        process.exit(0);
      }
    }
  }

  // Delete the agent
  spinner.start('Deleting agent...');

  try {
    await cliAuth.apiRequest(`/api/custom-agents/${agentId}`, {
      method: 'DELETE',
    });

    spinner.stop('Agent deleted.');

    p.log.success(`${color.green('✓')} Deleted: ${agent.displayName}`);
    p.outro(color.dim('The agent and all associated data have been removed.'));
  } catch (error) {
    spinner.stop('Deletion failed.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
