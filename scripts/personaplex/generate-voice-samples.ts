#!/usr/bin/env npx tsx
/**
 * Generate Voice Samples for PersonaPlex
 *
 * This script generates audio samples from Cartesia TTS for each persona,
 * which can then be converted to PersonaPlex voice embeddings.
 *
 * Usage:
 *   pnpm tsx scripts/personaplex/generate-voice-samples.ts
 *   pnpm tsx scripts/personaplex/generate-voice-samples.ts --persona ferni
 *   pnpm tsx scripts/personaplex/generate-voice-samples.ts --all
 */

import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');

// Voice configurations (same as in config.ts but standalone for script use)
const VOICE_CONFIGS = [
  {
    personaId: 'ferni',
    cartesiaVoiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    description: 'Ferni - Life Coach',
  },
  {
    personaId: 'maya',
    cartesiaVoiceId: '11175483-5332-496c-8c01-ca527ce04e4a',
    description: 'Maya - Habits Coach',
  },
  {
    personaId: 'alex',
    cartesiaVoiceId: '81c164d9-7baa-419d-9f9a-6b18100a01ee',
    description: 'Alex - Communications',
  },
  {
    personaId: 'peter',
    cartesiaVoiceId: '3f04e815-3260-4f50-8fd9-af9c657be4c2',
    description: 'Peter - Research',
  },
  {
    personaId: 'jordan',
    cartesiaVoiceId: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',
    description: 'Jordan - Events',
  },
  {
    personaId: 'nayan',
    cartesiaVoiceId: '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3',
    description: 'Nayan - Wisdom',
  },
];

// Sample text for voice embedding (~30 seconds of speech)
const SAMPLE_TEXT = `
Hello, it's wonderful to connect with you today. I've been thinking about how meaningful our conversations are, 
and I want you to know that I'm here to support you in whatever way feels right. 

Life has its ups and downs, and sometimes we just need someone to listen, someone who truly understands. 
Whether you're feeling great and want to celebrate, or going through something challenging, I'm fully present with you.

Let's take a breath together. Remember, every step forward, no matter how small, is progress worth acknowledging. 
You're doing better than you think, and I'm honored to be part of your journey.
`.trim();

async function generateCartesiaAudio(voiceId: string, text: string): Promise<Buffer> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error('CARTESIA_API_KEY environment variable is required');
  }

  console.log(`  📡 Calling Cartesia API...`);

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3-latest',
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId,
      },
      output_format: {
        container: 'wav',
        encoding: 'pcm_f32le',
        sample_rate: 24000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cartesia API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateVoiceSample(config: typeof VOICE_CONFIGS[0], outputDir: string): Promise<string> {
  const outputPath = join(outputDir, `${config.personaId}.wav`);

  console.log(`\n🎙️  Generating sample for ${config.description}`);
  console.log(`  Voice ID: ${config.cartesiaVoiceId}`);

  try {
    const audioBuffer = await generateCartesiaAudio(config.cartesiaVoiceId, SAMPLE_TEXT);
    await writeFile(outputPath, audioBuffer);

    const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`  ✅ Saved: ${outputPath} (${sizeMB} MB)`);

    return outputPath;
  } catch (error) {
    console.error(`  ❌ Failed: ${error}`);
    throw error;
  }
}

async function generateSilenceSample(outputDir: string): Promise<string> {
  // Generate 10 seconds of silence for PersonaPlex embedding generation
  const outputPath = join(outputDir, 'silence-10s.wav');

  if (existsSync(outputPath)) {
    console.log(`\n🔇 Silence sample already exists: ${outputPath}`);
    return outputPath;
  }

  console.log(`\n🔇 Generating 10s silence sample...`);

  // Create a simple WAV file with silence
  const sampleRate = 24000;
  const duration = 10; // seconds
  const numSamples = sampleRate * duration;
  const bytesPerSample = 4; // 32-bit float

  // WAV header
  const headerSize = 44;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(3, 20); // format (3 = IEEE float)
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24); // sample rate
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(32, 34); // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Silence (zeros are already in the buffer)

  await writeFile(outputPath, buffer);
  console.log(`  ✅ Saved: ${outputPath}`);

  return outputPath;
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PersonaPlex Voice Sample Generator                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Check for API key
  if (!process.env.CARTESIA_API_KEY) {
    console.error('\n❌ Error: CARTESIA_API_KEY environment variable is required');
    console.log('\nSet it with:');
    console.log('  export CARTESIA_API_KEY=your-api-key');
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  let personaArg: string | undefined;
  
  // Handle --persona=value or --persona value
  const personaIndex = args.findIndex((a) => a === '--persona' || a.startsWith('--persona='));
  if (personaIndex !== -1) {
    if (args[personaIndex].includes('=')) {
      personaArg = args[personaIndex].split('=')[1];
    } else if (args[personaIndex + 1]) {
      personaArg = args[personaIndex + 1];
    }
  }
  
  const allPersonas = args.includes('--all') || (!personaArg && args.length === 0);

  // Create output directory
  const outputDir = join(PROJECT_ROOT, 'voice-embeddings', 'samples');
  await mkdir(outputDir, { recursive: true });
  console.log(`\n📁 Output directory: ${outputDir}`);

  // Generate silence sample (needed for embedding generation)
  await generateSilenceSample(outputDir);

  // Determine which personas to generate
  let configs = VOICE_CONFIGS;
  
  if (personaArg) {
    configs = VOICE_CONFIGS.filter((c) => c.personaId === personaArg);
    if (configs.length === 0) {
      console.error(`\n❌ Unknown persona: ${personaArg}`);
      console.log('Available personas:', VOICE_CONFIGS.map((c) => c.personaId).join(', '));
      process.exit(1);
    }
  } else if (!allPersonas) {
    // Default to all if no args given
    configs = VOICE_CONFIGS;
  }

  // Generate samples
  const results: { persona: string; path: string; success: boolean }[] = [];

  for (const config of configs) {
    try {
      const path = await generateVoiceSample(config, outputDir);
      results.push({ persona: config.personaId, path, success: true });
    } catch {
      results.push({ persona: config.personaId, path: '', success: false });
    }
  }

  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📊 Summary');
  console.log('════════════════════════════════════════════════════════════════');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`  ✅ Successful: ${successful.length}`);
  if (failed.length > 0) {
    console.log(`  ❌ Failed: ${failed.length} (${failed.map((f) => f.persona).join(', ')})`);
  }

  if (successful.length > 0) {
    console.log('\n📋 Next Steps:');
    console.log('  1. Copy the samples to a machine with GPU and PersonaPlex installed');
    console.log('  2. Run the embedding generation script:');
    console.log(`     pnpm tsx scripts/personaplex/generate-embeddings.sh`);
    console.log('  3. Copy the .pt files back to voice-embeddings/');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
