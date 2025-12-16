#!/usr/bin/env npx tsx
/**
 * Local Development Services Runner
 *
 * Starts all microservices locally for development without Docker.
 * Each service runs in a separate child process.
 *
 * Usage:
 *   pnpm dev:services          # Start all services
 *   pnpm dev:services tools    # Start only tool service
 *   pnpm dev:services --docker # Use Docker Compose instead
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

const SERVICES = {
  tools: {
    name: 'Tool Service',
    port: 50051,
    entry: 'dist/services/tool-service/server.js',
    color: '\x1b[36m', // cyan
  },
  personas: {
    name: 'Persona Service',
    port: 50052,
    entry: 'dist/services/persona-service/server.js',
    color: '\x1b[35m', // magenta
  },
  memory: {
    name: 'Memory Service',
    port: 50053,
    entry: 'dist/services/memory-service/server.js',
    color: '\x1b[33m', // yellow
  },
};

const RESET = '\x1b[0m';

const processes: Map<string, ChildProcess> = new Map();
let shuttingDown = false;

function log(service: string, message: string, color: string = RESET) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`${color}[${timestamp}] [${service}]${RESET} ${message}`);
}

async function buildFirst(): Promise<boolean> {
  log('build', 'Building services with esbuild...', '\x1b[34m');

  return new Promise((resolve) => {
    const build = spawn('pnpm', ['build:fast'], {
      stdio: 'inherit',
      shell: true,
    });

    build.on('close', (code) => {
      if (code === 0) {
        log('build', 'Build complete!', '\x1b[32m');
        resolve(true);
      } else {
        log('build', `Build failed with code ${code}`, '\x1b[31m');
        resolve(false);
      }
    });
  });
}

function startService(id: string, config: typeof SERVICES.tools): ChildProcess {
  log(id, `Starting on port ${config.port}...`, config.color);

  const proc = spawn('node', [config.entry], {
    env: {
      ...process.env,
      PORT: String(config.port),
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Prefix output with service name
  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      log(id, line, config.color);
    });
  }

  if (proc.stderr) {
    const rl = createInterface({ input: proc.stderr });
    rl.on('line', (line) => {
      log(id, line, config.color);
    });
  }

  proc.on('close', (code) => {
    if (!shuttingDown) {
      log(id, `Exited with code ${code}. Restarting in 2s...`, '\x1b[31m');
      setTimeout(() => {
        if (!shuttingDown) {
          const newProc = startService(id, config);
          processes.set(id, newProc);
        }
      }, 2000);
    }
  });

  proc.on('error', (err) => {
    log(id, `Error: ${err.message}`, '\x1b[31m');
  });

  return proc;
}

async function startDocker(): Promise<void> {
  log('docker', 'Starting services with Docker Compose...', '\x1b[34m');

  const proc = spawn('docker', ['compose', '-f', 'docker-compose.services.yml', 'up', '--build'], {
    stdio: 'inherit',
    shell: true,
  });

  processes.set('docker', proc);

  proc.on('close', (code) => {
    if (!shuttingDown) {
      log('docker', `Docker Compose exited with code ${code}`, '\x1b[31m');
    }
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('\n');
  log('main', 'Shutting down services...', '\x1b[33m');

  for (const [id, proc] of processes) {
    log(id, 'Stopping...', '\x1b[33m');
    proc.kill('SIGTERM');
  }

  // Force kill after 5 seconds
  setTimeout(() => {
    for (const [id, proc] of processes) {
      if (!proc.killed) {
        log(id, 'Force killing...', '\x1b[31m');
        proc.kill('SIGKILL');
      }
    }
    process.exit(0);
  }, 5000);
}

async function main() {
  const args = process.argv.slice(2);
  const useDocker = args.includes('--docker');
  const specificService = args.find(a => !a.startsWith('--'));

  // Handle shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                 Ferni Local Services                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Tool Service:    http://localhost:50051                      ║
║  Persona Service: http://localhost:50052                      ║
║  Memory Service:  http://localhost:50053                      ║
╠═══════════════════════════════════════════════════════════════╣
║  Press Ctrl+C to stop all services                            ║
╚═══════════════════════════════════════════════════════════════╝
`);

  if (useDocker) {
    await startDocker();
    return;
  }

  // Build first
  const buildSuccess = await buildFirst();
  if (!buildSuccess) {
    process.exit(1);
  }

  // Start services
  if (specificService && SERVICES[specificService as keyof typeof SERVICES]) {
    const config = SERVICES[specificService as keyof typeof SERVICES];
    const proc = startService(specificService, config);
    processes.set(specificService, proc);
  } else {
    // Start all services
    for (const [id, config] of Object.entries(SERVICES)) {
      const proc = startService(id, config);
      processes.set(id, proc);

      // Stagger starts to avoid port conflicts during init
      await new Promise(r => setTimeout(r, 500));
    }
  }

  log('main', 'All services started!', '\x1b[32m');
  log('main', 'Set SERVICE_MODE=hybrid in another terminal to use these services', '\x1b[34m');
}

main().catch((error) => {
  console.error('Failed to start services:', error);
  process.exit(1);
});
