/**
 * Run Intelligent Agent on Room
 * 
 * Standalone function to run the intelligent outbound agent on an existing room.
 * This allows the agent to be run without LiveKit dispatch.
 */

import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { voice } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as google from '@livekit/agents-plugin-google';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger('run-intelligent-agent');

interface CallMetadata {
  callId: string;
  purpose: string;
  contact: {
    name: string;
    phone: string;
    relationship: string;
  };
  user: {
    name: string;
    timezone: string;
  };
  script?: string;
}

/**
 * Run the intelligent agent directly on a room with a connected phone participant.
 */
export async function runIntelligentAgentOnRoom(
  room: Room,
  phoneParticipant: RemoteParticipant,
  metadata: CallMetadata
): Promise<void> {
  log.info({ callId: metadata.callId, contact: metadata.contact.name }, 'Starting intelligent agent');

  // Build system prompt
  const systemPrompt = buildSystemPrompt(metadata);
  
  // Create TTS - Ferni's voice
  const tts = new cartesia.TTS({
    apiKey: process.env.CARTESIA_API_KEY!,
    model: 'sonic-2',
    voice: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc', // Ferni voice ID
    sampleRate: 24000,
  });

  // Create LLM
  const llm = new google.beta.realtime.RealtimeModel({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: 'gemini-2.0-flash-exp',
    temperature: 0.8,
    instructions: systemPrompt,
  });

  log.info('Setting up voice agent session...');

  // Create agent session (modern API)
  const session = new voice.AgentSession({
    turnDetection: 'realtime_llm',
    llm,
    tts,
    minEndpointingDelay: 300,
    maxEndpointingDelay: 800,
  });

  // Start the agent session
  await session.start({
    room,
    participant: phoneParticipant,
  });
  log.info('Voice agent session started!');

  // Say initial greeting
  const greeting = metadata.script || `Hello! This is Ferni calling on behalf of ${metadata.user.name}. ${metadata.purpose}. How can I help you today?`;
  log.info({ greeting }, 'Speaking opening greeting');
  
  await session.say(greeting, { allowInterruptions: true });

  // Let the conversation run for a while
  log.info('Conversation active. Waiting for call to end...');
  
  // Wait until phone disconnects
  await new Promise<void>((resolve) => {
    const checkInterval = setInterval(() => {
      const stillConnected = [...room.remoteParticipants.values()].some(
        p => p.identity === phoneParticipant.identity
      );
      if (!stillConnected) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 5 * 60 * 1000);
  });

  log.info('Call ended');
}

function buildSystemPrompt(metadata: CallMetadata): string {
  return `You are Ferni, a warm and professional AI assistant making a phone call.

## Your Identity
- Name: Ferni
- Role: AI life coach assistant
- Voice: Warm, calm, professional
- Style: Conversational but purposeful

## Current Call Information
- Calling: ${metadata.contact.name} (${metadata.contact.relationship})
- On behalf of: ${metadata.user.name}
- Purpose: ${metadata.purpose}
- Time Zone: ${metadata.user.timezone}

## Call Guidelines
1. INTRODUCE yourself clearly: "Hi, this is Ferni calling on behalf of ${metadata.user.name}."
2. State the PURPOSE: "${metadata.purpose}"
3. Be POLITE and professional
4. If they can't help now, ask when to call back
5. THANK them for their time at the end

## Conversation Rules
- Keep responses CONCISE (2-3 sentences max)
- Listen carefully to their responses
- Ask clarifying questions if needed
- If they seem confused about AI calling, briefly explain you're an AI assistant
- If they want to hang up, say goodbye politely

## What NOT to do
- Don't ramble or give long explanations
- Don't be pushy
- Don't make promises you can't keep
- Don't share personal information about ${metadata.user.name}

Remember: Your goal is to help ${metadata.user.name} by completing this call successfully. Be efficient but warm.`;
}
