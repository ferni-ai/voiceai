#!/usr/bin/env npx tsx
/**
 * Environment Config Generator
 *
 * Scans the codebase for process.env.* usage and generates a comprehensive
 * .env.example file with documentation.
 *
 * Usage:
 *   npx tsx scripts/generate-env-example.ts           # Generate .env.example
 *   npx tsx scripts/generate-env-example.ts --report  # Show report only
 *   npx tsx scripts/generate-env-example.ts --diff    # Show changes from existing
 *
 * Or via npm:
 *   npm run env:generate
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, relative } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// Directories to scan
const SCAN_DIRS = ['src', 'scripts', 'apps/web/src'];

// Files to exclude
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.test\./,
  /\.spec\./,
  /\.d\.ts$/,
];

// ============================================================================
// COLORS & LOGGING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// ENV VAR METADATA
// ============================================================================

interface EnvVarInfo {
  name: string;
  sources: string[];
  hasDefault: boolean;
  defaultValue?: string;
  category: string;
  description: string;
  required: boolean;
  example?: string;
  sensitive: boolean;
}

// Known environment variables with descriptions
const ENV_METADATA: Record<string, Partial<EnvVarInfo>> = {
  // LiveKit
  LIVEKIT_URL: {
    category: 'LiveKit',
    description: 'LiveKit server WebSocket URL',
    required: true,
    example: 'wss://your-project.livekit.cloud',
    sensitive: false,
  },
  LIVEKIT_API_KEY: {
    category: 'LiveKit',
    description: 'LiveKit API key',
    required: true,
    example: 'APIxxxxxxx',
    sensitive: true,
  },
  LIVEKIT_API_SECRET: {
    category: 'LiveKit',
    description: 'LiveKit API secret',
    required: true,
    example: 'your-secret-key',
    sensitive: true,
  },

  // Google AI
  GOOGLE_API_KEY: {
    category: 'Google AI',
    description: 'Google AI API key for Gemini',
    required: true,
    example: 'AIza...',
    sensitive: true,
  },
  GOOGLE_CLOUD_PROJECT: {
    category: 'Google Cloud',
    description: 'GCP project ID for Firestore',
    required: false,
    example: 'your-project-id',
    sensitive: false,
  },
  GOOGLE_APPLICATION_CREDENTIALS: {
    category: 'Google Cloud',
    description: 'Path to GCP service account JSON',
    required: false,
    example: '/path/to/service-account.json',
    sensitive: false,
  },

  // Cartesia TTS
  CARTESIA_API_KEY: {
    category: 'Cartesia TTS',
    description: 'Cartesia API key for text-to-speech',
    required: true,
    example: 'sk-cart-...',
    sensitive: true,
  },

  // Database
  DATABASE_URL: {
    category: 'Database',
    description: 'PostgreSQL connection URL',
    required: false,
    example: 'postgresql://user:pass@localhost:5432/dbname',
    sensitive: true,
  },
  REDIS_URL: {
    category: 'Database',
    description: 'Redis connection URL',
    required: false,
    example: 'redis://localhost:6379',
    sensitive: false,
  },

  // Persona
  PERSONA_ID: {
    category: 'Application',
    description: 'Default persona to use',
    required: false,
    example: 'ferni',
    sensitive: false,
  },
  NODE_ENV: {
    category: 'Application',
    description: 'Node environment (development/production)',
    required: false,
    example: 'development',
    sensitive: false,
  },

  // Communication (Alex)
  SENDGRID_API_KEY: {
    category: 'Communication',
    description: 'SendGrid API key for email',
    required: false,
    example: 'SG.xxx',
    sensitive: true,
  },
  TWILIO_ACCOUNT_SID: {
    category: 'Communication',
    description: 'Twilio account SID',
    required: false,
    example: 'ACxxx',
    sensitive: true,
  },
  TWILIO_AUTH_TOKEN: {
    category: 'Communication',
    description: 'Twilio auth token',
    required: false,
    example: 'your-auth-token',
    sensitive: true,
  },
  TWILIO_PHONE_NUMBER: {
    category: 'Communication',
    description: 'Twilio phone number for SMS/calls',
    required: false,
    example: '+1234567890',
    sensitive: false,
  },

  // Financial APIs
  ALPHA_VANTAGE_API_KEY: {
    category: 'Financial APIs',
    description: 'Alpha Vantage API key for stock data',
    required: false,
    example: 'your-alpha-vantage-key',
    sensitive: true,
  },
  FINNHUB_API_KEY: {
    category: 'Financial APIs',
    description: 'Finnhub API key for market data',
    required: false,
    example: 'your-finnhub-key',
    sensitive: true,
  },

  // Spotify
  SPOTIFY_CLIENT_ID: {
    category: 'Spotify',
    description: 'Spotify OAuth client ID',
    required: false,
    example: 'your-client-id',
    sensitive: false,
  },
  SPOTIFY_CLIENT_SECRET: {
    category: 'Spotify',
    description: 'Spotify OAuth client secret',
    required: false,
    example: 'your-client-secret',
    sensitive: true,
  },

  // Stripe
  STRIPE_SECRET_KEY: {
    category: 'Stripe',
    description: 'Stripe secret key for payments',
    required: false,
    example: 'sk_test_...',
    sensitive: true,
  },
  STRIPE_WEBHOOK_SECRET: {
    category: 'Stripe',
    description: 'Stripe webhook signing secret',
    required: false,
    example: 'whsec_...',
    sensitive: true,
  },

  // Sentry
  SENTRY_DSN: {
    category: 'Monitoring',
    description: 'Sentry DSN for error tracking',
    required: false,
    example: 'https://xxx@sentry.io/xxx',
    sensitive: false,
  },

  // Slack
  SLACK_WEBHOOK_URL: {
    category: 'Notifications',
    description: 'Slack webhook URL for notifications',
    required: false,
    example: 'https://hooks.slack.com/services/xxx',
    sensitive: true,
  },

  // GCP Deployment
  GCP_PROJECT_ID: {
    category: 'Deployment',
    description: 'GCP project ID for deployment',
    required: false,
    example: 'your-gcp-project',
    sensitive: false,
  },
  GCP_REGION: {
    category: 'Deployment',
    description: 'GCP region for deployment',
    required: false,
    example: 'us-central1',
    sensitive: false,
  },
};

// ============================================================================
// FILE SCANNER
// ============================================================================

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string) {
    try {
      const entries = readdirSync(currentPath);
      for (const entry of entries) {
        const fullPath = join(currentPath, entry);

        // Skip excluded patterns
        if (EXCLUDE_PATTERNS.some(p => p.test(fullPath))) {
          continue;
        }

        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile()) {
          const ext = extname(entry);
          if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  walk(dir);
  return files;
}

function extractEnvVars(filePath: string): Map<string, { hasDefault: boolean; defaultValue?: string }> {
  const envVars = new Map<string, { hasDefault: boolean; defaultValue?: string }>();
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Match process.env.VAR_NAME
    const envRegex = /process\.env\.([A-Z][A-Z0-9_]*)/g;
    let match;
    while ((match = envRegex.exec(content)) !== null) {
      const varName = match[1];
      if (!envVars.has(varName)) {
        envVars.set(varName, { hasDefault: false });
      }
    }

    // Match process.env.VAR_NAME || 'default' or process.env.VAR_NAME ?? 'default'
    const defaultRegex = /process\.env\.([A-Z][A-Z0-9_]*)\s*(?:\|\||\?\?)\s*['"`]([^'"`]+)['"`]/g;
    while ((match = defaultRegex.exec(content)) !== null) {
      const varName = match[1];
      const defaultValue = match[2];
      envVars.set(varName, { hasDefault: true, defaultValue });
    }

    // Match process.env['VAR_NAME']
    const bracketRegex = /process\.env\[['"`]([A-Z][A-Z0-9_]*)['"`]\]/g;
    while ((match = bracketRegex.exec(content)) !== null) {
      const varName = match[1];
      if (!envVars.has(varName)) {
        envVars.set(varName, { hasDefault: false });
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return envVars;
}

// ============================================================================
// GENERATOR
// ============================================================================

function scanCodebase(): Map<string, EnvVarInfo> {
  const allEnvVars = new Map<string, EnvVarInfo>();

  for (const scanDir of SCAN_DIRS) {
    const fullPath = join(PROJECT_ROOT, scanDir);
    if (!existsSync(fullPath)) continue;

    const files = getAllFiles(fullPath);

    for (const file of files) {
      const envVars = extractEnvVars(file);
      const relativePath = relative(PROJECT_ROOT, file);

      for (const [name, info] of envVars) {
        if (allEnvVars.has(name)) {
          allEnvVars.get(name)!.sources.push(relativePath);
          if (info.hasDefault && !allEnvVars.get(name)!.hasDefault) {
            allEnvVars.get(name)!.hasDefault = true;
            allEnvVars.get(name)!.defaultValue = info.defaultValue;
          }
        } else {
          const metadata = ENV_METADATA[name] || {};
          allEnvVars.set(name, {
            name,
            sources: [relativePath],
            hasDefault: info.hasDefault,
            defaultValue: info.defaultValue,
            category: metadata.category || 'Other',
            description: metadata.description || '',
            // Only mark as required if explicitly set in metadata
            required: metadata.required ?? false,
            example: metadata.example,
            sensitive: metadata.sensitive ?? (name.toLowerCase().includes('secret') || name.toLowerCase().includes('key') || name.toLowerCase().includes('password')),
          });
        }
      }
    }
  }

  return allEnvVars;
}

function generateEnvExample(envVars: Map<string, EnvVarInfo>): string {
  const lines: string[] = [];

  lines.push('# ============================================================================');
  lines.push('# Ferni AI - Environment Configuration');
  lines.push('# ============================================================================');
  lines.push('# Auto-generated by: npm run env:generate');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('# ============================================================================');
  lines.push('');
  lines.push('# Copy this file to .env and fill in your values.');
  lines.push('# Variables marked [REQUIRED] must be set for the app to work.');
  lines.push('# Variables marked [OPTIONAL] have defaults or are only needed for specific features.');
  lines.push('');

  // Group by category
  const categories = new Map<string, EnvVarInfo[]>();
  for (const info of envVars.values()) {
    if (!categories.has(info.category)) {
      categories.set(info.category, []);
    }
    categories.get(info.category)!.push(info);
  }

  // Sort categories (required first, then alphabetical)
  const categoryOrder = [
    'LiveKit',
    'Google AI',
    'Cartesia TTS',
    'Application',
    'Database',
    'Google Cloud',
    'Communication',
    'Financial APIs',
    'Spotify',
    'Stripe',
    'Monitoring',
    'Notifications',
    'Deployment',
    'Other',
  ];

  const sortedCategories = [...categories.entries()].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a[0]);
    const bIndex = categoryOrder.indexOf(b[0]);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  for (const [category, vars] of sortedCategories) {
    lines.push(`# ----------------------------------------------------------------------------`);
    lines.push(`# ${category.toUpperCase()}`);
    lines.push(`# ----------------------------------------------------------------------------`);
    lines.push('');

    // Sort vars: required first, then alphabetical
    vars.sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const info of vars) {
      // Description
      if (info.description) {
        lines.push(`# ${info.description}`);
      }

      // Required indicator
      const reqTag = info.required ? '[REQUIRED]' : '[OPTIONAL]';
      lines.push(`# ${reqTag}`);

      // Value line
      let value = info.example || '';
      if (info.sensitive && !value) {
        value = 'your-' + info.name.toLowerCase().replace(/_/g, '-');
      }
      if (info.hasDefault && info.defaultValue) {
        value = info.defaultValue;
      }

      // Comment out optional vars
      const prefix = info.required ? '' : '# ';
      lines.push(`${prefix}${info.name}=${value}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// REPORT
// ============================================================================

function printReport(envVars: Map<string, EnvVarInfo>): void {
  log.step('ENVIRONMENT VARIABLE REPORT');

  // Group by category
  const categories = new Map<string, EnvVarInfo[]>();
  for (const info of envVars.values()) {
    if (!categories.has(info.category)) {
      categories.set(info.category, []);
    }
    categories.get(info.category)!.push(info);
  }

  // Stats
  const required = [...envVars.values()].filter(v => v.required).length;
  const optional = envVars.size - required;
  const sensitive = [...envVars.values()].filter(v => v.sensitive).length;

  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  Total variables: ${envVars.size}`);
  console.log(`  ${colors.red}Required:${colors.reset} ${required}`);
  console.log(`  ${colors.yellow}Optional:${colors.reset} ${optional}`);
  console.log(`  ${colors.cyan}Sensitive:${colors.reset} ${sensitive}`);
  console.log(`  Categories: ${categories.size}`);
  console.log('');

  console.log(`${colors.bold}By Category:${colors.reset}`);
  for (const [category, vars] of categories) {
    const requiredCount = vars.filter(v => v.required).length;
    console.log(`  ${colors.cyan}${category}:${colors.reset} ${vars.length} vars (${requiredCount} required)`);
  }
  console.log('');

  // Required variables
  console.log(`${colors.bold}Required Variables:${colors.reset}`);
  for (const info of envVars.values()) {
    if (info.required) {
      console.log(`  ${colors.green}${info.name}${colors.reset} - ${info.description || 'No description'}`);
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}ENVIRONMENT CONFIG GENERATOR${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/generate-env-example.ts [options]
  npm run env:generate [options]

${colors.bold}Options:${colors.reset}
  --report     Show report only, don't generate file
  --diff       Show changes from existing .env.example
  --help, -h   Show this help

${colors.bold}Examples:${colors.reset}
  npm run env:generate           # Generate .env.example
  npm run env:generate --report  # Show report only
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const reportOnly = args.includes('--report');
  const showDiff = args.includes('--diff');

  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}ENVIRONMENT CONFIG GENERATOR${colors.reset}                             ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  log.info('Scanning codebase for environment variables...');
  const envVars = scanCodebase();
  log.success(`Found ${envVars.size} environment variables`);

  if (reportOnly) {
    printReport(envVars);
    return;
  }

  const content = generateEnvExample(envVars);
  const outputPath = join(PROJECT_ROOT, '.env.example');

  if (showDiff && existsSync(outputPath)) {
    const existing = readFileSync(outputPath, 'utf-8');
    if (existing === content) {
      log.success('.env.example is up to date');
      return;
    }
    log.warn('.env.example would be updated');
    // Could add actual diff output here
  }

  writeFileSync(outputPath, content);
  log.success(`Generated ${outputPath}`);

  printReport(envVars);
}

main().catch((error) => {
  log.error(`Failed: ${error.message}`);
  process.exit(1);
});

