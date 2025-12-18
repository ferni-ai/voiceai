/**
 * Baseline Voice Agent - 3 Tools Test (MINIMAL)
 *
 * Testing absolute minimum setup for tool calling.
 * Uses simple system prompt + only 3 tools.
 *
 * Run with: LOG_LEVEL=debug npx tsx src/agents/baseline-agent.ts dev
 */

import * as genai from '@google/genai';
import { cli, defineAgent, llm, ServerOptions, voice } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import 'dotenv/config';
import { z } from 'zod';

// ============================================================================
// SIMPLE SYSTEM PROMPT (same as before)
// ============================================================================
const SYSTEM_PROMPT = `You are Ferni, a friendly AI assistant who helps with music and remembering things.

## TOOL CALLING RULES - CRITICAL

When the user asks for something that requires a tool, you MUST:
1. Call the appropriate tool FIRST
2. Wait for the result
3. Then respond naturally with the result

### Music Requests
When user says anything like "play music", "put on some tunes", "I want to hear jazz":
→ CALL playMusic tool with the query
→ Then say something like "Playing that for you now!"

### Time Requests  
When user asks "what time is it", "what's the time":
→ CALL getCurrentTime tool
→ Then tell them the time naturally

### Remember Requests
When user says "remember that...", "don't forget...":
→ CALL remember tool with the fact
→ Then confirm you'll remember it

DO NOT just talk about doing these things - actually CALL the tool!
`;

// ============================================================================
// TEST TOOLS - ONLY 3 TOOLS (minimal setup)
// ============================================================================

const tools = {
  // === REAL TOOLS (3) ===
  playMusic: llm.tool({
    description:
      'Play music for the user. MUST be called when user asks to play, start, or listen to any music.',
    parameters: z.object({
      query: z.string().describe('What to play - song, artist, genre, or mood'),
    }),
    execute: async ({ query }) => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🎵 TOOL EXECUTED: playMusic`);
      console.log(`   Query: "${query}"`);
      console.log(`${'='.repeat(50)}\n`);
      return JSON.stringify({
        success: true,
        nowPlaying: `${query} - Playing now`,
        message: `Started playing ${query}`,
      });
    },
  }),

  getCurrentTime: llm.tool({
    description: 'Get the current time. MUST be called when user asks what time it is.',
    parameters: z.object({}),
    execute: async () => {
      const time = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      console.log(`\n${'='.repeat(50)}`);
      console.log(`⏰ TOOL EXECUTED: getCurrentTime`);
      console.log(`   Time: ${time}`);
      console.log(`${'='.repeat(50)}\n`);
      return JSON.stringify({ time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    },
  }),

  remember: llm.tool({
    description:
      'Remember a fact about the user. MUST be called when user asks to remember something.',
    parameters: z.object({
      fact: z.string().describe('The fact to remember'),
    }),
    execute: async ({ fact }) => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🧠 TOOL EXECUTED: remember`);
      console.log(`   Fact: "${fact}"`);
      console.log(`${'='.repeat(50)}\n`);
      return JSON.stringify({ success: true, remembered: fact });
    },
  }),

  // NOTE: Removed dummy tools - testing with only 3 tools
};

// ============================================================================
// BASELINE AGENT
// ============================================================================
class BaselineAgent extends voice.Agent {
  constructor() {
    super({
      instructions: SYSTEM_PROMPT,
      tools,
    });
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================
export default defineAgent({
  entry: async (ctx) => {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log('🚀 BASELINE AGENT - 3 TOOLS + toolChoice=REQUIRED');
      console.log('='.repeat(60));
      console.log('\nTesting with MINIMAL setup:');
      console.log('  Tools: playMusic, getCurrentTime, remember');
      console.log('  toolChoice: REQUIRED (forces function calls)');
      console.log('\nTest phrases:');
      console.log('  - "Play some jazz music"');
      console.log('  - "What time is it?"');
      console.log(`${'='.repeat(60)}\n`);

      await ctx.connect();

      console.log('[baseline-agent] Connected to room, waiting for participant...');

      const participant = await ctx.waitForParticipant();
      console.log(`[baseline-agent] Participant joined: ${participant.identity}`);

      console.log('[baseline-agent] Creating RealtimeModel...');

      // Create Gemini model - TEXT modality so Gemini outputs text (we use Cartesia TTS)
      let model;
      try {
        model = new google.beta.realtime.RealtimeModel({
          model: 'gemini-2.0-flash-exp',
          modalities: [genai.Modality.TEXT], // TEXT output - Gemini still handles STT internally
          temperature: 0.8,
          language: 'en-US',
          toolChoice: 'required', // Force tool calls - our patch adds support for this
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        console.log('[baseline-agent] ✅ RealtimeModel created with toolChoice=required');
      } catch (err) {
        console.error('[baseline-agent] ❌ RealtimeModel creation FAILED:', err);
        throw err;
      }

      // Create Cartesia TTS for audio output
      console.log('[baseline-agent] Creating Cartesia TTS...');
      const cartesia = await import('@livekit/agents-plugin-cartesia');
      const tts = new cartesia.TTS({
        model: 'sonic-3',
        voice: '248be419-c632-4f23-adf1-5324ed7dbf1d', // Ferni voice
        speed: 'normal',
        emotion: ['positivity:high'],
      });
      console.log('[baseline-agent] ✅ Cartesia TTS created');

      console.log('[baseline-agent] Model config:');
      console.log('  - model: gemini-2.0-flash-exp');
      console.log('  - modalities: TEXT (Gemini STT + text output)');
      console.log('  - temperature: 0.8');
      console.log('  - TTS: Cartesia sonic-2');
      console.log('  - toolChoice: REQUIRED (forces function calls)');

      // Create session with TTS
      const session = new voice.AgentSession({
        llm: model,
        tts: tts,
        voiceOptions: {
          allowInterruptions: true,
          minEndpointingDelay: 400,
        },
      });

      // Track transcripts
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event: unknown) => {
        const evt = event as { transcript?: string; isFinal?: boolean };
        if (evt.isFinal && evt.transcript) {
          console.log(`\n📝 USER SAID: "${evt.transcript}"`);
        }
      });

      // Track tool calls
      session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event: unknown) => {
        const toolEvent = event as { name?: string; toolName?: string };
        const toolName = toolEvent.name || toolEvent.toolName || 'unknown';
        console.log(`\n✅ TOOL CALLED: ${toolName}`);
      });

      // Track agent state changes
      session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event: unknown) => {
        const evt = event as { state?: string };
        console.log(`\n🤖 Agent state: ${evt.state}`);
      });

      // Create agent and start
      const agent = new BaselineAgent();
      try {
        console.log('[baseline-agent] Starting session...');
        await session.start({
          agent,
          room: ctx.room,
        });
        console.log('\n[baseline-agent] ✅ Session started - listening for voice...\n');
        // Greeting via Cartesia TTS
        session.say(
          'Hi! I can play music, tell you the time, or remember things. What would you like?'
        );
      } catch (error) {
        console.error('[baseline-agent] ❌ Session start FAILED:', error);
        throw error;
      }
    } catch (outerError) {
      console.error('[baseline-agent] ❌ OUTER ERROR in entry:', outerError);
      throw outerError;
    }
  },
});

// Run if executed directly
cli.runApp(new ServerOptions({ agent: './src/agents/baseline-agent.ts' }));
