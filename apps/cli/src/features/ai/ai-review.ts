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

  const model = process.env.AI_REVIEW_MODEL || 'gemini-2.0-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      // Header rather than ?key= so the key never lands in a logged URL.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
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

/**
 * What to review. `base` diffs HEAD against a ref (CI sets REVIEW_BASE_REF to the
 * PR's base branch: a fresh checkout has no staged or unstaged changes, so
 * without it every PR review saw an empty diff). Locally: staged, else unstaged.
 */
export type DiffScope = { kind: 'base'; ref: string } | { kind: 'staged' } | { kind: 'unstaged' };

export type ReviewStatus = 'reviewed' | 'no-changes' | 'failed';

let criticalTotal = 0;

export function diffArgs(scope: DiffScope, namesOnly = false): string[] {
  const names = namesOnly ? ['--name-only'] : [];
  if (scope.kind === 'base') {
    if (!scope.ref || scope.ref.startsWith('-')) throw new Error(`Invalid base ref: ${scope.ref}`);
    return ['diff', ...names, `${scope.ref}...HEAD`];
  }
  return ['diff', ...names, ...(scope.kind === 'staged' ? ['--cached'] : [])];
}

const MAX_DIFF_LENGTH = 15000;

export function getDiff(scope: DiffScope, cwd: string = PROJECT_ROOT): string {
  const diff = execFileSync('git', diffArgs(scope), {
    encoding: 'utf8',
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!diff.trim()) return '';
  return diff.length > MAX_DIFF_LENGTH
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n... (truncated, review first 15k chars)'
    : diff;
}

/** The first scope with changes, or null when there is nothing to review. */
function findChanges(cwd: string = PROJECT_ROOT): { scope: DiffScope; diff: string } | null {
  const baseRef = process.env.REVIEW_BASE_REF;
  const scopes: DiffScope[] = baseRef
    ? [{ kind: 'base', ref: baseRef }]
    : [{ kind: 'staged' }, { kind: 'unstaged' }];
  for (const scope of scopes) {
    const diff = getDiff(scope, cwd);
    if (diff) return { scope, diff };
  }
  return null;
}

const EMPTY_ITEM = /^(none|n\/a|no (critical )?(issues?|vulnerabilities|problems)( found)?)\.?$/i;

/**
 * Count list items under headings marked 🔴 or 🟡. The prompts ask for those
 * headings even when a section is empty, so counting the emoji itself would flag
 * every review; items reading "None" don't count.
 */
export function countIssues(review: string, marker: '🔴' | '🟡'): number {
  let inSection = false;
  let count = 0;
  for (const raw of review.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) {
      inSection = line.includes(marker);
      continue;
    }
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (inSection && item && !EMPTY_ITEM.test(item[1].replace(/[*_`]/g, '').trim())) count++;
  }
  return count;
}

/** Worst status across several reviews: any failure fails, all empty is no-changes. */
export function combineStatuses(statuses: ReviewStatus[]): ReviewStatus {
  if (statuses.length === 0 || statuses.includes('failed')) return 'failed';
  return statuses.every((s) => s === 'no-changes') ? 'no-changes' : 'reviewed';
}

async function reviewCode(
  type: 'general' | 'security' | 'perf' = 'general'
): Promise<ReviewStatus> {
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

  let changes: ReturnType<typeof findChanges>;
  try {
    changes = findChanges();
  } catch (error) {
    log.error(`Couldn't read the diff: ${error}`);
    return 'failed';
  }
  if (!changes) {
    log.warn('No changes to review. Make some changes first.');
    return 'no-changes';
  }
  if (changes.scope.kind === 'unstaged')
    log.info('No staged changes. Reviewing unstaged changes...');

  const finalDiff = changes.diff;
  const files = execFileSync('git', diffArgs(changes.scope, true), {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
  });

  log.info(`Reviewing ${files.trim().split('\n').length} file(s)...`);

  try {
    const review = await callGemini(`Review this code diff:\n\n${finalDiff}`, prompts[type]);

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(formatReview(review));
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Count issues
    const criticalCount = countIssues(review, '🔴');
    const warningCount = countIssues(review, '🟡');
    criticalTotal += criticalCount;

    if (criticalCount > 0) {
      log.error(`Found ${criticalCount} critical issue(s) - please fix before committing`);
    } else if (warningCount > 0) {
      log.warn(`Found ${warningCount} warning(s) - consider fixing`);
    } else {
      log.success('Code looks good!');
    }
    return review.trim() ? 'reviewed' : 'failed';
  } catch (error) {
    log.error(`Review failed: ${error}`);
    return 'failed';
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
  const subcommand = args[0] || 'all';
  const statuses: ReviewStatus[] = [];
  criticalTotal = 0;

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    statuses.push('failed');
  } else {
    switch (subcommand) {
      case 'all':
      case 'general':
        statuses.push(await reviewCode('general'));
        break;

      case 'security':
      case 'sec':
        statuses.push(await reviewCode('security'));
        break;

      case 'perf':
      case 'performance':
        statuses.push(await reviewCode('perf'));
        break;

      case 'full':
        statuses.push(await reviewCode('general'));
        console.log('\n');
        statuses.push(await reviewCode('security'));
        console.log('\n');
        statuses.push(await reviewCode('perf'));
        break;

      default:
        console.log(`${colors.bold}AI Code Review:${colors.reset}\n`);
        console.log(`  ${colors.cyan}all${colors.reset}       General code review`);
        console.log(`  ${colors.cyan}security${colors.reset}  Security-focused review`);
        console.log(`  ${colors.cyan}perf${colors.reset}      Performance-focused review`);
        console.log(`  ${colors.cyan}full${colors.reset}      Run all three reviews`);
        return;
    }
  }

  // Machine-readable for the PR workflow, which must not report a review that never ran as clean.
  console.log(`AI_REVIEW_STATUS=${combineStatuses(statuses)}`);
  console.log(`AI_REVIEW_CRITICAL=${criticalTotal}`);
}
