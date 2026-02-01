#!/usr/bin/env npx tsx
/**
 * Prompt Structure Validation
 *
 * Validates that system prompts follow Google's Gemini best practices:
 * - Persona → Rules → Guardrails structure
 * - No duplicate tool guidance across files
 * - Tool schemas have invocation conditions
 * - Total prompt tokens within budget
 *
 * Run: npx tsx scripts/validate-prompt-structure.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

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

const ROOT = process.cwd();
const BUNDLES_DIR = join(ROOT, 'src/personas/bundles');
const SCHEMAS_DIR = join(ROOT, 'src/tools/schemas');

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

function validatePromptStructure() {
  header('1. Tool Usage Guidance Structure (Google Format)');

  const guidancePath = join(BUNDLES_DIR, 'ferni/identity/tool-usage-guidance.md');
  if (!existsSync(guidancePath)) {
    fail('tool-usage-guidance.md', 'File not found');
    return;
  }

  const content = readFileSync(guidancePath, 'utf-8');
  const lines = content.split('\n').length;

  // Check size reduction
  if (lines <= 100) {
    pass('File size', `${lines} lines (target: ~80 lines)`);
  } else {
    fail('File size', `${lines} lines - should be ~80 lines max`);
  }

  // Check for Google's recommended structure
  const hasRoleSection = content.includes('## Your Role') || content.includes('## Role');
  const hasRulesSection = content.includes('## Conversational Rules') || content.includes('## Rules');
  const hasGuardrailsSection = content.includes('## Guardrails');

  if (hasRoleSection && hasRulesSection && hasGuardrailsSection) {
    pass('Structure order', 'Has Persona → Rules → Guardrails sections');
  } else {
    const missing: string[] = [];
    if (!hasRoleSection) missing.push('Role');
    if (!hasRulesSection) missing.push('Rules');
    if (!hasGuardrailsSection) missing.push('Guardrails');
    fail('Structure order', `Missing sections: ${missing.join(', ')}`);
  }

  // Check for "unmistakably" keyword (Google recommendation)
  if (content.toLowerCase().includes('unmistakably')) {
    pass('Precision keyword', 'Uses "unmistakably" for precision');
  } else {
    warn('Consider adding "unmistakably" for precision (Google recommendation)');
  }

  // Check no tables (Google recommends sequential instructions)
  const tableCount = (content.match(/\|.*\|.*\|/g) || []).length;
  if (tableCount === 0) {
    pass('No tables', 'Uses clear sequential instructions (Google format)');
  } else {
    fail('Tables found', `${tableCount} tables - use sequential instructions instead`);
  }
}

function validateFunctionCallingBase() {
  header('2. Function Calling Base (Shared)');

  const basePath = join(BUNDLES_DIR, 'shared/function-calling-base.md');
  if (!existsSync(basePath)) {
    fail('function-calling-base.md', 'File not found');
    return;
  }

  const content = readFileSync(basePath, 'utf-8');
  const lines = content.split('\n').length;

  // Check size reduction
  if (lines <= 80) {
    pass('File size', `${lines} lines (target: ~50 lines)`);
  } else {
    fail('File size', `${lines} lines - should be ~50 lines max`);
  }

  // Check it focuses on format, not tool-specific guidance
  const toolTables = (content.match(/\| Request \| Output \|/g) || []).length;
  if (toolTables <= 1) {
    pass('Format focus', 'Focuses on format instructions, not tool examples');
  } else {
    fail('Too many tool tables', `${toolTables} tool example tables - move to schemas`);
  }
}

function validateFunctionCallingSpecialty() {
  header('3. Function Calling Specialty (Ferni)');

  const specialtyPath = join(BUNDLES_DIR, 'ferni/identity/function-calling-specialty.md');
  if (!existsSync(specialtyPath)) {
    fail('function-calling-specialty.md', 'File not found');
    return;
  }

  const content = readFileSync(specialtyPath, 'utf-8');
  const lines = content.split('\n').length;

  // Check size reduction
  if (lines <= 80) {
    pass('File size', `${lines} lines (target: ~60 lines)`);
  } else {
    fail('File size', `${lines} lines - should be ~60 lines max`);
  }
}

function validateToolSchemas() {
  header('4. Tool Schema Invocation Conditions');

  const schemaFiles = [
    'core/music.schema.json',
    'handoff/handoffs.schema.json',
    'core/outreach.schema.json',
  ];

  for (const schemaFile of schemaFiles) {
    const schemaPath = join(SCHEMAS_DIR, schemaFile);
    if (!existsSync(schemaPath)) {
      fail(schemaFile, 'File not found');
      continue;
    }

    const content = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(content);

    let hasInvocationConditions = 0;
    let missingInvocation: string[] = [];

    for (const tool of schema.tools || []) {
      const desc = tool.description || '';
      if (desc.includes('Invocation Condition:') || desc.includes('**Invocation Condition:**')) {
        hasInvocationConditions++;
      } else {
        missingInvocation.push(tool.name);
      }
    }

    const totalTools = (schema.tools || []).length;
    if (hasInvocationConditions === totalTools) {
      pass(schemaFile, `All ${totalTools} tools have invocation conditions`);
    } else {
      fail(schemaFile, `${hasInvocationConditions}/${totalTools} tools have conditions. Missing: ${missingInvocation.join(', ')}`);
    }
  }
}

function validateToolLimit() {
  header('5. Tool Limit Configuration');

  const updaterPath = join(ROOT, 'src/agents/shared/tool-updater.ts');
  if (!existsSync(updaterPath)) {
    fail('tool-updater.ts', 'File not found');
    return;
  }

  const content = readFileSync(updaterPath, 'utf-8');
  const match = content.match(/GEMINI_TOOL_LIMIT\s*=\s*(\d+)/);

  if (match) {
    const limit = parseInt(match[1], 10);
    if (limit <= 20) {
      pass('GEMINI_TOOL_LIMIT', `Set to ${limit} (Google recommends 10-20)`);
    } else {
      fail('GEMINI_TOOL_LIMIT', `Set to ${limit} - should be 10-20 (Google recommendation)`);
    }
  } else {
    fail('GEMINI_TOOL_LIMIT', 'Could not find GEMINI_TOOL_LIMIT constant');
  }
}

function validateTokenBudget() {
  header('6. Token Budget Analysis');

  const files = [
    { path: join(BUNDLES_DIR, 'ferni/identity/tool-usage-guidance.md'), name: 'tool-usage-guidance.md' },
    { path: join(BUNDLES_DIR, 'ferni/identity/function-calling-specialty.md'), name: 'function-calling-specialty.md' },
    { path: join(BUNDLES_DIR, 'shared/function-calling-base.md'), name: 'function-calling-base.md' },
  ];

  let totalChars = 0;
  for (const file of files) {
    if (existsSync(file.path)) {
      const content = readFileSync(file.path, 'utf-8');
      totalChars += content.length;
      const tokens = Math.round(content.length / 4);
      log(CYAN, '  ', `${file.name}: ~${tokens} tokens`);
    }
  }

  const totalTokens = Math.round(totalChars / 4);
  if (totalTokens <= 1000) {
    pass('Total tool instruction tokens', `~${totalTokens} tokens (excellent)`);
  } else if (totalTokens <= 2000) {
    pass('Total tool instruction tokens', `~${totalTokens} tokens (good)`);
  } else {
    fail('Total tool instruction tokens', `~${totalTokens} tokens - consider further reduction`);
  }
}

function validateNoDuplicates() {
  header('7. No Duplicate Tool Guidance');

  const files = [
    join(BUNDLES_DIR, 'ferni/identity/tool-usage-guidance.md'),
    join(BUNDLES_DIR, 'ferni/identity/function-calling-specialty.md'),
    join(BUNDLES_DIR, 'shared/function-calling-base.md'),
  ];

  // Check for duplicate patterns
  const patterns = [
    { pattern: /\| Request \| Output \|/g, name: 'tool example tables' },
    { pattern: /playMusic.*query.*jazz/gi, name: 'playMusic jazz example' },
    { pattern: /handoffToMaya.*reason/gi, name: 'handoffToMaya example' },
  ];

  let duplicates = 0;
  for (const { pattern, name } of patterns) {
    let count = 0;
    for (const file of files) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');
        const matches = content.match(pattern) || [];
        count += matches.length;
      }
    }
    if (count > 2) {
      warn(`"${name}" appears ${count} times across files - possible duplication`);
      duplicates++;
    }
  }

  if (duplicates === 0) {
    pass('No major duplicates', 'Tool guidance is not duplicated across files');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`\n${CYAN}╔══════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}║    Gemini Prompt Structure Validation                            ║${RESET}`);
  console.log(`${CYAN}║    Based on Google's Function Calling Best Practices (Jan 2026)  ║${RESET}`);
  console.log(`${CYAN}╚══════════════════════════════════════════════════════════════════╝${RESET}`);

  validatePromptStructure();
  validateFunctionCallingBase();
  validateFunctionCallingSpecialty();
  validateToolSchemas();
  validateToolLimit();
  validateTokenBudget();
  validateNoDuplicates();

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
    console.log(`\n${GREEN}All prompt structure checks passed!${RESET}`);
    console.log(`${GREEN}Prompts follow Google's Gemini best practices.${RESET}\n`);
  }
}

main().catch((e) => {
  console.error(`${RED}Validation failed:${RESET}`, e);
  process.exit(1);
});
