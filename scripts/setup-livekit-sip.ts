#!/usr/bin/env npx tsx
/**
 * LiveKit SIP Setup Script
 *
 * Sets up LiveKit native SIP for two-way outbound calling.
 * This is the OFFICIAL way to make outbound calls with LiveKit agents.
 *
 * Flow:
 * 1. Create a LiveKit room with your agent
 * 2. Use SipClient.createSipParticipant to dial out
 * 3. Phone caller joins the room as a participant
 * 4. Agent and phone caller can talk naturally
 *
 * Requirements:
 * - LiveKit Cloud account with SIP add-on enabled
 * - A SIP provider (Twilio, Telnyx, etc.)
 * - Outbound SIP trunk configured in LiveKit
 *
 * @module scripts/setup-livekit-sip
 */

import 'dotenv/config';
import { SipClient, RoomServiceClient, AccessToken } from 'livekit-server-sdk';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('❌ Missing LiveKit credentials');
  console.error('   Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
  process.exit(1);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       🎙️  LIVEKIT SIP SETUP & DIAGNOSTICS  🎙️            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  // =========================================================================
  // 1. CHECK EXISTING OUTBOUND TRUNKS
  // =========================================================================
  console.log('📞 Checking existing SIP outbound trunks...');

  try {
    const outboundTrunks = await sipClient.listSipOutboundTrunk();

    if (outboundTrunks.length === 0) {
      console.log('   ⚠️  No outbound SIP trunks configured!');
      console.log('');
      console.log('   To make outbound calls, you need to:');
      console.log('   1. Go to LiveKit Cloud Console → SIP → Outbound Trunks');
      console.log('   2. Create a new outbound trunk with your Twilio/SIP provider');
      console.log('   3. Configure:');
      console.log('      - Name: "ferni-outbound"');
      console.log('      - Address: Your SIP provider address (e.g., sip.twilio.com)');
      console.log('      - Numbers: Your outbound phone number(s)');
      console.log('      - Auth: Your SIP credentials');
      console.log('');
    } else {
      console.log(`   ✅ Found ${outboundTrunks.length} outbound trunk(s):`);
      for (const trunk of outboundTrunks) {
        console.log(`      - ${trunk.name || 'Unnamed'} (${trunk.sipTrunkId})`);
        console.log(`        Address: ${trunk.address}`);
        console.log(`        Numbers: ${trunk.numbers?.join(', ') || 'None'}`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error listing trunks: ${error}`);
    console.log('   This might mean SIP is not enabled on your LiveKit project.');
  }

  console.log('');

  // =========================================================================
  // 2. CHECK INBOUND TRUNKS
  // =========================================================================
  console.log('📱 Checking existing SIP inbound trunks...');

  try {
    const inboundTrunks = await sipClient.listSipInboundTrunk();

    if (inboundTrunks.length === 0) {
      console.log('   ℹ️  No inbound SIP trunks (OK for outbound-only)');
    } else {
      console.log(`   ✅ Found ${inboundTrunks.length} inbound trunk(s):`);
      for (const trunk of inboundTrunks) {
        console.log(`      - ${trunk.name || 'Unnamed'} (${trunk.sipTrunkId})`);
        console.log(`        Numbers: ${trunk.numbers?.join(', ') || 'None'}`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error listing inbound trunks: ${error}`);
  }

  console.log('');

  // =========================================================================
  // 3. CHECK DISPATCH RULES
  // =========================================================================
  console.log('🔀 Checking SIP dispatch rules...');

  try {
    const dispatchRules = await sipClient.listSipDispatchRule();

    if (dispatchRules.length === 0) {
      console.log('   ℹ️  No dispatch rules configured');
    } else {
      console.log(`   ✅ Found ${dispatchRules.length} dispatch rule(s):`);
      for (const rule of dispatchRules) {
        console.log(`      - ${rule.name || 'Unnamed'} (${rule.sipDispatchRuleId})`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error listing dispatch rules: ${error}`);
  }

  console.log('');

  // =========================================================================
  // 4. PROVIDE SETUP INSTRUCTIONS
  // =========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📚 SETUP INSTRUCTIONS FOR TWO-WAY OUTBOUND CALLS');
  console.log('');
  console.log('Option A: LiveKit SIP (Recommended for Production)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('1. Enable SIP in LiveKit Cloud:');
  console.log('   - Go to your LiveKit project → Settings → Add-ons');
  console.log('   - Enable "SIP" add-on');
  console.log('');
  console.log('2. Create Outbound SIP Trunk with Twilio:');
  console.log('   - Go to LiveKit Console → SIP → Outbound Trunks');
  console.log('   - Create new trunk:');
  console.log('     Name: ferni-twilio-outbound');
  console.log('     Address: sip.twilio.com');
  console.log('     Numbers: +1YOURTWILIONUMBER');
  console.log('     Auth Username: Your Twilio Account SID');
  console.log('     Auth Password: Your Twilio Auth Token');
  console.log('');
  console.log('3. Then use createSipParticipant to dial out:');
  console.log('');
  console.log('   const sipClient = new SipClient(url, key, secret);');
  console.log('   await sipClient.createSipParticipant(');
  console.log("     'your-trunk-id',    // From step 2");
  console.log("     '+18012017497',     // Phone to dial");
  console.log("     'my-room',          // Room with agent");
  console.log('     { waitUntilAnswered: true }');
  console.log('   );');
  console.log('');
  console.log('Option B: Twilio Media Streams (Current Implementation)');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  console.log('This requires a public WebSocket endpoint for Twilio to stream to.');
  console.log('For production, deploy to Cloud Run with WebSocket support.');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
