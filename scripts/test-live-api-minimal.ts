#!/usr/bin/env npx tsx
/**
 * Minimal Gemini Live API Test
 * 
 * Tests direct WebSocket connection to Gemini Live API.
 * NO LiveKit, NO voice agent - just raw WebSocket.
 * 
 * Usage:
 *   npx tsx scripts/test-live-api-minimal.ts
 *   npx tsx scripts/test-live-api-minimal.ts --model gemini-2.0-flash-live-001
 *   npx tsx scripts/test-live-api-minimal.ts --vertex
 */

import 'dotenv/config';
import WebSocket from 'ws';

// Parse args
const args = process.argv.slice(2);
const modelArg = args.find(a => a.startsWith('--model='))?.split('=')[1];
const useVertex = args.includes('--vertex');

// Config
const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Model to test - use confirmed Live API model
const MODEL = modelArg || 'gemini-2.0-flash-live-001';

// WebSocket endpoints
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
const VERTEX_WS_URL = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Gemini Live API - Minimal WebSocket Test');
  console.log('='.repeat(60));
  console.log(`Model: ${MODEL}`);
  console.log(`Mode: ${useVertex ? 'Vertex AI' : 'API Key'}`);
  console.log('='.repeat(60) + '\n');

  if (!useVertex && !API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY or GEMINI_API_KEY');
    process.exit(1);
  }

  if (useVertex && !PROJECT) {
    console.error('❌ Missing GOOGLE_CLOUD_PROJECT for Vertex AI');
    process.exit(1);
  }

  const wsUrl = useVertex ? VERTEX_WS_URL : GEMINI_WS_URL;
  console.log(`📡 Connecting to: ${wsUrl.split('?')[0]}...`);

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let setupComplete = false;
    let responseReceived = false;
    let responseText = '';

    const timeout = setTimeout(() => {
      console.error('\n❌ TIMEOUT after 15s');
      console.error('   The model may not support Live API');
      ws.close();
      process.exit(1);
    }, 15000);

    ws.on('open', () => {
      console.log('✅ WebSocket connected!');
      console.log('\n📤 Sending setup message...');

      // Send setup (first message must be setup)
      // Native audio models require AUDIO modality
      const isNativeAudio = MODEL.includes('native-audio');
      const setup = {
        setup: {
          model: `models/${MODEL}`,
          generationConfig: {
            responseModalities: isNativeAudio ? ['AUDIO'] : ['TEXT'],
            temperature: 0.7,
          },
          systemInstruction: {
            parts: [{ text: 'You are a helpful assistant. Respond in exactly 5 words.' }]
          }
        }
      };
      
      console.log(`   Response modality: ${isNativeAudio ? 'AUDIO' : 'TEXT'}`);

      ws.send(JSON.stringify(setup));
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Check for setup complete
        if (msg.setupComplete) {
          setupComplete = true;
          console.log('✅ Setup complete!');
          console.log('\n📤 Sending user message...');

          // Send user message
          const userMsg = {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: 'Say hello to me!' }]
              }],
              turnComplete: true
            }
          };
          ws.send(JSON.stringify(userMsg));
          return;
        }

        // Check for model response
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.text) {
              responseText += part.text;
              process.stdout.write(part.text);
            }
          }
        }

        // Check for turn complete
        if (msg.serverContent?.turnComplete) {
          responseReceived = true;
          clearTimeout(timeout);
          
          console.log('\n');
          console.log('='.repeat(60));
          console.log('🎉 SUCCESS! Model responded via Live API');
          console.log(`   Model: ${MODEL}`);
          console.log(`   Response: "${responseText.trim()}"`);
          console.log('='.repeat(60) + '\n');
          
          ws.close();
          resolve();
          process.exit(0);
        }

        // Check for errors
        if (msg.error) {
          console.error('\n❌ API Error:', msg.error);
          ws.close();
          process.exit(1);
        }

      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      console.error('\n❌ WebSocket error:', err.message);
      
      if (err.message.includes('401') || err.message.includes('403')) {
        console.error('   Check your API key permissions');
      }
      if (err.message.includes('404')) {
        console.error('   Model may not exist or not support Live API');
      }
      
      reject(err);
      process.exit(1);
    });

    ws.on('close', (code, reason) => {
      if (!responseReceived) {
        console.log(`\n⚠️ Connection closed (code: ${code})`);
        if (reason) console.log(`   Reason: ${reason}`);
      }
    });
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
