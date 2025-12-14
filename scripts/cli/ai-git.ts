#!/usr/bin/env npx tsx
/**
 * AI-Powered Git Workflow
 * 
 * Uses Gemini to automate git tasks:
 * - Generate commit messages from diffs
 * - Write PR descriptions
 * - Generate changelogs
 * 
 * @module @ferni/cli/ai-git
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
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
  
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// AI COMMIT MESSAGE
// =============================================================================

const COMMIT_SYSTEM_PROMPT = `You are Ferni, generating git commit messages for the Ferni AI codebase.

Follow Conventional Commits format:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Formatting
- refactor: Code restructuring
- perf: Performance
- test: Tests
- chore: Maintenance
- ci: CI/CD changes

Rules:
1. First line: type(scope): description (max 72 chars)
2. Body: Explain WHAT and WHY, not HOW
3. Use present tense ("add" not "added")
4. Be specific but concise
5. Reference issues if apparent

Output ONLY the commit message, no explanation.`;

export async function generateCommitMessage(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🤖 AI Commit Message Generator${colors.reset}\n`);

  // Get staged diff
  let diff: string;
  try {
    diff = execSync('git diff --cached', { encoding: 'utf8', cwd: PROJECT_ROOT });
  } catch {
    log.error('Failed to get git diff');
    return;
  }

  if (!diff.trim()) {
    log.warn('No staged changes. Stage files with: git add <files>');
    return;
  }

  // Get list of staged files
  const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8', cwd: PROJECT_ROOT });
  
  log.info(`Analyzing ${stagedFiles.trim().split('\n').length} staged file(s)...`);

  // Truncate diff if too long
  const maxDiffLength = 8000;
  const truncatedDiff = diff.length > maxDiffLength 
    ? diff.substring(0, maxDiffLength) + '\n... (truncated)'
    : diff;

  try {
    const prompt = `Generate a commit message for these changes:

Files changed:
${stagedFiles}

Diff:
${truncatedDiff}`;

    const message = await callGemini(prompt, COMMIT_SYSTEM_PROMPT);
    const cleanMessage = message.trim().replace(/^```\n?|\n?```$/g, '');

    console.log(`\n${colors.bold}Generated commit message:${colors.reset}\n`);
    console.log(`${colors.green}${cleanMessage}${colors.reset}\n`);

    // Ask to use it
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Use this message? (y/n/edit): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      execSync(`git commit -m "${cleanMessage.replace(/"/g, '\\"')}"`, { 
        cwd: PROJECT_ROOT, 
        stdio: 'inherit' 
      });
      log.success('Committed!');
    } else if (answer.toLowerCase() === 'edit' || answer.toLowerCase() === 'e') {
      // Write to temp file and open editor
      const tempFile = join(PROJECT_ROOT, '.git', 'COMMIT_EDITMSG');
      writeFileSync(tempFile, cleanMessage);
      execSync('git commit', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } else {
      log.info('Commit cancelled. Message copied to clipboard.');
      try {
        execSync(`echo "${cleanMessage.replace(/"/g, '\\"')}" | pbcopy`);
      } catch {
        // Clipboard copy failed, that's ok
      }
    }
  } catch (error) {
    log.error(`Failed to generate: ${error}`);
  }
}

// =============================================================================
// AI PR DESCRIPTION
// =============================================================================

const PR_SYSTEM_PROMPT = `You are Ferni, writing PR descriptions for the Ferni AI codebase.

Format:
## Summary
Brief description of what this PR does.

## Changes
- Bullet points of key changes

## Testing
How to test these changes.

## Screenshots (if applicable)
Note if UI changes need screenshots.

Rules:
1. Be concise but thorough
2. Focus on WHAT and WHY
3. Use Ferni's warm, human voice
4. Mention breaking changes prominently
5. Link to related issues if apparent

Output ONLY the PR description, no meta-commentary.`;

export async function generatePRDescription(baseBranch = 'main'): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🤖 AI PR Description Generator${colors.reset}\n`);

  // Get current branch
  let currentBranch: string;
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
  } catch {
    log.error('Failed to get current branch');
    return;
  }

  if (currentBranch === baseBranch) {
    log.warn(`You're on ${baseBranch}. Switch to a feature branch first.`);
    return;
  }

  // Get commits since base branch
  let commits: string;
  try {
    commits = execSync(`git log ${baseBranch}..HEAD --oneline`, { encoding: 'utf8', cwd: PROJECT_ROOT });
  } catch {
    log.warn(`No commits found between ${baseBranch} and ${currentBranch}`);
    return;
  }

  // Get diff stats
  const diffStats = execSync(`git diff ${baseBranch}..HEAD --stat`, { encoding: 'utf8', cwd: PROJECT_ROOT });

  // Get full diff (truncated)
  let diff = execSync(`git diff ${baseBranch}..HEAD`, { encoding: 'utf8', cwd: PROJECT_ROOT });
  const maxDiffLength = 10000;
  if (diff.length > maxDiffLength) {
    diff = diff.substring(0, maxDiffLength) + '\n... (truncated)';
  }

  log.info(`Analyzing changes from ${baseBranch} to ${currentBranch}...`);

  try {
    const prompt = `Generate a PR description for these changes:

Branch: ${currentBranch}
Base: ${baseBranch}

Commits:
${commits}

Stats:
${diffStats}

Diff:
${diff}`;

    const description = await callGemini(prompt, PR_SYSTEM_PROMPT);
    const cleanDescription = description.trim().replace(/^```\n?|\n?```$/g, '');

    console.log(`\n${colors.bold}Generated PR description:${colors.reset}\n`);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(cleanDescription);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Copy to clipboard
    try {
      execSync(`echo "${cleanDescription.replace(/"/g, '\\"').replace(/`/g, '\\`')}" | pbcopy`);
      log.success('PR description copied to clipboard!');
    } catch {
      log.info('Tip: Copy the description above for your PR.');
    }

    // Offer to create PR
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Open GitHub to create PR? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      try {
        execSync(`gh pr create --web`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
      } catch {
        // gh CLI not installed or failed
        const repoUrl = execSync('git remote get-url origin', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
        const cleanUrl = repoUrl.replace('.git', '').replace('git@github.com:', 'https://github.com/');
        log.info(`Open: ${cleanUrl}/compare/${baseBranch}...${currentBranch}`);
      }
    }
  } catch (error) {
    log.error(`Failed to generate: ${error}`);
  }
}

// =============================================================================
// AI CHANGELOG
// =============================================================================

const CHANGELOG_SYSTEM_PROMPT = `You are Ferni, writing changelog entries for the Ferni AI platform.

Format:
## [Version] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features

Rules:
1. Group by type (Added, Changed, Fixed, Removed)
2. Be user-focused (what does this mean for users?)
3. Use past tense
4. Be specific but concise
5. Skip internal/chore changes unless significant

Output ONLY the changelog entries.`;

export async function generateChangelog(since = ''): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🤖 AI Changelog Generator${colors.reset}\n`);

  // Get last tag or use provided since
  let sinceRef = since;
  if (!sinceRef) {
    try {
      sinceRef = execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
      log.info(`Generating changelog since ${sinceRef}`);
    } catch {
      sinceRef = 'HEAD~20';
      log.info('No tags found. Using last 20 commits.');
    }
  }

  // Get commits
  const commits = execSync(`git log ${sinceRef}..HEAD --pretty=format:"%h %s" --no-merges`, { 
    encoding: 'utf8', 
    cwd: PROJECT_ROOT 
  });

  if (!commits.trim()) {
    log.warn('No commits found since ' + sinceRef);
    return;
  }

  try {
    const prompt = `Generate changelog entries from these commits:

${commits}

Current date: ${new Date().toISOString().split('T')[0]}`;

    const changelog = await callGemini(prompt, CHANGELOG_SYSTEM_PROMPT);

    console.log(`\n${colors.bold}Generated changelog:${colors.reset}\n`);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(changelog.trim());
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Offer to prepend to CHANGELOG.md
    const changelogPath = join(PROJECT_ROOT, 'CHANGELOG.md');
    if (existsSync(changelogPath)) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        rl.question(`${colors.cyan}Prepend to CHANGELOG.md? (y/n): ${colors.reset}`, resolve);
      });
      rl.close();

      if (answer.toLowerCase() === 'y') {
        const existingChangelog = readFileSync(changelogPath, 'utf8');
        const headerMatch = existingChangelog.match(/^# .+\n\n/);
        const header = headerMatch ? headerMatch[0] : '# Changelog\n\n';
        const rest = headerMatch ? existingChangelog.slice(header.length) : existingChangelog;
        
        writeFileSync(changelogPath, `${header}${changelog.trim()}\n\n${rest}`);
        log.success('Updated CHANGELOG.md');
      }
    }
  } catch (error) {
    log.error(`Failed to generate: ${error}`);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleAIGit(args: string[]): Promise<void> {
  const subcommand = args[0] || 'commit';

  // Check for API key
  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    console.log(`\nSet your API key: ${colors.cyan}export GOOGLE_API_KEY="your-key"${colors.reset}`);
    return;
  }

  switch (subcommand) {
    case 'commit':
    case 'message':
    case 'msg':
      await generateCommitMessage();
      break;
    
    case 'pr':
    case 'describe':
      await generatePRDescription(args[1] || 'main');
      break;
    
    case 'changelog':
    case 'changes':
      await generateChangelog(args[1] || '');
      break;
    
    default:
      console.log(`${colors.bold}AI Git Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}commit${colors.reset}     Generate commit message from staged changes`);
      console.log(`  ${colors.cyan}pr${colors.reset}         Generate PR description`);
      console.log(`  ${colors.cyan}changelog${colors.reset}  Generate changelog from commits`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni ai commit`);
      console.log(`  ferni ai pr main`);
      console.log(`  ferni ai changelog v1.0.0`);
  }
}

