#!/usr/bin/env node
/**
 * Changelog Blog Post Generator
 *
 * Automatically generates a developer blog post from release commits.
 * Uses Gemini API for human-friendly formatting.
 *
 * Usage:
 *   node generate-changelog-post.js --version v1.2.3
 *   node generate-changelog-post.js --version v1.2.3 --output ./dev-blog/
 *   node generate-changelog-post.js --version v1.2.3 --dry-run
 *
 * Environment:
 *   GEMINI_API_KEY - Required for AI-powered formatting
 */

import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load Gemini, fall back to template-only mode
let GoogleGenerativeAI;
try {
  const genAI = await import('@google/generative-ai');
  GoogleGenerativeAI = genAI.GoogleGenerativeAI;
} catch {
  console.warn('⚠️  @google/generative-ai not installed, using template-only mode');
}

const DEFAULT_OUTPUT = path.join(__dirname, '../apps/website/ferni-website/src/dev-blog');

const CHANGELOG_PROMPT = `You are Ferni's developer advocate writing a changelog blog post.

Version: {VERSION}
Release Date: {DATE}

Commits since last release:
{COMMITS}

Write a developer-friendly changelog post following this structure:

1. Opening line celebrating the release (1 sentence, use emoji)
2. TL;DR section with 3 bullet points of highlights
3. ✨ New Features section (if any feat: commits)
4. 🔧 Improvements section (if any improve/refactor/perf commits)
5. 🐛 Bug Fixes section (if any fix: commits)
6. ⚠️ Breaking Changes section (if any BREAKING CHANGE in commits)
7. Upgrade instructions code block
8. Link to full release notes

VOICE RULES:
- Lead with developer benefits, not implementation details
- Use "you" and "your" (developer-focused)
- Be concise - one line per change max
- Include code snippets for new APIs
- Acknowledge community contributions with @mentions

FORMAT: Return ONLY the markdown content (no frontmatter, I'll add that).
`;

/**
 * Safely execute git commands using execFileSync (no shell injection risk)
 */
function gitCommand(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.error(`Git command failed: git ${args.join(' ')}`);
    return '';
  }
}

async function getCommitsSinceLastTag(version) {
  try {
    // Get all tags sorted by creation date
    const tagsOutput = gitCommand(['tag', '--sort=-creatordate']);
    const tags = tagsOutput.split('\n').filter(Boolean);

    const currentIndex = tags.indexOf(version);
    const previousTag = tags[currentIndex + 1] || tags[1]; // Fallback to second tag

    if (!previousTag) {
      console.warn('No previous tag found, using last 50 commits');
      return gitCommand(['log', '--oneline', '-50']);
    }

    // Get commits between tags using safe array args
    const commits = gitCommand([
      'log',
      `${previousTag}..${version}`,
      '--pretty=format:%h %s (%an)',
    ]);

    return commits || 'No commits found';
  } catch (error) {
    console.error('Error getting commits:', error.message);
    return 'Unable to retrieve commits';
  }
}

function parseCommits(commitsText) {
  const lines = commitsText.trim().split('\n').filter(Boolean);

  const categorized = {
    features: [],
    improvements: [],
    fixes: [],
    breaking: [],
    other: [],
  };

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.includes('breaking') || lower.includes('!:')) {
      categorized.breaking.push(line);
    } else if (lower.startsWith('feat') || lower.includes('feat:') || lower.includes('feat(')) {
      categorized.features.push(line);
    } else if (
      lower.includes('fix:') ||
      lower.includes('fix(') ||
      lower.startsWith('fix')
    ) {
      categorized.fixes.push(line);
    } else if (
      lower.includes('perf') ||
      lower.includes('refactor') ||
      lower.includes('improve')
    ) {
      categorized.improvements.push(line);
    } else {
      categorized.other.push(line);
    }
  }

  return categorized;
}

function generateTemplateFallback(version, _date, categorized) {
  const sections = [];

  sections.push(`🚀 **Ferni ${version}** is here! Here's what's new for developers.\n`);

  sections.push('## TL;DR\n');
  const highlights = [
    ...categorized.features.slice(0, 2),
    ...categorized.improvements.slice(0, 1),
  ].slice(0, 3);
  highlights.forEach((h) => sections.push(`- ${h.replace(/^[a-f0-9]+ /, '')}`));
  sections.push('');

  if (categorized.features.length > 0) {
    sections.push('## ✨ New Features\n');
    categorized.features.forEach((f) => {
      sections.push(`- ${f.replace(/^[a-f0-9]+ /, '')}`);
    });
    sections.push('');
  }

  if (categorized.improvements.length > 0) {
    sections.push('## 🔧 Improvements\n');
    categorized.improvements.forEach((i) => {
      sections.push(`- ${i.replace(/^[a-f0-9]+ /, '')}`);
    });
    sections.push('');
  }

  if (categorized.fixes.length > 0) {
    sections.push('## 🐛 Bug Fixes\n');
    categorized.fixes.forEach((f) => {
      sections.push(`- ${f.replace(/^[a-f0-9]+ /, '')}`);
    });
    sections.push('');
  }

  if (categorized.breaking.length > 0) {
    sections.push('## ⚠️ Breaking Changes\n');
    categorized.breaking.forEach((b) => {
      sections.push(`- ${b.replace(/^[a-f0-9]+ /, '')}`);
    });
    sections.push('');
  }

  sections.push('## Upgrade Guide\n');
  sections.push('```bash');
  sections.push(`# Update your SDK`);
  sections.push(`npm install @ferni/sdk@${version.replace('v', '')}`);
  sections.push('```\n');

  sections.push('---\n');
  sections.push(
    `See the full [release notes on GitHub](https://github.com/ferni-ai/voiceai/releases/tag/${version}).`
  );

  return sections.join('\n');
}

async function generateWithAI(version, date, commits) {
  if (!GoogleGenerativeAI || !process.env.GEMINI_API_KEY) {
    console.log('Using template fallback (no Gemini API)');
    const categorized = parseCommits(commits);
    return generateTemplateFallback(version, date, categorized);
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = CHANGELOG_PROMPT.replace('{VERSION}', version)
    .replace('{DATE}', date)
    .replace('{COMMITS}', commits);

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Gemini API error, using fallback:', error.message);
    const categorized = parseCommits(commits);
    return generateTemplateFallback(version, date, categorized);
  }
}

function generateFrontmatter(version, date, excerpt) {
  const versionSlug = version.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  return `---
title: "What's New in Ferni ${version}"
excerpt: "${excerpt}"
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#38bdf8"
date: ${date}
category: "Changelog"
image: "changelog-${versionSlug}.png"
readTime: 3
version: "${version}"
---

`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const versionIndex = args.indexOf('--version');
  const outputIndex = args.indexOf('--output');
  const dryRun = args.includes('--dry-run');

  if (versionIndex === -1) {
    console.error('Usage: generate-changelog-post.js --version <version> [--output <dir>] [--dry-run]');
    process.exit(1);
  }

  const version = args[versionIndex + 1];
  const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : DEFAULT_OUTPUT;

  console.log(`📝 Generating changelog post for ${version}...`);

  // Get commits
  const commits = await getCommitsSinceLastTag(version);
  console.log(`📊 Found ${commits.split('\n').length} commits`);

  // Generate content
  const date = new Date().toISOString().split('T')[0];
  const content = await generateWithAI(version, date, commits);

  // Extract excerpt (first sentence)
  const firstLine = content.split('\n').find((l) => l.trim() && !l.startsWith('#'));
  const excerpt = firstLine
    ? firstLine.replace(/[*_`]/g, '').slice(0, 150)
    : `Ferni ${version} release with new features and improvements.`;

  // Build final post
  const frontmatter = generateFrontmatter(version, date, excerpt);
  const fullPost = frontmatter + content;

  // Output
  if (dryRun) {
    console.log('\n--- DRY RUN OUTPUT ---\n');
    console.log(fullPost);
    console.log('\n--- END DRY RUN ---');
  } else {
    const filename = `${date}-changelog-${slugify(version)}.md`;
    const filepath = path.join(outputDir, filename);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filepath, fullPost);

    console.log(`✅ Created: ${filepath}`);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
