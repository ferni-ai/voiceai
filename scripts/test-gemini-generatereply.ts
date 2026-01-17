#!/usr/bin/env npx tsx
/**
 * Gemini generateReply() Test
 *
 * Tests if a model actually works with generateReply(), not just session creation.
 * This is a more thorough test that validates the model supports the Live API.
 *
 * Run with: npx tsx scripts/test-gemini-generatereply.ts [model-name]
 *
 * Examples:
 *   npx tsx scripts/test-gemini-generatereply.ts
 *   npx tsx scripts/test-gemini-generatereply.ts gemini-2.5-flash-lite-preview-09-2025
 *   npx tsx scripts/test-gemini-generatereply.ts gemini-2.0-flash-live-001
 */

import * as genai from '@google/genai';
import * as google from '@livekit/agents-plugin-google';
import { initializeLogger } from '@livekit/agents';

// Initialize LiveKit logger
initializeLogger({ pretty: true });

// ============================================================================
// Configuration
// ============================================================================

const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Default model to test
const DEFAULT_MODEL = 'gemini-2.0-flash-live-001';

// Timeout for generateReply (same as SDK default)
const GENERATE_REPLY_TIMEOUT_MS = 15000;

// ============================================================================
// Test Function
// ============================================================================

async function testGenerateReply(modelName: string): Promise<void> {
  console.log('='.repeat(70));
  console.log(`TESTING generateReply() with: ${modelName}`);
  console.log('='.repeat(70));
  console.log(`\nConfiguration:`);
  console.log(`  USE_VERTEX_AI: ${USE_VERTEX_AI}`);
  if (USE_VERTEX_AI) {
    console.log(`  Project: ${GOOGLE_CLOUD_PROJECT}`);
    console.log(`  Location: ${GOOGLE_CLOUD_LOCATION}`);
  }
  console.log(`  Timeout: ${GENERATE_REPLY_TIMEOUT_MS}ms`);

  // Step 1: Create the RealtimeModel
  console.log(`\n[1/4] Creating RealtimeModel...`);
  const startCreate = Date.now();

  const options: Record<string, unknown> = {
    model: modelName,
    modalities: [genai.Modality.TEXT],
    temperature: 0.8,
    instructions: 'You are a helpful assistant. Keep responses very brief.',
    inputAudioTranscription: { languageCode: 'en-US' },
  };

  if (USE_VERTEX_AI) {
    options.vertexai = true;
    options.project = GOOGLE_CLOUD_PROJECT;
    options.location = GOOGLE_CLOUD_LOCATION;
  }

  let llmModel: google.beta.realtime.RealtimeModel;
  try {
    llmModel = new google.beta.realtime.RealtimeModel(options as any);
    console.log(`  ✓ Model created in ${Date.now() - startCreate}ms`);
  } catch (err) {
    console.log(`  ✗ Failed to create model: ${err}`);
    process.exit(1);
  }

  // Step 2: Create a session
  console.log(`\n[2/4] Creating session...`);
  const startSession = Date.now();

  let session: any;
  try {
    session = await llmModel.session({});
    console.log(`  ✓ Session created in ${Date.now() - startSession}ms`);
  } catch (err) {
    console.log(`  ✗ Failed to create session: ${err}`);
    process.exit(1);
  }

  // Step 3: Call generateReply() - THIS IS THE REAL TEST
  console.log(`\n[3/4] Calling generateReply()...`);
  console.log(`  This is where most models fail if they don't support Live API.`);
  console.log(`  Waiting for generation_created event...`);
  const startReply = Date.now();

  try {
    // Create a promise that races against timeout
    const generatePromise = new Promise<void>(async (resolve, reject) => {
      try {
        // The actual generateReply call
        const handle = session.generateReply({
          instructions: 'Say "hello world" and nothing else.',
          allowInterruptions: false,
        });

        // Wait for the generation to complete
        // This is what triggers the "generation_created" event internally
        console.log(`  Waiting for response...`);

        // Listen for content events
        let responseText = '';
        let gotResponse = false;

        // Set up event listeners
        session.on('response_content', (content: any) => {
          if (content?.text) {
            responseText += content.text;
            gotResponse = true;
          }
        });

        session.on('generation_created', () => {
          console.log(`  ✓ generation_created event received!`);
        });

        session.on('response_done', () => {
          console.log(`  ✓ response_done event received`);
          if (gotResponse) {
            resolve();
          }
        });

        // Also check if handle has waitForPlayout
        if (handle && typeof handle.waitForPlayout === 'function') {
          await handle.waitForPlayout();
          resolve();
        } else {
          // Wait a bit for events
          setTimeout(() => {
            if (gotResponse) {
              resolve();
            } else {
              reject(new Error('No response received within timeout'));
            }
          }, GENERATE_REPLY_TIMEOUT_MS);
        }
      } catch (err) {
        reject(err);
      }
    });

    // Race against our own timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`generateReply timed out after ${GENERATE_REPLY_TIMEOUT_MS}ms`));
      }, GENERATE_REPLY_TIMEOUT_MS);
    });

    await Promise.race([generatePromise, timeoutPromise]);

    const duration = Date.now() - startReply;
    console.log(`  ✓ generateReply() succeeded in ${duration}ms`);
  } catch (err) {
    const duration = Date.now() - startReply;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ generateReply() FAILED after ${duration}ms`);
    console.log(`  Error: ${errorMsg}`);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`RESULT: ❌ ${modelName} does NOT support Gemini Live API`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`\nThis model can create sessions but fails on generateReply().`);
    console.log(`Try one of these known-working models instead:`);
    console.log(`  - gemini-2.0-flash-live-001 (recommended)`);
    console.log(`  - gemini-2.0-flash-exp`);
    console.log(`  - gemini-2.5-flash-preview-native-audio-dialog`);

    // Cleanup
    try {
      await session.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }

  // Step 4: Cleanup
  console.log(`\n[4/4] Cleaning up...`);
  try {
    await session.close();
    console.log(`  ✓ Session closed`);
  } catch (err) {
    console.log(`  ⚠ Session close warning: ${err}`);
  }

  // Success!
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`RESULT: ✓ ${modelName} WORKS with Gemini Live API!`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`\nYou can use this model in your voice agent.`);
  console.log(`Update data/model-config.json:`);
  console.log(`  "model": "${modelName}"`);
}

// ============================================================================
// Alternative test using lower-level API
// ============================================================================

async function testWithConversation(modelName: string): Promise<void> {
  console.log('='.repeat(70));
  console.log(`TESTING conversation API with: ${modelName}`);
  console.log('='.repeat(70));

  const options: Record<string, unknown> = {
    model: modelName,
    modalities: [genai.Modality.TEXT],
    temperature: 0.8,
    instructions: 'You are a helpful assistant.',
  };

  if (USE_VERTEX_AI) {
    options.vertexai = true;
    options.project = GOOGLE_CLOUD_PROJECT;
    options.location = GOOGLE_CLOUD_LOCATION;
  }

  console.log(`\n[1/3] Creating model and session...`);
  const llmModel = new google.beta.realtime.RealtimeModel(options as any);
  const session = await llmModel.session({});
  console.log(`  ✓ Session created`);

  console.log(`\n[2/3] Checking for conversation API...`);

  // Check what's available
  const hasSendClientEvent = typeof session.sendClientEvent === 'function';
  const hasConversation = typeof session.conversation === 'function';

  console.log(`  sendClientEvent: ${hasSendClientEvent ? '✓' : '✗'}`);
  console.log(`  conversation: ${hasConversation ? '✓' : '✗'}`);

  if (hasSendClientEvent) {
    console.log(`\n[3/3] Testing sendClientEvent...`);
    try {
      // Send a text message using the low-level API
      session.sendClientEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Say hello' }],
        },
      });

      // Request a response
      session.sendClientEvent({
        type: 'response.create',
      });

      console.log(`  ✓ Events sent, waiting for response...`);

      // Wait for response
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        session.on('response_done', () => {
          clearTimeout(timeout);
          console.log(`  ✓ Got response!`);
          resolve();
        });

        session.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      console.log(`\n✓ ${modelName} works with conversation API!`);
    } catch (err) {
      console.log(`  ✗ Failed: ${err}`);
    }
  }

  await session.close();
}

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Gemini generateReply() Test

This test validates if a model actually works with the Gemini Live API,
not just if it can create sessions.

Usage:
  npx tsx scripts/test-gemini-generatereply.ts [model-name]

Examples:
  npx tsx scripts/test-gemini-generatereply.ts
  npx tsx scripts/test-gemini-generatereply.ts gemini-2.5-flash-lite-preview-09-2025
  npx tsx scripts/test-gemini-generatereply.ts gemini-2.0-flash-live-001

Environment Variables:
  USE_VERTEX_AI=true|false        Use Vertex AI (default: true)
  GOOGLE_CLOUD_PROJECT            GCP project for Vertex AI
  GOOGLE_CLOUD_LOCATION           GCP location (default: us-central1)
`);
  process.exit(0);
}

const modelToTest = args[0] || DEFAULT_MODEL;

// Run the test
testGenerateReply(modelToTest).catch((err) => {
  console.error(`\nUnexpected error: ${err}`);
  process.exit(1);
});
