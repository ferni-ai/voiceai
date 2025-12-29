#!/usr/bin/env npx tsx
/**
 * Two-Way Conversational Call Test Script
 *
 * Tests the full E2E flow of two-way conversational calls:
 * 1. Twilio makes the outbound call
 * 2. Audio streams via WebSocket to our bridge
 * 3. Bridge connects to LiveKit room with intelligent agent
 * 4. Agent responds in real-time using Cartesia TTS
 *
 * Usage:
 *   npx tsx scripts/test-two-way-call.ts <phone-number> [--test-type=<type>]
 *
 * Examples:
 *   npx tsx scripts/test-two-way-call.ts 8012017497
 *   npx tsx scripts/test-two-way-call.ts 8012017497 --test-type=appointment
 *   npx tsx scripts/test-two-way-call.ts 8012017497 --test-type=checkin
 *
 * @module scripts/test-two-way-call
 */

import 'dotenv/config';
import { generatePersonaVoice, uploadAudioToGCS } from '../src/services/voice/voice-call.js';

// Configuration check
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_STREAM_WEBHOOK_URL = process.env.TWILIO_STREAM_WEBHOOK_URL;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

function checkConfiguration(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN');
  if (!TWILIO_PHONE_NUMBER) missing.push('TWILIO_PHONE_NUMBER');
  if (!TWILIO_STREAM_WEBHOOK_URL) missing.push('TWILIO_STREAM_WEBHOOK_URL');
  if (!LIVEKIT_URL) missing.push('LIVEKIT_URL');
  if (!LIVEKIT_API_KEY) missing.push('LIVEKIT_API_KEY');
  if (!LIVEKIT_API_SECRET) missing.push('LIVEKIT_API_SECRET');

  return { ok: missing.length === 0, missing };
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

interface TestScenario {
  name: string;
  description: string;
  purpose: string;
  objective: string;
  callType: 'business' | 'personal' | 'emergency';
  recipientName: string;
  greeting?: string;
  context?: Record<string, unknown>;
}

const TEST_SCENARIOS: Record<string, TestScenario> = {
  appointment: {
    name: 'Doctor Appointment Scheduling',
    description: 'Test scheduling an appointment with a doctor\'s office',
    purpose: 'Schedule a checkup appointment',
    objective: 'Get an appointment scheduled for a routine checkup next week',
    callType: 'business',
    recipientName: 'the receptionist',
    greeting: "Hi, I'm calling to schedule an appointment for Seth Ford.",
    context: {
      preferredTimes: ['morning', 'early afternoon'],
      appointmentType: 'annual checkup',
    },
  },

  checkin: {
    name: 'Personal Check-in',
    description: 'Test making a personal check-in call',
    purpose: 'Check in and say hello',
    objective: 'Have a brief friendly conversation',
    callType: 'personal',
    recipientName: 'Seth',
    greeting: "Hey! It's Ferni. Just calling to check in and see how you're doing.",
    context: {},
  },

  followup: {
    name: 'Follow-up Call',
    description: 'Test making a follow-up call about a previous conversation',
    purpose: 'Follow up on our last conversation',
    objective: 'Check on how things are going since we last spoke',
    callType: 'personal',
    recipientName: 'Seth',
    greeting: "Hi Seth! Ferni here. I wanted to follow up on our last conversation.",
    context: {
      previousTopic: 'work-life balance',
    },
  },

  reminder: {
    name: 'Reminder Call',
    description: 'Test making a reminder call about an upcoming event',
    purpose: 'Remind about an upcoming event',
    objective: 'Make sure they remember the event and are prepared',
    callType: 'personal',
    recipientName: 'Seth',
    greeting: "Hey Seth! Just a quick reminder about your meeting tomorrow.",
    context: {
      event: 'Team meeting',
      time: 'tomorrow at 10am',
    },
  },

  simple: {
    name: 'Simple Test',
    description: 'Basic test to verify the system is working',
    purpose: 'Test the two-way call system',
    objective: 'Have a brief conversation to test audio quality and responsiveness',
    callType: 'personal',
    recipientName: 'you',
    greeting: "Hi! This is Ferni testing the two-way call system. Can you hear me clearly?",
    context: {},
  },
};

// ============================================================================
// CALL INITIATOR
// ============================================================================

async function makeConversationalCall(
  phone: string,
  scenario: TestScenario,
  userId = 'test-user'
): Promise<{ success: boolean; callSid?: string; roomName?: string; error?: string }> {
  const cleanPhone = phone.replace(/\D/g, '');
  const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

  const callId = `test_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const roomName = `call_${callId}`;

  console.log('\n📞 Initiating two-way conversational call...');
  console.log(`   Phone: ${e164Phone}`);
  console.log(`   Scenario: ${scenario.name}`);
  console.log(`   Room: ${roomName}`);

  // Generate TwiML for the call
  // This TwiML will:
  // 1. Play Ferni's greeting using Cartesia TTS (NOT Polly!)
  // 2. Stream audio to our WebSocket bridge
  // 3. Connect to LiveKit room with intelligent agent

  // Generate Ferni's greeting with Cartesia TTS
  const greetingText = scenario.greeting || `Hey ${scenario.recipientName}! It's Ferni. Just a second while I connect.`;
  console.log(`   Generating Ferni's greeting: "${greetingText}"`);

  let greetingAudioUrl: string | null = null;
  try {
    const audioBuffer = await generatePersonaVoice(greetingText, 'ferni');
    if (audioBuffer) {
      const filename = `ferni-greeting-${callId}.mp3`;
      greetingAudioUrl = await uploadAudioToGCS(audioBuffer, filename);
      console.log(`   ✅ Ferni greeting audio ready: ${greetingAudioUrl}`);
    }
  } catch (err) {
    console.warn(`   ⚠️ Could not generate Ferni audio: ${err}`);
  }

  // Build TwiML - use <Play> for Ferni voice or fallback to <Say>
  const greetingElement = greetingAudioUrl
    ? `<Play>${escapeXml(greetingAudioUrl)}</Play>`
    : `<Say voice="Polly.Joanna">${escapeXml(greetingText)}</Say>`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingElement}
  <Pause length="0.3"/>
  <Connect>
    <Stream url="${TWILIO_STREAM_WEBHOOK_URL}">
      <Parameter name="roomName" value="${roomName}"/>
      <Parameter name="callId" value="${callId}"/>
      <Parameter name="userId" value="${userId}"/>
      <Parameter name="purpose" value="${scenario.purpose}"/>
      <Parameter name="objective" value="${scenario.objective}"/>
      <Parameter name="callType" value="${scenario.callType}"/>
      <Parameter name="recipientName" value="${scenario.recipientName}"/>
    </Stream>
  </Connect>
</Response>`;

  try {
    // Make the call via Twilio
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: e164Phone,
          From: TWILIO_PHONE_NUMBER!,
          Twiml: twiml,
          MachineDetection: 'Enable',
          MachineDetectionTimeout: '5',
          StatusCallback: `${TWILIO_STREAM_WEBHOOK_URL?.replace('/stream', '/status')}`,
          StatusCallbackEvent: 'initiated ringing answered completed',
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Twilio API error: ${error}`);
      return { success: false, error };
    }

    const callData = (await response.json()) as { sid: string; status: string };

    console.log(`   ✅ Call initiated!`);
    console.log(`   Call SID: ${callData.sid}`);
    console.log(`   Status: ${callData.status}`);

    return {
      success: true,
      callSid: callData.sid,
      roomName,
    };
  } catch (error) {
    console.error(`   ❌ Error: ${error}`);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        🎙️  TWO-WAY CONVERSATIONAL CALL TEST  🎙️            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Check configuration
  console.log('\n📋 Checking configuration...');
  const config = checkConfiguration();
  if (!config.ok) {
    console.error(`\n❌ Missing required environment variables:`);
    config.missing.forEach((name) => console.error(`   - ${name}`));
    console.log('\nPlease set these in your .env file and try again.');
    process.exit(1);
  }
  console.log('   ✅ All required environment variables set');

  // Parse arguments
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.log('\n📚 Usage:');
    console.log('   npx tsx scripts/test-two-way-call.ts <phone-number> [--test-type=<type>]');
    console.log('\n🧪 Available test types:');
    Object.entries(TEST_SCENARIOS).forEach(([key, scenario]) => {
      console.log(`   ${key.padEnd(12)} - ${scenario.description}`);
    });
    console.log('\n📞 Example:');
    console.log('   npx tsx scripts/test-two-way-call.ts 8012017497 --test-type=checkin');
    process.exit(0);
  }

  const phone = args[0];
  const testTypeArg = args.find((a) => a.startsWith('--test-type='));
  const testType = testTypeArg ? testTypeArg.split('=')[1] : 'simple';

  const scenario = TEST_SCENARIOS[testType];
  if (!scenario) {
    console.error(`\n❌ Unknown test type: ${testType}`);
    console.log('Available types:', Object.keys(TEST_SCENARIOS).join(', '));
    process.exit(1);
  }

  console.log(`\n🧪 Test Scenario: ${scenario.name}`);
  console.log(`   ${scenario.description}`);
  console.log(`   Purpose: ${scenario.purpose}`);
  console.log(`   Objective: ${scenario.objective}`);

  // Make the call
  const result = await makeConversationalCall(phone, scenario);

  if (result.success) {
    console.log('\n✅ Two-way call initiated successfully!');
    console.log('\n📱 Your phone should ring now.');
    console.log('   When you answer, Ferni will speak and you can have a conversation.');
    console.log(`\n🔗 LiveKit Room: ${result.roomName}`);
    console.log(`   Call SID: ${result.callSid}`);
    console.log('\n💡 The intelligent agent is now handling the conversation.');
    console.log('   Audio is being streamed bidirectionally via Twilio + LiveKit.');
  } else {
    console.log('\n❌ Failed to initiate call');
    console.log(`   Error: ${result.error}`);
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Run
main().catch(console.error);
