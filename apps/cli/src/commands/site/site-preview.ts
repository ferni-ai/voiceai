#!/usr/bin/env npx tsx
/**
 * Site Preview Command
 *
 * Start a local development server to preview the generated site.
 *
 * Usage:
 *   ferni site preview                # Preview ./site on port 8888
 *   ferni site preview --dir ./mysite # Preview custom directory
 *   ferni site preview --port 3000    # Use custom port
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const color = picocolorsModule.default || picocolorsModule;

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

/**
 * Check if a command exists
 */
function commandExists(cmd: string): boolean {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('which', [cmd], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const dirIdx = args.indexOf('--dir');
  const siteDir = dirIdx !== -1 ? args[dirIdx + 1] : './site';

  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? args[portIdx + 1] : '8888';

  const noBrowser = args.includes('--no-browser');

  p.intro(color.bgBlue(color.white(' Site Preview ')));

  // Check if directory exists
  const fullPath = path.resolve(process.cwd(), siteDir);

  if (!fs.existsSync(fullPath)) {
    p.log.error(`Directory not found: ${color.cyan(siteDir)}`);
    p.log.info(`Create a site first: ${color.cyan('ferni site create --agent <id>')}`);
    process.exit(1);
  }

  // Check for index.html
  const indexPath = path.join(fullPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    p.log.error(`No index.html found in ${color.cyan(siteDir)}`);
    p.log.info('Make sure the directory contains a valid site.');
    process.exit(1);
  }

  p.log.info(`Directory: ${color.cyan(fullPath)}`);
  p.log.info(`Port: ${color.cyan(port)}`);
  console.log('');

  // Start server
  const spinner = p.spinner();
  spinner.start('Starting preview server...');

  // Try to use serve (from npm)
  const serverArgs = [fullPath, '-l', port, '--no-clipboard'];

  const server = spawn('npx', ['serve', ...serverArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

  let serverStarted = false;
  const url = `http://localhost:${port}`;

  server.stdout?.on('data', async (data) => {
    const output = data.toString();

    // Server started successfully
    if (output.includes('Accepting connections') || output.includes('Local:')) {
      if (!serverStarted) {
        serverStarted = true;
        spinner.stop('Server running!');

        console.log('');
        p.log.success(`Preview available at: ${color.cyan(url)}`);
        console.log('');

        // Open browser
        if (!noBrowser) {
          try {
            await openBrowser(url);
            p.log.info('Opened in browser.');
          } catch {
            p.log.info('Open the URL above in your browser.');
          }
        }

        console.log(color.dim('Press Ctrl+C to stop the server.'));
        console.log('');
      }
    }
  });

  server.stderr?.on('data', (data) => {
    const output = data.toString();
    // Ignore npm/npx warnings
    if (!output.includes('npm') && !output.includes('WARN')) {
      console.error(color.red(output));
    }
  });

  server.on('error', (err) => {
    spinner.stop('Failed to start server.');
    p.log.error(`Server error: ${err.message}`);
    p.log.info('Make sure npx is available, or install serve: npm i -g serve');
    process.exit(1);
  });

  server.on('close', (code) => {
    if (!serverStarted) {
      spinner.stop('Server stopped.');
      p.log.error(`Server exited with code ${code}`);
    }
    console.log('');
    p.log.info('Server stopped.');
    process.exit(code || 0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('');
    p.log.info('Stopping server...');
    server.kill('SIGTERM');
  });

  process.on('SIGTERM', () => {
    server.kill('SIGTERM');
  });
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
