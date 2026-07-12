/**
 * Gateway Server
 *
 * Starts the UI Server (port 3002) which now handles all requests:
 * LiveKit tokens, OAuth flows (Spotify, Google Calendar, wearables),
 * and all API routes.
 *
 * The former standalone token server (port 3001) has been removed.
 *
 * Usage:
 *   npx tsx src/servers/gateway.ts        # Start UI server
 *   npx tsx src/servers/api/index.ts      # Direct start (preferred)
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

  proc.on('error', (err) => {
    log.error(
      { server: name, error: err.message, code: (err as NodeJS.ErrnoException).code },
      'Failed to spawn server process'
    );
    const index = servers.findIndex((s) => s.name === name);
    if (index !== -1) servers.splice(index, 1);
  });

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
    const index = servers.findIndex((s) => s.name === name);
    if (index !== -1) servers.splice(index, 1);
  });

  servers.push({ name, process: proc, port });
  return proc;
}

/**
 * Start the UI Server
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
  log.info('Gateway server initializing');

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startUIServer();

  log.info(
    { uiServer: `http://localhost:${process.env.PORT || 3002}` },
    'Gateway running'
  );
}

main().catch((err) => {
  log.error({ error: String(err) }, 'Gateway fatal error');
  process.exit(1);
});
