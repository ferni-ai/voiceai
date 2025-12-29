#!/usr/bin/env npx tsx
/**
 * Test Simple TTS Outbound Call
 * 
 * This tests the one-way TTS call that plays a message using Ferni's voice.
 * The call plays a pre-recorded message and then hangs up.
 */

import { config } from 'dotenv';
config();

import { callWithPersonaVoice } from '../src/services/voice/voice-call.js';

const phoneNumber = process.argv[2] || '+18012017497';
const message = process.argv.slice(3).join(' ') || 
  "Hey there! This is Ferni calling to test our outbound calling system. If you hear me clearly, the test is a success!";

console.log('📞 Testing Simple TTS Outbound Call');
console.log('==================================================');
console.log(`Phone: ${phoneNumber}`);
console.log(`Message: ${message.substring(0, 50)}...`);
console.log('==================================================\n');

async function main() {
  try {
    console.log('🎙️ Initiating call with Ferni\'s Cartesia voice...\n');
    
    const result = await callWithPersonaVoice({
      to: phoneNumber,
      message,
      personaId: 'ferni',
      callType: 'verification',
    });
    
    console.log('✅ Call initiated successfully!\n');
    console.log('📱 RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`\n📱 Your phone should ring shortly!`);
      console.log(`   Call SID: ${result.callSid}`);
      console.log(`   Voice Used: ${result.usedCartesiaVoice ? 'Cartesia (Ferni voice)' : 'Twilio default'}`);
    }
  } catch (err) {
    console.error('❌ Call failed:', err);
    process.exit(1);
  }
}

main();
