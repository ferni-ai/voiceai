#!/usr/bin/env npx tsx
/**
 * Dependency Intelligence
 * 
 * AI-powered dependency updates and migration assistance.
 * 
 * @module @ferni/cli/deps-ai
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

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
        generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// AI UPDATE
// =============================================================================

interface OutdatedDep {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: 'dependencies' | 'devDependencies';
}

const UPDATE_ANALYSIS_PROMPT = `You are a senior engineer analyzing npm dependency updates.

For each update, assess:
1. Risk level (🟢 Safe, 🟡 Review, 🔴 Breaking)
2. Breaking changes from the changelog
3. Required code changes
4. Recommendation (update/skip/careful)

Be concise. Focus on actionable information.
If you don't know the changelog, say "Unknown - review manually".`;

async function smartUpdate(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📦 Smart Dependency Update${colors.reset}\n`);

  log.info('Checking for outdated dependencies...');

  // Get outdated deps
  const result = spawnSync('npm', ['outdated', '--json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  let outdated: Record<string, any> = {};
  try {
    outdated = JSON.parse(result.stdout || '{}');
  } catch {
    log.success('All dependencies are up to date!');
    return;
  }

  const deps = Object.entries(outdated).map(([name, info]: [string, any]) => ({
    name,
    current: info.current,
    wanted: info.wanted,
    latest: info.latest,
    type: info.type || 'dependencies',
  }));

  if (deps.length === 0) {
    log.success('All dependencies are up to date!');
    return;
  }

  console.log(`\n${colors.bold}Outdated Dependencies (${deps.length}):${colors.reset}\n`);

  // Categorize by update type
  const major = deps.filter(d => d.current.split('.')[0] !== d.latest.split('.')[0]);
  const minor = deps.filter(d => 
    d.current.split('.')[0] === d.latest.split('.')[0] &&
    d.current.split('.')[1] !== d.latest.split('.')[1]
  );
  const patch = deps.filter(d => 
    d.current.split('.')[0] === d.latest.split('.')[0] &&
    d.current.split('.')[1] === d.latest.split('.')[1]
  );

  if (patch.length > 0) {
    console.log(`${colors.green}Patch updates (safe):${colors.reset}`);
    patch.forEach(d => console.log(`  ${d.name}: ${d.current} → ${d.latest}`));
    console.log();
  }

  if (minor.length > 0) {
    console.log(`${colors.yellow}Minor updates (review):${colors.reset}`);
    minor.forEach(d => console.log(`  ${d.name}: ${d.current} → ${d.latest}`));
    console.log();
  }

  if (major.length > 0) {
    console.log(`${colors.red}Major updates (breaking):${colors.reset}`);
    major.forEach(d => console.log(`  ${d.name}: ${d.current} → ${d.latest}`));
    console.log();
  }

  // AI Analysis for major/minor updates
  const toAnalyze = [...major, ...minor].slice(0, 10); // Limit to 10
  
  if (toAnalyze.length > 0 && process.env.GOOGLE_API_KEY) {
    log.info('AI analyzing changelogs...\n');

    const analysisPrompt = toAnalyze.map(d => 
      `${d.name}: ${d.current} → ${d.latest}`
    ).join('\n');

    try {
      const analysis = await callGemini(
        `Analyze these npm dependency updates:\n\n${analysisPrompt}`,
        UPDATE_ANALYSIS_PROMPT
      );

      console.log(`${colors.bold}AI Analysis:${colors.reset}\n`);
      console.log(analysis);
      console.log();
    } catch (error) {
      log.warn(`AI analysis failed: ${error}`);
    }
  }

  // Offer to update safe ones
  if (patch.length > 0) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Update ${patch.length} patch dependencies? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      log.info('Updating patch dependencies...');
      patch.forEach(d => {
        try {
          execSync(`npm install ${d.name}@${d.latest}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
          log.success(`Updated ${d.name} to ${d.latest}`);
        } catch (error) {
          log.error(`Failed to update ${d.name}`);
        }
      });
    }
  }
}

// =============================================================================
// MIGRATION GUIDE
// =============================================================================

const MIGRATION_PROMPT = `You are a senior engineer creating a migration guide for a major dependency update.

Create a step-by-step migration guide that includes:
1. Pre-migration checklist
2. Code changes required (with examples)
3. Configuration changes
4. Testing checklist
5. Rollback plan

Be specific and actionable. Include code snippets where helpful.`;

async function generateMigrationGuide(depName: string, fromVersion: string, toVersion: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📋 Migration Guide Generator${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  log.info(`Generating migration guide: ${depName} ${fromVersion} → ${toVersion}`);

  try {
    const guide = await callGemini(
      `Generate a migration guide for updating ${depName} from ${fromVersion} to ${toVersion} in a TypeScript project.`,
      MIGRATION_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(guide);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Save to file
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Save to MIGRATION-${depName}.md? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      const filename = `MIGRATION-${depName.replace(/\//g, '-')}.md`;
      writeFileSync(join(PROJECT_ROOT, filename), guide);
      log.success(`Saved to ${filename}`);
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleDepsAI(args: string[]): Promise<void> {
  const subcommand = args[0] || 'update';

  switch (subcommand) {
    case 'update':
    case 'smart':
      await smartUpdate();
      break;
    
    case 'migrate':
      const dep = args[1];
      const from = args[2];
      const to = args[3];
      
      if (!dep || !from || !to) {
        log.error('Usage: ferni deps-ai migrate <package> <from-version> <to-version>');
        console.log(`\n${colors.dim}Example: ferni deps-ai migrate react 17.0.0 18.0.0${colors.reset}`);
        return;
      }
      await generateMigrationGuide(dep, from, to);
      break;
    
    default:
      console.log(`${colors.bold}Dependency Intelligence:${colors.reset}\n`);
      console.log(`  ${colors.cyan}update${colors.reset}    Smart update with AI changelog analysis`);
      console.log(`  ${colors.cyan}migrate${colors.reset}   Generate migration guide for major update`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni deps-ai update`);
      console.log(`  ferni deps-ai migrate react 17.0.0 18.0.0`);
  }
}

