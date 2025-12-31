/**
 * Outbound Call Agent
 *
 * A conversational agent for two-way outbound calls.
 *
 * ARCHITECTURE:
 * - TwilioStreamBridge handles audio I/O and transcription
 * - This agent handles conversation logic:
 *   - Listens for transcript events from bridge
 *   - Generates responses with Gemini
 *   - Speaks responses with Cartesia TTS
 *   - Sends audio back through bridge to Twilio
 *
 * FLOW:
 * 1. Bridge emits 'transcript' event with what caller said
 * 2. Agent generates response with Gemini
 * 3. Agent synthesizes speech with Cartesia
 * 4. Audio sent back through bridge → Twilio → phone
 *
 * @module outbound-call-agent
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from '../../utils/safe-logger.js';
import { getVoiceId } from '../../personas/voice-registry.js';
import { CARTESIA_MODEL } from '../../config/voice-ids.js';
import type { TwilioStreamBridge } from './twilio-stream-bridge.js';

const log = createLogger({ module: 'outbound-call-agent' });

// Environment
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

// Audio config - Twilio expects 8kHz μ-law, but we generate 24kHz PCM then downsample
const SAMPLE_RATE = 24000;

// ============================================================================
// TYPES
// ============================================================================

export interface OutboundCallContext {
  roomName: string;
  callId: string;
  recipientName: string;
  purpose: string;
  objective: string;
  callType: 'personal' | 'business' | 'emergency';
  userId?: string;
  userName?: string;
}

interface ConversationState {
  context: OutboundCallContext;
  callSid: string;
  history: Array<{ role: 'user' | 'model'; content: string }>;
  turnCount: number;
  isRunning: boolean;
  gemini: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
}

// Active conversations
const activeConversations = new Map<string, ConversationState>();

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Start the outbound call agent for a call
 *
 * @param context - Call context (recipient, purpose, etc.)
 * @param bridge - The Twilio Stream Bridge instance
 * @param callSid - The Twilio call SID
 */
export async function startOutboundAgent(
  context: OutboundCallContext,
  bridge: TwilioStreamBridge,
  callSid: string
): Promise<void> {
  log.info({ callSid, recipientName: context.recipientName }, '🎙️ Starting outbound call agent');

  if (!CARTESIA_API_KEY) {
    log.error('Cartesia API key not configured');
    return;
  }

  if (!GEMINI_API_KEY) {
    log.error('Gemini API key not configured');
    return;
  }

  // Set up Gemini
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    systemInstruction: buildSystemPrompt(context),
  });

  // Create conversation state
  const state: ConversationState = {
    context,
    callSid,
    history: [],
    turnCount: 0,
    isRunning: true,
    gemini,
  };

  activeConversations.set(callSid, state);

  // Set up event listeners
  const handleTranscript = async (event: {
    callSid: string;
    transcript: string;
    durationMs: number;
  }) => {
    if (event.callSid !== callSid || !state.isRunning) return;
    await handleUserSpeech(state, bridge, event.transcript);
  };

  const handleCallEnd = (event: { callSid: string }) => {
    if (event.callSid !== callSid) return;
    log.info({ callSid }, '📴 Call ended');
    state.isRunning = false;
    cleanup();
  };

  const cleanup = () => {
    bridge.off('transcript', handleTranscript);
    bridge.off('callEnded', handleCallEnd);
    activeConversations.delete(callSid);
  };

  bridge.on('transcript', handleTranscript);
  bridge.on('callEnded', handleCallEnd);

  // Small delay then speak greeting
  await sleep(800);

  // Speak dynamic greeting
  const greeting = buildDynamicGreeting(context);
  log.info({ greeting: greeting.substring(0, 50) }, '🗣️ Speaking greeting');
  await speakToCaller(state, bridge, greeting);

  log.info({ callSid }, '✅ Outbound agent ready for conversation');
}

// ============================================================================
// CONVERSATION HANDLING
// ============================================================================

/**
 * Handle user speech (transcript from bridge)
 */
async function handleUserSpeech(
  state: ConversationState,
  bridge: TwilioStreamBridge,
  transcript: string
): Promise<void> {
  if (!transcript.trim()) return;

  state.turnCount++;
  log.info({ turnCount: state.turnCount, transcript: transcript.substring(0, 50) }, '👂 User said');

  // Add to history
  state.history.push({ role: 'user', content: transcript });

  // Generate response
  const response = await generateResponse(state, transcript);

  if (response && state.isRunning) {
    log.info({ response: response.substring(0, 50) }, '💬 Ferni responding');

    // Add to history
    state.history.push({ role: 'model', content: response });

    // Speak response
    await speakToCaller(state, bridge, response);

    // Check for conversation end
    if (shouldEndConversation(response, transcript)) {
      log.info('👋 Conversation naturally ending');
      await sleep(1000);
      state.isRunning = false;
    }
  }
}

// ============================================================================
// RESPONSE GENERATION
// ============================================================================

async function generateResponse(state: ConversationState, userInput: string): Promise<string> {
  try {
    // Build conversation context
    const history = state.history.slice(-10); // Last 10 exchanges

    const prompt =
      history.length > 1
        ? `Previous conversation:\n${history
            .slice(0, -1)
            .map((h) => `${h.role === 'user' ? 'Them' : 'You'}: ${h.content}`)
            .join(
              '\n'
            )}\n\nThey just said: "${userInput}"\n\nRespond naturally and concisely (2-3 sentences max):`
        : `They just said: "${userInput}"\n\nRespond naturally and concisely (2-3 sentences max):`;

    const result = await state.gemini.generateContent(prompt);
    const response = result.response.text();

    // Clean up response
    return response
      .replace(/^(You|Ferni|Assistant):\s*/i, '')
      .replace(/\*[^*]+\*/g, '') // Remove asterisk actions
      .trim();
  } catch (error) {
    log.error({ error: String(error) }, 'Gemini response generation failed');
    return "I'm sorry, I missed that... could you say that again?";
  }
}

// ============================================================================
// SPEECH SYNTHESIS & AUDIO OUTPUT
// ============================================================================

/**
 * Speak to the caller using Cartesia TTS, sending audio through the bridge
 */
async function speakToCaller(
  state: ConversationState,
  bridge: TwilioStreamBridge,
  text: string
): Promise<void> {
  if (!text || !state.isRunning) return;

  // Mark agent as speaking (bridge will stop collecting user audio)
  bridge.setAgentSpeaking(state.callSid, true);

  log.info({ text: text.substring(0, 50) + (text.length > 50 ? '...' : '') }, '🗣️ Speaking');

  try {
    const voiceId = getVoiceId('ferni');
    const modelId = CARTESIA_MODEL;

    // Generate audio with Cartesia (24kHz PCM)
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-06-10',
        'X-API-Key': CARTESIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: modelId,
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: SAMPLE_RATE,
        },
        language: 'en',
        // Natural pacing with warmth
        voice_experimental_controls: {
          speed: 'normal',
          emotion: ['positivity:high', 'curiosity:medium'],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ error: errorText }, 'Cartesia TTS failed');
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const pcmData = new Int16Array(arrayBuffer);

    const durationMs = Math.round((pcmData.length / SAMPLE_RATE) * 1000);
    log.info({ samples: pcmData.length, durationMs }, '📢 Sending audio to caller');

    // Downsample 24kHz → 8kHz for Twilio (simple 3:1 decimation)
    const pcm8k = downsample24to8(pcmData);

    // Convert to buffer and send to bridge
    const pcmBuffer = Buffer.from(pcm8k.buffer);

    // Send in chunks to maintain real-time pacing
    const chunkSize = 160; // 20ms at 8kHz
    for (let offset = 0; offset < pcm8k.length; offset += chunkSize) {
      if (!state.isRunning) break;

      const chunk = pcmBuffer.slice(
        offset * 2,
        Math.min((offset + chunkSize) * 2, pcmBuffer.length)
      );
      bridge.sendAudioToCaller(state.callSid, convert8kTo16kForBridge(chunk));

      // Pace the audio output (20ms chunks)
      await sleep(20);
    }

    // Small pause after speaking
    await sleep(200);

    log.info('✅ Finished speaking');
  } catch (error) {
    log.error({ error: String(error) }, 'Error speaking to caller');
  } finally {
    // Mark agent as done speaking
    bridge.setAgentSpeaking(state.callSid, false);
  }
}

/**
 * Downsample from 24kHz to 8kHz (3:1 decimation)
 */
function downsample24to8(input: Int16Array): Int16Array {
  const output = new Int16Array(Math.floor(input.length / 3));
  for (let i = 0; i < output.length; i++) {
    output[i] = input[i * 3];
  }
  return output;
}

/**
 * Convert 8kHz PCM to 16kHz for bridge (which expects 16kHz)
 * Simple 2x upsampling with linear interpolation
 */
function convert8kTo16kForBridge(input: Buffer): Buffer {
  const samples = input.length / 2;
  const output = Buffer.alloc(samples * 4); // 2x samples, 2 bytes each

  for (let i = 0; i < samples - 1; i++) {
    const s1 = input.readInt16LE(i * 2);
    const s2 = input.readInt16LE((i + 1) * 2);

    output.writeInt16LE(s1, i * 4);
    output.writeInt16LE(Math.round((s1 + s2) / 2), i * 4 + 2);
  }

  // Last sample
  if (samples > 0) {
    const last = input.readInt16LE((samples - 1) * 2);
    output.writeInt16LE(last, (samples - 1) * 4);
    output.writeInt16LE(last, (samples - 1) * 4 + 2);
  }

  return output;
}

// ============================================================================
// GREETING & PROMPTS
// ============================================================================

function buildDynamicGreeting(context: OutboundCallContext): string {
  const firstName = context.recipientName.split(' ')[0];
  const userName = context.userName || 'your friend';

  // Time-aware greeting
  const hour = new Date().getHours();
  let timeGreeting = '';
  if (hour < 12) {
    timeGreeting = 'morning';
  } else if (hour < 17) {
    timeGreeting = 'afternoon';
  } else {
    timeGreeting = 'evening';
  }

  // Build natural, human-like greeting based on call type
  if (context.callType === 'personal') {
    // Personal calls are warm and casual with natural pauses
    const greetings = [
      `Hey ${firstName}!... It's Ferni... I'm calling on behalf of ${userName}...`,
      `Hi ${firstName}!... good ${timeGreeting}... this is Ferni, ${userName}'s friend...`,
      `${firstName}! Hey... it's Ferni here... calling for ${userName}...`,
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    // Add purpose naturally
    if (context.purpose) {
      return greeting + ` ${context.purpose}`;
    }
    return greeting;
  } else if (context.callType === 'business') {
    // Business calls are professional but still warm
    return `Hi, good ${timeGreeting}... this is Ferni calling on behalf of ${userName}... ${context.purpose || 'I was hoping to connect briefly.'}`;
  } else {
    // Emergency - clear and direct
    return `Hi ${firstName}, this is Ferni... I'm calling on behalf of ${userName}. ${context.purpose || "It's important we connect."}`;
  }
}

function buildSystemPrompt(context: OutboundCallContext): string {
  return `You are Ferni, a warm and friendly AI life coach making a phone call on behalf of ${context.userName || 'your user'}.

CALL CONTEXT:
- Calling: ${context.recipientName}
- Purpose: ${context.purpose}
- Objective: ${context.objective}
- Call type: ${context.callType}

YOUR VOICE & PERSONALITY:
- Warm, genuine, present, and upbeat
- Natural phone conversation style - like calling a friend
- Uses natural pauses ("...")
- Occasional filler words ("um", "so", "well", "anyway")
- Reacts to what they say before responding
- Uses their name occasionally
- Sounds like you're smiling!

PHONE CONVERSATION RULES:
1. Keep responses SHORT (1-3 sentences max) - it's a phone call!
2. Ask questions to keep them engaged
3. React first, then respond ("Oh that's great!", "I see...", "Hmm...")
4. Use natural transitions ("so...", "anyway...", "oh, and...")
5. Laugh naturally when appropriate ("haha", "ha")
6. Mirror their energy level

END THE CALL GRACEFULLY WHEN:
- The objective is achieved
- They need to go ("I gotta run", "I'm busy")
- They're clearly not interested
- It's been a few exchanges and feels complete

Always end warmly: "Thanks so much for chatting!", "Great talking with you!", "Take care!"`;
}

// ============================================================================
// HELPERS
// ============================================================================

function shouldEndConversation(agentResponse: string, userInput: string): boolean {
  const endPhrases = [
    'bye',
    'goodbye',
    'talk later',
    'gotta go',
    'have to go',
    'thanks for calling',
    'take care',
    'catch you later',
    'talk soon',
    'nice chatting',
  ];

  const combined = (agentResponse + ' ' + userInput).toLowerCase();
  return endPhrases.some((phrase) => combined.includes(phrase));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { startOutboundAgent as default };
