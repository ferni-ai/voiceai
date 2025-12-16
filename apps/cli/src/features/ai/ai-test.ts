#!/usr/bin/env npx tsx
/**
 * AI-Powered Test Generation
 * 
 * Uses Gemini to generate tests for code.
 * 
 * @module @ferni/cli/ai-test
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// =============================================================================
// COLORS
// =============================================================================

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

// =============================================================================
// GEMINI API
// =============================================================================

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
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// TEST GENERATION
// =============================================================================

const TEST_SYSTEM_PROMPT = `You are Ferni, generating tests for the Ferni AI TypeScript codebase.

## Test Framework
- Use Vitest (import { describe, it, expect, vi } from 'vitest')
- Mock with vi.fn(), vi.mock()
- Use beforeEach/afterEach for setup/cleanup

## Test Patterns
1. Happy path - normal successful operation
2. Edge cases - empty, null, boundary values
3. Error cases - invalid input, failures
4. Async - promise resolution/rejection

## File Naming
- Source: path/to/file.ts
- Test: path/to/__tests__/file.test.ts

## Output Format
Output ONLY the test code, no explanation. Include all necessary imports.

## Example Structure
\`\`\`typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { functionToTest } from '../file.js';

describe('functionToTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle normal case', () => {
    expect(functionToTest(input)).toBe(expected);
  });

  it('should handle edge case', () => {
    expect(functionToTest(null)).toBe(expected);
  });

  it('should throw on invalid input', () => {
    expect(() => functionToTest(invalid)).toThrow();
  });
});
\`\`\``;

async function generateTests(filePath: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🧪 AI Test Generator${colors.reset}\n`);

  const fullPath = filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
  
  if (!existsSync(fullPath)) {
    log.error(`File not found: ${filePath}`);
    return;
  }

  const content = readFileSync(fullPath, 'utf8');
  const fileName = basename(fullPath);
  const dirName = dirname(fullPath);
  
  // Determine test file path
  const testDir = join(dirName, '__tests__');
  const testFileName = fileName.replace(/\.ts$/, '.test.ts');
  const testPath = join(testDir, testFileName);

  log.info(`Analyzing ${fileName}...`);

  try {
    const prompt = `Generate comprehensive tests for this TypeScript file:

File: ${filePath}

\`\`\`typescript
${content}
\`\`\`

Generate tests covering:
1. All exported functions/classes
2. Happy paths
3. Edge cases (null, empty, boundaries)
4. Error handling
5. Async behavior if applicable`;

    const tests = await callGemini(prompt, TEST_SYSTEM_PROMPT);
    const cleanTests = tests.replace(/^```typescript\n?|\n?```$/g, '').trim();

    console.log(`\n${colors.bold}Generated tests:${colors.reset}\n`);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(cleanTests.split('\n').slice(0, 50).join('\n'));
    if (cleanTests.split('\n').length > 50) {
      console.log(`${colors.dim}... (${cleanTests.split('\n').length - 50} more lines)${colors.reset}`);
    }
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Offer to save
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Save to ${testPath}? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      // Create __tests__ directory if needed
      execSync(`mkdir -p "${testDir}"`);
      writeFileSync(testPath, cleanTests);
      log.success(`Tests saved to ${testPath}`);
      
      // Offer to run
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const runAnswer = await new Promise<string>(resolve => {
        rl2.question(`${colors.cyan}Run tests now? (y/n): ${colors.reset}`, resolve);
      });
      rl2.close();

      if (runAnswer.toLowerCase() === 'y') {
        execSync(`npx vitest run ${testPath}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
      }
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

async function suggestTests(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔍 Finding untested files...${colors.reset}\n`);

  // Get all source files
  const srcFiles = execSync(
    'find apps/web/src -name "*.ts" -not -path "*/__tests__/*" -not -name "*.test.ts" -not -name "*.d.ts"',
    { encoding: 'utf8', cwd: PROJECT_ROOT }
  ).trim().split('\n').filter(Boolean);

  // Get all test files
  const testFiles = execSync(
    'find apps/web/src -name "*.test.ts"',
    { encoding: 'utf8', cwd: PROJECT_ROOT }
  ).trim().split('\n').filter(Boolean);

  const testedFiles = new Set(
    testFiles.map(t => t.replace('/__tests__/', '/').replace('.test.ts', '.ts'))
  );

  const untestedFiles = srcFiles.filter(f => !testedFiles.has(f));

  console.log(`${colors.bold}Untested files (${untestedFiles.length}):${colors.reset}\n`);
  
  // Show top 20
  untestedFiles.slice(0, 20).forEach(f => {
    console.log(`  ${colors.yellow}•${colors.reset} ${f}`);
  });

  if (untestedFiles.length > 20) {
    console.log(`  ${colors.dim}... and ${untestedFiles.length - 20} more${colors.reset}`);
  }

  console.log(`\n${colors.dim}Generate tests with: ferni test generate <file>${colors.reset}\n`);
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleAITest(args: string[]): Promise<void> {
  const subcommand = args[0] || 'suggest';

  if (!process.env.GOOGLE_API_KEY && subcommand === 'generate') {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  switch (subcommand) {
    case 'generate':
    case 'gen':
      const filePath = args[1];
      if (!filePath) {
        log.error('Provide file path: ferni test generate path/to/file.ts');
        return;
      }
      await generateTests(filePath);
      break;
    
    case 'suggest':
    case 'untested':
      await suggestTests();
      break;
    
    default:
      console.log(`${colors.bold}AI Test Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}generate <file>${colors.reset}  Generate tests for a file`);
      console.log(`  ${colors.cyan}suggest${colors.reset}          List untested files`);
  }
}

