#!/usr/bin/env npx tsx
/**
 * 🔍 Gemini Live API Diagnostic Script
 *
 * Tests the Gemini Live connection DIRECTLY to see the actual errors.
 * Run this when you see "generateReply timed out waiting for generation_created event"
 *
 * Usage: pnpm tsx scripts/diagnose-gemini.ts
 */

import 'dotenv/config';

async function diagnose() {
  console.log('🔍 Gemini Live API Diagnostic');
  console.log('='.repeat(60));
  console.log();

  // Check environment
  console.log('📋 Environment Check:');
  const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const useVertexAI = process.env.USE_VERTEX_AI !== 'false';
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  console.log(`   GOOGLE_API_KEY: ${hasGoogleKey ? '✅ Set (' + process.env.GOOGLE_API_KEY?.slice(0, 8) + '...)' : '❌ Missing'}`);
  console.log(`   GEMINI_API_KEY: ${hasGeminiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   USE_VERTEX_AI: ${useVertexAI ? '🔷 Vertex AI' : '🔶 Gemini API'}`);
  console.log(`   GOOGLE_CLOUD_PROJECT: ${projectId}`);
  console.log(`   GOOGLE_CLOUD_LOCATION: ${location}`);
  console.log();

  // Test with @google/genai directly
  console.log('📡 Testing Gemini API connection...');

  try {
    const { GoogleGenAI, Modality } = await import('@google/genai');

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey && !useVertexAI) {
      console.error('❌ No API key found! Set GOOGLE_API_KEY or GEMINI_API_KEY');
      process.exit(1);
    }

    // Create client based on mode
    let client: InstanceType<typeof GoogleGenAI>;
    if (useVertexAI) {
      console.log('   Creating Vertex AI client...');
      client = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location,
      });
    } else {
      console.log('   Creating Gemini API client...');
      client = new GoogleGenAI({ apiKey: apiKey! });
    }

    // Test 1: Live API connection (this is what the voice agent uses)
    console.log();
    console.log('🧪 Testing Live API connection (this is what the voice agent uses)...');
    console.log('   Model: gemini-2.0-flash-exp');

    let sessionOpened = false;
    let receivedMessages = 0;
    let lastError: unknown = null;

    try {
      const liveSession = await client.live.connect({
        model: 'gemini-2.0-flash-exp',
        callbacks: {
          onopen: () => {
            sessionOpened = true;
            console.log('   ✅ Live session OPENED!');
          },
          onmessage: (msg: unknown) => {
            receivedMessages++;
            const msgStr = JSON.stringify(msg);
            // Check for error responses
            if (msgStr.includes('error') || msgStr.includes('Error')) {
              console.log('   ⚠️ Message contains error:', msgStr.slice(0, 300));
            } else {
              console.log(`   📨 Message #${receivedMessages}:`, msgStr.slice(0, 150));
            }
          },
          onerror: (err: unknown) => {
            lastError = err;
            console.error('   ❌ Live session ERROR:', err);
            console.error('   Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err as Error), 2));
          },
          onclose: (event: { code?: number; reason?: string }) => {
            console.log(`   🔌 Live session CLOSED: code=${event.code}, reason=${event.reason}`);
          },
        },
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction: { parts: [{ text: 'You are a helpful assistant. Respond briefly.' }] },
        },
      });

      // Wait for connection
      console.log('   Waiting for connection (3s)...');
      await new Promise((r) => setTimeout(r, 3000));

      if (!sessionOpened) {
        console.error('   ❌ Session did NOT open within 3 seconds!');
        console.error('   This explains the timeout - Gemini is not connecting.');
        if (lastError) {
          console.error('   Last error:', lastError);
        }
      } else {
        // Try sending content
        console.log('   Sending test message...');
        await liveSession.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: 'Say hello.' }] }],
          turnComplete: true,
        });

        // Wait for response
        console.log('   Waiting for response (5s)...');
        await new Promise((r) => setTimeout(r, 5000));

        console.log(`   Total messages received: ${receivedMessages}`);

        if (receivedMessages === 0) {
          console.error('   ⚠️ No messages received! This could cause the timeout.');
        }
      }

      // Close
      await liveSession.close();
      console.log('   Session closed.');
    } catch (e) {
      console.error('   ❌ Live API connection failed!');
      console.error(`   Error type: ${(e as Error)?.constructor?.name}`);
      console.error(`   Error message: ${(e as Error)?.message || e}`);

      // Try to get more details
      if (e && typeof e === 'object') {
        const errorKeys = Object.getOwnPropertyNames(e);
        console.error('   Error properties:', errorKeys);
        for (const key of errorKeys.slice(0, 5)) {
          console.error(`     ${key}:`, (e as Record<string, unknown>)[key]);
        }
      }

      const errMsg = String((e as Error)?.message || e);
      if (errMsg.includes('429')) {
        console.error('\n   🚨 RATE LIMITED (429) - You have hit quota limits!');
        console.error('   💡 Solution: Enable Vertex AI (USE_VERTEX_AI=true) or wait for quota reset');
      }
      if (errMsg.includes('403')) {
        console.error('\n   🚨 FORBIDDEN (403) - Check API key permissions!');
        console.error('   💡 Solution: Enable Gemini API in Google Cloud Console');
      }
      if (errMsg.includes('401')) {
        console.error('\n   🚨 UNAUTHORIZED (401) - Invalid API key!');
      }
      if (errMsg.includes('model not found') || errMsg.includes('not supported')) {
        console.error('\n   🚨 MODEL NOT SUPPORTED for Live API!');
        console.error('   💡 Solution: Try gemini-2.0-flash-live-001 instead');
      }
    }
  } catch (e) {
    console.error('❌ Failed to import @google/genai:', e);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Diagnostic complete.');
}

diagnose().catch(console.error);
