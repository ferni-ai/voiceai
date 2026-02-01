#!/usr/bin/env npx tsx
/**
 * Sample: Connecting to Gemini via Vertex AI
 *
 * This script demonstrates how Ferni connects to Google's Gemini models
 * using the @google/genai SDK with Vertex AI.
 *
 * Two modes are shown:
 * 1. Standard API - For non-streaming requests (classification, extraction, etc.)
 * 2. Live API - For real-time streaming (voice conversations)
 *
 * Prerequisites:
 * - Google Cloud project with Vertex AI enabled
 * - Application Default Credentials (gcloud auth application-default login)
 * - Or GOOGLE_API_KEY for non-Vertex mode
 *
 * Usage:
 *   npx tsx scripts/sample-gemini-vertex-connection.ts
 *   npx tsx scripts/sample-gemini-vertex-connection.ts --live  # Test Live API
 */

import 'dotenv/config';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Vertex AI settings (from environment or defaults)
const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

// Models
const STANDARD_MODEL = 'gemini-2.5-flash'; // For non-streaming
const REALTIME_MODEL = 'gemini-2.0-flash-live-preview-04-09'; // For Live API streaming

console.log('🔧 Configuration:');
console.log(`   USE_VERTEX_AI: ${USE_VERTEX_AI}`);
console.log(`   Project: ${GOOGLE_CLOUD_PROJECT}`);
console.log(`   Location: ${GOOGLE_CLOUD_LOCATION}`);
console.log(`   Has API Key: ${!!GOOGLE_API_KEY}`);
console.log('');

// ============================================================================
// EXAMPLE 1: Standard API (Non-Streaming)
// ============================================================================

async function demonstrateStandardAPI() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('EXAMPLE 1: Standard Gemini API (Non-Streaming)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { GoogleGenAI } = await import('@google/genai');

  // Create client - Vertex AI mode or API key mode
  let client: InstanceType<typeof GoogleGenAI>;

  if (USE_VERTEX_AI && GOOGLE_CLOUD_PROJECT) {
    // Vertex AI mode - uses Application Default Credentials
    // Run: gcloud auth application-default login
    client = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: GOOGLE_CLOUD_LOCATION,
    });
    console.log(`✅ Connected to Vertex AI (${GOOGLE_CLOUD_PROJECT} @ ${GOOGLE_CLOUD_LOCATION})`);
  } else if (GOOGLE_API_KEY) {
    // API key mode
    client = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    console.log('✅ Connected with API Key');
  } else {
    console.error('❌ No credentials available. Set GOOGLE_CLOUD_PROJECT or GOOGLE_API_KEY');
    return;
  }

  // Simple text generation
  console.log('\n📝 Generating text...\n');

  const response = await client.models.generateContent({
    model: STANDARD_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: 'What are 3 benefits of meditation? Keep it brief.' }],
      },
    ],
    config: {
      temperature: 0.7,
      maxOutputTokens: 256,
    },
  });

  console.log('Response:');
  console.log(response.text);
  console.log('\n✅ Standard API test complete!\n');
}

// ============================================================================
// EXAMPLE 2: Live API (Real-Time Streaming)
// ============================================================================

async function demonstrateLiveAPI() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('EXAMPLE 2: Gemini Live API (Real-Time Streaming)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { GoogleGenAI, Modality } = await import('@google/genai');

  // Live API requires Vertex AI with OAuth2 credentials (ADC)
  // Run: gcloud auth application-default login
  if (!GOOGLE_CLOUD_PROJECT) {
    console.log('⚠️  Live API requires GOOGLE_CLOUD_PROJECT and Application Default Credentials');
    console.log('   Run: gcloud auth application-default login');
    return;
  }

  // Create Vertex AI client for Live API
  const client = new GoogleGenAI({
    vertexai: true,
    project: GOOGLE_CLOUD_PROJECT,
    location: GOOGLE_CLOUD_LOCATION,
  });
  console.log(`✅ Using Vertex AI for Live API (${GOOGLE_CLOUD_PROJECT} @ ${GOOGLE_CLOUD_LOCATION})`);

  // Define tools for function calling
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'getWeather',
          description: 'Get current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'City or location name',
              },
            },
            required: ['location'],
          },
        },
        {
          name: 'playMusic',
          description: 'Play music based on query',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Music query (song, artist, genre)',
              },
            },
            required: ['query'],
          },
        },
      ],
    },
  ];

  // Live API configuration
  const config = {
    responseModalities: [Modality.TEXT], // Text only (use Modality.AUDIO for voice)
    tools: tools,
    systemInstruction: {
      parts: [
        {
          text: `You are a helpful assistant. When the user asks about weather, use the getWeather function. When they ask for music, use the playMusic function.`,
        },
      ],
    },
  };

  console.log('🔌 Connecting to Gemini Live API...\n');

  const responseQueue: unknown[] = [];
  let turnComplete = false;

  const session = await client.live.connect({
    model: REALTIME_MODEL,
    callbacks: {
      onopen: () => {
        console.log('✅ Connected to Live API');
      },
      onmessage: (message: unknown) => {
        const msg = message as Record<string, unknown>;
        responseQueue.push(msg);

        // Handle text responses
        const serverContent = msg.serverContent as Record<string, unknown> | undefined;
        if (serverContent?.modelTurn) {
          const modelTurn = serverContent.modelTurn as Record<string, unknown>;
          const parts = modelTurn.parts as Array<Record<string, unknown>> | undefined;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                console.log(`📝 Response: "${part.text}"`);
              }
            }
          }
        }

        // Handle tool calls
        if (msg.toolCall) {
          console.log('🔧 Tool Call:', JSON.stringify(msg.toolCall, null, 2));
        }

        // Handle turn complete
        if (serverContent?.turnComplete) {
          turnComplete = true;
          console.log('✅ Turn complete');
        }
      },
      onerror: (e: unknown) => {
        const error = e as Error;
        console.error('❌ Error:', error.message);
      },
      onclose: (e: unknown) => {
        const event = e as { reason?: string };
        console.log('🔌 Connection closed:', event.reason || 'unknown');
      },
    },
    config: config,
  });

  // Send a test message
  const testPrompt = "What's the weather like in San Francisco?";
  console.log(`\n🗣️  Sending: "${testPrompt}"\n`);

  session.sendClientContent({
    turns: { role: 'user', parts: [{ text: testPrompt }] },
    turnComplete: true,
  });

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Check for tool calls
  const toolCallMsg = responseQueue.find((m) => {
    const msg = m as Record<string, unknown>;
    return msg.toolCall;
  }) as Record<string, unknown> | undefined;

  if (toolCallMsg?.toolCall) {
    console.log('\n✅ Tool call received! Sending mock response...');

    const toolCall = toolCallMsg.toolCall as {
      functionCalls?: Array<{ id: string; name: string }>;
    };

    if (toolCall.functionCalls) {
      for (const fc of toolCall.functionCalls) {
        session.sendToolResponse({
          functionResponses: [
            {
              id: fc.id,
              name: fc.name,
              response: {
                temperature: '68°F',
                conditions: 'Partly cloudy',
                location: 'San Francisco',
              },
            },
          ],
        });
      }
    }

    // Wait for model to respond
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  session.close();
  console.log('\n✅ Live API test complete!\n');
}

// ============================================================================
// EXAMPLE 3: Embeddings
// ============================================================================

async function demonstrateEmbeddings() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('EXAMPLE 3: Embeddings');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { GoogleGenAI } = await import('@google/genai');

  let client: InstanceType<typeof GoogleGenAI>;

  if (USE_VERTEX_AI && GOOGLE_CLOUD_PROJECT) {
    client = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: GOOGLE_CLOUD_LOCATION,
    });
  } else if (GOOGLE_API_KEY) {
    client = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
  } else {
    console.error('❌ No credentials available');
    return;
  }

  console.log('🔢 Generating embeddings...\n');

  const result = await client.models.embedContent({
    model: 'text-embedding-005',
    contents: [{ parts: [{ text: 'I want to learn meditation and mindfulness' }] }],
  });

  const embedding = result.embeddings?.[0]?.values;
  if (embedding) {
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).map((v) => v.toFixed(4)).join(', ')}...]`);
  }

  console.log('\n✅ Embeddings test complete!\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 Gemini + Vertex AI Connection Examples\n');

  const args = process.argv.slice(2);
  const testLive = args.includes('--live');

  try {
    // Always run standard API test
    await demonstrateStandardAPI();

    // Run embeddings test
    await demonstrateEmbeddings();

    // Optionally run Live API test
    if (testLive) {
      await demonstrateLiveAPI();
    } else {
      console.log('💡 Tip: Run with --live flag to test Live API streaming\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('All tests complete!');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
