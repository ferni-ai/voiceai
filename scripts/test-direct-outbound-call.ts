#!/usr/bin/env npx tsx
/**
 * Direct Outbound Call Test
 * 
 * Creates a room, places SIP call, and runs the intelligent agent directly.
 * 
 * Usage:
 *   npx tsx scripts/test-direct-outbound-call.ts --phone 8012017497 --purpose "Test call"
 */

import 'dotenv/config';

// Initialize logger
import { initializeLogger } from '@livekit/agents';
initializeLogger({ pretty: true });

import { parseArgs } from 'util';
import { AccessToken, RoomServiceClient, SipClient } from 'livekit-server-sdk';
import { Room, RoomEvent, RemoteParticipant } from '@livekit/rtc-node';
import * as voice from '@livekit/agents';

// Parse arguments
const { values: args } = parseArgs({
  options: {
    phone: { type: 'string', short: 'p' },
    purpose: { type: 'string', default: 'Test outbound call' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (!args.phone) {
  console.log('Usage: npx tsx scripts/test-direct-outbound-call.ts --phone <number> [--purpose "text"]');
  process.exit(1);
}

const config = {
  livekitUrl: process.env.LIVEKIT_URL!,
  livekitApiKey: process.env.LIVEKIT_API_KEY!,
  livekitApiSecret: process.env.LIVEKIT_API_SECRET!,
  sipTrunkId: process.env.SIP_TRUNK_ID || 'ST_FCiQRLuvhYzx',
};

function formatE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
}

async function main(): Promise<void> {
  console.log('\n📞 DIRECT OUTBOUND CALL TEST');
  console.log('='.repeat(50));
  console.log(`Phone: ${args.phone}`);
  console.log(`Purpose: ${args.purpose}`);
  console.log('='.repeat(50));

  // Validate
  if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
    console.error('❌ Missing LiveKit configuration');
    process.exit(1);
  }
  console.log('\n✅ Configuration valid');

  if (args['dry-run']) {
    process.exit(0);
  }

  // Create room
  const callId = `test_${Date.now()}`;
  const roomName = `outbound-${callId}`;
  
  console.log(`\n📦 Creating room: ${roomName}`);
  const roomService = new RoomServiceClient(config.livekitUrl, config.livekitApiKey, config.livekitApiSecret);
  
  const metadata = JSON.stringify({
    type: 'on_behalf_call',
    callId,
    purpose: args.purpose,
    contact: { name: 'Test Contact', phone: args.phone, relationship: 'test' },
    user: { name: 'Test User', timezone: 'America/Los_Angeles' },
    script: `Hello! This is Ferni. ${args.purpose}. Can you hear me?`,
  });

  await roomService.createRoom({ name: roomName, metadata, emptyTimeout: 180 });
  console.log('   ✅ Room created with metadata');

  // Generate agent token
  const agentToken = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: `agent_${callId}`,
    name: 'Ferni',
  });
  agentToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    agent: true,
  });
  const jwt = await agentToken.toJwt();

  // Connect agent
  console.log(`\n🤖 Connecting agent to room...`);
  const room = new Room();
  
  let phoneParticipant: RemoteParticipant | null = null;
  
  room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
    console.log(`   🔔 Participant joined: ${p.identity}`);
    if (p.identity.includes('phone')) {
      phoneParticipant = p;
    }
  });
  
  room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
    console.log(`   👋 Participant left: ${p.identity}`);
  });

  await room.connect(config.livekitUrl, jwt, { autoSubscribe: true });
  console.log('   ✅ Agent connected');

  // Place SIP call
  console.log(`\n📞 Placing SIP call to ${formatE164(args.phone!)}...`);
  const sipClient = new SipClient(config.livekitUrl, config.livekitApiKey, config.livekitApiSecret);
  
  await sipClient.createSipParticipant(
    config.sipTrunkId,
    formatE164(args.phone!),
    roomName,
    { participantIdentity: `phone_${callId}`, participantName: 'Phone' }
  );
  console.log('   ✅ Call initiated - PLEASE ANSWER YOUR PHONE!');

  // Wait for phone
  console.log(`\n⏳ Waiting for phone to answer (60s)...`);
  const waitStart = Date.now();
  while (!phoneParticipant && Date.now() - waitStart < 60000) {
    await new Promise(r => setTimeout(r, 500));
    // Check existing participants
    for (const p of room.remoteParticipants.values()) {
      if (p.identity.includes('phone')) {
        phoneParticipant = p;
        break;
      }
    }
  }

  if (!phoneParticipant) {
    console.log('   ⚠️ Phone did not answer');
    await room.disconnect();
    await roomService.deleteRoom(roomName).catch(() => {});
    process.exit(1);
  }
  console.log(`   ✅ Phone connected!`);

  // Run the intelligent agent
  console.log(`\n🧠 Starting intelligent conversation agent...`);
  
  try {
    // Import the agent after room is ready
    const { runIntelligentAgentOnRoom } = await import('../src/agents/outbound/run-intelligent-agent.js');
    await runIntelligentAgentOnRoom(room, phoneParticipant, JSON.parse(metadata));
  } catch (error) {
    console.error(`   ❌ Agent error: ${error}`);
  }

  // Cleanup
  console.log(`\n🧹 Cleaning up...`);
  await room.disconnect();
  await roomService.deleteRoom(roomName).catch(() => {});
  console.log('   ✅ Done');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
