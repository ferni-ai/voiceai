#!/usr/bin/env npx tsx
/**
 * Test script to directly test Gemini Live API function calling
 * This bypasses LiveKit to isolate the issue
 */

import { GoogleGenAI, Modality } from '@google/genai';
import 'dotenv/config';

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('Missing GOOGLE_API_KEY environment variable');
  process.exit(1);
}

// Simple test functions
const playMusic = {
  name: 'playMusic',
  description:
    'Play music for the user. Invoke this when the user asks to play music, a song, or a genre.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The music query (song, artist, genre, or mood)',
      },
    },
    required: ['query'],
  },
};

const getWeather = {
  name: 'getWeather',
  description: 'Get current weather information. Invoke this when the user asks about weather.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The location to get weather for (optional, defaults to user location)',
      },
    },
  },
};

const tools = [{ functionDeclarations: [playMusic, getWeather] }];

async function main() {
  console.log('🧪 Testing Gemini Live API Function Calling');
  console.log('============================================\n');

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = 'gemini-2.0-flash-exp'; // Using available Live API model

  const config = {
    responseModalities: [Modality.TEXT], // Text only for this test
    tools: tools,
    systemInstruction: {
      parts: [
        {
          text: `You are a helpful assistant with access to tools.

When the user asks to play music, USE the playMusic function - do NOT output the function call as text.
When the user asks about weather, USE the getWeather function - do NOT output the function call as text.

IMPORTANT: Function calls are API-level operations. Do NOT output them as text in brackets or JSON.`,
        },
      ],
    },
  };

  console.log('📋 Config:', JSON.stringify(config, null, 2));
  console.log('\n🔌 Connecting to Gemini Live API...\n');

  const responseQueue: any[] = [];

  const session = await ai.live.connect({
    model: model,
    callbacks: {
      onopen: () => {
        console.log('✅ Connected to Gemini Live API');
      },
      onmessage: (message: any) => {
        responseQueue.push(message);

        // Log what we receive
        if (message.serverContent?.modelTurn?.parts) {
          for (const part of message.serverContent.modelTurn.parts) {
            if (part.text) {
              console.log(`📝 TEXT: "${part.text}"`);
              if (part.text.includes('[') || part.text.includes('{')) {
                console.log(
                  '   ⚠️ WARNING: Text contains bracket/brace - possible leaked function call!'
                );
              }
            }
          }
        }
        if (message.toolCall) {
          console.log('🎯 TOOL CALL:', JSON.stringify(message.toolCall, null, 2));
        }
        if (message.serverContent?.turnComplete) {
          console.log('✅ Turn complete\n');
        }
      },
      onerror: (e: any) => {
        console.error('❌ Error:', e.message);
      },
      onclose: (e: any) => {
        console.log('🔌 Closed:', e.reason);
      },
    },
    config: config,
  });

  // Test prompts
  const testPrompts = ['Play some jazz music for me', 'What is the weather like today?'];

  for (const prompt of testPrompts) {
    console.log(`\n🗣️ User: "${prompt}"\n`);

    session.sendClientContent({
      turns: { role: 'user', parts: [{ text: prompt }] },
      turnComplete: true,
    });

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check if we got a tool call
    const gotToolCall = responseQueue.some((m) => m.toolCall);
    if (gotToolCall) {
      console.log('✅ SUCCESS: Received proper tool call event!');

      // Send tool response
      const toolCallMsg = responseQueue.find((m) => m.toolCall);
      if (toolCallMsg?.toolCall?.functionCalls) {
        for (const fc of toolCallMsg.toolCall.functionCalls) {
          console.log(`   Responding to ${fc.name}...`);
          session.sendToolResponse({
            functionResponses: [
              {
                id: fc.id,
                name: fc.name,
                response: { result: 'ok', message: `${fc.name} executed successfully` },
              },
            ],
          });
        }
        // Wait for model to respond to tool result
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } else {
      console.log('❌ FAILURE: No tool call event - function call may have leaked to text');
    }

    responseQueue.length = 0; // Clear for next test
  }

  session.close();
  console.log('\n✅ Test complete');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
