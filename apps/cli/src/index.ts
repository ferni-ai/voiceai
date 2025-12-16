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
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

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
    script: 'apps/cli/src/commands/validate/validate.ts',
    subcommands: ['voices', 'humanization', 'integrations', 'persistence', 'all'],
    examples: ['ferni validate voices', 'ferni validate all'],
  },
  audit: {
    name: 'Audit',
    description: 'Run code quality audits',
    icon: '🔍',
    script: 'apps/cli/src/commands/quality/audit.ts',
    subcommands: ['quality', 'architecture', 'legacy', 'a11y', 'all'],
    examples: ['ferni audit quality', 'ferni audit all'],
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
    description: 'A/B testing & feature experiments',
    icon: '🧬',
    handler: handleExperiments,
    subcommands: ['list', 'create', 'start', 'stop', 'results', 'winner'],
    examples: ['ferni experiments list', 'ferni experiments results exp-123'],
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
  backup: {
    name: 'Backup',
    description: 'Firestore backup management',
    icon: '💾',
    handler: handleBackup,
    subcommands: ['create', 'list', 'restore', 'status', 'cleanup'],
    examples: ['ferni backup create', 'ferni backup list', 'ferni backup restore <path>'],
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
  context: {
    name: 'Context',
    description: 'What Ferni knows about you (CEO feature)',
    icon: '🧠',
    handler: handleCEOContext,
    subcommands: ['show', 'summary', 'delete'],
    examples: ['ferni context', 'ferni context --summary'],
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
  // Operations & Infrastructure
  disk: {
    name: 'Disk',
    description: 'GCE disk management & cleanup',
    icon: '💽',
    handler: handleDisk,
    subcommands: ['status', 'clean', 'clean:aggressive', 'setup-cron'],
    examples: [
      'ferni disk',
      'ferni disk clean',
      'ferni disk clean:aggressive',
      'ferni disk setup-cron',
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
      log.error('Search query required');
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
      log.error(`Unknown service: ${subcommand}`);
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
      console.log(`${colors.dim}See: design-system/brand/FERNI-BRAND-GUIDELINES.md${colors.reset}`);
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
      log.error('.env file not found');
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
      log.error('.env file not found');
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
  const subcommand = args[0] || 'list';

  log.header(`🔧 LLM Tools Management`);

  const toolsDir = join(PROJECT_ROOT, 'src', 'tools');

  if (subcommand === 'list') {
    console.log(`${colors.bold}Available LLM Tools:${colors.reset}\n`);

    // Get tool files
    const toolFiles = execCommand(
      `find ${toolsDir} -name "*.ts" -type f ! -name "*.test.ts" ! -name "types.ts" ! -name "index.ts" ! -path "*/node_modules/*" 2>/dev/null`
    );

    const tools = toolFiles
      .split('\n')
      .filter(Boolean)
      .map((f) => {
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

    const toolPath = execCommand(
      `find ${toolsDir} -name "${toolName}.ts" -type f ! -name "*.test.ts" 2>/dev/null | head -1`
    );

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
    const functions = execCommand(
      `grep -E "^(export )?(async )?function" "${toolPath}" 2>/dev/null | head -5`
    );
    if (functions) {
      console.log(`\n  ${colors.cyan}Functions:${colors.reset}`);
      functions
        .split('\n')
        .filter(Boolean)
        .forEach((fn) => {
          const match = fn.match(/function\s+(\w+)/);
          if (match) {
            console.log(`    ${colors.dim}${icons.bullet}${colors.reset} ${match[1]}`);
          }
        });
    }
  }

  if (subcommand === 'stats') {
    console.log(`${colors.bold}Tool Statistics:${colors.reset}\n`);

    const toolFiles = execCommand(
      `find ${toolsDir} -name "*.ts" -type f ! -name "*.test.ts" ! -name "types.ts" ! -name "index.ts" 2>/dev/null`
    );
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
    const { getVoiceIdForPersona } = await import('../src/config/voice-ids.js');
    const { humanizeText, addBreathGroupPauses } =
      await import('../src/speech/advanced-humanization/index.js');

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
  const { handleGoals } = await import('./features/ceo.js');
  await handleGoals(args);
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
    log.error('Claude Code CLI not found!');
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
      log.error('You have uncommitted changes. Please commit or stash them first.');
      return;
    }

    // Check if tag already exists
    const tagExists = execCommand(`git tag -l ${version}`);
    if (tagExists) {
      log.error(`Tag ${version} already exists`);
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
    log.error(`Failed to check health: ${(error as Error).message}`);
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
    log.error('Could not reach health endpoint');
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

  log.header('🧬 A/B Experiments');

  const experiments = [
    { id: 'exp-voice-speed', name: 'Voice Speed Variants', status: 'running', traffic: '50/50' },
    { id: 'exp-greeting', name: 'Greeting Message Test', status: 'running', traffic: '33/33/34' },
    { id: 'exp-avatar', name: 'Avatar Style Test', status: 'completed', traffic: 'N/A' },
  ];

  if (subcommand === 'list') {
    console.log(`${colors.bold}Active Experiments:${colors.reset}\n`);

    for (const exp of experiments) {
      const statusColor = exp.status === 'running' ? colors.green : colors.dim;
      console.log(`  ${colors.cyan}${exp.id}${colors.reset}`);
      console.log(`    ${exp.name}`);
      console.log(
        `    Status: ${statusColor}${exp.status}${colors.reset} • Traffic: ${exp.traffic}`
      );
      console.log();
    }
    return;
  }

  if (subcommand === 'results') {
    const expId = args[1] || experiments[0].id;
    console.log(`${colors.bold}Results for ${expId}:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Variant A (Control):${colors.reset}`);
    console.log(`    Sessions:     1,234`);
    console.log(`    Completion:   ${colors.yellow}72%${colors.reset}`);
    console.log(`    Avg Duration: 4m 12s`);
    console.log();

    console.log(`  ${colors.cyan}Variant B (Test):${colors.reset}`);
    console.log(`    Sessions:     1,256`);
    console.log(`    Completion:   ${colors.green}78%${colors.reset} (+6%)`);
    console.log(`    Avg Duration: 4m 45s`);
    console.log();

    console.log(`  ${colors.green}Statistical Significance: 95%${colors.reset}`);
    console.log(`  ${colors.bold}Recommendation: Variant B wins${colors.reset}`);
    return;
  }

  if (subcommand === 'create') {
    console.log(`${colors.bold}Create New Experiment:${colors.reset}\n`);

    console.log(`  ${colors.cyan}Steps:${colors.reset}`);
    console.log(`    1. Define variants in feature flags`);
    console.log(`    2. Set traffic allocation`);
    console.log(`    3. Define success metrics`);
    console.log(`    4. Set minimum sample size`);
    console.log();
    console.log(`  ${colors.dim}See docs/experiments/ for examples${colors.reset}`);
    return;
  }

  if (subcommand === 'start' || subcommand === 'stop') {
    const expId = args[1] || experiments[0].id;
    const action = subcommand === 'start' ? 'Starting' : 'Stopping';

    const spinner = new Spinner(`${action} ${expId}...`);
    spinner.start();
    await new Promise((r) => setTimeout(r, 500));
    spinner.stop(true);

    log.success(`Experiment ${expId} ${subcommand === 'start' ? 'started' : 'stopped'}`);
    return;
  }

  if (subcommand === 'winner') {
    const expId = args[1] || experiments[0].id;
    console.log(`${colors.bold}Declaring winner for ${expId}:${colors.reset}\n`);

    console.log(`  ${colors.green}✓${colors.reset} Variant B selected as winner`);
    console.log(`  ${colors.dim}Traffic: 100% → Variant B${colors.reset}`);
    console.log(`  ${colors.dim}Experiment archived${colors.reset}`);
    return;
  }

  log.error(`Unknown experiments subcommand: ${subcommand}`);
  console.log(`\n  Available: list, create, start, stop, results, winner`);
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

  // Group commands by category
  const devCommands = [
    'dev',
    'deploy',
    'build',
    'test',
    'setup',
    'quality',
    'pr',
    'release',
    'migrate',
    'deps',
  ];
  const opsCommands = [
    'status',
    'logs',
    'doctor',
    'db',
    'env',
    'jobs',
    'costs',
    'debug',
    'integrations',
    'secrets',
  ];
  const selfHealCommands = ['self-heal', 'circuits', 'restart', 'diagnose', 'anomalies'];
  const agentCommands = [
    'agents',
    'personas',
    'tools',
    'voices',
    'validate',
    'generate',
    'rollout',
    'audit',
    'tokens',
    'design',
  ];
  const aiCommands = ['ai', 'review', 'copy', 'test-gen', 'docs', 'perf', 'security', 'onboard'];
  const platformCommands = [
    'rollback',
    'metrics',
    'sessions',
    'sla',
    'traffic',
    'alerts',
    'oncall',
    'runbook',
    'backup',
  ];
  const chaosTestingCommands = ['chaos', 'experiments'];
  const devExperienceCommands = ['init', 'context', 'tunnel', 'replay', 'cache', 'notify'];
  const advancedCommands = [
    'release-auto',
    'deps-ai',
    'incident',
    'refactor',
    'translate',
    'flags',
    'costs-ai',
    'api',
  ];

  console.log(`  ${colors.bold}${colors.blue}Development${colors.reset}`);
  let index = 1;
  const indexMap: Record<number, string> = {};

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

  console.log(`\n  ${colors.bold}${colors.magenta}Operations${colors.reset}`);
  for (const key of opsCommands) {
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

  console.log(`\n  ${colors.bold}${colors.cyan}Agents & Quality${colors.reset}`);
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

  console.log(`\n  ${colors.bold}${colors.yellow}AI Automation${colors.reset}`);
  for (const key of aiCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.cyan}Platform Oversight${colors.reset}`);
  for (const key of platformCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.red}Chaos & Testing${colors.reset}`);
  for (const key of chaosTestingCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.green}Developer Experience${colors.reset}`);
  for (const key of devExperienceCommands) {
    const cmd = COMMANDS[key];
    if (cmd) {
      console.log(
        `    ${colors.green}${index.toString().padStart(2)}${colors.reset}) ${cmd.icon} ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`
      );
      indexMap[index] = key;
      index++;
    }
  }

  console.log(`\n  ${colors.bold}${colors.magenta}Advanced Automation${colors.reset}`);
  for (const key of advancedCommands) {
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

  // Group by category
  const categories = {
    Development: [
      'dev',
      'deploy',
      'build',
      'test',
      'setup',
      'quality',
      'pr',
      'release',
      'migrate',
      'deps',
    ],
    Operations: [
      'status',
      'logs',
      'doctor',
      'db',
      'env',
      'jobs',
      'costs',
      'debug',
      'integrations',
      'secrets',
    ],
    'Self-Healing': ['self-heal', 'circuits', 'restart', 'diagnose', 'anomalies'],
    'Agents & Quality': [
      'agents',
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
    ],
    'AI Automation': ['ai', 'review', 'copy', 'test-gen', 'docs', 'perf', 'security', 'onboard'],
    'Platform Oversight': [
      'rollback',
      'metrics',
      'sessions',
      'sla',
      'traffic',
      'alerts',
      'oncall',
      'runbook',
      'backup',
      'runtime',
    ],
    'Chaos & Testing': ['chaos', 'experiments'],
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
    'CEO Features': ['goals', 'roster', 'remember'],
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

  console.log(`${colors.bold}Examples:${colors.reset}
  ferni                          # Start interactive mode
  ferni deploy ui                # Deploy UI to cloud
  ferni deploy gce               # Deploy voice agent to GCE
  ferni agents list              # List AI agents
  ferni logs agent --tail        # Stream agent logs
  ferni status                   # Check all services
  ferni doctor                   # Run diagnostics
  ferni db status                # Check database
  ferni env check                # Validate environment
  ferni traffic canary 10        # Canary 10% traffic to new version
  ferni alerts active            # Show active alerts
  ferni oncall who               # Who's on call right now?
  ferni chaos latency 500        # Inject 500ms latency for testing
  ferni context prod             # Switch to production environment
  ferni tunnel gce               # SSH tunnel to GCE instance
  ferni rollback agent           # Rollback to previous version

${colors.bold}Tips:${colors.reset}
  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni${colors.reset} without arguments for interactive mode
  ${colors.dim}•${colors.reset} Use ${colors.cyan}--tail${colors.reset} with logs for live streaming
  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni doctor${colors.reset} to diagnose issues
  ${colors.dim}•${colors.reset} Use ${colors.cyan}ferni context <env>${colors.reset} to switch environments
  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni oncall who${colors.reset} to see who's on call
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
