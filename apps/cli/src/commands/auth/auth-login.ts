#!/usr/bin/env npx tsx
/**
 * Auth Login Command
 *
 * Authenticates the user with Firebase via browser OAuth flow.
 *
 * Usage:
 *   ferni auth login     # Interactive login
 *   ferni auth logout    # Log out
 *   ferni auth status    # Show current auth status
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  cliAuth,
  isAuthenticated,
  getCurrentUser,
  getLoginUrl,
  startCallbackServer,
  storeToken,
  logout,
} from '../../services/cli-auth.service.js';

const execAsync = promisify(exec);
const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Open a URL in the default browser
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let cmd: string;

  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  await execAsync(cmd);
}

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Login command - authenticate via browser
 */
async function handleLogin(): Promise<void> {
  p.intro(color.bgGreen(color.black(' Ferni CLI Authentication ')));

  // Check if already authenticated
  if (isAuthenticated()) {
    const user = getCurrentUser();
    const shouldReauth = await p.confirm({
      message: `You're already logged in as ${color.cyan(user?.email)}. Log in as a different user?`,
      initialValue: false,
    });

    if (p.isCancel(shouldReauth) || !shouldReauth) {
      p.outro(color.dim('Keeping existing session.'));
      return;
    }
  }

  const spinner = p.spinner();

  try {
    // Start the callback server first
    spinner.start('Starting authentication server...');
    const serverPromise = startCallbackServer();

    // Get the login URL
    const loginUrl = getLoginUrl();
    spinner.stop('Authentication server ready.');

    p.log.info(color.dim('Opening browser for authentication...'));
    p.log.info(color.dim(`If the browser doesn't open, visit:\n${color.cyan(loginUrl)}`));

    // Open the browser
    try {
      await openBrowser(loginUrl);
    } catch {
      p.log.warn("Couldn't open browser automatically.");
      p.log.info(`Please visit: ${color.cyan(loginUrl)}`);
    }

    spinner.start('Waiting for authentication...');

    // Wait for the callback
    const token = await serverPromise;

    // Store the token
    storeToken(token);

    spinner.stop('Authentication successful!');

    p.log.success(`Welcome, ${color.cyan(token.displayName || token.email)}!`);
    p.outro(color.green('You can now use all Ferni CLI commands.'));
  } catch (error) {
    spinner.stop('Authentication failed.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    p.outro(color.red('Please try again or check your network connection.'));
    process.exit(1);
  }
}

/**
 * Logout command
 */
async function handleLogout(): Promise<void> {
  p.intro(color.bgYellow(color.black(' Ferni CLI Logout ')));

  if (!isAuthenticated()) {
    p.log.info("You're not currently logged in.");
    p.outro(color.dim('Nothing to do.'));
    return;
  }

  const user = getCurrentUser();
  const confirm = await p.confirm({
    message: `Log out ${color.cyan(user?.email)}?`,
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.outro(color.dim('Cancelled.'));
    return;
  }

  const spinner = p.spinner();
  spinner.start('Logging out...');

  try {
    await logout();
    spinner.stop('Logged out successfully.');
    p.outro(color.green('See you next time!'));
  } catch (error) {
    spinner.stop('Logout failed.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Status command - show current auth status
 */
async function handleStatus(): Promise<void> {
  p.intro(color.bgCyan(color.black(' Ferni CLI Auth Status ')));

  if (isAuthenticated()) {
    const user = getCurrentUser();
    p.log.success('Authenticated');
    p.log.info(`User: ${color.cyan(user?.displayName || user?.email)}`);
    p.log.info(`Email: ${color.dim(user?.email)}`);
    p.log.info(`User ID: ${color.dim(user?.userId)}`);
    p.outro(color.green('Ready to use Ferni CLI commands.'));
  } else {
    p.log.warn('Not authenticated');
    p.log.info(`Run ${color.cyan('ferni auth login')} to authenticate.`);
    p.outro(color.yellow('Some commands require authentication.'));
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0] || 'login';

  switch (subcommand) {
    case 'login':
      await handleLogin();
      break;
    case 'logout':
      await handleLogout();
      break;
    case 'status':
    case 'whoami':
      await handleStatus();
      break;
    default:
      p.log.error(`Unknown subcommand: ${subcommand}`);
      p.log.info('Available commands: login, logout, status');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
