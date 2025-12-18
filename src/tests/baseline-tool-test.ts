/**
 * Baseline Tool Calling Test
 *
 * Minimal setup to verify Gemini tool calling works:
 * - Simple system prompt
 * - Just 3 tools: playMusic, getCurrentTime, remember
 * - No orchestrator, no complex context
 */

import * as google from '@livekit/agents-plugin-google';
import * as genai from '@google/genai';
import { llm } from '@livekit/agents';
import { z } from 'zod';

const SIMPLE_SYSTEM_PROMPT = `You are Ferni, a friendly AI assistant.

IMPORTANT TOOL USAGE RULES:
1. When the user asks to play music, you MUST call the playMusic tool
2. When the user asks what time it is, you MUST call the getCurrentTime tool  
3. When the user asks you to remember something, you MUST call the remember tool

After calling a tool, respond naturally with the result.

Example:
User: "Play some jazz music"
Action: Call playMusic with query="jazz music"
Response: "Playing some smooth jazz for you!"

User: "What time is it?"
Action: Call getCurrentTime
Response: "It's currently 3:45 PM"
`;

// Simple tools - minimal parameters
const BASELINE_TOOLS = {
  playMusic: llm.tool({
    description:
      'Play music for the user. Call this when user asks to play, start, or listen to music.',
    parameters: z.object({
      query: z.string().describe('What music to play - artist, song, genre, or mood'),
    }),
    execute: async ({ query }) => {
      console.log(`\n🎵 [TOOL CALLED] playMusic with query: "${query}"`);
      return JSON.stringify({
        success: true,
        message: `Now playing: ${query}`,
        track: `${query} - Sample Track`,
      });
    },
  }),

  getCurrentTime: llm.tool({
    description: 'Get the current time. Call this when user asks what time it is.',
    parameters: z.object({}),
    execute: async () => {
      const time = new Date().toLocaleTimeString();
      console.log(`\n⏰ [TOOL CALLED] getCurrentTime - returning: ${time}`);
      return JSON.stringify({ time, timezone: 'local' });
    },
  }),

  remember: llm.tool({
    description: 'Remember something important about the user for future reference.',
    parameters: z.object({
      fact: z.string().describe('The fact to remember about the user'),
    }),
    execute: async ({ fact }) => {
      console.log(`\n🧠 [TOOL CALLED] remember with fact: "${fact}"`);
      return JSON.stringify({ success: true, message: `I'll remember that: ${fact}` });
    },
  }),
};

async function testGeminiToolCalling() {
  console.log('='.repeat(60));
  console.log('BASELINE TOOL CALLING TEST');
  console.log('='.repeat(60));
  console.log('\nSystem Prompt (simplified):');
  console.log(SIMPLE_SYSTEM_PROMPT.slice(0, 200) + '...\n');

  console.log('Tools registered:');
  for (const [name, tool] of Object.entries(BASELINE_TOOLS)) {
    const t = tool as { description?: string };
    console.log(`  - ${name}: ${t.description?.slice(0, 60)}...`);
  }

  // Create the Gemini model with toolChoice: 'auto'
  const model = new google.beta.realtime.RealtimeModel({
    model: 'gemini-2.0-flash-exp',
    modalities: [genai.Modality.TEXT],
    temperature: 0.3, // Low for deterministic tool calling
    language: 'en-US',
    toolChoice: 'auto',
  });

  console.log('\n✅ Model created with:');
  console.log('   - model: gemini-2.0-flash-exp');
  console.log('   - temperature: 0.3');
  console.log('   - toolChoice: auto');

  // Check if toolChoice is in options
  const modelOptions = (model as unknown as { options?: Record<string, unknown> }).options;
  console.log('\n📋 Model options check:');
  console.log('   - toolChoice stored:', modelOptions?.toolChoice);

  console.log('\n' + '='.repeat(60));
  console.log('TEST PROMPTS TO TRY:');
  console.log('='.repeat(60));
  console.log('1. "Play some jazz music"');
  console.log('2. "What time is it?"');
  console.log('3. "Remember that my favorite color is blue"');
  console.log('4. "Put on some relaxing music for studying"');
  console.log('\nTo test: Start the voice agent and say these phrases.');
  console.log('Watch the logs for [TOOL CALLED] messages.\n');

  // Export for use in voice agent
  return { model, tools: BASELINE_TOOLS, systemPrompt: SIMPLE_SYSTEM_PROMPT };
}

// Run if executed directly
testGeminiToolCalling().catch(console.error);

export { BASELINE_TOOLS, SIMPLE_SYSTEM_PROMPT, testGeminiToolCalling };
