#!/usr/bin/env npx tsx
/**
 * Test calling Mom (Betty Ford) directly
 * 
 * This bypasses the LLM and tests the telephony executor directly.
 * 
 * Run: npx tsx scripts/test-call-mom.ts
 */

// Load environment variables
import { config } from 'dotenv';
config();

import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'TestCallMom' });

async function testCallMom() {
  console.log('\n🧪 Testing "Call my mom and wish her an amazing day" flow\n');
  console.log('=' .repeat(60));

  const userId = process.env.FERNI_USER_ID || 'seth';
  const contact = 'mom';
  const purpose = 'wish her an amazing day';

  console.log('\n📋 Step 1: Simulating LLM tool call');
  console.log(`   fn: reachOut`);
  console.log(`   args: { contact: "${contact}", purpose: "${purpose}", preferredChannel: "call" }`);

  // Step 1: Resolve contact
  console.log('\n📇 Step 2: Resolving contact...');
  try {
    const { searchContacts } = await import('../src/services/contacts/contact-relationship-service.js');
    const matches = await searchContacts(userId, contact);
    
    if (matches.length === 0) {
      console.log('   ❌ No contact found for "mom"');
      console.log('   Run: npx env-cmd -f .env npx tsx scripts/save-mom-contact.ts');
      return;
    }

    const mom = matches[0];
    console.log(`   ✅ Found: ${mom.name}`);
    console.log(`   📞 Phone: ${mom.phone}`);
    console.log(`   👨‍👩‍👦 Relationship: ${mom.relationship || 'unknown'}`);

    // Step 2: Check Twilio config
    console.log('\n🔧 Step 3: Checking Twilio configuration...');
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    
    if (!twilioSid || !twilioToken) {
      console.log('   ❌ TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set');
      console.log('   Add these to your .env file to enable phone calls');
      return;
    }
    console.log(`   ✅ Twilio Account: ${twilioSid.substring(0, 8)}...`);
    console.log(`   ✅ Twilio Phone: ${twilioPhone || 'Not set (will use default)'}`);

    // Step 3: Check Cartesia config
    console.log('\n🎙️ Step 4: Checking Cartesia (TTS) configuration...');
    const cartesiaKey = process.env.CARTESIA_API_KEY;
    if (!cartesiaKey) {
      console.log('   ❌ CARTESIA_API_KEY not set');
      console.log('   Add this to your .env file for Ferni voice');
      console.log('   (Will fall back to Twilio basic voice)');
    } else {
      console.log(`   ✅ Cartesia API Key: ${cartesiaKey.substring(0, 8)}...`);
    }

    // Step 4: Would make the actual call
    console.log('\n📞 Step 5: Ready to make call');
    console.log(`   From: ${twilioPhone || '(Twilio default)'}`);
    console.log(`   To: ${mom.phone}`);
    console.log(`   Message: "${purpose}"`);
    console.log(`   Voice: Ferni (Cartesia TTS)`);

    // Ask for confirmation
    console.log('\n' + '=' .repeat(60));
    console.log('⚠️  READY TO CALL. This will make a REAL phone call!');
    console.log('=' .repeat(60));
    console.log('\nTo actually make the call, run with --call flag:');
    console.log('  npx env-cmd -f .env npx tsx scripts/test-call-mom.ts --call\n');

    // Check for --call flag
    if (process.argv.includes('--call')) {
      console.log('🚀 Making the call...\n');
      
      const { callWithPersonaVoice } = await import('../src/services/voice/voice-call.js');
      
      const result = await callWithPersonaVoice(
        mom.phone!,
        purpose,
        'ferni',
        { fallbackToTwilioVoice: true }
      );

      if (result.success) {
        console.log('\n✅ CALL INITIATED!');
        console.log(`   Call SID: ${result.callSid}`);
        console.log(`   Message: ${result.message}`);
      } else {
        console.log('\n❌ CALL FAILED');
        console.log(`   Error: ${result.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

testCallMom().catch(console.error);

