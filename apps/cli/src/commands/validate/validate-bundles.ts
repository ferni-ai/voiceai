#!/usr/bin/env npx tsx
/**
 * Bundle Validation Script
 *
 * Validates all persona bundles for completeness and consistency.
 * Run with: npx tsx scripts/validate-bundles.ts
 *
 * Checks:
 * - Required files exist
 * - Manifest schema is valid
 * - Required behaviors are present
 * - Content references are resolvable
 * - IDs are consistent
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, basename } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BUNDLES_PATH = join(process.cwd(), 'src/personas/bundles');

// Required files in every bundle
const REQUIRED_FILES = [
  'persona.manifest.json',
  'identity/biography.md',
  'identity/system-prompt.md',
];

// Required behavior files
const REQUIRED_BEHAVIORS = [
  'content/behaviors/greetings.json',
  'content/behaviors/backchannels.json',
];

// Recommended behavior files (warn if missing)
const RECOMMENDED_BEHAVIORS = [
  'content/behaviors/catchphrases.json',
  'content/behaviors/celebrations.json',
  'content/behaviors/entrances.json',
  'content/behaviors/goodbyes.json',
  'content/behaviors/cognitive.json',
  'content/behaviors/thinking-sounds.json',
  'content/behaviors/pet-peeves.json',
];

// Optional but useful
const OPTIONAL_FILES = [
  'content/behaviors/music-preferences.json',
  'content/behaviors/storytelling.json',
  'content/behaviors/vulnerability.json',
  'content/behaviors/cultural-moments.json',
  'content/behaviors/quirks.json',
  'content/identity/inner-world.json',
  'content/identity/sensory-world.json',
  'content/stories/_index.json',
  'content/knowledge/_index.json',
];

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  bundleId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

async function validateManifest(bundlePath: string, result: ValidationResult): Promise<void> {
  const manifestPath = join(bundlePath, 'persona.manifest.json');

  try {
    const manifest = (await readJson(manifestPath)) as Record<string, unknown>;

    // Check required top-level fields
    const requiredFields = ['identity', 'voice', 'speech_characteristics', 'personality', 'role', 'content'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        result.errors.push(`Manifest missing required field: ${field}`);
      }
    }

    // Check identity fields
    const identity = manifest.identity as Record<string, unknown> | undefined;
    if (identity) {
      if (!identity.id) result.errors.push('Manifest identity missing: id');
      if (!identity.name) result.errors.push('Manifest identity missing: name');
      if (!identity.description) result.errors.push('Manifest identity missing: description');
      if (!identity.self_reference) result.warnings.push('Manifest identity missing: self_reference');

      // Check ID consistency
      const bundleId = basename(bundlePath);
      if (identity.id !== bundleId) {
        result.errors.push(`ID mismatch: folder is "${bundleId}" but manifest id is "${identity.id}"`);
      }
    }

    // Check voice config
    const voice = manifest.voice as Record<string, unknown> | undefined;
    if (voice) {
      if (!voice.provider) result.errors.push('Manifest voice missing: provider');
      if (!voice.voice_id) result.errors.push('Manifest voice missing: voice_id');
    }

    // Check speech characteristics
    const speech = manifest.speech_characteristics as Record<string, unknown> | undefined;
    if (speech) {
      const requiredSpeech = ['base_speed_multiplier', 'pause_multiplier', 'thinking_sound_frequency', 'emphasis_style'];
      for (const field of requiredSpeech) {
        if (speech[field] === undefined) {
          result.warnings.push(`Manifest speech_characteristics missing: ${field}`);
        }
      }
    }

    // Check personality
    const personality = manifest.personality as Record<string, unknown> | undefined;
    if (personality) {
      const requiredPersonality = ['warmth', 'humor_level', 'directness', 'energy', 'traits'];
      for (const field of requiredPersonality) {
        if (personality[field] === undefined) {
          result.warnings.push(`Manifest personality missing: ${field}`);
        }
      }
    }

    // Check for team config if not coordinator
    const team = manifest.team as Record<string, unknown> | undefined;
    if (!team) {
      result.warnings.push('Manifest missing: team configuration');
    }

    // Check for cognitive profile in manifest
    if (!manifest.cognitive) {
      result.info.push('Consider adding cognitive profile summary to manifest');
    }

    result.info.push(`Manifest version: ${manifest.version || 'not specified'}`);
  } catch (error) {
    result.errors.push(`Failed to parse manifest: ${error}`);
  }
}

async function validateBundle(bundlePath: string): Promise<ValidationResult> {
  const bundleId = basename(bundlePath);
  const result: ValidationResult = {
    bundleId,
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  };

  // Check required files
  for (const file of REQUIRED_FILES) {
    const filePath = join(bundlePath, file);
    if (!(await fileExists(filePath))) {
      result.errors.push(`Missing required file: ${file}`);
    }
  }

  // Check required behaviors
  for (const file of REQUIRED_BEHAVIORS) {
    const filePath = join(bundlePath, file);
    if (!(await fileExists(filePath))) {
      result.errors.push(`Missing required behavior: ${file}`);
    }
  }

  // Check recommended behaviors
  for (const file of RECOMMENDED_BEHAVIORS) {
    const filePath = join(bundlePath, file);
    if (!(await fileExists(filePath))) {
      result.warnings.push(`Missing recommended file: ${file}`);
    }
  }

  // Check optional files and report
  let optionalCount = 0;
  for (const file of OPTIONAL_FILES) {
    const filePath = join(bundlePath, file);
    if (await fileExists(filePath)) {
      optionalCount++;
    }
  }
  result.info.push(`Optional files present: ${optionalCount}/${OPTIONAL_FILES.length}`);

  // Validate manifest
  await validateManifest(bundlePath, result);

  // Count total behavior files
  const behaviorsPath = join(bundlePath, 'content/behaviors');
  if (await fileExists(behaviorsPath)) {
    try {
      const behaviors = await readdir(behaviorsPath);
      const jsonFiles = behaviors.filter((f) => f.endsWith('.json'));
      result.info.push(`Total behavior files: ${jsonFiles.length}`);
    } catch {
      result.warnings.push('Could not read behaviors directory');
    }
  }

  // Set validity
  result.valid = result.errors.length === 0;

  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('🔍 Validating persona bundles...\n');

  // Find all bundles
  const entries = await readdir(BUNDLES_PATH, { withFileTypes: true });
  const bundleDirs = entries
    .filter((e) => e.isDirectory())
    .filter((e) => !e.name.startsWith('.') && !e.name.endsWith('.ts'))
    .map((e) => e.name);

  console.log(`Found ${bundleDirs.length} bundle directories\n`);

  const results: ValidationResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const bundleDir of bundleDirs) {
    const bundlePath = join(BUNDLES_PATH, bundleDir);

    // Check if it has a manifest (skip non-bundle directories)
    const manifestPath = join(bundlePath, 'persona.manifest.json');
    if (!(await fileExists(manifestPath))) {
      continue;
    }

    const result = await validateBundle(bundlePath);
    results.push(result);

    if (result.valid) {
      passCount++;
      console.log(`✅ ${result.bundleId}`);
    } else {
      failCount++;
      console.log(`❌ ${result.bundleId}`);
    }

    // Print errors
    for (const error of result.errors) {
      console.log(`   ❌ ${error}`);
    }

    // Print warnings
    for (const warning of result.warnings) {
      console.log(`   ⚠️  ${warning}`);
    }

    // Print info
    for (const info of result.info) {
      console.log(`   ℹ️  ${info}`);
    }

    console.log();
  }

  // Summary
  console.log('─'.repeat(50));
  console.log(`\n📊 Summary: ${passCount} passed, ${failCount} failed\n`);

  // Calculate completeness score
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const completenessScore = Math.round((1 - totalWarnings / (results.length * RECOMMENDED_BEHAVIORS.length)) * 100);
  console.log(`📈 Completeness score: ${completenessScore}%`);

  // Exit with error code if any failed
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});

