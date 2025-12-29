#!/usr/bin/env npx tsx
/**
 * Simple Call Test - Validate Twilio + Voice Works
 *
 * Uses the proven `callWithPersonaVoice` to make a test call.
 * This validates that Twilio calling works before testing the full agent.
 *
 * Usage:
 *   npx tsx scripts/test-simple-call.ts --phone 8012017497 --message "Hello, this is Ferni!"
 */

import { config } from 'dotenv';
config();

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

const phoneNumber = getArg('phone');
const message = getArg('message') || 'Hello! This is Ferni calling to test the outbound calling system. If you can hear this message, the test was successful. Have a great day!';

if (!phoneNumber) {
  console.log(`
Simple Call Test
================

Usage:
  npx tsx scripts/test-simple-call.ts --phone <number> [--message "your message"]

Example:
  npx tsx scripts/test-simple-call.ts --phone 8012017497 --message "Testing the system!"
`);
  process.exit(1);
}

async function main() {
  console.log('\n📞 SIMPLE CALL TEST');
  console.log('='.repeat(50));
  console.log(`Phone: ${phoneNumber}`);
  console.log(`Message: ${message}`);
  console.log('='.repeat(50));

  console.log('\nImporting voice-call module...');
  
  const { callWithPersonaVoice } = await import('../src/services/voice/voice-call.js');

  console.log('Initiating call...\n');

  const result = await callWithPersonaVoice(phoneNumber, message, 'ferni', {
    customGreeting: "Hey there! This is Ferni.",
  });

  console.log('\n📱 RESULT:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ Call initiated successfully!');
    console.log(`   Call SID: ${result.callSid}`);
    console.log(`   Voice Used: ${result.usedCartesiaVoice ? 'Cartesia (Ferni voice)' : 'Twilio Polly'}`);
    console.log('\n📱 Your phone should ring shortly with Ferni speaking the message!');
  } else {
    console.log('\n❌ Call failed:', result.message);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
