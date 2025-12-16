#!/usr/bin/env node

/**
 * Ferni CLI - Global Entry Point
 *
 * This script serves as the entry point for the `ferni` command.
 * It uses tsx to run the TypeScript CLI directly without pre-compilation.
 *
 * Usage:
 *   ferni                    # Interactive menu
 *   ferni deploy ui          # Deploy UI server
 *   ferni agents new         # Create a new marketplace agent
 *   ferni status             # Check service health
 *
 * Installation:
 *   npm link                 # Link globally from project root
 *   npm install -g @ferni/cli # When published to npm
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliRoot = join(__dirname, '..');
const projectRoot = join(__dirname, '..', '..', '..');

// Path to the TypeScript CLI
const cliPath = join(cliRoot, 'src', 'index.ts');

// Pass all arguments to the CLI
const args = process.argv.slice(2);

// Use tsx to run TypeScript directly
const child = spawn('npx', ['tsx', cliPath, ...args], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    FERNI_PROJECT_ROOT: projectRoot,
    FERNI_CLI_ROOT: cliRoot,
  },
});

child.on('error', (err) => {
  console.error('Failed to start ferni CLI:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});
