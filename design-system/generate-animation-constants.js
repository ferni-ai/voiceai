#!/usr/bin/env node
/**
 * Generate Animation Constants TypeScript
 * 
 * Auto-generates frontend-typescript/src/config/animation-constants.ts
 * from design-system/tokens/animation.json
 * 
 * Usage:
 *   node design-system/generate-animation-constants.js
 *   npm run build:animation-constants
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
  source: path.join(__dirname, 'tokens/animation.json'),
  output: path.join(PROJECT_ROOT, 'frontend-typescript/src/config/animation-constants.generated.ts'),
};

// ============================================================================
// GENERATORS
// ============================================================================

function parseDuration(durationStr) {
  if (typeof durationStr === 'number') return durationStr;
  if (typeof durationStr !== 'string') return 0;
  return parseInt(durationStr.replace('ms', ''), 10);
}

function generateDurations(durations) {
  const lines = [];
  lines.push('/**');
  lines.push(' * Duration constants in milliseconds.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push('export const DURATION_GENERATED = {');
  
  for (const [key, value] of Object.entries(durations)) {
    const name = key.replace(/([A-Z])/g, '_$1').toUpperCase();
    const ms = parseDuration(value);
    lines.push(`  ${name}: ${ms},`);
  }
  
  lines.push('} as const;');
  return lines.join('\n');
}

function generateEasings(easings) {
  const lines = [];
  lines.push('');
  lines.push('/**');
  lines.push(' * Easing curves as cubic-bezier strings.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push('export const EASING_GENERATED = {');
  
  for (const [key, value] of Object.entries(easings)) {
    const name = key.replace(/([A-Z])/g, '_$1').toUpperCase();
    lines.push(`  ${name}: '${value}',`);
  }
  
  lines.push('} as const;');
  return lines.join('\n');
}

function generateStagger(stagger) {
  const lines = [];
  lines.push('');
  lines.push('/**');
  lines.push(' * Stagger delays for cascading animations.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push('export const STAGGER_GENERATED = {');
  
  for (const [key, value] of Object.entries(stagger)) {
    const name = key.toUpperCase();
    const ms = parseDuration(value);
    lines.push(`  ${name}: ${ms},`);
  }
  
  lines.push('} as const;');
  return lines.join('\n');
}

function generatePersonaProfiles(profiles) {
  const lines = [];
  lines.push('');
  lines.push('/**');
  lines.push(' * Persona animation profiles - timing and behavior per character.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push('export const PERSONA_ANIMATION_PROFILES = {');
  
  for (const [personaId, profile] of Object.entries(profiles)) {
    if (personaId.startsWith('_')) continue;
    
    lines.push(`  '${personaId}': {`);
    lines.push(`    timingMultiplier: ${profile.timingMultiplier},`);
    lines.push(`    bounciness: ${profile.bounciness},`);
    lines.push(`    easingPreference: '${profile.easingPreference}',`);
    lines.push(`    thinkingStyle: '${profile.thinkingStyle}',`);
    lines.push(`    celebrationIntensity: '${profile.celebrationIntensity}',`);
    lines.push(`  },`);
  }
  
  lines.push('} as const;');
  return lines.join('\n');
}

function generateWaveformProfiles(profiles) {
  const lines = [];
  lines.push('');
  lines.push('/**');
  lines.push(' * Persona waveform animation profiles.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push('export const PERSONA_WAVEFORM_PROFILES = {');
  
  for (const [personaId, profile] of Object.entries(profiles)) {
    lines.push(`  '${personaId}': {`);
    lines.push(`    energy: ${profile.energy},`);
    lines.push(`    smoothing: ${profile.smoothing},`);
    lines.push(`    speed: ${profile.speed},`);
    lines.push(`  },`);
  }
  
  lines.push('} as const;');
  return lines.join('\n');
}

function generateAvatarSquashStretch(params) {
  const lines = [];
  lines.push('');
  lines.push('/**');
  lines.push(' * Avatar squash & stretch parameters per state.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push('export const AVATAR_SQUASH_STRETCH = {');
  
  for (const [state, values] of Object.entries(params)) {
    if (state.startsWith('_')) continue;
    
    lines.push(`  ${state}: {`);
    lines.push(`    scaleY: ${values.scaleY},`);
    lines.push(`    scaleX: ${values.scaleX},`);
    lines.push(`    translateY: ${values.translateY},`);
    lines.push(`    rotate: ${values.rotate},`);
    lines.push(`  },`);
  }
  
  lines.push('} as const;');
  return lines.join('\n');
}

function generateGoldenRatioTiming(timing) {
  const lines = [];
  lines.push('');
  lines.push('/**');
  lines.push(' * Golden ratio and Fibonacci timing constants.');
  lines.push(' * Auto-generated from design-system/tokens/animation.json');
  lines.push(' */');
  lines.push(`export const PHI = ${timing.phi};`);
  lines.push(`export const PHI_INVERSE = ${timing.phiInverse};`);
  lines.push('');
  lines.push('export const FIBONACCI_TIMING = {');
  for (const [key, value] of Object.entries(timing.fibonacci)) {
    const name = key.toUpperCase();
    const ms = parseDuration(value);
    lines.push(`  ${name}: ${ms},`);
  }
  lines.push('} as const;');
  lines.push('');
  lines.push('export const AVATAR_BREATH_TIMING = {');
  for (const [state, value] of Object.entries(timing.avatarBreath)) {
    const ms = parseDuration(value);
    lines.push(`  ${state}: ${ms},`);
  }
  lines.push('} as const;');
  lines.push('');
  lines.push('export const REACTION_PHASES = {');
  for (const [phase, value] of Object.entries(timing.reactionPhases)) {
    const ms = parseDuration(value);
    lines.push(`  ${phase}: ${ms},`);
  }
  lines.push('} as const;');
  
  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

function build() {
  console.log('🎬 Generating animation constants from design tokens...\n');

  // Load source
  const animation = JSON.parse(fs.readFileSync(CONFIG.source, 'utf-8'));

  // Generate output
  const output = [
    '/**',
    ' * Animation Constants - Auto-Generated',
    ' * ',
    ' * 🎬 AUTO-GENERATED FROM design-system/tokens/animation.json',
    ' * Do not edit directly - run: npm run build:animation-constants',
    ` * Generated: ${new Date().toISOString()}`,
    ' * ',
    ' * This file contains the generated constants. The main animation-constants.ts',
    ' * imports and re-exports these along with manual additions.',
    ' */',
    '',
    generateDurations(animation.durations),
    generateEasings(animation.easings),
    generateStagger(animation.stagger),
    generatePersonaProfiles(animation.personaAnimationProfiles),
    generateWaveformProfiles(animation.personaWaveformProfiles),
    generateAvatarSquashStretch(animation.avatarSquashStretch),
    generateGoldenRatioTiming(animation.goldenRatioTiming),
    '',
    '// ============================================================================',
    '// HELPER: Get persona animation profile',
    '// ============================================================================',
    '',
    'export function getPersonaAnimationProfile(personaId: string) {',
    '  return PERSONA_ANIMATION_PROFILES[personaId as keyof typeof PERSONA_ANIMATION_PROFILES]',
    '    ?? PERSONA_ANIMATION_PROFILES[\'ferni\'];',
    '}',
    '',
    'export function getWaveformProfile(personaId: string) {',
    '  return PERSONA_WAVEFORM_PROFILES[personaId as keyof typeof PERSONA_WAVEFORM_PROFILES]',
    '    ?? PERSONA_WAVEFORM_PROFILES[\'default\'];',
    '}',
    '',
    'export function getAvatarParams(state: keyof typeof AVATAR_SQUASH_STRETCH) {',
    '  return AVATAR_SQUASH_STRETCH[state] ?? AVATAR_SQUASH_STRETCH.idle;',
    '}',
    '',
  ];

  // Write output
  fs.writeFileSync(CONFIG.output, output.join('\n'));
  console.log(`  ✅ Generated: ${CONFIG.output}`);

  console.log('\n✅ Animation constants generation complete!\n');
}

build();

