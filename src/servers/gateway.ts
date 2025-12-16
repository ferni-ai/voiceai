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
  console.log(`🚀 Starting ${name} on port ${port}...`);

  const proc = spawn(command, args, {
    cwd: rootDir,
    stdio: 'pipe',
    env: { ...process.env },
  });

  // Prefix logs with server name
  proc.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line: string) => {
      console.log(`[${name}] ${line}`);
    });
  });

  proc.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line: string) => {
      console.error(`[${name}] ${line}`);
    });
  });

  proc.on('exit', (code) => {
    console.log(`[${name}] Exited with code ${code}`);
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
  console.log('\n👋 Shutting down gateway...');

  servers.forEach(({ name, process }) => {
    console.log(`Stopping ${name}...`);
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

  console.log('');
  console.log('🌐 Ferni Gateway Server');
  console.log('━'.repeat(50));

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

  console.log('');
  console.log('📡 Gateway running:');
  if (!uiOnly) {
    console.log(`   Token Server: http://localhost:${process.env.TOKEN_SERVER_PORT || 3001}`);
  }
  if (!tokenOnly) {
    console.log(`   UI Server:    http://localhost:${process.env.PORT || 3002}`);
  }
  console.log('');
  console.log('Press Ctrl+C to stop all servers');
  console.log('━'.repeat(50));
}

// Run
main().catch((err) => {
  console.error('[gateway] Fatal error:', String(err));
  process.exit(1);
});
