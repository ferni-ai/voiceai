#!/usr/bin/env node
/**
 * Generate Sounds TypeScript Manifest
 *
 * Single source of truth: design-system/assets/sounds/
 * Output: frontend-typescript/src/config/sounds.generated.ts
 *
 * Usage:
 *   node design-system/generate-sounds.js
 *   npm run build:sounds
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Source: design-system/assets/sounds/
  sourceDir: path.join(__dirname, 'assets/sounds'),
  // Output: frontend-typescript/src/config/sounds.generated.ts
  outputFile: path.join(PROJECT_ROOT, 'frontend-typescript/src/config/sounds.generated.ts'),
  // Base path for sounds in the app
  basePath: '/sounds',
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert filename to camelCase variable name
 * handoff-to-alex.mp3 → handoffToAlex
 */
function toCamelCase(filename) {
  // Remove extension
  const name = filename.replace(/\.[^/.]+$/, '');
  // Convert kebab-case to camelCase
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert filename to SCREAMING_SNAKE_CASE
 * handoff-to-alex.mp3 → HANDOFF_TO_ALEX
 */
function toScreamingSnake(filename) {
  const name = filename.replace(/\.[^/.]+$/, '');
  return name.replace(/-/g, '_').toUpperCase();
}

/**
 * Extract persona ID from handoff sound filename
 * handoff-to-alex.mp3 → alex
 */
function extractPersonaFromHandoff(filename) {
  const match = filename.match(/handoff-to-([a-z]+)\.mp3/);
  return match ? match[1] : null;
}

// ============================================================================
// GENERATOR
// ============================================================================

function generateSoundsTS(soundFiles) {
  const handoffSounds = [];
  const systemSounds = [];

  for (const file of soundFiles) {
    if (file.startsWith('handoff-to-')) {
      handoffSounds.push(file);
    } else {
      systemSounds.push(file);
    }
  }

  // Generate individual sound constants
  const soundConstants = soundFiles.map(file => {
    const constName = toScreamingSnake(file);
    const path = `${CONFIG.basePath}/${file}`;
    return `  ${constName}: '${path}'`;
  });

  // Generate SOUNDS object entries
  const soundEntries = soundFiles.map(file => {
    const key = toCamelCase(file);
    const path = `${CONFIG.basePath}/${file}`;
    return `  ${key}: '${path}'`;
  });

  // Generate handoff map
  const handoffEntries = handoffSounds.map(file => {
    const persona = extractPersonaFromHandoff(file);
    const path = `${CONFIG.basePath}/${file}`;
    return `  '${persona}': '${path}'`;
  });

  // Generate type for sound keys
  const soundKeys = soundFiles.map(file => `'${toCamelCase(file)}'`);

  return `/**
 * 🔊 GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * Sound file paths generated from design-system/assets/sounds/
 * Regenerate with: npm run build:sounds
 *
 * Generated: ${new Date().toISOString()}
 */

// ============================================================================
// SOUND FILE PATHS
// ============================================================================

/**
 * All available sound files as constants.
 */
export const SOUND_FILES = {
${soundConstants.join(',\n')}
} as const;

/**
 * Sound files with camelCase keys for easier access.
 */
export const SOUNDS = {
${soundEntries.join(',\n')}
} as const;

// ============================================================================
// SOUND CATEGORIES
// ============================================================================

/**
 * System sounds (connect, disconnect, etc.)
 */
export const SYSTEM_SOUNDS = [
${systemSounds.map(f => `  '${CONFIG.basePath}/${f}'`).join(',\n')}
] as const;

/**
 * Handoff sounds mapped by persona ID.
 * Usage: HANDOFF_SOUNDS['alex'] → '/sounds/handoff-to-alex.mp3'
 */
export const HANDOFF_SOUNDS: Record<string, string> = {
${handoffEntries.join(',\n')}
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type for all sound keys.
 */
export type SoundKey = ${soundKeys.join(' | ')};

/**
 * Type for sound file paths.
 */
export type SoundPath = typeof SOUNDS[SoundKey];

/**
 * Persona IDs that have handoff sounds.
 */
export type HandoffSoundPersona = ${handoffSounds.map(f => `'${extractPersonaFromHandoff(f)}'`).join(' | ')};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the handoff sound path for a persona.
 * Returns undefined if no handoff sound exists.
 */
export function getHandoffSound(personaId: string): string | undefined {
  // Normalize persona ID (handle variations like 'alex-chen' → 'alex')
  const parts = personaId.toLowerCase().split('-');
  const normalized = parts[0] ?? personaId.toLowerCase();
  return HANDOFF_SOUNDS[normalized];
}

/**
 * Check if a sound file exists in our manifest.
 */
export function isSoundPath(path: string): path is SoundPath {
  return Object.values(SOUNDS).includes(path as SoundPath);
}

/**
 * Get all sound file paths.
 */
export function getAllSoundPaths(): string[] {
  return Object.values(SOUNDS);
}

/**
 * Preload all sounds (returns Audio elements).
 * Call this on app init for instant playback.
 */
export function preloadSounds(): Map<string, HTMLAudioElement> {
  const audioMap = new Map<string, HTMLAudioElement>();
  
  for (const [key, path] of Object.entries(SOUNDS)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioMap.set(key, audio);
  }
  
  return audioMap;
}

/**
 * Play a sound by key.
 * Returns the Audio element for control (pause, etc.)
 */
export function playSound(key: SoundKey): HTMLAudioElement | null {
  const path = SOUNDS[key];
  if (!path) return null;
  
  const audio = new Audio(path);
  audio.play().catch(() => {
    // Ignore autoplay errors (user hasn't interacted yet)
  });
  return audio;
}

/**
 * Play the handoff sound for a persona.
 */
export function playHandoffSound(personaId: string): HTMLAudioElement | null {
  const path = getHandoffSound(personaId);
  if (!path) return null;
  
  const audio = new Audio(path);
  audio.play().catch(() => {});
  return audio;
}
`;
}

// ============================================================================
// MAIN
// ============================================================================

function build() {
  console.log('🔊 Generating sounds manifest from assets...\n');

  // Read sound files
  if (!fs.existsSync(CONFIG.sourceDir)) {
    console.error(`❌ Sounds directory not found: ${CONFIG.sourceDir}`);
    process.exit(1);
  }

  const soundFiles = fs.readdirSync(CONFIG.sourceDir)
    .filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'))
    .sort();

  console.log(`  Found ${soundFiles.length} sound files`);

  // Generate TypeScript
  const tsContent = generateSoundsTS(soundFiles);

  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(CONFIG.outputFile, tsContent);
  console.log(`  ✅ Generated: ${CONFIG.outputFile}`);

  console.log('\n✅ Sounds manifest generation complete!\n');
}

build();

