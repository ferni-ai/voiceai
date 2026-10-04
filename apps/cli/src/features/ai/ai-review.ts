#!/usr/bin/env npx tsx
/**
 * AI-Powered Code Review
 * 
 * Uses Gemini to review code changes before committing.
 * 
 * @module @ferni/cli/ai-review
 */

import { findProjectRoot } from '../../utils/project-root.js';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CLI_GEMINI_MODEL } from './gemini-model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = findProjectRoot();

// =============================================================================
// COLORS
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
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
    `https://generativelanguage.googleapis.com/v1beta/models/${CLI_GEMINI_MODEL}:generateContent?key=${apiKey}`,
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
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// REVIEW PROMPTS
// =============================================================================

const REVIEW_SYSTEM_PROMPT = `You are Ferni, a senior engineer reviewing code for the Ferni AI platform.

Review for:
1. **Bugs**: Logic errors, null checks, race conditions
2. **Security**: XSS, injection, auth issues, secret exposure
3. **Performance**: N+1 queries, memory leaks, unnecessary renders
4. **Best Practices**: DRY, SOLID, proper error handling
5. **Design System**: Hardcoded colors/durations, missing CSS variables
6. **Brand Voice**: Forbidden words (chatbot, user, utilize, leverage)

Output format:
## Summary
Overall assessment (1-2 sentences)

## Issues Found
### 🔴 Critical (must fix)
- Issue description (file:line)

### 🟡 Warnings (should fix)
- Issue description (file:line)

### 🟢 Suggestions (nice to have)
- Suggestion (file:line)

## What's Good
- Positive observations

If no issues: "✅ Code looks good! No issues found."`;

const SECURITY_SYSTEM_PROMPT = `You are a security-focused code reviewer for Ferni AI.

Check for:
1. **Authentication/Authorization**: Missing auth, privilege escalation
2. **Input Validation**: SQL injection, XSS, command injection
3. **Data Exposure**: Sensitive data in logs, responses, errors
4. **Secrets**: Hardcoded API keys, passwords, tokens
5. **CSRF/CORS**: Missing protections
6. **Dependencies**: Known vulnerable patterns

Output format:
## Security Assessment

### 🔴 Critical Vulnerabilities
- Description, impact, fix suggestion

### 🟡 Security Warnings
- Description, risk level

### 🟢 Security Recommendations
- Best practice suggestions

### ✅ Security Positives
- Good patterns observed`;

const PERF_SYSTEM_PROMPT = `You are a performance-focused code reviewer for Ferni AI.

Check for:
1. **Rendering**: Unnecessary re-renders, missing memoization
2. **Data Fetching**: N+1 queries, missing caching, waterfalls
3. **Memory**: Leaks, large objects, missing cleanup
4. **Bundle Size**: Large imports, missing code splitting
5. **Async**: Race conditions, missing error handling
6. **Animations**: Layout thrashing, expensive operations

Output format:
## Performance Assessment

### 🔴 Critical Issues
- Issue, impact, suggested fix

### 🟡 Performance Warnings
- Issue, potential impact

### 🟢 Optimization Opportunities
- Suggestion, expected benefit

### ✅ Performance Positives
- Good patterns observed`;

// =============================================================================
// REVIEW FUNCTIONS
// =============================================================================

/** What to review: a branch's changes since it left `ref`, or local changes. */
type DiffSource = { kind: 'base'; ref: string } | { kind: 'staged' } | { kind: 'unstaged' };

/**
 * The ref to review against: `--base <ref>`, else the pull request's base
 * branch in GitHub Actions (GITHUB_BASE_REF, as origin/<branch>). Undefined
 * means review local changes. A CI checkout has no local changes, so without
 * this the PR review always said "No changes to review".
 */
export function baseRef(args: string[], env: NodeJS.ProcessEnv = process.env): string | undefined {
  const i = args.indexOf('--base');
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : undefined;
}

/** git diff arguments for a source. Three dots: only what the branch added, not what base gained since. */
export function diffArgs(source: DiffSource): string[] {
  if (source.kind === 'base') return [`${source.ref}...HEAD`];
  return source.kind === 'staged' ? ['--cached'] : [];
}

/** Runs git without a shell, so a branch name is never interpreted. */
function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function refExists(ref: string): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function getDiff(source: DiffSource): string {
  const diff = git(['diff', ...diffArgs(source)]);

  if (!diff.trim()) {
    return '';
  }
  
  // Truncate if too long
  const maxLength = 15000;
  return diff.length > maxLength 
    ? diff.substring(0, maxLength) + '\n\n... (truncated, review first 15k chars)'
    : diff;
}

async function reviewCode(type: 'general' | 'security' | 'perf' = 'general', base?: string): Promise<void> {
  const titles = {
    general: '🤖 AI Code Review',
    security: '🔒 Security Review',
    perf: '⚡ Performance Review',
  };

  const prompts = {
    general: REVIEW_SYSTEM_PROMPT,
    security: SECURITY_SYSTEM_PROMPT,
    perf: PERF_SYSTEM_PROMPT,
  };

  console.log(`\n${colors.bold}${colors.cyan}${titles[type]}${colors.reset}\n`);

  if (base && !refExists(base)) {
    log.error(`Can't find ${base} to diff against (in CI, check out with fetch-depth: 0).`);
    return;
  }

  let source: DiffSource = base ? { kind: 'base', ref: base } : { kind: 'staged' };
  let finalDiff = getDiff(source);

  if (!finalDiff && source.kind === 'staged') {
    source = { kind: 'unstaged' };
    finalDiff = getDiff(source);
    if (finalDiff) log.info('No staged changes. Reviewing unstaged changes...');
  }

  if (!finalDiff) {
    log.warn(base ? `No changes against ${base}.` : 'No changes to review. Make some changes first.');
    return;
  }

  const files = git(['diff', '--name-only', ...diffArgs(source)]);
  const against = source.kind === 'base' ? ` against ${source.ref}` : '';

  log.info(`Reviewing ${files.trim().split('\n').length} file(s)${against}...`);

  try {
    const review = await callGemini(
      `Review this code diff:\n\n${finalDiff}`,
      prompts[type]
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(formatReview(review));
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Count issues
    const criticalCount = (review.match(/🔴/g) || []).length;
    const warningCount = (review.match(/🟡/g) || []).length;
    
    if (criticalCount > 0) {
      log.error(`Found ${criticalCount} critical issue(s) - please fix before committing`);
    } else if (warningCount > 0) {
      log.warn(`Found ${warningCount} warning(s) - consider fixing`);
    } else {
      log.success('Code looks good!');
    }
  } catch (error) {
    log.error(`Review failed: ${error}`);
  }
}

function formatReview(review: string): string {
  return review
    .replace(/🔴/g, `${colors.red}🔴${colors.reset}`)
    .replace(/🟡/g, `${colors.yellow}🟡${colors.reset}`)
    .replace(/🟢/g, `${colors.green}🟢${colors.reset}`)
    .replace(/✅/g, `${colors.green}✅${colors.reset}`)
    .replace(/## /g, `\n${colors.bold}`)
    .replace(/\n### /g, `${colors.reset}\n${colors.cyan}### `);
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleAIReview(args: string[]): Promise<void> {
  const subcommand = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
  const base = baseRef(args);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  switch (subcommand) {
    case 'all':
    case 'general':
      await reviewCode('general', base);
      break;

    case 'security':
    case 'sec':
      await reviewCode('security', base);
      break;

    case 'perf':
    case 'performance':
      await reviewCode('perf', base);
      break;

    case 'full':
      await reviewCode('general', base);
      console.log('\n');
      await reviewCode('security', base);
      console.log('\n');
      await reviewCode('perf', base);
      break;
    
    default:
      console.log(`${colors.bold}AI Code Review:${colors.reset}\n`);
      console.log(`  ${colors.cyan}all${colors.reset}       General code review`);
      console.log(`  ${colors.cyan}security${colors.reset}  Security-focused review`);
      console.log(`  ${colors.cyan}perf${colors.reset}      Performance-focused review`);
      console.log(`  ${colors.cyan}full${colors.reset}      Run all three reviews`);
      console.log(`\n  ${colors.cyan}--base <ref>${colors.reset}  Review the branch's changes since <ref> (default in CI: the PR's base)`);
  }
}

