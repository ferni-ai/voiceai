#!/usr/bin/env node
/**
 * Token Drift Checker
 *
 * Verifies that every committed generated file matches what the token sources
 * produce *right now*, by content — not by timestamp.
 *
 * How: regenerate everything (`tokens:sync`, ~3s), see which files changed,
 * then put the working tree back exactly as it was. Any change means the
 * committed output has drifted from design-system/tokens/*.json. This covers
 * every output the pipeline writes (CSS, TS, Tailwind, iOS JSON, portal CSS…)
 * without maintaining a list of them.
 *
 * Generators must be deterministic (no wall-clock timestamps — see
 * build/build-stamp.js) for this to work.
 *
 * Usage:
 *   node design-system/check-drift.js          # check only, working tree untouched
 *   node design-system/check-drift.js --fix    # keep the regenerated files
 *   pnpm tokens:check
 *
 * Exit codes:
 *   0 - All generated files in sync
 *   1 - Drift detected (run `pnpm tokens:sync` and commit), or generation failed
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);
const FIX = process.argv.includes('--fix');

// ============================================================================
// GIT HELPERS
// ============================================================================

function git(args) {
  return execFileSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

/** Map of path -> porcelain status for every modified/untracked/deleted file. */
function dirtyFiles() {
  const out = git(['status', '--porcelain', '-z', '--untracked-files=all']);
  const entries = new Map();
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2);
    const file = parts[i].slice(3);
    entries.set(file, status);
    // Renames/copies are followed by the original path
    if (status[0] === 'R' || status[0] === 'C') i++;
  }
  return entries;
}

function readOrNull(file) {
  try {
    return fs.readFileSync(path.join(PROJECT_ROOT, file));
  } catch {
    return null;
  }
}

// ============================================================================
// CHECKS
// ============================================================================

/** Regenerate all outputs and return the files whose content changed. */
function regenerateAndDiff() {
  const before = dirtyFiles();
  const snapshot = new Map();
  for (const file of before.keys()) snapshot.set(file, readOrNull(file));

  let generationError = null;
  try {
    execFileSync('npm', ['run', '--silent', 'tokens:sync'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf-8',
    });
  } catch (error) {
    generationError = error.stderr || error.message;
  }

  const after = dirtyFiles();
  const changed = [];
  for (const file of after.keys()) {
    if (!before.has(file)) {
      changed.push(file);
    } else {
      const now = readOrNull(file);
      const was = snapshot.get(file);
      if (!(now === null && was === null) && !(now && was && now.equals(was))) changed.push(file);
    }
  }

  if (!FIX) restore(changed, before, snapshot);
  return { changed, generationError };
}

/** Put every file the regeneration touched back to its pre-check content. */
function restore(changed, before, snapshot) {
  const toCheckout = [];
  for (const file of changed) {
    const fullPath = path.join(PROJECT_ROOT, file);
    if (before.has(file)) {
      const was = snapshot.get(file);
      if (was === null) fs.rmSync(fullPath, { force: true });
      else fs.writeFileSync(fullPath, was);
    } else if (isTracked(file)) {
      toCheckout.push(file);
    } else {
      fs.rmSync(fullPath, { force: true });
    }
  }
  if (toCheckout.length > 0) git(['checkout', '--', ...toCheckout]);
}

function isTracked(file) {
  try {
    git(['ls-files', '--error-unmatch', '--', file]);
    return true;
  } catch {
    return false;
  }
}

function checkPersonaConsistency() {
  const issues = [];

  const colorsPath = path.join(PROJECT_ROOT, 'design-system/tokens/colors.json');
  const personasPath = path.join(PROJECT_ROOT, 'design-system/tokens/personas.json');

  try {
    const colors = JSON.parse(fs.readFileSync(colorsPath, 'utf-8'));
    const personas = JSON.parse(fs.readFileSync(personasPath, 'utf-8'));

    const colorPersonas = Object.keys(colors.personas || {}).filter((k) => !k.startsWith('_'));
    const personaKeys = Object.keys(personas.personas || {}).filter((k) => !k.startsWith('_'));

    for (const p of personaKeys) {
      if (!colorPersonas.includes(p)) {
        issues.push(`Persona "${p}" in personas.json but missing from colors.json`);
      }
    }
    for (const p of colorPersonas) {
      if (!personaKeys.includes(p)) {
        issues.push(`Persona "${p}" in colors.json but missing from personas.json`);
      }
    }
  } catch (e) {
    issues.push(`Error reading persona files: ${e.message}`);
  }

  return issues;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🔍 Checking token drift (regenerating and comparing content)...\n');

  let hasErrors = false;

  const { changed, generationError } = regenerateAndDiff();
  if (generationError) {
    console.log('❌ Token generation failed:');
    console.log(generationError.trim().split('\n').map((l) => `   ${l}`).join('\n'));
    hasErrors = true;
  }

  if (changed.length > 0) {
    console.log(`❌ ${changed.length} generated file(s) out of sync with design-system/tokens:`);
    changed.forEach((f) => console.log(`   - ${f}`));
    console.log(FIX ? '   Regenerated files kept (--fix).' : '   Run: pnpm tokens:sync (then commit the result)');
    hasErrors = true;
  } else if (!generationError) {
    console.log('✅ All generated files match the token sources');
  }

  const personaIssues = checkPersonaConsistency();
  if (personaIssues.length > 0) {
    console.log('❌ Persona consistency issues:');
    personaIssues.forEach((issue) => console.log(`   - ${issue}`));
    hasErrors = true;
  } else {
    console.log('✅ Personas are consistent across files');
  }

  console.log('\n' + '─'.repeat(50));
  if (hasErrors) {
    console.log('❌ DRIFT DETECTED');
    process.exit(1);
  }
  console.log('✅ All tokens in sync!');
}

main();
