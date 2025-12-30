/**
 * Minimal E2E Test: Gemini Live API with LiveKit
 *
 * Tests if a specific Gemini model works with the LiveKit agents SDK.
 * Uses the actual LiveKit room and agent session - no mocks.
 *
 * Usage:
 *   pnpm test:live                    # Test default model from config
 *   pnpm test:live -- --model gemini-2.5-flash-native-audio-preview-12-2025
 *   pnpm test:live -- --vertex        # Force Vertex AI mode
 */

import 'dotenv/config';
import { voice, Worker, initializeLogger } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as genai from '@google/genai';
import { AccessToken } from 'livekit-server-sdk';

// Initialize LiveKit logger (required before creating AgentSession)
initializeLogger({ pretty: true, level: 'info' });

// Parse CLI args
const args = process.argv.slice(2);
const modelArg = args.find((a) => a.startsWith('--model='))?.split('=')[1];
const useVertex = args.includes('--vertex');

// Config from env
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://dev-8sm1ba0z.livekit.cloud';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Model to test
const MODEL = modelArg || 'gemini-2.5-flash-native-audio-preview-12-2025';

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Gemini Live E2E Test');
  console.log('='.repeat(60));
  console.log(`Model: ${MODEL}`);
  console.log(`Mode: ${useVertex ? 'Vertex AI' : 'API Key'}`);
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
  console.log('='.repeat(60) + '\n');

  // Validate config
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('❌ Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET');
    process.exit(1);
  }

  if (!useVertex && !GOOGLE_API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY for API key mode');
    process.exit(1);
  }

  if (useVertex && !GOOGLE_CLOUD_PROJECT) {
    console.error('❌ Missing GOOGLE_CLOUD_PROJECT for Vertex AI mode');
    process.exit(1);
  }

  // Step 1: Create a test room
  const roomName = `test-gemini-live-${Date.now()}`;
  console.log(`📍 Creating test room: ${roomName}`);

  // Step 2: Create the Gemini Live model
  console.log('\n🤖 Creating Gemini RealtimeModel...');

  const modelOptions: Record<string, unknown> = {
    model: MODEL,
    modalities: [genai.Modality.TEXT], // Text-only mode
    temperature: 0.7,
    instructions: 'You are a helpful assistant. Respond briefly.',
    language: 'en-US',
    inputAudioTranscription: { languageCode: 'en-US' },
  };

  if (useVertex) {
    modelOptions.vertexai = true;
    modelOptions.project = GOOGLE_CLOUD_PROJECT;
    modelOptions.location = GOOGLE_CLOUD_LOCATION;
    console.log(`   Using Vertex AI: ${GOOGLE_CLOUD_PROJECT} @ ${GOOGLE_CLOUD_LOCATION}`);
  } else {
    console.log('   Using API Key mode');
  }

  let llm: google.beta.realtime.RealtimeModel;
  try {
    llm = new google.beta.realtime.RealtimeModel(modelOptions as Parameters<typeof google.beta.realtime.RealtimeModel>[0]);
    console.log('✅ RealtimeModel created successfully');
  } catch (err) {
    console.error('❌ Failed to create RealtimeModel:', err);
    process.exit(1);
  }

  // Step 3: Create AgentSession
  console.log('\n🎭 Creating AgentSession...');

  let session: voice.AgentSession;
  try {
    session = new voice.AgentSession({
      llm,
      turnDetection: 'realtime_llm',
    });
    console.log('✅ AgentSession created');
  } catch (err) {
    console.error('❌ Failed to create AgentSession:', err);
    process.exit(1);
  }

  // Step 4: Generate access token
  console.log('\n🔑 Generating access token...');
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'test-agent',
    name: 'Gemini E2E Test Agent',
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    roomCreate: true,
  });
  const jwt = await token.toJwt();
  console.log('✅ Token generated');

  // Step 5: Connect to room
  console.log('\n🔗 Connecting to LiveKit room...');

  const connectTimeout = setTimeout(() => {
    console.error('❌ Connection timeout after 30s');
    process.exit(1);
  }, 30000);

  try {
    // Create a minimal room context
    const { Room, RoomEvent } = await import('livekit-client');
    const room = new Room();

    // Set up event handlers
    room.on(RoomEvent.Connected, () => {
      console.log('✅ Connected to room');
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log('⚠️ Disconnected from room');
    });

    await room.connect(LIVEKIT_URL, jwt);
    clearTimeout(connectTimeout);

    console.log(`✅ Room connected: ${room.name}`);
    console.log(`   Local participant: ${room.localParticipant.identity}`);

    // Step 6: Test generateReply
    console.log('\n📤 Testing generateReply...');
    console.log('   Sending: "Hello, can you hear me?"');

    const replyTimeout = setTimeout(() => {
      console.error('❌ generateReply timeout after 15s');
      room.disconnect();
      process.exit(1);
    }, 15000);

    try {
      // Note: generateReply needs proper room context
      // This simplified test may not work without full audio tracks
      const handle = session.generateReply({
        instructions: 'The user said: "Hello, can you hear me?" Respond briefly.',
        allowInterruptions: false,
      });

      console.log('   Waiting for response...');

      // Wait for playout (or timeout)
      await handle.waitForPlayout();
      clearTimeout(replyTimeout);

      console.log('✅ generateReply completed!');
      console.log('\n' + '='.repeat(60));
      console.log('🎉 E2E TEST PASSED');
      console.log(`   Model ${MODEL} works with ${useVertex ? 'Vertex AI' : 'API Key'} mode`);
      console.log('='.repeat(60) + '\n');
    } catch (err) {
      clearTimeout(replyTimeout);
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorMsg.includes('generation_created')) {
        console.error('\n❌ generateReply FAILED: generation_created timeout');
        console.error('   This model may not support the Live API streaming protocol.');
        console.error(`   Try a different model like 'gemini-2.0-flash-live-001'`);
      } else {
        console.error('❌ generateReply error:', errorMsg);
      }
    }

    // Cleanup
    room.disconnect();
  } catch (err) {
    clearTimeout(connectTimeout);
    console.error('❌ Room connection failed:', err);
    process.exit(1);
  }

  // Give time for cleanup
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
