#!/usr/bin/env npx tsx
/**
 * Feature Flag Intelligence
 * 
 * AI-powered feature flag management and optimization.
 * 
 * @module @ferni/cli/flags
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// Gemini API
async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// FIND FLAGS
// =============================================================================

interface FeatureFlag {
  name: string;
  file: string;
  line: number;
  usage: 'check' | 'define';
}

function findFeatureFlags(): FeatureFlag[] {
  const flags: FeatureFlag[] = [];
  
  // Common feature flag patterns
  const patterns = [
    /featureFlag\(['"]([^'"]+)['"]\)/g,
    /isFeatureEnabled\(['"]([^'"]+)['"]\)/g,
    /features\.([A-Z_]+)/g,
    /FLAGS\.([A-Z_]+)/g,
    /process\.env\.FEATURE_([A-Z_]+)/g,
    /enabledFeatures\.includes\(['"]([^'"]+)['"]\)/g,
  ];

  try {
    const files = execSync(
      'find frontend-typescript/src src -name "*.ts" -o -name "*.tsx" 2>/dev/null',
      { encoding: 'utf8', cwd: PROJECT_ROOT }
    ).trim().split('\n');

    for (const file of files) {
      if (!file || !existsSync(join(PROJECT_ROOT, file))) continue;
      
      const content = readFileSync(join(PROJECT_ROOT, file), 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, i) => {
        for (const pattern of patterns) {
          const matches = line.matchAll(pattern);
          for (const match of matches) {
            flags.push({
              name: match[1],
              file,
              line: i + 1,
              usage: line.includes('=') || line.includes('define') ? 'define' : 'check',
            });
          }
        }
      });
    }
  } catch {
    // Ignore scan errors
  }

  return flags;
}

// =============================================================================
// SUGGEST ROLLOUT
// =============================================================================

const ROLLOUT_PROMPT = `You are a senior engineer planning feature rollouts.

Based on the feature description, suggest:
1. Risk Assessment (Low/Medium/High)
2. Recommended rollout strategy
3. Key metrics to monitor
4. Rollback triggers
5. Timeline recommendation

Strategies:
- Canary: 1% → 5% → 25% → 50% → 100%
- Internal: Team only → Beta users → All
- Geographic: Single region → Multi-region → Global
- Gradual: Fixed percentage increase over time`;

async function suggestRollout(featureName: string, description: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🎯 Rollout Strategy${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  log.info(`Analyzing rollout strategy for: ${featureName}`);

  try {
    const strategy = await callGemini(
      `Suggest a rollout strategy for this feature:\n\nFeature: ${featureName}\nDescription: ${description}`,
      ROLLOUT_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(strategy);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// CLEANUP STALE FLAGS
// =============================================================================

async function findStaleFlags(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🧹 Find Stale Flags${colors.reset}\n`);

  const flags = findFeatureFlags();

  if (flags.length === 0) {
    log.info('No feature flags found');
    return;
  }

  // Group by flag name
  const flagUsage: Record<string, { defines: string[]; checks: string[]; lastModified: string }> = {};

  flags.forEach(flag => {
    if (!flagUsage[flag.name]) {
      flagUsage[flag.name] = { defines: [], checks: [], lastModified: '' };
    }
    
    if (flag.usage === 'define') {
      flagUsage[flag.name].defines.push(`${flag.file}:${flag.line}`);
    } else {
      flagUsage[flag.name].checks.push(`${flag.file}:${flag.line}`);
    }
  });

  // Check last modified for each flag's files
  for (const [name, usage] of Object.entries(flagUsage)) {
    const allFiles = [...usage.defines, ...usage.checks].map(loc => loc.split(':')[0]);
    let mostRecent = '';
    
    for (const file of allFiles) {
      try {
        const date = execSync(
          `git log -1 --format="%ai" -- "${file}" 2>/dev/null`,
          { encoding: 'utf8', cwd: PROJECT_ROOT }
        ).trim();
        if (date > mostRecent) mostRecent = date;
      } catch {
        // Ignore
      }
    }
    
    flagUsage[name].lastModified = mostRecent;
  }

  console.log(`${colors.bold}Feature Flags (${Object.keys(flagUsage).length}):${colors.reset}\n`);

  // Sort by last modified
  const sorted = Object.entries(flagUsage).sort((a, b) => 
    a[1].lastModified.localeCompare(b[1].lastModified)
  );

  for (const [name, usage] of sorted) {
    const age = usage.lastModified ? timeSince(new Date(usage.lastModified)) : 'unknown';
    const stale = usage.lastModified && new Date(usage.lastModified) < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    const icon = stale ? `${colors.yellow}⚠${colors.reset}` : `${colors.green}●${colors.reset}`;
    console.log(`  ${icon} ${name}`);
    console.log(`    ${colors.dim}Last modified: ${age}${colors.reset}`);
    console.log(`    ${colors.dim}Used in: ${usage.checks.length} place(s)${colors.reset}`);
    
    if (stale) {
      console.log(`    ${colors.yellow}→ Consider removing (90+ days old)${colors.reset}`);
    }
    console.log();
  }
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }
  return 'recently';
}

// =============================================================================
// ANALYZE IMPACT
// =============================================================================

async function analyzeImpact(flagName: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📊 Flag Impact Analysis${colors.reset}\n`);

  const flags = findFeatureFlags().filter(f => f.name === flagName);

  if (flags.length === 0) {
    log.error(`Flag not found: ${flagName}`);
    return;
  }

  console.log(`${colors.bold}Flag: ${flagName}${colors.reset}\n`);
  console.log(`${colors.bold}Usage:${colors.reset}`);
  
  flags.forEach(flag => {
    console.log(`  ${flag.file}:${flag.line} (${flag.usage})`);
  });

  // Find code that depends on this flag
  const affectedFiles = [...new Set(flags.map(f => f.file))];
  
  console.log(`\n${colors.bold}Affected Files:${colors.reset}`);
  affectedFiles.forEach(file => {
    console.log(`  ${colors.cyan}${file}${colors.reset}`);
  });

  // Get git history
  console.log(`\n${colors.bold}Recent Changes:${colors.reset}`);
  for (const file of affectedFiles.slice(0, 3)) {
    try {
      const history = execSync(
        `git log -3 --oneline -- "${file}" 2>/dev/null`,
        { encoding: 'utf8', cwd: PROJECT_ROOT }
      ).trim();
      if (history) {
        console.log(`\n  ${colors.dim}${file}:${colors.reset}`);
        history.split('\n').forEach(line => console.log(`    ${line}`));
      }
    } catch {
      // Ignore
    }
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleFlags(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'suggest':
      const name = args[1];
      const desc = args.slice(2).join(' ');
      if (!name || !desc) {
        log.error('Usage: ferni flags suggest <name> <description>');
        return;
      }
      await suggestRollout(name, desc);
      break;
    
    case 'cleanup':
    case 'stale':
      await findStaleFlags();
      break;
    
    case 'impact':
      const flagName = args[1];
      if (!flagName) {
        log.error('Usage: ferni flags impact <flag-name>');
        return;
      }
      await analyzeImpact(flagName);
      break;
    
    case 'list':
    default:
      const flags = findFeatureFlags();
      console.log(`\n${colors.bold}${colors.cyan}🚩 Feature Flags${colors.reset}\n`);
      
      if (flags.length === 0) {
        log.info('No feature flags found');
        return;
      }
      
      const unique = [...new Set(flags.map(f => f.name))];
      console.log(`${colors.bold}Found ${unique.length} unique flags:${colors.reset}\n`);
      unique.forEach(name => {
        const count = flags.filter(f => f.name === name).length;
        console.log(`  ${colors.cyan}${name}${colors.reset} (${count} reference${count > 1 ? 's' : ''})`);
      });
      break;
  }
}

