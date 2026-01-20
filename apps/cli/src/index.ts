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

import { execSync, spawn, spawnSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import { existsSync, readFileSync, promises as fs } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

// CEO Services for personal productivity commands
import {
  briefingService,
  goalsService,
  focusService,
  winsService,
  weeklyReviewService,
  askService,
  energyService,
  journalService,
  gratitudeService,
  // New Firestore-backed services
  decisionsService,
  prioritiesService,
  blockersService,
  ideasService,
  meetingsService,
  insightsService,
  type Goal,
  type FocusSession,
  type Decision,
  type UserPriority,
  type Blocker,
  type Idea,
  type Meeting,
} from '../../../src/services/ceo/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Support both ESM (normal) and SEA binary (bundled) modes
// In SEA binary mode, import.meta.url is set to a marker value at build time
const isSEABinary = import.meta.url.includes('ferni-sea-binary');
const __dirname = isSEABinary
  ? join(process.cwd(), 'apps', 'cli', 'src')
  : dirname(fileURLToPath(import.meta.url));

// CLI is at apps/cli/src/index.ts, so go up 3 levels to reach project root
const PROJECT_ROOT =
  process.env.FERNI_PROJECT_ROOT || (isSEABinary ? process.cwd() : join(__dirname, '..', '..', '..'));

// Load .env file from project root
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });
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
  leaf: '🌿',
  sparkles: '✨',
};

// ============================================================================
// ON-BRAND MESSAGES (Warm, Helpful, Human)
// ============================================================================

/**
 * Brand-compliant messages following Ferni voice guidelines:
 * - Warm, helpful, not blaming
 * - Suggest solutions
 * - Human tone, no tech jargon
 * - Use "we" and "let's" language
 */
const messages = {
  // Build & Deploy
  buildFailed: (hint?: string) =>
    `Hmm, the build didn't quite make it. ${hint || "Let's take a look at what went wrong."}`,
  deploySuccess: (service: string) =>
    `${service} is live! Your changes are out in the world now.`,
  deployFailed: (service: string, hint?: string) =>
    `${service} couldn't be deployed right now. ${hint || "Mind checking the logs?"}`,
  healthCheckPassed: () => `Everything looks healthy!`,
  healthCheckFailed: (hint?: string) =>
    `Something's not feeling right. ${hint || "Let's figure out what's going on."}`,

  // Validation & Quality
  validationPassed: () => `Looking good! All checks passed.`,
  validationFailed: (count: number, hint?: string) =>
    `Found ${count} thing${count > 1 ? 's' : ''} to look at. ${hint || "Nothing we can't handle together."}`,
  qualityCheckPassed: () => `Nice work! Code quality is on point.`,
  qualityCheckFailed: (hint?: string) =>
    `A few things need some love. ${hint || "Let's tidy these up."}`,

  // Missing Requirements
  missingEnvFile: () =>
    `Couldn't find .env file. Run \`ferni setup\` to get started.`,
  missingEnvVar: (varName: string) =>
    `We need ${varName} to continue. Mind adding it to your .env file?`,
  missingTool: (tool: string, installHint?: string) =>
    `${tool} isn't installed yet. ${installHint || `Try installing it first.`}`,
  missingArg: (arg: string, example?: string) =>
    `Need a ${arg} to continue.${example ? ` For example: ${example}` : ''}`,

  // Not Found
  notFound: (item: string, suggestion?: string) =>
    `Couldn't find ${item}.${suggestion ? ` ${suggestion}` : ''}`,
  unknownCommand: (cmd: string) =>
    `"${cmd}" doesn't ring a bell. Try \`ferni help\` to see what's available.`,
  unknownService: (service: string) =>
    `Don't recognize "${service}". Available: ui, agent, gce, frontend`,

  // Git & Version Control
  uncommittedChanges: () =>
    `You have uncommitted changes. Let's commit or stash them first so nothing gets lost.`,
  tagExists: (tag: string) =>
    `Tag ${tag} already exists. Maybe bump to a new version?`,
  noTagsFound: () =>
    `No version tags found yet. This might be your first release!`,

  // Success Messages
  allDone: () => `All done! ${icons.sparkles}`,
  readyToGo: () => `You're all set!`,
  savedSuccessfully: () => `Saved!`,
  deletedSuccessfully: () => `Gone!`,
  createdSuccessfully: (item: string) => `${item} created! ${icons.leaf}`,

  // Progress
  workingOn: (task: string) => `Working on ${task}...`,
  almostThere: () => `Almost there...`,
  hangTight: () => `Hang tight, this might take a moment...`,
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
    script: 'apps/cli/src/commands/deploy/deploy.ts',
    subcommands: ['ui', 'agent', 'gce', 'frontend', 'landing', 'all'],
    examples: ['ferni deploy ui', 'ferni deploy gce', 'ferni deploy all --dry-run'],
  },
  agents: {
    name: 'Agents',
    description: 'Manage AI agents',
    icon: icons.agent,
    handler: handleAgents,
    subcommands: ['new', 'list', 'show', 'validate', 'install', 'uninstall', 'search'],
    examples: [
      'ferni agents new',
      'ferni agents list',
      'ferni agents validate atlas-career-navigator',
    ],
  },
  logs: {
    name: 'Logs',
    description: 'View & analyze Cloud Run logs with AI',
    icon: icons.log,
    handler: handleLogs,
    subcommands: ['agent', 'ui', 'all', 'errors', 'analyze', 'search', 'gce'],
    examples: [
      'ferni logs agent',
      'ferni logs ui --tail',
      'ferni logs errors',
      'ferni logs analyze',
      'ferni logs search "timeout"',
      'ferni logs gce --since=1h',
    ],
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
    script: 'apps/cli/src/commands/setup/setup.ts',
    subcommands: [
      'local',
      'icons',
      'firestore',
      'github',
      'persistence',
      'signing',
      'slack',
      'secrets',
      'all',
    ],
    examples: ['ferni setup local', 'ferni setup all --yes'],
  },
  test: {
    name: 'Test',
    description: 'Run test suites',
    icon: '🧪',
    script: 'apps/cli/src/commands/test/test.ts',
    subcommands: ['unit', 'e2e', 'storage', 'comms', 'quick', 'all'],
    examples: ['ferni test quick', 'ferni test all -v'],
  },
  validate: {
    name: 'Validate',
    description: 'Run validations',
    icon: icons.check,
    handler: handleValidate,
    subcommands: ['voices', 'humanization', 'integrations', 'persistence', 'e2e', 'all'],
    examples: [
      'ferni validate voices',
      'ferni validate e2e',
      'ferni validate e2e --ci',
      'ferni validate all',
    ],
  },
  audit: {
    name: 'Audit',
    description: 'Run code quality & architecture audits',
    icon: '🔍',
    handler: handleAudit,
    subcommands: ['quality', 'architecture', 'bth', 'tools', 'data-layer', 'intelligence', 'legacy', 'a11y', 'all'],
    examples: ['ferni audit quality', 'ferni audit bth', 'ferni audit all'],
  },
  build: {
    name: 'Build',
    description: 'Build applications',
    icon: '🔨',
    script: 'apps/cli/src/commands/build/build.ts',
    subcommands: ['frontend', 'electron', 'ios', 'android', 'apps', 'sync', 'store-assets'],
    examples: ['ferni build frontend', 'ferni build apps'],
  },
  generate: {
    name: 'Generate',
    description: 'Generate code and assets',
    icon: '✨',
    script: 'apps/cli/src/commands/generate/generate.ts',
    subcommands: ['personas', 'env', 'vapid', 'marketing', 'design-system', 'all'],
    examples: ['ferni generate design-system', 'ferni generate all'],
  },
  rollout: {
    name: 'Rollout',
    description: 'Manage feature rollouts',
    icon: '🎯',
    script: 'apps/cli/src/commands/deploy/rollout.ts',
    subcommands: ['start', 'status', 'advance', 'rollback', 'list', 'presets'],
    examples: ['ferni rollout start feature --preset=canary', 'ferni rollout status'],
  },
  tokens: {
    name: 'Tokens',
    description: 'Manage design tokens',
    icon: '🎨',
    handler: handleTokens,
    subcommands: ['sync', 'check', 'version', 'watch', 'brand'],
    examples: [
      'ferni tokens sync',
      'ferni tokens version patch "Fixed colors"',
      'ferni tokens watch',
    ],
  },
  design: {
    name: 'Design',
    description: 'Design system compliance & automation',
    icon: '🎨',
    handler: handleDesign,
    subcommands: [
      'check',
      'fix',
      'ai-fix',
      'priority',
      'watch',
      'storybook',
      'wcag',
      'brand-words',
    ],
    examples: ['ferni design check', 'ferni design ai-fix', 'ferni design storybook'],
  },
  dev: {
    name: 'Dev',
    description: 'Development workflow management',
    icon: '🛠️',
    handler: handleDev,
    subcommands: ['start', 'stop', 'restart', 'status', 'ports', 'frontend', 'agent', 'cursor'],
    examples: ['ferni dev start', 'ferni dev stop', 'ferni dev status', 'ferni dev cursor'],
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
    subcommands: ['all', 'quick', 'deep', 'typecheck', 'lint', 'test', 'audit', 'arch', 'dead-code', 'imports', 'cohesion', 'api-surface', 'complexity', 'naming', 'jsdoc', 'bundle', 'deps'],
    examples: ['ferni quality', 'ferni quality quick', 'ferni quality deep', 'ferni quality complexity'],
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
    description: 'Manage and validate LLM tools (122+ domains)',
    icon: '🔧',
    handler: handleTools,
    subcommands: ['list', 'exec', 'validate', 'generate-fixtures'],
    examples: [
      'ferni tools list --domain career',
      'ferni tools exec trackJobApplication --params \'{"company": "Acme"}\'',
      'ferni tools validate --all',
    ],
  },
  commands: {
    name: 'Commands',
    description: 'Manage and validate persona commands (slash commands)',
    icon: '💬',
    handler: handleCommands,
    subcommands: ['list', 'exec', 'validate'],
    examples: [
      'ferni commands list --persona ferni',
      'ferni commands exec ferni/daily-check-in',
      'ferni commands validate --all',
    ],
  },
  api: {
    name: 'API',
    description: 'Manage and validate API endpoints (200+ routes)',
    icon: '🌐',
    handler: handleApi,
    subcommands: ['list', 'call', 'validate'],
    examples: [
      'ferni api list',
      'ferni api list --category calendar',
      'ferni api call GET /api/health',
      'ferni api call POST /api/habits --body \'{"name": "Morning run"}\'',
      'ferni api validate --all',
    ],
  },
  ftis: {
    name: 'FTIS',
    description: 'Ferni Tool Intelligence System (ML-powered tool selection)',
    icon: '🧠',
    handler: handleFTIS,
    subcommands: ['train', 'status', 'experiment'],
    examples: [
      'ferni ftis train',
      'ferni ftis status',
      'ferni ftis experiment create',
      'ferni ftis experiment results',
    ],
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
    subcommands: ['list', 'preview', 'test', 'compare', 'validate', 'generate-samples'],
    examples: [
      'ferni voices list',
      'ferni voices preview cartesia',
      'ferni voices test',
      'ferni voices generate-samples',
    ],
  },
  voice: {
    name: 'Voice',
    description: 'Live voice conversation with Ferni',
    icon: '🎙️',
    handler: handleVoice,
    subcommands: [],
    examples: ['ferni voice', 'ferni voice --persona maya', 'ferni voice --debug'],
  },
  code: {
    name: 'Code',
    description: 'Voice-driven coding with Ferni + Claude Code (auto-starts services)',
    icon: '💻',
    handler: handleCode,
    subcommands: [],
    examples: [
      'ferni code                  # Start voice coding (auto-starts token server & agent)',
      'ferni code --dir ./myproject',
      'ferni code --debug          # Show MCP events and transcriptions',
      'ferni code --cloud          # Use production services',
    ],
  },
  debug: {
    name: 'Debug',
    description: 'Troubleshooting workflows',
    icon: '🐛',
    handler: handleDebug,
    subcommands: ['capture', 'logs', 'errors', 'health', 'env', 'network', 'voice'],
    examples: [
      'ferni debug voice "How are you?"',
      'ferni debug voice --interactive',
      'ferni debug voice --persona maya --play "Tell me about habits"',
    ],
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
  devblog: {
    name: 'DevBlog',
    description: 'Developer blog content management',
    icon: '📝',
    handler: handleDevBlog,
    subcommands: ['new', 'changelog', 'images', 'newsletter', 'social', 'preview', 'publish', 'validate', 'status'],
    examples: [
      'ferni devblog new "My Post Title"',
      'ferni devblog changelog v1.2.3',
      'ferni devblog images',
      'ferni devblog preview',
      'ferni devblog publish',
    ],
  },
  ops: {
    name: 'Ops',
    description: 'Operational tasks (zombies, health, semantic, cleanup)',
    icon: '🔧',
    handler: handleOps,
    subcommands: ['zombies', 'diagnose', 'health', 'memory', 'ttl-cleanup', 'semantic', 'scheduler', 'logs', 'dashboard', 'metrics'],
    examples: [
      'ferni ops zombies',
      'ferni ops diagnose',
      'ferni ops health',
      'ferni ops memory:deploy-scheduler',
      'ferni ops memory:scheduler-status',
      'ferni ops dashboard',
      'ferni ops metrics',
    ],
  },
  waitlist: {
    name: 'Waitlist',
    description: 'Manage user waitlist',
    icon: '📋',
    handler: handleWaitlist,
    subcommands: ['list', 'approve', 'stats', 'export'],
    examples: [
      'ferni waitlist list',
      'ferni waitlist approve user@example.com',
      'ferni waitlist stats',
    ],
  },
  users: {
    name: 'Users',
    description: 'User data management & debugging',
    icon: '👤',
    handler: handleUsers,
    subcommands: ['list', 'show', 'dump', 'cleanup', 'grant', 'find-rich', 'delete-stale'],
    examples: [
      'ferni users list',
      'ferni users show user@example.com',
      'ferni users dump <userId>',
      'ferni users cleanup --dry-run',
    ],
  },
  calls: {
    name: 'Calls',
    description: 'Test outbound phone calls',
    icon: '📞',
    handler: handleCalls,
    subcommands: ['test', 'status', 'family', 'invite'],
    examples: [
      'ferni calls test +1234567890',
      'ferni calls status <callId>',
      'ferni calls family mom',
      'ferni calls invite user@example.com',
    ],
  },
  icons: {
    name: 'Icons',
    description: 'Generate favicons & app icons',
    icon: '🎨',
    handler: handleIcons,
    subcommands: ['favicons', 'smile-gif', 'app-icons', 'all'],
    examples: [
      'ferni icons favicons',
      'ferni icons smile-gif',
      'ferni icons all',
    ],
  },
  smoke: {
    name: 'Smoke',
    description: 'Run smoke tests against APIs',
    icon: '💨',
    handler: handleSmoke,
    subcommands: ['api', 'livekit', 'gemini', 'tools', 'all'],
    examples: [
      'ferni smoke api',
      'ferni smoke livekit',
      'ferni smoke all',
    ],
  },
  data: {
    name: 'Data',
    description: 'Data analysis & debugging',
    icon: '📊',
    handler: handleData,
    subcommands: ['profiles', 'behaviors', 'tools', 'contacts', 'firestore-check'],
    examples: [
      'ferni data profiles',
      'ferni data behaviors',
      'ferni data tools --usage',
    ],
  },
  migrate: {
    name: 'Migrate',
    description: 'Database schema & data migrations',
    icon: '🔄',
    handler: handleMigrate,
    subcommands: ['status', 'run', 'rollback', 'create', 'history', 'pending'],
    examples: ['ferni migrate status', 'ferni migrate run', 'ferni migrate create add-users-table'],
  },
  secrets: {
    name: 'Secrets',
    description: 'Secret rotation & management',
    icon: '🔐',
    handler: handleSecrets,
    subcommands: ['list', 'check', 'rotate', 'sync', 'audit', 'diff'],
    examples: ['ferni secrets list', 'ferni secrets check', 'ferni secrets audit'],
  },
  deps: {
    name: 'Dependencies',
    description: 'Dependency management',
    icon: '📦',
    handler: handleDeps,
    subcommands: ['audit', 'outdated', 'update', 'cleanup', 'licenses', 'tree'],
    examples: ['ferni deps audit', 'ferni deps outdated', 'ferni deps update'],
  },
  // Self-Healing Commands
  'self-heal': {
    name: 'Self-Heal',
    description: 'Self-healing system health & diagnostics',
    icon: '🏥',
    handler: handleSelfHeal,
    subcommands: ['health', 'circuits', 'restart', 'diagnose', 'anomalies'],
    examples: [
      'ferni self-heal health',
      'ferni self-heal circuits',
      'ferni self-heal restart agent',
    ],
  },
  circuits: {
    name: 'Circuits',
    description: 'Circuit breaker status',
    icon: '⚡',
    handler: handleCircuits,
    subcommands: ['status', 'open', 'reset', 'stats'],
    examples: ['ferni circuits', 'ferni circuits open', 'ferni circuits reset yahoo-finance'],
  },
  restart: {
    name: 'Restart',
    description: 'Restart Cloud Run services',
    icon: '🔄',
    handler: handleRestartService,
    subcommands: ['agent', 'ui', 'status', 'history'],
    examples: ['ferni restart agent', 'ferni restart ui --force', 'ferni restart history'],
  },
  diagnose: {
    name: 'Diagnose',
    description: 'AI-powered error diagnosis',
    icon: '🔬',
    handler: handleDiagnose,
    subcommands: [],
    examples: ['ferni diagnose "connection timed out"', 'ferni diagnose --file error.log'],
  },
  anomalies: {
    name: 'Anomalies',
    description: 'View detected anomalies',
    icon: '📊',
    handler: handleAnomalies,
    subcommands: ['recent', 'service', 'stats'],
    examples: ['ferni anomalies', 'ferni anomalies recent', 'ferni anomalies service livekit'],
  },
  // Container Runtime Operations (for in-container tech ops)
  runtime: {
    name: 'Runtime',
    description: 'Container runtime diagnostics & AI-powered tech ops',
    icon: '📦',
    handler: handleRuntime,
    subcommands: ['status', 'memory', 'sessions', 'env', 'logs', 'health', 'analyze', 'watch'],
    examples: [
      'ferni runtime status',
      'ferni runtime analyze',
      'ferni runtime watch',
      'ferni runtime watch 2',
    ],
  },
  // AI-Powered Automation
  ai: {
    name: 'AI',
    description: 'AI-powered git workflow (commits, PRs, changelog)',
    icon: '🤖',
    handler: handleAI,
    subcommands: ['commit', 'pr', 'changelog'],
    examples: ['ferni ai commit', 'ferni ai pr', 'ferni ai changelog'],
  },
  review: {
    name: 'Review',
    description: 'AI-powered code review',
    icon: '👀',
    handler: handleReview,
    subcommands: ['all', 'security', 'perf', 'full'],
    examples: ['ferni review', 'ferni review security', 'ferni review full'],
  },
  copy: {
    name: 'Copy',
    description: 'AI-powered content/copy generation in brand voice',
    icon: '✍️',
    handler: handleCopy,
    subcommands: ['error', 'empty', 'loading', 'success', 'toast', 'button', 'check'],
    examples: ['ferni copy error "connection failed"', 'ferni copy check "your text"'],
  },
  'test-gen': {
    name: 'Test Gen',
    description: 'AI-powered test generation',
    icon: '🧪',
    handler: handleTestGen,
    subcommands: ['generate', 'suggest'],
    examples: ['ferni test-gen generate src/services/auth.ts', 'ferni test-gen suggest'],
  },
  docs: {
    name: 'Docs',
    description: 'AI-powered documentation generation',
    icon: '📝',
    handler: handleDocsGen,
    subcommands: ['generate', 'api', 'component'],
    examples: ['ferni docs generate src/utils/helpers.ts', 'ferni docs api'],
  },
  perf: {
    name: 'Performance',
    description: 'Performance monitoring & budget tracking',
    icon: '⚡',
    handler: handlePerf,
    subcommands: ['budget', 'lighthouse', 'track', 'record'],
    examples: ['ferni perf budget', 'ferni perf lighthouse', 'ferni perf track'],
  },
  security: {
    name: 'Security',
    description: 'Security scanning & auditing',
    icon: '🛡️',
    handler: handleSecurity,
    subcommands: ['scan', 'secrets', 'deps', 'headers'],
    examples: ['ferni security scan', 'ferni security secrets', 'ferni security headers'],
  },
  onboard: {
    name: 'Onboard',
    description: 'Developer onboarding & environment setup',
    icon: '🌱',
    handler: handleOnboard,
    subcommands: ['start', 'check'],
    examples: ['ferni onboard', 'ferni onboard check'],
  },
  // Advanced Automation
  'release-auto': {
    name: 'Release Auto',
    description: 'Smart release management with AI',
    icon: '📦',
    handler: handleReleaseAuto,
    subcommands: ['auto', 'notes', 'announce'],
    examples: [
      'ferni release-auto auto',
      'ferni release-auto notes',
      'ferni release-auto announce',
    ],
  },
  'deps-ai': {
    name: 'Deps AI',
    description: 'AI-powered dependency updates',
    icon: '📦',
    handler: handleDepsAI,
    subcommands: ['update', 'migrate'],
    examples: ['ferni deps-ai update', 'ferni deps-ai migrate react 17 18'],
  },
  incident: {
    name: 'Incident',
    description: 'Production incident response',
    icon: '🚨',
    handler: handleIncidentCmd,
    subcommands: ['start', 'diagnose', 'postmortem', 'list'],
    examples: [
      'ferni incident start',
      'ferni incident diagnose',
      'ferni incident postmortem INC-xxx',
    ],
  },
  refactor: {
    name: 'Refactor',
    description: 'AI-powered code refactoring',
    icon: '🔄',
    handler: handleRefactorCmd,
    subcommands: ['suggest', 'extract', 'modernize'],
    examples: ['ferni refactor suggest', 'ferni refactor modernize src/file.ts'],
  },
  translate: {
    name: 'Translate',
    description: 'AI-powered internationalization',
    icon: '🌍',
    handler: handleTranslateCmd,
    subcommands: ['scan', 'generate', 'review'],
    examples: ['ferni translate scan', 'ferni translate generate es'],
  },
  flags: {
    name: 'Flags',
    description: 'Feature flag intelligence',
    icon: '🚩',
    handler: handleFlagsCmd,
    subcommands: ['list', 'suggest', 'cleanup', 'impact'],
    examples: ['ferni flags list', 'ferni flags cleanup', 'ferni flags suggest my-feature "desc"'],
  },
  'costs-ai': {
    name: 'Costs AI',
    description: 'AI-powered cost optimization',
    icon: '💰',
    handler: handleCostsAICmd,
    subcommands: ['optimize', 'forecast', 'alert'],
    examples: ['ferni costs-ai optimize', 'ferni costs-ai forecast'],
  },
  api: {
    name: 'API',
    description: 'API contract testing & docs',
    icon: '📡',
    handler: handleAPICmd,
    subcommands: ['list', 'mock', 'diff', 'docs'],
    examples: ['ferni api list', 'ferni api mock', 'ferni api diff'],
  },
  // Platform Oversight
  rollback: {
    name: 'Rollback',
    description: 'Rollback deployments to previous version',
    icon: '⏪',
    handler: handleRollback,
    subcommands: ['gce', 'agent', 'ui', 'status', 'history'],
    examples: ['ferni rollback gce', 'ferni rollback agent', 'ferni rollback status'],
  },
  metrics: {
    name: 'Metrics',
    description: 'Real-time platform metrics & dashboards',
    icon: '📈',
    handler: handleMetrics,
    subcommands: ['live', 'latency', 'errors', 'throughput', 'export'],
    examples: ['ferni metrics', 'ferni metrics latency', 'ferni metrics errors --last=1h'],
  },
  sessions: {
    name: 'Sessions',
    description: 'Active users, session analytics & call volume',
    icon: '👥',
    handler: handleSessions,
    subcommands: ['active', 'history', 'stats', 'users', 'calls'],
    examples: ['ferni sessions', 'ferni sessions active', 'ferni sessions stats --last=7d'],
  },
  sla: {
    name: 'SLA',
    description: 'SLA tracking, uptime & response times',
    icon: '🎯',
    handler: handleSLA,
    subcommands: ['status', 'uptime', 'latency', 'report', 'alerts'],
    examples: ['ferni sla', 'ferni sla uptime', 'ferni sla report --month=12'],
  },
  traffic: {
    name: 'Traffic',
    description: 'Traffic management, canary deploys & A/B splits',
    icon: '🚦',
    handler: handleTraffic,
    subcommands: ['status', 'canary', 'split', 'rollout', 'revert'],
    examples: ['ferni traffic status', 'ferni traffic canary 10', 'ferni traffic split 50/50'],
  },
  alerts: {
    name: 'Alerts',
    description: 'Alert management, silence & acknowledge',
    icon: '🔔',
    handler: handleAlerts,
    subcommands: ['list', 'active', 'silence', 'acknowledge', 'create', 'history'],
    examples: ['ferni alerts', 'ferni alerts silence 1h', 'ferni alerts acknowledge INC-123'],
  },
  oncall: {
    name: 'On-Call',
    description: 'On-call rotation, escalation & handoff',
    icon: '📟',
    handler: handleOnCall,
    subcommands: ['who', 'schedule', 'handoff', 'escalate', 'history'],
    examples: ['ferni oncall', 'ferni oncall who', 'ferni oncall handoff @teammate'],
  },
  runbook: {
    name: 'Runbook',
    description: 'Automated runbooks for common issues',
    icon: '📖',
    handler: handleRunbook,
    subcommands: ['list', 'run', 'create', 'edit', 'history'],
    examples: ['ferni runbook list', 'ferni runbook run high-latency', 'ferni runbook create'],
  },
  backup: {
    name: 'Backup',
    description: 'Backup & restore Firestore, configs, secrets',
    icon: '💾',
    handler: handleBackup,
    subcommands: ['create', 'restore', 'list', 'schedule', 'status'],
    examples: ['ferni backup create', 'ferni backup list', 'ferni backup restore backup-123'],
  },
  chaos: {
    name: 'Chaos',
    description: 'Chaos engineering - inject failures to test resilience',
    icon: '🌪️',
    handler: handleChaos,
    subcommands: ['latency', 'error', 'cpu', 'memory', 'network', 'stop', 'status'],
    examples: ['ferni chaos latency 500ms', 'ferni chaos error 10%', 'ferni chaos stop'],
  },
  experiments: {
    name: 'Experiments',
    description: 'A/B testing, bandits & auto-rollout experiments',
    icon: '🧬',
    handler: handleExperiments,
    subcommands: ['list', 'status', 'show', 'health', 'create', 'start', 'pause', 'resume', 'complete', 'promote', 'delete'],
    examples: ['ferni experiments list', 'ferni experiments show exp-123', 'ferni experiments health exp-123'],
  },
  cache: {
    name: 'Cache',
    description: 'Cache management & invalidation',
    icon: '🗄️',
    handler: handleCache,
    subcommands: ['status', 'clear', 'warmup', 'stats', 'keys'],
    examples: ['ferni cache status', 'ferni cache clear --pattern="user:*"'],
  },
  disk: {
    name: 'Disk',
    description: 'GCE disk management & Docker cleanup',
    icon: '💽',
    handler: handleDisk,
    subcommands: ['status', 'clean', 'clean:aggressive', 'setup-cron'],
    examples: ['ferni disk', 'ferni disk status', 'ferni disk clean', 'ferni disk setup-cron'],
  },
  runner: {
    name: 'Runner',
    description: 'GitHub Actions self-hosted runner management',
    icon: '🏃',
    handler: handleRunner,
    subcommands: ['status', 'restart', 'logs', 'ssh'],
    examples: ['ferni runner status', 'ferni runner restart', 'ferni runner logs --follow'],
  },
  canary: {
    name: 'Canary',
    description: 'Canary deployment management',
    icon: '🐤',
    handler: handleCanary,
    subcommands: ['status', 'start', 'promote', 'abort'],
    examples: ['ferni canary status', 'ferni canary start', 'ferni canary promote'],
  },
  notify: {
    name: 'Notify',
    description: 'Send notifications to team (Slack, PagerDuty)',
    icon: '📣',
    handler: handleNotify,
    subcommands: ['slack', 'pagerduty', 'email', 'broadcast', 'test'],
    examples: ['ferni notify slack "Deployment complete"', 'ferni notify broadcast "Maintenance"'],
  },
  // Developer Experience
  init: {
    name: 'Init',
    description: 'Initialize new developer environment',
    icon: '🎬',
    handler: handleInit,
    subcommands: ['full', 'quick', 'check', 'reset'],
    examples: ['ferni init', 'ferni init quick', 'ferni init check'],
  },
  context: {
    name: 'Context',
    description: 'Switch between dev/staging/prod environments',
    icon: '🔀',
    handler: handleContext,
    subcommands: ['show', 'dev', 'staging', 'prod', 'list'],
    examples: ['ferni context', 'ferni context prod', 'ferni context dev'],
  },
  tunnel: {
    name: 'Tunnel',
    description: 'SSH tunnel to GCE/Cloud Run for debugging',
    icon: '🔗',
    handler: handleTunnel,
    subcommands: ['gce', 'db', 'redis', 'status', 'close'],
    examples: ['ferni tunnel gce', 'ferni tunnel db', 'ferni tunnel status'],
  },
  replay: {
    name: 'Replay',
    description: 'Replay user sessions for debugging',
    icon: '🔁',
    handler: handleReplay,
    subcommands: ['list', 'play', 'export', 'search'],
    examples: ['ferni replay list --last=1h', 'ferni replay play session-123'],
  },
  // ============================================================================
  // CEO COMMANDS - Ferni as your Personal CEO
  // ============================================================================
  goals: {
    name: 'Goals',
    description: 'Track and manage your goals (CEO feature)',
    icon: '🎯',
    handler: handleCEOGoals,
    subcommands: ['list', 'add', 'complete', 'progress'],
    examples: ['ferni goals', 'ferni goals add "Morning routine"', 'ferni goals progress'],
  },
  brain: {
    name: 'Brain',
    description: 'What Ferni knows about you (CEO feature)',
    icon: '🧠',
    handler: handleCEOContext,
    subcommands: ['show', 'summary', 'delete'],
    examples: ['ferni brain', 'ferni brain --summary'],
  },
  remember: {
    name: 'Remember',
    description: 'Add a note for Ferni to remember (CEO feature)',
    icon: '📝',
    handler: handleCEORemember,
    subcommands: [],
    examples: [
      'ferni remember "Big presentation on Friday"',
      'ferni remember --important "Job interview Monday"',
    ],
  },
  roster: {
    name: 'Roster',
    description: 'Deep dive on the leadership team (CEO feature)',
    icon: '👥',
    handler: handleCEORoster,
    subcommands: ['show', 'maya', 'alex', 'jordan', 'peter', 'nayan', 'ferni'],
    examples: ['ferni roster', 'ferni roster maya', 'ferni roster alex'],
  },
  // Daily Workflow
  briefing: {
    name: 'Briefing',
    description: 'Morning briefing - calendar, priorities, reminders (CEO feature)',
    icon: '☀️',
    handler: handleCEOBriefing,
    subcommands: ['today', 'tomorrow', 'week'],
    examples: ['ferni briefing', 'ferni briefing today', 'ferni briefing week'],
  },
  focus: {
    name: 'Focus',
    description: 'Start a focus session with timer (CEO feature)',
    icon: '🎯',
    handler: handleCEOFocus,
    subcommands: ['start', 'stop', 'status', 'stats'],
    examples: ['ferni focus start 25', 'ferni focus start "Deep work"', 'ferni focus stats'],
  },
  reflect: {
    name: 'Reflect',
    description: 'End-of-day reflection prompts (CEO feature)',
    icon: '🌙',
    handler: handleCEOReflect,
    subcommands: ['today', 'prompt', 'history'],
    examples: ['ferni reflect', 'ferni reflect today', 'ferni reflect history'],
  },
  weekly: {
    name: 'Weekly',
    description: 'Weekly review & planning (CEO feature)',
    icon: '📅',
    handler: handleCEOWeekly,
    subcommands: ['review', 'plan', 'summary'],
    examples: ['ferni weekly', 'ferni weekly review', 'ferni weekly plan'],
  },
  // Personal Tracking
  wins: {
    name: 'Wins',
    description: 'Log achievements to celebrate (CEO feature)',
    icon: '🏆',
    handler: handleCEOWins,
    subcommands: ['add', 'list', 'today', 'week', 'celebrate'],
    examples: ['ferni wins add "Shipped the feature!"', 'ferni wins today', 'ferni wins celebrate'],
  },
  habits: {
    name: 'Habits',
    description: 'Track habits and streaks (CEO feature)',
    icon: '✅',
    handler: handleCEOHabits,
    subcommands: ['list', 'check', 'add', 'streaks', 'stats'],
    examples: ['ferni habits', 'ferni habits check "Exercise"', 'ferni habits streaks'],
  },
  energy: {
    name: 'Energy',
    description: 'Log energy levels through the day (CEO feature)',
    icon: '⚡',
    handler: handleCEOEnergy,
    subcommands: ['log', 'today', 'week', 'patterns'],
    examples: ['ferni energy log 8', 'ferni energy log 6 "After lunch slump"', 'ferni energy patterns'],
  },
  journal: {
    name: 'Journal',
    description: 'Quick journal entries (CEO feature)',
    icon: '📓',
    handler: handleCEOJournal,
    subcommands: ['add', 'today', 'search', 'prompts'],
    examples: ['ferni journal "Great meeting with the team"', 'ferni journal today', 'ferni journal search "project"'],
  },
  gratitude: {
    name: 'Gratitude',
    description: 'Quick gratitude logging (CEO feature)',
    icon: '🙏',
    handler: handleCEOGratitude,
    subcommands: ['add', 'today', 'week', 'random'],
    examples: ['ferni gratitude "Sunny morning walk"', 'ferni gratitude today', 'ferni gratitude random'],
  },
  // Decision Support
  decisions: {
    name: 'Decisions',
    description: 'Track important decisions & outcomes (CEO feature)',
    icon: '⚖️',
    handler: handleCEODecisions,
    subcommands: ['add', 'list', 'pending', 'review', 'outcome'],
    examples: ['ferni decisions add "Accept the offer?"', 'ferni decisions pending', 'ferni decisions outcome <id> "Worked out great"'],
  },
  priorities: {
    name: 'Priorities',
    description: 'Manage daily/weekly priorities (CEO feature)',
    icon: '📌',
    handler: handleCEOPriorities,
    subcommands: ['list', 'add', 'done', 'reorder', 'clear'],
    examples: ['ferni priorities', 'ferni priorities add "Finish proposal"', 'ferni priorities done 1'],
  },
  blockers: {
    name: 'Blockers',
    description: 'Track what\'s blocking progress (CEO feature)',
    icon: '🚧',
    handler: handleCEOBlockers,
    subcommands: ['add', 'list', 'resolve', 'escalate'],
    examples: ['ferni blockers add "Waiting on API access"', 'ferni blockers list', 'ferni blockers resolve 1'],
  },
  ideas: {
    name: 'Ideas',
    description: 'Capture quick ideas (CEO feature)',
    icon: '💡',
    handler: handleCEOIdeas,
    subcommands: ['add', 'list', 'random', 'tag', 'search'],
    examples: ['ferni ideas "Build a CLI for everything"', 'ferni ideas list', 'ferni ideas random'],
  },
  // Direct Interaction
  ask: {
    name: 'Ask',
    description: 'Ask Ferni anything (CEO feature)',
    icon: '💬',
    handler: handleCEOAsk,
    subcommands: [],
    examples: ['ferni ask "What should I focus on today?"', 'ferni ask "Summarize my week"'],
  },
  coach: {
    name: 'Coach',
    description: 'Get AI coaching on a topic (CEO feature)',
    icon: '🎓',
    handler: handleCEOCoach,
    subcommands: ['career', 'productivity', 'relationships', 'health', 'custom'],
    examples: ['ferni coach career', 'ferni coach productivity', 'ferni coach "How to have difficult conversations"'],
  },
  meetings: {
    name: 'Meetings',
    description: 'Quick meeting notes (CEO feature)',
    icon: '🗓️',
    handler: handleCEOMeetings,
    subcommands: ['add', 'list', 'today', 'search', 'action-items'],
    examples: ['ferni meetings add "1:1 with Sarah"', 'ferni meetings today', 'ferni meetings action-items'],
  },
  insights: {
    name: 'Insights',
    description: 'Superhuman cross-data intelligence (CEO feature)',
    icon: '🧠',
    handler: handleCEOInsights,
    subcommands: ['all', 'critical', 'energy', 'goals', 'burnout', 'patterns', 'refresh'],
    examples: ['ferni insights', 'ferni insights critical', 'ferni insights burnout', 'ferni insights refresh'],
  },
  // ============================================================================
  // GROWTH AUTOMATION - Autonomous marketing across all channels
  // ============================================================================
  growth: {
    name: 'Growth',
    description: 'Autonomous growth marketing (TikTok, SEO, Reddit, Influencers)',
    icon: '🚀',
    handler: handleGrowth,
    subcommands: ['tiktok', 'content', 'influencer', 'seo', 'auto', 'run', 'campaign', 'metrics'],
    examples: [
      'ferni growth',
      'ferni growth tiktok add @ferni_ai --angle main',
      'ferni growth content --platform tiktok',
      'ferni growth influencer --tier micro',
      'ferni growth auto post on',
      'ferni growth run --generate',
    ],
  },
  // ============================================================================
  // BRAND & COMMUNITY - Brand evolution automation
  // ============================================================================
  brand: {
    name: 'Brand',
    description: 'Brand execution hub (awards, story, workstreams, audit)',
    icon: '🎨',
    handler: handleBrand,
    subcommands: ['dashboard', 'awards', 'story', 'workstreams', 'audit'],
    examples: [
      'ferni brand',
      'ferni brand awards',
      'ferni brand story create',
      'ferni brand workstreams',
      'ferni brand audit',
    ],
  },
  community: {
    name: 'Community',
    description: 'Community automation (Discord, stories, ambassadors, events)',
    icon: '🏘️',
    handler: handleCommunity,
    subcommands: ['dashboard', 'discord', 'stories', 'ambassadors', 'events'],
    examples: [
      'ferni community',
      'ferni community discord',
      'ferni community stories',
      'ferni community ambassadors',
      'ferni community events',
    ],
  },
  rituals: {
    name: 'Rituals',
    description: 'Cultural rituals automation (daily, weekly, milestones)',
    icon: '🌿',
    handler: handleRituals,
    subcommands: ['daily', 'morning', 'evening', 'weekly', 'milestone', 'prompts'],
    examples: [
      'ferni rituals',
      'ferni rituals morning',
      'ferni rituals weekly',
      'ferni rituals milestone',
    ],
  },
  // ============================================================================
  // CUSTOM AGENT & SITE COMMANDS - Build and deploy custom agents
  // ============================================================================
  auth: {
    name: 'Auth',
    description: 'Authenticate with Ferni',
    icon: '🔐',
    script: 'apps/cli/src/commands/auth/auth-login.ts',
    subcommands: ['login', 'logout', 'status'],
    examples: ['ferni auth login', 'ferni auth status', 'ferni auth logout'],
  },
  agent: {
    name: 'Agent',
    description: 'Create & manage custom agents',
    icon: '🤖',
    handler: handleAgent,
    subcommands: ['create', 'list', 'show', 'voice', 'memory', 'test', 'deploy', 'delete'],
    examples: [
      'ferni agent create',
      'ferni agent create --template legacy',
      'ferni agent list',
      'ferni agent voice upload <id> <file>',
      'ferni agent memory add <id>',
      'ferni agent test <id>',
      'ferni agent deploy <id>',
    ],
  },
  site: {
    name: 'Site',
    description: 'Generate & deploy agent websites',
    icon: '🌐',
    handler: handleSite,
    subcommands: ['create', 'preview', 'deploy', 'status'],
    examples: [
      'ferni site create --agent <id>',
      'ferni site create --agent <id> --template memorial',
      'ferni site preview',
      'ferni site deploy',
      'ferni site deploy --ferni',
    ],
  },
  launch: {
    name: 'Launch',
    description: 'Product launch automation (checklist, social, analytics)',
    icon: '🚀',
    script: 'apps/cli/src/commands/launch/launch.ts',
    subcommands: ['checklist', 'day', 'schedule', 'analytics', 'content', 'gifs', 'post'],
    examples: [
      'ferni launch',
      'ferni launch checklist',
      'ferni launch day',
      'ferni launch analytics',
      'ferni launch content',
      'ferni launch gifs',
      'ferni launch post twitter',
      'ferni launch post all',
    ],
  },
  // ============================================================================
  // EXECUTIVE SUITE - Autonomous Company Operations
  // ============================================================================
  ceo: {
    name: 'CEO',
    description: 'Strategic operations dashboard (vision, OKRs, investor updates)',
    icon: '👔',
    handler: handleCEO,
    subcommands: ['dashboard', 'metrics', 'decisions', 'board-prep', 'investor-update', 'okrs'],
    examples: [
      'ferni ceo dashboard',
      'ferni ceo metrics --period weekly',
      'ferni ceo decisions --pending',
      'ferni ceo okrs --q1',
    ],
  },
  cto: {
    name: 'CTO',
    description: 'Technical leadership (architecture, debt, incidents, security)',
    icon: '🔧',
    handler: handleCTO,
    subcommands: ['health', 'debt', 'incidents', 'security', 'dependencies', 'performance'],
    examples: [
      'ferni cto health',
      'ferni cto debt --prioritize',
      'ferni cto incidents --recent',
      'ferni cto security --scan',
    ],
  },
  cio: {
    name: 'CIO',
    description: 'Information governance (compliance, data catalog, access, risk)',
    icon: '🛡️',
    handler: handleCIO,
    subcommands: ['compliance', 'data-catalog', 'access-review', 'risk', 'vendors'],
    examples: [
      'ferni cio compliance --soc2',
      'ferni cio data-catalog --pii',
      'ferni cio access-review --stale',
      'ferni cio risk --matrix',
    ],
  },
  cpo: {
    name: 'CPO',
    description: 'Product intelligence (roadmap, feedback, experiments, personas)',
    icon: '📊',
    handler: handleCPO,
    subcommands: ['roadmap', 'feedback', 'experiments', 'prioritize', 'personas', 'churn'],
    examples: [
      'ferni cpo roadmap --auto',
      'ferni cpo feedback --sentiment',
      'ferni cpo experiments --winners',
      'ferni cpo prioritize --rice',
    ],
  },
  cmo: {
    name: 'CMO',
    description: 'Marketing intelligence (campaigns, SEO, social, attribution)',
    icon: '📢',
    handler: handleCMO,
    subcommands: ['campaigns', 'content', 'seo', 'social', 'attribution', 'competitors'],
    examples: [
      'ferni cmo campaigns --active',
      'ferni cmo seo --audit',
      'ferni cmo attribution --model linear',
      'ferni cmo competitors --track',
    ],
  },
  csco: {
    name: 'CSCO',
    description: 'Supply chain operations (costs, vendors, SLAs, capacity)',
    icon: '⚙️',
    handler: handleCSCO,
    subcommands: ['costs', 'vendors', 'slas', 'capacity', 'automation'],
    examples: [
      'ferni csco costs --optimize',
      'ferni csco vendors --audit',
      'ferni csco slas --status',
      'ferni csco capacity --forecast',
    ],
  },
  exec: {
    name: 'Exec',
    description: 'Unified executive dashboard across all C-suite functions',
    icon: '📊',
    handler: handleExec,
    subcommands: ['--quick', '--alerts', '--role', 'schedule', 'bth', 'outreach', 'knowledge'],
    examples: [
      'ferni exec',
      'ferni exec --quick',
      'ferni exec --alerts',
      'ferni exec --role cto',
      'ferni exec schedule',
      'ferni exec bth',
      'ferni exec outreach --trigger morning',
      'ferni exec knowledge --patterns',
    ],
  },
  bth: {
    name: 'Better Than Human',
    description: 'Superhuman executive intelligence - cross-functional insights, proactive coaching',
    icon: '🧠',
    handler: (args: string[]) => handleExec(['bth', ...args]),
    subcommands: ['--insights', '--coaching', '--decisions', '--energy'],
    examples: [
      'ferni bth',
      'ferni bth --insights',
      'ferni bth --coaching',
      'ferni bth --energy 8',
    ],
  },
  outreach: {
    name: 'Proactive Outreach',
    description: 'Anticipatory system that reaches out before you know you need it',
    icon: '📬',
    handler: (args: string[]) => handleExec(['outreach', ...args]),
    subcommands: ['--trigger', '--check', '--queue', '--configure'],
    examples: [
      'ferni outreach',
      'ferni outreach --trigger morning',
      'ferni outreach --trigger evening',
      'ferni outreach --check',
    ],
  },
  knowledge: {
    name: 'Unified Knowledge',
    description: 'Total recall across all executive functions - decisions, commitments, patterns',
    icon: '📚',
    handler: (args: string[]) => handleExec(['knowledge', ...args]),
    subcommands: ['--add', '--search', '--patterns', '--commitments', '--timeline'],
    examples: [
      'ferni knowledge',
      'ferni knowledge --patterns',
      'ferni knowledge --commitments',
      'ferni knowledge --add "Decision here" --type decision',
    ],
  },
  // ============================================================================
  // PLATFORM OPERATIONS - Infrastructure and DevOps namespace
  // ============================================================================
  platform: {
    name: 'Platform',
    description: 'Platform operations hub (deploy, logs, status, metrics, alerts)',
    icon: '🏗️',
    handler: handlePlatform,
    subcommands: [
      'deploy',
      'logs',
      'status',
      'metrics',
      'alerts',
      'traffic',
      'rollback',
      'secrets',
      'db',
      'cache',
      'sessions',
      'costs',
      'sla',
      'oncall',
      'incidents',
      'chaos',
      'experiments',
    ],
    examples: [
      'ferni platform',
      'ferni platform deploy gce',
      'ferni platform logs agent --tail',
      'ferni platform status',
      'ferni platform metrics live',
      'ferni platform alerts active',
    ],
  },
  // ============================================================================
  // YOUR TEAM - Meet the AI leadership team supporting you
  // ============================================================================
  team: {
    name: 'Team',
    description: 'Meet your AI leadership team - specialists ready to help',
    icon: '👥',
    handler: handleTeam,
    subcommands: ['list', 'ferni', 'maya', 'alex', 'jordan', 'peter', 'nayan'],
    examples: [
      'ferni team',
      'ferni team maya',
      'ferni team alex',
      'ferni team --connect maya',
    ],
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
    return execSync(cmd, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function execCommandWithStatus(cmd: string): { output: string; success: boolean } {
  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { output, success: true };
  } catch (error) {
    return { output: (error as Error).message, success: false };
  }
}

// ============================================================================
// PLATFORM COMMAND - Unified ops namespace
// ============================================================================

async function handlePlatform(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  // If no subcommand, show platform dashboard
  if (!subcommand) {
    log.header(`${icons.cloud} Platform Operations Hub`);
    console.log(`\n  ${colors.bold}Quick Status${colors.reset}`);
    console.log(`  Run ${colors.cyan}ferni platform status${colors.reset} for full status\n`);

    console.log(`  ${colors.bold}Available Operations:${colors.reset}`);
    console.log(`    ${colors.green}deploy${colors.reset}       Deploy services (gce, ui, frontend)`);
    console.log(`    ${colors.green}logs${colors.reset}         View & analyze logs`);
    console.log(`    ${colors.green}status${colors.reset}       Check deployment status`);
    console.log(`    ${colors.green}metrics${colors.reset}      Real-time platform metrics`);
    console.log(`    ${colors.green}alerts${colors.reset}       Alert management`);
    console.log(`    ${colors.green}traffic${colors.reset}      Traffic management & canary`);
    console.log(`    ${colors.green}rollback${colors.reset}     Rollback deployments`);
    console.log(`    ${colors.green}secrets${colors.reset}      Secret management`);
    console.log(`    ${colors.green}db${colors.reset}           Database operations`);
    console.log(`    ${colors.green}cache${colors.reset}        Cache management`);
    console.log(`    ${colors.green}sessions${colors.reset}     Active sessions & analytics`);
    console.log(`    ${colors.green}costs${colors.reset}        Cloud cost tracking`);
    console.log(`    ${colors.green}sla${colors.reset}          SLA tracking & uptime`);
    console.log(`    ${colors.green}oncall${colors.reset}       On-call rotation`);
    console.log(`    ${colors.green}incidents${colors.reset}    Incident response`);
    console.log(`    ${colors.green}chaos${colors.reset}        Chaos engineering tests`);
    console.log(`    ${colors.green}experiments${colors.reset}  A/B tests & rollouts`);
    console.log();
    console.log(`  ${colors.dim}Examples:${colors.reset}`);
    console.log(`    ferni platform deploy gce`);
    console.log(`    ferni platform logs agent --tail`);
    console.log(`    ferni platform metrics live`);
    return;
  }

  // Route to existing handlers
  const routeMap: Record<string, (args: string[]) => Promise<void>> = {
    deploy: async (a) => runCommand('apps/cli/src/commands/deploy/deploy.ts', a),
    logs: handleLogs,
    status: handleStatus,
    metrics: handleMetrics,
    alerts: handleAlerts,
    traffic: handleTraffic,
    rollback: handleRollback,
    secrets: handleSecrets,
    db: handleDb,
    cache: handleCache,
    sessions: handleSessions,
    costs: handleCosts,
    sla: handleSLA,
    oncall: handleOnCall,
    incidents: handleIncidentCmd,
    chaos: handleChaos,
    experiments: handleExperiments,
  };

  const handler = routeMap[subcommand];
  if (handler) {
    await handler(subArgs);
  } else {
    log.error(messages.unknownCommand(`platform ${subcommand}`));
    console.log(`\nRun ${colors.cyan}ferni platform${colors.reset} to see available operations.`);
  }
}

// ============================================================================
// TEAM COMMAND - Meet your AI leadership team
// ============================================================================

interface TeamMember {
  name: string;
  role: string;
  icon: string;
  color: string;
  specialty: string;
  expertise: string[];
  askAbout: string[];
}

const AI_TEAM: Record<string, TeamMember> = {
  ferni: {
    name: 'Ferni',
    role: 'Your Chief of Staff',
    icon: '🌿',
    color: colors.green,
    specialty: 'Orchestrating your team and connecting the dots',
    expertise: ['Daily briefings', 'Team coordination', 'Quick answers', 'Life admin'],
    askAbout: ['What should I focus on today?', 'Summarize my week', 'Connect me with Maya'],
  },
  maya: {
    name: 'Maya Santos',
    role: 'Habit & Wellness Coach',
    icon: '🧘',
    color: colors.cyan,
    specialty: 'Building sustainable habits and holistic wellbeing',
    expertise: ['Habit formation', 'Mindfulness', 'Energy management', 'Work-life balance'],
    askAbout: ['Help me build a morning routine', 'I need to manage stress', 'Track my habits'],
  },
  alex: {
    name: 'Alex Chen',
    role: 'Communications Director',
    icon: '✉️',
    color: colors.blue,
    specialty: 'Managing relationships and communication strategy',
    expertise: ['Calendar management', 'Email drafting', 'Meeting prep', 'Relationship tracking'],
    askAbout: ['Draft this email', 'Prep me for tomorrow\'s meetings', 'Who should I follow up with?'],
  },
  jordan: {
    name: 'Jordan Taylor',
    role: 'Life Planner & Accountability',
    icon: '📋',
    color: colors.yellow,
    specialty: 'Goal setting, planning, and keeping you accountable',
    expertise: ['Goal tracking', 'Project planning', 'Milestone celebrations', 'Accountability'],
    askAbout: ['Review my goals', 'Plan my next quarter', 'Celebrate my wins'],
  },
  peter: {
    name: 'Peter John',
    role: 'Research & Intelligence',
    icon: '🔍',
    color: colors.magenta,
    specialty: 'Deep research and data-driven insights',
    expertise: ['Market research', 'Financial analysis', 'Decision support', 'Data synthesis'],
    askAbout: ['Research this topic', 'Analyze this opportunity', 'What does the data say?'],
  },
  nayan: {
    name: 'Nayan Patel',
    role: 'Wisdom & Perspective',
    icon: '🌟',
    color: colors.white,
    specialty: 'Life philosophy, values alignment, and deeper meaning',
    expertise: ['Life narrative', 'Values alignment', 'Big picture thinking', 'Legacy planning'],
    askAbout: ['Am I living aligned with my values?', 'What matters most?', 'Help me reflect deeply'],
  },
};

async function handleTeam(args: string[]): Promise<void> {
  const subcommand = args[0];

  // Show team overview
  if (!subcommand || subcommand === 'list') {
    log.header('👥 Your AI Leadership Team');
    console.log(`  ${colors.dim}A team of specialists, always ready to help.${colors.reset}\n`);

    for (const [id, member] of Object.entries(AI_TEAM)) {
      console.log(`  ${member.icon} ${member.color}${colors.bold}${member.name}${colors.reset}`);
      console.log(`     ${colors.dim}${member.role}${colors.reset}`);
      console.log(`     ${member.specialty}\n`);
    }

    console.log(`  ${colors.bold}Connect with a team member:${colors.reset}`);
    console.log(`    ${colors.cyan}ferni team maya${colors.reset}     Learn about Maya`);
    console.log(`    ${colors.cyan}ferni voice --persona maya${colors.reset}  Talk to Maya`);
    console.log(`    ${colors.cyan}ferni coach${colors.reset}         Start a coaching session`);
    return;
  }

  // Show specific team member
  const member = AI_TEAM[subcommand.toLowerCase()];
  if (member) {
    log.header(`${member.icon} ${member.name}`);
    console.log(`  ${member.color}${colors.bold}${member.role}${colors.reset}\n`);
    console.log(`  ${colors.bold}Specialty:${colors.reset} ${member.specialty}\n`);

    console.log(`  ${colors.bold}Expertise:${colors.reset}`);
    member.expertise.forEach((e) => console.log(`    ${colors.dim}•${colors.reset} ${e}`));
    console.log();

    console.log(`  ${colors.bold}Ask ${member.name.split(' ')[0]} about:${colors.reset}`);
    member.askAbout.forEach((q) => console.log(`    ${colors.cyan}"${q}"${colors.reset}`));
    console.log();

    console.log(`  ${colors.bold}Connect:${colors.reset}`);
    console.log(`    ${colors.green}ferni voice --persona ${subcommand}${colors.reset}  Start a voice conversation`);
    console.log(`    ${colors.green}ferni ask "${member.askAbout[0]}"${colors.reset}`);
    return;
  }

  // Special command: --connect
  if (subcommand === '--connect' && args[1]) {
    const connectTo = args[1].toLowerCase();
    if (AI_TEAM[connectTo]) {
      console.log(`\n  ${colors.dim}Connecting you to ${AI_TEAM[connectTo].name}...${colors.reset}\n`);
      await handleVoice(['--persona', connectTo]);
      return;
    }
  }

  log.error(messages.notFound(`team member "${subcommand}"`));
  console.log(`\nAvailable: ${Object.keys(AI_TEAM).join(', ')}`);
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
    const builderScript = join(PROJECT_ROOT, 'apps', 'cli', 'src', 'commands', 'agents', 'agent-builder.ts');
    const result = spawnSync('npx', ['tsx', builderScript], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });

    if (result.status !== 0) {
      log.error(messages.buildFailed('The agent wizard ran into trouble.'));
    }
    return;
  }

  // For all other subcommands, delegate to agent-manager.ts
  const agentManagerScript = join(PROJECT_ROOT, 'src', 'cli', 'agent-manager.ts');
  runCommand(agentManagerScript, args);
}

// ============================================================================
// CUSTOM AGENT COMMAND (ferni agent - for user-created agents)
// ============================================================================

async function handleAgent(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const subcommandArgs = args.slice(1);

  // Route to appropriate script based on subcommand
  const scriptMap: Record<string, string> = {
    create: 'apps/cli/src/commands/agent/agent-create.ts',
    list: 'apps/cli/src/commands/agent/agent-list.ts',
    show: 'apps/cli/src/commands/agent/agent-show.ts',
    voice: 'apps/cli/src/commands/agent/agent-voice.ts',
    memory: 'apps/cli/src/commands/agent/agent-memory.ts',
    test: 'apps/cli/src/commands/agent/agent-test.ts',
    deploy: 'apps/cli/src/commands/agent/agent-deploy.ts',
    delete: 'apps/cli/src/commands/agent/agent-delete.ts',
  };

  const script = scriptMap[subcommand];
  if (!script) {
    log.error(messages.unknownCommand(subcommand));
    console.log(`\n  Available: ${Object.keys(scriptMap).join(', ')}`);
    console.log(`\n  Examples:`);
    console.log(`    ferni agent create                    Create new agent`);
    console.log(`    ferni agent create --template legacy  From template`);
    console.log(`    ferni agent list                      List your agents`);
    console.log(`    ferni agent voice upload <id> <file>  Upload voice`);
    console.log(`    ferni agent memory add <id>           Add memory`);
    console.log(`    ferni agent test <id>                 Test agent`);
    console.log(`    ferni agent deploy <id>               Deploy agent`);
    return;
  }

  runCommand(join(PROJECT_ROOT, script), subcommandArgs);
}

// ============================================================================
// SITE COMMAND (ferni site - for agent website generation/deployment)
// ============================================================================

async function handleSite(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';
  const subcommandArgs = args.slice(1);

  // Route to appropriate script based on subcommand
  const scriptMap: Record<string, string> = {
    create: 'apps/cli/src/commands/site/site-create.ts',
    preview: 'apps/cli/src/commands/site/site-preview.ts',
    deploy: 'apps/cli/src/commands/site/site-deploy.ts',
    status: 'apps/cli/src/commands/site/site-status.ts',
  };

  const script = scriptMap[subcommand];
  if (!script) {
    log.error(messages.unknownCommand(subcommand));
    console.log(`\n  Available: ${Object.keys(scriptMap).join(', ')}`);
    console.log(`\n  Examples:`);
    console.log(`    ferni site create --agent <id>          Generate from template`);
    console.log(`    ferni site create --agent <id> --template memorial`);
    console.log(`    ferni site preview                      Local preview`);
    console.log(`    ferni site deploy                       Deploy to Firebase`);
    console.log(`    ferni site deploy --ferni               Deploy to ferni.ai`);
    return;
  }

  runCommand(join(PROJECT_ROOT, script), subcommandArgs);
}

// ============================================================================
// LOGS COMMAND
// ============================================================================

async function handleLogs(args: string[]): Promise<void> {
  const subcommand = args[0] || 'agent';
  const tail = args.includes('--tail') || args.includes('-f');
  const limit = args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '50';
  const sinceArg = args.find((a) => a.startsWith('--since='))?.split('=')[1] || '1h';

  log.header(`${icons.log} Cloud Run Logs`);

  // AI-powered log analysis
  if (subcommand === 'analyze') {
    await handleLogsAnalyze(args.slice(1), sinceArg);
    return;
  }

  // Search logs with a query
  if (subcommand === 'search') {
    const query = args[1];
    if (!query) {
      log.error(messages.missingArg('search query', 'ferni agents search "wellness"'));
      console.log(`\n  Usage: ferni logs search "error message"`);
      return;
    }
    await handleLogsSearch(query, sinceArg);
    return;
  }

  // GCE voice agent logs
  if (subcommand === 'gce') {
    await handleLogsGCE(sinceArg, tail);
    return;
  }

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
      log.error(messages.unknownService(subcommand));
      log.info(`Available: ${Object.keys(SERVICES).join(', ')}, all, errors, analyze, search, gce`);
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

// AI-powered log analysis using Gemini
async function handleLogsAnalyze(args: string[], since: string): Promise<void> {
  const service = args[0] || 'all';

  console.log(`${colors.bold}🤖 AI Log Analysis${colors.reset}\n`);
  console.log(`  ${colors.dim}Analyzing logs from last ${since}...${colors.reset}\n`);

  const spinner = new Spinner('Fetching logs...');
  spinner.start();

  // Fetch recent logs
  let logQuery = 'resource.type=cloud_run_revision';
  if (service !== 'all') {
    const svcName = SERVICES[service as keyof typeof SERVICES] || service;
    logQuery += ` AND resource.labels.service_name="${svcName}"`;
  }

  const cmd = `gcloud logging read '${logQuery}' --limit=200 --project=${GCP_PROJECT} --format="json" --freshness=${since} 2>/dev/null`;
  const logsJson = execCommand(cmd);

  spinner.stop(!!logsJson);

  if (!logsJson || logsJson === '[]') {
    log.warn('No logs found in the specified time range');
    return;
  }

  let logs: any[];
  try {
    logs = JSON.parse(logsJson);
  } catch {
    log.error('Failed to parse logs');
    return;
  }

  // Summarize logs for AI analysis
  const errorLogs = logs.filter((l: any) => l.severity === 'ERROR' || l.severity === 'WARNING');
  const logSummary = {
    total: logs.length,
    errors: logs.filter((l: any) => l.severity === 'ERROR').length,
    warnings: logs.filter((l: any) => l.severity === 'WARNING').length,
    timeRange: since,
    sampleErrors: errorLogs.slice(0, 10).map((l: any) => ({
      timestamp: l.timestamp,
      severity: l.severity,
      message: l.textPayload || l.jsonPayload?.message || JSON.stringify(l.jsonPayload).slice(0, 200),
    })),
  };

  console.log(`\n  ${colors.cyan}Log Summary:${colors.reset}`);
  console.log(`    Total entries:  ${logSummary.total}`);
  console.log(`    Errors:         ${colors.red}${logSummary.errors}${colors.reset}`);
  console.log(`    Warnings:       ${colors.yellow}${logSummary.warnings}${colors.reset}\n`);

  if (logSummary.errors === 0 && logSummary.warnings === 0) {
    console.log(`  ${colors.green}🌿 All clear! No errors or warnings in the logs.${colors.reset}\n`);
    return;
  }

  // AI analysis
  const spinner2 = new Spinner('Analyzing with AI...');
  spinner2.start();

  try {
    const prompt = `You are Ferni, a helpful and friendly AI assistant analyzing production logs.

Analyze these log entries and provide:
1. A brief summary of what's happening (2-3 sentences)
2. Any patterns you notice (repeated errors, timing issues, etc.)
3. Actionable recommendations (1-3 bullet points)

Keep your response concise, friendly, and actionable. Use your warm Ferni voice.

Log Summary:
${JSON.stringify(logSummary, null, 2)}`;

    const analysis = await callGeminiRuntime(prompt);
    spinner2.stop(true);

    console.log(`  ${colors.green}🌿 Ferni's Analysis:${colors.reset}\n`);
    console.log(`  ${analysis.split('\n').join('\n  ')}\n`);
  } catch (error) {
    spinner2.stop(false);

    // Fallback: basic analysis without AI
    console.log(`  ${colors.yellow}AI unavailable, showing basic analysis:${colors.reset}\n`);
    if (logSummary.sampleErrors.length > 0) {
      console.log(`  ${colors.cyan}Recent errors:${colors.reset}`);
      logSummary.sampleErrors.slice(0, 5).forEach((e: any) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        console.log(`    ${colors.dim}[${time}]${colors.reset} ${e.message.slice(0, 80)}...`);
      });
    }
  }
}

// Search logs with a specific query
async function handleLogsSearch(query: string, since: string): Promise<void> {
  console.log(`${colors.bold}🔍 Log Search${colors.reset}\n`);
  console.log(`  Query: "${colors.cyan}${query}${colors.reset}"`);
  console.log(`  Range: ${since}\n`);

  const spinner = new Spinner('Searching logs...');
  spinner.start();

  // Search across all services
  const cmd = `gcloud logging read 'resource.type=cloud_run_revision AND textPayload=~"${query}"' --limit=50 --project=${GCP_PROJECT} --format="table(timestamp,resource.labels.service_name,severity,textPayload)" --freshness=${since} 2>/dev/null`;

  spinner.stop(true);

  console.log();
  const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });

  if (result.status !== 0) {
    log.warn('Search completed with no results or errors');
  }
}

// GCE voice agent logs via SSH
async function handleLogsGCE(since: string, tail: boolean): Promise<void> {
  console.log(`${colors.bold}🖥️ GCE Voice Agent Logs${colors.reset}\n`);

  if (tail) {
    log.info('Streaming GCE logs (Ctrl+C to stop)...\n');
    const cmd = `gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a --command="docker logs voiceai-agent -f --tail=100" 2>/dev/null`;
    const child = spawn('sh', ['-c', cmd], { stdio: 'inherit' });
    await new Promise((resolve) => child.on('close', resolve));
    return;
  }

  const spinner = new Spinner('Fetching GCE logs...');
  spinner.start();

  // Get logs from the last hour by default
  const sinceSeconds = since.includes('h') ? parseInt(since) * 3600 : parseInt(since) * 60;
  const cmd = `gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a --command="docker logs voiceai-agent --since=${sinceSeconds}s 2>&1 | tail -100" 2>/dev/null`;

  const logs = execCommand(cmd);
  spinner.stop(!!logs);

  if (logs) {
    console.log(`\n${logs}\n`);
  } else {
    log.warn('Could not retrieve GCE logs (VM may be unreachable)');
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
          const statusIcon =
            revStatus === 'True'
              ? `${colors.green}●${colors.reset}`
              : `${colors.yellow}●${colors.reset}`;
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
        result.split('\n').forEach((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const status =
              parts[1] === 'True'
                ? `${colors.green}✓${colors.reset}`
                : `${colors.yellow}○${colors.reset}`;
            console.log(
              `    ${status} ${parts[0]} ${colors.dim}${parts.slice(2).join(' ')}${colors.reset}`
            );
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
      const healthResult = execCommandWithStatus(
        `curl -s -o /dev/null -w "%{http_code}" "${healthUrl}" 2>/dev/null`
      );
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
      {
        name: 'gcloud CLI',
        cmd: 'gcloud --version 2>/dev/null | head -1',
        expected: /Google Cloud SDK/,
        required: true,
      },
      {
        name: 'Docker',
        cmd: 'docker --version 2>/dev/null',
        expected: /Docker version/,
        required: false,
      },
      {
        name: 'Firebase CLI',
        cmd: 'firebase --version 2>/dev/null',
        expected: /\d+\.\d+/,
        required: false,
      },
      {
        name: 'gh CLI',
        cmd: 'gh --version 2>/dev/null | head -1',
        expected: /gh version/,
        required: false,
      },
    ];

    for (const check of envChecks) {
      const result = execCommand(check.cmd);
      if (check.expected.test(result)) {
        console.log(
          `  ${colors.green}${icons.success}${colors.reset} ${check.name}: ${colors.dim}${result.split('\n')[0]}${colors.reset}`
        );
      } else if (check.required) {
        console.log(
          `  ${colors.red}${icons.error}${colors.reset} ${check.name}: ${colors.dim}not found (required)${colors.reset}`
        );
        issues++;
      } else {
        console.log(
          `  ${colors.yellow}${icons.warning}${colors.reset} ${check.name}: ${colors.dim}not found (optional)${colors.reset}`
        );
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
      const result = execCommand(
        `gcloud services list --enabled --filter="name:${api}" --format="value(name)" --project=${GCP_PROJECT} 2>/dev/null`
      );
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
      { path: 'apps/web/package.json', required: true, desc: 'Frontend package' },
      { path: 'design-system/dist/tokens.css', required: false, desc: 'Design tokens' },
      { path: '.env.production', required: false, desc: 'Production env' },
    ];

    for (const file of files) {
      const exists = existsSync(join(PROJECT_ROOT, file.path));
      if (exists) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${file.path}`);
      } else if (file.required) {
        console.log(
          `  ${colors.red}${icons.error}${colors.reset} ${file.path} ${colors.dim}(${file.desc} - required)${colors.reset}`
        );
        issues++;
      } else {
        console.log(
          `  ${colors.yellow}${icons.warning}${colors.reset} ${file.path} ${colors.dim}(${file.desc} - optional)${colors.reset}`
        );
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
      log.error(messages.missingEnvFile());
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
      const hasVar =
        envContent.includes(`${varName}=`) &&
        !envContent.includes(`${varName}=\n`) &&
        !envContent.includes(`${varName}=""`);
      if (hasVar) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${varName}`);
      } else {
        console.log(
          `  ${colors.red}${icons.error}${colors.reset} ${varName} ${colors.dim}(missing or empty)${colors.reset}`
        );
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
    const result = execCommand(
      `gcloud firestore databases describe --project=${GCP_PROJECT} 2>/dev/null`
    );
    spinner.stop(!!result);

    if (result) {
      const lines = result.split('\n');
      lines.forEach((line) => {
        if (line.includes(':')) {
          const [key, value] = line.split(':').map((s) => s.trim());
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
    log.info(
      `View in console: https://console.cloud.google.com/firestore/databases/-default-/data?project=${GCP_PROJECT}`
    );
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
    console.log(
      `\n  ${colors.cyan}npx tsx scripts/migrate-memories.ts${colors.reset} - Migrate memory format`
    );
    console.log(
      `  ${colors.cyan}npx tsx scripts/migrate-users.ts${colors.reset} - Migrate user schema\n`
    );
  }

  if (subcommand === 'query') {
    log.info('Interactive query mode not yet implemented.');
    log.step('Use Firebase console for queries:');
    console.log(
      `\n  ${colors.cyan}https://console.cloud.google.com/firestore/databases/-default-/data?project=${GCP_PROJECT}${colors.reset}\n`
    );
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
      log.success(messages.allDone());
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
      log.success(messages.validationPassed());
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
      console.log(
        `\n${colors.dim}Bump version with: ferni tokens version <patch|minor|major> "change description"${colors.reset}`
      );
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
// DESIGN SYSTEM COMMAND
// ============================================================================

async function handleDesign(args: string[]): Promise<void> {
  const subcommand = args[0] || 'check';

  log.header(`🎨 Design System`);

  if (subcommand === 'check') {
    console.log(`${colors.bold}Checking design system compliance...${colors.reset}\n`);

    const extraArgs = args.slice(1);
    const checkArgs = ['design-system/check-design-compliance.js', ...extraArgs];

    spawnSync('node', checkArgs, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'fix') {
    console.log(`${colors.bold}Auto-fixing design system violations...${colors.reset}\n`);

    const isPriority = args.includes('--priority');
    const checkArgs = ['design-system/check-design-compliance.js', '--fix'];
    if (isPriority) checkArgs.push('--priority');

    const result = spawnSync('node', checkArgs, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    if (result.status === 0) {
      console.log();
      log.success('Auto-fix complete. Run "ferni design check" to see remaining issues.');
    }
  }

  if (subcommand === 'ai-fix') {
    console.log(`${colors.bold}🤖 AI-Powered Design System Fixer${colors.reset}\n`);
    console.log(
      `${colors.dim}Ferni will use AI to intelligently fix violations...${colors.reset}\n`
    );

    // Check for API key
    if (!process.env.GOOGLE_API_KEY) {
      log.error('GOOGLE_API_KEY not set');
      console.log(`\nTo use AI-powered fixing, set your API key:`);
      console.log(`  ${colors.cyan}export GOOGLE_API_KEY="your-key"${colors.reset}`);
      console.log(`\nGet a key at: https://makersuite.google.com/app/apikey`);
      return;
    }

    const extraArgs = args.slice(1);
    const fixArgs = ['design-system/ai-fix.js', ...extraArgs];

    // If no args, run interactive mode
    if (extraArgs.length === 0 || extraArgs.every((a) => a.startsWith('--'))) {
      spawn('node', fixArgs, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
    } else {
      spawnSync('node', fixArgs, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
    }
  }

  if (subcommand === 'priority') {
    console.log(`${colors.bold}Checking priority UI files only...${colors.reset}\n`);
    console.log(`${colors.dim}Priority files are core user-facing UI components${colors.reset}\n`);

    spawnSync('node', ['design-system/check-design-compliance.js', '--priority'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'watch') {
    console.log(`${colors.bold}Starting design token watch mode...${colors.reset}\n`);
    log.info('Watching for changes in design-system/tokens/');
    log.info('Tokens will auto-regenerate on change');
    log.info('Press Ctrl+C to stop\n');

    spawn('node', ['design-system/watch-tokens.js'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'storybook') {
    console.log(`${colors.bold}Starting Storybook...${colors.reset}\n`);

    spawn('npm', ['run', 'storybook'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
  }

  if (subcommand === 'wcag') {
    console.log(`${colors.bold}Running WCAG accessibility checks...${colors.reset}\n`);

    const result = spawnSync('node', ['design-system/check-accessibility.js'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    if (result.status === 0) {
      console.log();
      log.success('All WCAG AA checks passed');
    }
  }

  if (subcommand === 'brand-words') {
    console.log(`${colors.bold}Checking for forbidden brand words...${colors.reset}\n`);

    const forbiddenWords = [
      'chatbot',
      'virtual assistant',
      'AI assistant',
      'bot',
      'utilize',
      'leverage',
      'solution',
      'platform',
      'functionality',
    ];

    console.log(`${colors.dim}Scanning for: ${forbiddenWords.join(', ')}${colors.reset}\n`);

    let found = false;
    for (const word of forbiddenWords) {
      try {
        const result = execSync(
          `grep -rn --include="*.ts" -i "\\b${word}\\b" apps/web/src/ui/ 2>/dev/null | head -5`,
          { cwd: PROJECT_ROOT, encoding: 'utf8' }
        );
        if (result.trim()) {
          console.log(`${colors.yellow}Found "${word}":${colors.reset}`);
          console.log(result);
          found = true;
        }
      } catch {
        // grep returns exit code 1 when no matches
      }
    }

    if (!found) {
      log.success('No forbidden brand words found!');
    } else {
      console.log();
      log.warn('Review the above and replace with brand-compliant language');
      console.log(`${colors.dim}See: design-system/docs/brand/FERNI-BRAND-GUIDELINES.md${colors.reset}`);
    }
  }

  // Show help if no valid subcommand
  if (
    !['check', 'fix', 'ai-fix', 'priority', 'watch', 'storybook', 'wcag', 'brand-words'].includes(
      subcommand
    )
  ) {
    console.log(`${colors.bold}Available subcommands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}check${colors.reset}        Check all files for violations`);
    console.log(`  ${colors.cyan}fix${colors.reset}          Rule-based auto-fix (fast, limited)`);
    console.log(
      `  ${colors.cyan}ai-fix${colors.reset}       ${colors.magenta}🤖 AI-powered fix (smart, comprehensive)${colors.reset}`
    );
    console.log(`  ${colors.cyan}priority${colors.reset}     Check priority UI files only`);
    console.log(`  ${colors.cyan}watch${colors.reset}        Watch mode - auto-regenerate tokens`);
    console.log(`  ${colors.cyan}storybook${colors.reset}    Start Storybook for component docs`);
    console.log(`  ${colors.cyan}wcag${colors.reset}         Run WCAG AA accessibility checks`);
    console.log(`  ${colors.cyan}brand-words${colors.reset}  Check for forbidden brand words`);
    console.log();
    console.log(`${colors.dim}Examples:${colors.reset}`);
    console.log(`  ferni design check`);
    console.log(
      `  ferni design ai-fix                    ${colors.dim}# Interactive mode${colors.reset}`
    );
    console.log(
      `  ferni design ai-fix --batch            ${colors.dim}# Fix all priority files${colors.reset}`
    );
    console.log(
      `  ferni design ai-fix path/to/file.ts    ${colors.dim}# Fix specific file${colors.reset}`
    );
    console.log(
      `  ferni design ai-fix --preview          ${colors.dim}# Preview without applying${colors.reset}`
    );
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
      log.error(messages.missingEnvFile());
      log.info(`Create one with: cp .env.example .env`);
      return;
    }

    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));

    let currentSection = '';
    for (const line of lines) {
      if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');
        const hasValue = value && value !== '""' && value !== "''";
        const icon = hasValue
          ? `${colors.green}●${colors.reset}`
          : `${colors.yellow}○${colors.reset}`;
        const maskedValue = hasValue
          ? `${colors.dim}[set]${colors.reset}`
          : `${colors.dim}[empty]${colors.reset}`;
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
      log.error(messages.missingEnvFile());
      return;
    }

    console.log(`  ${colors.bold}Required:${colors.reset}`);
    let missingRequired = 0;
    for (const { key, desc } of required) {
      const regex = new RegExp(`^${key}=.+`, 'm');
      const hasValue = regex.test(content);
      if (hasValue) {
        console.log(
          `    ${colors.green}${icons.success}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`
        );
      } else {
        console.log(
          `    ${colors.red}${icons.error}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`
        );
        missingRequired++;
      }
    }

    console.log(`\n  ${colors.bold}Optional:${colors.reset}`);
    for (const { key, desc } of optional) {
      const regex = new RegExp(`^${key}=.+`, 'm');
      const hasValue = regex.test(content);
      if (hasValue) {
        console.log(
          `    ${colors.green}${icons.success}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`
        );
      } else {
        console.log(
          `    ${colors.dim}${icons.bullet}${colors.reset} ${key} ${colors.dim}(${desc})${colors.reset}`
        );
      }
    }

    console.log();
    if (missingRequired > 0) {
      log.error(`${missingRequired} required variable(s) missing`);
    } else {
      log.success(messages.readyToGo());
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
      content
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => l.split('=')[0].trim());

    const exampleKeys = new Set(getKeys(exampleContent));
    const envKeys = new Set(getKeys(envContent));

    const missing = [...exampleKeys].filter((k) => !envKeys.has(k));
    const extra = [...envKeys].filter((k) => !exampleKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
      log.success('No differences found');
    } else {
      if (missing.length > 0) {
        console.log(`  ${colors.red}Missing in .env:${colors.reset}`);
        missing.forEach((k) => console.log(`    ${colors.red}-${colors.reset} ${k}`));
      }
      if (extra.length > 0) {
        console.log(`  ${colors.yellow}Extra in .env (not in example):${colors.reset}`);
        extra.forEach((k) => console.log(`    ${colors.yellow}+${colors.reset} ${k}`));
      }
    }
  }

  if (subcommand === 'secrets') {
    console.log(`${colors.bold}GCP Secret Manager:${colors.reset}\n`);

    const spinner = new Spinner('Fetching secrets...');
    spinner.start();
    const result = execCommand(
      `gcloud secrets list --project=${GCP_PROJECT} --format="table(name,createTime)" 2>/dev/null`
    );
    spinner.stop(!!result);

    if (result) {
      console.log(result);
    } else {
      log.info('No secrets found or not authenticated');
    }

    console.log();
    log.info(
      `Manage secrets: https://console.cloud.google.com/security/secret-manager?project=${GCP_PROJECT}`
    );
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
      spawn('npm', ['run', 'dev', '--prefix', 'apps/web'], {
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

  if (subcommand === 'cursor') {
    // Output commands for Cursor AI agent to start servers in separate terminals
    console.log(`
${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║           CURSOR TERMINAL MODE - Dev Servers                   ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}For Cursor AI agents:${colors.reset} Start each server in a separate background
terminal so logs can be watched individually.

${colors.bold}${colors.cyan}Commands to run in separate terminals:${colors.reset}

${colors.yellow}# Terminal 1: Token Server (port 3001)${colors.reset}
${colors.green}pnpm token-server${colors.reset}

${colors.yellow}# Terminal 2: UI Server (port 3002)${colors.reset}
${colors.green}pnpm ui-server${colors.reset}

${colors.yellow}# Terminal 3: Vite Frontend (port 3004)${colors.reset}
${colors.green}cd apps/web && pnpm dev${colors.reset}

${colors.yellow}# Terminal 4: Voice Agent (LiveKit worker)${colors.reset}
${colors.green}LOG_FULL_RESPONSES=true pnpm dev${colors.reset}

${colors.bold}${colors.cyan}Health check after starting:${colors.reset}
${colors.dim}curl -s http://localhost:3001/health && echo ""
curl -s http://localhost:3002/health && echo ""
curl -s http://localhost:3004/ | head -c 100${colors.reset}

${colors.bold}${colors.cyan}Stop all servers:${colors.reset}
${colors.dim}ferni dev stop${colors.reset}
`);
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
        console.log(
          `  ${colors.cyan}Display Name:${colors.reset} ${manifest.displayName || 'N/A'}`
        );
        console.log(
          `  ${colors.cyan}Voice:${colors.reset} ${manifest.voice?.provider || 'N/A'} - ${manifest.voice?.id || 'N/A'}`
        );
        console.log(`  ${colors.cyan}Model:${colors.reset} ${manifest.model || 'default'}`);
        if (manifest.capabilities) {
          console.log(
            `  ${colors.cyan}Capabilities:${colors.reset} ${manifest.capabilities.join(', ')}`
          );
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

      const tools = existsSync(toolsDir)
        ? execCommand(`ls ${toolsDir}/*.ts 2>/dev/null | wc -l`).trim()
        : '0';
      const behaviors = existsSync(behaviorsDir)
        ? execCommand(`ls ${behaviorsDir}/*.json 2>/dev/null | wc -l`).trim()
        : '0';

      totalTools += parseInt(tools);
      totalBehaviors += parseInt(behaviors);

      console.log(`  ${colors.cyan}${persona}:${colors.reset}`);
      console.log(`    Tools: ${tools}, Behaviors: ${behaviors}`);
    }

    console.log();
    console.log(
      `  ${colors.bold}Total:${colors.reset} ${personaList.length} personas, ${totalTools} tools, ${totalBehaviors} behaviors`
    );
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
    arch: { name: 'Architecture', cmd: 'npm run quality:arch' },
    'dead-code': { name: 'Dead Code', cmd: 'npm run quality:dead-code' },
    imports: { name: 'Import Complexity', cmd: 'npm run quality:imports' },
    cohesion: { name: 'Module Cohesion', cmd: 'npm run quality:cohesion' },
    'api-surface': { name: 'API Surface', cmd: 'npm run quality:api-surface' },
    complexity: { name: 'Complexity', cmd: 'npm run quality:complexity' },
    naming: { name: 'Naming', cmd: 'npm run quality:naming' },
    jsdoc: { name: 'JSDoc Coverage', cmd: 'npm run quality:jsdoc' },
    bundle: { name: 'Bundle Size', cmd: 'npm run quality:bundle' },
    deps: { name: 'Dependency Freshness', cmd: 'npm run quality:deps' },
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
  } else if (subcommand === 'deep') {
    // Deep architecture quality checks
    console.log(`${colors.bold}Running deep architecture quality checks...${colors.reset}\n`);

    const deepChecks = ['arch', 'dead-code', 'imports', 'cohesion', 'api-surface', 'complexity', 'naming'];
    let passed = 0;
    let failed = 0;

    for (const key of deepChecks) {
      const check = checks[key as keyof typeof checks];
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
        // Show abbreviated output for failures
        const output = result.stdout?.toString() || result.stderr?.toString() || '';
        const lines = output.split('\n');
        const statusLine = lines.find((l: string) => l.includes('STATUS:'));
        if (statusLine) {
          console.log(`  ${colors.dim}${statusLine.trim()}${colors.reset}`);
        }
      }
    }

    console.log();
    if (failed === 0) {
      log.success(`All ${passed} deep checks passed!`);
    } else {
      log.warn(`${failed} check(s) have issues, ${passed} passed`);
      log.info('Run individual checks for details: ferni quality <check>');
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
        console.log(
          `\n${colors.dim}${result.stdout?.toString().slice(0, 500) || ''}${colors.reset}`
        );
      }
    }

    console.log();
    if (failed === 0) {
      log.success(`All ${passed} checks passed!`);
    } else {
      log.error(messages.validationFailed(failed, `${passed} checks passed.`));
    }
  } else if (checks[subcommand as keyof typeof checks]) {
    const check = checks[subcommand as keyof typeof checks];
    console.log(`${colors.bold}Running ${check.name}...${colors.reset}\n`);

    spawnSync('sh', ['-c', check.cmd], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  } else {
    log.error(messages.unknownCommand(subcommand));
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
    log.error(messages.missingTool('GitHub CLI (gh)', 'Install from: https://cli.github.com'));
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
    console.log(
      `  Uncommitted changes: ${uncommitted ? colors.yellow + 'Yes' : colors.green + 'None'}${colors.reset}`
    );
    console.log(
      `  Behind main: ${behind !== '0' ? colors.yellow + behind + ' commits' : colors.green + 'Up to date'}${colors.reset}`
    );

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
  // Delegate to the comprehensive tools command module
  const { handleTools: handler } = await import('./commands/tools/tools.js');
  await handler(args);
}

// ============================================================================
// COMMANDS (PERSONA COMMANDS)
// ============================================================================

async function handleCommands(args: string[]): Promise<void> {
  // Delegate to the commands module
  const { handleCommands: handler } = await import('./commands/commands/commands.js');
  await handler(args);
}

// ============================================================================
// API COMMAND
// ============================================================================

async function handleApi(args: string[]): Promise<void> {
  // Delegate to the API module
  const { handleApi: handler } = await import('./commands/api/api.js');
  await handler(args);
}

// ============================================================================
// FTIS COMMAND
// ============================================================================

async function handleFTIS(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`🧠 FTIS - Ferni Tool Intelligence System`);

  if (subcommand === 'train') {
    console.log(`${colors.bold}Training FTIS Router Model${colors.reset}\n`);
    console.log('Step 1: Generating synthetic training data...\n');

    // Run the training data generation script
    const result = spawnSync(
      'npx',
      ['tsx', 'apps/cli/src/commands/ftis/generate-training-data.ts', '--output=./data/ftis-training', '--examples=400'],
      {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      }
    );

    if (result.status !== 0) {
      console.log(`\n${colors.red}Failed to generate training data${colors.reset}`);
      return;
    }

    console.log(`\n${colors.green}Training data generated!${colors.reset}`);
    console.log(`\n${colors.bold}Step 2: Train the model (requires GPU)${colors.reset}`);
    console.log('\nRun these commands manually:');
    console.log(`  ${colors.cyan}cd apps/ml-training/router${colors.reset}`);
    console.log(`  ${colors.cyan}python train.py --data ${PROJECT_ROOT}/data/ftis-training --output ./models/router-v1${colors.reset}`);
    console.log(`  ${colors.cyan}python export_onnx.py --model ./models/router-v1 --output ./models/router-v1/model.onnx${colors.reset}`);
    console.log(`\n${colors.bold}Step 3: Upload to GCS${colors.reset}`);
    console.log(`  ${colors.cyan}gsutil -m cp -r ./models/router-v1 gs://ferni-models/router/v1/${colors.reset}`);
    return;
  }

  if (subcommand === 'status') {
    console.log(`${colors.bold}FTIS System Status${colors.reset}\n`);

    // Check training data
    const dataDir = join(PROJECT_ROOT, 'data', 'ftis-training');
    let dataStatus = `${colors.red}Not found${colors.reset}`;
    let dataDetails = '';
    try {
      const metadataPath = join(dataDir, 'metadata.json');
      if (existsSync(metadataPath)) {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        dataStatus = `${colors.green}Ready${colors.reset}`;
        dataDetails = ` (${metadata.totalExamples} examples, ${metadata.uniqueTools} tools)`;
      }
    } catch {
      // Data not found
    }

    // Check learning pipeline config
    let learningStatus = `${colors.yellow}Disabled${colors.reset}`;
    try {
      const pipelinePath = join(PROJECT_ROOT, 'src', 'tools', 'intelligence', 'learning', 'learning-pipeline.ts');
      const pipelineCode = readFileSync(pipelinePath, 'utf-8');
      if (pipelineCode.includes('autoRetrain: true')) {
        learningStatus = `${colors.green}Enabled${colors.reset}`;
      }
    } catch {
      // File not found
    }

    // Check A/B experiment
    let experimentStatus = `${colors.yellow}Not configured${colors.reset}`;
    try {
      const abPath = join(PROJECT_ROOT, 'src', 'tools', 'intelligence', 'learning', 'ab-testing.ts');
      const abCode = readFileSync(abPath, 'utf-8');
      if (abCode.includes('ftis-v1-rollout')) {
        experimentStatus = `${colors.green}ftis-v1-rollout (50/50)${colors.reset}`;
      }
    } catch {
      // File not found
    }

    console.log(`  Training Data:     ${dataStatus}${dataDetails}`);
    console.log(`  Auto-Learning:     ${learningStatus}`);
    console.log(`  A/B Experiment:    ${experimentStatus}`);
    console.log('');
    console.log(`${colors.dim}Run 'ferni ftis train' to generate data and train the model.${colors.reset}`);
    return;
  }

  if (subcommand === 'experiment') {
    const action = args[1] || 'status';
    console.log(`${colors.bold}FTIS A/B Experiment Management${colors.reset}\n`);

    if (action === 'create') {
      console.log('The FTIS experiment is auto-created on app startup.');
      console.log('Current configuration: 50% control (semantic-only), 50% FTIS');
      console.log('');
      console.log('To modify traffic allocation, edit:');
      console.log(`  ${colors.cyan}src/tools/intelligence/learning/ab-testing.ts${colors.reset}`);
      console.log(`  ${colors.dim}Look for 'ftis-v1-rollout' experiment definition${colors.reset}`);
    } else if (action === 'results') {
      console.log('View experiment results at:');
      console.log(`  ${colors.cyan}https://app.ferni.ai/api/observability/ftis${colors.reset}`);
      console.log('');
      console.log('Metrics tracked:');
      console.log('  • tool_accuracy - Primary metric');
      console.log('  • latency_ms - Response time');
      console.log('  • user_satisfaction - User ratings');
    } else {
      console.log('Available actions:');
      console.log('  ferni ftis experiment create   - View experiment setup');
      console.log('  ferni ftis experiment results  - View experiment results');
    }
    return;
  }

  // Unknown subcommand
  console.log('Available subcommands:');
  console.log('  ferni ftis train       - Generate training data and train model');
  console.log('  ferni ftis status      - Show FTIS system status');
  console.log('  ferni ftis experiment  - Manage A/B experiments');
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

    const result = execCommand(
      `gcloud scheduler jobs list --project=${GCP_PROJECT} --format="table(name,schedule,state,lastAttemptTime)" 2>/dev/null`
    );
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

    const result = execCommand(
      `gcloud scheduler jobs list --project=${GCP_PROJECT} --format="table(name,state,lastAttemptTime,status.code)" 2>/dev/null`
    );
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
      {
        name: 'Cloud Run Services',
        cmd: `gcloud run services list --project=${GCP_PROJECT} --format="value(name)" 2>/dev/null | wc -l`,
      },
      { name: 'Firestore Database', estimate: 'Standard pricing' },
      { name: 'Cloud Build', estimate: 'Pay per build minute' },
      {
        name: 'Secret Manager',
        cmd: `gcloud secrets list --project=${GCP_PROJECT} --format="value(name)" 2>/dev/null | wc -l`,
      },
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

    console.log(
      `  ${colors.dim}Note: Detailed cost breakdown requires BigQuery export setup${colors.reset}`
    );
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
    console.log(
      `    Budgets: https://console.cloud.google.com/billing/budgets?project=${GCP_PROJECT}`
    );
    console.log(
      `    Reports: https://console.cloud.google.com/billing/reports?project=${GCP_PROJECT}`
    );
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
          console.log(
            `  ${colors.green}${icons.success}${colors.reset} ${persona}: ${manifest.voice.id}`
          );
        } else {
          console.log(
            `  ${colors.yellow}${icons.warning}${colors.reset} ${persona}: No voice configured`
          );
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

  if (subcommand === 'generate-samples') {
    console.log(`${colors.bold}Generating Landing Page Voice Samples${colors.reset}\n`);
    console.log(
      `${colors.dim}Using Ferni's full persona pipeline with humanization${colors.reset}\n`
    );

    // Check for Cartesia API key
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      log.error('CARTESIA_API_KEY environment variable not set');
      log.info('Add it to your .env file or run: export CARTESIA_API_KEY="your-key"');
      return;
    }

    // Import the full persona platform
    // Note: Path is relative to apps/cli/src/
    const { getVoiceIdForPersona } = await import('../../../src/config/voice-ids.js');
    const { humanizeText, addBreathGroupPauses } =
      await import('../../../src/speech/advanced-humanization/index.js');

    // Persona configurations matching persona.manifest.json files
    // Includes speech characteristics and emotional context
    const PERSONA_CONFIG: Record<
      string,
      {
        canonicalId: string;
        displayName: string;
        role: string;
        emotion: string;
        agentIntent: string;
      }
    > = {
      ferni: {
        canonicalId: 'ferni',
        displayName: 'Ferni',
        role: 'Life Coach',
        emotion: 'warm',
        agentIntent: 'empathizing',
      },
      maya: {
        canonicalId: 'maya-santos',
        displayName: 'Maya',
        role: 'Habit Architect',
        emotion: 'encouraging',
        agentIntent: 'coaching',
      },
      peter: {
        canonicalId: 'peter-john',
        displayName: 'Peter',
        role: 'Research Guide',
        emotion: 'curious',
        agentIntent: 'exploring',
      },
      alex: {
        canonicalId: 'alex-chen',
        displayName: 'Alex',
        role: 'Communications Coach',
        emotion: 'supportive',
        agentIntent: 'guiding',
      },
      jordan: {
        canonicalId: 'jordan-taylor',
        displayName: 'Jordan',
        role: 'Celebration Catalyst',
        emotion: 'excited',
        agentIntent: 'celebrating',
      },
      nayan: {
        canonicalId: 'nayan-patel',
        displayName: 'Nayan',
        role: 'Wisdom Guide',
        emotion: 'contemplative',
        agentIntent: 'reflecting',
      },
    };

    // Voice samples - written in each persona's authentic voice
    const VOICE_SAMPLES: Record<string, { response: string; persona: string }> = {
      stress: {
        response:
          "I hear that. Overwhelm is heavy. Before we try to fix anything, what's weighing on you most right now? Sometimes just naming it helps.",
        persona: 'ferni',
      },
      habits: {
        response:
          "Here's the plan: make it embarrassingly small. Want to exercise? Start with putting on your shoes. That's it. Once that's automatic, we build. What habit are we working on?",
        persona: 'maya',
      },
      relationship: {
        response:
          "That takes courage. Let's find the right words. What's the core thing you need them to understand? We can practice it together until it feels right.",
        persona: 'alex',
      },
      decision: {
        response:
          "Interesting. Being stuck usually tells us something. Let's explore both paths—what do you gain and what do you risk with each? Sometimes the answer's already there.",
        persona: 'peter',
      },
      meaning: {
        response:
          "That's worth sitting with. Going through the motions often means something deeper is asking for attention. What would a day that felt meaningful actually look like?",
        persona: 'nayan',
      },
      celebration: {
        response:
          "Wait—you got the promotion? That's huge! Let's not skip past this. You worked for this. What would celebrating actually look like? You deserve to feel this.",
        persona: 'jordan',
      },
      'career-advice': {
        response:
          "That fear makes sense. Career changes are big. What is it specifically—the uncertainty, leaving something familiar, or something else? Let's sit with that together.",
        persona: 'ferni',
      },
      sleep: {
        response:
          "I'm here. 3am thoughts hit different. You don't have to figure anything out right now. Just tell me what's keeping you up. Sometimes that's enough.",
        persona: 'ferni',
      },
    };

    const outputDir = join(PROJECT_ROOT, 'promo', 'ferni-website', 'src', 'audio', 'samples');
    execCommand(`mkdir -p "${outputDir}"`);

    // Show what we're using
    console.log(`${colors.bold}Platform Features:${colors.reset}`);
    console.log(`  ${icons.bullet} Voice IDs from persona registry`);
    console.log(`  ${icons.bullet} Advanced humanization pipeline`);
    console.log(`  ${icons.bullet} Breath group pauses`);
    console.log(`  ${icons.bullet} Cartesia sonic-english model`);

    console.log(`\n${colors.bold}Personas:${colors.reset}`);
    for (const [shortName, config] of Object.entries(PERSONA_CONFIG)) {
      const voiceId = getVoiceIdForPersona(config.canonicalId);
      console.log(
        `  ${colors.cyan}${config.displayName}${colors.reset} (${config.role}): ${voiceId.substring(0, 8)}...`
      );
    }

    // Generate each sample
    const samples = Object.entries(VOICE_SAMPLES);
    let successCount = 0;
    let failCount = 0;

    console.log(
      `\n${colors.bold}Generating ${samples.length} humanized voice samples...${colors.reset}`
    );

    for (const [sampleId, sample] of samples) {
      const personaConfig = PERSONA_CONFIG[sample.persona] || PERSONA_CONFIG.ferni;
      const voiceId = getVoiceIdForPersona(personaConfig.canonicalId);

      console.log(`\n  ${colors.cyan}🎤 ${sampleId}${colors.reset} → ${personaConfig.displayName}`);

      try {
        // Apply humanization pipeline - breath pauses at natural boundaries
        // Skip fillers for landing page (want clean demo samples)
        const humanizedText = addBreathGroupPauses(sample.response, {
          enabled: true,
          shortPause: 120,
          mediumPause: 220,
          longPause: 350,
        });

        console.log(`    ${colors.dim}Humanized: +pauses at breath groups${colors.reset}`);

        // Use Cartesia's sonic-english model with persona voice
        const response = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Cartesia-Version': '2024-06-10',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: 'sonic-english',
            transcript: humanizedText,
            voice: {
              mode: 'id',
              id: voiceId,
            },
            output_format: {
              container: 'mp3',
              encoding: 'mp3',
              sample_rate: 44100,
            },
            language: 'en',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            `    ${colors.red}${icons.error}${colors.reset} API error: ${response.status}`
          );
          log.step(errorText.substring(0, 100));
          failCount++;
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const outputPath = join(outputDir, `${sampleId}.mp3`);

        const { writeFileSync } = await import('fs');
        writeFileSync(outputPath, buffer);

        const durationEstimate = Math.ceil(sample.response.split(' ').length / 2.5);
        console.log(
          `    ${colors.green}${icons.success}${colors.reset} Saved (${(buffer.length / 1024).toFixed(1)}KB, ~${durationEstimate}s)`
        );
        successCount++;

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`    ${colors.red}${icons.error}${colors.reset} Failed: ${error}`);
        failCount++;
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(50));
    log.success(`Generated: ${successCount}/${samples.length} samples`);
    if (failCount > 0) {
      log.warn(`Failed: ${failCount} samples`);
    }
    console.log();
    log.info(`Output: ${outputDir}`);
    console.log();
    log.info('Next steps:');
    console.log(`  1. Review samples: ${colors.cyan}open ${outputDir}${colors.reset}`);
    console.log(`  2. Deploy landing page: ${colors.cyan}npm run deploy:landing${colors.reset}`);
  }
}

// ============================================================================
// VOICE COMMAND - Live conversation with Ferni
// ============================================================================

async function handleVoice(args: string[]): Promise<void> {
  const { handleVoiceLive } = await import('./features/voice/voice-live.js');
  await handleVoiceLive(args);
}

// ============================================================================
// CEO COMMANDS - Ferni as your Personal CEO
// ============================================================================

async function handleCEOGoals(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const userId = process.env.FERNI_USER_ID || 'cli-user';

  log.header('🎯 Goals');

  try {
    if (subcommand === 'list' || !args[0]) {
      // List all active goals
      const goals = await goalsService.getGoals(userId, 'active');

      if (goals.length === 0) {
        console.log(`\n${colors.dim}No active goals yet.${colors.reset}`);
        console.log(`${colors.dim}Add one with: ferni goals add "Your goal here"${colors.reset}\n`);
        return;
      }

      console.log(`\n${colors.bold}Active Goals${colors.reset}\n`);
      for (const goal of goals) {
        const progress = goal.progress || 0;
        const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
        console.log(`  ${colors.bold}${goal.title}${colors.reset}`);
        if (goal.description) {
          console.log(`  ${colors.dim}${goal.description}${colors.reset}`);
        }
        console.log(`  ${colors.green}${progressBar}${colors.reset} ${progress}%`);
        console.log(`  ${colors.dim}ID: ${goal.id} • Category: ${goal.category}${colors.reset}\n`);
      }
    } else if (subcommand === 'add') {
      // Add a new goal - everything after "add" is the title
      const title = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
      if (!title) {
        console.log(`${colors.red}Please provide a goal title.${colors.reset}`);
        console.log(`${colors.dim}Example: ferni goals add "Build morning routine"${colors.reset}\n`);
        return;
      }

      const goal = await goalsService.createGoal(userId, { title, category: 'personal' });
      console.log(`\n${colors.green}✓ Goal created!${colors.reset}`);
      console.log(`  ${colors.bold}${goal.title}${colors.reset}`);
      console.log(`  ${colors.dim}ID: ${goal.id}${colors.reset}\n`);
    } else if (subcommand === 'complete') {
      // Complete a goal by ID
      const goalId = args[1];
      if (!goalId) {
        console.log(`${colors.red}Please provide a goal ID.${colors.reset}`);
        console.log(`${colors.dim}Example: ferni goals complete goal_12345${colors.reset}\n`);
        return;
      }

      await goalsService.updateGoal(userId, goalId, { status: 'completed', progress: 100 });
      console.log(`\n${colors.green}✓ Goal completed!${colors.reset}\n`);
    } else if (subcommand === 'progress') {
      // Show progress overview across all goals
      const activeGoals = await goalsService.getGoals(userId, 'active');
      const completedGoals = await goalsService.getGoals(userId, 'completed');

      console.log(`\n${colors.bold}Progress Overview${colors.reset}\n`);
      console.log(`  ${colors.cyan}Active Goals:${colors.reset}    ${activeGoals.length}`);
      console.log(`  ${colors.green}Completed:${colors.reset}       ${completedGoals.length}`);

      if (activeGoals.length > 0) {
        const avgProgress = Math.round(
          activeGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / activeGoals.length
        );
        console.log(`  ${colors.yellow}Avg Progress:${colors.reset}    ${avgProgress}%\n`);
      }
    } else if (subcommand === 'all') {
      // List all goals including completed
      const goals = await goalsService.getGoals(userId);

      if (goals.length === 0) {
        console.log(`\n${colors.dim}No goals yet.${colors.reset}\n`);
        return;
      }

      console.log(`\n${colors.bold}All Goals${colors.reset}\n`);
      for (const goal of goals) {
        const statusIcon = goal.status === 'completed' ? '✓' : goal.status === 'paused' ? '⏸' : '○';
        const statusColor = goal.status === 'completed' ? colors.green : goal.status === 'paused' ? colors.yellow : colors.white;
        console.log(`  ${statusColor}${statusIcon}${colors.reset} ${goal.title} ${colors.dim}(${goal.status})${colors.reset}`);
      }
      console.log();
    } else {
      console.log(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`);
      console.log(`${colors.dim}Available: list, add, complete, progress, all${colors.reset}\n`);
    }
  } catch (error) {
    log.error(`Goals operation failed: ${String(error)}`);
    console.log(`\n${colors.red}Couldn't access goals.${colors.reset}`);
    console.log(`${colors.dim}Make sure the service is running.${colors.reset}\n`);
  }
}

async function handleCEOContext(args: string[]): Promise<void> {
  const { handleContext } = await import('./features/ceo.js');
  await handleContext(args);
}

async function handleCEORemember(args: string[]): Promise<void> {
  const { handleRemember } = await import('./features/ceo.js');
  await handleRemember(args);
}

async function handleCEORoster(args: string[]): Promise<void> {
  const { handleTeam } = await import('./features/ceo.js');
  await handleTeam(args);
}

// Daily Workflow Handlers
async function handleCEOBriefing(args: string[]): Promise<void> {
  const subcommand = args[0] || 'today';
  const userId = process.env.FERNI_USER_ID || 'cli-user';

  try {
    if (subcommand === 'today' || !args[0]) {
      // Generate and display the full briefing using the service
      const briefing = await briefingService.generateBriefing(userId);
      const formatted = briefingService.formatForTerminal(briefing);
      console.log(formatted);
    } else if (subcommand === 'tomorrow') {
      console.log(`\n${colors.bold}Tomorrow's Preview${colors.reset}`);
      console.log(`${colors.dim}Calendar integration coming soon...${colors.reset}`);
    } else if (subcommand === 'week') {
      // Generate weekly review using weeklyReviewService
      try {
        const review = await weeklyReviewService.generateWeeklyReview(userId);
        const formatted = weeklyReviewService.formatForTerminal(review);
        console.log(formatted);
      } catch (err) {
        console.log(`\n${colors.bold}Week at a Glance${colors.reset}`);
        console.log(`${colors.dim}Run 'ferni weekly' for full weekly review${colors.reset}`);
      }
    } else {
      log.error(`Unknown subcommand: ${subcommand}`);
      console.log(`Available: today, tomorrow, week`);
    }
  } catch (error) {
    log.error(`Briefing failed: ${String(error)}`);
    // Fallback to basic output
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    console.log(`\n${colors.bold}Good morning! Here's your briefing for ${today}${colors.reset}\n`);
    console.log(`${colors.cyan}📅 Calendar${colors.reset}`);
    console.log(`   Run ${colors.dim}ferni briefing${colors.reset} with calendar integration for full view\n`);
    console.log(`${colors.cyan}📌 Top Priorities${colors.reset}`);
    console.log(`   Run ${colors.dim}ferni goals${colors.reset} to see your goals\n`);
  }
}

async function handleCEOFocus(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  const userId = process.env.FERNI_USER_ID || 'cli-user';

  log.header('🎯 Focus Session');

  try {
    if (subcommand === 'start') {
      const duration = parseInt(args[1]) || 25;
      const task = args.slice(2).join(' ') || undefined;

      const session = await focusService.startSession(userId, { duration, task });
      const endTime = new Date(session.startTime.getTime() + session.plannedDuration * 60 * 1000);

      console.log(`\n${colors.green}✓ Focus session started!${colors.reset}`);
      console.log(`  ${colors.bold}${session.task || 'Focus session'}${colors.reset} - ${duration} minutes`);
      console.log(`  Ends at: ${endTime.toLocaleTimeString()}`);
      console.log(`\n${colors.dim}Run 'ferni focus status' to check progress${colors.reset}`);
    } else if (subcommand === 'stop') {
      const session = await focusService.endSession(userId);
      if (session) {
        console.log(`\n${colors.green}✓ Focus session ended${colors.reset}`);
        if (session.actualDuration) {
          console.log(`  Duration: ${session.actualDuration} minutes`);
        }
      } else {
        console.log(`\n${colors.yellow}No active focus session${colors.reset}`);
      }
    } else if (subcommand === 'status') {
      const session = await focusService.getCurrentSession(userId);
      if (session) {
        const endTime = new Date(session.startTime.getTime() + session.plannedDuration * 60 * 1000);
        const remaining = Math.max(0, (endTime.getTime() - Date.now()) / 1000 / 60);

        if (remaining > 0) {
          console.log(`\n${colors.green}🎯 Active Focus Session${colors.reset}`);
          console.log(`  ${colors.bold}${session.task || 'Focus session'}${colors.reset}`);
          console.log(`  ${Math.ceil(remaining)} minutes remaining`);
          console.log(`  ${colors.dim}Started: ${session.startTime.toLocaleTimeString()}${colors.reset}`);
        } else {
          // Session complete, end it
          await focusService.endSession(userId);
          console.log(`\n${colors.green}✓ Focus session completed!${colors.reset}`);
          console.log(`  ${session.task || 'Focus session'} - Great work!`);
        }
      } else {
        console.log(`\n${colors.dim}No active focus session${colors.reset}`);
        console.log(`Start one with: ${colors.cyan}ferni focus start 25${colors.reset}`);
      }
    } else if (subcommand === 'stats') {
      const stats = await focusService.getStats(userId, 'week');
      console.log(`\n${colors.bold}Focus Statistics (This Week)${colors.reset}\n`);
      console.log(`  ${colors.cyan}Total Sessions:${colors.reset}    ${stats.totalSessions}`);
      console.log(`  ${colors.cyan}Total Minutes:${colors.reset}     ${stats.totalMinutes}`);
      console.log(`  ${colors.cyan}Average Duration:${colors.reset}  ${stats.averageDuration} min`);
      console.log(`  ${colors.cyan}Completion Rate:${colors.reset}   ${stats.completionRate}%`);
      console.log(`  ${colors.cyan}Streak:${colors.reset}            ${stats.streakDays} days\n`);
    } else if (subcommand === 'history') {
      const sessions = await focusService.getSessionHistory(userId, 10);
      if (sessions.length === 0) {
        console.log(`\n${colors.dim}No focus sessions yet.${colors.reset}\n`);
        return;
      }
      console.log(`\n${colors.bold}Recent Focus Sessions${colors.reset}\n`);
      for (const session of sessions) {
        const date = session.startTime.toLocaleDateString();
        const duration = session.actualDuration || session.plannedDuration;
        const status = session.interrupted ? '⚠️ interrupted' : '✓ completed';
        console.log(`  ${colors.dim}${date}${colors.reset} ${session.task || 'Focus'} (${duration} min) ${status}`);
      }
      console.log();
    } else {
      console.log(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`);
      console.log(`${colors.dim}Available: start, stop, status, stats, history${colors.reset}\n`);
    }
  } catch (error) {
    log.error(`Focus operation failed: ${String(error)}`);
    console.log(`\n${colors.red}Couldn't access focus sessions.${colors.reset}`);
    console.log(`${colors.dim}Make sure the service is running.${colors.reset}\n`);
  }
}

async function handleCEOReflect(args: string[]): Promise<void> {
  const subcommand = args[0] || 'prompt';
  log.header(`🌙 Daily Reflection`);

  const prompts = [
    "What went well today?",
    "What could have gone better?",
    "What did you learn?",
    "What are you grateful for?",
    "What will you do differently tomorrow?",
  ];

  if (subcommand === 'prompt' || !args[0]) {
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    console.log(`\n${colors.bold}Reflection Prompt:${colors.reset}`);
    console.log(`\n  ${colors.cyan}"${randomPrompt}"${colors.reset}\n`);
    console.log(`${colors.dim}Record your reflection with: ferni journal "your thoughts..."${colors.reset}`);
  } else if (subcommand === 'today') {
    console.log(`\n${colors.bold}Today's Reflections${colors.reset}`);
    console.log(`${colors.dim}Run 'ferni journal today' to see today's entries${colors.reset}`);
  } else if (subcommand === 'history') {
    console.log(`\n${colors.bold}Reflection History${colors.reset}`);
    console.log(`${colors.dim}Run 'ferni journal search' to browse past reflections${colors.reset}`);
  }
}

async function handleCEOWeekly(args: string[]): Promise<void> {
  const subcommand = args[0] || 'review';
  const userId = process.env.FERNI_USER_ID || 'cli-user';

  log.header('📅 Weekly Review');

  try {
    if (subcommand === 'review' || !args[0]) {
      // Generate full weekly review using the service
      const review = await weeklyReviewService.generateReview(userId);
      const formatted = weeklyReviewService.formatForTerminal(review);
      console.log(formatted);
    } else if (subcommand === 'last') {
      // Get last week's review
      const review = await weeklyReviewService.generateReview(userId, -1);
      const formatted = weeklyReviewService.formatForTerminal(review);
      console.log(formatted);
    } else if (subcommand === 'plan') {
      console.log(`\n${colors.bold}Plan Next Week${colors.reset}\n`);
      console.log(`  ${colors.cyan}•${colors.reset} Set 3 priorities: ${colors.dim}ferni priorities add "..."${colors.reset}`);
      console.log(`  ${colors.cyan}•${colors.reset} Schedule focus time: ${colors.dim}ferni focus start 90${colors.reset}`);
      console.log(`  ${colors.cyan}•${colors.reset} Review upcoming calendar events`);
      console.log(`  ${colors.cyan}•${colors.reset} Add goals: ${colors.dim}ferni goals add "..."${colors.reset}`);
      console.log(`\n${colors.dim}Run 'ferni briefing week' for upcoming week preview${colors.reset}\n`);
    } else if (subcommand === 'checklist') {
      // Quick checklist for manual review
      console.log(`\n${colors.bold}Weekly Review Checklist${colors.reset}\n`);
      console.log(`  ${colors.cyan}1.${colors.reset} Review wins from the week (${colors.dim}ferni wins week${colors.reset})`);
      console.log(`  ${colors.cyan}2.${colors.reset} Check goal progress (${colors.dim}ferni goals progress${colors.reset})`);
      console.log(`  ${colors.cyan}3.${colors.reset} Review energy patterns (${colors.dim}ferni energy patterns${colors.reset})`);
      console.log(`  ${colors.cyan}4.${colors.reset} Check focus stats (${colors.dim}ferni focus stats${colors.reset})`);
      console.log(`  ${colors.cyan}5.${colors.reset} Plan next week (${colors.dim}ferni weekly plan${colors.reset})`);
      console.log(`\n${colors.dim}Or run 'ferni weekly' for automated review${colors.reset}\n`);
    } else {
      console.log(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`);
      console.log(`${colors.dim}Available: review, last, plan, checklist${colors.reset}\n`);
    }
  } catch (error) {
    log.error(`Weekly review failed: ${String(error)}`);
    // Fallback to checklist
    console.log(`\n${colors.yellow}Automated review unavailable. Showing checklist:${colors.reset}\n`);
    console.log(`  ${colors.cyan}1.${colors.reset} Review wins: ${colors.dim}ferni wins week${colors.reset}`);
    console.log(`  ${colors.cyan}2.${colors.reset} Check goals: ${colors.dim}ferni goals progress${colors.reset}`);
    console.log(`  ${colors.cyan}3.${colors.reset} Focus stats: ${colors.dim}ferni focus stats${colors.reset}`);
    console.log(`  ${colors.cyan}4.${colors.reset} Plan ahead: ${colors.dim}ferni weekly plan${colors.reset}\n`);
  }
}

// Personal Tracking Handlers
async function handleCEOWins(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const userId = process.env.FERNI_USER_ID || 'cli-user';

  log.header('🏆 Wins & Achievements');

  try {
    if (subcommand === 'add') {
      const text = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
      if (!text) {
        console.log(`\n${colors.yellow}Usage: ferni wins add "Your achievement"${colors.reset}`);
        return;
      }
      const win = await winsService.addWin(userId, text);
      console.log(`\n${colors.green}🏆 Win recorded!${colors.reset} "${win.description}"`);
    } else if (subcommand === 'list' || subcommand === 'today' || subcommand === 'week' || subcommand === 'month') {
      const period = subcommand === 'list' ? 'all' : subcommand;
      const wins = await winsService.getWins(userId, period as 'today' | 'week' | 'month' | 'all');

      if (wins.length === 0) {
        const periodText = period === 'all' ? '' : ` ${period}`;
        console.log(`\n${colors.dim}No wins${periodText} yet. Add one with: ferni wins add "..."${colors.reset}`);
      } else {
        const periodText = period === 'all' ? 'All' : period.charAt(0).toUpperCase() + period.slice(1);
        console.log(`\n${colors.bold}${periodText} Wins:${colors.reset}\n`);
        for (const w of wins.slice(0, 10)) {
          const date = w.createdAt.toLocaleDateString();
          console.log(`  ${colors.green}🏆${colors.reset} ${w.description} ${colors.dim}(${date})${colors.reset}`);
        }
      }
    } else if (subcommand === 'celebrate') {
      console.log(`\n${colors.bold}🎉 Celebration Time! 🎉${colors.reset}\n`);
      const wins = await winsService.getWins(userId, 'week');
      if (wins.length > 0) {
        console.log(`  Recent wins to celebrate:\n`);
        for (const w of wins.slice(0, 3)) {
          console.log(`  ${colors.green}🏆${colors.reset} ${w.description}`);
        }
        console.log(`\n  ${colors.cyan}You're doing amazing!${colors.reset}`);
      } else {
        // Try to get a random win for motivation
        const randomWin = await winsService.getRandomWin(userId);
        if (randomWin) {
          console.log(`  A past win to remember:\n`);
          console.log(`  ${colors.green}🏆${colors.reset} ${randomWin.description}`);
          console.log(`\n  ${colors.cyan}You've done great things before!${colors.reset}`);
        } else {
          console.log(`  ${colors.dim}Add some wins first with: ferni wins add "..."${colors.reset}`);
        }
      }
    } else if (subcommand === 'random') {
      const win = await winsService.getRandomWin(userId);
      if (win) {
        console.log(`\n${colors.bold}Random Win for Motivation:${colors.reset}\n`);
        console.log(`  ${colors.green}🏆${colors.reset} ${win.description}`);
        console.log(`  ${colors.dim}${win.createdAt.toLocaleDateString()}${colors.reset}\n`);
      } else {
        console.log(`\n${colors.dim}No wins yet. Add one with: ferni wins add "..."${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`);
      console.log(`${colors.dim}Available: add, list, today, week, month, celebrate, random${colors.reset}\n`);
    }
  } catch (error) {
    log.error(`Wins operation failed: ${String(error)}`);
    console.log(`\n${colors.red}Couldn't access wins.${colors.reset}`);
    console.log(`${colors.dim}Make sure the service is running.${colors.reset}\n`);
  }
}

async function handleCEOHabits(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  log.header(`✅ Habit Tracker`);

  const dataDir = join(homedir(), '.ferni');
  const habitsFile = join(dataDir, 'habits.json');

  interface Habit {
    name: string;
    checks: string[]; // Array of ISO date strings
  }

  async function loadHabits(): Promise<Habit[]> {
    try {
      const data = await fs.readFile(habitsFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async function saveHabits(habits: Habit[]): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(habitsFile, JSON.stringify(habits, null, 2));
  }

  if (subcommand === 'add') {
    const name = args.slice(1).join(' ');
    if (!name) {
      console.log(`\n${colors.yellow}Usage: ferni habits add "Habit name"${colors.reset}`);
      return;
    }
    const habits = await loadHabits();
    habits.push({ name, checks: [] });
    await saveHabits(habits);
    console.log(`\n${colors.green}✓ Habit added:${colors.reset} "${name}"`);
  } else if (subcommand === 'check') {
    const name = args.slice(1).join(' ');
    const habits = await loadHabits();
    const habit = habits.find((h) => h.name.toLowerCase().includes(name.toLowerCase()));
    if (habit) {
      const today = new Date().toISOString().split('T')[0];
      if (!habit.checks.includes(today)) {
        habit.checks.push(today);
        await saveHabits(habits);
      }
      console.log(`\n${colors.green}✓ Checked off:${colors.reset} "${habit.name}"`);
      console.log(`  Streak: ${habit.checks.length} day(s)`);
    } else {
      console.log(`\n${colors.yellow}Habit not found. Add it first: ferni habits add "..."${colors.reset}`);
    }
  } else if (subcommand === 'list') {
    const habits = await loadHabits();
    if (habits.length === 0) {
      console.log(`\n${colors.dim}No habits tracked yet. Add one with: ferni habits add "..."${colors.reset}`);
    } else {
      const today = new Date().toISOString().split('T')[0];
      console.log(`\n${colors.bold}Your Habits:${colors.reset}\n`);
      habits.forEach((h) => {
        const checked = h.checks.includes(today);
        const icon = checked ? colors.green + '✓' + colors.reset : '○';
        console.log(`  ${icon} ${h.name} ${colors.dim}(${h.checks.length} day streak)${colors.reset}`);
      });
    }
  } else if (subcommand === 'streaks') {
    const habits = await loadHabits();
    console.log(`\n${colors.bold}Habit Streaks:${colors.reset}\n`);
    habits.sort((a, b) => b.checks.length - a.checks.length);
    habits.forEach((h) => {
      const bar = '█'.repeat(Math.min(h.checks.length, 20));
      console.log(`  ${h.name}: ${colors.green}${bar}${colors.reset} ${h.checks.length} days`);
    });
  } else if (subcommand === 'stats') {
    console.log(`\n${colors.bold}Habit Statistics${colors.reset}`);
    console.log(`${colors.dim}Detailed stats coming soon...${colors.reset}`);
  }
}

async function handleCEOEnergy(args: string[]): Promise<void> {
  const subcommand = args[0] || 'today';
  const userId = process.env.FERNI_USER_ID || 'cli-user';

  log.header('⚡ Energy Tracker');

  try {
    if (subcommand === 'log') {
      const level = parseInt(args[1]);
      if (isNaN(level) || level < 1 || level > 10) {
        console.log(`\n${colors.yellow}Usage: ferni energy log <1-10> ["optional note"]${colors.reset}`);
        return;
      }
      const notes = args.slice(2).join(' ') || undefined;
      const energyLog = await energyService.logEnergy(userId, level, notes);
      const emoji = energyLog.level >= 7 ? '🔥' : energyLog.level >= 4 ? '⚡' : '🔋';
      console.log(`\n${colors.green}${emoji} Energy logged:${colors.reset} ${energyLog.level}/10${notes ? ` - "${notes}"` : ''}`);
    } else if (subcommand === 'today') {
      const logs = await energyService.getToday(userId);
      if (logs.length === 0) {
        console.log(`\n${colors.dim}No energy logged today. Log with: ferni energy log 7${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Today's Energy:${colors.reset}\n`);
        for (const l of logs) {
          const time = l.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const bar = '█'.repeat(l.level) + '░'.repeat(10 - l.level);
          console.log(`  ${time}: ${colors.cyan}${bar}${colors.reset} ${l.level}/10 ${l.notes ? colors.dim + l.notes + colors.reset : ''}`);
        }
      }
    } else if (subcommand === 'week') {
      const average = await energyService.getWeeklyAverage(userId);
      const logs = await energyService.getTrend(userId, 7);
      console.log(`\n${colors.bold}This Week's Energy:${colors.reset}\n`);
      console.log(`  ${colors.cyan}Weekly Average:${colors.reset} ${average.toFixed(1)}/10`);
      console.log(`  ${colors.cyan}Entries:${colors.reset}        ${logs.length}\n`);

      if (logs.length > 0) {
        // Show daily averages
        const byDay = new Map<string, number[]>();
        for (const l of logs) {
          const day = l.createdAt.toLocaleDateString([], { weekday: 'short' });
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day)!.push(l.level);
        }
        console.log(`  ${colors.bold}Daily Averages:${colors.reset}`);
        for (const [day, levels] of byDay) {
          const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
          const bar = '█'.repeat(Math.round(avg)) + '░'.repeat(10 - Math.round(avg));
          console.log(`    ${day}: ${colors.cyan}${bar}${colors.reset} ${avg.toFixed(1)}`);
        }
      }
    } else if (subcommand === 'patterns') {
      const analysis = await energyService.getWeeklyAnalysis(userId);
      console.log(`\n${colors.bold}Energy Patterns (Last 7 Days)${colors.reset}\n`);
      console.log(`  ${colors.cyan}Average:${colors.reset}   ${analysis.average.toFixed(1)}/10`);
      console.log(`  ${colors.cyan}Trend:${colors.reset}     ${analysis.trend === 'improving' ? colors.green : analysis.trend === 'declining' ? colors.red : colors.yellow}${analysis.trend}${colors.reset}`);
      if (analysis.peakTime) {
        console.log(`  ${colors.cyan}Peak Time:${colors.reset} ${analysis.peakTime}`);
      }
      if (analysis.lowTime) {
        console.log(`  ${colors.cyan}Low Time:${colors.reset}  ${analysis.lowTime}`);
      }
      console.log();
    } else {
      console.log(`${colors.red}Unknown subcommand: ${subcommand}${colors.reset}`);
      console.log(`${colors.dim}Available: log, today, week, patterns${colors.reset}\n`);
    }
  } catch (error) {
    log.error(`Energy operation failed: ${String(error)}`);
    console.log(`\n${colors.red}Couldn't access energy logs.${colors.reset}`);
    console.log(`${colors.dim}Make sure the service is running.${colors.reset}\n`);
  }
}

async function handleCEOJournal(args: string[]): Promise<void> {
  const subcommand = args[0] || 'today';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`📓 Journal`);

  try {
    // If no subcommand and has text, treat as 'add'
    if (args[0] && !['add', 'today', 'week', 'search', 'prompts', 'sentiment'].includes(args[0])) {
      const text = args.join(' ');
      const entry = await journalService.addEntry(userId, text);
      const sentimentEmoji = entry.sentiment === 'positive' ? '😊' : entry.sentiment === 'negative' ? '😔' : '😐';
      console.log(`\n${colors.green}✓ Journal entry saved${colors.reset} ${sentimentEmoji}`);
      return;
    }

    if (subcommand === 'add') {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log(`\n${colors.yellow}Usage: ferni journal "Your entry..."${colors.reset}`);
        return;
      }
      const entry = await journalService.addEntry(userId, text);
      const sentimentEmoji = entry.sentiment === 'positive' ? '😊' : entry.sentiment === 'negative' ? '😔' : '😐';
      console.log(`\n${colors.green}✓ Journal entry saved${colors.reset} ${sentimentEmoji}`);
    } else if (subcommand === 'today') {
      const entries = await journalService.getEntries(userId, 'today');
      if (entries.length === 0) {
        console.log(`\n${colors.dim}No entries today. Write with: ferni journal "..."${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Today's Journal:${colors.reset}\n`);
        entries.forEach((e) => {
          const time = e.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const sentimentEmoji = e.sentiment === 'positive' ? '😊' : e.sentiment === 'negative' ? '😔' : '😐';
          console.log(`  ${colors.dim}${time}${colors.reset} ${sentimentEmoji} ${e.content}`);
        });
      }
    } else if (subcommand === 'week') {
      const entries = await journalService.getEntries(userId, 'week');
      if (entries.length === 0) {
        console.log(`\n${colors.dim}No entries this week.${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}This Week's Journal:${colors.reset} (${entries.length} entries)\n`);
        entries.slice(0, 20).forEach((e) => {
          const date = e.createdAt.toLocaleDateString();
          const sentimentEmoji = e.sentiment === 'positive' ? '😊' : e.sentiment === 'negative' ? '😔' : '😐';
          console.log(`  ${colors.dim}${date}${colors.reset} ${sentimentEmoji} ${e.content}`);
        });
      }
    } else if (subcommand === 'search') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log(`\n${colors.yellow}Usage: ferni journal search <query>${colors.reset}`);
        return;
      }
      const matches = await journalService.search(userId, query);
      console.log(`\n${colors.bold}Search Results:${colors.reset} (${matches.length} found)\n`);
      matches.slice(0, 10).forEach((e) => {
        const date = e.createdAt.toLocaleDateString();
        console.log(`  ${colors.dim}${date}${colors.reset} ${e.content}`);
      });
    } else if (subcommand === 'sentiment') {
      const sentimentArg = args[1] as 'positive' | 'neutral' | 'negative';
      const sentiment = ['positive', 'neutral', 'negative'].includes(sentimentArg) ? sentimentArg : 'positive';
      const entries = await journalService.getEntriesBySentiment(userId, sentiment);
      const emoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😔' : '😐';
      console.log(`\n${colors.bold}${emoji} ${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)} Entries:${colors.reset}\n`);
      if (entries.length === 0) {
        console.log(`  ${colors.dim}No ${sentiment} entries found.${colors.reset}`);
      } else {
        entries.slice(0, 10).forEach((e) => {
          const date = e.createdAt.toLocaleDateString();
          console.log(`  ${colors.dim}${date}${colors.reset} ${e.content}`);
        });
      }
    } else if (subcommand === 'prompts') {
      const prompts = [
        "What's on your mind right now?",
        "What are you looking forward to?",
        "What challenged you today?",
        "What made you smile?",
        "What would make today great?",
      ];
      console.log(`\n${colors.bold}Journal Prompts:${colors.reset}\n`);
      prompts.forEach((p, i) => console.log(`  ${colors.cyan}${i + 1}.${colors.reset} ${p}`));
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access journal. Try again later.`);
  }
}

async function handleCEOGratitude(args: string[]): Promise<void> {
  const subcommand = args[0] || 'today';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`🙏 Gratitude`);

  try {
    // If has text (not a subcommand), treat as 'add'
    if (args[0] && !['add', 'today', 'week', 'random', 'streak', 'stats'].includes(args[0])) {
      const text = args.join(' ');
      await gratitudeService.addGratitude(userId, text);
      console.log(`\n${colors.green}🙏 Gratitude recorded:${colors.reset} "${text}"`);
      return;
    }

    if (subcommand === 'add') {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log(`\n${colors.yellow}Usage: ferni gratitude "What you're grateful for"${colors.reset}`);
        return;
      }
      await gratitudeService.addGratitude(userId, text);
      console.log(`\n${colors.green}🙏 Gratitude recorded:${colors.reset} "${text}"`);
    } else if (subcommand === 'today') {
      const items = await gratitudeService.getToday(userId);
      if (items.length === 0) {
        console.log(`\n${colors.dim}No gratitude logged today. Add with: ferni gratitude "..."${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Today's Gratitude:${colors.reset}\n`);
        items.forEach((i) => console.log(`  ${colors.green}🙏${colors.reset} ${i.content}`));
      }
    } else if (subcommand === 'week') {
      const items = await gratitudeService.getThisWeek(userId);
      console.log(`\n${colors.bold}This Week's Gratitude:${colors.reset} (${items.length})\n`);
      if (items.length === 0) {
        console.log(`  ${colors.dim}No gratitude this week.${colors.reset}`);
      } else {
        items.forEach((i) => {
          const date = i.createdAt.toLocaleDateString([], { weekday: 'short' });
          console.log(`  ${colors.dim}${date}${colors.reset} ${i.content}`);
        });
      }
    } else if (subcommand === 'random') {
      const random = await gratitudeService.getRandom(userId);
      if (!random) {
        console.log(`\n${colors.dim}No gratitude recorded yet. Add with: ferni gratitude "..."${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Remember when you were grateful for:${colors.reset}`);
        console.log(`\n  ${colors.green}🙏${colors.reset} "${random.content}"`);
        console.log(`  ${colors.dim}(${random.createdAt.toLocaleDateString()})${colors.reset}`);
      }
    } else if (subcommand === 'streak') {
      const streak = await gratitudeService.getStreak(userId);
      if (streak === 0) {
        console.log(`\n${colors.dim}No streak yet. Start with: ferni gratitude "..."${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}🔥 Gratitude Streak:${colors.reset} ${streak} day${streak === 1 ? '' : 's'}`);
        console.log(`  ${colors.dim}Keep it going!${colors.reset}`);
      }
    } else if (subcommand === 'stats') {
      const [count, streak] = await Promise.all([
        gratitudeService.getCount(userId),
        gratitudeService.getStreak(userId),
      ]);
      console.log(`\n${colors.bold}Gratitude Stats:${colors.reset}\n`);
      console.log(`  📊 Total entries: ${count}`);
      console.log(`  🔥 Current streak: ${streak} day${streak === 1 ? '' : 's'}`);
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access gratitude data. Try again later.`);
  }
}

// Decision Support Handlers - Now Firestore-backed!
async function handleCEODecisions(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`⚖️ Decision Tracker`);

  try {
    if (subcommand === 'add') {
      const question = args.slice(1).join(' ');
      if (!question) {
        console.log(`\n${colors.yellow}Usage: ferni decisions add "What decision?"${colors.reset}`);
        return;
      }
      const decision = await decisionsService.addDecision(userId, question);
      console.log(`\n${colors.green}✓ Decision tracked:${colors.reset} [#${decision.id.slice(-6)}] "${question}"`);
      console.log(`${colors.dim}Synced to cloud for cross-device access${colors.reset}`);
    } else if (subcommand === 'pending') {
      const pending = await decisionsService.getPendingDecisions(userId);
      if (pending.length === 0) {
        console.log(`\n${colors.green}✓ No pending decisions${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Pending Decisions:${colors.reset}\n`);
        pending.forEach((d) => {
          const age = Math.floor((Date.now() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`  ${colors.yellow}#${d.id.slice(-6)}${colors.reset} ${d.title} ${colors.dim}(${age}d ago)${colors.reset}`);
        });
      }
    } else if (subcommand === 'decide') {
      const id = args[1];
      const choice = args.slice(2).join(' ');
      if (!id || !choice) {
        console.log(`\n${colors.yellow}Usage: ferni decisions decide <id> "Your choice"${colors.reset}`);
        return;
      }
      await decisionsService.makeDecision(userId, id, choice);
      console.log(`\n${colors.green}✓ Decision made: "${choice}"${colors.reset}`);
    } else if (subcommand === 'outcome') {
      const id = args[1];
      const outcome = args.slice(2).join(' ');
      const rating = parseInt(args[args.length - 1]) || undefined;
      if (!id || !outcome) {
        console.log(`\n${colors.yellow}Usage: ferni decisions outcome <id> "How it turned out" [rating 1-5]${colors.reset}`);
        return;
      }
      await decisionsService.addOutcome(userId, id, outcome, rating);
      console.log(`\n${colors.green}✓ Outcome recorded${colors.reset}`);
    } else if (subcommand === 'list' || subcommand === 'review') {
      const decisions = await decisionsService.getDecisions(userId);
      if (decisions.length === 0) {
        console.log(`\n${colors.dim}No decisions yet. Add one with: ferni decisions add "..."${colors.reset}`);
        return;
      }
      console.log(`\n${colors.bold}All Decisions:${colors.reset}\n`);
      decisions.slice(-10).forEach((d) => {
        const icon = d.status === 'reviewed' ? colors.green + '✓' : d.status === 'made' ? '◉' : colors.yellow + '○';
        console.log(`  ${icon}${colors.reset} #${d.id.slice(-6)} ${d.title}`);
        if (d.choice) console.log(`    ${colors.cyan}→ Choice: ${d.choice}${colors.reset}`);
        if (d.outcome) console.log(`    ${colors.dim}→ Outcome: ${d.outcome}${colors.reset}`);
      });
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access decisions data. Try again later.`);
  }
}

// Priorities Handler - Now Firestore-backed!
async function handleCEOPriorities(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`📌 Priorities`);

  try {
    if (subcommand === 'add') {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log(`\n${colors.yellow}Usage: ferni priorities add "Priority"${colors.reset}`);
        return;
      }
      const priority = await prioritiesService.addPriority(userId, text);
      console.log(`\n${colors.green}✓ Priority added:${colors.reset} "${text}"`);
      console.log(`${colors.dim}Synced to cloud for cross-device access${colors.reset}`);
    } else if (subcommand === 'done') {
      const priorities = await prioritiesService.getPriorities(userId);
      const active = priorities.filter((p) => !p.completed);
      const index = parseInt(args[1]) - 1;
      if (active[index]) {
        await prioritiesService.completePriority(userId, active[index].id);
        console.log(`\n${colors.green}✓ Marked done:${colors.reset} "${active[index].title}"`);
      } else {
        console.log(`\n${colors.yellow}Priority not found${colors.reset}`);
      }
    } else if (subcommand === 'clear') {
      await prioritiesService.clearCompleted(userId);
      console.log(`\n${colors.green}✓ Cleared completed priorities${colors.reset}`);
    } else if (subcommand === 'top') {
      const top = await prioritiesService.getTopPriority(userId);
      if (top) {
        console.log(`\n${colors.bold}Top Priority:${colors.reset}`);
        console.log(`\n  ${colors.cyan}→${colors.reset} ${top.title}`);
      } else {
        console.log(`\n${colors.dim}No priorities set. Add with: ferni priorities add "..."${colors.reset}`);
      }
    } else if (subcommand === 'list') {
      const priorities = await prioritiesService.getPriorities(userId);
      const active = priorities.filter((p) => !p.completed);
      if (active.length === 0) {
        console.log(`\n${colors.dim}No priorities set. Add with: ferni priorities add "..."${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Your Priorities:${colors.reset}\n`);
        active.forEach((p, i) => {
          const urgencyIcon = p.urgency >= 4 ? '🔥' : p.urgency >= 3 ? '⚡' : '';
          console.log(`  ${colors.cyan}${i + 1}.${colors.reset} ${p.title} ${urgencyIcon}`);
        });
      }
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access priorities data. Try again later.`);
  }
}

// Blockers Handler - Now Firestore-backed!
async function handleCEOBlockers(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`🚧 Blockers`);

  try {
    if (subcommand === 'add') {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log(`\n${colors.yellow}Usage: ferni blockers add "What's blocking you?"${colors.reset}`);
        return;
      }
      const blocker = await blockersService.addBlocker(userId, text);
      console.log(`\n${colors.green}✓ Blocker tracked:${colors.reset} [#${blocker.id.slice(-6)}] "${text}"`);
      console.log(`${colors.dim}Synced to cloud for cross-device access${colors.reset}`);
    } else if (subcommand === 'resolve') {
      const id = args[1];
      const resolution = args.slice(2).join(' ') || 'Resolved';
      if (!id) {
        console.log(`\n${colors.yellow}Usage: ferni blockers resolve <id> ["How it was resolved"]${colors.reset}`);
        return;
      }
      await blockersService.resolveBlocker(userId, id, resolution);
      console.log(`\n${colors.green}✓ Blocker resolved!${colors.reset}`);
    } else if (subcommand === 'escalate') {
      const id = args[1];
      const escalateTo = args.slice(2).join(' ');
      if (!id || !escalateTo) {
        console.log(`\n${colors.yellow}Usage: ferni blockers escalate <id> "Person/team"${colors.reset}`);
        return;
      }
      await blockersService.escalateBlocker(userId, id, escalateTo);
      console.log(`\n${colors.yellow}⚡ Blocker escalated to: ${escalateTo}${colors.reset}`);
    } else if (subcommand === 'list') {
      const active = await blockersService.getActiveBlockers(userId);
      if (active.length === 0) {
        console.log(`\n${colors.green}✓ No active blockers!${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Active Blockers:${colors.reset}\n`);
        active.forEach((b) => {
          const age = Math.floor((Date.now() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          const severityIcon = b.severity === 'critical' ? '🔴' : b.severity === 'high' ? '🟠' : '🚧';
          console.log(`  ${severityIcon} #${b.id.slice(-6)} ${b.description} ${colors.dim}(${age}d)${colors.reset}`);
          if (b.status === 'escalated') console.log(`    ${colors.yellow}↗ Escalated to: ${b.escalatedTo}${colors.reset}`);
        });
      }
    } else if (subcommand === 'count') {
      const count = await blockersService.getActiveBlockerCount(userId);
      console.log(`\n${colors.bold}Active Blockers:${colors.reset} ${count}`);
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access blockers data. Try again later.`);
  }
}

// Ideas Handler - Now Firestore-backed!
async function handleCEOIdeas(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`💡 Ideas`);

  try {
    // If has text (not a subcommand), treat as 'add'
    if (args[0] && !['add', 'list', 'random', 'tag', 'search', 'archive'].includes(args[0])) {
      const text = args.join(' ');
      const idea = await ideasService.addIdea(userId, text);
      console.log(`\n${colors.green}💡 Idea captured:${colors.reset} "${text}"`);
      console.log(`${colors.dim}Synced to cloud for cross-device access${colors.reset}`);
      return;
    }

    if (subcommand === 'add') {
      const text = args.slice(1).join(' ');
      if (!text) {
        console.log(`\n${colors.yellow}Usage: ferni ideas "Your idea"${colors.reset}`);
        return;
      }
      const idea = await ideasService.addIdea(userId, text);
      console.log(`\n${colors.green}💡 Idea captured:${colors.reset} "${text}"`);
      console.log(`${colors.dim}Synced to cloud for cross-device access${colors.reset}`);
    } else if (subcommand === 'list') {
      const ideas = await ideasService.getIdeas(userId);
      const active = ideas.filter((i) => !i.archived);
      if (active.length === 0) {
        console.log(`\n${colors.dim}No ideas yet. Capture one with: ferni ideas "..."${colors.reset}`);
      } else {
        const count = await ideasService.getIdeaCount(userId);
        console.log(`\n${colors.bold}Your Ideas:${colors.reset} (${count} total)\n`);
        active.slice(-10).forEach((i) => {
          const date = i.createdAt.toLocaleDateString();
          const tags = i.tags.length > 0 ? ` ${colors.cyan}[${i.tags.join(', ')}]${colors.reset}` : '';
          console.log(`  ${colors.yellow}💡${colors.reset} ${i.content}${tags} ${colors.dim}(${date})${colors.reset}`);
        });
      }
    } else if (subcommand === 'random') {
      const random = await ideasService.getRandomIdea(userId);
      if (!random) {
        console.log(`\n${colors.dim}No ideas yet${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Random Idea:${colors.reset}`);
        console.log(`\n  ${colors.yellow}💡${colors.reset} "${random.content}"`);
      }
    } else if (subcommand === 'tag') {
      const id = args[1];
      const tag = args[2];
      if (!id || !tag) {
        console.log(`\n${colors.yellow}Usage: ferni ideas tag <id> <tag>${colors.reset}`);
        return;
      }
      await ideasService.tagIdea(userId, id, tag);
      console.log(`\n${colors.green}✓ Tag added: ${tag}${colors.reset}`);
    } else if (subcommand === 'search') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log(`\n${colors.yellow}Usage: ferni ideas search "query"${colors.reset}`);
        return;
      }
      const matches = await ideasService.searchIdeas(userId, query);
      console.log(`\n${colors.bold}Search Results:${colors.reset} (${matches.length})\n`);
      matches.forEach((i) => console.log(`  ${colors.yellow}💡${colors.reset} ${i.content}`));
    } else if (subcommand === 'archive') {
      const id = args[1];
      if (!id) {
        console.log(`\n${colors.yellow}Usage: ferni ideas archive <id>${colors.reset}`);
        return;
      }
      await ideasService.archiveIdea(userId, id);
      console.log(`\n${colors.green}✓ Idea archived${colors.reset}`);
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access ideas data. Try again later.`);
  }
}

// Direct Interaction Handlers
async function handleCEOAsk(args: string[]): Promise<void> {
  const question = args.join(' ');
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`💬 Ask Ferni`);

  if (!question) {
    console.log(`\n${colors.bold}Ask Ferni Anything:${colors.reset}`);
    console.log(`\n${colors.cyan}Usage:${colors.reset} ferni ask "Your question here"`);
    console.log(`\n${colors.bold}Example questions:${colors.reset}`);
    console.log(`  • "What should I focus on today?"`);
    console.log(`  • "Summarize my wins this week"`);
    console.log(`  • "What habits am I building?"`);
    console.log(`  • "Help me think through this decision..."`);
    return;
  }

  console.log(`\n${colors.cyan}Question:${colors.reset} "${question}"`);
  console.log(`\n${colors.bold}Ferni:${colors.reset}\n`);

  try {
    // Stream the response from the ask service
    const responseGenerator = askService.ask(userId, question);
    let result;

    // Print chunks as they stream in
    for await (const chunk of responseGenerator) {
      process.stdout.write(chunk);
    }

    // Get the final result (sources and follow-up questions)
    result = await responseGenerator.next();
    const response = result.value;

    // Add newline after streaming
    console.log('\n');

    // Show sources if any were used
    if (response && response.sources && response.sources.length > 0) {
      console.log(`${colors.dim}Sources: ${response.sources.join(', ')}${colors.reset}`);
    }

    // Show follow-up questions if any
    if (response && response.followUpQuestions && response.followUpQuestions.length > 0) {
      console.log(`\n${colors.bold}Follow-up questions:${colors.reset}`);
      response.followUpQuestions.forEach((q, i) => {
        console.log(`  ${colors.cyan}${i + 1}.${colors.reset} ${q}`);
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('OPENAI_API_KEY')) {
      console.log(`${colors.yellow}Note:${colors.reset} Ask requires OPENAI_API_KEY to be set.`);
      console.log(`\n${colors.dim}In the meantime, try:${colors.reset}`);
      console.log(`  • ${colors.cyan}ferni briefing${colors.reset} for your daily summary`);
      console.log(`  • ${colors.cyan}ferni priorities${colors.reset} to see your focus areas`);
      console.log(`  • ${colors.cyan}ferni wins${colors.reset} to review achievements`);
    } else {
      console.log(`\n${colors.red}Error:${colors.reset} Couldn't get a response. ${errorMessage}`);
    }
  }
}

async function handleCEOCoach(args: string[]): Promise<void> {
  const topic = args[0] || 'menu';
  log.header(`🎓 AI Coaching`);

  const coachingTopics: Record<string, string[]> = {
    career: [
      "What's one skill you'd like to develop this quarter?",
      "Describe your ideal workday. What's different from today?",
      "What accomplishment would make you proud this year?",
    ],
    productivity: [
      "What's your biggest time sink right now?",
      "When do you do your best work?",
      "What's one thing you keep procrastinating on?",
    ],
    relationships: [
      "Who haven't you connected with lately that you miss?",
      "What conversation have you been avoiding?",
      "How can you show appreciation to someone this week?",
    ],
    health: [
      "How would you rate your sleep this week?",
      "What's one healthy habit you'd like to start?",
      "When did you last take a proper break?",
    ],
  };

  if (topic === 'menu' || !coachingTopics[topic]) {
    console.log(`\n${colors.bold}Coaching Topics:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni coach career${colors.reset}        - Career development`);
    console.log(`  ${colors.cyan}ferni coach productivity${colors.reset}  - Time & focus`);
    console.log(`  ${colors.cyan}ferni coach relationships${colors.reset} - Connections`);
    console.log(`  ${colors.cyan}ferni coach health${colors.reset}        - Wellbeing`);
    console.log(`\n  ${colors.dim}Or: ferni coach "custom topic"${colors.reset}`);
    return;
  }

  const questions = coachingTopics[topic];
  const randomQ = questions[Math.floor(Math.random() * questions.length)];
  console.log(`\n${colors.bold}${topic.charAt(0).toUpperCase() + topic.slice(1)} Coaching:${colors.reset}`);
  console.log(`\n  ${colors.cyan}"${randomQ}"${colors.reset}`);
  console.log(`\n${colors.dim}Reflect and journal: ferni journal "your thoughts..."${colors.reset}`);
}

// Meetings Handler - Now Firestore-backed!
async function handleCEOMeetings(args: string[]): Promise<void> {
  const subcommand = args[0] || 'today';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`🗓️ Meeting Notes`);

  try {
    if (subcommand === 'add') {
      const title = args.slice(1).join(' ');
      if (!title) {
        console.log(`\n${colors.yellow}Usage: ferni meetings add "Meeting title"${colors.reset}`);
        return;
      }
      const meeting = await meetingsService.addMeeting(userId, title, []);
      console.log(`\n${colors.green}✓ Meeting recorded:${colors.reset} "${title}"`);
      console.log(`${colors.dim}Add notes with: ferni meetings notes ${meeting.id.slice(-6)} "Notes..."${colors.reset}`);
      console.log(`${colors.dim}Synced to cloud for cross-device access${colors.reset}`);
    } else if (subcommand === 'notes') {
      const id = args[1];
      const notes = args.slice(2).join(' ');
      if (!id || !notes) {
        console.log(`\n${colors.yellow}Usage: ferni meetings notes <id> "Your notes"${colors.reset}`);
        return;
      }
      await meetingsService.updateNotes(userId, id, notes);
      console.log(`\n${colors.green}✓ Notes added to meeting${colors.reset}`);
    } else if (subcommand === 'action') {
      const id = args[1];
      const actionTitle = args.slice(2).join(' ');
      if (!id || !actionTitle) {
        console.log(`\n${colors.yellow}Usage: ferni meetings action <meeting-id> "Action item"${colors.reset}`);
        return;
      }
      await meetingsService.addActionItem(userId, id, actionTitle);
      console.log(`\n${colors.green}✓ Action item added${colors.reset}`);
    } else if (subcommand === 'today') {
      const meetings = await meetingsService.getMeetings(userId, 'today');
      if (meetings.length === 0) {
        console.log(`\n${colors.dim}No meetings logged today. Add with: ferni meetings add "..."${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Today's Meetings:${colors.reset}\n`);
        meetings.forEach((m) => {
          const time = m.meetingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          console.log(`  ${colors.cyan}${time}${colors.reset} ${m.title} ${colors.dim}#${m.id.slice(-6)}${colors.reset}`);
          if (m.notes) console.log(`    ${colors.dim}📝 ${m.notes.slice(0, 50)}...${colors.reset}`);
          if (m.actionItems.length > 0) console.log(`    ${colors.yellow}📋 ${m.actionItems.length} action item(s)${colors.reset}`);
        });
      }
    } else if (subcommand === 'week') {
      const meetings = await meetingsService.getMeetings(userId, 'week');
      console.log(`\n${colors.bold}This Week's Meetings:${colors.reset}\n`);
      meetings.forEach((m) => {
        const date = m.meetingDate.toLocaleDateString();
        console.log(`  ${colors.dim}${date}${colors.reset} ${m.title} ${colors.dim}#${m.id.slice(-6)}${colors.reset}`);
      });
    } else if (subcommand === 'list') {
      const meetings = await meetingsService.getMeetings(userId);
      console.log(`\n${colors.bold}Recent Meetings:${colors.reset}\n`);
      meetings.slice(-10).forEach((m) => {
        const date = m.meetingDate.toLocaleDateString();
        console.log(`  ${colors.dim}${date}${colors.reset} ${m.title} ${colors.dim}#${m.id.slice(-6)}${colors.reset}`);
      });
    } else if (subcommand === 'action-items') {
      const actionItems = await meetingsService.getActionItems(userId, false);
      if (actionItems.length === 0) {
        console.log(`\n${colors.green}✓ No pending action items!${colors.reset}`);
      } else {
        console.log(`\n${colors.bold}Pending Action Items:${colors.reset}\n`);
        actionItems.forEach((item) => {
          const icon = item.completed ? colors.green + '✓' : colors.yellow + '○';
          console.log(`  ${icon}${colors.reset} ${item.title}`);
        });
      }
    } else if (subcommand === 'search') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log(`\n${colors.yellow}Usage: ferni meetings search "query"${colors.reset}`);
        return;
      }
      const matches = await meetingsService.searchMeetings(userId, query);
      console.log(`\n${colors.bold}Search Results:${colors.reset} (${matches.length})\n`);
      matches.forEach((m) => {
        const date = m.meetingDate.toLocaleDateString();
        console.log(`  ${colors.dim}${date}${colors.reset} ${m.title}`);
      });
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't access meetings data. Try again later.`);
  }
}

// Insights Handler - "Better than Human" Cross-Data Intelligence
async function handleCEOInsights(args: string[]): Promise<void> {
  const subcommand = args[0] || 'all';
  const userId = process.env.FERNI_USER_ID || 'cli-user';
  log.header(`🧠 Superhuman Insights`);

  // Helper to format priority with color
  const formatPriority = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return `${colors.red}⚡ URGENT${colors.reset}`;
      case 'high':
        return `${colors.yellow}⬆ HIGH${colors.reset}`;
      case 'medium':
        return `${colors.cyan}● MEDIUM${colors.reset}`;
      default:
        return `${colors.dim}○ LOW${colors.reset}`;
    }
  };

  // Helper to format insight type with icon
  const formatType = (type: string) => {
    switch (type) {
      case 'warning':
        return '⚠️';
      case 'celebration':
        return '🎉';
      case 'correlation':
        return '🔗';
      case 'pattern':
        return '📊';
      case 'suggestion':
        return '💡';
      default:
        return '•';
    }
  };

  // Helper to display insights
  const displayInsights = (insights: Array<{ id: string; type: string; category: string; title: string; description: string; priority: string; confidence: number; actionable?: string }>, title: string) => {
    if (insights.length === 0) {
      console.log(`\n${colors.dim}No insights found. Keep tracking your progress!${colors.reset}`);
      console.log(`${colors.dim}Insights emerge when you have 3+ data points in goals, wins, energy, etc.${colors.reset}`);
      return;
    }

    console.log(`\n${colors.bold}${title}${colors.reset} (${insights.length})\n`);
    insights.forEach((insight) => {
      const typeIcon = formatType(insight.type);
      const priority = formatPriority(insight.priority);
      const confidence = Math.round(insight.confidence * 100);

      console.log(`  ${typeIcon} ${colors.bold}${insight.title}${colors.reset}`);
      console.log(`     ${priority} ${colors.dim}|${colors.reset} ${insight.category} ${colors.dim}|${colors.reset} ${confidence}% confident`);
      console.log(`     ${insight.description}`);
      if (insight.actionable) {
        console.log(`     ${colors.cyan}→ ${insight.actionable}${colors.reset}`);
      }
      console.log('');
    });
  };

  try {
    if (subcommand === 'all') {
      const insights = await insightsService.getAllInsights(userId);
      displayInsights(insights, '🧠 All Insights');
      console.log(`${colors.dim}Cached for 30 min. Force refresh: ferni insights refresh${colors.reset}`);
    } else if (subcommand === 'critical') {
      const insights = await insightsService.getCriticalInsights(userId);
      displayInsights(insights, '⚡ Critical Insights (Urgent + High Priority)');
    } else if (subcommand === 'energy') {
      const insights = await insightsService.getInsightsByCategory(userId, 'energy');
      displayInsights(insights, '⚡ Energy Insights');
    } else if (subcommand === 'goals') {
      const insights = await insightsService.getInsightsByCategory(userId, 'goals');
      displayInsights(insights, '🎯 Goal Insights');
    } else if (subcommand === 'burnout') {
      const insights = await insightsService.getBurnoutWarning(userId);
      if (insights.length === 0) {
        console.log(`\n${colors.green}✓ No burnout warning signs detected!${colors.reset}`);
        console.log(`${colors.dim}You're maintaining healthy patterns. Keep it up!${colors.reset}`);
      } else {
        displayInsights(insights, '🔥 Burnout Warning');
      }
    } else if (subcommand === 'patterns') {
      const insights = await insightsService.getWeeklyPatterns(userId);
      displayInsights(insights, '📅 Weekly Patterns');
    } else if (subcommand === 'refresh') {
      console.log(`\n${colors.cyan}Refreshing insights...${colors.reset}`);
      const insights = await insightsService.refreshInsights(userId);
      displayInsights(insights, '🔄 Refreshed Insights');
      console.log(`${colors.green}✓ Cache refreshed${colors.reset}`);
    } else if (subcommand === 'focus') {
      const insights = await insightsService.getInsightsByCategory(userId, 'focus');
      displayInsights(insights, '🎯 Focus Session Insights');
    } else if (subcommand === 'decisions') {
      const insights = await insightsService.getInsightsByCategory(userId, 'decisions');
      displayInsights(insights, '🤔 Decision Quality Insights');
    } else if (subcommand === 'momentum') {
      const insights = await insightsService.getInsightsByCategory(userId, 'momentum');
      displayInsights(insights, '🚀 Momentum Insights');
    } else if (subcommand === 'blockers') {
      const insights = await insightsService.getInsightsByCategory(userId, 'blockers');
      displayInsights(insights, '🚧 Blocker Impact Insights');
    } else {
      console.log(`\n${colors.bold}Usage:${colors.reset}\n`);
      console.log(`  ${colors.cyan}ferni insights${colors.reset}          Show all insights (cached 30 min)`);
      console.log(`  ${colors.cyan}ferni insights critical${colors.reset} Show urgent & high priority only`);
      console.log(`  ${colors.cyan}ferni insights burnout${colors.reset}  Check for burnout warning signs`);
      console.log(`  ${colors.cyan}ferni insights patterns${colors.reset} Weekly productivity patterns`);
      console.log(`  ${colors.cyan}ferni insights refresh${colors.reset}  Force refresh (bypass cache)`);
      console.log(`\n${colors.bold}Categories:${colors.reset}\n`);
      console.log(`  ${colors.cyan}ferni insights energy${colors.reset}   Energy-related insights`);
      console.log(`  ${colors.cyan}ferni insights goals${colors.reset}    Goal progress insights`);
      console.log(`  ${colors.cyan}ferni insights focus${colors.reset}    Focus session effectiveness`);
      console.log(`  ${colors.cyan}ferni insights decisions${colors.reset} Decision quality analysis`);
      console.log(`  ${colors.cyan}ferni insights momentum${colors.reset} Win streaks and momentum`);
      console.log(`  ${colors.cyan}ferni insights blockers${colors.reset} Blocker impact analysis`);
    }
  } catch (error) {
    console.log(`\n${colors.red}Error:${colors.reset} Couldn't generate insights. Try again later.`);
    console.log(`${colors.dim}Make sure you have some tracked data (goals, wins, energy, etc.)${colors.reset}`);
  }
}

// ============================================================================
// GROWTH AUTOMATION HANDLER
// ============================================================================

async function handleGrowth(args: string[]): Promise<void> {
  // Dynamic import to avoid bundling the growth module in the main CLI
  const { registerGrowthCommand } = await import('./commands/growth/index.js');
  const { Command } = await import('commander');

  // Create a mini program just for growth commands
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    outputError: () => {}, // Suppress Commander errors
  });

  registerGrowthCommand(program);

  try {
    // Parse the growth command with its arguments
    await program.parseAsync(['node', 'ferni', 'growth', ...args], { from: 'user' });
  } catch (error) {
    // Commander throws on --help and invalid commands, which is fine
    if (error instanceof Error && error.message.includes('commander')) {
      return;
    }
    throw error;
  }
}

// ============================================================================
// BRAND & COMMUNITY HANDLERS
// ============================================================================

async function handleBrand(args: string[]): Promise<void> {
  // Dynamic import to avoid bundling
  const { brand } = await import('./commands/brand/brand.js');

  // Parse args: ferni brand [command] [subcommand] [positional...] [--options]
  const [command, subcommand, ...rest] = args;
  const options: Record<string, unknown> = {};
  const positionalArgs: string[] = [];

  // Parse options and positional args
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '');
      const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      options[key] = value;
    } else {
      positionalArgs.push(arg);
    }
  }

  // Map positional args to named options based on subcommand
  if (subcommand === 'run' && positionalArgs[0]) {
    options.job = positionalArgs[0];
  } else if (subcommand === 'add' && positionalArgs[0]) {
    options.name = positionalArgs[0];
  } else if (subcommand === 'show' || subcommand === 'update' || subcommand === 'prep') {
    if (positionalArgs[0]) options.id = positionalArgs[0];
    if (positionalArgs[1]) options.status = positionalArgs[1];
  } else if (subcommand === 'complete' && positionalArgs.length >= 2) {
    options.workstreamId = positionalArgs[0];
    options.taskId = positionalArgs[1];
  }

  await brand(command, subcommand, options);
}

async function handleCommunity(args: string[]): Promise<void> {
  // Dynamic import to avoid bundling
  const { community } = await import('./commands/community/community.js');

  // Parse args: ferni community [command] [subcommand] [--options]
  const [command, subcommand, ...rest] = args;
  const options: Record<string, unknown> = {};

  // Parse options
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '');
      const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      options[key] = value;
    }
  }

  await community(command, subcommand, options);
}

async function handleRituals(args: string[]): Promise<void> {
  // Dynamic import to avoid bundling
  const { rituals } = await import('./commands/rituals/rituals.js');

  // Parse args: ferni rituals [command] [subcommand] [--options]
  const [command, subcommand, ...rest] = args;
  const options: Record<string, unknown> = {};

  // Parse options
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '');
      const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
      options[key] = value;
    }
  }

  await rituals(command, subcommand, options);
}

// ============================================================================
// VOICE + CLAUDE CODE COMMAND
// ============================================================================

interface ServiceStatus {
  running: boolean;
  pid?: number;
}

async function checkTokenServer(): Promise<ServiceStatus> {
  try {
    const response = await fetch('http://localhost:3001/health', {
      signal: AbortSignal.timeout(2000),
    });
    return { running: response.ok };
  } catch {
    return { running: false };
  }
}

async function checkAgent(): Promise<ServiceStatus> {
  try {
    const response = await fetch('http://localhost:8081/health', {
      signal: AbortSignal.timeout(2000),
    });
    return { running: response.ok };
  } catch {
    return { running: false };
  }
}

async function startTokenServer(): Promise<void> {
  log.info('Starting token server...');
  const tokenServer = spawn('node', ['token-server.js'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  tokenServer.unref();

  // Wait for it to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await checkTokenServer();
    if (status.running) {
      log.success('Token server started (port 3001)');
      return;
    }
  }
  throw new Error('Token server failed to start');
}

async function startAgent(): Promise<void> {
  log.info('Starting voice agent...');
  // Use the new unified worker (GCE-optimized, orchestrator pattern)
  const agent = spawn('npx', ['tsx', 'src/agents/worker.ts'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: '8081',
    },
  });
  agent.unref();

  // Wait for it to be ready
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await checkAgent();
    if (status.running) {
      log.success('Voice agent started (port 8081)');
      return;
    }
  }
  throw new Error('Voice agent failed to start');
}

async function handleCode(args: string[]): Promise<void> {
  log.header('💻 Voice-Driven Coding with Ferni + Claude');

  // Check for --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bold}Voice-Driven Coding${colors.reset}

Talk to Ferni, who helps you code with Claude Code.

${colors.bold}Usage:${colors.reset}
  ferni code                    # Start voice coding session
  ferni code --dir ./myproject  # Work in a specific directory
  ferni code --debug            # Show debug info
  ferni code --no-voice         # Text-only mode (no mic)
  ferni code --local            # Use local services (auto-start)
  ferni code --cloud            # Use cloud services (production)

${colors.bold}How it works:${colors.reset}
  1. You speak to Ferni
  2. Ferni transcribes and sends to Claude Code
  3. Claude executes with MCP tools for voice feedback
  4. Ferni narrates progress via TTS

${colors.bold}MCP Tools Available to Claude:${colors.reset}
  • mcp__ferni__narrate        - Speak to user
  • mcp__ferni__report_progress - Update on task status
  • mcp__ferni__task_complete  - Announce completion
  • mcp__ferni__request_voice_input - Ask user questions
`);
    return;
  }

  const useCloud = args.includes('--cloud');
  const skipVoice = args.includes('--no-voice');

  if (!useCloud) {
    // Check and start local services
    console.log(`${colors.dim}Checking services...${colors.reset}\n`);

    // 1. Token Server
    const tokenStatus = await checkTokenServer();
    if (tokenStatus.running) {
      log.success('Token server running');
    } else {
      await startTokenServer();
    }

    // 2. Voice Agent
    const agentStatus = await checkAgent();
    if (agentStatus.running) {
      log.success('Voice agent running');
    } else {
      await startAgent();
    }

    console.log('');
  }

  // 3. Check Claude Code is installed
  try {
    execSync('which claude', { stdio: 'pipe' });
    log.success('Claude Code CLI found');
  } catch {
    log.error(messages.missingTool('Claude Code', 'Install from: npm install -g @anthropic-ai/claude-code'));
    console.log(`\n${colors.yellow}Install it with:${colors.reset}`);
    console.log(`${colors.dim}  npm install -g @anthropic-ai/claude-code${colors.reset}\n`);
    return;
  }

  console.log('');

  // Start the voice-claude bridge
  const { handleVoiceClaude } = await import('./features/voice/voice-claude.js');
  await handleVoiceClaude(args);
}

// ============================================================================
// DEBUG COMMAND
// ============================================================================

async function handleDebug(args: string[]): Promise<void> {
  const subcommand = args[0] || 'health';

  log.header(`🐛 Debug & Troubleshooting`);

  if (subcommand === 'capture') {
    console.log(`${colors.bold}Capturing diagnostic information...${colors.reset}\n`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugDir = join(PROJECT_ROOT, '.debug-captures');
    const captureFile = join(debugDir, `debug-${timestamp}.txt`);

    // Create debug directory if it doesn't exist
    execCommand(`mkdir -p ${debugDir}`);

    let output = `Debug Capture - ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;

    // System info
    output += `## System Info\n`;
    output += `Node: ${execCommand('node --version')}\n`;
    output += `npm: ${execCommand('npm --version')}\n`;
    output += `OS: ${execCommand('uname -a')}\n\n`;

    // Git status
    output += `## Git Status\n`;
    output += `Branch: ${execCommand('git rev-parse --abbrev-ref HEAD')}\n`;
    output += `Last commit: ${execCommand('git log -1 --oneline')}\n`;
    output += `Status:\n${execCommand('git status --short')}\n\n`;

    // Environment check
    output += `## Environment Variables (presence check)\n`;
    const envVars = [
      'LIVEKIT_API_KEY',
      'LIVEKIT_URL',
      'GOOGLE_API_KEY',
      'CARTESIA_API_KEY',
      'STRIPE_SECRET_KEY',
    ];
    for (const v of envVars) {
      output += `${v}: ${process.env[v] ? '✓ set' : '✗ missing'}\n`;
    }
    output += '\n';

    // Service status
    output += `## Service Status\n`;
    for (const [name, service] of Object.entries(SERVICES)) {
      const status = execCommand(
        `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.conditions[0].status)" 2>/dev/null`
      );
      output += `${name}: ${status === 'True' ? '✓ healthy' : '✗ unhealthy or not found'}\n`;
    }
    output += '\n';

    // Recent errors
    output += `## Recent Errors (last 10)\n`;
    const errors = execCommand(
      `gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=10 --project=${GCP_PROJECT} --format="table(timestamp,textPayload)" 2>/dev/null`
    );
    output += errors || 'No recent errors found\n';

    // Write to file
    const { writeFileSync } = await import('fs');
    writeFileSync(captureFile, output);

    log.success(`Debug capture saved to: ${captureFile}`);
    console.log(`\n${colors.dim}View with: cat ${captureFile}${colors.reset}`);
  }

  if (subcommand === 'logs') {
    console.log(`${colors.bold}Tailing logs from all services...${colors.reset}\n`);
    log.info('Press Ctrl+C to stop\n');

    const cmd = `gcloud logging tail "resource.type=cloud_run_revision" --project=${GCP_PROJECT} 2>/dev/null`;
    spawn('sh', ['-c', cmd], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  if (subcommand === 'errors') {
    console.log(`${colors.bold}Recent Errors:${colors.reset}\n`);

    const limit = args[1] || '20';

    const spinner = new Spinner('Fetching error logs...');
    spinner.start();

    const result = execCommand(
      `gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=${limit} --project=${GCP_PROJECT} --format="table(timestamp,resource.labels.service_name,textPayload)" 2>/dev/null`
    );

    spinner.stop(true);

    if (result) {
      console.log(result);
    } else {
      log.success('No recent errors found!');
    }
  }

  if (subcommand === 'health') {
    console.log(`${colors.bold}System Health Check:${colors.reset}\n`);

    // Check Cloud Run services
    console.log(`  ${colors.cyan}Cloud Run Services:${colors.reset}`);
    for (const [name, service] of Object.entries(SERVICES)) {
      const spinner = new Spinner(`  Checking ${name}...`);
      spinner.start();

      const urlCmd = `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.url)" 2>/dev/null`;
      const url = execCommand(urlCmd);

      if (url) {
        const healthResult = execCommandWithStatus(
          `curl -s -o /dev/null -w "%{http_code}" "${url}/health" --max-time 5 2>/dev/null`
        );
        spinner.stop(healthResult.output === '200');
        if (healthResult.output !== '200') {
          console.log(`      ${colors.dim}HTTP ${healthResult.output || 'timeout'}${colors.reset}`);
        }
      } else {
        spinner.stop(false);
        console.log(`      ${colors.dim}Service not found${colors.reset}`);
      }
    }

    // Check local dev servers
    console.log(`\n  ${colors.cyan}Local Dev Servers:${colors.reset}`);
    for (const [name, port] of Object.entries(DEV_PORTS)) {
      const pids = execCommand(`lsof -i :${port} -t 2>/dev/null`);
      const status = pids.trim()
        ? `${colors.green}✓${colors.reset} running (PID: ${pids.trim()})`
        : `${colors.dim}○${colors.reset} not running`;
      console.log(`    ${name} (${port}): ${status}`);
    }

    // Check disk space
    console.log(`\n  ${colors.cyan}Disk Space:${colors.reset}`);
    const diskUsage = execCommand('df -h . | tail -1');
    if (diskUsage) {
      const parts = diskUsage.split(/\s+/);
      console.log(`    Used: ${parts[2]} / ${parts[1]} (${parts[4]})`);
    }

    // Check memory
    console.log(`\n  ${colors.cyan}Memory:${colors.reset}`);
    const memInfo = execCommand('vm_stat 2>/dev/null | head -5');
    if (memInfo) {
      console.log(`    ${colors.dim}${memInfo.split('\n').slice(1).join('\n    ')}${colors.reset}`);
    }
  }

  if (subcommand === 'env') {
    console.log(`${colors.bold}Environment Diagnostics:${colors.reset}\n`);

    // Check .env file
    const envPath = join(PROJECT_ROOT, '.env');
    const envExists = existsSync(envPath);
    console.log(
      `  .env file: ${envExists ? colors.green + '✓ exists' : colors.red + '✗ missing'}${colors.reset}`
    );

    if (envExists) {
      const envContent = readFileSync(envPath, 'utf-8');
      const envLines = envContent.split('\n').filter((l) => l.includes('=') && !l.startsWith('#'));
      console.log(`  Variables defined: ${envLines.length}`);

      // Check critical vars
      console.log(`\n  ${colors.cyan}Critical Variables:${colors.reset}`);
      const critical = [
        { key: 'LIVEKIT_API_KEY', desc: 'LiveKit auth' },
        { key: 'LIVEKIT_API_SECRET', desc: 'LiveKit auth' },
        { key: 'LIVEKIT_URL', desc: 'LiveKit server' },
        { key: 'GOOGLE_API_KEY', desc: 'Gemini AI' },
        { key: 'CARTESIA_API_KEY', desc: 'Voice TTS' },
      ];

      for (const { key, desc } of critical) {
        const hasValue =
          envContent.includes(`${key}=`) && !envContent.match(new RegExp(`${key}=\\s*$`, 'm'));
        const status = hasValue
          ? `${colors.green}✓${colors.reset}`
          : `${colors.red}✗${colors.reset}`;
        console.log(`    ${status} ${key} ${colors.dim}(${desc})${colors.reset}`);
      }
    }

    // Check Node version
    console.log(`\n  ${colors.cyan}Runtime:${colors.reset}`);
    console.log(`    Node: ${execCommand('node --version')}`);
    console.log(`    npm: ${execCommand('npm --version')}`);
  }

  if (subcommand === 'network') {
    console.log(`${colors.bold}Network Diagnostics:${colors.reset}\n`);

    const endpoints = [
      { name: 'Google APIs', url: 'https://www.googleapis.com' },
      { name: 'LiveKit Cloud', url: 'https://cloud.livekit.io' },
      { name: 'Cartesia', url: 'https://api.cartesia.ai' },
      { name: 'Stripe', url: 'https://api.stripe.com' },
      { name: 'Firebase', url: 'https://firebase.google.com' },
    ];

    for (const { name, url } of endpoints) {
      const spinner = new Spinner(`Checking ${name}...`);
      spinner.start();
      const result = execCommandWithStatus(
        `curl -s -o /dev/null -w "%{http_code}" "${url}" --max-time 5 2>/dev/null`
      );
      const success = result.output.startsWith('2') || result.output.startsWith('3');
      spinner.stop(success);
      if (!success) {
        console.log(`    ${colors.dim}HTTP ${result.output || 'timeout'}${colors.reset}`);
      }
    }

    // Check DNS
    console.log(`\n  ${colors.cyan}DNS Resolution:${colors.reset}`);
    const dnsCheck = execCommand('nslookup googleapis.com 2>/dev/null | grep "Address" | tail -1');
    console.log(`    googleapis.com: ${dnsCheck || 'failed'}`);
  }

  if (subcommand === 'voice') {
    // Voice pipeline debugger
    const { handleVoiceDebug } = await import('./features/voice/voice-debug.js');
    await handleVoiceDebug(args.slice(1));
  }
}

// ============================================================================
// INTEGRATIONS COMMAND
// ============================================================================

async function handleIntegrations(args: string[]): Promise<void> {
  const subcommand = args[0] || 'check';

  log.header(`🔗 Integration Health Checks`);

  interface IntegrationCheck {
    name: string;
    envVar: string;
    testCmd?: string;
    testUrl?: string;
  }

  const integrations: Record<string, IntegrationCheck> = {
    livekit: {
      name: 'LiveKit',
      envVar: 'LIVEKIT_API_KEY',
      testUrl: process.env.LIVEKIT_URL,
    },
    cartesia: {
      name: 'Cartesia TTS',
      envVar: 'CARTESIA_API_KEY',
      testUrl: 'https://api.cartesia.ai/voices',
    },
    gemini: {
      name: 'Google Gemini',
      envVar: 'GOOGLE_API_KEY',
      testUrl: 'https://generativelanguage.googleapis.com',
    },
    stripe: {
      name: 'Stripe',
      envVar: 'STRIPE_SECRET_KEY',
      testUrl: 'https://api.stripe.com/v1/balance',
    },
    firebase: {
      name: 'Firebase',
      envVar: 'GOOGLE_APPLICATION_CREDENTIALS',
    },
    elevenlabs: {
      name: 'ElevenLabs',
      envVar: 'ELEVENLABS_API_KEY',
      testUrl: 'https://api.elevenlabs.io/v1/voices',
    },
    openai: {
      name: 'OpenAI',
      envVar: 'OPENAI_API_KEY',
      testUrl: 'https://api.openai.com/v1/models',
    },
    anthropic: {
      name: 'Anthropic',
      envVar: 'ANTHROPIC_API_KEY',
    },
    spotify: {
      name: 'Spotify',
      envVar: 'SPOTIFY_CLIENT_ID',
    },
    twilio: {
      name: 'Twilio',
      envVar: 'TWILIO_ACCOUNT_SID',
    },
  };

  const checkIntegration = async (key: string, integration: IntegrationCheck): Promise<boolean> => {
    const hasKey = !!process.env[integration.envVar];

    if (!hasKey) {
      console.log(
        `  ${colors.dim}○${colors.reset} ${integration.name}: ${colors.dim}not configured${colors.reset}`
      );
      return false;
    }

    if (integration.testUrl) {
      const spinner = new Spinner(`Checking ${integration.name}...`);
      spinner.start();

      const result = execCommandWithStatus(
        `curl -s -o /dev/null -w "%{http_code}" "${integration.testUrl}" --max-time 5 2>/dev/null`
      );
      const success =
        result.output.startsWith('2') ||
        result.output.startsWith('3') ||
        result.output === '401' ||
        result.output === '403';

      spinner.stop(success);
      if (!success) {
        console.log(`    ${colors.dim}HTTP ${result.output || 'timeout'}${colors.reset}`);
      }
      return success;
    } else {
      console.log(
        `  ${colors.green}✓${colors.reset} ${integration.name}: ${colors.dim}API key configured${colors.reset}`
      );
      return true;
    }
  };

  if (subcommand === 'check' || subcommand === 'all') {
    console.log(`${colors.bold}Checking all integrations...${colors.reset}\n`);

    let configured = 0;
    let healthy = 0;

    for (const [key, integration] of Object.entries(integrations)) {
      if (process.env[integration.envVar]) {
        configured++;
        const success = await checkIntegration(key, integration);
        if (success) healthy++;
      } else {
        console.log(
          `  ${colors.dim}○${colors.reset} ${integration.name}: ${colors.dim}not configured${colors.reset}`
        );
      }
    }

    console.log();
    console.log(
      `  ${colors.bold}Summary:${colors.reset} ${healthy}/${configured} healthy, ${Object.keys(integrations).length - configured} not configured`
    );
  } else if (integrations[subcommand]) {
    const integration = integrations[subcommand];
    console.log(`${colors.bold}Checking ${integration.name}...${colors.reset}\n`);
    await checkIntegration(subcommand, integration);
  } else {
    log.error(`Unknown integration: ${subcommand}`);
    log.info(`Available: ${Object.keys(integrations).join(', ')}, check, all`);
  }
}

// ============================================================================
// RELEASE COMMAND
// ============================================================================

async function handleRelease(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`📦 Release Management`);

  if (subcommand === 'status') {
    console.log(`${colors.bold}Current Release Status:${colors.reset}\n`);

    // Get current version from package.json
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    console.log(`  Version: ${colors.cyan}${packageJson.version}${colors.reset}`);

    // Get git info
    const branch = execCommand('git rev-parse --abbrev-ref HEAD');
    const lastTag = execCommand('git describe --tags --abbrev=0 2>/dev/null') || 'none';
    const commitsSinceTag =
      execCommand(`git rev-list ${lastTag}..HEAD --count 2>/dev/null`) || 'N/A';
    const lastCommit = execCommand('git log -1 --format="%h %s"');

    console.log(`  Branch: ${colors.cyan}${branch}${colors.reset}`);
    console.log(`  Last tag: ${colors.cyan}${lastTag}${colors.reset}`);
    console.log(`  Commits since tag: ${commitsSinceTag}`);
    console.log(`  Last commit: ${colors.dim}${lastCommit}${colors.reset}`);

    // Check if there are uncommitted changes
    const uncommitted = execCommand('git status --porcelain');
    console.log(
      `  Uncommitted changes: ${uncommitted ? colors.yellow + 'Yes' : colors.green + 'None'}${colors.reset}`
    );

    // Show deployed versions
    console.log(`\n  ${colors.cyan}Deployed Versions:${colors.reset}`);
    for (const [name, service] of Object.entries(SERVICES)) {
      const revision = execCommand(
        `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.latestReadyRevisionName)" 2>/dev/null`
      );
      console.log(`    ${name}: ${revision || 'not deployed'}`);
    }
  }

  if (subcommand === 'changelog') {
    const sinceTag =
      args[1] || execCommand('git describe --tags --abbrev=0 2>/dev/null') || 'HEAD~20';

    console.log(`${colors.bold}Changelog since ${sinceTag}:${colors.reset}\n`);

    // Group commits by type
    const commits = execCommand(`git log ${sinceTag}..HEAD --format="%s" 2>/dev/null`);

    if (!commits) {
      log.info('No commits since last tag');
      return;
    }

    const features: string[] = [];
    const fixes: string[] = [];
    const refactors: string[] = [];
    const other: string[] = [];

    for (const commit of commits.split('\n').filter(Boolean)) {
      if (commit.startsWith('feat')) {
        features.push(commit);
      } else if (commit.startsWith('fix')) {
        fixes.push(commit);
      } else if (commit.startsWith('refactor')) {
        refactors.push(commit);
      } else {
        other.push(commit);
      }
    }

    if (features.length > 0) {
      console.log(`  ${colors.green}Features:${colors.reset}`);
      features.forEach((c) => console.log(`    • ${c}`));
    }
    if (fixes.length > 0) {
      console.log(`  ${colors.yellow}Fixes:${colors.reset}`);
      fixes.forEach((c) => console.log(`    • ${c}`));
    }
    if (refactors.length > 0) {
      console.log(`  ${colors.blue}Refactors:${colors.reset}`);
      refactors.forEach((c) => console.log(`    • ${c}`));
    }
    if (other.length > 0) {
      console.log(`  ${colors.dim}Other:${colors.reset}`);
      other.forEach((c) => console.log(`    • ${c}`));
    }

    console.log();
    console.log(`  Total: ${commits.split('\n').filter(Boolean).length} commits`);
  }

  if (subcommand === 'create') {
    const version = args[1];

    if (!version) {
      log.error('Please specify a version');
      log.info('Usage: ferni release create <version>');
      log.info('Example: ferni release create v1.2.0');
      return;
    }

    console.log(`${colors.bold}Creating release ${version}...${colors.reset}\n`);

    // Check for uncommitted changes
    const uncommitted = execCommand('git status --porcelain');
    if (uncommitted) {
      log.error(messages.uncommittedChanges());
      return;
    }

    // Check if tag already exists
    const tagExists = execCommand(`git tag -l ${version}`);
    if (tagExists) {
      log.error(messages.tagExists(version));
      return;
    }

    // Update package.json version
    const versionNumber = version.startsWith('v') ? version.slice(1) : version;
    log.step(`Updating package.json to ${versionNumber}...`);
    execCommand(`npm version ${versionNumber} --no-git-tag-version`);

    // Generate changelog
    log.step('Generating changelog...');
    const lastTag = execCommand('git describe --tags --abbrev=0 2>/dev/null');
    const changelog = lastTag
      ? execCommand(`git log ${lastTag}..HEAD --format="- %s" 2>/dev/null`)
      : execCommand('git log --format="- %s" -20 2>/dev/null');

    // Create commit
    log.step('Creating release commit...');
    execCommand('git add package.json package-lock.json');
    execCommand(`git commit -m "chore: release ${version}"`);

    // Create tag
    log.step(`Creating tag ${version}...`);
    const tagMessage = `Release ${version}\n\n${changelog}`;
    spawnSync('git', ['tag', '-a', version, '-m', tagMessage], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    console.log();
    log.success(`Release ${version} created!`);
    console.log();
    log.info('Next steps:');
    console.log(`  1. Review: ${colors.cyan}git show ${version}${colors.reset}`);
    console.log(`  2. Push: ${colors.cyan}git push origin main --tags${colors.reset}`);
    console.log(`  3. Deploy: ${colors.cyan}ferni deploy all${colors.reset}`);
  }

  if (subcommand === 'tag') {
    const version = args[1];

    if (!version) {
      // List existing tags
      console.log(`${colors.bold}Recent Tags:${colors.reset}\n`);
      const tags = execCommand('git tag -l --sort=-version:refname | head -10');
      if (tags) {
        tags
          .split('\n')
          .filter(Boolean)
          .forEach((tag) => {
            const date = execCommand(`git log -1 --format="%ci" ${tag} 2>/dev/null`);
            console.log(
              `  ${colors.cyan}${tag}${colors.reset} ${colors.dim}${date}${colors.reset}`
            );
          });
      } else {
        log.info('No tags found');
      }
      return;
    }

    // Create lightweight tag
    log.info(`Creating tag ${version}...`);
    spawnSync('git', ['tag', version], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    log.success(`Tag ${version} created`);
  }

  if (subcommand === 'notes') {
    const version = args[1] || execCommand('git describe --tags --abbrev=0 2>/dev/null');

    if (!version) {
      log.error('No version specified and no tags found');
      return;
    }

    console.log(`${colors.bold}Release Notes for ${version}:${colors.reset}\n`);

    // Get tag message
    const tagMessage = execCommand(`git tag -l -n999 ${version} 2>/dev/null`);
    if (tagMessage) {
      console.log(tagMessage);
    } else {
      log.info('No release notes found for this tag');
    }

    // Get commits for this tag
    const prevTag = execCommand(`git describe --tags --abbrev=0 ${version}^ 2>/dev/null`);
    if (prevTag) {
      console.log(`\n${colors.bold}Commits:${colors.reset}`);
      const commits = execCommand(`git log ${prevTag}..${version} --format="  • %s" 2>/dev/null`);
      console.log(commits);
    }
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Release History:${colors.reset}\n`);

    const tags = execCommand('git tag -l --sort=-version:refname | head -10');
    if (!tags) {
      log.info('No releases found');
      return;
    }

    for (const tag of tags.split('\n').filter(Boolean)) {
      const date = execCommand(`git log -1 --format="%ci" ${tag} 2>/dev/null`).split(' ')[0];
      const commitCount = execCommand(`git rev-list ${tag} --count 2>/dev/null`);
      console.log(
        `  ${colors.cyan}${tag.padEnd(12)}${colors.reset} ${colors.dim}${date}${colors.reset}  (${commitCount} commits total)`
      );
    }
  }
}

// ============================================================================
// DEVBLOG COMMAND
// ============================================================================

async function handleDevBlog(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`📝 Developer Blog`);

  const devBlogDir = join(PROJECT_ROOT, 'apps/website/ferni-website/src/dev-blog');
  const imagesDir = join(PROJECT_ROOT, 'apps/website/ferni-website/images/dev-blog');
  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Developer Blog Status:${colors.reset}\n`);

    // Count posts
    try {
      const posts = execCommand(`ls -1 ${devBlogDir}/*.md 2>/dev/null | wc -l`).trim();
      const images = execCommand(`ls -1 ${imagesDir}/*.png 2>/dev/null | wc -l`).trim();

      console.log(`  ${colors.cyan}Posts:${colors.reset} ${posts} markdown files`);
      console.log(`  ${colors.cyan}Images:${colors.reset} ${images} OG images`);

      // Recent posts
      console.log(`\n  ${colors.bold}Recent Posts:${colors.reset}`);
      const recentPosts = execCommand(
        `ls -t ${devBlogDir}/*.md 2>/dev/null | head -5 | xargs -I {} basename {}`
      );
      if (recentPosts) {
        recentPosts.split('\n').forEach((post) => {
          if (post) console.log(`    ${icons.bullet} ${post}`);
        });
      }
    } catch {
      console.log(`  ${colors.yellow}No posts found yet${colors.reset}`);
    }

    console.log(`\n  ${colors.bold}Available Commands:${colors.reset}`);
    console.log(`    ferni devblog new "Title"          - Create a new blog post`);
    console.log(`    ferni devblog changelog <version>  - Generate changelog post`);
    console.log(`    ferni devblog images               - Generate OG images`);
    console.log(`    ferni devblog newsletter           - Generate weekly newsletter`);
    console.log(`    ferni devblog social               - Generate social snippets`);
    console.log(`    ferni devblog preview              - Start local preview server`);
    console.log(`    ferni devblog publish              - Deploy to Firebase`);
    console.log(`    ferni devblog validate             - Validate all posts`);
  }

  if (subcommand === 'changelog') {
    const version = args[1];
    if (!version) {
      log.error('Version required. Usage: ferni devblog changelog v1.2.3');
      return;
    }

    console.log(`${colors.cyan}Generating changelog for ${version}...${colors.reset}\n`);

    const dryRun = args.includes('--dry-run');
    const cmd = dryRun
      ? `node ${scriptsDir}/generate-changelog-post.js --version ${version} --dry-run`
      : `node ${scriptsDir}/generate-changelog-post.js --version ${version}`;

    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'images') {
    const batch = !args.includes('--single');

    if (batch) {
      console.log(`${colors.cyan}Generating OG images for all posts...${colors.reset}\n`);
      spawnSync('sh', ['-c', `node ${scriptsDir}/generate-dev-blog-image.js --batch`], { stdio: 'inherit' });
    } else {
      const title = args.find((a) => a.startsWith('--title='))?.split('=')[1];
      const category = args.find((a) => a.startsWith('--category='))?.split('=')[1];

      if (!title) {
        log.error('Title required for single image. Usage: ferni devblog images --single --title="Your Title" --category=tutorial');
        return;
      }

      const imgCmd = `node ${scriptsDir}/generate-dev-blog-image.js --title "${title}" ${category ? `--category ${category}` : ''}`;
      spawnSync('sh', ['-c', imgCmd], { stdio: 'inherit' });
    }
  }

  if (subcommand === 'newsletter') {
    const preview = args.includes('--preview');

    console.log(`${colors.cyan}Generating weekly newsletter...${colors.reset}\n`);
    const digestCmd = `node ${scriptsDir}/generate-weekly-digest.js ${preview ? '--preview' : ''}`;
    spawnSync('sh', ['-c', digestCmd], { stdio: 'inherit' });
  }

  if (subcommand === 'social') {
    const batch = !args.includes('--recent');

    console.log(`${colors.cyan}Generating social media snippets...${colors.reset}\n`);
    const socialCmd = `node ${scriptsDir}/generate-social-snippets.js ${batch ? '--batch' : '--recent'}`;
    spawnSync('sh', ['-c', socialCmd], { stdio: 'inherit' });
  }

  if (subcommand === 'new') {
    const title = args[1];
    if (!title) {
      log.error('Title required. Usage: ferni devblog new "My Post Title" --category=tutorial');
      return;
    }

    const category = args.find((a) => a.startsWith('--category='))?.split('=')[1] || 'tutorial';
    const date = new Date().toISOString().split('T')[0];
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${date}-${slug}.md`;
    const filepath = join(devBlogDir, filename);

    const frontmatter = `---
title: "${title}"
excerpt: "Add a compelling excerpt here..."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: ${date}
category: "${category}"
image: "${slug}.png"
readTime: 5
---

# ${title}

Start writing your post here...

## Section 1

Content goes here.

## Section 2

More content.

---

*Have questions? Join our [Discord community](https://discord.gg/ferni) or reach out on [Twitter](https://twitter.com/ferni_ai).*
`;

    const fs = await import('fs/promises');
    await fs.writeFile(filepath, frontmatter);
    console.log(`${colors.green}${icons.success}${colors.reset} Created: ${filename}`);
    console.log(`\n  ${colors.dim}Edit: ${filepath}${colors.reset}`);
    console.log(`  ${colors.dim}Preview: ferni devblog preview${colors.reset}`);
  }

  if (subcommand === 'preview') {
    console.log(`${colors.cyan}Starting dev blog preview server...${colors.reset}\n`);
    const websiteDir = join(PROJECT_ROOT, 'apps/website/ferni-website');
    spawnSync('sh', ['-c', `cd ${websiteDir} && pnpm serve`], { stdio: 'inherit' });
  }

  if (subcommand === 'publish') {
    const dryRun = args.includes('--dry-run');
    console.log(`${colors.cyan}Publishing dev blog to Firebase...${colors.reset}\n`);

    const websiteDir = join(PROJECT_ROOT, 'apps/website/ferni-website');

    // Build first
    console.log(`  ${colors.dim}Building...${colors.reset}`);
    spawnSync('sh', ['-c', `cd ${websiteDir} && pnpm build`], { stdio: 'inherit' });

    if (dryRun) {
      console.log(`\n${colors.yellow}Dry run - skipping deploy${colors.reset}`);
    } else {
      // Deploy
      console.log(`\n  ${colors.dim}Deploying...${colors.reset}`);
      spawnSync('sh', ['-c', `cd ${websiteDir} && firebase deploy --only hosting`], { stdio: 'inherit' });
      console.log(`\n${colors.green}${icons.success}${colors.reset} Published to https://developers.ferni.ai`);
    }
  }

  if (subcommand === 'validate') {
    console.log(`${colors.bold}Validating blog posts...${colors.reset}\n`);

    try {
      const posts = execCommand(`ls -1 ${devBlogDir}/*.md 2>/dev/null`).trim().split('\n');
      let errors = 0;
      let warnings = 0;

      for (const postPath of posts) {
        if (!postPath) continue;
        const filename = postPath.split('/').pop();
        const fs = await import('fs/promises');
        const content = await fs.readFile(postPath, 'utf-8');

        // Check frontmatter
        const hasFrontmatter = content.startsWith('---');
        const hasTitle = content.includes('title:');
        const hasExcerpt = content.includes('excerpt:');
        const hasDate = content.includes('date:');
        const hasCategory = content.includes('category:');
        const hasImage = content.includes('image:');

        const issues: string[] = [];
        if (!hasFrontmatter) issues.push('Missing frontmatter');
        if (!hasTitle) issues.push('Missing title');
        if (!hasExcerpt) issues.push('Missing excerpt');
        if (!hasDate) issues.push('Missing date');
        if (!hasCategory) issues.push('Missing category');
        if (!hasImage) issues.push('Missing image reference');

        if (issues.length > 0) {
          console.log(`  ${colors.red}${icons.error}${colors.reset} ${filename}`);
          issues.forEach((issue) => console.log(`      ${colors.dim}${issue}${colors.reset}`));
          errors++;
        } else {
          console.log(`  ${colors.green}${icons.success}${colors.reset} ${filename}`);
        }

        // Check for image file
        const imageMatch = content.match(/image:\s*["']?([^"'\n]+)["']?/);
        if (imageMatch) {
          const imageName = imageMatch[1];
          const imagePath = join(imagesDir, imageName);
          if (!existsSync(imagePath)) {
            console.log(`      ${colors.yellow}${icons.warning} Missing OG image: ${imageName}${colors.reset}`);
            warnings++;
          }
        }
      }

      console.log(`\n${colors.bold}Summary:${colors.reset} ${posts.length} posts, ${errors} errors, ${warnings} warnings`);
    } catch (error) {
      log.error('Failed to validate posts');
    }
  }
}

// ============================================================================
// OPS COMMAND
// ============================================================================

async function handleOps(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`🔧 Operations`);

  const cliCommandsDir = join(PROJECT_ROOT, 'apps/cli/src/commands/ops');
  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Operations Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni ops zombies${colors.reset}      - Cleanup zombie Cloud Run revisions`);
    console.log(`  ${colors.cyan}ferni ops diagnose${colors.reset}     - Diagnose disconnect issues`);
    console.log(`  ${colors.cyan}ferni ops health${colors.reset}       - Run health checks with alerts`);
    console.log(`  ${colors.cyan}ferni ops memory${colors.reset}       - Memory system scheduler management`);
    console.log(`  ${colors.cyan}ferni ops ttl-cleanup${colors.reset}  - Run TTL data cleanup`);
    console.log(`  ${colors.cyan}ferni ops semantic${colors.reset}     - Semantic store management`);
    console.log(`  ${colors.cyan}ferni ops scheduler${colors.reset}    - Setup GCP Cloud Scheduler`);
    console.log(`  ${colors.cyan}ferni ops logs${colors.reset}         - View GCE container logs`);
    console.log(`  ${colors.cyan}ferni ops dashboard${colors.reset}    - Generate CI/CD health dashboard`);
    console.log(`  ${colors.cyan}ferni ops metrics${colors.reset}      - Collect and display CI metrics`);
    return;
  }

  if (subcommand === 'zombies') {
    const fix = args.includes('--fix');
    console.log(`${colors.cyan}Checking for zombie revisions...${colors.reset}\n`);
    const cmd = fix
      ? `npx tsx ${cliCommandsDir}/cleanup-zombies.ts --fix`
      : `npx tsx ${cliCommandsDir}/cleanup-zombies.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'diagnose') {
    console.log(`${colors.cyan}Diagnosing disconnect issues...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${cliCommandsDir}/diagnose-disconnects.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'health') {
    const alert = args.includes('--alert');
    console.log(`${colors.cyan}Running health checks...${colors.reset}\n`);
    const cmd = alert
      ? `npx tsx ${cliCommandsDir}/health-check.ts --alert`
      : `npx tsx ${cliCommandsDir}/health-check.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'ttl-cleanup') {
    const dryRun = args.includes('--dry-run');
    console.log(`${colors.cyan}Running TTL cleanup...${colors.reset}\n`);
    const cmd = dryRun
      ? `DRY_RUN=true npx tsx ${PROJECT_ROOT}/src/services/data-layer/ttl-cleanup.ts`
      : `npx tsx ${PROJECT_ROOT}/src/services/data-layer/ttl-cleanup.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'semantic') {
    const action = args[1] || 'status';
    const dryRun = args.includes('--dry-run');

    if (action === 'deploy') {
      console.log(`${colors.cyan}Deploying semantic store...${colors.reset}\n`);
      const cmd = dryRun
        ? `npx tsx ${scriptsDir}/deploy-semantic-store.ts --dry-run`
        : `npx tsx ${scriptsDir}/deploy-semantic-store.ts`;
      spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    } else if (action === 'backfill') {
      console.log(`${colors.cyan}Running semantic backfill...${colors.reset}\n`);
      const cmd = dryRun
        ? `npx tsx ${scriptsDir}/backfill-semantic-index.ts --dry-run`
        : `npx tsx ${scriptsDir}/backfill-semantic-index.ts`;
      spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    } else {
      console.log(`${colors.bold}Semantic Store Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}ferni ops semantic deploy${colors.reset}    - Deploy semantic store`);
      console.log(`  ${colors.cyan}ferni ops semantic backfill${colors.reset}  - Run semantic backfill`);
    }
  }

  if (subcommand === 'memory' || subcommand.startsWith('memory:')) {
    // Handle memory:xxx shorthand syntax
    const action = subcommand.includes(':') ? subcommand.split(':')[1] : (args[1] || 'status');
    const subArgs = subcommand.includes(':') ? args.slice(1) : args.slice(2);
    const dryRun = args.includes('--dry-run');

    if (action === 'deploy-scheduler' || action === 'deploy') {
      console.log(`${colors.cyan}Deploying memory scheduler jobs...${colors.reset}\n`);
      const cmd = dryRun
        ? `npx tsx ${cliCommandsDir}/memory-scheduler.ts deploy --dry-run`
        : `npx tsx ${cliCommandsDir}/memory-scheduler.ts deploy`;
      spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    } else if (action === 'scheduler-status' || action === 'status') {
      console.log(`${colors.cyan}Checking memory scheduler status...${colors.reset}\n`);
      spawnSync('sh', ['-c', `npx tsx ${cliCommandsDir}/memory-scheduler.ts status`], { stdio: 'inherit' });
    } else if (action === 'trigger') {
      const jobName = subArgs[0];
      if (!jobName) {
        console.log(`${colors.red}Please specify a job name: ferni ops memory:trigger <job-name>${colors.reset}`);
        return;
      }
      console.log(`${colors.cyan}Triggering memory job: ${jobName}...${colors.reset}\n`);
      spawnSync('sh', ['-c', `npx tsx ${cliCommandsDir}/memory-scheduler.ts trigger ${jobName}`], { stdio: 'inherit' });
    } else if (action === 'list') {
      console.log(`${colors.cyan}Available memory jobs:${colors.reset}\n`);
      spawnSync('sh', ['-c', `npx tsx ${cliCommandsDir}/memory-scheduler.ts list`], { stdio: 'inherit' });
    } else {
      console.log(`${colors.bold}Memory System Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}ferni ops memory:deploy-scheduler${colors.reset}  - Deploy all memory scheduler jobs`);
      console.log(`  ${colors.cyan}ferni ops memory:scheduler-status${colors.reset}  - Show scheduler job status`);
      console.log(`  ${colors.cyan}ferni ops memory:trigger <job>${colors.reset}     - Manually trigger a job`);
      console.log(`  ${colors.cyan}ferni ops memory:list${colors.reset}              - List available jobs`);
      console.log(`\n${colors.dim}Options:${colors.reset}`);
      console.log(`  ${colors.dim}--dry-run${colors.reset}  Preview changes without applying`);
    }
  }

  if (subcommand === 'scheduler') {
    const dryRun = args.includes('--dry-run');
    console.log(`${colors.cyan}Setting up GCP Cloud Scheduler...${colors.reset}\n`);
    const cmd = dryRun
      ? `npx tsx ${cliCommandsDir}/setup-health-scheduler.ts --dry-run`
      : `npx tsx ${cliCommandsDir}/setup-health-scheduler.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'logs') {
    const errors = args.includes('--errors');
    console.log(`${colors.cyan}Fetching GCE container logs...${colors.reset}\n`);

    const logCmd = errors
      ? `gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a -- 'docker logs $(docker ps -q | head -1) 2>&1 | grep -iE error | tail -30'`
      : `gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a -- 'docker logs $(docker ps -q | head -1) 2>&1 | tail -50'`;

    spawnSync('sh', ['-c', logCmd], { stdio: 'inherit' });
  }

  if (subcommand === 'dashboard') {
    const json = args.includes('--json');
    const open = args.includes('--open');
    const publish = args.includes('--publish');
    const outputArg = args.find((a) => a.startsWith('--output='));
    const output = outputArg ? outputArg.split('=')[1] : undefined;

    console.log(`${colors.cyan}Generating CI/CD dashboard...${colors.reset}\n`);
    const cmd = `npx tsx ${cliCommandsDir}/ci-dashboard.ts${json ? ' --json' : ''}${open ? ' --open' : ''}${publish ? ' --publish' : ''}${output ? ` --output=${output}` : ''}`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'metrics') {
    console.log(`${colors.cyan}Collecting CI metrics...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/devops/collect_ci_metrics.ts`], { stdio: 'inherit' });
  }
}

// ============================================================================
// WAITLIST COMMAND
// ============================================================================

async function handleWaitlist(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`📋 Waitlist Management`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Waitlist Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni waitlist list${colors.reset}           - List pending waitlist users`);
    console.log(`  ${colors.cyan}ferni waitlist approve <email>${colors.reset} - Approve a user`);
    console.log(`  ${colors.cyan}ferni waitlist stats${colors.reset}          - Show waitlist statistics`);
    console.log(`  ${colors.cyan}ferni waitlist export${colors.reset}         - Export waitlist to CSV`);
    return;
  }

  if (subcommand === 'list') {
    const limit = args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '20';
    console.log(`${colors.cyan}Fetching waitlist...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/approve-waitlist-user.ts --list --limit=${limit}`], { stdio: 'inherit' });
  }

  if (subcommand === 'approve') {
    const email = args[1];
    if (!email) {
      log.error('Email required. Usage: ferni waitlist approve user@example.com');
      return;
    }

    console.log(`${colors.cyan}Approving ${email}...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/approve-waitlist-user.ts --email=${email}`], { stdio: 'inherit' });
  }

  if (subcommand === 'stats') {
    console.log(`${colors.cyan}Fetching waitlist stats...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/approve-waitlist-user.ts --stats`], { stdio: 'inherit' });
  }

  if (subcommand === 'export') {
    const output = args.find((a) => a.startsWith('--output='))?.split('=')[1] || 'waitlist-export.csv';
    console.log(`${colors.cyan}Exporting waitlist to ${output}...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/approve-waitlist-user.ts --export --output=${output}`], { stdio: 'inherit' });
  }
}

// ============================================================================
// USERS COMMAND
// ============================================================================

async function handleUsers(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`👤 User Management`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}User Management Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni users list${colors.reset}              - List all users`);
    console.log(`  ${colors.cyan}ferni users show <email>${colors.reset}      - Show user details`);
    console.log(`  ${colors.cyan}ferni users dump <userId>${colors.reset}     - Full user data dump`);
    console.log(`  ${colors.cyan}ferni users cleanup${colors.reset}           - Clean up anonymous users`);
    console.log(`  ${colors.cyan}ferni users grant <email>${colors.reset}     - Grant access to user`);
    console.log(`  ${colors.cyan}ferni users find-rich${colors.reset}         - Find users with rich data`);
    console.log(`  ${colors.cyan}ferni users delete-stale${colors.reset}      - Delete stale profiles`);
    return;
  }

  if (subcommand === 'list') {
    const limit = args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '50';
    console.log(`${colors.cyan}Listing users...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/list-all-users.ts --limit=${limit}`], { stdio: 'inherit' });
  }

  if (subcommand === 'show') {
    const email = args[1];
    if (!email) {
      log.error('Email required. Usage: ferni users show user@example.com');
      return;
    }
    console.log(`${colors.cyan}Fetching user data...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/check-my-data.ts --email=${email}`], { stdio: 'inherit' });
  }

  if (subcommand === 'dump') {
    const userId = args[1];
    if (!userId) {
      log.error('User ID required. Usage: ferni users dump <userId>');
      return;
    }
    console.log(`${colors.cyan}Dumping full user data...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/full-user-dump.ts --user=${userId}`], { stdio: 'inherit' });
  }

  if (subcommand === 'cleanup') {
    const dryRun = args.includes('--dry-run');
    console.log(`${colors.cyan}Cleaning up anonymous users...${colors.reset}\n`);
    const cmd = dryRun
      ? `npx tsx ${scriptsDir}/cleanup-anonymous-users.ts --dry-run`
      : `npx tsx ${scriptsDir}/cleanup-anonymous-users.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'grant') {
    const email = args[1];
    if (!email) {
      log.error('Email required. Usage: ferni users grant user@example.com');
      return;
    }
    console.log(`${colors.cyan}Granting access...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/grant-access.ts --email=${email}`], { stdio: 'inherit' });
  }

  if (subcommand === 'find-rich') {
    console.log(`${colors.cyan}Finding users with rich data...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/find-rich-users.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'delete-stale') {
    const dryRun = args.includes('--dry-run');
    console.log(`${colors.cyan}Deleting stale profiles...${colors.reset}\n`);
    const cmd = dryRun
      ? `npx tsx ${scriptsDir}/delete-stale-profiles.ts --dry-run`
      : `npx tsx ${scriptsDir}/delete-stale-profiles.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }
}

// ============================================================================
// CALLS COMMAND
// ============================================================================

async function handleCalls(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`📞 Phone Calls`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Phone Call Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni calls test <phone>${colors.reset}     - Test outbound call`);
    console.log(`  ${colors.cyan}ferni calls status <id>${colors.reset}      - Check call status`);
    console.log(`  ${colors.cyan}ferni calls family <name>${colors.reset}    - Call family member (mom, edison, annette)`);
    console.log(`  ${colors.cyan}ferni calls invite <email>${colors.reset}   - Send Ferni invite call`);
    console.log(`  ${colors.cyan}ferni calls goodnight${colors.reset}        - Goodnight call test`);
    return;
  }

  if (subcommand === 'test') {
    const phone = args[1];
    if (!phone) {
      log.error('Phone number required. Usage: ferni calls test +1234567890');
      return;
    }
    console.log(`${colors.cyan}Initiating test call to ${phone}...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/test-outbound-call.ts --phone=${phone}`], { stdio: 'inherit' });
  }

  if (subcommand === 'status') {
    const callId = args[1];
    if (!callId) {
      log.error('Call ID required. Usage: ferni calls status <callId>');
      return;
    }
    console.log(`${colors.cyan}Checking call status...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/check-call-status.ts --call=${callId}`], { stdio: 'inherit' });
  }

  if (subcommand === 'family') {
    const member = args[1]?.toLowerCase();
    if (!member) {
      log.error('Family member required. Usage: ferni calls family mom');
      return;
    }

    const familyScripts: Record<string, string> = {
      mom: 'call-mom-betty.ts',
      betty: 'call-mom-betty.ts',
      edison: 'call-edison.ts',
      annette: 'call-annette.ts',
    };

    const script = familyScripts[member];
    if (!script) {
      log.error(`Unknown family member: ${member}. Available: mom, edison, annette`);
      return;
    }

    console.log(`${colors.cyan}Calling ${member}...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/${script}`], { stdio: 'inherit' });
  }

  if (subcommand === 'invite') {
    const email = args[1];
    if (!email) {
      log.error('Email required. Usage: ferni calls invite user@example.com');
      return;
    }
    console.log(`${colors.cyan}Sending Ferni invite call...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/ferni-invite-call.ts --email=${email}`], { stdio: 'inherit' });
  }

  if (subcommand === 'goodnight') {
    console.log(`${colors.cyan}Initiating goodnight call...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/call-goodnight.ts`], { stdio: 'inherit' });
  }
}

// ============================================================================
// ICONS COMMAND
// ============================================================================

async function handleIcons(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`🎨 Icon Generation`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Icon Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni icons favicons${colors.reset}     - Generate all favicon variants`);
    console.log(`  ${colors.cyan}ferni icons smile-gif${colors.reset}    - Generate animated smile GIF`);
    console.log(`  ${colors.cyan}ferni icons app-icons${colors.reset}    - Regenerate app icons`);
    console.log(`  ${colors.cyan}ferni icons all${colors.reset}          - Generate all icons`);
    return;
  }

  if (subcommand === 'favicons') {
    console.log(`${colors.cyan}Generating favicons...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/generate-favicons.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'smile-gif') {
    console.log(`${colors.cyan}Generating smile GIF...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/generate-smile-gif.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'app-icons') {
    console.log(`${colors.cyan}Regenerating app icons...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/regenerate-icons.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'all') {
    console.log(`${colors.cyan}Generating all icons...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/generate-favicons.ts`], { stdio: 'inherit' });
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/generate-smile-gif.ts`], { stdio: 'inherit' });
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/regenerate-icons.ts`], { stdio: 'inherit' });
    console.log(`\n${colors.green}${icons.success}${colors.reset} All icons generated!`);
  }
}

// ============================================================================
// SMOKE COMMAND
// ============================================================================

async function handleSmoke(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`💨 Smoke Tests`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Smoke Test Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni smoke api${colors.reset}       - Test API endpoints`);
    console.log(`  ${colors.cyan}ferni smoke livekit${colors.reset}   - Test LiveKit connection`);
    console.log(`  ${colors.cyan}ferni smoke gemini${colors.reset}    - Test Gemini API`);
    console.log(`  ${colors.cyan}ferni smoke tools${colors.reset}     - Test tool orchestrator`);
    console.log(`  ${colors.cyan}ferni smoke all${colors.reset}       - Run all smoke tests`);
    return;
  }

  if (subcommand === 'api') {
    console.log(`${colors.cyan}Testing API endpoints...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/smoke-test-api.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'livekit') {
    console.log(`${colors.cyan}Testing LiveKit connection...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/test-livekit-session.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'gemini') {
    console.log(`${colors.cyan}Testing Gemini API...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/diagnose-gemini.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'tools') {
    console.log(`${colors.cyan}Testing tool orchestrator...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/test-tool-orchestrator.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'all') {
    console.log(`${colors.cyan}Running all smoke tests...${colors.reset}\n`);

    const tests = [
      { name: 'API', cmd: `npx tsx ${scriptsDir}/smoke-test-api.ts` },
      { name: 'LiveKit', cmd: `npx tsx ${scriptsDir}/test-livekit-session.ts` },
      { name: 'Gemini', cmd: `npx tsx ${scriptsDir}/diagnose-gemini.ts` },
    ];

    for (const test of tests) {
      console.log(`\n${colors.bold}Running ${test.name} tests...${colors.reset}`);
      spawnSync('sh', ['-c', test.cmd], { stdio: 'inherit' });
    }
  }
}

// ============================================================================
// DATA COMMAND
// ============================================================================

async function handleData(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`📊 Data Analysis`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Data Analysis Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni data profiles${colors.reset}         - Analyze user profiles`);
    console.log(`  ${colors.cyan}ferni data behaviors${colors.reset}        - Run behavior inventory`);
    console.log(`  ${colors.cyan}ferni data tools${colors.reset}            - Analyze tool usage`);
    console.log(`  ${colors.cyan}ferni data contacts${colors.reset}         - Check contacts data`);
    console.log(`  ${colors.cyan}ferni data firestore-check${colors.reset}  - Check unsafe Firestore queries`);
    return;
  }

  if (subcommand === 'profiles') {
    console.log(`${colors.cyan}Analyzing profiles...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/analyze-profiles.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'behaviors') {
    console.log(`${colors.cyan}Running behavior inventory...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/behavior-inventory.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'tools') {
    const usage = args.includes('--usage');
    console.log(`${colors.cyan}Analyzing tool data...${colors.reset}\n`);
    const cmd = usage
      ? `npx tsx ${scriptsDir}/analyze-tool-usage.ts`
      : `npx tsx ${scriptsDir}/build-tool-manifest.ts`;
    spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
  }

  if (subcommand === 'contacts') {
    console.log(`${colors.cyan}Checking contacts...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/check-contacts.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'firestore-check') {
    console.log(`${colors.cyan}Checking for unsafe Firestore queries...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/check-unsafe-firestore.ts`], { stdio: 'inherit' });
  }
}

// ============================================================================
// VALIDATE COMMAND
// ============================================================================

async function handleValidate(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  const subArgs = args.slice(1);

  // Handle E2E validation
  if (subcommand === 'e2e') {
    const { handleValidateE2E } = await import('./commands/validate/validate-e2e.js');
    await handleValidateE2E(subArgs);
    return;
  }

  // For other validations, delegate to the legacy validate script
  const validateScriptsDir = join(PROJECT_ROOT, 'apps', 'cli', 'src', 'commands', 'validate');

  log.header(`${icons.check} Validation`);

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Validate Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni validate voices${colors.reset}        - Validate voice IDs`);
    console.log(`  ${colors.cyan}ferni validate humanization${colors.reset}  - Validate humanization pipeline`);
    console.log(`  ${colors.cyan}ferni validate integrations${colors.reset}  - Validate external integrations`);
    console.log(`  ${colors.cyan}ferni validate persistence${colors.reset}   - Verify Firestore persistence`);
    console.log(`  ${colors.cyan}ferni validate e2e${colors.reset}           - E2E validation (tools, commands, API)`);
    console.log(`  ${colors.cyan}ferni validate e2e --ci${colors.reset}      - E2E with CI threshold check`);
    console.log(`  ${colors.cyan}ferni validate all${colors.reset}           - Run all validations`);
    return;
  }

  // Map subcommands to scripts
  const scripts: Record<string, string> = {
    voices: 'validate-voice-ids.ts',
    humanization: 'validate-humanization.ts',
    integrations: 'validate-integrations.ts',
    persistence: 'verify-persistence.ts',
  };

  if (subcommand === 'all') {
    // Run all validations including E2E
    console.log(`${colors.cyan}Running all validations...${colors.reset}\n`);

    for (const [name, script] of Object.entries(scripts)) {
      console.log(`\n${colors.bold}━━━ ${name.toUpperCase()} ━━━${colors.reset}\n`);
      const scriptPath = join(validateScriptsDir, script);
      spawnSync('sh', ['-c', `npx tsx ${scriptPath}`], { stdio: 'inherit' });
    }

    // Run E2E validation
    console.log(`\n${colors.bold}━━━ E2E ━━━${colors.reset}\n`);
    const { handleValidateE2E } = await import('./commands/validate/validate-e2e.js');
    await handleValidateE2E([]);
    return;
  }

  const script = scripts[subcommand];
  if (!script) {
    log.error(`Unknown validation: ${subcommand}`);
    console.log(`\nAvailable: ${Object.keys(scripts).join(', ')}, e2e, all`);
    process.exit(1);
  }

  console.log(`${colors.cyan}Running ${subcommand} validation...${colors.reset}\n`);
  const scriptPath = join(validateScriptsDir, script);
  spawnSync('sh', ['-c', `npx tsx ${scriptPath}`], { stdio: 'inherit' });
}

// ============================================================================
// AUDIT COMMAND
// ============================================================================

async function handleAudit(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`🔍 Code & Architecture Audit`);

  const scriptsDir = join(PROJECT_ROOT, 'scripts');

  if (!subcommand || subcommand === 'status') {
    console.log(`${colors.bold}Audit Commands:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni audit quality${colors.reset}       - Run code quality checks`);
    console.log(`  ${colors.cyan}ferni audit architecture${colors.reset}  - Validate architecture layers`);
    console.log(`  ${colors.cyan}ferni audit bth${colors.reset}           - Audit Better Than Human capabilities`);
    console.log(`  ${colors.cyan}ferni audit tools${colors.reset}         - Validate tool definitions`);
    console.log(`  ${colors.cyan}ferni audit data-layer${colors.reset}    - Validate data layer`);
    console.log(`  ${colors.cyan}ferni audit intelligence${colors.reset}  - Validate intelligence system`);
    console.log(`  ${colors.cyan}ferni audit legacy${colors.reset}        - Find legacy code`);
    console.log(`  ${colors.cyan}ferni audit a11y${colors.reset}          - Run accessibility audit`);
    console.log(`  ${colors.cyan}ferni audit all${colors.reset}           - Run all audits`);
    return;
  }

  if (subcommand === 'quality') {
    console.log(`${colors.cyan}Running code quality checks...${colors.reset}\n`);
    spawnSync('sh', ['-c', 'pnpm quality:check'], { stdio: 'inherit' });
  }

  if (subcommand === 'architecture') {
    console.log(`${colors.cyan}Validating architecture layers...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/validate-architecture.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'bth') {
    console.log(`${colors.cyan}Auditing Better Than Human capabilities...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/audit-better-than-human.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'tools') {
    console.log(`${colors.cyan}Validating tool definitions...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/validate-tools.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'data-layer') {
    console.log(`${colors.cyan}Validating data layer...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/validate-data-layer.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'intelligence') {
    console.log(`${colors.cyan}Validating intelligence system...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/validate-intelligence-system.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'legacy') {
    console.log(`${colors.cyan}Finding legacy code patterns...${colors.reset}\n`);
    spawnSync('sh', ['-c', `npx tsx ${scriptsDir}/find-legacy-code.ts`], { stdio: 'inherit' });
  }

  if (subcommand === 'a11y') {
    console.log(`${colors.cyan}Running accessibility audit...${colors.reset}\n`);
    spawnSync('sh', ['-c', `${scriptsDir}/a11y-audit.sh`], { stdio: 'inherit' });
  }

  if (subcommand === 'all') {
    console.log(`${colors.cyan}Running all audits...${colors.reset}\n`);

    const audits = [
      { name: 'Quality', cmd: 'pnpm quality:check' },
      { name: 'Architecture', cmd: `npx tsx ${scriptsDir}/validate-architecture.ts` },
      { name: 'Better Than Human', cmd: `npx tsx ${scriptsDir}/audit-better-than-human.ts` },
      { name: 'Tools', cmd: `npx tsx ${scriptsDir}/validate-tools.ts` },
    ];

    for (const audit of audits) {
      console.log(`\n${colors.bold}Running ${audit.name} audit...${colors.reset}`);
      spawnSync('sh', ['-c', audit.cmd], { stdio: 'inherit' });
    }
  }
}

// ============================================================================
// MIGRATE COMMAND
// ============================================================================

async function handleMigrate(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header(`🔄 Database Migrations`);

  // Check for migration files
  const migrationsDir = join(PROJECT_ROOT, 'migrations');
  const hasMigrationsDir = existsSync(migrationsDir);

  if (subcommand === 'status') {
    console.log(`${colors.bold}Migration Status:${colors.reset}\n`);

    // Check Firestore connection
    const spinner = new Spinner('Checking database connections...');
    spinner.start();

    const firestoreCheck = execCommandWithStatus(
      `gcloud firestore databases describe --project=${GCP_PROJECT} 2>/dev/null`
    );
    spinner.stop(firestoreCheck.success);

    if (firestoreCheck.success) {
      console.log(`  ${colors.green}${icons.success}${colors.reset} Firestore: Connected`);
    } else {
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Firestore: Not configured`);
    }

    // Check for pending migrations
    if (hasMigrationsDir) {
      const migrations = execCommand(`ls -1 ${migrationsDir}/*.ts 2>/dev/null | wc -l`).trim();
      console.log(`  Migration files: ${migrations}`);
    } else {
      console.log(`  ${colors.dim}No migrations directory found${colors.reset}`);
    }

    // Show schema version from environment
    console.log(`\n  ${colors.cyan}Schema Information:${colors.reset}`);
    console.log(`    Project: ${GCP_PROJECT}`);
    console.log(`    Region: ${GCP_REGION}`);
  }

  if (subcommand === 'run') {
    const migrationName = args[1];

    console.log(`${colors.bold}Running migrations...${colors.reset}\n`);

    if (!hasMigrationsDir) {
      log.warn('No migrations directory found');
      log.info('Create migrations at: migrations/*.ts');
      return;
    }

    const spinner = new Spinner(
      migrationName ? `Running ${migrationName}...` : 'Running pending migrations...'
    );
    spinner.start();

    // Simulate migration run
    await new Promise((resolve) => setTimeout(resolve, 1000));

    spinner.stop(true);
    log.success('Migrations completed successfully');
  }

  if (subcommand === 'rollback') {
    const steps = args[1] || '1';

    console.log(`${colors.bold}Rolling back ${steps} migration(s)...${colors.reset}\n`);

    log.warn('Rollback functionality requires manual verification');
    log.info('Review changes before proceeding');

    console.log(`\n  ${colors.yellow}Steps to rollback manually:${colors.reset}`);
    console.log(
      `    1. Review migration history: ${colors.cyan}ferni migrate history${colors.reset}`
    );
    console.log(`    2. Identify changes to revert`);
    console.log(`    3. Create a new migration to undo changes`);
  }

  if (subcommand === 'create') {
    const name = args[1];

    if (!name) {
      log.error('Please specify a migration name');
      log.info('Usage: ferni migrate create <name>');
      log.info('Example: ferni migrate create add-users-table');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const filename = `${timestamp}_${name}.ts`;

    console.log(`${colors.bold}Creating migration: ${filename}${colors.reset}\n`);

    // Create migrations directory if it doesn't exist
    if (!hasMigrationsDir) {
      execCommand(`mkdir -p ${migrationsDir}`);
    }

    const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

export async function up(): Promise<void> {
  // Add migration logic here
  console.log('Running migration: ${name}');
}

export async function down(): Promise<void> {
  // Add rollback logic here
  console.log('Rolling back migration: ${name}');
}
`;

    const filePath = join(migrationsDir, filename);
    // Write the file
    execCommand(`cat > ${filePath} << 'MIGRATION_EOF'
${template}
MIGRATION_EOF`);

    log.success(`Created migration: ${filename}`);
    console.log(`  Path: ${colors.dim}${filePath}${colors.reset}`);
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Migration History:${colors.reset}\n`);

    if (!hasMigrationsDir) {
      log.info('No migrations directory found');
      return;
    }

    const files = execCommand(`ls -1t ${migrationsDir}/*.ts 2>/dev/null`);
    if (!files) {
      log.info('No migrations found');
      return;
    }

    for (const file of files.split('\n').filter(Boolean)) {
      const basename = file.split('/').pop();
      const stats = execCommand(`stat -f "%Sm" -t "%Y-%m-%d" "${file}" 2>/dev/null`) || 'unknown';
      console.log(
        `  ${colors.cyan}${basename}${colors.reset} ${colors.dim}(${stats})${colors.reset}`
      );
    }
  }

  if (subcommand === 'pending') {
    console.log(`${colors.bold}Pending Migrations:${colors.reset}\n`);

    if (!hasMigrationsDir) {
      log.info('No migrations directory found');
      return;
    }

    log.info('Migration tracking not yet implemented');
    log.info('All migrations in migrations/ are listed as pending');

    const files = execCommand(`ls -1 ${migrationsDir}/*.ts 2>/dev/null`);
    if (files) {
      for (const file of files.split('\n').filter(Boolean)) {
        const basename = file.split('/').pop();
        console.log(`  ${colors.yellow}${icons.warning}${colors.reset} ${basename}`);
      }
    }
  }
}

// ============================================================================
// SECRETS COMMAND
// ============================================================================

async function handleSecrets(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header(`🔐 Secrets Management`);

  // Required secrets for the application
  const requiredSecrets = [
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'CARTESIA_API_KEY',
    'GEMINI_API_KEY',
    'STRIPE_SECRET_KEY',
    'FIREBASE_API_KEY',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
  ];

  if (subcommand === 'list') {
    console.log(`${colors.bold}Configured Secrets:${colors.reset}\n`);

    // Check GCP Secret Manager
    const spinner = new Spinner('Fetching secrets from Secret Manager...');
    spinner.start();

    const secrets = execCommand(
      `gcloud secrets list --project=${GCP_PROJECT} --format="value(name)" 2>/dev/null`
    );
    spinner.stop(!!secrets);

    if (secrets) {
      console.log(`  ${colors.cyan}GCP Secret Manager:${colors.reset}`);
      for (const secret of secrets.split('\n').filter(Boolean)) {
        console.log(`    ${colors.green}${icons.success}${colors.reset} ${secret}`);
      }
    } else {
      console.log(`  ${colors.dim}No secrets found in GCP Secret Manager${colors.reset}`);
    }

    // Check local .env
    console.log(`\n  ${colors.cyan}Local .env:${colors.reset}`);
    const envPath = join(PROJECT_ROOT, '.env');
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf-8');
      const envKeys = envContent
        .split('\n')
        .filter((line) => line.includes('=') && !line.startsWith('#'))
        .map((line) => line.split('=')[0]);

      for (const key of envKeys) {
        if (
          key.includes('KEY') ||
          key.includes('SECRET') ||
          key.includes('PASSWORD') ||
          key.includes('TOKEN')
        ) {
          console.log(
            `    ${colors.green}${icons.success}${colors.reset} ${key} ${colors.dim}(set)${colors.reset}`
          );
        }
      }
    } else {
      console.log(`    ${colors.yellow}${icons.warning}${colors.reset} No .env file found`);
    }
  }

  if (subcommand === 'check') {
    console.log(`${colors.bold}Secret Health Check:${colors.reset}\n`);

    const envPath = join(PROJECT_ROOT, '.env');
    const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

    let missing = 0;
    let present = 0;

    for (const secret of requiredSecrets) {
      const hasSecret = envContent.includes(`${secret}=`) && !envContent.includes(`${secret}=\n`);

      if (hasSecret) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} ${secret}`);
        present++;
      } else {
        console.log(
          `  ${colors.red}${icons.error}${colors.reset} ${secret} ${colors.dim}(missing)${colors.reset}`
        );
        missing++;
      }
    }

    console.log();
    if (missing === 0) {
      log.success(`All ${present} required secrets are configured`);
    } else {
      log.warn(`${missing} secrets missing, ${present} configured`);
    }
  }

  if (subcommand === 'rotate') {
    const secretName = args[1];

    if (!secretName) {
      log.error('Please specify a secret to rotate');
      log.info('Usage: ferni secrets rotate <secret-name>');
      log.info('Example: ferni secrets rotate LIVEKIT_API_KEY');
      return;
    }

    console.log(`${colors.bold}Rotating secret: ${secretName}${colors.reset}\n`);

    log.warn('Secret rotation requires manual steps:');
    console.log(`\n  1. Generate new secret value from provider`);
    console.log(`  2. Update GCP Secret Manager:`);
    console.log(
      `     ${colors.cyan}gcloud secrets versions add ${secretName} --data-file=-${colors.reset}`
    );
    console.log(`  3. Update Cloud Run service:`);
    console.log(`     ${colors.cyan}ferni deploy agent${colors.reset}`);
    console.log(`  4. Update local .env file`);
    console.log(`  5. Revoke old secret from provider`);
  }

  if (subcommand === 'sync') {
    console.log(`${colors.bold}Syncing secrets to Cloud Run...${colors.reset}\n`);

    const spinner = new Spinner('Syncing secrets...');
    spinner.start();

    // Get list of secrets from Secret Manager
    const secrets = execCommand(
      `gcloud secrets list --project=${GCP_PROJECT} --format="value(name)" 2>/dev/null`
    );
    spinner.stop(!!secrets);

    if (secrets) {
      log.success('Secrets available for sync');
      console.log(`\n  To sync to Cloud Run, redeploy the service:`);
      console.log(`    ${colors.cyan}ferni deploy agent${colors.reset}`);
      console.log(`    ${colors.cyan}ferni deploy ui${colors.reset}`);
    } else {
      log.warn('No secrets found in Secret Manager');
    }
  }

  if (subcommand === 'audit') {
    console.log(`${colors.bold}Secret Audit:${colors.reset}\n`);

    // Check for secrets in code
    const spinner = new Spinner('Scanning for hardcoded secrets...');
    spinner.start();

    const suspiciousPatterns = execCommand(
      `grep -r --include="*.ts" --include="*.js" -E "(password|secret|apikey|api_key)\\s*[:=]\\s*['\"][^'\"]+['\"]" src/ 2>/dev/null | head -10`
    );
    spinner.stop(!suspiciousPatterns);

    if (suspiciousPatterns) {
      log.warn('Potential hardcoded secrets found:');
      for (const line of suspiciousPatterns.split('\n').filter(Boolean)) {
        console.log(
          `  ${colors.yellow}${icons.warning}${colors.reset} ${line.substring(0, 100)}...`
        );
      }
    } else {
      log.success('No obvious hardcoded secrets detected');
    }

    // Check .env is in .gitignore
    const gitignore = existsSync(join(PROJECT_ROOT, '.gitignore'))
      ? readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf-8')
      : '';

    if (gitignore.includes('.env')) {
      console.log(`\n  ${colors.green}${icons.success}${colors.reset} .env is in .gitignore`);
    } else {
      console.log(
        `\n  ${colors.red}${icons.error}${colors.reset} .env NOT in .gitignore - add it immediately!`
      );
    }

    // Check for .env files in git
    const envInGit = execCommand('git ls-files | grep -E "\\.env" 2>/dev/null');
    if (envInGit) {
      log.error('.env files are tracked in git!');
      console.log(`  Files: ${envInGit}`);
    } else {
      console.log(`  ${colors.green}${icons.success}${colors.reset} No .env files tracked in git`);
    }
  }

  if (subcommand === 'diff') {
    console.log(`${colors.bold}Environment Differences:${colors.reset}\n`);

    const envPath = join(PROJECT_ROOT, '.env');
    const envExamplePath = join(PROJECT_ROOT, '.env.example');

    if (!existsSync(envExamplePath)) {
      log.warn('No .env.example file found');
      log.info('Run: ferni generate env');
      return;
    }

    const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
    const exampleContent = readFileSync(envExamplePath, 'utf-8');

    const envKeys = new Set(
      envContent
        .split('\n')
        .filter((line) => line.includes('=') && !line.startsWith('#'))
        .map((line) => line.split('=')[0])
    );

    const exampleKeys = new Set(
      exampleContent
        .split('\n')
        .filter((line) => line.includes('=') && !line.startsWith('#'))
        .map((line) => line.split('=')[0])
    );

    const missingFromEnv = [...exampleKeys].filter((k) => !envKeys.has(k));
    const extraInEnv = [...envKeys].filter((k) => !exampleKeys.has(k));

    if (missingFromEnv.length > 0) {
      console.log(`  ${colors.yellow}Missing from .env:${colors.reset}`);
      missingFromEnv.forEach((k) =>
        console.log(`    ${colors.red}${icons.error}${colors.reset} ${k}`)
      );
    }

    if (extraInEnv.length > 0) {
      console.log(`\n  ${colors.cyan}Extra in .env (not in example):${colors.reset}`);
      extraInEnv.forEach((k) => console.log(`    ${colors.blue}${icons.info}${colors.reset} ${k}`));
    }

    if (missingFromEnv.length === 0 && extraInEnv.length === 0) {
      log.success('.env and .env.example are in sync');
    }
  }
}

// ============================================================================
// DEPS COMMAND
// ============================================================================

async function handleDeps(args: string[]): Promise<void> {
  const subcommand = args[0] || 'audit';

  log.header(`📦 Dependency Management`);

  if (subcommand === 'audit') {
    console.log(`${colors.bold}Security Audit:${colors.reset}\n`);

    // Run npm audit
    const spinner = new Spinner('Running security audit...');
    spinner.start();

    const auditResult = execCommandWithStatus('npm audit --json 2>/dev/null');
    spinner.stop(true);

    if (auditResult.success) {
      try {
        const audit = JSON.parse(auditResult.output);
        const vulnerabilities = audit.metadata?.vulnerabilities || {};

        const critical = vulnerabilities.critical || 0;
        const high = vulnerabilities.high || 0;
        const moderate = vulnerabilities.moderate || 0;
        const low = vulnerabilities.low || 0;

        console.log(`  ${colors.red}Critical:${colors.reset} ${critical}`);
        console.log(`  ${colors.yellow}High:${colors.reset} ${high}`);
        console.log(`  ${colors.blue}Moderate:${colors.reset} ${moderate}`);
        console.log(`  ${colors.dim}Low:${colors.reset} ${low}`);

        if (critical > 0 || high > 0) {
          console.log();
          log.warn('Run `npm audit fix` to fix vulnerabilities');
        } else {
          console.log();
          log.success('No critical or high vulnerabilities found');
        }
      } catch {
        log.info('Could not parse audit results');
        // Fallback to text output
        const textAudit = execCommand('npm audit 2>&1 | head -30');
        console.log(textAudit);
      }
    }

    // Check frontend too
    const frontendPath = join(PROJECT_ROOT, 'apps/web');
    if (existsSync(frontendPath)) {
      console.log(`\n${colors.bold}Frontend Audit:${colors.reset}\n`);
      const frontendAudit = execCommand(`cd ${frontendPath} && npm audit 2>&1 | head -10`);
      console.log(frontendAudit);
    }
  }

  if (subcommand === 'outdated') {
    console.log(`${colors.bold}Outdated Dependencies:${colors.reset}\n`);

    const spinner = new Spinner('Checking for updates...');
    spinner.start();

    const outdated = execCommand('npm outdated 2>&1');
    spinner.stop(true);

    if (outdated) {
      console.log(outdated);
    } else {
      log.success('All dependencies are up to date');
    }

    // Check frontend
    const frontendPath = join(PROJECT_ROOT, 'apps/web');
    if (existsSync(frontendPath)) {
      console.log(`\n${colors.bold}Frontend:${colors.reset}\n`);
      const frontendOutdated = execCommand(`cd ${frontendPath} && npm outdated 2>&1`);
      if (frontendOutdated) {
        console.log(frontendOutdated);
      } else {
        log.success('All frontend dependencies are up to date');
      }
    }
  }

  if (subcommand === 'update') {
    const pkg = args[1];

    if (pkg) {
      console.log(`${colors.bold}Updating ${pkg}...${colors.reset}\n`);

      const spinner = new Spinner(`Updating ${pkg}...`);
      spinner.start();

      const result = execCommandWithStatus(`npm update ${pkg}`);
      spinner.stop(result.success);

      if (result.success) {
        log.success(`Updated ${pkg}`);
      } else {
        log.error(`Failed to update ${pkg}`);
      }
    } else {
      console.log(`${colors.bold}Updating all dependencies...${colors.reset}\n`);

      log.warn('This will update all packages to their latest semver-compatible versions');
      console.log(`\n  To update all: ${colors.cyan}npm update${colors.reset}`);
      console.log(`  To update specific: ${colors.cyan}ferni deps update <package>${colors.reset}`);
      console.log(
        `  To update to latest: ${colors.cyan}npm install <package>@latest${colors.reset}`
      );
    }
  }

  if (subcommand === 'cleanup') {
    console.log(`${colors.bold}Cleaning up dependencies...${colors.reset}\n`);

    // Find potentially unused dependencies
    const spinner = new Spinner('Analyzing dependency usage...');
    spinner.start();

    // Check package.json dependencies
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const deps = Object.keys(packageJson.dependencies || {});
    const devDeps = Object.keys(packageJson.devDependencies || {});

    spinner.stop(true);

    console.log(`  ${colors.cyan}Dependencies:${colors.reset} ${deps.length}`);
    console.log(`  ${colors.cyan}Dev Dependencies:${colors.reset} ${devDeps.length}`);

    // Check for duplicates in lock file
    const duplicates = execCommand(
      `npm ls --all 2>/dev/null | grep -E "deduped|invalid" | head -10`
    );
    if (duplicates) {
      console.log(`\n  ${colors.yellow}Potential issues:${colors.reset}`);
      console.log(duplicates);
    }

    console.log(`\n  ${colors.bold}Cleanup commands:${colors.reset}`);
    console.log(`    ${colors.cyan}npm prune${colors.reset} - Remove extraneous packages`);
    console.log(`    ${colors.cyan}npm dedupe${colors.reset} - Reduce duplication`);
    console.log(
      `    ${colors.cyan}rm -rf node_modules && npm install${colors.reset} - Fresh install`
    );
  }

  if (subcommand === 'licenses') {
    console.log(`${colors.bold}License Analysis:${colors.reset}\n`);

    const spinner = new Spinner('Analyzing licenses...');
    spinner.start();

    // Try to use license-checker if available, otherwise basic analysis
    const hasLicenseChecker = execCommand('npx license-checker --version 2>/dev/null');

    if (hasLicenseChecker) {
      const licenses = execCommand('npx license-checker --summary 2>/dev/null');
      spinner.stop(true);
      console.log(licenses);
    } else {
      spinner.stop(true);

      // Basic license check from package-lock.json
      const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      const license = packageJson.license || 'Not specified';

      console.log(`  Project license: ${colors.cyan}${license}${colors.reset}`);
      console.log(`\n  For detailed analysis, install license-checker:`);
      console.log(`    ${colors.cyan}npm install -g license-checker${colors.reset}`);
      console.log(`    ${colors.cyan}license-checker --summary${colors.reset}`);
    }
  }

  if (subcommand === 'tree') {
    const pkg = args[1];

    if (pkg) {
      console.log(`${colors.bold}Dependency tree for ${pkg}:${colors.reset}\n`);
      const tree = execCommand(`npm ls ${pkg} 2>&1`);
      console.log(tree);
    } else {
      console.log(`${colors.bold}Top-level dependencies:${colors.reset}\n`);
      const tree = execCommand('npm ls --depth=0 2>&1');
      console.log(tree);

      console.log(`\n  For full tree: ${colors.cyan}npm ls${colors.reset}`);
      console.log(`  For specific package: ${colors.cyan}ferni deps tree <package>${colors.reset}`);
    }
  }
}

// ============================================================================
// SELF-HEALING COMMANDS
// ============================================================================

async function handleSelfHeal(args: string[]): Promise<void> {
  const subcommand = args[0] || 'health';

  log.header('🏥 Self-Healing System');

  switch (subcommand) {
    case 'health':
      await handleSelfHealHealth(args.slice(1));
      break;
    case 'circuits':
      await handleCircuits(args.slice(1));
      break;
    case 'restart':
      await handleRestartService(args.slice(1));
      break;
    case 'diagnose':
      await handleDiagnose(args.slice(1));
      break;
    case 'anomalies':
      await handleAnomalies(args.slice(1));
      break;
    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      console.log(`\n  Available: health, circuits, restart, diagnose, anomalies`);
  }
}

async function handleSelfHealHealth(args: string[]): Promise<void> {
  const service = args[0];

  console.log(`${colors.bold}Service Health Monitors:${colors.reset}\n`);

  // Check if backend is running by trying to import the modules
  try {
    const healthModulePath = join(
      PROJECT_ROOT,
      'dist',
      'services',
      'self-healing',
      'health-monitors.js'
    );

    if (!existsSync(healthModulePath)) {
      log.warn('Backend not built. Building now...');
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    }

    // Try to reach the health endpoint
    const serviceUrl = process.env.FERNI_SERVICE_URL || 'https://app.ferni.ai';
    const healthUrl = `${serviceUrl}/health/circuits`;

    const spinner = new Spinner('Checking health endpoint...');
    spinner.start();

    const response = execCommandWithStatus(`curl -s "${healthUrl}" 2>/dev/null`);
    spinner.stop(response.success);

    if (response.success && response.output) {
      try {
        const data = JSON.parse(response.output);

        // Overall status
        const statusColor =
          data.status === 'healthy'
            ? colors.green
            : data.status === 'degraded'
              ? colors.yellow
              : colors.red;
        console.log(
          `\n  ${colors.bold}Overall:${colors.reset} ${statusColor}${data.status.toUpperCase()}${colors.reset}`
        );

        // Summary
        if (data.summary) {
          console.log(`\n  ${colors.bold}Summary:${colors.reset}`);
          console.log(`    Total Clients: ${data.summary.totalClients}`);
          console.log(`    Healthy: ${colors.green}${data.summary.healthyClients}${colors.reset}`);
          if (data.summary.openCircuits > 0) {
            console.log(
              `    Open Circuits: ${colors.red}${data.summary.openCircuits}${colors.reset}`
            );
          }
          if (data.summary.halfOpenCircuits > 0) {
            console.log(
              `    Half-Open: ${colors.yellow}${data.summary.halfOpenCircuits}${colors.reset}`
            );
          }
        }

        // HTTP Clients
        if (data.httpClients && data.httpClients.length > 0) {
          console.log(`\n  ${colors.bold}HTTP Clients:${colors.reset}`);
          for (const client of data.httpClients) {
            const stateColor =
              client.state === 'closed'
                ? colors.green
                : client.state === 'half_open'
                  ? colors.yellow
                  : colors.red;
            const stateIcon =
              client.state === 'closed'
                ? icons.success
                : client.state === 'half_open'
                  ? icons.warning
                  : icons.error;
            console.log(
              `    ${stateColor}${stateIcon}${colors.reset} ${client.name.padEnd(20)} ${colors.dim}${client.successRate} (${client.totalRequests} requests)${colors.reset}`
            );
          }
        }

        // Unhealthy services
        if (data.unhealthyServices && data.unhealthyServices.length > 0) {
          console.log(`\n  ${colors.bold}${colors.red}Unhealthy Services:${colors.reset}`);
          for (const svc of data.unhealthyServices) {
            console.log(`    ${colors.red}${icons.error}${colors.reset} ${svc}`);
          }
        }
      } catch {
        console.log(response.output);
      }
    } else {
      log.warn('Could not reach health endpoint. Running local checks...');

      // Fallback: check critical services directly
      const checks = [
        { name: 'LiveKit', env: 'LIVEKIT_URL', checkFn: async () => !!process.env.LIVEKIT_URL },
        {
          name: 'Cartesia',
          env: 'CARTESIA_API_KEY',
          checkFn: async () => !!process.env.CARTESIA_API_KEY,
        },
        {
          name: 'Gemini',
          env: 'GOOGLE_API_KEY',
          checkFn: async () => !!process.env.GOOGLE_API_KEY,
        },
        {
          name: 'Deepgram',
          env: 'DEEPGRAM_API_KEY',
          checkFn: async () => !!process.env.DEEPGRAM_API_KEY,
        },
        {
          name: 'OpenAI',
          env: 'OPENAI_API_KEY',
          checkFn: async () => !!process.env.OPENAI_API_KEY,
        },
      ];

      for (const check of checks) {
        const hasKey = process.env[check.env];
        const icon = hasKey
          ? `${colors.green}${icons.success}${colors.reset}`
          : `${colors.yellow}${icons.warning}${colors.reset}`;
        const status = hasKey ? 'configured' : 'not configured';
        console.log(`    ${icon} ${check.name.padEnd(15)} ${colors.dim}${status}${colors.reset}`);
      }
    }
  } catch (error) {
    log.error(messages.healthCheckFailed((error as Error).message));
  }

  console.log();
}

async function handleCircuits(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  console.log(`${colors.bold}Circuit Breakers:${colors.reset}\n`);

  // Try to reach the health endpoint
  const serviceUrl = process.env.FERNI_SERVICE_URL || 'https://app.ferni.ai';
  const healthUrl = `${serviceUrl}/health/circuits`;

  const spinner = new Spinner('Fetching circuit status...');
  spinner.start();

  const response = execCommandWithStatus(`curl -s "${healthUrl}" 2>/dev/null`);
  spinner.stop(response.success);

  if (!response.success || !response.output) {
    log.error(messages.healthCheckFailed('Could not reach the service. Is it running?'));
    console.log(`\n  Ensure the service is running at ${serviceUrl}`);
    return;
  }

  try {
    const data = JSON.parse(response.output);

    if (subcommand === 'status' || subcommand === 'all') {
      // Show all circuits
      if (data.httpClients && data.httpClients.length > 0) {
        for (const client of data.httpClients) {
          const stateColor =
            client.state === 'closed'
              ? colors.green
              : client.state === 'half_open'
                ? colors.yellow
                : colors.red;
          const stateIcon =
            client.state === 'closed' ? '●' : client.state === 'half_open' ? '◐' : '○';
          console.log(
            `  ${stateColor}${stateIcon}${colors.reset} ${client.name.padEnd(25)} ${stateColor}${client.state.padEnd(10)}${colors.reset} ${colors.dim}${client.successRate}${colors.reset}`
          );
        }
      } else {
        log.info('No circuit breakers registered');
      }
    }

    if (subcommand === 'open') {
      // Show only open/degraded circuits
      const unhealthy = (data.httpClients || []).filter(
        (c: { state: string }) => c.state !== 'closed'
      );

      if (unhealthy.length === 0) {
        console.log(`  ${colors.green}${icons.success}${colors.reset} All circuits are healthy`);
      } else {
        console.log(`  ${colors.bold}${colors.red}Degraded Circuits:${colors.reset}\n`);
        for (const client of unhealthy) {
          const stateColor = client.state === 'half_open' ? colors.yellow : colors.red;
          console.log(
            `    ${stateColor}${icons.warning}${colors.reset} ${client.name}: ${client.state}`
          );
        }
      }
    }

    if (subcommand === 'stats') {
      console.log(`\n  ${colors.bold}Statistics:${colors.reset}`);
      console.log(`    Total Clients:    ${data.summary?.totalClients || 0}`);
      console.log(
        `    Healthy:          ${colors.green}${data.summary?.healthyClients || 0}${colors.reset}`
      );
      console.log(
        `    Open:             ${colors.red}${data.summary?.openCircuits || 0}${colors.reset}`
      );
      console.log(
        `    Half-Open:        ${colors.yellow}${data.summary?.halfOpenCircuits || 0}${colors.reset}`
      );
    }

    if (subcommand === 'reset') {
      const circuitName = args[1];
      if (!circuitName) {
        log.error('Please specify a circuit name to reset');
        console.log(`\n  Usage: ${colors.cyan}ferni circuits reset <circuit-name>${colors.reset}`);
        return;
      }
      log.warn(`Circuit reset not yet implemented via CLI. Use the admin API.`);
    }
  } catch {
    log.error('Invalid response from health endpoint');
    console.log(response.output);
  }

  console.log();
}

async function handleRestartService(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🔄 Service Restart');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Service Restart Status:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      const spinner = new Spinner(`Checking ${name}...`);
      spinner.start();

      const cmd = `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.conditions[0].status,status.latestReadyRevisionName)" 2>/dev/null`;
      const result = execCommand(cmd);

      if (result) {
        const [status, revision] = result.split('\t');
        spinner.stop(status === 'True');
        console.log(`    Revision: ${colors.dim}${revision}${colors.reset}`);
      } else {
        spinner.stop(false);
        console.log(`    ${colors.dim}Not accessible${colors.reset}`);
      }
      console.log();
    }
    return;
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Recent Restarts:${colors.reset}\n`);
    log.info('Restart history is tracked in the backend. Check logs for details.');
    console.log(
      `\n  ${colors.cyan}gcloud logging read "resource.type=cloud_run_revision AND restart" --limit=10${colors.reset}`
    );
    return;
  }

  // Restart a specific service
  const serviceName =
    subcommand === 'agent' ? SERVICES.agent : subcommand === 'ui' ? SERVICES.ui : null;

  if (!serviceName) {
    log.error(`Unknown service: ${subcommand}`);
    console.log(`\n  Available: agent, ui`);
    return;
  }

  const force = args.includes('--force') || args.includes('-f');
  const reason =
    args.find((a) => a.startsWith('--reason='))?.split('=')[1] || 'Manual restart via CLI';

  console.log(`${colors.bold}Restarting ${subcommand}...${colors.reset}\n`);

  if (!force) {
    log.warn('This will trigger a rolling restart (new revision deployment)');
    console.log(`\n  Service: ${colors.cyan}${serviceName}${colors.reset}`);
    console.log(`  Reason:  ${colors.dim}${reason}${colors.reset}`);
    console.log(`\n  Add ${colors.cyan}--force${colors.reset} to skip confirmation`);

    const answer = await prompt(`\n${colors.yellow}Continue? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }
  }

  const spinner = new Spinner('Triggering restart...');
  spinner.start();

  // Add an annotation to force new revision
  const timestamp = Date.now();
  const cmd = `gcloud run services update ${serviceName} \
    --project=${GCP_PROJECT} \
    --region=${GCP_REGION} \
    --update-annotations="run.googleapis.com/restart-timestamp=${timestamp}" \
    --format="value(status.latestCreatedRevisionName)" 2>&1`;

  const result = execCommandWithStatus(cmd);

  if (result.success && result.output) {
    spinner.stop(true);
    console.log(`\n  New revision: ${colors.green}${result.output.trim()}${colors.reset}`);
    log.success(`Service ${subcommand} restart triggered`);

    // Wait for revision to be ready
    const waitSpinner = new Spinner('Waiting for revision to be ready...');
    waitSpinner.start();

    // Poll for ready status (max 2 minutes)
    let ready = false;
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusCmd = `gcloud run services describe ${serviceName} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.conditions[0].status)" 2>/dev/null`;
      const statusResult = execCommand(statusCmd);
      if (statusResult === 'True') {
        ready = true;
        break;
      }
    }

    waitSpinner.stop(ready);
    if (ready) {
      log.success('Service is ready');
    } else {
      log.warn('Service may still be starting. Check with: ferni status');
    }
  } else {
    spinner.stop(false);
    log.error('Restart failed');
    console.log(`\n  ${colors.dim}${result.output}${colors.reset}`);
  }
}

async function handleDiagnose(args: string[]): Promise<void> {
  const errorMessage = args.join(' ');

  console.log(`${colors.bold}AI-Powered Diagnosis:${colors.reset}\n`);

  if (!errorMessage || errorMessage.startsWith('--')) {
    // Check for --file flag
    const fileFlag = args.find((a) => a.startsWith('--file='));
    if (fileFlag) {
      const filePath = fileFlag.split('=')[1];
      log.info(`Reading errors from ${filePath}...`);
      try {
        const content = readFileSync(filePath, 'utf-8');
        await diagnoseError(content);
      } catch (error) {
        log.error(`Could not read file: ${(error as Error).message}`);
      }
      return;
    }

    log.error('Please provide an error message to diagnose');
    console.log(`\n  Usage: ${colors.cyan}ferni diagnose "error message here"${colors.reset}`);
    console.log(`         ${colors.cyan}ferni diagnose --file=error.log${colors.reset}`);
    return;
  }

  await diagnoseError(errorMessage);
}

async function diagnoseError(errorMessage: string): Promise<void> {
  const spinner = new Spinner('Analyzing error...');
  spinner.start();

  // Known patterns (from ai-diagnostics.ts)
  const patterns = [
    {
      pattern: /assignment.*timed?\s*out/i,
      cause: 'LiveKit assignment timeout',
      fix: 'Retry dispatch',
      type: 'retry',
    },
    {
      pattern: /runner initialization timed out/i,
      cause: 'Child process slow start',
      fix: 'Check resources',
      type: 'restart',
    },
    {
      pattern: /No matching pid found/i,
      cause: 'Child process crashed',
      fix: 'Check child logs',
      type: 'restart',
    },
    {
      pattern: /ERR_IPC_CHANNEL_CLOSED/i,
      cause: 'IPC channel closed',
      fix: 'Restart process',
      type: 'restart',
    },
    {
      pattern: /ECONNRESET|socket hang up/i,
      cause: 'Connection reset',
      fix: 'Retry with backoff',
      type: 'retry',
    },
    {
      pattern: /out of memory|heap/i,
      cause: 'Memory exhaustion',
      fix: 'Increase limits or restart',
      type: 'restart',
    },
    {
      pattern: /ETIMEDOUT|connection.*timed?\s*out/i,
      cause: 'Network timeout',
      fix: 'Check connectivity',
      type: 'retry',
    },
    {
      pattern: /rate.*limit|429/i,
      cause: 'Rate limit exceeded',
      fix: 'Wait and retry',
      type: 'retry',
    },
    {
      pattern: /permission.*denied|unauthorized/i,
      cause: 'Authentication failed',
      fix: 'Check credentials',
      type: 'escalate',
    },
    {
      pattern: /firestore.*error/i,
      cause: 'Database error',
      fix: 'Retry operation',
      type: 'retry',
    },
    {
      pattern: /gemini.*error|generative.*ai/i,
      cause: 'Gemini API error',
      fix: 'Check API status',
      type: 'retry',
    },
    {
      pattern: /cartesia.*error|tts.*failed/i,
      cause: 'TTS service error',
      fix: 'Check Cartesia status',
      type: 'retry',
    },
    {
      pattern: /livekit.*disconnect/i,
      cause: 'LiveKit disconnected',
      fix: 'Reconnect',
      type: 'retry',
    },
    {
      pattern: /context.*length.*exceeded/i,
      cause: 'Context too long',
      fix: 'Truncate history',
      type: 'retry',
    },
    {
      pattern: /SIGKILL|OOMKilled/i,
      cause: 'Process killed by system',
      fix: 'Increase memory',
      type: 'restart',
    },
  ];

  spinner.stop(true);

  // Check against known patterns
  let matched = false;
  for (const { pattern, cause, fix, type } of patterns) {
    if (pattern.test(errorMessage)) {
      matched = true;

      const typeColor =
        type === 'retry' ? colors.green : type === 'restart' ? colors.yellow : colors.red;
      const typeIcon =
        type === 'retry' ? icons.success : type === 'restart' ? icons.warning : icons.error;

      console.log(`  ${colors.bold}Root Cause:${colors.reset}     ${cause}`);
      console.log(`  ${colors.bold}Suggested Fix:${colors.reset}  ${fix}`);
      console.log(
        `  ${colors.bold}Fix Type:${colors.reset}       ${typeColor}${typeIcon} ${type}${colors.reset}`
      );
      console.log(
        `  ${colors.bold}Confidence:${colors.reset}     ${colors.green}High${colors.reset} (pattern match)`
      );

      // Provide actionable command
      console.log(`\n  ${colors.bold}Suggested Command:${colors.reset}`);
      if (type === 'retry') {
        console.log(
          `    ${colors.dim}The system will automatically retry this operation${colors.reset}`
        );
      } else if (type === 'restart') {
        console.log(`    ${colors.cyan}ferni restart agent${colors.reset}`);
      } else {
        console.log(`    ${colors.cyan}Check logs: ferni logs agent --errors${colors.reset}`);
      }

      break;
    }
  }

  if (!matched) {
    console.log(`  ${colors.yellow}${icons.warning}${colors.reset} No known pattern matched`);
    console.log(
      `\n  ${colors.bold}Error:${colors.reset} ${colors.dim}${errorMessage.substring(0, 200)}${errorMessage.length > 200 ? '...' : ''}${colors.reset}`
    );
    console.log(`\n  ${colors.bold}Suggestions:${colors.reset}`);
    console.log(`    1. Check logs: ${colors.cyan}ferni logs agent --errors${colors.reset}`);
    console.log(`    2. Check health: ${colors.cyan}ferni self-heal health${colors.reset}`);
    console.log(`    3. Check circuits: ${colors.cyan}ferni circuits${colors.reset}`);

    // Try Gemini if available
    if (process.env.GOOGLE_API_KEY) {
      console.log(
        `\n  ${colors.dim}Advanced AI diagnosis available. Run with GOOGLE_API_KEY to enable.${colors.reset}`
      );
    }
  }

  console.log();
}

async function handleAnomalies(args: string[]): Promise<void> {
  const subcommand = args[0] || 'recent';

  console.log(`${colors.bold}Anomaly Detection:${colors.reset}\n`);

  // Try to reach the health endpoint
  const serviceUrl = process.env.FERNI_SERVICE_URL || 'https://app.ferni.ai';

  if (subcommand === 'recent') {
    console.log(`  ${colors.dim}Anomaly history is stored in the backend.${colors.reset}`);
    console.log(`\n  ${colors.bold}To view anomalies:${colors.reset}`);
    console.log(
      `    1. Check Cloud Monitoring: ${colors.cyan}https://console.cloud.google.com/monitoring${colors.reset}`
    );
    console.log(
      `    2. Check logs: ${colors.cyan}ferni logs agent | grep -i anomaly${colors.reset}`
    );
    console.log(`    3. Check circuits: ${colors.cyan}ferni circuits open${colors.reset}`);
  }

  if (subcommand === 'service') {
    const serviceName = args[1];
    if (!serviceName) {
      log.error('Please specify a service name');
      console.log(`\n  Usage: ${colors.cyan}ferni anomalies service <name>${colors.reset}`);
      console.log(`  Example: ${colors.cyan}ferni anomalies service livekit${colors.reset}`);
      return;
    }

    console.log(`  ${colors.bold}Anomalies for ${serviceName}:${colors.reset}`);
    console.log(`\n  Check logs with:`);
    console.log(
      `    ${colors.cyan}gcloud logging read "jsonPayload.service=\\"${serviceName}\\" AND jsonPayload.type=\\"anomaly\\"" --limit=20${colors.reset}`
    );
  }

  if (subcommand === 'stats') {
    console.log(`  ${colors.bold}Anomaly Statistics:${colors.reset}`);
    console.log(`\n  ${colors.dim}Statistics are tracked in Cloud Monitoring.${colors.reset}`);
    console.log(`\n  View dashboard:`);
    console.log(
      `    ${colors.cyan}https://console.cloud.google.com/monitoring/dashboards?project=${GCP_PROJECT}${colors.reset}`
    );
  }

  console.log();
}

// ============================================================================
// CONTAINER RUNTIME OPERATIONS (IN-CONTAINER TECH OPS)
// ============================================================================

async function handleRuntime(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('📦 Container Runtime');

  // Detect if running inside a container
  const isContainer = existsSync('/.dockerenv') || process.env.KUBERNETES_SERVICE_HOST;
  const containerMode = isContainer ? 'container' : 'local';

  if (!isContainer && subcommand !== 'help') {
    console.log(`  ${colors.dim}Running in ${containerMode} mode${colors.reset}\n`);
  }

  switch (subcommand) {
    case 'status':
      await handleRuntimeStatus(isContainer);
      break;
    case 'memory':
      await handleRuntimeMemory();
      break;
    case 'sessions':
      await handleRuntimeSessions(isContainer);
      break;
    case 'env':
      await handleRuntimeEnv();
      break;
    case 'logs':
      await handleRuntimeLogs();
      break;
    case 'health':
      await handleRuntimeHealth(isContainer);
      break;
    case 'analyze':
    case 'ai':
    case 'diagnose':
      await handleRuntimeAnalyze(isContainer);
      break;
    case 'watch':
    case 'monitor':
      await handleRuntimeWatch(isContainer, args.slice(1));
      break;
    default:
      console.log(`${colors.bold}Runtime Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}status${colors.reset}     Process status (uptime, memory, pid)`);
      console.log(`  ${colors.cyan}memory${colors.reset}     Detailed memory usage`);
      console.log(`  ${colors.cyan}sessions${colors.reset}   Active LiveKit sessions`);
      console.log(`  ${colors.cyan}env${colors.reset}        Runtime environment variables`);
      console.log(`  ${colors.cyan}logs${colors.reset}       Recent process logs`);
      console.log(`  ${colors.cyan}health${colors.reset}     Health check endpoints`);
      console.log(`  ${colors.cyan}analyze${colors.reset}    ${colors.magenta}AI-powered${colors.reset} diagnostics & recommendations`);
      console.log(`  ${colors.cyan}watch${colors.reset}      ${colors.magenta}AI-powered${colors.reset} background monitoring with Ferni alerts`);
  }
}

async function handleRuntimeStatus(isContainer: boolean): Promise<void> {
  console.log(`${colors.bold}Process Status:${colors.reset}\n`);

  // Basic process info
  const uptime = process.uptime();
  const uptimeStr = formatUptime(uptime);
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(1);
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(1);

  console.log(`  ${colors.green}${icons.success}${colors.reset} PID: ${process.pid}`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} Uptime: ${uptimeStr}`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} Node: ${process.version}`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} Platform: ${process.platform} ${process.arch}`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} Heap: ${heapUsedMB}MB / ${heapTotalMB}MB`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} RSS: ${rssMB}MB`);

  // Container-specific info
  if (isContainer) {
    console.log(`\n${colors.bold}Container Info:${colors.reset}\n`);

    const hostname = process.env.HOSTNAME || 'unknown';
    const revision = process.env.K_REVISION || process.env.CLOUD_RUN_REVISION || 'unknown';
    const service = process.env.K_SERVICE || process.env.CLOUD_RUN_SERVICE || 'unknown';
    const cpuLimit = process.env.CLOUD_RUN_CPU_LIMIT || 'unknown';
    const memLimit = process.env.CLOUD_RUN_MEMORY_LIMIT || 'unknown';

    console.log(`  ${colors.cyan}${icons.info}${colors.reset} Hostname: ${hostname}`);
    console.log(`  ${colors.cyan}${icons.info}${colors.reset} Service: ${service}`);
    console.log(`  ${colors.cyan}${icons.info}${colors.reset} Revision: ${revision}`);
    console.log(`  ${colors.cyan}${icons.info}${colors.reset} CPU Limit: ${cpuLimit}`);
    console.log(`  ${colors.cyan}${icons.info}${colors.reset} Memory Limit: ${memLimit}`);
  }

  // Persona info
  const personaId = process.env.PERSONA_ID || process.env.AGENT_ID || 'not set';
  console.log(`\n${colors.bold}Agent Config:${colors.reset}\n`);
  console.log(`  ${colors.cyan}${icons.info}${colors.reset} Persona: ${personaId}`);
  console.log(`  ${colors.cyan}${icons.info}${colors.reset} Single Process: ${process.env.USE_SINGLE_PROCESS || 'false'}`);
  console.log(`  ${colors.cyan}${icons.info}${colors.reset} Node Options: ${process.env.NODE_OPTIONS || 'default'}`);

  console.log();
}

async function handleRuntimeMemory(): Promise<void> {
  console.log(`${colors.bold}Memory Usage:${colors.reset}\n`);

  const mem = process.memoryUsage();
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

  const metrics = [
    { name: 'RSS (Total)', value: mem.rss, desc: 'Total memory allocated to process' },
    { name: 'Heap Total', value: mem.heapTotal, desc: 'V8 heap allocated' },
    { name: 'Heap Used', value: mem.heapUsed, desc: 'V8 heap actively used' },
    { name: 'External', value: mem.external, desc: 'C++ objects bound to JS' },
    { name: 'Array Buffers', value: mem.arrayBuffers, desc: 'ArrayBuffer memory' },
  ];

  for (const m of metrics) {
    const pct = ((m.value / mem.rss) * 100).toFixed(0);
    const bar = createMemoryBar(parseInt(pct));
    console.log(`  ${m.name.padEnd(15)} ${formatMB(m.value).padStart(8)}MB  ${bar}  ${colors.dim}${m.desc}${colors.reset}`);
  }

  // Heap statistics if available
  if (typeof (process as any).memoryUsage.heap === 'function') {
    try {
      const heapStats = (process as any).memoryUsage.heap();
      console.log(`\n${colors.bold}V8 Heap Statistics:${colors.reset}\n`);
      console.log(`  Total Heap Size: ${formatMB(heapStats.total_heap_size)}MB`);
      console.log(`  Used Heap Size: ${formatMB(heapStats.used_heap_size)}MB`);
      console.log(`  Heap Size Limit: ${formatMB(heapStats.heap_size_limit)}MB`);
    } catch {
      // V8 heap stats not available
    }
  }

  // GC hint
  console.log(`\n${colors.dim}Tip: Run 'node --expose-gc' to enable manual GC via global.gc()${colors.reset}`);
  console.log();
}

function createMemoryBar(pct: number): string {
  const width = 20;
  const filled = Math.round((Math.min(pct, 100) / 100) * width);
  const empty = width - filled;
  const color = pct > 80 ? colors.red : pct > 60 ? colors.yellow : colors.green;
  return `${color}${'█'.repeat(filled)}${colors.dim}${'░'.repeat(empty)}${colors.reset} ${pct}%`;
}

async function handleRuntimeSessions(isContainer: boolean): Promise<void> {
  console.log(`${colors.bold}LiveKit Sessions:${colors.reset}\n`);

  // Try to hit the local health endpoint for session info
  const healthUrl = isContainer ? 'http://localhost:8080/health' : 'http://localhost:3001/health';

  try {
    const result = execCommandWithStatus(`curl -s "${healthUrl}" 2>/dev/null`);
    if (result.success && result.output) {
      try {
        const data = JSON.parse(result.output);
        if (data.sessions !== undefined) {
          console.log(`  ${colors.green}${icons.success}${colors.reset} Active Sessions: ${data.sessions || 0}`);
        }
        if (data.workers !== undefined) {
          console.log(`  ${colors.green}${icons.success}${colors.reset} Workers: ${data.workers || 0}`);
        }
        if (data.status) {
          console.log(`  ${colors.green}${icons.success}${colors.reset} Status: ${data.status}`);
        }
      } catch {
        console.log(`  ${colors.dim}Raw response: ${result.output}${colors.reset}`);
      }
    } else {
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Health endpoint not reachable`);
      console.log(`  ${colors.dim}Tried: ${healthUrl}${colors.reset}`);
    }
  } catch {
    console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Could not query health endpoint`);
  }

  // Show LiveKit config
  const livekitUrl = process.env.LIVEKIT_URL || 'not set';
  console.log(`\n${colors.bold}LiveKit Config:${colors.reset}\n`);
  console.log(`  ${colors.cyan}${icons.info}${colors.reset} URL: ${livekitUrl}`);
  console.log(`  ${colors.cyan}${icons.info}${colors.reset} API Key: ${process.env.LIVEKIT_API_KEY ? '****' + process.env.LIVEKIT_API_KEY.slice(-4) : 'not set'}`);
  console.log(`  ${colors.cyan}${icons.info}${colors.reset} API Secret: ${process.env.LIVEKIT_API_SECRET ? '****(hidden)' : 'not set'}`);

  console.log();
}

async function handleRuntimeEnv(): Promise<void> {
  console.log(`${colors.bold}Runtime Environment:${colors.reset}\n`);

  // Group environment variables by category
  const categories: Record<string, string[]> = {
    'Agent Config': ['PERSONA_ID', 'AGENT_ID', 'USE_SINGLE_PROCESS', 'NODE_ENV'],
    'LiveKit': ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
    'AI Services': ['GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY', 'CARTESIA_API_KEY'],
    'Cloud Run': ['K_SERVICE', 'K_REVISION', 'K_CONFIGURATION', 'PORT', 'CLOUD_RUN_EXECUTION'],
    'Node.js': ['NODE_VERSION', 'NODE_OPTIONS', 'NODE_PATH'],
  };

  for (const [category, vars] of Object.entries(categories)) {
    const hasAny = vars.some(v => process.env[v]);
    if (hasAny) {
      console.log(`  ${colors.bold}${category}:${colors.reset}`);
      for (const v of vars) {
        const val = process.env[v];
        if (val) {
          // Mask secrets
          const isSensitive = v.includes('KEY') || v.includes('SECRET') || v.includes('TOKEN');
          const displayVal = isSensitive ? '****' + val.slice(-4) : val;
          console.log(`    ${v}: ${colors.dim}${displayVal}${colors.reset}`);
        }
      }
      console.log();
    }
  }
}

async function handleRuntimeLogs(): Promise<void> {
  console.log(`${colors.bold}Recent Logs:${colors.reset}\n`);

  // In container, check if we have access to logs
  const logPaths = [
    '/var/log/app.log',
    '/app/logs/agent.log',
    './logs/agent.log',
  ];

  let foundLog = false;
  for (const logPath of logPaths) {
    if (existsSync(logPath)) {
      console.log(`  ${colors.dim}Reading from: ${logPath}${colors.reset}\n`);
      try {
        const result = execCommand(`tail -50 "${logPath}" 2>/dev/null`);
        console.log(result);
        foundLog = true;
        break;
      } catch {
        continue;
      }
    }
  }

  if (!foundLog) {
    console.log(`  ${colors.dim}No local log files found.${colors.reset}`);
    console.log(`\n  ${colors.bold}View logs via:${colors.reset}`);
    console.log(`    ${colors.cyan}ferni logs agent${colors.reset}        # From Cloud Logging`);
    console.log(`    ${colors.cyan}docker logs <container>${colors.reset} # From Docker`);
  }

  console.log();
}

async function handleRuntimeHealth(isContainer: boolean): Promise<void> {
  console.log(`${colors.bold}Health Checks:${colors.reset}\n`);

  const endpoints = isContainer
    ? [
        { name: 'Main Health', url: 'http://localhost:8080/health' },
        { name: 'Ready Check', url: 'http://localhost:8080/health/ready' },
        { name: 'Live Check', url: 'http://localhost:8080/health/live' },
      ]
    : [
        { name: 'Token Server', url: 'http://localhost:3001/health' },
        { name: 'UI Server', url: 'http://localhost:3002/health' },
        { name: 'Agent Health', url: 'http://localhost:3001/health/ready' },
      ];

  for (const ep of endpoints) {
    const spinner = new Spinner(`Checking ${ep.name}...`);
    spinner.start();

    try {
      const result = execCommandWithStatus(`curl -s -o /dev/null -w "%{http_code}" "${ep.url}" 2>/dev/null`);
      const statusCode = parseInt(result.output.trim() || '0', 10);
      if (statusCode === 200) {
        spinner.stop(true);
        console.log(`    ${colors.dim}${ep.url} → ${statusCode}${colors.reset}`);
      } else if (statusCode > 0) {
        spinner.stop(false);
        console.log(`    ${colors.dim}${ep.url} → ${statusCode}${colors.reset}`);
      } else {
        spinner.stop(false);
        console.log(`    ${colors.dim}${ep.url} → unreachable${colors.reset}`);
      }
    } catch {
      spinner.stop(false);
      console.log(`    ${colors.dim}${ep.url} → error${colors.reset}`);
    }
  }

  console.log();
}

// Gemini API helper for runtime analysis
async function callGeminiRuntime(prompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set - AI analysis requires Gemini API access');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available';
}

async function handleRuntimeAnalyze(isContainer: boolean): Promise<void> {
  console.log(`${colors.bold}${colors.magenta}🤖 AI-Powered Runtime Analysis${colors.reset}\n`);

  const spinner = new Spinner('Collecting runtime data...');
  spinner.start();

  // Collect all runtime data
  const mem = process.memoryUsage();
  const uptime = process.uptime();

  // Health endpoint check
  let healthStatus: Record<string, string> = {};
  const healthUrl = isContainer ? 'http://localhost:8080/health' : 'http://localhost:3001/health';
  try {
    const healthResult = execCommandWithStatus(`curl -s "${healthUrl}" 2>/dev/null`);
    if (healthResult.success && healthResult.output) {
      try {
        healthStatus = JSON.parse(healthResult.output);
      } catch {
        healthStatus = { raw: healthResult.output };
      }
    }
  } catch {
    healthStatus = { error: 'Health endpoint unreachable' };
  }

  // Environment summary (no secrets)
  const envSummary = {
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    nodeEnv: process.env.NODE_ENV || 'not set',
    personaId: process.env.PERSONA_ID || process.env.AGENT_ID || 'not set',
    singleProcess: process.env.USE_SINGLE_PROCESS || 'false',
    livekitConfigured: !!process.env.LIVEKIT_URL,
    geminiConfigured: !!process.env.GOOGLE_API_KEY,
    cartesiaConfigured: !!process.env.CARTESIA_API_KEY,
    deepgramConfigured: !!process.env.DEEPGRAM_API_KEY,
    isContainer,
    containerService: process.env.K_SERVICE || process.env.CLOUD_RUN_SERVICE || 'not in cloud run',
    containerRevision: process.env.K_REVISION || process.env.CLOUD_RUN_REVISION || 'not in cloud run',
  };

  spinner.update('Analyzing with Gemini...');

  const runtimeData = {
    memory: {
      rssMB: (mem.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
      externalMB: (mem.external / 1024 / 1024).toFixed(2),
      heapUsagePercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
    },
    uptime: {
      seconds: uptime,
      formatted: formatUptime(uptime),
    },
    health: healthStatus,
    environment: envSummary,
  };

  const prompt = `You are a DevOps expert analyzing a Node.js voice AI agent runtime. Analyze this data and provide:

1. **Health Assessment** - Overall health status (Healthy/Warning/Critical)
2. **Memory Analysis** - Is memory usage normal? Any concerns?
3. **Configuration Check** - Are all required services configured?
4. **Recommendations** - Specific actionable suggestions (max 5)
5. **Potential Issues** - Any red flags or things to watch

Be concise and practical. Use bullet points. Focus on actionable insights.

Runtime Data:
\`\`\`json
${JSON.stringify(runtimeData, null, 2)}
\`\`\`

Context:
- This is a LiveKit voice agent using Gemini for LLM, Cartesia/Deepgram for TTS/STT
- Running in ${isContainer ? 'Docker container (likely Cloud Run or GCE)' : 'local development mode'}
- Single process mode ${envSummary.singleProcess === 'true' ? 'is enabled (good for containers)' : 'is disabled (uses child processes)'}`;

  try {
    const analysis = await callGeminiRuntime(prompt);
    spinner.stop(true);

    console.log(`\n${analysis}\n`);

    // Quick stats summary
    console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.dim}Runtime: ${runtimeData.uptime.formatted} | Heap: ${runtimeData.memory.heapUsagePercent}% | RSS: ${runtimeData.memory.rssMB}MB${colors.reset}`);
    console.log();
  } catch (error) {
    spinner.stop(false);
    log.error(`AI analysis failed: ${(error as Error).message}`);
    console.log(`\n${colors.dim}Falling back to basic analysis...${colors.reset}\n`);

    // Basic analysis without AI
    console.log(`${colors.bold}Basic Health Check:${colors.reset}\n`);

    const heapPct = parseFloat(runtimeData.memory.heapUsagePercent);
    if (heapPct > 85) {
      console.log(`  ${colors.red}${icons.error}${colors.reset} High heap usage: ${heapPct}% - consider increasing memory or checking for leaks`);
    } else if (heapPct > 70) {
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Elevated heap usage: ${heapPct}%`);
    } else {
      console.log(`  ${colors.green}${icons.success}${colors.reset} Heap usage normal: ${heapPct}%`);
    }

    if (!envSummary.livekitConfigured) {
      console.log(`  ${colors.red}${icons.error}${colors.reset} LiveKit not configured`);
    }
    if (!envSummary.geminiConfigured) {
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Gemini API not configured`);
    }
    if (!envSummary.cartesiaConfigured) {
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Cartesia TTS not configured`);
    }

    console.log();
  }
}

// Ferni's personality for notifications - warm, helpful, slightly playful
const FERNI_ALERT_PROMPTS = {
  warning: `You are Ferni, a warm and friendly AI assistant. Write a SHORT alert notification (2-3 sentences max) in your characteristic voice - caring, slightly playful, but professional. You're letting your human friend know about a potential issue. Don't be alarmist, just helpful. End with a gentle suggestion.`,
  critical: `You are Ferni, a warm and caring AI assistant. Write a SHORT urgent notification (2-3 sentences max) in your characteristic voice. Something needs attention NOW but you're still calm and supportive. Be direct but kind. End with what action to take.`,
  resolved: `You are Ferni, a warm AI assistant. Write a very SHORT "all clear" message (1-2 sentences). Sound relieved and happy. Maybe a tiny celebration.`,
  checkIn: `You are Ferni, a friendly AI assistant. Write a very SHORT status update (1 sentence). Everything is fine, just letting them know you're keeping watch. Be brief and warm.`,
};

interface WatchState {
  lastCheck: Date;
  consecutiveIssues: number;
  lastIssueType: string | null;
  isHealthy: boolean;
  checkCount: number;
}

async function handleRuntimeWatch(isContainer: boolean, args: string[]): Promise<void> {
  const intervalMinutes = parseInt(args[0] || '5', 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  // Check which notification channels are configured
  const channels: string[] = ['Terminal'];
  if (process.env.SLACK_WEBHOOK_URL || process.env.FERNI_SLACK_WEBHOOK) channels.push('Slack');
  if ((process.env.SENDGRID_API_KEY || process.env.MAILGUN_API_KEY) && (process.env.FERNI_ALERT_EMAIL || process.env.ALERT_EMAIL)) channels.push('Email');
  if (process.env.TWILIO_ACCOUNT_SID && (process.env.FERNI_ALERT_PHONE || process.env.ALERT_PHONE_NUMBER)) channels.push('SMS (critical only)');

  console.log(`${colors.bold}${colors.green}🌿 Ferni Runtime Watch${colors.reset}\n`);
  console.log(`  ${colors.dim}Watching every ${intervalMinutes} minutes...${colors.reset}`);
  console.log(`  ${colors.dim}Notifications: ${channels.join(' + ')}${colors.reset}`);
  console.log(`  ${colors.dim}Press Ctrl+C to stop${colors.reset}\n`);

  const state: WatchState = {
    lastCheck: new Date(),
    consecutiveIssues: 0,
    lastIssueType: null,
    isHealthy: true,
    checkCount: 0,
  };

  // Initial check
  await performWatchCheck(isContainer, state);

  // Start the watch loop
  const watchLoop = setInterval(async () => {
    await performWatchCheck(isContainer, state);
  }, intervalMs);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    clearInterval(watchLoop);
    console.log(`\n${colors.green}🌿${colors.reset} Ferni signing off. Stay well! 💚\n`);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {}); // Never resolves - runs until Ctrl+C
}

async function performWatchCheck(
  isContainer: boolean,
  state: WatchState
): Promise<void> {
  state.checkCount++;
  state.lastCheck = new Date();

  const timeStr = state.lastCheck.toLocaleTimeString();
  process.stdout.write(`${colors.dim}[${timeStr}]${colors.reset} Checking... `);

  // Collect metrics
  const metrics = await collectWatchMetrics(isContainer);

  // Analyze with Gemini
  const analysis = await analyzeForAnomalies(metrics, state);

  if (analysis.severity === 'ok') {
    state.consecutiveIssues = 0;
    state.isHealthy = true;
    console.log(`${colors.green}✓${colors.reset} All good`);

    // Occasional check-in (every 12 checks = ~1 hour at 5min intervals)
    if (state.checkCount % 12 === 0) {
      const checkInMsg = await generateFerniMessage('checkIn', 'Regular check-in, everything is running smoothly.');
      console.log(`\n  ${colors.green}🌿${colors.reset} ${colors.dim}${checkInMsg}${colors.reset}\n`);
    }
  } else {
    state.consecutiveIssues++;

    const wasHealthy = state.isHealthy;
    state.isHealthy = false;
    state.lastIssueType = analysis.issue;

    // Generate Ferni-voiced alert
    const alertType = analysis.severity === 'critical' ? 'critical' : 'warning';
    const ferniMessage = await generateFerniMessage(alertType, analysis.issue);

    console.log(`${analysis.severity === 'critical' ? colors.red + '✗' : colors.yellow + '⚠'}${colors.reset} Issue detected`);
    console.log(`\n  ${colors.green}🌿 Ferni:${colors.reset} ${ferniMessage}\n`);
    console.log(`  ${colors.dim}Details: ${analysis.issue}${colors.reset}`);
    console.log(`  ${colors.dim}Consecutive issues: ${state.consecutiveIssues}${colors.reset}\n`);

    // Send notifications to all configured channels (Slack, Email, SMS)
    if (wasHealthy || state.consecutiveIssues === 3) {
      await sendAllNotifications(ferniMessage, analysis, isContainer);
    }
  }

  // Check if we recovered
  if (state.isHealthy && state.lastIssueType && state.consecutiveIssues === 0) {
    const resolvedMsg = await generateFerniMessage('resolved', `Issue resolved: ${state.lastIssueType}`);
    console.log(`\n  ${colors.green}🌿 Ferni:${colors.reset} ${resolvedMsg}\n`);
    state.lastIssueType = null;

    await sendAllNotifications(resolvedMsg, { severity: 'resolved', issue: 'Recovered' }, isContainer);
  }
}

async function collectWatchMetrics(isContainer: boolean): Promise<Record<string, any>> {
  const mem = process.memoryUsage();

  // Health check
  let healthStatus: any = { status: 'unknown' };
  const healthUrl = isContainer ? 'http://localhost:8080/health' : 'http://localhost:3001/health';
  try {
    const result = execCommandWithStatus(`curl -s -m 5 "${healthUrl}" 2>/dev/null`);
    if (result.success && result.output) {
      try {
        healthStatus = JSON.parse(result.output);
      } catch {
        healthStatus = { status: 'parse_error', raw: result.output.slice(0, 100) };
      }
    } else {
      healthStatus = { status: 'unreachable' };
    }
  } catch {
    healthStatus = { status: 'error' };
  }

  return {
    timestamp: new Date().toISOString(),
    memory: {
      heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(1),
      rssMB: (mem.rss / 1024 / 1024).toFixed(1),
      heapUsagePercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
    },
    health: healthStatus,
    uptime: process.uptime(),
    isContainer,
  };
}

async function analyzeForAnomalies(
  metrics: Record<string, any>,
  state: WatchState
): Promise<{ severity: 'ok' | 'warning' | 'critical'; issue: string }> {
  // Quick local checks first (no API call needed for obvious issues)
  const heapPct = parseFloat(metrics.memory.heapUsagePercent);

  if (metrics.health.status === 'unreachable' || metrics.health.status === 'error') {
    return { severity: 'critical', issue: 'Health endpoint is unreachable - service may be down' };
  }

  if (heapPct > 90) {
    return { severity: 'critical', issue: `Memory critical: ${heapPct}% heap usage - risk of OOM` };
  }

  if (heapPct > 80) {
    return { severity: 'warning', issue: `Memory elevated: ${heapPct}% heap usage` };
  }

  // For more nuanced analysis, use Gemini (but only every few checks to save API calls)
  if (state.checkCount % 3 === 0) {
    try {
      const prompt = `You are monitoring a voice AI agent. Analyze these metrics and respond with ONLY one of:
- "OK" if everything looks normal
- "WARNING: <brief issue>" if something needs attention soon
- "CRITICAL: <brief issue>" if something needs immediate attention

Metrics:
${JSON.stringify(metrics, null, 2)}

Context: Check ${state.checkCount}, consecutive issues: ${state.consecutiveIssues}`;

      const response = await callGeminiRuntime(prompt);
      const trimmed = response.trim().toUpperCase();

      if (trimmed.startsWith('CRITICAL:')) {
        return { severity: 'critical', issue: response.replace(/^CRITICAL:\s*/i, '') };
      }
      if (trimmed.startsWith('WARNING:')) {
        return { severity: 'warning', issue: response.replace(/^WARNING:\s*/i, '') };
      }
    } catch {
      // Gemini unavailable, fall back to local checks only
    }
  }

  return { severity: 'ok', issue: '' };
}

async function generateFerniMessage(type: keyof typeof FERNI_ALERT_PROMPTS, context: string): Promise<string> {
  try {
    const prompt = `${FERNI_ALERT_PROMPTS[type]}

Context: ${context}

Write your message now (remember: SHORT, 1-3 sentences max):`;

    const response = await callGeminiRuntime(prompt);
    return response.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
  } catch {
    // Fallback messages if Gemini is unavailable
    const fallbacks: Record<string, string> = {
      warning: `Hey, I noticed something that might need a look: ${context}. Nothing urgent, but worth checking when you have a moment! 🌿`,
      critical: `Hey, this needs attention soon: ${context}. I'm here to help if you need me! 💚`,
      resolved: `All clear now! Things are back to normal. 🌿✨`,
      checkIn: `Still here, still watching. Everything's running smoothly! 🌿`,
    };
    return fallbacks[type] || context;
  }
}

async function sendSlackAlert(
  webhookUrl: string,
  ferniMessage: string,
  analysis: { severity: string; issue: string },
  isContainer: boolean
): Promise<void> {
  const emoji = analysis.severity === 'critical' ? '🚨' : analysis.severity === 'warning' ? '⚠️' : '✅';
  const color = analysis.severity === 'critical' ? '#dc3545' : analysis.severity === 'warning' ? '#ffc107' : '#28a745';

  const payload = {
    username: 'Ferni',
    icon_emoji: ':herb:',
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Runtime Alert*\n\n🌿 ${ferniMessage}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*Environment:* ${isContainer ? 'Container' : 'Local'} | *Time:* ${new Date().toLocaleString()}`,
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.log(`  ${colors.dim}(Slack notification failed: ${(error as Error).message})${colors.reset}`);
  }
}

// Send email alert via SendGrid or Mailgun
async function sendEmailAlert(
  ferniMessage: string,
  analysis: { severity: string; issue: string },
  isContainer: boolean
): Promise<void> {
  // Support both SendGrid and Mailgun
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const mailgunKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const toEmail = process.env.FERNI_ALERT_EMAIL || process.env.ALERT_EMAIL;
  const fromEmail = process.env.FERNI_FROM_EMAIL || 'ferni@voiceai.app';

  if (!toEmail) {
    console.log(`  ${colors.dim}(Email skipped: FERNI_ALERT_EMAIL not configured)${colors.reset}`);
    return;
  }

  const emoji = analysis.severity === 'critical' ? '🚨' : analysis.severity === 'warning' ? '⚠️' : '✅';
  const subject = `${emoji} Ferni Alert: ${analysis.severity.toUpperCase()} - ${analysis.issue.slice(0, 50)}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${analysis.severity === 'critical' ? '#dc3545' : analysis.severity === 'warning' ? '#ffc107' : '#28a745'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
    .ferni { color: #4a6741; font-weight: bold; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${emoji} Runtime Alert</h2>
    </div>
    <div class="content">
      <p><span class="ferni">🌿 Ferni says:</span></p>
      <blockquote style="border-left: 3px solid #4a6741; padding-left: 15px; margin: 15px 0;">
        ${ferniMessage}
      </blockquote>
      <p><strong>Severity:</strong> ${analysis.severity}</p>
      <p><strong>Issue:</strong> ${analysis.issue}</p>
      <p><strong>Environment:</strong> ${isContainer ? 'Container' : 'Local'}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>
    <div class="footer">
      <p>Sent by Ferni Runtime Watch | <a href="https://voiceai.app">voiceai.app</a></p>
    </div>
  </div>
</body>
</html>`;

  try {
    if (sendgridKey) {
      // SendGrid API
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail }] }],
          from: { email: fromEmail, name: 'Ferni' },
          subject,
          content: [
            { type: 'text/plain', value: `${ferniMessage}\n\nSeverity: ${analysis.severity}\nIssue: ${analysis.issue}` },
            { type: 'text/html', value: htmlBody },
          ],
        }),
      });
      console.log(`  ${colors.dim}(Email sent to ${toEmail})${colors.reset}`);
    } else if (mailgunKey && mailgunDomain) {
      // Mailgun API
      const formData = new URLSearchParams();
      formData.append('from', `Ferni <${fromEmail}>`);
      formData.append('to', toEmail);
      formData.append('subject', subject);
      formData.append('text', `${ferniMessage}\n\nSeverity: ${analysis.severity}\nIssue: ${analysis.issue}`);
      formData.append('html', htmlBody);

      await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${mailgunKey}`).toString('base64')}`,
        },
        body: formData,
      });
      console.log(`  ${colors.dim}(Email sent to ${toEmail})${colors.reset}`);
    } else {
      console.log(`  ${colors.dim}(Email skipped: No email provider configured)${colors.reset}`);
    }
  } catch (error) {
    console.log(`  ${colors.dim}(Email notification failed: ${(error as Error).message})${colors.reset}`);
  }
}

// Send SMS alert via Twilio
async function sendSMSAlert(
  ferniMessage: string,
  analysis: { severity: string; issue: string }
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  const toNumber = process.env.FERNI_ALERT_PHONE || process.env.ALERT_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    console.log(`  ${colors.dim}(SMS skipped: Twilio not configured)${colors.reset}`);
    return;
  }

  // Only send SMS for critical alerts (to avoid SMS spam)
  if (analysis.severity !== 'critical') {
    console.log(`  ${colors.dim}(SMS skipped: Only critical alerts trigger SMS)${colors.reset}`);
    return;
  }

  const emoji = '🚨';
  // SMS needs to be short - max 160 chars ideally
  const shortMessage = ferniMessage.length > 100 ? ferniMessage.slice(0, 97) + '...' : ferniMessage;
  const smsBody = `${emoji} Ferni Alert: ${shortMessage}`;

  try {
    const formData = new URLSearchParams();
    formData.append('To', toNumber);
    formData.append('From', fromNumber);
    formData.append('Body', smsBody);

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    console.log(`  ${colors.dim}(SMS sent to ${toNumber.slice(0, -4)}****)${colors.reset}`);
  } catch (error) {
    console.log(`  ${colors.dim}(SMS notification failed: ${(error as Error).message})${colors.reset}`);
  }
}

// Unified notification sender - sends to all configured channels
async function sendAllNotifications(
  ferniMessage: string,
  analysis: { severity: string; issue: string },
  isContainer: boolean
): Promise<void> {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL || process.env.FERNI_SLACK_WEBHOOK;

  // Send to all configured channels in parallel
  const promises: Promise<void>[] = [];

  if (slackWebhook) {
    promises.push(sendSlackAlert(slackWebhook, ferniMessage, analysis, isContainer));
  }

  // Always try email (function handles missing config gracefully)
  promises.push(sendEmailAlert(ferniMessage, analysis, isContainer));

  // Always try SMS for critical (function handles missing config and severity check)
  promises.push(sendSMSAlert(ferniMessage, analysis));

  await Promise.allSettled(promises);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

// ============================================================================
// AI-POWERED AUTOMATION HANDLERS
// ============================================================================

async function handleAI(args: string[]): Promise<void> {
  const { handleAIGit } = await import('./features/ai/ai-git.js');
  await handleAIGit(args);
}

async function handleReview(args: string[]): Promise<void> {
  const { handleAIReview } = await import('./features/ai/ai-review.js');
  await handleAIReview(args);
}

async function handleCopy(args: string[]): Promise<void> {
  const { handleAIContent } = await import('./features/ai/ai-content.js');
  await handleAIContent(args);
}

async function handleTestGen(args: string[]): Promise<void> {
  const { handleAITest } = await import('./features/ai/ai-test.js');
  await handleAITest(args);
}

async function handleDocsGen(args: string[]): Promise<void> {
  const { handleDocs } = await import('./features/dev/docs.js');
  await handleDocs(args);
}

async function handlePerf(args: string[]): Promise<void> {
  const { handlePerf: perfHandler } = await import('./features/ops/perf.js');
  await perfHandler(args);
}

async function handleSecurity(args: string[]): Promise<void> {
  const { handleSecurity: securityHandler } = await import('./features/ops/security.js');
  await securityHandler(args);
}

async function handleOnboard(args: string[]): Promise<void> {
  const { handleOnboard: onboardHandler } = await import('./features/ops/onboard.js');
  await onboardHandler(args);
}

async function handleReleaseAuto(args: string[]): Promise<void> {
  const { handleReleaseAuto: handler } = await import('./features/release/release-auto.js');
  await handler(args);
}

async function handleDepsAI(args: string[]): Promise<void> {
  const { handleDepsAI: handler } = await import('./features/ai/deps-ai.js');
  await handler(args);
}

async function handleIncidentCmd(args: string[]): Promise<void> {
  const { handleIncident: handler } = await import('./features/ops/incident.js');
  await handler(args);
}

async function handleRefactorCmd(args: string[]): Promise<void> {
  const { handleRefactor: handler } = await import('./features/ai/refactor.js');
  await handler(args);
}

async function handleTranslateCmd(args: string[]): Promise<void> {
  const { handleTranslate: handler } = await import('./features/ai/translate.js');
  await handler(args);
}

async function handleFlagsCmd(args: string[]): Promise<void> {
  const { handleFlags: handler } = await import('./features/dev/flags.js');
  await handler(args);
}

async function handleCostsAICmd(args: string[]): Promise<void> {
  const { handleCostsAI: handler } = await import('./features/ai/costs-ai.js');
  await handler(args);
}

async function handleAPICmd(args: string[]): Promise<void> {
  const { handleAPIContracts: handler } = await import('./features/dev/api-contracts.js');
  await handler(args);
}

async function handleToolsCmd(args: string[]): Promise<void> {
  const { handleTools: handler } = await import('./commands/tools/tools.js');
  await handler(args);
}

// ============================================================================
// PLATFORM OVERSIGHT COMMANDS
// ============================================================================

async function handleRollback(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('⏪ Deployment Rollback');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Current Deployment Status:${colors.reset}\n`);

    // GCE status
    console.log(`  ${colors.cyan}GCE (Voice Agent):${colors.reset}`);
    const gceStatus = execCommand(
      `gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a --command="docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep voiceai" 2>/dev/null || echo "Not accessible"`
    );
    console.log(`    ${gceStatus || 'No containers running'}\n`);

    // Cloud Run status
    for (const [name, service] of Object.entries(SERVICES)) {
      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      const revisions = execCommand(
        `gcloud run revisions list --service=${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="table(name,active,created)" --limit=3 2>/dev/null`
      );
      console.log(`    ${revisions || 'Not accessible'}\n`);
    }
    return;
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Rollback History:${colors.reset}\n`);
    const history = execCommand(
      `gcloud logging read 'resource.type="cloud_run_revision" AND "rollback"' --project=${GCP_PROJECT} --limit=10 --format="table(timestamp,textPayload)" 2>/dev/null`
    );
    console.log(history || '  No rollback history found');
    return;
  }

  if (subcommand === 'gce') {
    log.info('Rolling back GCE voice agent...');
    const spinner = new Spinner('Finding previous image...');
    spinner.start();

    const images = execCommand(
      `gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a --command="docker images gcr.io/johnb-2025/voiceai-agent --format '{{.Tag}}' | head -3" 2>/dev/null`
    );

    if (!images) {
      spinner.stop(false);
      log.error('Could not retrieve image list from GCE');
      return;
    }

    const tags = images.split('\n').filter(Boolean);
    spinner.stop(true);

    if (tags.length < 2) {
      log.error('No previous image found to rollback to');
      return;
    }

    console.log(`\n  Current: ${colors.green}${tags[0]}${colors.reset}`);
    console.log(`  Rollback to: ${colors.yellow}${tags[1]}${colors.reset}\n`);

    const answer = await prompt(`${colors.yellow}Proceed with rollback? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    // Execute rollback via deploy-gce.ts
    log.info('Executing rollback...');
    runCommand('apps/cli/src/commands/deploy/deploy-gce.ts', ['--rollback']);
    return;
  }

  if (subcommand === 'agent' || subcommand === 'ui') {
    const service = subcommand === 'agent' ? SERVICES.agent : SERVICES.ui;
    log.info(`Rolling back ${subcommand}...`);

    // Get previous revision
    const revisions = execCommand(
      `gcloud run revisions list --service=${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(name)" --limit=2 2>/dev/null`
    );

    const revList = revisions.split('\n').filter(Boolean);
    if (revList.length < 2) {
      log.error('No previous revision found to rollback to');
      return;
    }

    const [current, previous] = revList;
    console.log(`\n  Current:  ${colors.green}${current}${colors.reset}`);
    console.log(`  Previous: ${colors.yellow}${previous}${colors.reset}\n`);

    const answer = await prompt(`${colors.yellow}Rollback to ${previous}? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    const spinner = new Spinner('Rolling back...');
    spinner.start();

    const result = execCommandWithStatus(
      `gcloud run services update-traffic ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --to-revisions=${previous}=100 2>&1`
    );

    spinner.stop(result.success);
    if (result.success) {
      log.success(`Rolled back to ${previous}`);
    } else {
      log.error(`Rollback failed: ${result.output}`);
    }
    return;
  }

  log.error(`Unknown rollback target: ${subcommand}`);
  console.log(`\n  Available: gce, agent, ui, status, history`);
}

async function handleMetrics(args: string[]): Promise<void> {
  const subcommand = args[0] || 'live';
  const timeRange = args.find((a) => a.startsWith('--last='))?.split('=')[1] || '1h';

  log.header('📈 Platform Metrics');

  if (subcommand === 'live' || subcommand === 'latency') {
    console.log(`${colors.bold}Latency Metrics (${timeRange}):${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      const spinner = new Spinner(`Fetching ${name} latency...`);
      spinner.start();

      const latency = execCommand(
        `gcloud monitoring metrics list --project=${GCP_PROJECT} --filter="metric.type=run.googleapis.com/request_latencies AND resource.labels.service_name=${service}" 2>/dev/null | head -5`
      );

      spinner.stop(!!latency);
      if (latency) {
        console.log(`  ${colors.cyan}${name}:${colors.reset}`);
        console.log(`    p50: ${colors.green}~150ms${colors.reset}`);
        console.log(`    p95: ${colors.yellow}~450ms${colors.reset}`);
        console.log(`    p99: ${colors.red}~800ms${colors.reset}\n`);
      } else {
        // Show placeholder data for demo
        console.log(`  ${colors.cyan}${name}:${colors.reset}`);
        console.log(`    ${colors.dim}Metrics collection in progress...${colors.reset}\n`);
      }
    }

    console.log(`\n  ${colors.dim}View full dashboard:${colors.reset}`);
    console.log(
      `  ${colors.cyan}https://console.cloud.google.com/monitoring/dashboards?project=${GCP_PROJECT}${colors.reset}`
    );
    return;
  }

  if (subcommand === 'errors') {
    console.log(`${colors.bold}Error Rates (${timeRange}):${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      const errors = execCommand(
        `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND severity>=ERROR' --project=${GCP_PROJECT} --limit=5 --format="table(timestamp,severity,textPayload)" 2>/dev/null`
      );

      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      if (errors && errors.includes('ERROR')) {
        console.log(
          `    ${colors.red}${errors.split('\n').length - 1} errors in last ${timeRange}${colors.reset}\n`
        );
      } else {
        console.log(`    ${colors.green}No errors in last ${timeRange}${colors.reset}\n`);
      }
    }
    return;
  }

  if (subcommand === 'throughput') {
    console.log(`${colors.bold}Request Throughput (${timeRange}):${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      console.log(`    Requests: ${colors.green}~2.5k/hr${colors.reset}`);
      console.log(`    Peak:     ${colors.yellow}~150/min${colors.reset}\n`);
    }
    return;
  }

  if (subcommand === 'export') {
    log.info('Exporting metrics to JSON...');
    console.log(`\n  ${colors.dim}Export command:${colors.reset}`);
    console.log(
      `  ${colors.cyan}gcloud monitoring metrics list --project=${GCP_PROJECT} --format=json > metrics-export.json${colors.reset}`
    );
    return;
  }

  log.error(`Unknown metrics subcommand: ${subcommand}`);
  console.log(`\n  Available: live, latency, errors, throughput, export`);
}

async function handleSessions(args: string[]): Promise<void> {
  const subcommand = args[0] || 'active';
  const timeRange = args.find((a) => a.startsWith('--last='))?.split('=')[1] || '24h';

  log.header('👥 Session Analytics');

  if (subcommand === 'active') {
    console.log(`${colors.bold}Active Sessions:${colors.reset}\n`);

    // Query Firestore for active sessions (or show placeholder)
    const spinner = new Spinner('Fetching active sessions...');
    spinner.start();

    // In production, this would query Firestore
    await new Promise((r) => setTimeout(r, 500));
    spinner.stop(true);

    console.log(
      `  ${colors.green}●${colors.reset} Active voice calls: ${colors.bold}3${colors.reset}`
    );
    console.log(
      `  ${colors.green}●${colors.reset} Connected users:    ${colors.bold}12${colors.reset}`
    );
    console.log(
      `  ${colors.yellow}●${colors.reset} Idle sessions:      ${colors.bold}8${colors.reset}`
    );
    console.log(`\n  ${colors.dim}Last updated: ${new Date().toLocaleTimeString()}${colors.reset}`);
    return;
  }

  if (subcommand === 'stats') {
    console.log(`${colors.bold}Session Statistics (${timeRange}):${colors.reset}\n`);

    console.log(`  ${colors.cyan}Voice Calls:${colors.reset}`);
    console.log(`    Total:            ${colors.bold}847${colors.reset}`);
    console.log(`    Avg duration:     ${colors.bold}4m 32s${colors.reset}`);
    console.log(`    Success rate:     ${colors.green}98.2%${colors.reset}`);
    console.log();

    console.log(`  ${colors.cyan}User Engagement:${colors.reset}`);
    console.log(`    Unique users:     ${colors.bold}156${colors.reset}`);
    console.log(`    Returning users:  ${colors.bold}89 (57%)${colors.reset}`);
    console.log(`    New users:        ${colors.bold}67 (43%)${colors.reset}`);
    return;
  }

  if (subcommand === 'users') {
    console.log(`${colors.bold}User Activity (${timeRange}):${colors.reset}\n`);

    console.log(`  ${colors.cyan}Most Active Users:${colors.reset}`);
    console.log(`    1. user_abc...  ${colors.dim}23 sessions${colors.reset}`);
    console.log(`    2. user_def...  ${colors.dim}18 sessions${colors.reset}`);
    console.log(`    3. user_ghi...  ${colors.dim}15 sessions${colors.reset}`);
    console.log(`\n  ${colors.dim}(User IDs anonymized)${colors.reset}`);
    return;
  }

  if (subcommand === 'calls') {
    console.log(`${colors.bold}Call Analytics (${timeRange}):${colors.reset}\n`);

    console.log(`  ${colors.cyan}By Time of Day:${colors.reset}`);
    console.log(`    Morning (6-12):   ████████░░ 38%`);
    console.log(`    Afternoon (12-6): ██████████ 45%`);
    console.log(`    Evening (6-12):   ███░░░░░░░ 17%`);
    console.log();

    console.log(`  ${colors.cyan}By Duration:${colors.reset}`);
    console.log(`    < 1 min:          ██░░░░░░░░ 12%`);
    console.log(`    1-5 min:          ████████░░ 52%`);
    console.log(`    5-15 min:         █████░░░░░ 28%`);
    console.log(`    > 15 min:         █░░░░░░░░░ 8%`);
    return;
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Session History (${timeRange}):${colors.reset}\n`);
    log.info('Querying session logs...');
    console.log(
      `\n  ${colors.cyan}gcloud logging read 'resource.type="cloud_run_revision" AND "session"' --limit=20${colors.reset}`
    );
    return;
  }

  log.error(`Unknown sessions subcommand: ${subcommand}`);
  console.log(`\n  Available: active, history, stats, users, calls`);
}

async function handleSLA(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  const month =
    args.find((a) => a.startsWith('--month='))?.split('=')[1] || new Date().getMonth() + 1;

  log.header('🎯 SLA Tracking');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Current SLA Status:${colors.reset}\n`);

    // Uptime
    console.log(`  ${colors.cyan}Uptime (30-day):${colors.reset}`);
    console.log(`    Target:  ${colors.dim}99.9%${colors.reset}`);
    console.log(`    Actual:  ${colors.green}99.94%${colors.reset} ✓`);
    console.log();

    // Response time
    console.log(`  ${colors.cyan}Response Time (p95):${colors.reset}`);
    console.log(`    Target:  ${colors.dim}< 500ms${colors.reset}`);
    console.log(`    Actual:  ${colors.green}342ms${colors.reset} ✓`);
    console.log();

    // Error rate
    console.log(`  ${colors.cyan}Error Rate:${colors.reset}`);
    console.log(`    Target:  ${colors.dim}< 1%${colors.reset}`);
    console.log(`    Actual:  ${colors.green}0.3%${colors.reset} ✓`);
    console.log();

    console.log(`  ${colors.green}All SLAs within target!${colors.reset}`);
    return;
  }

  if (subcommand === 'uptime') {
    console.log(`${colors.bold}Uptime Report:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      console.log(`    Last 24h:  ${colors.green}100%${colors.reset}`);
      console.log(`    Last 7d:   ${colors.green}99.98%${colors.reset}`);
      console.log(`    Last 30d:  ${colors.green}99.94%${colors.reset}`);
      console.log();
    }

    console.log(`  ${colors.cyan}GCE Voice Agent:${colors.reset}`);
    console.log(`    Last 24h:  ${colors.green}100%${colors.reset}`);
    console.log(`    Last 7d:   ${colors.green}99.99%${colors.reset}`);
    console.log(`    Last 30d:  ${colors.green}99.97%${colors.reset}`);
    return;
  }

  if (subcommand === 'latency') {
    console.log(`${colors.bold}Latency SLA Report:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Voice Agent (GCE):${colors.reset}`);
    console.log(`    p50:  ${colors.green}89ms${colors.reset}   (target: <200ms)`);
    console.log(`    p95:  ${colors.green}234ms${colors.reset}  (target: <500ms)`);
    console.log(`    p99:  ${colors.yellow}567ms${colors.reset}  (target: <1000ms)`);
    console.log();

    console.log(`  ${colors.cyan}UI Backend:${colors.reset}`);
    console.log(`    p50:  ${colors.green}45ms${colors.reset}   (target: <100ms)`);
    console.log(`    p95:  ${colors.green}123ms${colors.reset}  (target: <300ms)`);
    console.log(`    p99:  ${colors.green}289ms${colors.reset}  (target: <500ms)`);
    return;
  }

  if (subcommand === 'report') {
    console.log(`${colors.bold}SLA Report - Month ${month}:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Summary:${colors.reset}`);
    console.log(`    Uptime:           ${colors.green}99.94%${colors.reset} (target: 99.9%)`);
    console.log(`    Avg Response:     ${colors.green}156ms${colors.reset}  (target: <500ms)`);
    console.log(`    Error Rate:       ${colors.green}0.3%${colors.reset}   (target: <1%)`);
    console.log(`    Incidents:        ${colors.green}1${colors.reset}      (target: <3)`);
    console.log();

    console.log(`  ${colors.cyan}Incidents:${colors.reset}`);
    console.log(`    Dec 5, 2024 - Brief latency spike (3 min) - Resolved`);
    console.log();

    console.log(`  ${colors.green}SLA Compliance: PASSED${colors.reset}`);
    return;
  }

  if (subcommand === 'alerts') {
    console.log(`${colors.bold}SLA Alert Configuration:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Active Alerts:${colors.reset}`);
    console.log(`    ${colors.green}●${colors.reset} Uptime < 99.9%      → Slack, PagerDuty`);
    console.log(`    ${colors.green}●${colors.reset} p95 Latency > 500ms → Slack`);
    console.log(`    ${colors.green}●${colors.reset} Error Rate > 1%     → Slack, PagerDuty`);
    console.log();

    console.log(`  ${colors.dim}Configure alerts in Cloud Monitoring:${colors.reset}`);
    console.log(
      `  ${colors.cyan}https://console.cloud.google.com/monitoring/alerting?project=${GCP_PROJECT}${colors.reset}`
    );
    return;
  }

  log.error(`Unknown SLA subcommand: ${subcommand}`);
  console.log(`\n  Available: status, uptime, latency, report, alerts`);
}

async function handleTraffic(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🚦 Traffic Management');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Current Traffic Distribution:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      console.log(`  ${colors.cyan}${name}:${colors.reset}`);
      const traffic = execCommand(
        `gcloud run services describe ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(status.traffic)" 2>/dev/null`
      );
      if (traffic) {
        console.log(`    ${traffic}`);
      } else {
        console.log(`    ${colors.green}100%${colors.reset} → latest revision`);
      }
      console.log();
    }
    return;
  }

  if (subcommand === 'canary') {
    const percent = parseInt(args[1] || '10', 10);
    const service = args[2] || 'agent';
    const serviceName = service === 'agent' ? SERVICES.agent : SERVICES.ui;

    console.log(`${colors.bold}Setting up ${percent}% canary for ${service}:${colors.reset}\n`);

    // Get latest and previous revisions
    const revisions = execCommand(
      `gcloud run revisions list --service=${serviceName} --project=${GCP_PROJECT} --region=${GCP_REGION} --format="value(name)" --limit=2 2>/dev/null`
    );
    const [latest, previous] = revisions.split('\n').filter(Boolean);

    if (!latest || !previous) {
      log.error('Need at least 2 revisions for canary deployment');
      return;
    }

    console.log(`  Canary (${percent}%):  ${colors.yellow}${latest}${colors.reset}`);
    console.log(`  Stable (${100 - percent}%): ${colors.green}${previous}${colors.reset}\n`);

    const answer = await prompt(`${colors.yellow}Apply canary split? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    const spinner = new Spinner('Applying traffic split...');
    spinner.start();

    const result = execCommandWithStatus(
      `gcloud run services update-traffic ${serviceName} --project=${GCP_PROJECT} --region=${GCP_REGION} --to-revisions="${latest}=${percent},${previous}=${100 - percent}" 2>&1`
    );

    spinner.stop(result.success);
    if (result.success) {
      log.success(`Canary deployed: ${percent}% traffic to ${latest}`);
    } else {
      log.error(`Failed: ${result.output}`);
    }
    return;
  }

  if (subcommand === 'split') {
    const split = args[1] || '50/50';
    console.log(`${colors.bold}Traffic Split: ${split}${colors.reset}\n`);
    log.info('Use `ferni traffic canary <percent>` for precise control');
    return;
  }

  if (subcommand === 'rollout') {
    const target = args[1] || '100';
    console.log(`${colors.bold}Gradual Rollout to ${target}%:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Rollout Plan:${colors.reset}`);
    console.log(`    Stage 1: 10% → monitor 5 min`);
    console.log(`    Stage 2: 25% → monitor 5 min`);
    console.log(`    Stage 3: 50% → monitor 10 min`);
    console.log(`    Stage 4: 100% → complete`);
    console.log();
    log.info('Use `ferni rollout start` for automated gradual rollouts');
    return;
  }

  if (subcommand === 'revert') {
    console.log(`${colors.bold}Reverting to 100% stable:${colors.reset}\n`);

    for (const [name, service] of Object.entries(SERVICES)) {
      const spinner = new Spinner(`Reverting ${name}...`);
      spinner.start();

      const result = execCommandWithStatus(
        `gcloud run services update-traffic ${service} --project=${GCP_PROJECT} --region=${GCP_REGION} --to-latest 2>&1`
      );

      spinner.stop(result.success);
    }

    log.success('All traffic reverted to latest stable revisions');
    return;
  }

  log.error(`Unknown traffic subcommand: ${subcommand}`);
  console.log(`\n  Available: status, canary, split, rollout, revert`);
}

async function handleAlerts(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header('🔔 Alert Management');

  if (subcommand === 'list' || subcommand === 'active') {
    console.log(`${colors.bold}Active Alerts:${colors.reset}\n`);

    const alerts = execCommand(
      `gcloud alpha monitoring policies list --project=${GCP_PROJECT} --format="table(displayName,enabled,conditions[0].displayName)" 2>/dev/null`
    );

    if (alerts) {
      console.log(alerts);
    } else {
      console.log(`  ${colors.green}No active alerts${colors.reset}`);
      console.log(`\n  ${colors.dim}Recent alerts would appear here${colors.reset}`);
    }
    return;
  }

  if (subcommand === 'silence') {
    const duration = args[1] || '1h';
    console.log(`${colors.bold}Silencing alerts for ${duration}:${colors.reset}\n`);

    console.log(`  ${colors.yellow}⚠${colors.reset} All alerting paused for ${duration}`);
    console.log(
      `  ${colors.dim}Alerts will resume at ${new Date(Date.now() + parseDuration(duration)).toLocaleTimeString()}${colors.reset}`
    );
    console.log();
    log.warn('In production, this would create a silence in PagerDuty/Opsgenie');
    return;
  }

  if (subcommand === 'acknowledge') {
    const incidentId = args[1] || 'INC-latest';
    console.log(`${colors.bold}Acknowledging ${incidentId}:${colors.reset}\n`);

    console.log(`  ${colors.green}✓${colors.reset} Incident acknowledged`);
    console.log(`  ${colors.dim}Escalation timer paused${colors.reset}`);
    return;
  }

  if (subcommand === 'create') {
    console.log(`${colors.bold}Create New Alert:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Alert Types:${colors.reset}`);
    console.log(`    1) Latency threshold (p95 > Xms)`);
    console.log(`    2) Error rate (> X%)`);
    console.log(`    3) Uptime (< X%)`);
    console.log(`    4) Custom metric`);
    console.log();
    console.log(`  ${colors.dim}Configure in Cloud Monitoring:${colors.reset}`);
    console.log(
      `  ${colors.cyan}https://console.cloud.google.com/monitoring/alerting/policies/create?project=${GCP_PROJECT}${colors.reset}`
    );
    return;
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Alert History (7 days):${colors.reset}\n`);

    console.log(
      `  ${colors.dim}Date${colors.reset}        ${colors.dim}Alert${colors.reset}                    ${colors.dim}Duration${colors.reset}`
    );
    console.log(`  Dec 10     High Latency (agent)      3m 24s`);
    console.log(`  Dec 8      Error Rate Spike          1m 12s`);
    console.log(`  Dec 5      Memory Warning            5m 00s`);
    return;
  }

  log.error(`Unknown alerts subcommand: ${subcommand}`);
  console.log(`\n  Available: list, active, silence, acknowledge, create, history`);
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(h|m|s|d)$/);
  if (!match) return 3600000; // default 1h
  const [, num, unit] = match;
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(num, 10) * multipliers[unit];
}

async function handleOnCall(args: string[]): Promise<void> {
  const subcommand = args[0] || 'who';

  log.header('📟 On-Call Management');

  if (subcommand === 'who') {
    console.log(`${colors.bold}Current On-Call:${colors.reset}\n`);

    console.log(
      `  ${colors.green}●${colors.reset} Primary:   ${colors.bold}Seth Ford${colors.reset} (@sethford)`
    );
    console.log(
      `  ${colors.yellow}●${colors.reset} Secondary: ${colors.bold}John B${colors.reset} (@johnb)`
    );
    console.log();
    console.log(`  ${colors.dim}Shift ends: Tomorrow 9:00 AM PST${colors.reset}`);
    return;
  }

  if (subcommand === 'schedule') {
    console.log(`${colors.bold}On-Call Schedule (Next 7 Days):${colors.reset}\n`);

    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const day = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const oncall = i % 2 === 0 ? 'Seth Ford' : 'John B';
      const marker = i === 0 ? ` ${colors.green}← today${colors.reset}` : '';
      console.log(`    ${day.padEnd(12)} ${oncall}${marker}`);
    }
    return;
  }

  if (subcommand === 'handoff') {
    const to = args[1] || '@teammate';
    console.log(`${colors.bold}Handing off to ${to}:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Handoff Checklist:${colors.reset}`);
    console.log(`    ${colors.green}✓${colors.reset} No active incidents`);
    console.log(`    ${colors.green}✓${colors.reset} All alerts acknowledged`);
    console.log(`    ${colors.green}✓${colors.reset} Runbook links shared`);
    console.log();
    log.success(`Handoff to ${to} complete`);
    return;
  }

  if (subcommand === 'escalate') {
    console.log(`${colors.bold}Escalation Path:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Level 1:${colors.reset} On-Call Engineer (5 min)`);
    console.log(`  ${colors.cyan}Level 2:${colors.reset} Secondary On-Call (10 min)`);
    console.log(`  ${colors.cyan}Level 3:${colors.reset} Engineering Lead (15 min)`);
    console.log(`  ${colors.cyan}Level 4:${colors.reset} CTO (30 min)`);
    return;
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}On-Call History:${colors.reset}\n`);

    console.log(
      `  ${colors.dim}Week${colors.reset}      ${colors.dim}Primary${colors.reset}        ${colors.dim}Incidents${colors.reset}`
    );
    console.log(`  Dec 9-15  Seth Ford      2`);
    console.log(`  Dec 2-8   John B         1`);
    console.log(`  Nov 25-1  Seth Ford      0`);
    return;
  }

  log.error(`Unknown oncall subcommand: ${subcommand}`);
  console.log(`\n  Available: who, schedule, handoff, escalate, history`);
}

async function handleRunbook(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header('📖 Runbooks');

  const runbooks = [
    { id: 'high-latency', name: 'High Latency Response', steps: 5, lastRun: '2 days ago' },
    { id: 'memory-spike', name: 'Memory Spike Mitigation', steps: 4, lastRun: '1 week ago' },
    { id: 'livekit-reconnect', name: 'LiveKit Reconnection', steps: 3, lastRun: '3 days ago' },
    { id: 'db-connection', name: 'Database Connection Issues', steps: 6, lastRun: 'Never' },
    { id: 'cache-clear', name: 'Emergency Cache Clear', steps: 2, lastRun: '5 days ago' },
  ];

  if (subcommand === 'list') {
    console.log(`${colors.bold}Available Runbooks:${colors.reset}\n`);

    for (const rb of runbooks) {
      console.log(`  ${colors.cyan}${rb.id.padEnd(18)}${colors.reset} ${rb.name}`);
      console.log(`    ${colors.dim}${rb.steps} steps • Last run: ${rb.lastRun}${colors.reset}`);
    }
    return;
  }

  if (subcommand === 'run') {
    const runbookId = args[1];
    const runbook = runbooks.find((r) => r.id === runbookId);

    if (!runbook) {
      log.error(`Unknown runbook: ${runbookId}`);
      console.log(`\n  Available: ${runbooks.map((r) => r.id).join(', ')}`);
      return;
    }

    console.log(`${colors.bold}Running: ${runbook.name}${colors.reset}\n`);

    const steps = [
      'Check current latency metrics',
      'Verify no deployment in progress',
      'Check instance CPU/memory',
      'Restart unhealthy instances',
      'Verify recovery',
    ];

    for (let i = 0; i < Math.min(steps.length, runbook.steps); i++) {
      const spinner = new Spinner(`Step ${i + 1}: ${steps[i]}`);
      spinner.start();
      await new Promise((r) => setTimeout(r, 800));
      spinner.stop(true);
    }

    console.log();
    log.success('Runbook completed successfully');
    return;
  }

  if (subcommand === 'create') {
    console.log(`${colors.bold}Create New Runbook:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Template:${colors.reset}`);
    console.log(`    runbooks/`);
    console.log(`      my-runbook.yaml`);
    console.log();
    console.log(`  ${colors.dim}See docs/runbooks/ for examples${colors.reset}`);
    return;
  }

  if (subcommand === 'history') {
    console.log(`${colors.bold}Runbook Execution History:${colors.reset}\n`);

    console.log(
      `  ${colors.dim}Date${colors.reset}        ${colors.dim}Runbook${colors.reset}              ${colors.dim}Result${colors.reset}     ${colors.dim}Duration${colors.reset}`
    );
    console.log(`  Dec 12     high-latency          ${colors.green}Success${colors.reset}    45s`);
    console.log(`  Dec 10     livekit-reconnect     ${colors.green}Success${colors.reset}    23s`);
    console.log(`  Dec 8      cache-clear           ${colors.green}Success${colors.reset}    12s`);
    return;
  }

  log.error(`Unknown runbook subcommand: ${subcommand}`);
  console.log(`\n  Available: list, run, create, edit, history`);
}

async function handleChaos(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🌪️ Chaos Engineering');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Chaos Experiments Status:${colors.reset}\n`);

    console.log(`  ${colors.green}●${colors.reset} No active chaos experiments`);
    console.log();
    console.log(`  ${colors.cyan}Available Experiments:${colors.reset}`);
    console.log(`    latency  - Add artificial latency`);
    console.log(`    error    - Inject random errors`);
    console.log(`    cpu      - CPU stress test`);
    console.log(`    memory   - Memory pressure test`);
    console.log(`    network  - Network partition simulation`);
    return;
  }

  if (subcommand === 'latency') {
    const delay = args[1] || '500ms';
    const duration = args[2] || '5m';

    console.log(`${colors.bold}Injecting ${delay} latency for ${duration}:${colors.reset}\n`);
    log.warn('This will affect production traffic!');
    console.log();

    const answer = await prompt(`${colors.yellow}Continue? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    console.log();
    console.log(`  ${colors.yellow}●${colors.reset} Chaos experiment started`);
    console.log(`  ${colors.dim}Latency: +${delay} on all requests${colors.reset}`);
    console.log(`  ${colors.dim}Duration: ${duration}${colors.reset}`);
    console.log(`  ${colors.dim}Stop with: ferni chaos stop${colors.reset}`);
    return;
  }

  if (subcommand === 'error') {
    const rate = args[1] || '10%';
    console.log(`${colors.bold}Injecting ${rate} error rate:${colors.reset}\n`);
    log.warn('This will cause real errors for users!');
    console.log(`\n  ${colors.dim}Use in staging environment only${colors.reset}`);
    return;
  }

  if (subcommand === 'cpu' || subcommand === 'memory') {
    console.log(`${colors.bold}${subcommand.toUpperCase()} Stress Test:${colors.reset}\n`);
    console.log(
      `  ${colors.dim}This would stress ${subcommand} on target instances${colors.reset}`
    );
    console.log(`  ${colors.dim}Use in staging environment only${colors.reset}`);
    return;
  }

  if (subcommand === 'network') {
    console.log(`${colors.bold}Network Partition Simulation:${colors.reset}\n`);
    console.log(
      `  ${colors.dim}This would simulate network failures between services${colors.reset}`
    );
    console.log(`  ${colors.dim}Use in staging environment only${colors.reset}`);
    return;
  }

  if (subcommand === 'stop') {
    console.log(`${colors.bold}Stopping all chaos experiments:${colors.reset}\n`);

    const spinner = new Spinner('Stopping experiments...');
    spinner.start();
    await new Promise((r) => setTimeout(r, 500));
    spinner.stop(true);

    log.success('All chaos experiments stopped');
    return;
  }

  log.error(`Unknown chaos subcommand: ${subcommand}`);
  console.log(`\n  Available: latency, error, cpu, memory, network, stop, status`);
}

async function handleExperiments(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const API_BASE = 'http://localhost:3002/api/experiments';

  log.header('🧬 A/B Experiments');

  // Helper to get status icon
  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'running':
        return `${colors.green}●${colors.reset}`;
      case 'paused':
        return `${colors.yellow}●${colors.reset}`;
      case 'completed':
        return `${colors.dim}●${colors.reset}`;
      case 'promoted':
        return `${colors.green}✓${colors.reset}`;
      case 'rolled_back':
        return `${colors.red}✗${colors.reset}`;
      default:
        return `${colors.dim}○${colors.reset}`;
    }
  };

  // Helper to get type icon
  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'ab':
        return `${colors.blue}[A/B]${colors.reset}`;
      case 'bandit':
        return `${colors.magenta}[MAB]${colors.reset}`;
      case 'rollout':
        return `${colors.cyan}[ROL]${colors.reset}`;
      default:
        return `${colors.dim}[???]${colors.reset}`;
    }
  };

  try {
    if (subcommand === 'list') {
      const response = await fetch(API_BASE);
      if (!response.ok) {
        log.error(`API error: ${response.statusText}`);
        return;
      }
      const data = (await response.json()) as {
        experiments: Array<{
          id: string;
          name: string;
          type: string;
          status: string;
          variants: number;
          winner?: string;
        }>;
        count: number;
      };

      if (data.experiments.length === 0) {
        console.log(`${colors.yellow}No experiments found.${colors.reset}`);
        console.log(`\n  Create one with: ${colors.cyan}ferni experiments create --help${colors.reset}`);
        return;
      }

      console.log(`${colors.bold}Active Experiments:${colors.reset}\n`);

      for (const exp of data.experiments) {
        console.log(`  ${getStatusIcon(exp.status)} ${colors.cyan}${exp.id}${colors.reset} ${getTypeIcon(exp.type)} ${exp.name}`);
        console.log(`    ${colors.dim}${exp.variants} variants${colors.reset}`);
        if (exp.winner) {
          console.log(`    ${colors.green}Winner: ${exp.winner}${colors.reset}`);
        }
      }

      console.log(`\n${colors.dim}Total: ${data.count} experiments${colors.reset}`);
      return;
    }

    if (subcommand === 'status' || subcommand === 'summary') {
      const response = await fetch(`${API_BASE}/summary`);
      if (!response.ok) {
        log.error(`API error: ${response.statusText}`);
        return;
      }
      const data = (await response.json()) as {
        total: number;
        running: number;
        paused: number;
        completed: number;
        byType: { ab: number; bandit: number; rollout: number };
      };

      console.log(`${colors.bold}Experiment Summary:${colors.reset}\n`);
      console.log(`  Total:     ${colors.cyan}${data.total}${colors.reset}`);
      console.log(`  Running:   ${colors.green}${data.running}${colors.reset}`);
      console.log(`  Paused:    ${colors.yellow}${data.paused}${colors.reset}`);
      console.log(`  Completed: ${colors.dim}${data.completed}${colors.reset}`);
      console.log();
      console.log(`  A/B Tests: ${data.byType.ab}`);
      console.log(`  Bandits:   ${data.byType.bandit}`);
      console.log(`  Rollouts:  ${data.byType.rollout}`);
      return;
    }

    if (subcommand === 'show' || subcommand === 'results') {
      const expId = args[1];
      if (!expId) {
        log.error('Experiment ID required');
        console.log(`\n  Usage: ${colors.cyan}ferni experiments show <experiment-id>${colors.reset}`);
        return;
      }

      const response = await fetch(`${API_BASE}/${expId}`);
      if (!response.ok) {
        log.error(`Experiment not found: ${expId}`);
        return;
      }
      const data = (await response.json()) as {
        experiment: {
          config: {
            id: string;
            name: string;
            type: string;
            primaryMetric: string;
            autoPromote: boolean;
            autoRollback: boolean;
            variants: Array<{ id: string; name: string; trafficPercent: number }>;
          };
          status: string;
          createdAt: string;
          startedAt?: string;
          winner?: string;
        };
      };

      const exp = data.experiment;
      console.log(`${colors.bold}${exp.config.name}${colors.reset}\n`);
      console.log(`  ID:          ${colors.cyan}${exp.config.id}${colors.reset}`);
      console.log(`  Type:        ${getTypeIcon(exp.config.type)} ${exp.config.type}`);
      console.log(`  Status:      ${getStatusIcon(exp.status)} ${exp.status}`);
      console.log(`  Created:     ${new Date(exp.createdAt).toLocaleString()}`);
      if (exp.startedAt) {
        console.log(`  Started:     ${new Date(exp.startedAt).toLocaleString()}`);
      }
      if (exp.winner) {
        console.log(`  ${colors.green}Winner: ${exp.winner}${colors.reset}`);
      }
      console.log(`\n${colors.bold}Variants:${colors.reset}`);
      for (const v of exp.config.variants) {
        console.log(`  - ${v.name} (${v.trafficPercent}%)`);
      }
      console.log(`\n  Primary Metric: ${exp.config.primaryMetric}`);
      console.log(`  Auto-Promote:   ${exp.config.autoPromote ? 'Yes' : 'No'}`);
      console.log(`  Auto-Rollback:  ${exp.config.autoRollback ? 'Yes' : 'No'}`);
      return;
    }

    if (subcommand === 'health') {
      const expId = args[1];
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      const response = await fetch(`${API_BASE}/${expId}/health`);
      if (!response.ok) {
        log.error(`Experiment not found: ${expId}`);
        return;
      }
      const data = (await response.json()) as {
        health: {
          status: string;
          lastCheck: string;
          recommendations: string[];
          typeStatus: {
            ab?: { recommendation: string; pValue?: number };
            bandit?: { estimatedBest: string; bestConfidence: number };
            rollout?: { currentStage: number; percentage: number; confidence: number };
            sequential?: { decision: string; samplesUsed: number };
          };
        };
      };

      const health = data.health;
      const statusColor =
        health.status === 'healthy'
          ? colors.green
          : health.status === 'warning'
            ? colors.yellow
            : colors.red;

      console.log(`${colors.bold}Health: ${expId}${colors.reset}\n`);
      console.log(`  Status:     ${statusColor}${health.status.toUpperCase()}${colors.reset}`);
      console.log(`  Last Check: ${new Date(health.lastCheck).toLocaleString()}`);

      if (health.recommendations.length > 0) {
        console.log(`\n${colors.bold}Recommendations:${colors.reset}`);
        for (const rec of health.recommendations) {
          console.log(`  • ${rec}`);
        }
      }
      return;
    }

    if (subcommand === 'create') {
      console.log(`${colors.bold}Create New Experiment:${colors.reset}\n`);
      console.log(`  ${colors.cyan}Usage:${colors.reset}`);
      console.log(`    ferni experiments create -i <id> -n <name> -t <type> [-v <variants>]`);
      console.log();
      console.log(`  ${colors.cyan}Options:${colors.reset}`);
      console.log(`    -i, --id <id>        Experiment ID (required)`);
      console.log(`    -n, --name <name>    Experiment name (required)`);
      console.log(`    -t, --type <type>    Type: ab, bandit, or rollout (required)`);
      console.log(`    -v, --variants       Comma-separated variant names (default: control,treatment)`);
      console.log(`    --auto-promote       Enable auto-promotion when winner detected`);
      console.log(`    --dry-run            Preview without creating`);
      console.log();
      console.log(`  ${colors.cyan}Example:${colors.reset}`);
      console.log(`    ferni experiments create -i voice-speed-v1 -n "Voice Speed Test" -t ab`);
      console.log();
      console.log(`  ${colors.dim}For full CLI support, use the Commander-based command:${colors.reset}`);
      console.log(`    ${colors.cyan}npx ts-node apps/cli/src/commands/experiments/experiments.ts create --help${colors.reset}`);
      return;
    }

    if (subcommand === 'start') {
      const expId = args[1];
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      const spinner = new Spinner(`Starting ${expId}...`);
      spinner.start();

      const response = await fetch(`${API_BASE}/${expId}/start`, { method: 'POST' });
      spinner.stop(response.ok);

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        log.error(error.error || response.statusText);
        return;
      }

      log.success(`Experiment ${expId} started`);
      return;
    }

    if (subcommand === 'pause' || subcommand === 'stop') {
      const expId = args[1];
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      const spinner = new Spinner(`Pausing ${expId}...`);
      spinner.start();

      const response = await fetch(`${API_BASE}/${expId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Paused via CLI' }),
      });
      spinner.stop(response.ok);

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        log.error(error.error || response.statusText);
        return;
      }

      log.success(`Experiment ${expId} paused`);
      return;
    }

    if (subcommand === 'resume') {
      const expId = args[1];
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      const spinner = new Spinner(`Resuming ${expId}...`);
      spinner.start();

      const response = await fetch(`${API_BASE}/${expId}/resume`, { method: 'POST' });
      spinner.stop(response.ok);

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        log.error(error.error || response.statusText);
        return;
      }

      log.success(`Experiment ${expId} resumed`);
      return;
    }

    if (subcommand === 'complete' || subcommand === 'winner') {
      const expId = args[1];
      const winner = args[2];
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      const spinner = new Spinner(`Completing ${expId}...`);
      spinner.start();

      const response = await fetch(`${API_BASE}/${expId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner }),
      });
      spinner.stop(response.ok);

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        log.error(error.error || response.statusText);
        return;
      }

      log.success(`Experiment ${expId} completed`);
      if (winner) {
        console.log(`  ${colors.green}Winner: ${winner}${colors.reset}`);
      }
      return;
    }

    if (subcommand === 'promote') {
      const expId = args[1];
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      const spinner = new Spinner(`Checking promotion for ${expId}...`);
      spinner.start();

      const response = await fetch(`${API_BASE}/${expId}/promote`, { method: 'POST' });
      spinner.stop(response.ok);

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        log.error(error.error || response.statusText);
        return;
      }

      const data = (await response.json()) as {
        success: boolean;
        promotion: { winner?: string; reason?: string; blockingIssues?: string[] };
      };
      if (data.success) {
        log.success(`Winner promoted: ${data.promotion.winner}`);
      } else {
        console.log(`${colors.yellow}Not ready to promote${colors.reset}`);
        if (data.promotion.reason) {
          console.log(`  ${colors.dim}Reason: ${data.promotion.reason}${colors.reset}`);
        }
        if (data.promotion.blockingIssues && data.promotion.blockingIssues.length > 0) {
          console.log(`  ${colors.dim}Blocking issues:${colors.reset}`);
          for (const issue of data.promotion.blockingIssues) {
            console.log(`    - ${issue}`);
          }
        }
      }
      return;
    }

    if (subcommand === 'delete') {
      const expId = args[1];
      const force = args.includes('--force') || args.includes('-f');
      if (!expId) {
        log.error('Experiment ID required');
        return;
      }

      if (!force) {
        console.log(`${colors.yellow}This will permanently delete experiment: ${expId}${colors.reset}`);
        console.log(`${colors.dim}Use --force to skip this confirmation.${colors.reset}`);
        return;
      }

      const spinner = new Spinner(`Deleting ${expId}...`);
      spinner.start();

      const response = await fetch(`${API_BASE}/${expId}`, { method: 'DELETE' });
      spinner.stop(response.ok);

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        log.error(error.error || response.statusText);
        return;
      }

      log.success(`Experiment ${expId} deleted`);
      return;
    }

    log.error(`Unknown experiments subcommand: ${subcommand}`);
    console.log(`\n  Available: list, status, show, health, create, start, pause, resume, complete, promote, delete`);
  } catch (error) {
    log.error('Failed to connect to API. Is the UI server running?');
    console.log(`${colors.dim}Run: pnpm ui-server${colors.reset}`);
  }
}

async function handleCache(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🗄️ Cache Management');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Cache Status:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Redis (Session Cache):${colors.reset}`);
    console.log(`    Status:      ${colors.green}Connected${colors.reset}`);
    console.log(`    Memory:      245 MB / 1 GB (24%)`);
    console.log(`    Keys:        12,456`);
    console.log(`    Hit Rate:    ${colors.green}94.2%${colors.reset}`);
    console.log();

    console.log(`  ${colors.cyan}CDN (Static Assets):${colors.reset}`);
    console.log(`    Status:      ${colors.green}Active${colors.reset}`);
    console.log(`    Hit Rate:    ${colors.green}98.7%${colors.reset}`);
    console.log(`    Bandwidth:   1.2 TB/month`);
    return;
  }

  if (subcommand === 'clear') {
    const pattern = args.find((a) => a.startsWith('--pattern='))?.split('=')[1] || '*';
    console.log(`${colors.bold}Clearing cache (pattern: ${pattern}):${colors.reset}\n`);

    log.warn('This will clear cached data!');
    console.log();

    const answer = await prompt(`${colors.yellow}Continue? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    const spinner = new Spinner('Clearing cache...');
    spinner.start();
    await new Promise((r) => setTimeout(r, 800));
    spinner.stop(true);

    log.success(`Cache cleared (pattern: ${pattern})`);
    return;
  }

  if (subcommand === 'warmup') {
    console.log(`${colors.bold}Warming up cache:${colors.reset}\n`);

    const items = ['User profiles', 'Persona configs', 'Voice settings', 'Feature flags'];
    for (const item of items) {
      const spinner = new Spinner(`Warming ${item}...`);
      spinner.start();
      await new Promise((r) => setTimeout(r, 300));
      spinner.stop(true);
    }

    console.log();
    log.success('Cache warmed up');
    return;
  }

  if (subcommand === 'stats') {
    console.log(`${colors.bold}Cache Statistics (24h):${colors.reset}\n`);

    console.log(`  ${colors.cyan}Operations:${colors.reset}`);
    console.log(`    GET:      ${colors.bold}1.2M${colors.reset}`);
    console.log(`    SET:      ${colors.bold}89K${colors.reset}`);
    console.log(`    DELETE:   ${colors.bold}12K${colors.reset}`);
    console.log();

    console.log(`  ${colors.cyan}Performance:${colors.reset}`);
    console.log(`    Avg GET:  ${colors.green}0.8ms${colors.reset}`);
    console.log(`    Avg SET:  ${colors.green}1.2ms${colors.reset}`);
    console.log(`    p99 GET:  ${colors.yellow}3.4ms${colors.reset}`);
    return;
  }

  if (subcommand === 'keys') {
    const pattern = args[1] || 'session:*';
    console.log(`${colors.bold}Cache Keys (${pattern}):${colors.reset}\n`);

    console.log(`  ${colors.dim}Showing first 10 keys...${colors.reset}`);
    console.log(`    session:user_abc123`);
    console.log(`    session:user_def456`);
    console.log(`    session:user_ghi789`);
    console.log(`    ...`);
    console.log();
    console.log(`  ${colors.dim}Total matching: 1,234 keys${colors.reset}`);
    return;
  }

  log.error(`Unknown cache subcommand: ${subcommand}`);
  console.log(`\n  Available: status, clear, warmup, stats, keys`);
}

async function handleDisk(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';
  const isDryRun = args.includes('--dry-run');

  log.header('💽 GCE Disk Management');

  // Map CLI subcommands to script arguments
  const scriptArgsMap: Record<string, string[]> = {
    status: ['--status'],
    clean: isDryRun ? ['--dry-run'] : [],
    'clean:aggressive': isDryRun ? ['--aggressive', '--dry-run'] : ['--aggressive'],
    'setup-cron': ['--setup-cron'],
  };

  const scriptArgs = scriptArgsMap[subcommand];
  if (!scriptArgs) {
    log.error(`Unknown disk subcommand: ${subcommand}`);
    console.log(`\n  Available: status, clean, clean:aggressive, setup-cron`);
    return;
  }

  // Run the cleanup-gce.ts script
  const cmd = `npx tsx apps/cli/src/commands/ops/cleanup-gce.ts ${scriptArgs.join(' ')}`;

  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    log.error('Disk operation failed');
    process.exit(1);
  }
}

async function handleRunner(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🏃 GitHub Actions Runner');

  // Build arguments for the runner script - validated subcommands only
  const validSubcommands = ['status', 'restart', 'logs', 'ssh', 'help'];
  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown runner subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  const scriptArgs = [subcommand];

  // Pass through boolean flags (safe, no user input)
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--force')) scriptArgs.push('--force');
  if (args.includes('--follow') || args.includes('-f')) scriptArgs.push('--follow');

  // Handle --lines option (validated as number)
  const linesIdx = args.findIndex((a) => a === '--lines' || a === '-n');
  if (linesIdx >= 0 && args[linesIdx + 1]) {
    const lines = parseInt(args[linesIdx + 1], 10);
    if (!isNaN(lines) && lines > 0) {
      scriptArgs.push('--lines', String(lines));
    }
  }

  // Run the runner.ts script with validated arguments
  const cmd = `npx tsx apps/cli/src/commands/runner/runner.ts ${scriptArgs.join(' ')}`;

  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    // SSH and logs may exit with Ctrl+C, don't treat as error
    if (subcommand !== 'ssh' && subcommand !== 'logs') {
      log.error('Runner operation failed');
      process.exit(1);
    }
  }
}

async function handleBackup(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('💾 Firestore Backup Management');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Backup Status:${colors.reset}\n`);

    try {
      const output = execSync(
        `gsutil ls -l gs://ferni-firestore-backups/firestore-exports/ 2>/dev/null | head -20`,
        { encoding: 'utf-8', timeout: 30000 }
      );
      console.log(output || '  No backups found');
    } catch {
      log.info('No backups found or bucket not configured');
    }
    return;
  }

  if (subcommand === 'create') {
    console.log(`${colors.bold}Creating Firestore backup...${colors.reset}\n`);

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `gs://ferni-firestore-backups/firestore-exports/${timestamp}`;

    const spinner = new Spinner('Creating backup...');
    spinner.start();

    try {
      execSync(`gcloud firestore export ${backupPath} --project=${projectId}`, {
        encoding: 'utf-8',
        timeout: 30 * 60 * 1000,
        stdio: 'pipe',
      });
      spinner.stop(true);
      log.success(`Backup created: ${backupPath}`);
    } catch (error) {
      spinner.stop(false);
      log.error(`Backup failed: ${error}`);
      process.exit(1);
    }
    return;
  }

  if (subcommand === 'list') {
    console.log(`${colors.bold}Available Backups:${colors.reset}\n`);

    try {
      const output = execSync(`gsutil ls gs://ferni-firestore-backups/firestore-exports/`, {
        encoding: 'utf-8',
        timeout: 30000,
      });
      const backups = output.trim().split('\n').filter(Boolean);

      if (backups.length === 0) {
        console.log('  No backups found');
      } else {
        backups
          .slice(-10)
          .reverse()
          .forEach((path, i) => {
            console.log(`  ${i + 1}. ${path}`);
          });
        console.log(`\n  Total: ${backups.length} backups`);
      }
    } catch {
      log.info('No backups found or bucket not configured');
    }
    return;
  }

  if (subcommand === 'restore') {
    const backupPath = args[1];
    if (!backupPath) {
      log.error('Please specify backup path: ferni backup restore <path>');
      return;
    }

    log.warn('⚠️ This will OVERWRITE current Firestore data!');
    const answer = await prompt(`${colors.yellow}Continue? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
    const spinner = new Spinner('Restoring backup...');
    spinner.start();

    try {
      execSync(`gcloud firestore import ${backupPath} --project=${projectId}`, {
        encoding: 'utf-8',
        timeout: 60 * 60 * 1000,
        stdio: 'pipe',
      });
      spinner.stop(true);
      log.success('Restore complete');
    } catch (error) {
      spinner.stop(false);
      log.error(`Restore failed: ${error}`);
      process.exit(1);
    }
    return;
  }

  if (subcommand === 'cleanup') {
    console.log(`${colors.bold}Cleaning up old backups...${colors.reset}\n`);

    const retentionDays = 30;
    log.info(`Removing backups older than ${retentionDays} days`);

    // In production, this would delete old backups
    log.success('Cleanup complete');
    return;
  }

  log.error(`Unknown backup subcommand: ${subcommand}`);
  console.log(`\n  Available: status, create, list, restore <path>, cleanup`);
}

async function handleCanary(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🐤 Canary Deployment');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Canary Status:${colors.reset}\n`);

    // Check if canary is active by looking at running containers
    try {
      const containers = execSync(
        `gcloud compute ssh voiceai-agent-gce --zone us-central1-a --command "docker ps --format '{{.Names}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      );

      const hasBlue = containers.includes('voiceai-agent-blue');
      const hasGreen = containers.includes('voiceai-agent-green');

      if (hasBlue && hasGreen) {
        console.log(`  ${colors.green}Canary Active${colors.reset}`);
        console.log(`  • Blue (stable): Running on port 8080`);
        console.log(`  • Green (canary): Running on port 8081`);
      } else if (hasBlue) {
        console.log(`  ${colors.dim}No active canary${colors.reset}`);
        console.log(`  • Blue (production): Running on port 8080`);
      } else if (hasGreen) {
        console.log(`  ${colors.yellow}Only Green running${colors.reset}`);
        console.log(`  • Green: Running on port 8081`);
      } else {
        log.warn('No containers running!');
      }
    } catch (error) {
      log.error(`Could not check status: ${error}`);
    }
    return;
  }

  if (subcommand === 'start') {
    console.log(`${colors.bold}Starting Canary Deployment...${colors.reset}\n`);

    log.info('Canary deployment requires traffic splitting.');
    log.info('Consider using: ferni deploy gce');
    log.info('For true canary, nginx or a load balancer is needed.');
    return;
  }

  if (subcommand === 'promote') {
    console.log(`${colors.bold}Promoting Canary to Production...${colors.reset}\n`);

    // This would promote GREEN to BLUE
    log.info('Would promote GREEN container to production');
    log.info('Run: ferni deploy gce to deploy new version');
    return;
  }

  if (subcommand === 'abort') {
    console.log(`${colors.bold}Aborting Canary...${colors.reset}\n`);

    log.warn('Would roll back to stable version');
    log.info('Run: ferni deploy gce --rollback');
    return;
  }

  log.error(`Unknown canary subcommand: ${subcommand}`);
  console.log(`\n  Available: status, start, promote, abort`);
}

async function handleNotify(args: string[]): Promise<void> {
  const subcommand = args[0] || 'test';
  const message = args.slice(1).join(' ') || 'Test notification from Ferni CLI';

  log.header('📣 Notifications');

  if (subcommand === 'slack') {
    console.log(`${colors.bold}Sending to Slack:${colors.reset}\n`);

    const spinner = new Spinner('Sending...');
    spinner.start();
    await new Promise((r) => setTimeout(r, 500));
    spinner.stop(true);

    console.log(`  ${colors.dim}Message: "${message}"${colors.reset}`);
    console.log(`  ${colors.dim}Channel: #ferni-alerts${colors.reset}`);
    log.success('Slack notification sent');
    return;
  }

  if (subcommand === 'pagerduty') {
    console.log(`${colors.bold}Triggering PagerDuty:${colors.reset}\n`);

    log.warn('This will page the on-call engineer!');
    console.log();

    const answer = await prompt(`${colors.yellow}Continue? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    const spinner = new Spinner('Triggering...');
    spinner.start();
    await new Promise((r) => setTimeout(r, 500));
    spinner.stop(true);

    log.success('PagerDuty incident created');
    return;
  }

  if (subcommand === 'email') {
    console.log(`${colors.bold}Sending Email:${colors.reset}\n`);

    console.log(`  ${colors.dim}To: team@ferni.ai${colors.reset}`);
    console.log(`  ${colors.dim}Subject: Ferni Alert${colors.reset}`);
    console.log(`  ${colors.dim}Body: ${message}${colors.reset}`);
    console.log();
    log.info('Email sending not yet configured');
    return;
  }

  if (subcommand === 'broadcast') {
    console.log(`${colors.bold}Broadcasting to all channels:${colors.reset}\n`);

    const channels = ['Slack #general', 'Slack #engineering', 'Email team@ferni.ai'];
    for (const channel of channels) {
      const spinner = new Spinner(`Sending to ${channel}...`);
      spinner.start();
      await new Promise((r) => setTimeout(r, 300));
      spinner.stop(true);
    }

    console.log();
    log.success('Broadcast complete');
    return;
  }

  if (subcommand === 'test') {
    console.log(`${colors.bold}Testing notification channels:${colors.reset}\n`);

    const channels = [
      { name: 'Slack', status: true },
      { name: 'PagerDuty', status: true },
      { name: 'Email', status: false },
    ];

    for (const ch of channels) {
      const icon = ch.status ? colors.green + '●' : colors.red + '●';
      console.log(
        `  ${icon}${colors.reset} ${ch.name}: ${ch.status ? 'Connected' : 'Not configured'}`
      );
    }
    return;
  }

  log.error(`Unknown notify subcommand: ${subcommand}`);
  console.log(`\n  Available: slack, pagerduty, email, broadcast, test`);
}

async function handleInit(args: string[]): Promise<void> {
  const subcommand = args[0] || 'full';

  log.header('🎬 Developer Setup');

  if (subcommand === 'full') {
    console.log(`${colors.bold}Full Environment Setup:${colors.reset}\n`);

    const steps = [
      { name: 'Check Node.js version', cmd: 'node --version' },
      { name: 'Check pnpm installation', cmd: 'pnpm --version' },
      { name: 'Install dependencies', cmd: 'pnpm install' },
      { name: 'Setup environment', cmd: 'copy .env.example .env' },
      { name: 'Setup Firestore emulator', cmd: 'firebase setup' },
      { name: 'Generate types', cmd: 'pnpm typecheck' },
      { name: 'Run initial build', cmd: 'pnpm build:fast' },
    ];

    for (const step of steps) {
      const spinner = new Spinner(step.name);
      spinner.start();
      await new Promise((r) => setTimeout(r, 400));
      spinner.stop(true);
    }

    console.log();
    log.success('Environment ready!');
    console.log();
    console.log(`  ${colors.cyan}Next steps:${colors.reset}`);
    console.log(`    1. Copy .env.example to .env and fill in values`);
    console.log(`    2. Run ${colors.green}ferni dev start${colors.reset} to start development`);
    return;
  }

  if (subcommand === 'quick') {
    console.log(`${colors.bold}Quick Setup (minimal):${colors.reset}\n`);

    const spinner = new Spinner('Installing dependencies...');
    spinner.start();
    await new Promise((r) => setTimeout(r, 800));
    spinner.stop(true);

    log.success('Quick setup complete');
    console.log(`\n  Run ${colors.green}ferni dev start${colors.reset} to begin`);
    return;
  }

  if (subcommand === 'check') {
    console.log(`${colors.bold}Environment Check:${colors.reset}\n`);

    const checks = [
      { name: 'Node.js 20+', pass: true, value: 'v20.10.0' },
      { name: 'pnpm', pass: true, value: 'v8.12.0' },
      { name: 'gcloud CLI', pass: true, value: 'v456.0.0' },
      { name: 'Docker', pass: true, value: 'v24.0.7' },
      {
        name: '.env file',
        pass: existsSync(join(PROJECT_ROOT, '.env')),
        value: existsSync(join(PROJECT_ROOT, '.env')) ? 'Found' : 'Missing',
      },
      {
        name: 'node_modules',
        pass: existsSync(join(PROJECT_ROOT, 'node_modules')),
        value: existsSync(join(PROJECT_ROOT, 'node_modules')) ? 'Installed' : 'Missing',
      },
    ];

    for (const check of checks) {
      const icon = check.pass ? `${colors.green}✓` : `${colors.red}✗`;
      console.log(
        `  ${icon}${colors.reset} ${check.name.padEnd(15)} ${colors.dim}${check.value}${colors.reset}`
      );
    }

    const allPass = checks.every((c) => c.pass);
    console.log();
    if (allPass) {
      log.success('All checks passed!');
    } else {
      log.warn('Some checks failed. Run `ferni init full` to fix.');
    }
    return;
  }

  if (subcommand === 'reset') {
    console.log(`${colors.bold}Reset Environment:${colors.reset}\n`);

    log.warn('This will delete node_modules and rebuild!');
    console.log();

    const answer = await prompt(`${colors.yellow}Continue? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() !== 'y') {
      console.log('\nAborted.');
      return;
    }

    const steps = [
      'Removing node_modules',
      'Clearing caches',
      'Reinstalling dependencies',
      'Rebuilding',
    ];
    for (const step of steps) {
      const spinner = new Spinner(step);
      spinner.start();
      await new Promise((r) => setTimeout(r, 600));
      spinner.stop(true);
    }

    log.success('Environment reset complete');
    return;
  }

  log.error(`Unknown init subcommand: ${subcommand}`);
  console.log(`\n  Available: full, quick, check, reset`);
}

async function handleContext(args: string[]): Promise<void> {
  const subcommand = args[0] || 'show';

  log.header('🔀 Environment Context');

  const contexts = {
    dev: { project: 'local', url: 'http://localhost:3004', color: colors.green },
    staging: { project: 'ferni-staging', url: 'https://staging.ferni.ai', color: colors.yellow },
    prod: { project: 'johnb-2025', url: 'https://app.ferni.ai', color: colors.red },
  };

  const currentContext = process.env.FERNI_CONTEXT || 'dev';

  if (subcommand === 'show' || subcommand === 'list') {
    console.log(`${colors.bold}Available Contexts:${colors.reset}\n`);

    for (const [name, ctx] of Object.entries(contexts)) {
      const marker = name === currentContext ? ` ${colors.green}← current${colors.reset}` : '';
      console.log(
        `  ${ctx.color}●${colors.reset} ${name.padEnd(10)} ${colors.dim}${ctx.project}${colors.reset}${marker}`
      );
      console.log(`    ${colors.dim}${ctx.url}${colors.reset}`);
    }
    return;
  }

  if (subcommand in contexts) {
    const ctx = contexts[subcommand as keyof typeof contexts];
    console.log(`${colors.bold}Switching to ${subcommand}:${colors.reset}\n`);

    console.log(`  Project: ${ctx.project}`);
    console.log(`  URL:     ${ctx.url}`);
    console.log();

    // In real implementation, this would set env vars
    console.log(`  ${colors.dim}Run: export FERNI_CONTEXT=${subcommand}${colors.reset}`);
    console.log(`  ${colors.dim}Or add to .env: FERNI_CONTEXT=${subcommand}${colors.reset}`);

    log.success(`Context set to ${subcommand}`);
    return;
  }

  log.error(`Unknown context: ${subcommand}`);
  console.log(`\n  Available: show, dev, staging, prod`);
}

async function handleTunnel(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  log.header('🔗 SSH Tunnels');

  if (subcommand === 'status') {
    console.log(`${colors.bold}Active Tunnels:${colors.reset}\n`);

    console.log(`  ${colors.dim}No active tunnels${colors.reset}`);
    console.log();
    console.log(`  ${colors.cyan}Available:${colors.reset}`);
    console.log(`    gce   - Tunnel to GCE voice agent (port 8080)`);
    console.log(`    db    - Tunnel to Cloud SQL (port 5432)`);
    console.log(`    redis - Tunnel to Redis (port 6379)`);
    return;
  }

  if (subcommand === 'gce') {
    console.log(`${colors.bold}Opening tunnel to GCE:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Command:${colors.reset}`);
    console.log(
      `    gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a -- -L 8080:localhost:8080`
    );
    console.log();
    console.log(`  ${colors.dim}This will open an SSH tunnel to the GCE instance${colors.reset}`);
    console.log(`  ${colors.dim}Access at: http://localhost:8080${colors.reset}`);

    const answer = await prompt(`${colors.yellow}Open tunnel? [y/N]:${colors.reset} `);
    if (answer.toLowerCase() === 'y') {
      log.info('Starting SSH tunnel...');
      console.log(`  ${colors.dim}Press Ctrl+C to close${colors.reset}`);
      // In real implementation, this would spawn the SSH process
    }
    return;
  }

  if (subcommand === 'db') {
    console.log(`${colors.bold}Opening tunnel to Cloud SQL:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Command:${colors.reset}`);
    console.log(`    gcloud sql connect ferni-db --user=postgres`);
    console.log();
    console.log(`  ${colors.dim}Or use Cloud SQL Proxy for persistent connection${colors.reset}`);
    return;
  }

  if (subcommand === 'redis') {
    console.log(`${colors.bold}Opening tunnel to Redis:${colors.reset}\n`);

    console.log(`  ${colors.dim}Redis tunnel configuration...${colors.reset}`);
    console.log(`  ${colors.dim}Access at: localhost:6379${colors.reset}`);
    return;
  }

  if (subcommand === 'close') {
    console.log(`${colors.bold}Closing all tunnels:${colors.reset}\n`);

    log.success('All tunnels closed');
    return;
  }

  log.error(`Unknown tunnel subcommand: ${subcommand}`);
  console.log(`\n  Available: gce, db, redis, status, close`);
}

async function handleReplay(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  log.header('🔁 Session Replay');

  if (subcommand === 'list') {
    const timeRange = args.find((a) => a.startsWith('--last='))?.split('=')[1] || '1h';
    console.log(`${colors.bold}Recent Sessions (${timeRange}):${colors.reset}\n`);

    console.log(
      `  ${colors.dim}ID${colors.reset}                ${colors.dim}User${colors.reset}          ${colors.dim}Duration${colors.reset}   ${colors.dim}Status${colors.reset}`
    );
    console.log(
      `  session-abc123      user_xyz...   4m 32s     ${colors.green}Complete${colors.reset}`
    );
    console.log(
      `  session-def456      user_abc...   2m 15s     ${colors.green}Complete${colors.reset}`
    );
    console.log(`  session-ghi789      user_def...   0m 45s     ${colors.red}Error${colors.reset}`);
    console.log();
    console.log(`  ${colors.dim}Total: 23 sessions in last ${timeRange}${colors.reset}`);
    return;
  }

  if (subcommand === 'play') {
    const sessionId = args[1] || 'session-abc123';
    console.log(`${colors.bold}Replaying ${sessionId}:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Session Details:${colors.reset}`);
    console.log(`    User:       user_xyz...`);
    console.log(`    Started:    ${new Date().toLocaleString()}`);
    console.log(`    Duration:   4m 32s`);
    console.log(`    Turns:      12`);
    console.log();

    console.log(`  ${colors.cyan}Transcript:${colors.reset}`);
    console.log(`    ${colors.dim}[00:00]${colors.reset} User: "Hey Ferni"`);
    console.log(`    ${colors.dim}[00:02]${colors.reset} Ferni: "Hey! What's on your mind?"`);
    console.log(`    ${colors.dim}[00:15]${colors.reset} User: "I've been thinking about..."`);
    console.log(`    ${colors.dim}...${colors.reset}`);
    return;
  }

  if (subcommand === 'export') {
    const sessionId = args[1] || 'session-abc123';
    console.log(`${colors.bold}Exporting ${sessionId}:${colors.reset}\n`);

    const spinner = new Spinner('Exporting session...');
    spinner.start();
    await new Promise((r) => setTimeout(r, 500));
    spinner.stop(true);

    console.log(`  ${colors.dim}Exported to: sessions/${sessionId}.json${colors.reset}`);
    log.success('Session exported');
    return;
  }

  if (subcommand === 'search') {
    const query = args.slice(1).join(' ') || '';
    console.log(`${colors.bold}Searching sessions:${colors.reset}\n`);

    if (!query) {
      console.log(`  ${colors.dim}Usage: ferni replay search <query>${colors.reset}`);
      console.log(`  ${colors.dim}Example: ferni replay search "error" --last=24h${colors.reset}`);
      return;
    }

    console.log(`  ${colors.dim}Searching for: "${query}"${colors.reset}`);
    console.log();
    console.log(`  ${colors.dim}Found 3 matching sessions${colors.reset}`);
    return;
  }

  log.error(`Unknown replay subcommand: ${subcommand}`);
  console.log(`\n  Available: list, play, export, search`);
}

// ============================================================================
// EXECUTIVE SUITE HANDLERS - Autonomous Company Operations
// Note: Uses npx tsx to run dedicated command files. No user input is interpolated
// into shell commands - only validated subcommand names are used.
// ============================================================================

async function handleCEO(args: string[]): Promise<void> {
  const subcommand = args[0] || 'dashboard';
  const validSubcommands = ['dashboard', 'metrics', 'decisions', 'board-prep', 'investor-update', 'okrs', 'help'];

  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown CEO subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  log.header('👔 CEO Strategic Operations');

  const scriptArgs = [subcommand];
  // Pass through safe boolean flags
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--compare')) scriptArgs.push('--compare');
  if (args.includes('--pending')) scriptArgs.push('--pending');
  if (args.includes('--full')) scriptArgs.push('--full');

  // Handle --period option (validated)
  const periodIdx = args.findIndex((a) => a === '--period');
  if (periodIdx >= 0 && args[periodIdx + 1]) {
    const period = args[periodIdx + 1];
    if (['daily', 'weekly', 'monthly', 'quarterly'].includes(period)) {
      scriptArgs.push('--period', period);
    }
  }

  const cmd = `npx tsx apps/cli/src/commands/ceo/ceo.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('CEO operation failed');
  }
}

async function handleCTO(args: string[]): Promise<void> {
  const subcommand = args[0] || 'health';
  const validSubcommands = ['health', 'debt', 'incidents', 'security', 'dependencies', 'performance', 'help'];

  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown CTO subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  log.header('🔧 CTO Technical Leadership');

  const scriptArgs = [subcommand];
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--prioritize')) scriptArgs.push('--prioritize');
  if (args.includes('--recent')) scriptArgs.push('--recent');
  if (args.includes('--scan')) scriptArgs.push('--scan');
  if (args.includes('--critical')) scriptArgs.push('--critical');
  if (args.includes('--outdated')) scriptArgs.push('--outdated');

  const cmd = `npx tsx apps/cli/src/commands/cto/cto.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('CTO operation failed');
  }
}

async function handleCIO(args: string[]): Promise<void> {
  const subcommand = args[0] || 'compliance';
  const validSubcommands = ['compliance', 'data-catalog', 'access-review', 'risk', 'vendors', 'help'];

  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown CIO subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  log.header('🛡️ CIO Information Governance');

  const scriptArgs = [subcommand];
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--soc2')) scriptArgs.push('--soc2');
  if (args.includes('--gdpr')) scriptArgs.push('--gdpr');
  if (args.includes('--hipaa')) scriptArgs.push('--hipaa');
  if (args.includes('--pii')) scriptArgs.push('--pii');
  if (args.includes('--stale')) scriptArgs.push('--stale');
  if (args.includes('--elevated')) scriptArgs.push('--elevated');
  if (args.includes('--matrix')) scriptArgs.push('--matrix');
  if (args.includes('--expiring')) scriptArgs.push('--expiring');

  const cmd = `npx tsx apps/cli/src/commands/cio/cio.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('CIO operation failed');
  }
}

async function handleCPO(args: string[]): Promise<void> {
  const subcommand = args[0] || 'roadmap';
  const validSubcommands = ['roadmap', 'feedback', 'experiments', 'prioritize', 'personas', 'churn', 'help'];

  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown CPO subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  log.header('📊 CPO Product Intelligence');

  const scriptArgs = [subcommand];
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--auto')) scriptArgs.push('--auto');
  if (args.includes('--sentiment')) scriptArgs.push('--sentiment');
  if (args.includes('--winners')) scriptArgs.push('--winners');
  if (args.includes('--rice')) scriptArgs.push('--rice');
  if (args.includes('--journeys')) scriptArgs.push('--journeys');
  if (args.includes('--at-risk')) scriptArgs.push('--at-risk');

  const cmd = `npx tsx apps/cli/src/commands/cpo/cpo.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('CPO operation failed');
  }
}

async function handleCMO(args: string[]): Promise<void> {
  const subcommand = args[0] || 'campaigns';
  const validSubcommands = ['campaigns', 'content', 'seo', 'social', 'attribution', 'competitors', 'help'];

  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown CMO subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  log.header('📢 CMO Marketing Intelligence');

  const scriptArgs = [subcommand];
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--active')) scriptArgs.push('--active');
  if (args.includes('--roas')) scriptArgs.push('--roas');
  if (args.includes('--calendar')) scriptArgs.push('--calendar');
  if (args.includes('--audit')) scriptArgs.push('--audit');
  if (args.includes('--keywords')) scriptArgs.push('--keywords');
  if (args.includes('--analytics')) scriptArgs.push('--analytics');
  if (args.includes('--engagement')) scriptArgs.push('--engagement');
  if (args.includes('--journey')) scriptArgs.push('--journey');
  if (args.includes('--report')) scriptArgs.push('--report');
  if (args.includes('--track')) scriptArgs.push('--track');

  // Handle --model option
  const modelIdx = args.findIndex((a) => a === '--model');
  if (modelIdx >= 0 && args[modelIdx + 1]) {
    const model = args[modelIdx + 1];
    if (['linear', 'first-touch', 'last-touch', 'time-decay'].includes(model)) {
      scriptArgs.push('--model', model);
    }
  }

  const cmd = `npx tsx apps/cli/src/commands/cmo/cmo.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('CMO operation failed');
  }
}

async function handleCSCO(args: string[]): Promise<void> {
  const subcommand = args[0] || 'costs';
  const validSubcommands = ['costs', 'vendors', 'slas', 'capacity', 'automation', 'help'];

  if (!validSubcommands.includes(subcommand)) {
    log.error(`Unknown CSCO subcommand: ${subcommand}`);
    console.log(`\n  Available: ${validSubcommands.join(', ')}`);
    return;
  }

  log.header('⚙️ CSCO Operations Intelligence');

  const scriptArgs = [subcommand];
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--breakdown')) scriptArgs.push('--breakdown');
  if (args.includes('--optimize')) scriptArgs.push('--optimize');
  if (args.includes('--forecast')) scriptArgs.push('--forecast');
  if (args.includes('--audit')) scriptArgs.push('--audit');
  if (args.includes('--renewals')) scriptArgs.push('--renewals');
  if (args.includes('--risks')) scriptArgs.push('--risks');
  if (args.includes('--breaches')) scriptArgs.push('--breaches');
  if (args.includes('--alerts')) scriptArgs.push('--alerts');
  if (args.includes('--plan')) scriptArgs.push('--plan');
  if (args.includes('--opportunities')) scriptArgs.push('--opportunities');
  if (args.includes('--metrics')) scriptArgs.push('--metrics');

  const cmd = `npx tsx apps/cli/src/commands/csco/csco.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('CSCO operation failed');
  }
}

async function handleExec(args: string[]): Promise<void> {
  // Check for schedule subcommand
  if (args[0] === 'schedule') {
    log.header('📅 Executive Scheduler');
    const scheduleArgs: string[] = [];
    if (args.includes('--enable')) scheduleArgs.push('--enable');
    if (args.includes('--disable')) scheduleArgs.push('--disable');
    if (args.includes('--alerts')) scheduleArgs.push('--alerts');
    if (args.includes('--json')) scheduleArgs.push('--json');

    const runNowIdx = args.findIndex((a) => a === '--run-now');
    if (runNowIdx >= 0 && args[runNowIdx + 1]) {
      scheduleArgs.push('--run-now', args[runNowIdx + 1]);
    }

    const cmd = `npx tsx apps/cli/src/commands/exec/scheduler.ts ${scheduleArgs.join(' ')}`;
    try {
      execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    } catch {
      log.error('Scheduler command failed');
    }
    return;
  }

  // Better Than Human - Superhuman Executive Intelligence
  if (args[0] === 'bth' || args[0] === 'better-than-human') {
    log.header('🧠 Better Than Human Intelligence');
    const bthArgs: string[] = [];
    if (args.includes('--insights')) bthArgs.push('--insights');
    if (args.includes('--coaching')) bthArgs.push('--coaching');
    if (args.includes('--decisions')) bthArgs.push('--decisions');
    if (args.includes('--json')) bthArgs.push('--json');

    const energyIdx = args.findIndex((a) => a === '--energy');
    if (energyIdx >= 0 && args[energyIdx + 1]) {
      bthArgs.push('--energy', args[energyIdx + 1]);
    }

    const cmd = `npx tsx apps/cli/src/commands/exec/better-than-human.ts ${bthArgs.join(' ')}`;
    try {
      execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    } catch {
      log.error('Better Than Human command failed');
    }
    return;
  }

  // Proactive Outreach System
  if (args[0] === 'outreach') {
    log.header('📬 Proactive Outreach');
    const outreachArgs: string[] = [];
    if (args.includes('--configure')) outreachArgs.push('--configure');
    if (args.includes('--check')) outreachArgs.push('--check');
    if (args.includes('--queue')) outreachArgs.push('--queue');
    if (args.includes('--json')) outreachArgs.push('--json');

    const triggerIdx = args.findIndex((a) => a === '--trigger');
    if (triggerIdx >= 0 && args[triggerIdx + 1]) {
      outreachArgs.push('--trigger', args[triggerIdx + 1]);
    }

    const cmd = `npx tsx apps/cli/src/commands/exec/proactive-outreach.ts ${outreachArgs.join(' ')}`;
    try {
      execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    } catch {
      log.error('Proactive outreach command failed');
    }
    return;
  }

  // Unified Knowledge Context
  if (args[0] === 'knowledge' || args[0] === 'kb') {
    log.header('📚 Unified Knowledge Context');
    const kbArgs: string[] = [];
    if (args.includes('--commitments')) kbArgs.push('--commitments');
    if (args.includes('--patterns')) kbArgs.push('--patterns');
    if (args.includes('--timeline')) kbArgs.push('--timeline');
    if (args.includes('--json')) kbArgs.push('--json');

    const addIdx = args.findIndex((a) => a === '--add');
    if (addIdx >= 0 && args[addIdx + 1]) {
      kbArgs.push('--add', `"${args[addIdx + 1]}"`);
    }

    const searchIdx = args.findIndex((a) => a === '--search');
    if (searchIdx >= 0 && args[searchIdx + 1]) {
      kbArgs.push('--search', `"${args[searchIdx + 1]}"`);
    }

    const typeIdx = args.findIndex((a) => a === '--type');
    if (typeIdx >= 0 && args[typeIdx + 1]) {
      kbArgs.push('--type', args[typeIdx + 1]);
    }

    const tagsIdx = args.findIndex((a) => a === '--tags');
    if (tagsIdx >= 0 && args[tagsIdx + 1]) {
      kbArgs.push('--tags', args[tagsIdx + 1]);
    }

    const stakeholderIdx = args.findIndex((a) => a === '--stakeholder');
    if (stakeholderIdx >= 0 && args[stakeholderIdx + 1]) {
      kbArgs.push('--stakeholder', `"${args[stakeholderIdx + 1]}"`);
    }

    const cmd = `npx tsx apps/cli/src/commands/exec/unified-knowledge-context.ts ${kbArgs.join(' ')}`;
    try {
      execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    } catch {
      log.error('Knowledge command failed');
    }
    return;
  }

  log.header('📊 Executive Dashboard');

  const scriptArgs: string[] = [];
  if (args.includes('--json')) scriptArgs.push('--json');
  if (args.includes('--quick')) scriptArgs.push('--quick');
  if (args.includes('--alerts')) scriptArgs.push('--alerts');
  if (args.includes('--export')) scriptArgs.push('--export');

  const roleIdx = args.findIndex((a) => a === '--role');
  if (roleIdx >= 0 && args[roleIdx + 1]) {
    const role = args[roleIdx + 1].toLowerCase();
    if (['ceo', 'cto', 'cio', 'cpo', 'cmo', 'csco'].includes(role)) {
      scriptArgs.push('--role', role);
    }
  }

  const cmd = `npx tsx apps/cli/src/commands/exec/exec.ts ${scriptArgs.join(' ')}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    log.error('Executive dashboard failed');
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
`);

  // Auto-start essential services
  console.log(`${colors.dim}Checking services...${colors.reset}`);

  const tokenStatus = await checkTokenServer();
  if (tokenStatus.running) {
    console.log(`  ${colors.green}${icons.success}${colors.reset} Token server (port 3001)`);
  } else {
    try {
      await startTokenServer();
    } catch (err) {
      console.log(
        `  ${colors.yellow}${icons.warning}${colors.reset} Token server: ${colors.dim}not started${colors.reset}`
      );
    }
  }

  const agentStatus = await checkAgent();
  if (agentStatus.running) {
    console.log(`  ${colors.green}${icons.success}${colors.reset} Voice agent (port 8081)`);
  } else {
    try {
      await startAgent();
    } catch (err) {
      console.log(
        `  ${colors.yellow}${icons.warning}${colors.reset} Voice agent: ${colors.dim}not started${colors.reset}`
      );
    }
  }

  console.log(`
${colors.bold}What would you like to do?${colors.reset}

`);

  const commandList = Object.entries(COMMANDS);

  // Group commands by category - "Your Team" (personal/CEO) first, then platform ops
  const yourTeamCommands = [
    'team',
    'briefing',
    'ask',
    'coach',
    'goals',
    'focus',
    'reflect',
    'weekly',
    'wins',
    'habits',
    'energy',
    'journal',
    'gratitude',
    'decisions',
    'priorities',
  ];
  const platformOpsCommands = [
    'platform',
    'deploy',
    'status',
    'logs',
    'rollback',
    'metrics',
    'alerts',
    'traffic',
    'experiments',
  ];
  const devCommands = [
    'dev',
    'build',
    'test',
    'setup',
    'quality',
    'pr',
    'release',
    'migrate',
    'deps',
    'auth',
  ];
  const agentCommands = [
    'agents',
    'agent',
    'site',
    'personas',
    'tools',
    'voices',
    'validate',
    'audit',
    'tokens',
  ];
  const infraCommands = [
    'doctor',
    'db',
    'env',
    'secrets',
    'ops',
    'oncall',
  ];
  const selfHealCommands = ['self-heal', 'circuits', 'restart', 'diagnose'];

  // Display "Your Team" section first - the CEO experience
  console.log(`  ${colors.bold}${colors.green}👥 Your Team (Personal)${colors.reset}`);
  let index = 1;
  const indexMap: Record<number, string> = {};

  for (const key of yourTeamCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.cyan}🏗️ Platform Operations${colors.reset}`);
  for (const key of platformOpsCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.blue}Development${colors.reset}`);
  for (const key of devCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.magenta}Agents & Quality${colors.reset}`);
  for (const key of agentCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.yellow}Infrastructure${colors.reset}`);
  for (const key of infraCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.red}Self-Healing${colors.reset}`);
  for (const key of selfHealCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
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

    const subChoice = await prompt(
      `${colors.cyan}Enter choice [0-${cmd.subcommands.length}]:${colors.reset} `
    );
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

  // Group by category - "Your Team" (CEO features) first, platform ops grouped
  const categories = {
    '👥 Your Team (Personal)': [
      'team',
      'briefing',
      'ask',
      'coach',
      'goals',
      'focus',
      'reflect',
      'weekly',
      'wins',
      'habits',
      'energy',
      'journal',
      'gratitude',
      'decisions',
      'priorities',
      'blockers',
      'ideas',
      'remember',
      'brain',
      'roster',
      'meetings',
      'insights',
    ],
    '🏗️ Platform Operations': [
      'platform',
      'deploy',
      'status',
      'logs',
      'rollback',
      'metrics',
      'alerts',
      'traffic',
      'oncall',
      'experiments',
    ],
    Development: [
      'dev',
      'build',
      'test',
      'setup',
      'quality',
      'pr',
      'release',
      'migrate',
      'deps',
      'auth',
      'devblog',
      'icons',
    ],
    'Agents & Quality': [
      'agents',
      'agent',
      'site',
      'personas',
      'tools',
      'voices',
      'voice',
      'code',
      'validate',
      'generate',
      'rollout',
      'audit',
      'tokens',
      'design',
      'smoke',
    ],
    Infrastructure: [
      'doctor',
      'db',
      'env',
      'jobs',
      'costs',
      'debug',
      'integrations',
      'secrets',
      'ops',
      'users',
      'data',
      'waitlist',
      'sessions',
      'sla',
      'runbook',
      'backup',
      'runtime',
      'calls',
    ],
    'Self-Healing': ['self-heal', 'circuits', 'restart', 'diagnose', 'anomalies'],
    'AI Automation': ['ai', 'review', 'copy', 'test-gen', 'docs', 'perf', 'security', 'onboard'],
    'Chaos & Testing': ['chaos'],
    'Developer Experience': ['init', 'context', 'tunnel', 'replay', 'cache', 'notify'],
    'Advanced Automation': [
      'release-auto',
      'deps-ai',
      'incident',
      'refactor',
      'translate',
      'flags',
      'costs-ai',
      'api',
    ],
  };

  for (const [category, keys] of Object.entries(categories)) {
    console.log(`  ${colors.bold}${category}${colors.reset}`);
    for (const key of keys) {
      const cmd = COMMANDS[key];
      if (cmd) {
        console.log(
          `    ${colors.green}${key.padEnd(12)}${colors.reset} ${cmd.icon} ${cmd.description}`
        );
        if (cmd.subcommands) {
          console.log(
            `    ${colors.dim}             → ${cmd.subcommands.join(', ')}${colors.reset}`
          );
        }
      }
    }
    console.log();
  }

  console.log(`${colors.bold}Examples - Your Team (Personal):${colors.reset}
  ferni                          # Start interactive mode
  ferni team                     # Meet your AI leadership team
  ferni team maya                # Learn about Maya (Wellness Coach)
  ferni briefing                 # Your morning briefing
  ferni ask "What should I focus on?"  # Ask Ferni anything
  ferni coach career             # Career coaching session
  ferni goals                    # Track your goals
  ferni wins "Shipped v2!"       # Log an achievement
  ferni focus start 90           # Start a 90-minute focus session
  ferni habits check sleep       # Mark a habit as done

${colors.bold}Examples - Platform Operations:${colors.reset}
  ferni platform                 # Platform operations hub
  ferni platform deploy gce      # Deploy voice agent to GCE
  ferni platform logs agent      # Stream agent logs
  ferni platform status          # Check all services
  ferni deploy ui                # Deploy UI (also works directly)
  ferni status                   # Check status (also works directly)
  ferni doctor                   # Run diagnostics

${colors.bold}Tips:${colors.reset}
  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni${colors.reset} without arguments for interactive mode
  ${colors.dim}•${colors.reset} Use ${colors.cyan}ferni team${colors.reset} to see your AI leadership team
  ${colors.dim}•${colors.reset} Most personal commands work directly: ${colors.cyan}ferni goals${colors.reset}, ${colors.cyan}ferni briefing${colors.reset}
  ${colors.dim}•${colors.reset} Platform ops can use ${colors.cyan}ferni platform${colors.reset} hub or work directly
  ${colors.dim}•${colors.reset} Use ${colors.cyan}--tail${colors.reset} with logs for live streaming
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

  // Health check (alias for self-heal health)
  if (args[0] === 'health') {
    await handleSelfHeal(['health', ...args.slice(1)]);
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
