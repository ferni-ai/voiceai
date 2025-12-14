#!/usr/bin/env npx tsx
/**
 * Smart Release Management
 * 
 * Automates versioning, release notes, and announcements.
 * 
 * @module @ferni/cli/release-auto
 */

import { execSync } from 'child_process';
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
  magenta: '\x1b[35m',
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
// SEMVER ANALYSIS
// =============================================================================

type BumpType = 'major' | 'minor' | 'patch';

interface CommitAnalysis {
  type: BumpType;
  commits: { hash: string; message: string; type: string }[];
  breaking: string[];
  features: string[];
  fixes: string[];
}

function analyzeCommits(since: string): CommitAnalysis {
  const raw = execSync(`git log ${since}..HEAD --pretty=format:"%h|%s" --no-merges`, {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
  }).trim();

  if (!raw) {
    return { type: 'patch', commits: [], breaking: [], features: [], fixes: [] };
  }

  const commits = raw.split('\n').map(line => {
    const [hash, ...messageParts] = line.split('|');
    const message = messageParts.join('|');
    
    // Parse conventional commit type
    const match = message.match(/^(\w+)(?:\([^)]+\))?(!)?:/);
    const type = match?.[1] || 'other';
    const breaking = match?.[2] === '!';
    
    return { hash, message, type, breaking };
  });

  const breaking = commits.filter(c => c.breaking || c.message.toLowerCase().includes('breaking')).map(c => c.message);
  const features = commits.filter(c => c.type === 'feat').map(c => c.message);
  const fixes = commits.filter(c => c.type === 'fix').map(c => c.message);

  // Determine bump type
  let type: BumpType = 'patch';
  if (breaking.length > 0) type = 'major';
  else if (features.length > 0) type = 'minor';

  return { type, commits, breaking, features, fixes };
}

function bumpVersion(current: string, type: BumpType): string {
  const [major, minor, patch] = current.replace(/^v/, '').split('.').map(Number);
  
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
  }
}

function getCurrentVersion(): string {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
    return tag.replace(/^v/, '');
  } catch {
    // No tags, check package.json
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  }
}

// =============================================================================
// AUTO RELEASE
// =============================================================================

async function autoRelease(dryRun = false): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📦 Smart Release${colors.reset}\n`);

  const currentVersion = getCurrentVersion();
  log.info(`Current version: ${colors.bold}v${currentVersion}${colors.reset}`);

  // Get last tag
  let lastTag = '';
  try {
    lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
  } catch {
    lastTag = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim().substring(0, 7);
    log.warn('No previous tags found, analyzing all commits');
  }

  // Analyze commits
  const analysis = analyzeCommits(lastTag);
  
  if (analysis.commits.length === 0) {
    log.warn('No new commits since last release');
    return;
  }

  const newVersion = bumpVersion(currentVersion, analysis.type);

  console.log(`\n${colors.bold}Commit Analysis:${colors.reset}\n`);
  console.log(`  Commits: ${analysis.commits.length}`);
  console.log(`  Breaking: ${analysis.breaking.length}`);
  console.log(`  Features: ${analysis.features.length}`);
  console.log(`  Fixes: ${analysis.fixes.length}`);
  console.log(`\n  Suggested bump: ${colors.bold}${analysis.type}${colors.reset}`);
  console.log(`  New version: ${colors.green}v${newVersion}${colors.reset}\n`);

  if (analysis.breaking.length > 0) {
    console.log(`${colors.red}⚠ Breaking Changes:${colors.reset}`);
    analysis.breaking.forEach(b => console.log(`  • ${b}`));
    console.log();
  }

  if (dryRun) {
    log.info('Dry run - no changes made');
    return;
  }

  // Confirm
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(`${colors.cyan}Create release v${newVersion}? (y/n): ${colors.reset}`, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    log.info('Release cancelled');
    return;
  }

  // Update package.json
  const pkgPath = join(PROJECT_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  log.success(`Updated package.json to v${newVersion}`);

  // Create commit and tag
  execSync(`git add package.json`, { cwd: PROJECT_ROOT });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: PROJECT_ROOT });
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { cwd: PROJECT_ROOT });
  
  log.success(`Created tag v${newVersion}`);
  log.info(`Push with: git push && git push --tags`);
}

// =============================================================================
// RELEASE NOTES
// =============================================================================

const RELEASE_NOTES_PROMPT = `You are Ferni, writing release notes for the Ferni AI platform.

Write user-friendly release notes that:
1. Lead with the most exciting changes
2. Group by: ✨ New, 🔧 Improved, 🐛 Fixed
3. Use simple language (not technical jargon)
4. Highlight user benefits, not implementation details
5. Keep it concise - one line per item
6. Use emoji sparingly but effectively

Format:
# Release vX.Y.Z

Brief exciting summary (1-2 sentences).

## ✨ New
- Feature description (user benefit)

## 🔧 Improved
- Improvement description

## 🐛 Fixed
- Bug fix description

---
Thank you for being part of Ferni! 🌿`;

async function generateReleaseNotes(version?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📝 Generate Release Notes${colors.reset}\n`);

  // Get version range
  let since = '';
  let until = 'HEAD';
  
  if (version) {
    until = `v${version.replace(/^v/, '')}`;
    try {
      since = execSync(`git describe --tags --abbrev=0 ${until}^`, { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
    } catch {
      since = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim().substring(0, 7);
    }
  } else {
    try {
      since = execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
    } catch {
      since = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim().substring(0, 7);
    }
  }

  log.info(`Generating notes for ${since}..${until}`);

  // Get commits
  const commits = execSync(`git log ${since}..${until} --pretty=format:"%s" --no-merges`, {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
  }).trim();

  // Get diff stats
  const stats = execSync(`git diff ${since}..${until} --stat | tail -1`, {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
  }).trim();

  const currentVersion = version || getCurrentVersion();

  try {
    const notes = await callGemini(
      `Generate release notes for v${currentVersion}:\n\nCommits:\n${commits}\n\nStats: ${stats}`,
      RELEASE_NOTES_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(notes);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Copy to clipboard
    try {
      execSync(`echo "${notes.replace(/"/g, '\\"').replace(/`/g, '\\`')}" | pbcopy`);
      log.success('Copied to clipboard!');
    } catch {
      // Clipboard failed
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// ANNOUNCEMENT
// =============================================================================

const ANNOUNCEMENT_PROMPT = `You are Ferni, writing a release announcement for Slack/Discord.

Write an exciting but brief announcement:
1. Start with an emoji and catchy one-liner
2. 2-3 bullet points of highlights
3. Link to full release notes
4. End with a friendly CTA

Keep it under 200 words. Be warm and human (Ferni's brand voice).
No corporate speak. Sound like a friend sharing good news.`;

async function generateAnnouncement(version?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📢 Generate Announcement${colors.reset}\n`);

  const currentVersion = version || getCurrentVersion();
  
  // Get recent commits for context
  let commits = '';
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8', cwd: PROJECT_ROOT }).trim();
    commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s" --no-merges`, {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    }).trim();
  } catch {
    commits = execSync('git log -10 --pretty=format:"%s" --no-merges', {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    }).trim();
  }

  try {
    const announcement = await callGemini(
      `Generate a release announcement for v${currentVersion}:\n\nRecent changes:\n${commits}`,
      ANNOUNCEMENT_PROMPT
    );

    console.log(`\n${colors.bold}Slack/Discord Announcement:${colors.reset}\n`);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(announcement);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Copy to clipboard
    try {
      execSync(`echo "${announcement.replace(/"/g, '\\"').replace(/`/g, '\\`')}" | pbcopy`);
      log.success('Copied to clipboard!');
    } catch {
      // Clipboard failed
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleReleaseAuto(args: string[]): Promise<void> {
  const subcommand = args[0] || 'auto';

  switch (subcommand) {
    case 'auto':
      await autoRelease(args.includes('--dry-run'));
      break;
    
    case 'notes':
      if (!process.env.GOOGLE_API_KEY) {
        log.error('GOOGLE_API_KEY not set');
        return;
      }
      await generateReleaseNotes(args[1]);
      break;
    
    case 'announce':
    case 'announcement':
      if (!process.env.GOOGLE_API_KEY) {
        log.error('GOOGLE_API_KEY not set');
        return;
      }
      await generateAnnouncement(args[1]);
      break;
    
    default:
      console.log(`${colors.bold}Release Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}auto${colors.reset}        Auto-bump version based on commits`);
      console.log(`  ${colors.cyan}notes${colors.reset}       Generate release notes`);
      console.log(`  ${colors.cyan}announce${colors.reset}    Generate Slack/Discord announcement`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni release auto --dry-run`);
      console.log(`  ferni release notes v1.2.0`);
      console.log(`  ferni release announce`);
  }
}

