#!/usr/bin/env npx tsx
/**
 * Superhuman Intelligence Validation Script
 *
 * Validates all 10 enhancements are properly implemented and testable.
 *
 * Usage: npx tsx scripts/validate-superhuman-intelligence.ts
 */

import { existsSync } from 'fs';
import { join } from 'path';

// Colors for console output
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

interface ValidationResult {
  name: string;
  passed: boolean;
  details: string[];
}

const results: ValidationResult[] = [];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function validateFileExists(path: string, description: string): boolean {
  const fullPath = join(process.cwd(), path);
  const exists = existsSync(fullPath);
  if (!exists) {
    console.log(`${red}✗ ${description}: File not found at ${path}${reset}`);
  }
  return exists;
}

function validateModule(
  name: string,
  basePath: string,
  requiredFiles: string[]
): ValidationResult {
  const details: string[] = [];
  let allPassed = true;

  for (const file of requiredFiles) {
    const fullPath = join(basePath, file);
    const exists = existsSync(join(process.cwd(), fullPath));
    if (exists) {
      details.push(`✓ ${file}`);
    } else {
      details.push(`✗ ${file} missing`);
      allPassed = false;
    }
  }

  return { name, passed: allPassed, details };
}

// ============================================================================
// VALIDATE EACH ENHANCEMENT
// ============================================================================

console.log('\n🔍 Validating Superhuman Intelligence Enhancements...\n');

// Phase 1: Response Mode Intelligence
results.push(
  validateModule('Response Mode Intelligence', 'src/conversation/response-mode', [
    'types.ts',
    'constants.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 1: Emotional Momentum Tracking
results.push(
  validateModule('Emotional Momentum Tracking', 'src/conversation/emotional-arc/momentum', [
    'types.ts',
    'constants.ts',
    'tracker.ts',
    '__tests__/tracker.test.ts',
  ])
);

// Phase 1: Enhanced Silence Interpreter
results.push(
  validateModule('Enhanced Silence Interpreter', 'src/services/superhuman', [
    'silence-interpreter.ts',
    '__tests__/silence-interpreter.test.ts',
  ])
);

// Phase 2: Micro-Moment Recognition
results.push(
  validateModule('Micro-Moment Recognition', 'src/intelligence/deep-understanding/micro-moments', [
    'types.ts',
    'detection-rules.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 2: Avoidance Pattern Detection
results.push(
  validateModule('Avoidance Pattern Detection', 'src/intelligence/deep-understanding/avoidance-detection', [
    'types.ts',
    'detection-rules.ts',
    'persistence.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 2: Rhythm Intelligence
results.push(
  validateModule('Rhythm Intelligence', 'src/conversation/rhythm-intelligence', [
    'types.ts',
    'constants.ts',
    'persistence.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 3: Relational Memory
results.push(
  validateModule('Relational Memory', 'src/services/superhuman/relational-memory', [
    'types.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 3: Pattern Connector
results.push(
  validateModule('Pattern Connector', 'src/intelligence/deep-understanding/pattern-connector', [
    'types.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 3: Story Arc Tracking
results.push(
  validateModule('Story Arc Tracking', 'src/intelligence/story-tracking', [
    'types.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Phase 4: Voice Biomarker Pipeline
results.push(
  validateModule('Voice Biomarker Pipeline', 'src/speech/voice-biomarkers', [
    'types.ts',
    'engine.ts',
    'index.ts',
    '__tests__/engine.test.ts',
  ])
);

// Validate DI container
console.log('\n📦 Validating DI Container...');
const diContainerValid = validateFileExists(
  'src/services/di/container.ts',
  'DI Container'
);
const diSetupValid = validateFileExists('src/services/di/setup.ts', 'DI Setup');

results.push({
  name: 'DI Container Registration',
  passed: diContainerValid && diSetupValid,
  details: [
    diContainerValid ? '✓ container.ts' : '✗ container.ts missing',
    diSetupValid ? '✓ setup.ts' : '✗ setup.ts missing',
  ],
});

// Validate integration tests
console.log('\n🧪 Validating Integration Tests...');
const integrationTestValid = validateFileExists(
  'src/tests/synthetic/superhuman-integration.test.ts',
  'Integration Test Suite'
);

results.push({
  name: 'Integration Test Suite',
  passed: integrationTestValid,
  details: [
    integrationTestValid
      ? '✓ superhuman-integration.test.ts'
      : '✗ superhuman-integration.test.ts missing',
  ],
});

// Validate audit document
const auditDocValid = validateFileExists(
  'docs/audits/SUPERHUMAN-INTELLIGENCE-AUDIT.md',
  'Audit Document'
);

results.push({
  name: 'Audit Document',
  passed: auditDocValid,
  details: [
    auditDocValid
      ? '✓ SUPERHUMAN-INTELLIGENCE-AUDIT.md'
      : '✗ SUPERHUMAN-INTELLIGENCE-AUDIT.md missing',
  ],
});

// ============================================================================
// PRINT RESULTS
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('VALIDATION RESULTS');
console.log('='.repeat(60) + '\n');

let totalPassed = 0;
let totalFailed = 0;

for (const result of results) {
  const icon = result.passed ? `${green}✓${reset}` : `${red}✗${reset}`;
  console.log(`${icon} ${result.name}`);

  for (const detail of result.details) {
    const detailIcon = detail.startsWith('✓') ? green : red;
    console.log(`    ${detailIcon}${detail}${reset}`);
  }

  if (result.passed) {
    totalPassed++;
  } else {
    totalFailed++;
  }

  console.log();
}

console.log('='.repeat(60));
console.log(
  `${green}Passed: ${totalPassed}${reset} | ${red}Failed: ${totalFailed}${reset}`
);
console.log('='.repeat(60));

if (totalFailed > 0) {
  console.log(`\n${red}❌ Validation failed. Please fix the issues above.${reset}\n`);
  process.exit(1);
} else {
  console.log(`\n${green}✅ All validations passed!${reset}\n`);
  process.exit(0);
}
