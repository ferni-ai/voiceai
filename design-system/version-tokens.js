#!/usr/bin/env node
/**
 * Design Token Version Manager
 *
 * Bumps version, updates timestamp, and manages changelog for design tokens.
 *
 * Usage:
 *   node design-system/version-tokens.js patch "Fixed button hover states"
 *   node design-system/version-tokens.js minor "Added new persona colors"
 *   node design-system/version-tokens.js major "Breaking: Renamed all color tokens"
 *   npm run tokens:version patch "Your change description"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = path.join(__dirname, 'tokens/version.json');

// ============================================================================
// VERSION HELPERS
// ============================================================================

function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(current, type) {
  const v = parseVersion(current);

  switch (type) {
    case 'major':
      return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
    case 'patch':
    default:
      return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  }
}

function getDateString() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  // Show help
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Design Token Version Manager

Usage:
  npm run tokens:version <type> "<change description>"
  npm run tokens:version <type> "<change1>" "<change2>" ...

Types:
  patch   - Bug fixes, minor adjustments (0.0.X)
  minor   - New features, additions (0.X.0)
  major   - Breaking changes (X.0.0)

Examples:
  npm run tokens:version patch "Fixed accent color hover state"
  npm run tokens:version minor "Added Eli persona colors" "Added new animation tokens"
  npm run tokens:version major "Renamed all color tokens for consistency"

Options:
  --help, -h    Show this help message
  --current     Show current version only
`);
    process.exit(0);
  }

  // Load current version
  let versionData;
  try {
    versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
  } catch (err) {
    console.error('❌ Could not read version.json:', err.message);
    process.exit(1);
  }

  // Show current version
  if (args[0] === '--current') {
    console.log(versionData.version);
    process.exit(0);
  }

  const bumpType = args[0];
  const changes = args.slice(1);

  // Validate bump type
  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    console.error(`❌ Invalid version type: ${bumpType}`);
    console.error('   Use: major, minor, or patch');
    process.exit(1);
  }

  // Require at least one change description
  if (changes.length === 0) {
    console.error('❌ Please provide at least one change description');
    console.error('   Example: npm run tokens:version patch "Fixed button colors"');
    process.exit(1);
  }

  // Calculate new version
  const oldVersion = versionData.version;
  const newVersion = bumpVersion(oldVersion, bumpType);
  const today = getDateString();

  // Create changelog entry
  const newEntry = {
    version: newVersion,
    date: today,
    changes: changes,
  };

  // Update version data
  versionData.version = newVersion;
  versionData.lastUpdated = new Date().toISOString();
  versionData.changelog.unshift(newEntry); // Add to beginning

  // Write updated version file
  fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2) + '\n');

  // Output results
  console.log(`
🏷️  Design Token Version Bumped

   ${oldVersion} → ${newVersion} (${bumpType})

   Changes:
${changes.map(c => `   • ${c}`).join('\n')}

   Updated: ${VERSION_FILE}
`);
}

main();
