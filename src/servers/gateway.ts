/**
 * Unified Gateway Server
 *
 * Runs both Token Server and UI Server on their respective ports.
 * Provides a single entry point for development.
 *
 * Usage:
 *   npx tsx src/servers/gateway.ts           # Start both servers
 *   npx tsx src/servers/gateway.ts --token   # Token server only
 *   npx tsx src/servers/gateway.ts --ui      # UI server only (requires build)
 */

import 'dotenv/config';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'Gateway' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

interface ServerProcess {
  name: string;
  process: ChildProcess;
  port: number;
}

const servers: ServerProcess[] = [];

/**
 * Start a server process
 */
function startServer(name: string, command: string, args: string[], port: number): ChildProcess {
  log.info({ name, port }, 'Starting server');

  const proc = spawn(command, args, {
    cwd: rootDir,
    stdio: 'pipe',
    env: { ...process.env },
  });

  // Handle spawn errors (e.g., command not found, permission denied)
  proc.on('error', (err) => {
    log.error(
      { server: name, error: err.message, code: (err as NodeJS.ErrnoException).code },
      'Failed to spawn server process'
    );
    // Remove from servers list if spawn failed
    const index = servers.findIndex((s) => s.name === name);
    if (index !== -1) servers.splice(index, 1);
  });

  // Prefix logs with server name
  proc.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line: string) => {
      log.info({ server: name }, line);
    });
  });

  proc.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line: string) => {
      log.error({ server: name }, line);
    });
  });

  proc.on('exit', (code, signal) => {
    log.info({ server: name, exitCode: code, signal }, 'Server exited');
    // Remove from servers list
    const index = servers.findIndex((s) => s.name === name);
    if (index !== -1) servers.splice(index, 1);
  });

  servers.push({ name, process: proc, port });
  return proc;
}

/**
 * Start the Token Server (TypeScript version)
 */
function startTokenServer(): ChildProcess {
  const port = parseInt(process.env.TOKEN_SERVER_PORT || '3001', 10);
  return startServer('token', 'npx', ['tsx', 'src/servers/token/index.ts'], port);
}

/**
 * Start the UI Server (TypeScript version)
 */
function startUIServer(): ChildProcess {
  const port = parseInt(process.env.PORT || '3002', 10);
  return startServer('ui', 'npx', ['tsx', 'src/servers/api/index.ts'], port);
}

/**
 * Graceful shutdown
 */
function shutdown(): void {
  log.info('Shutting down gateway...');

  servers.forEach(({ name, process }) => {
    log.info({ server: name }, 'Stopping server');
    process.kill('SIGTERM');
  });

  // Force kill after 5 seconds
  setTimeout(() => {
    servers.forEach(({ process }) => {
      if (!process.killed) {
        process.kill('SIGKILL');
      }
    });
    process.exit(0);
  }, 5000);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tokenOnly = args.includes('--token');
  const uiOnly = args.includes('--ui');

  log.info('Gateway server initializing');

  // Handle shutdown signals
  // Note: These handlers are added once on startup and cleaned up on process exit
  // No explicit removeListener needed since process terminates after handling
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (!uiOnly) {
    startTokenServer();
  }

  if (!tokenOnly) {
    // Small delay to ensure token server starts first
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    startUIServer();
  }

  log.info(
    {
      tokenServer: !uiOnly ? `http://localhost:${process.env.TOKEN_SERVER_PORT || 3001}` : null,
      uiServer: !tokenOnly ? `http://localhost:${process.env.PORT || 3002}` : null,
    },
    'Gateway running'
  );
}

// Run
main().catch((err) => {
  log.error({ error: String(err) }, 'Gateway fatal error');
  process.exit(1);
});
