#!/usr/bin/env npx tsx
/**
 * PersonaPlex Client Demo
 *
 * Demonstrates connecting to a PersonaPlex server with a Ferni persona.
 * Requires a running PersonaPlex server.
 *
 * Usage:
 *   pnpm tsx scripts/personaplex/demo-client.ts
 *   pnpm tsx scripts/personaplex/demo-client.ts --url wss://your-server:8998/api/chat
 *   pnpm tsx scripts/personaplex/demo-client.ts --persona maya
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PersonaPlex Client Demo                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let serverUrl = process.env.PERSONAPLEX_URL || 'wss://localhost:8998/api/chat';
  let personaId = 'ferni';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      serverUrl = args[i + 1];
      i++;
    } else if (args[i] === '--persona' && args[i + 1]) {
      personaId = args[i + 1];
      i++;
    }
  }

  // Import PersonaPlex modules
  const {
    createPersonaPlexClient,
    buildPersonaPlexPrompt,
    getVoiceEmbeddingPath,
    getFallbackVoice,
  } = await import('../../src/integrations/personaplex/index.js');

  // Check for voice embedding
  const { path: voicePath, isCustom } = getVoiceEmbeddingPath(personaId);

  // Use stock PersonaPlex voice if custom not available
  const useStockVoice = process.argv.includes('--stock');
  const actualVoice = useStockVoice ? getFallbackVoice(personaId) + '.pt' : voicePath;

  console.log('📋 Configuration:');
  console.log(`  Server URL:  ${serverUrl}`);
  console.log(`  Persona:     ${personaId}`);
  console.log(
    `  Voice:       ${actualVoice} (${useStockVoice ? 'stock PersonaPlex' : isCustom ? 'custom' : 'fallback'})`
  );

  // Build prompt
  console.log('\n🔧 Building prompt...');
  const { textPrompt, voicePrompt, estimatedTokens } = await buildPersonaPlexPrompt(personaId, {
    userId: 'demo-user',
    memoryContext: 'This is a demo session.',
    timeContext: 'Demo time',
  });

  console.log(`  Text prompt: ${textPrompt.slice(0, 100)}...`);
  console.log(`  Voice prompt: ${actualVoice}`);
  console.log(`  Estimated tokens: ${estimatedTokens}`);

  // Create client
  console.log('\n🔌 Creating PersonaPlex client...');
  const client = createPersonaPlexClient({
    url: serverUrl,
    debug: true,
    connectionTimeoutMs: 30000,
  });

  // Set up event handlers
  client.on('onStateChange', (state) => {
    console.log(`  📡 State: ${state}`);
  });

  client.on('onReady', () => {
    console.log('  ✅ Connection ready! PersonaPlex is accepting audio.');
  });

  client.on('onText', (text) => {
    process.stdout.write(text);
  });

  client.on('onAudio', (data) => {
    console.log(`  🔊 Received ${data.length} bytes of audio`);
  });

  client.on('onError', (error) => {
    console.error(`  ❌ Error: ${error.message}`);
  });

  client.on('onClose', () => {
    console.log('  🔒 Connection closed');
  });

  // Try to connect
  console.log('\n🚀 Connecting to PersonaPlex server...');
  console.log(`  URL: ${serverUrl}`);

  try {
    await client.connect({
      voicePrompt: actualVoice,
      textPrompt,
      seed: 42,
    });

    console.log('\n✅ Connected successfully!');
    console.log('\nThe client is now connected to PersonaPlex.');
    console.log('In a full implementation, you would:');
    console.log('  1. Capture audio from the microphone');
    console.log('  2. Send audio data with client.sendAudio(data)');
    console.log('  3. Play received audio from onAudio callback');
    console.log('  4. Display transcribed text from onText callback');

    // Keep connection open for a few seconds to demonstrate
    console.log('\nKeeping connection open for 5 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    client.disconnect();
    console.log('\n👋 Demo complete!');
  } catch (error) {
    console.error(`\n❌ Connection failed: ${error}`);
    console.log('\nMake sure PersonaPlex server is running:');
    console.log('  cd /path/to/personaplex');
    console.log(
      '  SSL_DIR=$(mktemp -d); python -m moshi.server --ssl "$SSL_DIR" --voice-prompt-dir /path/to/voice-embeddings'
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
