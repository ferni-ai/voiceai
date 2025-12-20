/**
 * Test Ferni Call Script
 * 
 * Tests the outbound calling system with your phone number
 */

import 'dotenv/config';
import { callWithPersonaVoice } from '../src/services/voice-call.js';
import { generateCallOpening, generateVoicemailMessage } from '../src/services/outreach/persona-voice-generator.js';

async function testFerniCall() {
  // Check configuration
  console.log('\n🔍 Checking configuration...\n');
  
  const config = {
    TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: !!process.env.TWILIO_PHONE_NUMBER,
    CARTESIA_API_KEY: !!process.env.CARTESIA_API_KEY,
    GCS_VOICE_BUCKET: !!process.env.GCS_VOICE_BUCKET,
    LIVEKIT_URL: !!process.env.LIVEKIT_URL,
    SIP_TRUNK_ID: !!process.env.SIP_TRUNK_ID,
  };
  
  console.log('Configuration:');
  Object.entries(config).forEach(([key, value]) => {
    console.log(`  ${value ? '✅' : '❌'} ${key}`);
  });
  
  // Get phone number from command line or prompt
  const phoneNumber = process.argv[2];
  if (!phoneNumber) {
    console.log('\n⚠️  Usage: npx tsx scripts/test-ferni-call.ts +15551234567');
    console.log('   Replace with your actual phone number\n');
    process.exit(1);
  }
  
  console.log(`\n📞 Calling ${phoneNumber}...\n`);
  
  // Generate a unique greeting
  const context = {
    userId: 'test-user',
    userName: 'friend', // Will be replaced with actual name
    relationshipStage: 'building' as const,
    trigger: {
      type: 'thinking_of_you',
      reason: 'Testing the outreach system',
      urgency: 'low' as const,
    },
    context: {
      recentTopics: ['building Ferni'],
    },
  };
  
  const opening = generateCallOpening('ferni', context);
  const voicemail = generateVoicemailMessage('ferni', context, 'casual');
  
  console.log('📝 Generated Messages:');
  console.log(`   Opening: "${opening}"`);
  console.log(`   Voicemail: "${voicemail}"\n`);
  
  // Make the call
  const message = `${opening} I just wanted to reach out and test our calling system. This is Ferni speaking - your life coach. If this worked, you'll hear my voice! Pretty cool, right? Talk soon!`;
  
  console.log('🎙️  Message:', message, '\n');
  
  const result = await callWithPersonaVoice(phoneNumber, message, 'ferni', {
    fallbackToTwilioVoice: true,
  });
  
  console.log('📱 Result:', result);
  
  if (result.success) {
    console.log('\n✅ Call initiated! Check your phone!\n');
    console.log(`   Call SID: ${result.callSid}`);
    console.log(`   Used Cartesia voice: ${result.usedCartesiaVoice ? 'Yes' : 'No (fallback)'}`);
  } else {
    console.log('\n❌ Call failed:', result.message);
  }
}

testFerniCall().catch(console.error);
