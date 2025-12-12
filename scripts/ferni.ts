#!/usr/bin/env npx tsx
/**
 * FERNI - Unified CLI
 *
 * One command to rule them all. Routes to all other CLIs.
 *
 * Usage:
 *   ferni                          # Interactive mode
 *   ferni deploy ui                # Deploy UI
 *   ferni test quick               # Run quick tests
 *   ferni setup local              # Setup local dev
 *   ferni agents list              # List AI agents
 *   ferni logs agent               # View agent logs
 *   ferni status                   # Deployment status
 *   ferni doctor                   # System diagnostics
 *   ferni db migrate               # Database operations
 *   ferni env diff                 # Compare environments
 *
 * Or via npm:
 *   npm run ferni deploy ui
 */

import { spawn, spawnSync, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { existsSync, readFileSync } from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);
const GCP_PROJECT = 'johnb-2025';
const GCP_REGION = 'us-central1';

// Service names
const SERVICES = {
  agent: 'voiceai-agent',
  ui: 'john-bogle-ui',
};

// ============================================================================
// COLORS & STYLING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  rocket: '🚀',
  gear: '⚙',
  database: '🗄',
  cloud: '☁',
  doctor: '🩺',
  agent: '🤖',
  log: '📋',
  env: '🔐',
  check: '✔',
  cross: '✘',
  arrow: '→',
  bullet: '•',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}${icons.info}${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}${icons.success}${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}${icons.warning}${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}${icons.error}${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}${icons.arrow}${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

// ============================================================================
// SPINNER
// ============================================================================

class Spinner {
  private interval: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    process.stdout.write('\x1B[?25l'); // Hide cursor
    this.interval = setInterval(() => {
      const frame = icons.spinner[this.frameIndex];
      process.stdout.write(`\r${colors.cyan}${frame}${colors.reset} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % icons.spinner.length;
    }, 80);
  }

  stop(success = true): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    const icon = success ? `${colors.green}${icons.success}` : `${colors.red}${icons.error}`;
    process.stdout.write(`\r${icon}${colors.reset} ${this.message}\n`);
    process.stdout.write('\x1B[?25h'); // Show cursor
  }

  update(message: string): void {
    this.message = message;
  }
}

// ============================================================================
// CLI REGISTRY
// ============================================================================

interface CliCommand {
  name: string;
  description: string;
  icon: string;
  script?: string;
  handler?: (args: string[]) => Promise<void>;
  subcommands?: string[];
  examples?: string[];
}

const COMMANDS: Record<string, CliCommand> = {
  deploy: {
    name: 'Deploy',
    description: 'Deploy services to cloud',
    icon: icons.rocket,
    script: 'scripts/deploy.ts',
    subcommands: ['ui', 'agent', 'frontend', 'landing', 'all'],
    examples: ['ferni deploy ui', 'ferni deploy all --dry-run'],
  },
  agents: {
    name: 'Agents',
    description: 'Manage AI agents',
    icon: icons.agent,
    handler: handleAgents,
    subcommands: ['new', 'list', 'show', 'validate', 'install', 'uninstall', 'search'],
    examples: ['ferni agents new', 'ferni agents list', 'ferni agents validate atlas-career-navigator'],
  },
  logs: {
    name: 'Logs',
    description: 'View Cloud Run logs',
    icon: icons.log,
    handler: handleLogs,
    subcommands: ['agent', 'ui', 'all', 'errors'],
    examples: ['ferni logs agent', 'ferni logs ui --tail', 'ferni logs errors'],
  },
  status: {
    name: 'Status',
    description: 'Check deployment status',
    icon: icons.cloud,
    handler: handleStatus,
    subcommands: ['services', 'revisions', 'traffic', 'all'],
    examples: ['ferni status', 'ferni status services'],
  },
  doctor: {
    name: 'Doctor',
    description: 'Run system diagnostics',
    icon: icons.doctor,
    handler: handleDoctor,
    subcommands: ['all', 'apis', 'quotas', 'billing', 'env'],
    examples: ['ferni doctor', 'ferni doctor apis'],
  },
  db: {
    name: 'Database',
    description: 'Database operations',
    icon: icons.database,
    handler: handleDb,
    subcommands: ['status', 'backup', 'migrate', 'query', 'users'],
    examples: ['ferni db status', 'ferni db backup', 'ferni db users'],
  },
  env: {
    name: 'Environment',
    description: 'Manage environment variables',
    icon: icons.env,
    handler: handleEnv,
    subcommands: ['list', 'diff', 'check', 'sync', 'secrets'],
    examples: ['ferni env list', 'ferni env diff', 'ferni env check'],
  },
  setup: {
    name: 'Setup',
    description: 'Configure development environment',
    icon: icons.gear,
    script: 'scripts/setup.ts',
    subcommands: ['local', 'icons', 'firestore', 'github', 'persistence', 'signing', 'slack', 'secrets', 'all'],
    examples: ['ferni setup local', 'ferni setup all --yes'],
  },
  test: {
    name: 'Test',
    description: 'Run test suites',
    icon: '🧪',
    script: 'scripts/test.ts',
    subcommands: ['unit', 'e2e', 'storage', 'comms', 'quick', 'all'],
    examples: ['ferni test quick', 'ferni test all -v'],
  },
  validate: {
    name: 'Validate',
    description: 'Run validations',
    icon: icons.check,
    script: 'scripts/validate.ts',
    subcommands: ['voices', 'humanization', 'integrations', 'persistence', 'all'],
    examples: ['ferni validate voices', 'ferni validate all'],
  },
  audit: {
    name: 'Audit',
    description: 'Run code quality audits',
    icon: '🔍',
    script: 'scripts/audit.ts',
    subcommands: ['quality', 'architecture', 'legacy', 'a11y', 'all'],
    examples: ['ferni audit quality', 'ferni audit all'],
  },
  build: {
    name: 'Build',
    description: 'Build applications',
    icon: '🔨',
    script: 'scripts/build.ts',
    subcommands: ['frontend', 'electron', 'ios', 'android', 'apps', 'sync', 'store-assets'],
    examples: ['ferni build frontend', 'ferni build apps'],
  },
  generate: {
    name: 'Generate',
    description: 'Generate code and assets',
    icon: '✨',
    script: 'scripts/generate.ts',
    subcommands: ['personas', 'env', 'vapid', 'marketing', 'design-system', 'all'],
    examples: ['ferni generate design-system', 'ferni generate all'],
  },
  rollout: {
    name: 'Rollout',
    description: 'Manage feature rollouts',
    icon: '🎯',
    script: 'scripts/rollout.ts',
    subcommands: ['start', 'status', 'advance', 'rollback', 'list', 'presets'],
    examples: ['ferni rollout start feature --preset=canary', 'ferni rollout status'],
  },
  tokens: {
    name: 'Tokens',
    description: 'Manage design tokens',
    icon: '🎨',
    handler: handleTokens,
    subcommands: ['sync', 'check', 'version', 'watch', 'brand'],
    examples: ['ferni tokens sync', 'ferni tokens version patch "Fixed colors"', 'ferni tokens watch'],
  },
  dev: {
    name: 'Dev',
    description: 'Development workflow management',
    icon: '🛠️',
    handler: handleDev,
    subcommands: ['start', 'stop', 'restart', 'status', 'ports', 'frontend', 'agent'],
    examples: ['ferni dev start', 'ferni dev stop', 'ferni dev status', 'ferni dev frontend'],
  },
  personas: {
    name: 'Personas',
    description: 'Manage AI personas',
    icon: '🎭',
    handler: handlePersonas,
    subcommands: ['list', 'show', 'validate', 'generate', 'compare', 'stats'],
    examples: ['ferni personas list', 'ferni personas show ferni', 'ferni personas validate'],
  },
  quality: {
    name: 'Quality',
    description: 'Run all quality checks',
    icon: '✅',
    handler: handleQuality,
    subcommands: ['all', 'quick', 'typecheck', 'lint', 'test', 'audit'],
    examples: ['ferni quality', 'ferni quality quick', 'ferni quality audit'],
  },
  pr: {
    name: 'PR',
    description: 'Pull request workflow',
    icon: '🔀',
    handler: handlePR,
    subcommands: ['create', 'check', 'list', 'view', 'merge'],
    examples: ['ferni pr create', 'ferni pr check', 'ferni pr list'],
  },
  tools: {
    name: 'Tools',
    description: 'Manage LLM tools',
    icon: '🔧',
    handler: handleTools,
    subcommands: ['list', 'show', 'validate', 'stats', 'test'],
    examples: ['ferni tools list', 'ferni tools show habit-coaching', 'ferni tools stats'],
  },
  jobs: {
    name: 'Jobs',
    description: 'Scheduled job management',
    icon: '⏰',
    handler: handleJobs,
    subcommands: ['list', 'status', 'run', 'history', 'logs'],
    examples: ['ferni jobs list', 'ferni jobs status', 'ferni jobs run cleanup'],
  },
  costs: {
    name: 'Costs',
    description: 'Cloud cost tracking',
    icon: '💰',
    handler: handleCosts,
    subcommands: ['summary', 'breakdown', 'forecast', 'alerts', 'optimize'],
    examples: ['ferni costs summary', 'ferni costs breakdown', 'ferni costs forecast'],
  },
  voices: {
    name: 'Voices',
    description: 'Voice/TTS management',
    icon: '🎤',
    handler: handleVoices,
    subcommands: ['list', 'preview', 'test', 'compare', 'validate'],
    examples: ['ferni voices list', 'ferni voices preview cartesia', 'ferni voices test'],
  },
  debug: {
    name: 'Debug',
    description: 'Troubleshooting workflows',
    icon: '🐛',
    handler: handleDebug,
    subcommands: ['capture', 'logs', 'errors', 'health', 'env', 'network'],
    examples: ['ferni debug capture', 'ferni debug errors', 'ferni debug health'],
  },
  integrations: {
    name: 'Integrations',
    description: 'Third-party API health checks',
    icon: '🔗',
    handler: handleIntegrations,
    subcommands: ['check', 'livekit', 'cartesia', 'gemini', 'stripe', 'firebase', 'all'],
    examples: ['ferni integrations check', 'ferni integrations all', 'ferni integrations livekit'],
  },
  release: {
    name: 'Release',
    description: 'Release management workflow',
    icon: '📦',
    handler: handleRelease,
    subcommands: ['create', 'changelog', 'tag', 'notes', 'status', 'history'],
    examples: ['ferni release create v1.2.0', 'ferni release changelog', 'ferni release notes'],
  },
};

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

function runCommand(script: string, args: string[]): void {
  const result = spawnSync('npx', ['tsx', script, ...args], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  process.exit(result.status || 0);
}

function execCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function execCommandWithStatus(cmd: string): { output: string; success: boolean } {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { output, success: true };
  } catch (error) {
    return { output: (error as Error).message, success: false };
  }
}

// ============================================================================
// LOGS COMMAND
// ============================================================================

// ============================================================================
// AGENTS COMMAND (with interactive builder)
// ============================================================================

async function handleAgents(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  // Intercept "new" to run the interactive agent builder
  if (subcommand === 'new') {
    log.header(`${icons.agent} Create New Marketplace Agent`);
    log.info('Starting interactive agent builder wizard...\n');

    // Run the agent builder wizard
    const builderScript = join(PROJECT_ROOT, 'scripts', 'agent-builder.ts');
    const result = spawnSync('npx', ['tsx', builderScript], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });

    if (result.status !== 0) {
      log.error('Agent builder wizard failed');
    }
    return;
  }

  // For all other subcommands, delegate to agent-manager.ts
  const agentManagerScript = join(PROJECT_ROOT, 'src', 'cli', 'agent-manager.ts');
  runCommand(agentManagerScript, args);
}

// ============================================================================
// LOGS COMMAND
// ============================================================================

async function handleLogs(args: string[]): Promise<void> {
  const subcommand = args[0] || 'agent';
  const tail = args.includes('--tail') || args.includes('-f');
  const limit = args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '50';

  log.header(`${icons.log} Cloud Run Logs`);

  const services: string[] = [];
  if (subcommand === 'all') {
    services.push(SERVICES.agent, SERVICES.ui);
  } else if (subcommand === 'errors') {
    // Show errors from all services
    log.info('Fetching error logs from all services...\n');
    const cmd = `gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=${limit} --project=${GCP_PROJECT} --format="table(timestamp,resource.labels.service_name,textPayload)" 2>/dev/null`;
    const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    return;
  } else {
    const service = SERVICES[subcommand as keyof typeof SERVICES];
    if (!service) {
      log.error(`Unknown service: ${subcommand}`);
      log.info(`Available: ${Object.keys(SERVICES).join(', ')}, all, errors`);
      return;
    }
    services.push(service);
  }

  for (const service of services) {
    console.log(`${colors.bold}${colors.cyan}━━━ ${service} ━━━${colors.reset}\n`);

    const tailFlag = tail ? '--tail=100' : `--limit=${limit}`;
    const cmd = `gcloud run services logs read ${service} ${tailFlag} --project=${GCP_PROJECT} --region=${GCP_REGION} 2>/dev/null`;

    if (tail) {
      log.info(`Streaming logs (Ctrl+C to stop)...`);
      const child = spawn('sh', ['-c', cmd], { stdio: 'inherit' });
      await new Promise((resolve) => child.on('close', resolve));
    } else {
      const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    }
    console.log();
  }
}

// ============================================================================
// STATUS COMMAND
// ============================================================================

async function handleStatus(args: string[]): Promise<void> {
  const subcommand = args[0] || 'all';

  log.header(`${icons.cloud} Deployment Status`);

  // Check services
  if (subcommand === 'all' || subcommand === 'services') {
    console.log(`${colors.bold}Services:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      const spinner = new Spinner(`Checking ${name}...`);
      spinner.start();

      const cmd = `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.url,status.conditions[0].status)" 2>/dev/null`;
      const result = execCommand(cmd);

      if (result) {
        const [url, status] = result.split('\t');
        spinner.stop(status === 'True');
        console.log(`    URL: ${colors.dim}${url}${colors.reset}`);

        // Get latest revision
        const revCmd = `gcloud run revisions list --service=${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --limit=1 --format="value(name,status.conditions[0].status)" 2>/dev/null`;
        const revResult = execCommand(revCmd);
        if (revResult) {
          const [revName, revStatus] = revResult.split('\t');
          const statusIcon = revStatus === 'True' ? `${colors.green}●${colors.reset}` : `${colors.yellow}●${colors.reset}`;
          console.log(`    Revision: ${colors.dim}${revName}${colors.reset} ${statusIcon}`);
        }
      } else {
        spinner.stop(false);
        console.log(`    ${colors.dim}Not deployed or not accessible${colors.reset}`);
      }
      console.log();
    }
  }

  // Check revisions
  if (subcommand === 'all' || subcommand === 'revisions') {
    console.log(`${colors.bold}Recent Revisions:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      const cmd = `gcloud run revisions list --service=${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --limit=3 --format="table[no-heading](name,status.conditions[0].status,metadata.creationTimestamp)" 2>/dev/null`;
      const result = execCommand(cmd);
      if (result) {
        result.split('\n').forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const status = parts[1] === 'True' ? `${colors.green}✓${colors.reset}` : `${colors.yellow}○${colors.reset}`;
            console.log(`    ${status} ${parts[0]} ${colors.dim}${parts.slice(2).join(' ')}${colors.reset}`);
          }
        });
      }
      console.log();
    }
  }

  // Check traffic
  if (subcommand === 'all' || subcommand === 'traffic') {
    console.log(`${colors.bold}Traffic Distribution:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      const cmd = `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.traffic)" 2>/dev/null`;
      const result = execCommand(cmd);
      if (result) {
        console.log(`    ${result.replace(/;/g, '\n    ')}`);
      } else {
        console.log(`    ${colors.dim}100% to latest${colors.reset}`);
      }
      console.log();
    }
  }

  // Quick health check
  console.log(`${colors.bold}Health Checks:${colors.reset}\n`);
  for (const [name, service] of Object.entries(SERVICES)) {
    const urlCmd = `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.url)" 2>/dev/null`;
    const url = execCommand(urlCmd);
    if (url) {
      const healthUrl = `${url}/health`;
      const spinner = new Spinner(`Checking ${name} health...`);
      spinner.start();
      const healthResult = execCommandWithStatus(`curl -s -o /dev/null -w "%{http_code}" "${healthUrl}" 2>/dev/null`);
      const isHealthy = healthResult.output === '200';
      spinner.stop(isHealthy);
      if (!isHealthy) {
        console.log(`    ${colors.dim}HTTP ${healthResult.output || 'timeout'}${colors.reset}`);
      }
    }
  }
}

// ============================================================================
// DOCTOR COMMAND
// ============================================================================

async function handleDoctor(args: string[]): Promise<void> {
  const subcommand = args[0] || 'all';

  log.header(`${icons.doctor} System Diagnostics`);

  let issues = 0;
  let warnings = 0;

  // Environment checks
  if (subcommand === 'all' || subcommand === 'env') {
    console.log(`${colors.bold}Environment:${colors.reset}\n`);

    const envChecks = [
      { name: 'Node.js', cmd: 'node --version', expected: /^v\d+\.\d+/, required: true },
      { name: 'npm', cmd: 'npm --version', expected: /^\d+/, required: true },
      { name: 'TypeScript', cmd: 'npx tsc --version', expected: /Version/, required: true },
      { name: 'gcloud CLI', cmd: 'gcloud --version 2>/dev/null | head -1', expected: /Google Cloud SDK/, required: true },
      { name: 'Docker', cmd: 'docker --version 2>/dev/null', expected: /Docker version/, required: false },
      { name: 'Firebase CLI', cmd: 'firebase --version 2>/dev/null', expected: /\d+\.\d+/, required: false },
      { name: 'gh CLI', cmd: 'gh --version 2>/dev/null | head -1', expected: /gh version/, required: false },
    ];

    for (const check of envChecks) {
      const result = execCommand(check.cmd);
      if (check.expected.test(result)) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${check.name}: ${colors.dim}${result.split('\n')[0]}${colors.reset}`);
      } else if (check.required) {
        console.log(`  ${colors.red}${icons.error}${colors.reset} ${check.name}: ${colors.dim}not found (required)${colors.reset}`);
        issues++;
      } else {
        console.log(`  ${colors.yellow}${icons.warning}${colors.reset} ${check.name}: ${colors.dim}not found (optional)${colors.reset}`);
        warnings++;
      }
    }
    console.log();
  }

  // API checks
  if (subcommand === 'all' || subcommand === 'apis') {
    console.log(`${colors.bold}GCP APIs:${colors.reset}\n`);

    const apis = [
      'run.googleapis.com',
      'cloudbuild.googleapis.com',
      'secretmanager.googleapis.com',
      'firestore.googleapis.com',
      'logging.googleapis.com',
    ];

    for (const api of apis) {
      const spinner = new Spinner(`Checking ${api}...`);
      spinner.start();
      const result = execCommand(`gcloud services list --enabled --filter="name:${api}" --format="value(name)" --project=${GCP_PROJECT} 2>/dev/null`);
      if (result.includes(api)) {
        spinner.stop(true);
      } else {
        spinner.stop(false);
        console.log(`    ${colors.dim}Enable with: gcloud services enable ${api}${colors.reset}`);
        warnings++;
      }
    }
    console.log();
  }

  // Project files check
  if (subcommand === 'all' || subcommand === 'env') {
    console.log(`${colors.bold}Project Files:${colors.reset}\n`);

    const files = [
      { path: '.env', required: true, desc: 'Environment variables' },
      { path: 'package.json', required: true, desc: 'Package manifest' },
      { path: 'frontend-typescript/package.json', required: true, desc: 'Frontend package' },
      { path: 'design-system/dist/tokens.css', required: false, desc: 'Design tokens' },
      { path: '.env.production', required: false, desc: 'Production env' },
    ];

    for (const file of files) {
      const exists = existsSync(join(PROJECT_ROOT, file.path));
      if (exists) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${file.path}`);
      } else if (file.required) {
        console.log(`  ${colors.red}${icons.error}${colors.reset} ${file.path} ${colors.dim}(${file.desc} - required)${colors.reset}`);
        issues++;
      } else {
        console.log(`  ${colors.yellow}${icons.warning}${colors.reset} ${file.path} ${colors.dim}(${file.desc} - optional)${colors.reset}`);
        warnings++;
      }
    }
    console.log();
  }

  // Environment variables check
  if (subcommand === 'all' || subcommand === 'env') {
    console.log(`${colors.bold}Required Environment Variables:${colors.reset}\n`);

    const envPath = join(PROJECT_ROOT, '.env');
    let envContent = '';
    try {
      envContent = readFileSync(envPath, 'utf-8');
    } catch {
      log.error('.env file not found');
      issues++;
    }

    const requiredVars = [
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
      'LIVEKIT_URL',
      'GOOGLE_API_KEY',
      'CARTESIA_API_KEY',
    ];

    for (const varName of requiredVars) {
      const hasVar = envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=\n`) && !envContent.includes(`${varName}=""`);
      if (hasVar) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${varName}`);
      } else {
        console.log(`  ${colors.red}${icons.error}${colors.reset} ${varName} ${colors.dim}(missing or empty)${colors.reset}`);
        issues++;
      }
    }
    console.log();
  }

  // Summary
  console.log(`${colors.bold}Summary:${colors.reset}\n`);
  if (issues === 0 && warnings === 0) {
    console.log(`  ${colors.green}${icons.success} All checks passed!${colors.reset}`);
  } else {
    if (issues > 0) {
      console.log(`  ${colors.red}${icons.error} ${issues} issue(s) found${colors.reset}`);
    }
    if (warnings > 0) {
      console.log(`  ${colors.yellow}${icons.warning} ${warnings} warning(s)${colors.reset}`);
    }
  }
  console.log();
}

// ============================================================================
// DATABASE COMMAND
// ============================================================================

async function handleDb(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`${icons.database} Database Operations`);

  if (subcommand === 'status') {
    console.log(`${colors.bold}Firestore Status:${colors.reset}\n`);

    const spinner = new Spinner('Checking Firestore...');
    spinner.start();
    const result = execCommand(`gcloud firestore databases describe --project=${GCP_PROJECT} 2>/dev/null`);
    spinner.stop(!!result);

    if (result) {
      const lines = result.split('\n');
      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':').map(s => s.trim());
          if (key && value) {
            console.log(`    ${colors.dim}${key}:${colors.reset} ${value}`);
          }
        }
      });
    }
    console.log();

    // Check collections
    console.log(`${colors.bold}Collections (estimate):${colors.reset}\n`);
    const collections = ['users', 'sessions', 'memories', 'conversations', 'goals'];
    for (const col of collections) {
      console.log(`  ${colors.dim}${icons.bullet}${colors.reset} ${col}`);
    }
    console.log();
    log.info(`View in console: https://console.cloud.google.com/firestore/databases/-default-/data?project=${GCP_PROJECT}`);
  }

  if (subcommand === 'backup') {
    log.info('Creating Firestore backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bucket = `gs://${GCP_PROJECT}-firestore-backups`;

    log.step(`Backup location: ${bucket}/${timestamp}`);

    const cmd = `gcloud firestore export ${bucket}/${timestamp} --project=${GCP_PROJECT} 2>&1`;
    log.info('Run this command to create a backup:');
    console.log(`\n  ${colors.cyan}${cmd}${colors.reset}\n`);
    log.warn('Note: Requires the firestore-backups bucket to exist');
  }

  if (subcommand === 'users') {
    log.info('User statistics require running a query script.');
    log.step('To get user stats, run:');
    console.log(`\n  ${colors.cyan}npx tsx scripts/db-stats.ts${colors.reset}\n`);
  }

  if (subcommand === 'migrate') {
    log.info('Database migrations:');
    console.log(`\n  ${colors.cyan}npx tsx scripts/migrate-memories.ts${colors.reset} - Migrate memory format`);
    console.log(`  ${colors.cyan}npx tsx scripts/migrate-users.ts${colors.reset} - Migrate user schema\n`);
  }

  if (subcommand === 'query') {
    log.info('Interactive query mode not yet implemented.');
    log.step('Use Firebase console for queries:');
    console.log(`\n  ${colors.cyan}https://console.cloud.google.com/firestore/databases/-default-/data?project=${GCP_PROJECT}${colors.reset}\n`);
  }
}

// ============================================================================
// TOKENS COMMAND
// ============================================================================

async function handleTokens(args: string[]): Promise<void> {
  const subcommand = args[0] || 'sync';

  log.header(`🎨 Design Tokens`);

  if (subcommand === 'sync') {
    console.log(`${colors.bold}Syncing all design tokens...${colors.reset}\n`);

    const spinner = new Spinner('Building design system...');
    spinner.start();

    const result = spawnSync('npm', ['run', 'tokens:sync'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: true,
    });

    if (result.status === 0) {
      spinner.stop(true);
      log.success('All tokens synced successfully');
    } else {
      spinner.stop(false);
      console.log(result.stderr?.toString() || result.stdout?.toString());
    }
  }

  if (subcommand === 'check') {
    console.log(`${colors.bold}Checking for token drift...${colors.reset}\n`);

    const driftResult = spawnSync('node', ['design-system/check-drift.js'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    console.log();

    const brandResult = spawnSync('node', ['design-system/check-brand.js'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    if (driftResult.status === 0 && brandResult.status === 0) {
      console.log();
      log.success('All checks passed');
    }
  }

  if (subcommand === 'version') {
    const versionType = args[1];
    const changes = args.slice(2);

    if (!versionType) {
      // Show current version
      const result = spawnSync('npm', ['run', 'tokens:version', '--', '--current'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        shell: true,
      });
      const version = result.stdout?.toString().trim().split('\n').pop();
      console.log(`Current token version: ${colors.bold}${colors.green}${version}${colors.reset}`);
      console.log(`\n${colors.dim}Bump version with: ferni tokens version <patch|minor|major> "change description"${colors.reset}`);
      return;
    }

    if (!['patch', 'minor', 'major'].includes(versionType)) {
      log.error(`Invalid version type: ${versionType}`);
      log.info('Use: patch, minor, or major');
      return;
    }

    if (changes.length === 0) {
      log.error('Please provide at least one change description');
      log.info('Example: ferni tokens version patch "Fixed button colors"');
      return;
    }

    const versionArgs = ['run', 'tokens:version', '--', versionType, ...changes];
    spawnSync('npm', versionArgs, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
  }

  if (subcommand === 'watch') {
    console.log(`${colors.bold}Starting token file watcher...${colors.reset}\n`);
    log.info('Watching for changes in design-system/tokens/');
    log.info('Press Ctrl+C to stop\n');

    spawn('npm', ['run', 'tokens:watch'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
  }

  if (subcommand === 'brand') {
    console.log(`${colors.bold}Checking brand alignment...${colors.reset}\n`);

    spawnSync('node', ['design-system/check-brand.js'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }
}

// ============================================================================
// ENVIRONMENT COMMAND
// ============================================================================

async function handleEnv(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header(`${icons.env} Environment Variables`);

  const envPath = join(PROJECT_ROOT, '.env');
  const envExamplePath = join(PROJECT_ROOT, '.env.example');

  if (subcommand === 'list') {
    console.log(`${colors.bold}Current .env variables:${colors.reset}\n`);

    if (!existsSync(envPath)) {
      log.error('.env file not found');
      log.info(`Create one with: cp .env.example .env`);
      return;
    }

    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));

    let currentSection = '';
    for (const line of lines) {
      if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');
        const hasValue = value && value !== '""' && value !== "''";
        const icon = hasValue ? `${colors.green}●${colors.reset}` : `${colors.yellow}○${colors.reset}`;
        const maskedValue = hasValue ? `${colors.dim}[set]${colors.reset}` : `${colors.dim}[empty]${colors.reset}`;
        console.log(`  ${icon} ${key} ${maskedValue}`);
      }
    }
    console.log();
    log.info(`Total: ${lines.length} variables`);
  }

  if (subcommand === 'check') {
    console.log(`${colors.bold}Checking required variables:${colors.reset}\n`);

    const required = [
      { key: 'LIVEKIT_API_KEY', desc: 'LiveKit authentication' },
      { key: 'LIVEKIT_API_SECRET', desc: 'LiveKit authentication' },
      { key: 'LIVEKIT_URL', desc: 'LiveKit server URL' },
      { key: 'GOOGLE_API_KEY', desc: 'Google AI/Gemini' },
      { key: 'CARTESIA_API_KEY', desc: 'Text-to-speech' },
    ];

    const optional = [
      { key: 'OPENAI_API_KEY', desc: 'OpenAI (fallback)' },
      { key: 'ANTHROPIC_API_KEY', desc: 'Anthropic Claude' },
      { key: 'STRIPE_SECRET_KEY', desc: 'Payments' },
      { key: 'SPOTIFY_CLIENT_ID', desc: 'Spotify integration' },
      { key: 'TWILIO_ACCOUNT_SID', desc: 'SMS/Voice' },
    ];

    let content = '';
    try {
      content = readFileSync(envPath, 'utf-8');
    } catch {
      log.error('.env file not found');
      return;
    }

    console.log(`  ${colors.bold}Required:${colors.reset}`);
    let missingRequired = 0;
    for (const { key, desc } of required) {
      const regex = new RegExp(`^${key}=.+`, 'm');
      const hasValue = regex.test(content);
      if (hasValue) {
        console.log(`    ${colors.green}${icons.success}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`);
      } else {
        console.log(`    ${colors.red}${icons.error}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`);
        missingRequired++;
      }
    }

    console.log(`\n  ${colors.bold}Optional:${colors.reset}`);
    for (const { key, desc } of optional) {
      const regex = new RegExp(`^${key}=.+`, 'm');
      const hasValue = regex.test(content);
      if (hasValue) {
        console.log(`    ${colors.green}${icons.success}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`);
      } else {
        console.log(`    ${colors.dim}${icons.bullet}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`);
      }
    }

    console.log();
    if (missingRequired > 0) {
      log.error(`${missingRequired} required variable(s) missing`);
    } else {
      log.success('All required variables are set');
    }
  }

  if (subcommand === 'diff') {
    console.log(`${colors.bold}Comparing .env with .env.example:${colors.reset}\n`);

    if (!existsSync(envExamplePath)) {
      log.error('.env.example not found');
      return;
    }
    if (!existsSync(envPath)) {
      log.error('.env not found');
      return;
    }

    const exampleContent = readFileSync(envExamplePath, 'utf-8');
    const envContent = readFileSync(envPath, 'utf-8');

    const getKeys = (content: string) =>
      content.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => l.split('=')[0].trim());

    const exampleKeys = new Set(getKeys(exampleContent));
    const envKeys = new Set(getKeys(envContent));

    const missing = [...exampleKeys].filter(k => !envKeys.has(k));
    const extra = [...envKeys].filter(k => !exampleKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
      log.success('No differences found');
    } else {
      if (missing.length > 0) {
        console.log(`  ${colors.red}Missing in .env:${colors.reset}`);
        missing.forEach(k => console.log(`    ${colors.red}-${colors.reset} ${k}`));
      }
      if (extra.length > 0) {
        console.log(`  ${colors.yellow}Extra in .env (not in example):${colors.reset}`);
        extra.forEach(k => console.log(`    ${colors.yellow}+${colors.reset} ${k}`));
      }
    }
  }

  if (subcommand === 'secrets') {
    console.log(`${colors.bold}GCP Secret Manager:${colors.reset}\n`);

    const spinner = new Spinner('Fetching secrets...');
    spinner.start();
    const result = execCommand(`gcloud secrets list --project=${GCP_PROJECT} --format="table(name,createTime)" 2>/dev/null`);
    spinner.stop(!!result);

    if (result) {
      console.log(result);
    } else {
      log.info('No secrets found or not authenticated');
    }

    console.log();
    log.info(`Manage secrets: https://console.cloud.google.com/security/secret-manager?project=${GCP_PROJECT}`);
  }

  if (subcommand === 'sync') {
    log.info('Syncing environment with Cloud Run...');
    log.step('This will update Cloud Run services with .env values');
    console.log();
    log.warn('Not yet implemented - use deploy command instead');
  }
}

// ============================================================================
// DEV COMMAND
// ============================================================================

const DEV_PORTS = {
  token: 3001,
  ui: 3002,
  frontend: 3004,
  agent: 8081,
  storybook: 6006,
};

async function handleDev(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`🛠️ Development Workflow`);

  if (subcommand === 'status' || subcommand === 'ports') {
    console.log(`${colors.bold}Development Server Status:${colors.reset}\n`);

    for (const [name, port] of Object.entries(DEV_PORTS)) {
      const spinner = new Spinner(`Checking ${name} (port ${port})...`);
      spinner.start();
      const result = execCommand(`lsof -i :${port} -t 2>/dev/null`);
      const isRunning = !!result.trim();
      spinner.stop(isRunning);
      if (isRunning) {
        const pids = result.trim().split('\n');
        console.log(`    ${colors.dim}PID: ${pids.join(', ')}${colors.reset}`);
      }
    }

    console.log();
    log.info('Start servers with: ferni dev start');
    log.info('Stop servers with: ferni dev stop');
  }

  if (subcommand === 'start') {
    const target = args[1] || 'all';

    if (target === 'all') {
      console.log(`${colors.bold}Starting all development servers...${colors.reset}\n`);
      log.step('Token Server (port 3001)');
      log.step('UI Server (port 3002)');
      log.step('Frontend (port 3004)');
      console.log();

      spawn('npm', ['run', 'dev:full'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
      });
    } else if (target === 'frontend') {
      log.info('Starting frontend only...');
      spawn('npm', ['run', 'dev', '--prefix', 'frontend-typescript'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
      });
    } else if (target === 'agent') {
      log.info('Starting voice agent...');
      spawn('npm', ['run', 'dev'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
      });
    } else if (target === 'storybook') {
      log.info('Starting Storybook...');
      spawn('npm', ['run', 'storybook'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
      });
    } else {
      log.error(`Unknown target: ${target}`);
      log.info('Available: all, frontend, agent, storybook');
    }
  }

  if (subcommand === 'stop') {
    console.log(`${colors.bold}Stopping development servers...${colors.reset}\n`);

    for (const [name, port] of Object.entries(DEV_PORTS)) {
      const pids = execCommand(`lsof -i :${port} -t 2>/dev/null`);
      if (pids.trim()) {
        const spinner = new Spinner(`Stopping ${name} (port ${port})...`);
        spinner.start();
        execCommand(`lsof -i :${port} -t | xargs kill -9 2>/dev/null`);
        spinner.stop(true);
      }
    }

    console.log();
    log.success('All servers stopped');
  }

  if (subcommand === 'restart') {
    log.info('Restarting development servers...');
    await handleDev(['stop']);
    console.log();
    await handleDev(['start', args[1] || 'all']);
  }

  if (subcommand === 'frontend') {
    await handleDev(['start', 'frontend']);
  }

  if (subcommand === 'agent') {
    await handleDev(['start', 'agent']);
  }
}

// ============================================================================
// PERSONAS COMMAND
// ============================================================================

async function handlePersonas(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header(`🎭 Persona Management`);

  const personaDir = join(PROJECT_ROOT, 'src', 'personas', 'bundles');

  if (subcommand === 'list') {
    console.log(`${colors.bold}Available Personas:${colors.reset}\n`);

    const personas = execCommand(`ls -d ${personaDir}/*/ 2>/dev/null | xargs -I{} basename {}`);
    if (personas) {
      const personaList = personas.split('\n').filter(Boolean);
      for (const persona of personaList) {
        const manifestPath = join(personaDir, persona, 'persona.manifest.json');
        let info = '';
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          info = ` ${colors.dim}- ${manifest.displayName || persona}${colors.reset}`;
        } catch {
          // No manifest
        }
        console.log(`  ${colors.green}${icons.bullet}${colors.reset} ${persona}${info}`);
      }
      console.log();
      log.info(`Total: ${personaList.length} personas`);
    } else {
      log.warn('No personas found');
    }
  }

  if (subcommand === 'show') {
    const personaId = args[1];
    if (!personaId) {
      log.error('Please specify a persona ID');
      log.info('Usage: ferni personas show <persona-id>');
      return;
    }

    const manifestPath = join(personaDir, personaId, 'persona.manifest.json');
    const systemPromptPath = join(personaDir, personaId, 'identity', 'system-prompt.md');

    console.log(`${colors.bold}Persona: ${personaId}${colors.reset}\n`);

    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        console.log(`  ${colors.cyan}Display Name:${colors.reset} ${manifest.displayName || 'N/A'}`);
        console.log(`  ${colors.cyan}Voice:${colors.reset} ${manifest.voice?.provider || 'N/A'} - ${manifest.voice?.id || 'N/A'}`);
        console.log(`  ${colors.cyan}Model:${colors.reset} ${manifest.model || 'default'}`);
        if (manifest.capabilities) {
          console.log(`  ${colors.cyan}Capabilities:${colors.reset} ${manifest.capabilities.join(', ')}`);
        }
      } catch (e) {
        log.error('Failed to parse manifest');
      }
    } else {
      log.warn('No manifest found');
    }

    console.log();
    if (existsSync(systemPromptPath)) {
      const promptPreview = readFileSync(systemPromptPath, 'utf-8').slice(0, 500);
      console.log(`${colors.bold}System Prompt Preview:${colors.reset}\n`);
      console.log(`  ${colors.dim}${promptPreview.replace(/\n/g, '\n  ')}...${colors.reset}`);
    }
  }

  if (subcommand === 'validate') {
    console.log(`${colors.bold}Validating all personas...${colors.reset}\n`);

    const spinner = new Spinner('Running persona validation...');
    spinner.start();

    const result = spawnSync('npm', ['run', 'validate', 'personas'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: true,
    });

    spinner.stop(result.status === 0);

    if (result.status !== 0) {
      console.log(result.stdout?.toString() || result.stderr?.toString());
    }
  }

  if (subcommand === 'generate') {
    log.info('Generating persona files...');

    spawnSync('npm', ['run', 'generate', 'personas'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
  }

  if (subcommand === 'stats') {
    console.log(`${colors.bold}Persona Statistics:${colors.reset}\n`);

    const personas = execCommand(`ls -d ${personaDir}/*/ 2>/dev/null | xargs -I{} basename {}`);
    const personaList = personas.split('\n').filter(Boolean);

    let totalTools = 0;
    let totalBehaviors = 0;

    for (const persona of personaList) {
      const toolsDir = join(personaDir, persona, 'tools');
      const behaviorsDir = join(personaDir, persona, 'content', 'behaviors');

      const tools = existsSync(toolsDir) ? execCommand(`ls ${toolsDir}/*.ts 2>/dev/null | wc -l`).trim() : '0';
      const behaviors = existsSync(behaviorsDir) ? execCommand(`ls ${behaviorsDir}/*.json 2>/dev/null | wc -l`).trim() : '0';

      totalTools += parseInt(tools);
      totalBehaviors += parseInt(behaviors);

      console.log(`  ${colors.cyan}${persona}:${colors.reset}`);
      console.log(`    Tools: ${tools}, Behaviors: ${behaviors}`);
    }

    console.log();
    console.log(`  ${colors.bold}Total:${colors.reset} ${personaList.length} personas, ${totalTools} tools, ${totalBehaviors} behaviors`);
  }

  if (subcommand === 'compare') {
    const persona1 = args[1];
    const persona2 = args[2];

    if (!persona1 || !persona2) {
      log.error('Please specify two personas to compare');
      log.info('Usage: ferni personas compare <persona1> <persona2>');
      return;
    }

    console.log(`${colors.bold}Comparing ${persona1} vs ${persona2}:${colors.reset}\n`);
    log.info('Comparison feature coming soon');
  }
}

// ============================================================================
// QUALITY COMMAND
// ============================================================================

async function handleQuality(args: string[]): Promise<void> {
  const subcommand = args[0] || 'all';

  log.header(`✅ Quality Checks`);

  const checks = {
    typecheck: { name: 'TypeScript', cmd: 'npm run typecheck' },
    lint: { name: 'ESLint', cmd: 'npm run lint' },
    format: { name: 'Prettier', cmd: 'npm run format:check' },
    test: { name: 'Unit Tests', cmd: 'npm test -- --run' },
    audit: { name: 'Code Quality', cmd: 'npm run audit quality' },
  };

  if (subcommand === 'quick') {
    console.log(`${colors.bold}Running quick checks (typecheck + lint)...${colors.reset}\n`);

    for (const key of ['typecheck', 'lint']) {
      const check = checks[key as keyof typeof checks];
      const spinner = new Spinner(`Running ${check.name}...`);
      spinner.start();

      const result = spawnSync('sh', ['-c', check.cmd], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });

      spinner.stop(result.status === 0);

      if (result.status !== 0) {
        console.log(`\n${result.stdout?.toString() || result.stderr?.toString()}`);
      }
    }
  } else if (subcommand === 'all') {
    console.log(`${colors.bold}Running all quality checks...${colors.reset}\n`);

    let passed = 0;
    let failed = 0;

    for (const [key, check] of Object.entries(checks)) {
      const spinner = new Spinner(`Running ${check.name}...`);
      spinner.start();

      const result = spawnSync('sh', ['-c', check.cmd], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });

      spinner.stop(result.status === 0);

      if (result.status === 0) {
        passed++;
      } else {
        failed++;
        console.log(`\n${colors.dim}${result.stdout?.toString().slice(0, 500) || ''}${colors.reset}`);
      }
    }

    console.log();
    if (failed === 0) {
      log.success(`All ${passed} checks passed!`);
    } else {
      log.error(`${failed} check(s) failed, ${passed} passed`);
    }
  } else if (checks[subcommand as keyof typeof checks]) {
    const check = checks[subcommand as keyof typeof checks];
    console.log(`${colors.bold}Running ${check.name}...${colors.reset}\n`);

    spawnSync('sh', ['-c', check.cmd], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  } else {
    log.error(`Unknown check: ${subcommand}`);
    log.info(`Available: ${Object.keys(checks).join(', ')}, all, quick`);
  }
}

// ============================================================================
// PR COMMAND
// ============================================================================

async function handlePR(args: string[]): Promise<void> {
  const subcommand = args[0] || 'check';

  log.header(`🔀 Pull Request Workflow`);

  // Check if gh CLI is available
  const ghAvailable = execCommand('which gh 2>/dev/null');
  if (!ghAvailable) {
    log.error('GitHub CLI (gh) not found');
    log.info('Install: brew install gh');
    return;
  }

  if (subcommand === 'check') {
    console.log(`${colors.bold}Running PR readiness checks...${colors.reset}\n`);

    // Run quality checks
    const checks = [
      { name: 'TypeScript', cmd: 'npm run typecheck' },
      { name: 'ESLint', cmd: 'npm run lint' },
      { name: 'Tests', cmd: 'npm test -- --run' },
      { name: 'Token Drift', cmd: 'node design-system/check-drift.js' },
    ];

    let allPassed = true;
    for (const check of checks) {
      const spinner = new Spinner(`${check.name}...`);
      spinner.start();
      const result = spawnSync('sh', ['-c', check.cmd], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });
      spinner.stop(result.status === 0);
      if (result.status !== 0) allPassed = false;
    }

    console.log();

    // Check git status
    console.log(`${colors.bold}Git Status:${colors.reset}\n`);
    const branch = execCommand('git rev-parse --abbrev-ref HEAD');
    const uncommitted = execCommand('git status --porcelain');
    const behind = execCommand('git rev-list --count HEAD..origin/main 2>/dev/null || echo 0');

    console.log(`  Branch: ${colors.cyan}${branch}${colors.reset}`);
    console.log(`  Uncommitted changes: ${uncommitted ? colors.yellow + 'Yes' : colors.green + 'None'}${colors.reset}`);
    console.log(`  Behind main: ${behind !== '0' ? colors.yellow + behind + ' commits' : colors.green + 'Up to date'}${colors.reset}`);

    console.log();
    if (allPassed && !uncommitted && behind === '0') {
      log.success('Ready to create PR!');
      log.info('Run: ferni pr create');
    } else {
      log.warn('Some checks need attention before creating PR');
    }
  }

  if (subcommand === 'create') {
    const title = args.slice(1).join(' ');

    if (!title) {
      log.info('Creating PR interactively...');
    }

    spawnSync('gh', ['pr', 'create', ...(title ? ['--title', title] : [])], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'list') {
    console.log(`${colors.bold}Open Pull Requests:${colors.reset}\n`);

    spawnSync('gh', ['pr', 'list'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'view') {
    const prNumber = args[1];

    spawnSync('gh', ['pr', 'view', ...(prNumber ? [prNumber] : [])], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'merge') {
    const prNumber = args[1];

    spawnSync('gh', ['pr', 'merge', ...(prNumber ? [prNumber] : []), '--squash'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }
}

// ============================================================================
// TOOLS COMMAND
// ============================================================================

async function handleTools(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header(`🔧 LLM Tools Management`);

  const toolsDir = join(PROJECT_ROOT, 'src', 'tools');

  if (subcommand === 'list') {
    console.log(`${colors.bold}Available LLM Tools:${colors.reset}\n`);

    // Get tool files
    const toolFiles = execCommand(`find ${toolsDir} -name "*.ts" -type f ! -name "*.test.ts" ! -name "types.ts" ! -name "index.ts" ! -path "*/node_modules/*" 2>/dev/null`);

    const tools = toolFiles.split('\n').filter(Boolean).map(f => {
      const relative = f.replace(toolsDir + '/', '');
      return relative.replace('.ts', '');
    });

    // Group by directory
    const grouped: Record<string, string[]> = {};
    for (const tool of tools) {
      const parts = tool.split('/');
      const category = parts.length > 1 ? parts[0] : 'root';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(parts[parts.length - 1]);
    }

    for (const [category, categoryTools] of Object.entries(grouped)) {
      console.log(`  ${colors.cyan}${category}:${colors.reset}`);
      for (const tool of categoryTools) {
        console.log(`    ${colors.dim}${icons.bullet}${colors.reset} ${tool}`);
      }
    }

    console.log();
    log.info(`Total: ${tools.length} tools`);
  }

  if (subcommand === 'show') {
    const toolName = args[1];
    if (!toolName) {
      log.error('Please specify a tool name');
      log.info('Usage: ferni tools show <tool-name>');
      return;
    }

    const toolPath = execCommand(`find ${toolsDir} -name "${toolName}.ts" -type f ! -name "*.test.ts" 2>/dev/null | head -1`);

    if (!toolPath) {
      log.error(`Tool not found: ${toolName}`);
      return;
    }

    console.log(`${colors.bold}Tool: ${toolName}${colors.reset}\n`);
    console.log(`  ${colors.cyan}Path:${colors.reset} ${toolPath.replace(PROJECT_ROOT + '/', '')}`);

    // Count lines
    const lines = execCommand(`wc -l < "${toolPath}"`).trim();
    console.log(`  ${colors.cyan}Lines:${colors.reset} ${lines}`);

    // Look for function definitions
    const functions = execCommand(`grep -E "^(export )?(async )?function" "${toolPath}" 2>/dev/null | head -5`);
    if (functions) {
      console.log(`\n  ${colors.cyan}Functions:${colors.reset}`);
      functions.split('\n').filter(Boolean).forEach(fn => {
        const match = fn.match(/function\s+(\w+)/);
        if (match) {
          console.log(`    ${colors.dim}${icons.bullet}${colors.reset} ${match[1]}`);
        }
      });
    }
  }

  if (subcommand === 'stats') {
    console.log(`${colors.bold}Tool Statistics:${colors.reset}\n`);

    const toolFiles = execCommand(`find ${toolsDir} -name "*.ts" -type f ! -name "*.test.ts" ! -name "types.ts" ! -name "index.ts" 2>/dev/null`);
    const tools = toolFiles.split('\n').filter(Boolean);

    let totalLines = 0;
    const largestTools: { name: string; lines: number }[] = [];

    for (const tool of tools) {
      const lines = parseInt(execCommand(`wc -l < "${tool}"`).trim()) || 0;
      totalLines += lines;
      largestTools.push({
        name: tool.replace(toolsDir + '/', '').replace('.ts', ''),
        lines,
      });
    }

    largestTools.sort((a, b) => b.lines - a.lines);

    console.log(`  Total tools: ${tools.length}`);
    console.log(`  Total lines: ${totalLines.toLocaleString()}`);
    console.log(`  Average lines/tool: ${Math.round(totalLines / tools.length)}`);

    console.log(`\n  ${colors.cyan}Largest tools:${colors.reset}`);
    for (const tool of largestTools.slice(0, 5)) {
      const status = tool.lines > 500 ? colors.yellow : colors.green;
      console.log(`    ${status}${tool.lines.toString().padStart(4)}${colors.reset} ${tool.name}`);
    }
  }

  if (subcommand === 'validate') {
    console.log(`${colors.bold}Validating tools...${colors.reset}\n`);

    const spinner = new Spinner('Running tool validation...');
    spinner.start();

    const result = spawnSync('npm', ['run', 'typecheck'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: true,
    });

    spinner.stop(result.status === 0);

    if (result.status !== 0) {
      console.log(result.stdout?.toString() || result.stderr?.toString());
    } else {
      log.success('All tools validated');
    }
  }

  if (subcommand === 'test') {
    const toolName = args[1];

    if (toolName) {
      log.info(`Running tests for ${toolName}...`);
      spawnSync('npm', ['test', '--', '--run', '-t', toolName], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
      });
    } else {
      log.info('Running all tool tests...');
      spawnSync('npm', ['test', '--', '--run', 'tools/'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: true,
      });
    }
  }
}

// ============================================================================
// JOBS COMMAND
// ============================================================================

async function handleJobs(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header(`⏰ Scheduled Jobs`);

  if (subcommand === 'list') {
    console.log(`${colors.bold}Configured Jobs:${colors.reset}\n`);

    // Check Cloud Scheduler jobs
    const spinner = new Spinner('Fetching Cloud Scheduler jobs...');
    spinner.start();

    const result = execCommand(`gcloud scheduler jobs list --project=${GCP_PROJECT} --format="table(name,schedule,state,lastAttemptTime)" 2>/dev/null`);
    spinner.stop(!!result);

    if (result) {
      console.log(result);
    } else {
      log.info('No Cloud Scheduler jobs found');
    }

    console.log();
    log.info(`Manage jobs: https://console.cloud.google.com/cloudscheduler?project=${GCP_PROJECT}`);
  }

  if (subcommand === 'status') {
    console.log(`${colors.bold}Job Execution Status:${colors.reset}\n`);

    const spinner = new Spinner('Checking job status...');
    spinner.start();

    const result = execCommand(`gcloud scheduler jobs list --project=${GCP_PROJECT} --format="table(name,state,lastAttemptTime,status.code)" 2>/dev/null`);
    spinner.stop(!!result);

    if (result) {
      console.log(result);
    }
  }

  if (subcommand === 'run') {
    const jobName = args[1];

    if (!jobName) {
      log.error('Please specify a job name');
      log.info('Usage: ferni jobs run <job-name>');
      return;
    }

    log.info(`Triggering job: ${jobName}...`);

    spawnSync('gcloud', ['scheduler', 'jobs', 'run', jobName, '--project=' + GCP_PROJECT], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'history') {
    const jobName = args[1];

    console.log(`${colors.bold}Job Execution History:${colors.reset}\n`);

    if (jobName) {
      log.info(`Showing history for: ${jobName}`);
    }

    // Show Cloud Logging for scheduler jobs
    const filter = jobName ? `AND labels.job_name="${jobName}"` : '';
    const cmd = `gcloud logging read "resource.type=cloud_scheduler_job ${filter}" --limit=10 --project=${GCP_PROJECT} --format="table(timestamp,severity,textPayload)" 2>/dev/null`;

    spawnSync('sh', ['-c', cmd], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'logs') {
    const jobName = args[1];

    console.log(`${colors.bold}Job Logs:${colors.reset}\n`);

    const filter = jobName ? `AND labels.job_name="${jobName}"` : '';
    const cmd = `gcloud logging read "resource.type=cloud_scheduler_job ${filter}" --limit=20 --project=${GCP_PROJECT} 2>/dev/null`;

    spawnSync('sh', ['-c', cmd], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }
}

// ============================================================================
// COSTS COMMAND
// ============================================================================

async function handleCosts(args: string[]): Promise<void> {
  const subcommand = args[0] || 'summary';

  log.header(`💰 Cloud Cost Tracking`);

  if (subcommand === 'summary') {
    console.log(`${colors.bold}Cost Summary:${colors.reset}\n`);

    log.info('Fetching billing data...');
    console.log();

    // Link to billing console
    console.log(`  ${colors.cyan}Cloud Billing:${colors.reset}`);
    console.log(`    https://console.cloud.google.com/billing?project=${GCP_PROJECT}`);
    console.log();

    // Show resource estimates
    console.log(`  ${colors.cyan}Active Resources:${colors.reset}`);

    const resources = [
      { name: 'Cloud Run Services', cmd: `gcloud run services list --project=${GCP_PROJECT} --format="value(name)" 2>/dev/null | wc -l` },
      { name: 'Firestore Database', estimate: 'Standard pricing' },
      { name: 'Cloud Build', estimate: 'Pay per build minute' },
      { name: 'Secret Manager', cmd: `gcloud secrets list --project=${GCP_PROJECT} --format="value(name)" 2>/dev/null | wc -l` },
    ];

    for (const resource of resources) {
      if (resource.cmd) {
        const count = execCommand(resource.cmd).trim();
        console.log(`    ${icons.bullet} ${resource.name}: ${count} active`);
      } else {
        console.log(`    ${icons.bullet} ${resource.name}: ${resource.estimate}`);
      }
    }

    console.log();
    log.info('For detailed costs, visit the Cloud Billing console');
  }

  if (subcommand === 'breakdown') {
    console.log(`${colors.bold}Cost Breakdown by Service:${colors.reset}\n`);

    console.log(`  ${colors.dim}Note: Detailed cost breakdown requires BigQuery export setup${colors.reset}`);
    console.log();

    // Show services
    console.log(`  ${colors.cyan}Estimated Cost Drivers:${colors.reset}`);
    console.log(`    1. Cloud Run (voiceai-agent) - Compute + Memory`);
    console.log(`    2. Cloud Run (john-bogle-ui) - Compute + Memory`);
    console.log(`    3. Firestore - Document reads/writes`);
    console.log(`    4. Cloud Build - Build minutes`);
    console.log(`    5. Egress - Network transfer`);

    console.log();
    console.log(`  ${colors.cyan}Cost Console:${colors.reset}`);
    console.log(`    https://console.cloud.google.com/billing?project=${GCP_PROJECT}`);
  }

  if (subcommand === 'forecast') {
    console.log(`${colors.bold}Cost Forecast:${colors.reset}\n`);

    log.info('Cost forecasting requires billing data export to BigQuery');
    console.log();

    console.log(`  ${colors.cyan}To enable forecasting:${colors.reset}`);
    console.log(`    1. Go to Billing > Budget & alerts`);
    console.log(`    2. Enable BigQuery export`);
    console.log(`    3. Use Cost Breakdown dashboard`);

    console.log();
    console.log(`  ${colors.cyan}Quick links:${colors.reset}`);
    console.log(`    Budgets: https://console.cloud.google.com/billing/budgets?project=${GCP_PROJECT}`);
    console.log(`    Reports: https://console.cloud.google.com/billing/reports?project=${GCP_PROJECT}`);
  }

  if (subcommand === 'alerts') {
    console.log(`${colors.bold}Budget Alerts:${colors.reset}\n`);

    log.info('Configure budget alerts in Cloud Console:');
    console.log(`\n  https://console.cloud.google.com/billing/budgets?project=${GCP_PROJECT}`);

    console.log();
    console.log(`  ${colors.cyan}Recommended alerts:${colors.reset}`);
    console.log(`    ${icons.bullet} 50% of monthly budget`);
    console.log(`    ${icons.bullet} 90% of monthly budget`);
    console.log(`    ${icons.bullet} 100% of monthly budget`);
  }

  if (subcommand === 'optimize') {
    console.log(`${colors.bold}Cost Optimization Recommendations:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Cloud Run:${colors.reset}`);
    console.log(`    ${icons.bullet} Set min-instances to 0 for non-critical services`);
    console.log(`    ${icons.bullet} Use CPU allocation only during requests`);
    console.log(`    ${icons.bullet} Review memory allocation (currently set to 2Gi)`);

    console.log();
    console.log(`  ${colors.cyan}Firestore:${colors.reset}`);
    console.log(`    ${icons.bullet} Use composite indexes for complex queries`);
    console.log(`    ${icons.bullet} Batch reads/writes when possible`);
    console.log(`    ${icons.bullet} Set up TTL for temporary documents`);

    console.log();
    console.log(`  ${colors.cyan}Cloud Build:${colors.reset}`);
    console.log(`    ${icons.bullet} Use caching for faster builds`);
    console.log(`    ${icons.bullet} Consider using kaniko for container builds`);

    console.log();
    console.log(`  ${colors.cyan}General:${colors.reset}`);
    console.log(`    ${icons.bullet} Enable committed use discounts if usage is predictable`);
    console.log(`    ${icons.bullet} Set up spending limits and alerts`);
  }
}

// ============================================================================
// VOICES COMMAND
// ============================================================================

async function handleVoices(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header(`🎤 Voice/TTS Management`);

  if (subcommand === 'list') {
    console.log(`${colors.bold}Configured Voices:${colors.reset}\n`);

    // Read personas to get voice configs
    const personaDir = join(PROJECT_ROOT, 'src', 'personas', 'bundles');
    const personas = execCommand(`ls -d ${personaDir}/*/ 2>/dev/null | xargs -I{} basename {}`);

    if (personas) {
      for (const persona of personas.split('\n').filter(Boolean)) {
        const manifestPath = join(personaDir, persona, 'persona.manifest.json');
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          if (manifest.voice) {
            console.log(`  ${colors.cyan}${persona}:${colors.reset}`);
            console.log(`    Provider: ${manifest.voice.provider || 'cartesia'}`);
            console.log(`    Voice ID: ${manifest.voice.id || 'default'}`);
            if (manifest.voice.name) {
              console.log(`    Name: ${manifest.voice.name}`);
            }
          }
        } catch {
          // Skip if no manifest
        }
      }
    }

    console.log();
    console.log(`  ${colors.bold}Available Providers:${colors.reset}`);
    console.log(`    ${icons.bullet} Cartesia (default)`);
    console.log(`    ${icons.bullet} ElevenLabs`);
    console.log(`    ${icons.bullet} OpenAI TTS`);
  }

  if (subcommand === 'preview') {
    const voiceId = args[1];

    if (!voiceId) {
      log.error('Please specify a voice ID to preview');
      log.info('Usage: ferni voices preview <voice-id>');
      return;
    }

    log.info(`Voice preview for: ${voiceId}`);
    log.info('Voice preview feature requires API integration');

    console.log();
    console.log(`  ${colors.cyan}To preview voices:${colors.reset}`);
    console.log(`    Cartesia: https://play.cartesia.ai/`);
    console.log(`    ElevenLabs: https://elevenlabs.io/voice-library`);
  }

  if (subcommand === 'test') {
    console.log(`${colors.bold}Testing voice synthesis...${colors.reset}\n`);

    const spinner = new Spinner('Running voice validation...');
    spinner.start();

    const result = spawnSync('npm', ['run', 'validate', 'voices'], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      shell: true,
    });

    spinner.stop(result.status === 0);

    if (result.status !== 0) {
      console.log(result.stdout?.toString() || result.stderr?.toString());
    } else {
      log.success('Voice validation passed');
    }
  }

  if (subcommand === 'compare') {
    const voice1 = args[1];
    const voice2 = args[2];

    if (!voice1 || !voice2) {
      log.info('Voice comparison tool');
      console.log();
      console.log(`  ${colors.cyan}Usage:${colors.reset} ferni voices compare <voice1> <voice2>`);
      console.log();
      console.log(`  This will generate audio samples from both voices`);
      console.log(`  for A/B comparison testing.`);
      return;
    }

    log.info(`Comparing voices: ${voice1} vs ${voice2}`);
    log.warn('Voice comparison requires API integration');
  }

  if (subcommand === 'validate') {
    console.log(`${colors.bold}Validating voice configurations...${colors.reset}\n`);

    // Check env vars
    const envVars = ['CARTESIA_API_KEY', 'ELEVENLABS_API_KEY'];
    let hasVoiceProvider = false;

    for (const envVar of envVars) {
      const hasVar = !!process.env[envVar];
      if (hasVar) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${envVar} configured`);
        hasVoiceProvider = true;
      } else {
        console.log(`  ${colors.dim}${icons.bullet}${colors.reset} ${envVar} not set`);
      }
    }

    console.log();

    if (hasVoiceProvider) {
      log.success('Voice provider configured');
    } else {
      log.warn('No voice provider API key found');
      log.info('Set CARTESIA_API_KEY or ELEVENLABS_API_KEY in .env');
    }

    // Check persona voice configs
    console.log();
    console.log(`${colors.bold}Persona Voice Configs:${colors.reset}\n`);

    const personaDir = join(PROJECT_ROOT, 'src', 'personas', 'bundles');
    const personas = execCommand(`ls -d ${personaDir}/*/ 2>/dev/null | xargs -I{} basename {}`);

    let allValid = true;
    for (const persona of personas.split('\n').filter(Boolean)) {
      const manifestPath = join(personaDir, persona, 'persona.manifest.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        if (manifest.voice?.id) {
          console.log(`  ${colors.green}${icons.success}${colors.reset} ${persona}: ${manifest.voice.id}`);
        } else {
          console.log(`  ${colors.yellow}${icons.warning}${colors.reset} ${persona}: No voice configured`);
          allValid = false;
        }
      } catch {
        console.log(`  ${colors.dim}${icons.bullet}${colors.reset} ${persona}: No manifest`);
      }
    }

    console.log();
    if (allValid) {
      log.success('All personas have voice configurations');
    }
  }
}

// ============================================================================
// INTERACTIVE MODE
// ============================================================================

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function interactiveMode(): Promise<void> {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}${colors.green}FERNI${colors.reset} - Your AI Development Assistant                    ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}What would you like to do?${colors.reset}

`);

  const commandList = Object.entries(COMMANDS);

  // Group commands by category
  const devCommands = ['dev', 'deploy', 'build', 'test', 'setup', 'quality', 'pr'];
  const opsCommands = ['status', 'logs', 'doctor', 'db', 'env', 'jobs', 'costs'];
  const agentCommands = ['agents', 'personas', 'tools', 'voices', 'validate', 'generate', 'rollout', 'audit', 'tokens'];

  console.log(`  ${colors.bold}${colors.blue}Development${colors.reset}`);
  let index = 1;
  const indexMap: Record<number, string> = {};

  for (const key of devCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(`    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`);
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.magenta}Operations${colors.reset}`);
  for (const key of opsCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(`    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`);
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.cyan}Agents & Quality${colors.reset}`);
  for (const key of agentCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(`    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`);
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n    ${colors.green} 0${colors.reset}) ${colors.dim}Exit${colors.reset}`);
  console.log();

  const choice = await prompt(`${colors.cyan}Enter choice [0-${index - 1}]:${colors.reset} `);
  const choiceNum = parseInt(choice, 10);

  if (choiceNum === 0 || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  }

  const cmdKey = indexMap[choiceNum];
  if (!cmdKey) {
    log.error('Invalid choice');
    process.exit(1);
  }

  const cmd = COMMANDS[cmdKey];

  // Show subcommands
  if (cmd.subcommands && cmd.subcommands.length > 0) {
    console.log(`\n${colors.bold}${cmd.icon} ${cmd.name} - Subcommands:${colors.reset}\n`);

    cmd.subcommands.forEach((sub, i) => {
      console.log(`  ${colors.green}${(i + 1).toString().padStart(2)}${colors.reset}) ${sub}`);
    });
    console.log(`  ${colors.green} 0${colors.reset}) ${colors.dim}Back${colors.reset}`);
    console.log();

    const subChoice = await prompt(`${colors.cyan}Enter choice [0-${cmd.subcommands.length}]:${colors.reset} `);
    const subNum = parseInt(subChoice, 10);

    if (subNum === 0) {
      await interactiveMode();
      return;
    }

    if (subNum < 1 || subNum > cmd.subcommands.length) {
      log.error('Invalid choice');
      process.exit(1);
    }

    const subcommand = cmd.subcommands[subNum - 1];
    console.log(`\n${colors.cyan}Running: ferni ${cmdKey} ${subcommand}${colors.reset}\n`);

    if (cmd.handler) {
      await cmd.handler([subcommand]);
    } else if (cmd.script) {
      runCommand(cmd.script, [subcommand]);
    }
  } else {
    if (cmd.handler) {
      await cmd.handler([]);
    } else if (cmd.script) {
      runCommand(cmd.script, []);
    }
  }
}

// ============================================================================
// HEALTH CHECK (enhanced)
// ============================================================================

async function runHealthCheck(): Promise<void> {
  await handleDoctor(['all']);
}

// ============================================================================
// HELP
// ============================================================================

function printHelp(): void {
  console.log(`
${colors.bold}${colors.green}FERNI${colors.reset} - Unified CLI for Ferni AI (v2.0)

${colors.bold}Usage:${colors.reset}
  ferni                            Interactive mode
  ferni <command> [subcommand]     Run a specific command
  ferni --help                     Show this help

${colors.bold}Commands:${colors.reset}
`);

  // Group by category
  const categories = {
    'Development': ['dev', 'deploy', 'build', 'test', 'setup', 'quality', 'pr'],
    'Operations': ['status', 'logs', 'doctor', 'db', 'env', 'jobs', 'costs'],
    'Agents & Quality': ['agents', 'personas', 'tools', 'voices', 'validate', 'generate', 'rollout', 'audit', 'tokens'],
  };

  for (const [category, keys] of Object.entries(categories)) {
    console.log(`  ${colors.bold}${category}${colors.reset}`);
    for (const key of keys) {
      const cmd = COMMANDS[key];
      if (cmd) {
        console.log(`    ${colors.green}${key.padEnd(12)}${colors.reset} ${cmd.icon} ${cmd.description}`);
        if (cmd.subcommands) {
          console.log(`    ${colors.dim}             → ${cmd.subcommands.join(', ')}${colors.reset}`);
        }
      }
    }
    console.log();
  }

  console.log(`${colors.bold}Examples:${colors.reset}
  ferni                          # Start interactive mode
  ferni deploy ui                # Deploy UI to cloud
  ferni agents list              # List AI agents
  ferni logs agent --tail        # Stream agent logs
  ferni status                   # Check all services
  ferni doctor                   # Run diagnostics
  ferni db status                # Check database
  ferni env check                # Validate environment

${colors.bold}Tips:${colors.reset}
  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni${colors.reset} without arguments for interactive mode
  ${colors.dim}•${colors.reset} Use ${colors.cyan}--tail${colors.reset} with logs for live streaming
  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni doctor${colors.reset} to diagnose issues
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // No args = interactive mode
  if (args.length === 0) {
    await interactiveMode();
    return;
  }

  // Help
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    return;
  }

  // Version
  if (args.includes('--version') || args.includes('-v')) {
    console.log('ferni v2.0.0');
    return;
  }

  // Health check (alias for doctor)
  if (args[0] === 'health') {
    await runHealthCheck();
    return;
  }

  // Find command
  const cmdKey = args[0];
  const cmd = COMMANDS[cmdKey];

  if (!cmd) {
    log.error(`Unknown command: ${cmdKey}`);
    console.log(`\nRun ${colors.cyan}ferni --help${colors.reset} to see available commands.\n`);
    process.exit(1);
  }

  // Run handler or script
  if (cmd.handler) {
    await cmd.handler(args.slice(1));
  } else if (cmd.script) {
    runCommand(cmd.script, args.slice(1));
  }
}

main().catch((error) => {
  log.error(`Failed: ${error.message}`);
  process.exit(1);
});
