#!/usr/bin/env npx tsx
/**
 * Better Than Human (BTH) Integration Validation
 *
 * This script validates that all "Better Than Human" modules are properly
 * integrated into the persona prompt loading system.
 *
 * Run: npx tsx scripts/validate-bth-integration.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const BUNDLES_DIR = join(process.cwd(), 'src/personas/bundles');
const SHARED_DIR = join(BUNDLES_DIR, 'shared');

const PERSONAS = ['ferni', 'maya-santos', 'alex-chen', 'peter-john', 'jordan-taylor', 'nayan-patel'];

const BTH_FILES = [
  'mission-and-principles.md',
  'superhuman-capabilities.md',
  'proactive-responsibilities.md',
];

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: ValidationResult[] = [];

function log(color: string, prefix: string, message: string) {
  console.log(`${color}${prefix}${RESET} ${message}`);
}

function pass(name: string, message: string) {
  results.push({ name, passed: true, message });
  log(GREEN, '✓', `${name}: ${message}`);
}

function fail(name: string, message: string) {
  results.push({ name, passed: false, message });
  log(RED, '✗', `${name}: ${message}`);
}

function warn(message: string) {
  log(YELLOW, '⚠', message);
}

function header(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}\n`);
}

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

async function validateBTHFilesExist() {
  header('1. BTH Shared Files Exist');

  for (const file of BTH_FILES) {
    const path = join(SHARED_DIR, file);
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n').length;
      pass(`shared/${file}`, `Exists (${lines} lines)`);
    } else {
      fail(`shared/${file}`, 'File not found');
    }
  }
}

async function validateAssemblyConfigs() {
  header('2. Persona Assembly Configs Include BTH');

  for (const persona of PERSONAS) {
    const configPath = join(BUNDLES_DIR, persona, 'content/prompts/_assembly.json');

    if (!existsSync(configPath)) {
      fail(persona, `_assembly.json not found at ${configPath}`);
      continue;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Check if better_than_human is in prompt_modules
      if (config.prompt_modules?.better_than_human) {
        pass(`${persona}/prompt_modules`, 'Has better_than_human module');
      } else {
        fail(`${persona}/prompt_modules`, 'Missing better_than_human module');
      }

      // Check if better_than_human is in voice_agent_modules
      if (config.voice_agent_modules?.includes('better_than_human')) {
        pass(`${persona}/voice_agent_modules`, 'Includes better_than_human');
      } else {
        fail(`${persona}/voice_agent_modules`, 'Missing better_than_human');
      }

      // Check if better_than_human is in full_context_modules
      if (config.full_context_modules?.includes('better_than_human')) {
        pass(`${persona}/full_context_modules`, 'Includes better_than_human');
      } else {
        fail(`${persona}/full_context_modules`, 'Missing better_than_human');
      }
    } catch (e) {
      fail(persona, `Failed to parse _assembly.json: ${e}`);
    }
  }
}

async function validatePromptLoaderIntegration() {
  header('3. Prompt Loader Integration');

  const loaderPath = join(process.cwd(), 'src/agents/personas/prompt-loader.ts');

  if (!existsSync(loaderPath)) {
    fail('prompt-loader.ts', 'File not found');
    return;
  }

  const content = readFileSync(loaderPath, 'utf-8');

  // Check for loadBetterThanHumanModules function
  if (content.includes('async function loadBetterThanHumanModules')) {
    pass('loadBetterThanHumanModules', 'Function exists');
  } else {
    fail('loadBetterThanHumanModules', 'Function not found');
  }

  // Check for BTH handling in module assembly
  if (content.includes("moduleKey === 'better_than_human'")) {
    pass('module assembly', 'BTH special handling exists');
  } else {
    fail('module assembly', 'BTH special handling not found');
  }

  // Check for loadBetterThanHuman export
  if (content.includes('export async function loadBetterThanHuman')) {
    pass('loadBetterThanHuman export', 'Export exists for testing');
  } else {
    fail('loadBetterThanHuman export', 'Export not found');
  }

  // Check that all 3 BTH files are loaded
  for (const file of BTH_FILES) {
    if (content.includes(`loadSharedFile('${file}')`)) {
      pass(`loads ${file}`, 'File is loaded in loadBetterThanHumanModules');
    } else {
      fail(`loads ${file}`, 'File not loaded');
    }
  }
}

async function validateBTHContent() {
  header('4. BTH Content Quality');

  const requirements: Record<string, string[]> = {
    'mission-and-principles.md': [
      'better than human',
      'Five Principles',
      'Human Connection',
      'Relationship Over Transaction',
    ],
    'superhuman-capabilities.md': [
      'Perfect Memory',
      'Constant Presence',
      'Zero Judgment',
      'Six Perspectives',
      '10 Superhuman Insight Types',
      'Cross-Domain Correlation',
      'Voice-Content Mismatch',
      'Anticipatory Awareness',
    ],
    'proactive-responsibilities.md': [
      'ANTICIPATING',
      'Memory Proactivity',
      'Pattern Proactivity',
      'Celebration Proactivity',
      'NOTICE → WAIT → BRIDGE → OFFER → INVITE',
    ],
  };

  for (const [file, keywords] of Object.entries(requirements)) {
    const path = join(SHARED_DIR, file);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, 'utf-8');
    const contentLower = content.toLowerCase();
    let allFound = true;
    const missing: string[] = [];

    for (const keyword of keywords) {
      if (!contentLower.includes(keyword.toLowerCase())) {
        allFound = false;
        missing.push(keyword);
      }
    }

    if (allFound) {
      pass(file, `Contains all ${keywords.length} required concepts`);
    } else {
      fail(file, `Missing: ${missing.join(', ')}`);
    }
  }
}

async function runRuntimeValidation() {
  header('5. Runtime Validation (Loading Test)');

  try {
    // Dynamic import to test the actual loading
    const { loadBetterThanHuman, loadSystemPrompt } = await import(
      '../src/agents/personas/prompt-loader.js'
    );

    // Test BTH loading directly
    const bthContent = await loadBetterThanHuman();
    if (bthContent) {
      const words = bthContent.split(/\s+/).length;
      pass('loadBetterThanHuman()', `Loaded ${words} words of BTH content`);

      // Check key content is present
      if (bthContent.includes('Better Than Human') && bthContent.includes('10 Superhuman')) {
        pass('BTH content check', 'Contains expected superhuman capabilities');
      } else {
        fail('BTH content check', 'Missing expected content');
      }
    } else {
      fail('loadBetterThanHuman()', 'Returned null');
    }

    // Test full prompt loading for Ferni
    const ferniPrompt = await loadSystemPrompt('ferni', 'voice_agent');
    if (ferniPrompt) {
      const tokens = Math.round(ferniPrompt.length / 4);
      pass('loadSystemPrompt(ferni)', `Loaded ~${tokens} tokens`);

      // Check if BTH content is included in the full prompt
      if (ferniPrompt.includes('Better Than Human') || ferniPrompt.includes('superhuman')) {
        pass('Ferni prompt includes BTH', 'BTH modules integrated into full prompt');
      } else {
        warn('Ferni prompt may not include BTH content (check assembly config)');
      }
    } else {
      fail('loadSystemPrompt(ferni)', 'Failed to load');
    }
  } catch (e) {
    fail('Runtime validation', `Error: ${e}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`\n${CYAN}╔══════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}║    Better Than Human (BTH) Integration Validation                ║${RESET}`);
  console.log(`${CYAN}╚══════════════════════════════════════════════════════════════════╝${RESET}`);

  await validateBTHFilesExist();
  await validateAssemblyConfigs();
  await validatePromptLoaderIntegration();
  await validateBTHContent();
  await runRuntimeValidation();

  // Summary
  header('Summary');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total checks: ${passed + failed}`);
  console.log(`${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) {
    console.log(`${RED}Failed: ${failed}${RESET}`);
    console.log(`\n${RED}Failed checks:${RESET}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${RED}✗${RESET} ${r.name}: ${r.message}`);
    }
    process.exit(1);
  } else {
    console.log(`\n${GREEN}🎉 All BTH integration checks passed!${RESET}`);
    console.log(`${GREEN}Ferni is now truly "Better Than Human" 🦸${RESET}\n`);
  }
}

main().catch((e) => {
  console.error(`${RED}Validation failed:${RESET}`, e);
  process.exit(1);
});
