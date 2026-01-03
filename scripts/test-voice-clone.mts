#!/usr/bin/env npx tsx
/**
 * Test Real Voice Cloning with Cartesia API
 *
 * Uses the actual Cartesia API to clone Joel's voice from audio sample.
 */

import 'dotenv/config';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const AUDIO_FILE = '/Users/sethford/Downloads/Joel Dickson - 5m04s clip.mp3';

async function testVoiceClone() {
  console.log('🎙️  Voice Cloning Test\n');
  console.log('='.repeat(60));

  // Check prerequisites
  if (!CARTESIA_API_KEY) {
    console.error('❌ CARTESIA_API_KEY not set in environment');
    process.exit(1);
  }
  console.log('✅ CARTESIA_API_KEY found');

  // Check audio file
  try {
    const stats = statSync(AUDIO_FILE);
    console.log(`✅ Audio file: ${basename(AUDIO_FILE)} (${Math.round(stats.size / 1024 / 1024 * 10) / 10} MB)`);
  } catch {
    console.error(`❌ Audio file not found: ${AUDIO_FILE}`);
    process.exit(1);
  }

  console.log('\n📤 Uploading to Cartesia for voice cloning...\n');

  try {
    // Read the audio file
    const audioData = await import('fs').then(fs => fs.promises.readFile(AUDIO_FILE));

    // Create FormData with the audio file
    const formData = new FormData();
    const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
    formData.append('clip', audioBlob, 'joel-dickson-sample.mp3');
    formData.append('name', 'Joel Dickson - Vanguard');
    formData.append('description', 'Voice clone of Joel Dickson from Vanguard for AI agent');
    formData.append('language', 'en');

    // Clone voice via Cartesia API
    const response = await fetch('https://api.cartesia.ai/voices/clone/clip', {
      method: 'POST',
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2024-06-10',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Cartesia API error: ${response.status}`);
      console.error(errorText);
      process.exit(1);
    }

    const result = await response.json();

    console.log('✅ Voice embedding extracted!\n');
    console.log('='.repeat(60));
    console.log('\n📋 Embedding Details:');
    console.log(`   Dimensions:  ${result.embedding?.length || 'unknown'}`);
    console.log(`   Type:        ${typeof result.embedding}`);

    // Now create a voice using the embedding
    console.log('\n📤 Creating voice from embedding...\n');

    const createResponse = await fetch('https://api.cartesia.ai/voices', {
      method: 'POST',
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Joel Dickson - Vanguard',
        description: 'Voice clone of Joel Dickson from Vanguard for AI agent',
        embedding: result.embedding,
        language: 'en',
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`❌ Voice creation error: ${createResponse.status}`);
      console.error(errorText);
      process.exit(1);
    }

    const voice = await createResponse.json();

    console.log('✅ Voice created successfully!\n');
    console.log('='.repeat(60));
    console.log('\n📋 Voice Details:');
    console.log(`   Voice ID:    ${voice.id}`);
    console.log(`   Name:        ${voice.name}`);
    console.log(`   Language:    ${voice.language}`);
    console.log(`   Created:     ${voice.created_at || 'now'}`);

    console.log('\n📝 Update your config with this voice ID:');
    console.log(`   voiceId: '${voice.id}'`);

    return voice;
  } catch (error) {
    console.error('❌ Voice cloning failed:', error);
    process.exit(1);
  }
}

testVoiceClone().catch(console.error);
