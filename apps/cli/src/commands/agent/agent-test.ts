#!/usr/bin/env npx tsx
/**
 * Agent Test Command
 *
 * Test a custom agent with a local voice conversation.
 *
 * Usage:
 *   ferni agent test <agent-id>           # Start voice conversation
 *   ferni agent test <agent-id> --text    # Text-only mode
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const execFileAsync = promisify(execFile);
const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface CustomAgent {
  id: string;
  displayName: string;
  type: string;
  status: string;
  voice: {
    status: string;
  };
}

interface TestSessionResponse {
  sessionUrl: string;
  token: string;
  roomName: string;
  expiresAt: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Open a URL in the default browser (safe, no shell injection)
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      await execFileAsync('open', [url]);
    } else if (platform === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', url]);
    } else {
      await execFileAsync('xdg-open', [url]);
    }
  } catch {
    // Browser open failed - user will need to copy URL
    throw new Error('Could not open browser automatically');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const textMode = args.includes('--text') || args.includes('-t');
  const agentId = args.find((a) => !a.startsWith('-'));

  if (!agentId) {
    p.log.error('Agent ID required');
    p.log.info(`Usage: ${color.cyan('ferni agent test <agent-id>')}`);
    process.exit(1);
  }

  p.intro(color.bgBlue(color.white(' Test Agent ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  const spinner = p.spinner();

  // Fetch agent details
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

  p.log.info(`Testing: ${color.cyan(agent.displayName)}`);

  // Check voice status
  if (agent.voice?.status !== 'ready') {
    p.log.warn('Voice is not ready yet.');
    p.log.info(`Status: ${agent.voice?.status || 'pending'}`);

    if (agent.voice?.status === 'processing') {
      p.log.info('Voice is still processing. Try again in a few minutes.');
    } else {
      p.log.info(`Add a voice: ${color.cyan(`ferni agent voice upload ${agentId} <file>`)}`);
    }

    const continueAnyway = await p.confirm({
      message: 'Test without voice? (text-only mode)',
      initialValue: true,
    });

    if (p.isCancel(continueAnyway) || !continueAnyway) {
      p.cancel('Test cancelled.');
      process.exit(0);
    }
  }

  // Create test session
  spinner.start('Creating test session...');

  try {
    const session = await cliAuth.apiRequest<TestSessionResponse>(
      `/api/custom-agents/${agentId}/test-session`,
      { method: 'POST' }
    );

    spinner.stop('Session created!');

    console.log('');
    p.log.success(color.green('Test session ready!'));
    console.log('');

    if (textMode || agent.voice?.status !== 'ready') {
      // Text-only mode
      p.note(
        [
          'Text-only mode enabled.',
          '',
          `Open this URL in your browser to chat:`,
          '',
          color.cyan(session.sessionUrl),
          '',
          `Session expires: ${new Date(session.expiresAt).toLocaleTimeString()}`,
        ].join('\n'),
        'Test Session'
      );
    } else {
      // Voice mode
      p.note(
        [
          'Voice conversation ready!',
          '',
          `Open this URL to talk with ${agent.displayName}:`,
          '',
          color.cyan(session.sessionUrl),
          '',
          `Session expires: ${new Date(session.expiresAt).toLocaleTimeString()}`,
        ].join('\n'),
        'Test Session'
      );
    }

    // Open browser option
    const shouldOpenBrowser = await p.confirm({
      message: 'Open in browser?',
      initialValue: true,
    });

    if (shouldOpenBrowser && !p.isCancel(shouldOpenBrowser)) {
      try {
        await openBrowser(session.sessionUrl);
      } catch {
        p.log.warn("Couldn't open browser. Please copy the URL above.");
      }
    }

    p.outro(color.dim('Session will remain active for 10 minutes.'));
  } catch (error) {
    spinner.stop('Failed to create session.');

    // Handle common errors
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not ready')) {
      p.log.error('Agent is not ready for testing.');
      p.log.info('Make sure the agent has:');
      console.log('  - A voice configured (ready status)');
      console.log('  - At least one memory added');
      console.log('');
      p.log.info(`Check status: ${color.cyan(`ferni agent show ${agentId}`)}`);
    } else {
      p.log.error(message);
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
