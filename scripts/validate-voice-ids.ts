#!/usr/bin/env npx tsx
/**
 * Validate Voice IDs Script
 *
 * Run this to verify all persona voice IDs are correctly configured.
 *
 * Usage:
 *   npx tsx scripts/validate-voice-ids.ts
 *   npm run validate:voices
 */

import { VOICE_IDS, getVoiceIdForPersona, isValidVoiceId } from '../src/config/voice-ids.js';
import { getVoiceId, initializeVoiceRegistry, getAllPersonaIds } from '../src/personas/voice-registry.js';

const PERSONAS = [
  { id: 'ferni', displayName: 'Ferni', envVar: 'JACK_B_VOICE_ID' },
  { id: 'jack-bogle', displayName: 'Jack Bogle', envVar: 'JACK_BOGLE_VOICE_ID' },
  { id: 'peter-lynch', displayName: 'Peter Lynch', envVar: 'PETER_LYNCH_VOICE_ID' },
  { id: 'alex-chen', displayName: 'Alex Chen', envVar: 'COMM_SPECIALIST_VOICE_ID' },
  { id: 'maya-santos', displayName: 'Maya Santos', envVar: 'SPEND_SAVE_VOICE_ID' },
  { id: 'jordan-taylor', displayName: 'Jordan Taylor', envVar: 'EVENT_PLANNER_VOICE_ID' },
];

async function main() {
  console.log('\n🎤 Voice ID Validation\n');
  console.log('='.repeat(80));

  let errors = 0;
  let warnings = 0;

  // Initialize voice registry from bundles
  try {
    await initializeVoiceRegistry();
    console.log('✅ Voice registry initialized from bundles\n');
  } catch (err) {
    console.log('⚠️  Failed to initialize from bundles, using fallbacks\n');
    warnings++;
  }

  // Check each persona
  for (const persona of PERSONAS) {
    console.log(`\n📌 ${persona.displayName} (${persona.id})`);
    console.log('-'.repeat(40));

    // Get voice ID from config
    const configVoiceId = getVoiceIdForPersona(persona.id);
    const registryVoiceId = getVoiceId(persona.id);
    const envValue = process.env[persona.envVar];

    console.log(`  Config:   ${configVoiceId}`);
    console.log(`  Registry: ${registryVoiceId}`);
    console.log(`  Env var:  ${envValue || '(not set)'}`);

    // Validate format
    if (!isValidVoiceId(configVoiceId)) {
      console.log(`  ❌ ERROR: Invalid voice ID format in config`);
      errors++;
    } else if (!isValidVoiceId(registryVoiceId)) {
      console.log(`  ❌ ERROR: Invalid voice ID format in registry`);
      errors++;
    } else if (configVoiceId !== registryVoiceId) {
      console.log(`  ⚠️  WARNING: Config and registry voice IDs don't match!`);
      warnings++;
    } else {
      console.log(`  ✅ Valid`);
    }

    // Check if env var overrides default
    if (envValue && envValue !== configVoiceId) {
      console.log(`  ℹ️  Env var is overriding default`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:\n');

  if (errors === 0 && warnings === 0) {
    console.log('✅ All voice IDs are valid and consistent!\n');
  } else {
    if (errors > 0) {
      console.log(`❌ ${errors} error(s) found - these will cause voice issues!`);
    }
    if (warnings > 0) {
      console.log(`⚠️  ${warnings} warning(s) found - review recommended`);
    }
    console.log('\n');
  }

  // Show all registered personas
  const registeredPersonas = getAllPersonaIds();
  console.log(`📋 Registered personas: ${registeredPersonas.join(', ')}\n`);

  // Show VOICE_IDS constant for reference
  console.log('📖 VOICE_IDS from config/voice-ids.ts:');
  for (const [key, value] of Object.entries(VOICE_IDS)) {
    console.log(`   ${key}: ${value}`);
  }
  console.log('');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

