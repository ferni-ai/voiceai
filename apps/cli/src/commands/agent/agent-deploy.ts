#!/usr/bin/env npx tsx
/**
 * Agent Deploy Command
 *
 * Deploy (activate) a custom agent after validating it's ready.
 *
 * Usage:
 *   ferni agent deploy <agent-id>
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
  status: 'draft' | 'active' | 'paused' | 'archived';
  voice: {
    status: 'pending' | 'processing' | 'ready' | 'failed';
  };
  memories: {
    stories: unknown[];
    wisdom: unknown[];
    sharedMoments: unknown[];
  };
  behaviors: {
    greetings: string[];
  };
}

interface ValidationResult {
  ready: boolean;
  issues: string[];
  warnings: string[];
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateAgent(agent: CustomAgent): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check voice
  if (!agent.voice || agent.voice.status !== 'ready') {
    if (agent.voice?.status === 'processing') {
      issues.push('Voice is still processing. Please wait for it to complete.');
    } else if (agent.voice?.status === 'failed') {
      issues.push('Voice cloning failed. Please try uploading a new sample.');
    } else {
      issues.push('No voice configured. Add one with: ferni agent voice upload <id> <file>');
    }
  }

  // Check memories
  const storyCount = agent.memories?.stories?.length || 0;
  const wisdomCount = agent.memories?.wisdom?.length || 0;
  const momentCount = agent.memories?.sharedMoments?.length || 0;
  const totalMemories = storyCount + wisdomCount + momentCount;

  if (totalMemories === 0) {
    issues.push('No memories added. Add at least one with: ferni agent memory add <id>');
  } else if (totalMemories < 3) {
    warnings.push(`Only ${totalMemories} memories. Consider adding more for richer conversations.`);
  }

  // Check greetings
  if (!agent.behaviors?.greetings || agent.behaviors.greetings.length === 0) {
    warnings.push('No greeting phrases set. The agent will use defaults.');
  }

  return {
    ready: issues.length === 0,
    issues,
    warnings,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const agentId = args.find((a) => !a.startsWith('-'));

  if (!agentId) {
    p.log.error('Agent ID required');
    p.log.info(`Usage: ${color.cyan('ferni agent deploy <agent-id>')}`);
    process.exit(1);
  }

  p.intro(color.bgGreen(color.black(' Deploy Agent ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  const spinner = p.spinner();

  // Fetch the agent
  spinner.start('Loading agent...');

  let agent: CustomAgent;
  try {
    agent = await cliAuth.apiRequest<CustomAgent>(`/api/custom-agents/${agentId}`);
    spinner.stop('Agent loaded.');
  } catch (error) {
    spinner.stop('Agent not found.');
    p.log.error(`${error instanceof Error ? error.message : 'Could not find agent'}`);
    process.exit(1);
  }

  // Check if already active
  if (agent.status === 'active') {
    p.log.info(`${color.cyan(agent.displayName)} is already active.`);
    p.outro(color.dim('Nothing to do.'));
    return;
  }

  p.log.info(`Agent: ${color.cyan(agent.displayName)}`);
  p.log.info(`Current status: ${color.yellow(agent.status)}`);
  console.log('');

  // Validate the agent
  spinner.start('Validating agent...');
  const validation = validateAgent(agent);
  spinner.stop('Validation complete.');

  // Show issues
  if (validation.issues.length > 0) {
    console.log('');
    p.log.error(color.red('Issues that must be fixed:'));
    for (const issue of validation.issues) {
      console.log(`  ${color.red('✗')} ${issue}`);
    }
    console.log('');
  }

  // Show warnings
  if (validation.warnings.length > 0) {
    p.log.warn(color.yellow('Warnings:'));
    for (const warning of validation.warnings) {
      console.log(`  ${color.yellow('!')} ${warning}`);
    }
    console.log('');
  }

  // Check if ready
  if (!validation.ready) {
    p.log.error('Agent is not ready for deployment.');
    p.log.info('Fix the issues above and try again.');
    p.outro(color.red('Deployment cancelled.'));
    process.exit(1);
  }

  // Confirm deployment
  const confirm = await p.confirm({
    message: `Deploy ${color.cyan(agent.displayName)}?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Deployment cancelled.');
    process.exit(0);
  }

  // Deploy (update status to active)
  spinner.start('Deploying agent...');

  try {
    await cliAuth.apiRequest(`/api/custom-agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });

    spinner.stop('Agent deployed!');

    p.log.success(`${color.green('✓')} ${agent.displayName} is now active!`);

    // Next steps
    p.note(
      [
        `Test: ${color.cyan(`ferni agent test ${agent.id}`)}`,
        `Create website: ${color.cyan(`ferni site create --agent ${agent.id}`)}`,
        `View details: ${color.cyan(`ferni agent show ${agent.id}`)}`,
      ].join('\n'),
      'Next Steps'
    );

    p.outro(color.green('Your agent is live and ready for conversations!'));
  } catch (error) {
    spinner.stop('Deployment failed.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
