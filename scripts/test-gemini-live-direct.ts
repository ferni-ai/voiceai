/**
 * Direct Gemini Live API Test
 *
 * Tests if a Gemini model supports the Live API by attempting
 * a direct WebSocket connection to the Gemini Live endpoint.
 *
 * Usage:
 *   pnpm test:gemini-direct
 *   pnpm test:gemini-direct -- --model gemini-2.0-flash-live-001
 *   pnpm test:gemini-direct -- --vertex
 */

import 'dotenv/config';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

// Parse CLI args
const args = process.argv.slice(2);
const modelArg = args.find((a) => a.startsWith('--model='))?.split('=')[1];
const useVertex = args.includes('--vertex');

// Config
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Model to test
const MODEL = modelArg || 'gemini-2.5-flash-native-audio-preview-12-2025';

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Gemini Live API Direct Test');
  console.log('='.repeat(60));
  console.log(`Model: ${MODEL}`);
  console.log(`Mode: ${useVertex ? 'Vertex AI' : 'API Key'}`);
  console.log('='.repeat(60) + '\n');

  // Validate config
  if (!useVertex && !GOOGLE_API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY');
    process.exit(1);
  }

  if (useVertex && !GOOGLE_CLOUD_PROJECT) {
    console.error('❌ Missing GOOGLE_CLOUD_PROJECT for Vertex AI');
    process.exit(1);
  }

  // Create client
  console.log('🔌 Creating GoogleGenAI client...');

  let client: GoogleGenAI;
  if (useVertex) {
    client = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT!,
      location: GOOGLE_CLOUD_LOCATION,
    });
    console.log(`   Vertex AI: ${GOOGLE_CLOUD_PROJECT} @ ${GOOGLE_CLOUD_LOCATION}`);
  } else {
    client = new GoogleGenAI({ apiKey: GOOGLE_API_KEY! });
    console.log('   API Key mode');
  }

  // Try to create a Live session
  console.log('\n📡 Connecting to Gemini Live API...');
  console.log(`   Model: ${MODEL}`);

  return new Promise<void>((resolve, reject) => {
    let responseText = '';
    let connected = false;
    let turnComplete = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        console.error('\n❌ Connection timeout after 15s');
      } else {
        console.error('\n❌ Response timeout after 15s');
      }
      process.exit(1);
    }, 15000);

    client.live
      .connect({
        model: MODEL,
        callbacks: {
          onopen: () => {
            connected = true;
            console.log('✅ Live session connected!');

            // Send a test message after connection
            console.log('\n📤 Sending test message...');
          },
          onmessage: (message: LiveServerMessage) => {
            // Check for setup complete
            if (message.setupComplete) {
              console.log('   Setup complete, sending content...');

              // Send content after setup
              client.live
                .connect({
                  model: MODEL,
                  callbacks: {
                    onmessage: () => {},
                    onopen: () => {},
                  },
                  config: {
                    responseModalities: [Modality.TEXT],
                  },
                })
                .then((session) => {
                  session.sendClientContent({
                    turns: [
                      {
                        role: 'user',
                        parts: [{ text: 'Say exactly: Hello from Gemini Live!' }],
                      },
                    ],
                    turnComplete: true,
                  });
                });
              return;
            }

            // Collect text response
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  responseText += part.text;
                  process.stdout.write(part.text);
                }
              }
            }

            // Check for turn complete
            if (message.serverContent?.turnComplete) {
              turnComplete = true;
              clearTimeout(timeout);

              console.log(`\n\n✅ Response: "${responseText.trim()}"`);

              console.log('\n' + '='.repeat(60));
              console.log('🎉 TEST PASSED');
              console.log(`Model ${MODEL} works with Gemini Live API!`);
              console.log(`Mode: ${useVertex ? 'Vertex AI' : 'API Key'}`);
              console.log('='.repeat(60) + '\n');

              resolve();
              process.exit(0);
            }
          },
          onerror: (err) => {
            clearTimeout(timeout);
            console.error('\n❌ WebSocket error:', err);
            reject(err);
            process.exit(1);
          },
          onclose: () => {
            if (!turnComplete) {
              console.log('\n⚠️ Connection closed before response');
            }
          },
        },
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction: {
            parts: [{ text: 'You are a helpful assistant. Respond very briefly.' }],
          },
        },
      })
      .then((session) => {
        // Send content immediately after connection
        setTimeout(() => {
          console.log('   Sending user message...');
          session.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: 'Say exactly: Hello from Gemini Live!' }],
              },
            ],
            turnComplete: true,
          });
        }, 500);
      })
      .catch((err) => {
        clearTimeout(timeout);
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('\n❌ Live API connection failed:', errorMsg);

        if (errorMsg.includes('not found') || errorMsg.includes('404')) {
          console.error('\n   This model may not support the Live API.');
          console.error(
            '   Try: gemini-2.0-flash-live-001 or gemini-2.5-flash-preview-native-audio-latest'
          );
        }

        if (errorMsg.includes('permission') || errorMsg.includes('403')) {
          console.error('\n   Permission denied. Check your API key or Vertex AI permissions.');
        }

        reject(err);
        process.exit(1);
      });
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
