#!/usr/bin/env npx tsx
/**
 * LiveKit Native SIP Outbound Call Test
 *
 * This is the CORRECT way to do two-way conversational calls:
 * 1. Create a LiveKit room
 * 2. Start Ferni agent in the room
 * 3. Use SipClient.createSipParticipant to dial out
 * 4. Phone joins room as participant
 * 5. Ferni and phone caller can talk!
 *
 * @module scripts/test-livekit-sip-call
 */

import 'dotenv/config';
import { SipClient, RoomServiceClient } from 'livekit-server-sdk';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Your outbound SIP trunk ID from LiveKit
const SIP_TRUNK_ID = 'ST_FCiQRLuvhYzx';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ Missing LiveKit credentials');
  process.exit(1);
}

// ============================================================================
// MAIN
// ============================================================================

async function makeOutboundCall(phoneNumber: string) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      🎙️  LIVEKIT NATIVE SIP OUTBOUND CALL TEST  🎙️         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  // Clean phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

  console.log(`📞 Dialing: ${e164Phone}`);
  console.log(`📡 Using SIP Trunk: ${SIP_TRUNK_ID}`);

  // =========================================================================
  // STEP 1: Create a LiveKit room for this call
  // =========================================================================
  const roomName = `outbound_call_${Date.now()}`;
  console.log(`\n📦 Creating room: ${roomName}`);

  try {
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes
      maxParticipants: 3,
      metadata: JSON.stringify({
        type: 'outbound_call',
        phone: e164Phone,
        persona: 'ferni',
        purpose: 'Two-way conversational call test',
      }),
    });
    console.log('   ✅ Room created');
  } catch (error) {
    console.error(`   ❌ Failed to create room: ${error}`);
    return;
  }

  // =========================================================================
  // STEP 2: Dispatch Ferni agent to the room
  // =========================================================================
  console.log('\n🤖 Dispatching Ferni agent...');

  try {
    const { AgentDispatchClient } = await import('livekit-server-sdk');
    const dispatchClient = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    // Dispatch our voice agent to the room
    await dispatchClient.createDispatch(roomName, 'voice-agent', {
      metadata: JSON.stringify({
        type: 'outbound_call',
        phone: e164Phone,
        purpose: 'Friendly check-in call',
        objective: 'Have a natural conversation',
        callType: 'personal',
      }),
    });

    console.log('   ✅ Ferni agent dispatched');

    // Wait a moment for agent to join
    console.log('   ⏳ Waiting for agent to join...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    console.error(`   ⚠️ Agent dispatch failed: ${error}`);
    console.log('   Continuing anyway - agent might join via auto-dispatch...');
  }

  // =========================================================================
  // STEP 3: Dial out using SIP
  // =========================================================================
  console.log(`\n📱 Dialing ${e164Phone} via LiveKit SIP...`);

  try {
    const sipParticipant = await sipClient.createSipParticipant(
      SIP_TRUNK_ID,
      e164Phone,
      roomName,
      {
        participantIdentity: `phone_${cleanPhone}`,
        participantName: 'Phone Caller',
        playDialtone: true, // Play ringback tone while dialing
        waitUntilAnswered: false, // Don't wait - return immediately
        ringingTimeout: 30, // Ring for 30 seconds max
        maxCallDuration: 300, // 5 minute max call
      }
    );

    console.log('   ✅ SIP participant created!');
    console.log(`   Participant ID: ${sipParticipant.participantId}`);
    console.log(`   Participant Identity: ${sipParticipant.participantIdentity}`);
    console.log(`   SIP Call ID: ${sipParticipant.sipCallId}`);
    console.log(`   Call Status: ${sipParticipant.callStatus}`);

    console.log('\n🎉 SUCCESS! Your phone should be ringing now.');
    console.log('   When you answer, Ferni will greet you and you can have a conversation!');
    console.log(`\n📊 Room: ${roomName}`);
    console.log('   Monitor at: https://cloud.livekit.io/');

    return { success: true, roomName, sipParticipant };
  } catch (error: unknown) {
    console.error(`   ❌ SIP dial failed: ${error}`);

    // Check if it's a SIP configuration error
    if (String(error).includes('trunk') || String(error).includes('SIP')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   1. Check your SIP trunk configuration in LiveKit Cloud');
      console.log('   2. Ensure Twilio Elastic SIP Trunking is set up');
      console.log('   3. Verify the trunk address and authentication');
    }

    // Clean up the room
    try {
      await roomService.deleteRoom(roomName);
      console.log(`   🧹 Cleaned up room: ${roomName}`);
    } catch {
      // Ignore cleanup errors
    }

    return { success: false, error: String(error) };
  }
}

// ============================================================================
// CLI
// ============================================================================

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.log('Usage: npx tsx scripts/test-livekit-sip-call.ts <phone-number>');
  console.log('');
  console.log('Example:');
  console.log('  npx tsx scripts/test-livekit-sip-call.ts 8012017497');
  process.exit(1);
}

makeOutboundCall(phoneNumber).catch(console.error);
