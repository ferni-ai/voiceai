#!/usr/bin/env npx tsx
/**
 * Smart Refactoring
 * 
 * AI-powered code refactoring suggestions and assistance.
 * 
 * @module @ferni/cli/refactor
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, basename } from 'path';
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
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// SUGGEST REFACTORING
// =============================================================================

const SUGGEST_PROMPT = `You are a senior TypeScript engineer reviewing code for refactoring opportunities.

Look for:
1. **Code Smells**: Long functions, deep nesting, duplicate code
2. **SOLID Violations**: Single responsibility, dependency inversion
3. **TypeScript Issues**: Any types, missing generics, weak typing
4. **Performance**: Unnecessary re-renders, missing memoization
5. **Modern Patterns**: Opportunities to use newer TS/JS features

For each issue:
- Describe the problem
- Explain why it matters
- Show the fix with code

Priority order: High impact, easy fixes first.
Be specific with line numbers and code examples.`;

async function suggestRefactoring(filePath?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔍 Refactoring Suggestions${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  let files: string[] = [];
  
  if (filePath) {
    const fullPath = filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
    if (!existsSync(fullPath)) {
      log.error(`File not found: ${filePath}`);
      return;
    }
    files = [fullPath];
  } else {
    // Analyze recently modified files
    log.info('Finding recently modified files...');
    const result = execSync(
      'git diff --name-only HEAD~10 -- "*.ts" "*.tsx" | head -10',
      { encoding: 'utf8', cwd: PROJECT_ROOT }
    ).trim();
    
    files = result.split('\n')
      .filter(f => f && existsSync(join(PROJECT_ROOT, f)))
      .map(f => join(PROJECT_ROOT, f));
  }

  if (files.length === 0) {
    log.warn('No files to analyze');
    return;
  }

  log.info(`Analyzing ${files.length} file(s)...`);

  for (const file of files.slice(0, 5)) {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(PROJECT_ROOT + '/', '');
    
    // Skip very small or very large files
    const lines = content.split('\n').length;
    if (lines < 20 || lines > 1000) continue;

    console.log(`\n${colors.bold}File: ${relPath}${colors.reset}\n`);

    try {
      const suggestions = await callGemini(
        `Analyze this TypeScript file for refactoring opportunities:\n\nFile: ${relPath}\n\n\`\`\`typescript\n${content}\n\`\`\``,
        SUGGEST_PROMPT
      );

      console.log(suggestions);
      console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    } catch (error) {
      log.error(`Failed to analyze ${relPath}: ${error}`);
    }
  }
}

// =============================================================================
// EXTRACT FUNCTION
// =============================================================================

const EXTRACT_PROMPT = `You are a senior TypeScript engineer helping extract code into a function.

Given the code selection:
1. Create a well-named function
2. Identify all required parameters
3. Determine return type
4. Add JSDoc documentation
5. Show the refactored code

Function naming:
- Use camelCase
- Be descriptive but concise
- Start with a verb (get, create, handle, process, etc.)

Output format:
1. The new function definition
2. How to call it from the original location
3. Any types that need to be created`;

async function extractFunction(filePath: string, startLine: number, endLine: number): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}✂️ Extract Function${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  const fullPath = filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
  if (!existsSync(fullPath)) {
    log.error(`File not found: ${filePath}`);
    return;
  }

  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const selection = lines.slice(startLine - 1, endLine).join('\n');

  log.info(`Extracting lines ${startLine}-${endLine} from ${basename(filePath)}`);

  try {
    const result = await callGemini(
      `Extract this code into a well-named function:\n\nFile context: ${filePath}\n\nCode to extract:\n\`\`\`typescript\n${selection}\n\`\`\`\n\nSurrounding code:\n\`\`\`typescript\n${lines.slice(Math.max(0, startLine - 10), endLine + 5).join('\n')}\n\`\`\``,
      EXTRACT_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(result);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Copy to clipboard
    try {
      execSync(`echo "${result.replace(/"/g, '\\"').replace(/`/g, '\\`')}" | pbcopy`);
      log.success('Copied to clipboard!');
    } catch {
      // Clipboard failed
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// MODERNIZE
// =============================================================================

const MODERNIZE_PROMPT = `You are a senior TypeScript engineer modernizing legacy code.

Update the code to use:
1. **Modern TypeScript**: const assertions, satisfies, template literals
2. **ES2022+**: Optional chaining, nullish coalescing, Array.at()
3. **Modern React** (if applicable): Hooks, function components, suspense
4. **Better Patterns**: Discriminated unions, const enums, type guards

For each change:
- Show before and after
- Explain the benefit
- Note any breaking changes

Prioritize changes that improve:
1. Type safety
2. Readability
3. Performance
4. Maintainability`;

async function modernizeCode(filePath: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔄 Modernize Code${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  const fullPath = filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
  if (!existsSync(fullPath)) {
    log.error(`File not found: ${filePath}`);
    return;
  }

  const content = readFileSync(fullPath, 'utf8');
  log.info(`Analyzing ${basename(filePath)} for modernization...`);

  try {
    const result = await callGemini(
      `Modernize this TypeScript code:\n\nFile: ${filePath}\n\n\`\`\`typescript\n${content}\n\`\`\``,
      MODERNIZE_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(result);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleRefactor(args: string[]): Promise<void> {
  const subcommand = args[0] || 'suggest';

  switch (subcommand) {
    case 'suggest':
      await suggestRefactoring(args[1]);
      break;
    
    case 'extract':
      const file = args[1];
      const start = parseInt(args[2], 10);
      const end = parseInt(args[3], 10);
      
      if (!file || isNaN(start) || isNaN(end)) {
        log.error('Usage: ferni refactor extract <file> <start-line> <end-line>');
        return;
      }
      await extractFunction(file, start, end);
      break;
    
    case 'modernize':
      if (!args[1]) {
        log.error('Usage: ferni refactor modernize <file>');
        return;
      }
      await modernizeCode(args[1]);
      break;
    
    default:
      console.log(`${colors.bold}Refactoring Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}suggest${colors.reset}     Find refactoring opportunities`);
      console.log(`  ${colors.cyan}extract${colors.reset}     Extract code into a function`);
      console.log(`  ${colors.cyan}modernize${colors.reset}   Update to modern TypeScript patterns`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni refactor suggest`);
      console.log(`  ferni refactor suggest src/services/auth.ts`);
      console.log(`  ferni refactor extract src/app.ts 50 75`);
      console.log(`  ferni refactor modernize src/utils/helpers.ts`);
  }
}

