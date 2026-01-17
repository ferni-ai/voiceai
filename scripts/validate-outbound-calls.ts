#!/usr/bin/env npx tsx
/**
 * Validate Outbound Calling System
 *
 * Comprehensive test suite for all outbound calling capabilities:
 * 1. Simple TTS calls (pre-recorded message)
 * 2. Contact resolution
 * 3. Script generation
 * 4. Conversational calls (SIP + LiveKit agent)
 *
 * Usage:
 *   npx tsx scripts/validate-outbound-calls.ts --phone 8012017497
 *   npx tsx scripts/validate-outbound-calls.ts --phone 8012017497 --test-all
 *   npx tsx scripts/validate-outbound-calls.ts --phone 8012017497 --test-tts
 *   npx tsx scripts/validate-outbound-calls.ts --phone 8012017497 --test-conversational
 */

import { config } from 'dotenv';
config();

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const phoneNumber = getArg('phone');
const testAll = hasFlag('test-all');
const testTts = hasFlag('test-tts');
const testConversational = hasFlag('test-conversational');
const dryRun = hasFlag('dry-run');

if (!phoneNumber) {
  console.log(`
🔍 Outbound Call Validation Suite
==================================

Validates all outbound calling capabilities end-to-end.

Usage:
  npx tsx scripts/validate-outbound-calls.ts --phone <number> [options]

Options:
  --phone          Phone number to test with (required)
  --test-all       Run all tests (default if no test specified)
  --test-tts       Test only TTS message calls (proven to work)
  --test-conversational  Test conversational SIP calls
  --dry-run        Validate config without making calls

Examples:
  # Full validation
  npx tsx scripts/validate-outbound-calls.ts --phone 8012017497 --test-all

  # Just TTS (quick validation)
  npx tsx scripts/validate-outbound-calls.ts --phone 8012017497 --test-tts
`);
  process.exit(1);
}

// ============================================================================
// TEST RESULTS TRACKING
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

function recordTest(result: TestResult) {
  results.push(result);
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details) {
    console.log(`   Details: ${JSON.stringify(result.details, null, 2).split('\n').join('\n   ')}`);
  }
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

async function validateEnvironment(): Promise<void> {
  console.log('\n📋 ENVIRONMENT VALIDATION');
  console.log('─'.repeat(50));

  // Twilio
  const twilioConfigured =
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER;

  recordTest({
    name: 'Twilio Configuration',
    passed: !!twilioConfigured,
    message: twilioConfigured
      ? `Configured (${process.env.TWILIO_PHONE_NUMBER})`
      : 'Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER',
  });

  // LiveKit
  const livekitConfigured =
    process.env.LIVEKIT_URL &&
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET;

  recordTest({
    name: 'LiveKit Configuration',
    passed: !!livekitConfigured,
    message: livekitConfigured
      ? `Configured (${process.env.LIVEKIT_URL})`
      : 'Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET',
  });

  // SIP Trunk (optional for conversational)
  const sipConfigured = !!process.env.SIP_TRUNK_ID;
  recordTest({
    name: 'SIP Trunk (for conversational)',
    passed: sipConfigured,
    message: sipConfigured
      ? `Configured (${process.env.SIP_TRUNK_ID})`
      : 'Not configured - conversational calls will fall back to WebSocket',
  });

  // Webhook URL
  const webhookUrl = process.env.WEBHOOK_BASE_URL;
  const isLocalhost = webhookUrl?.includes('localhost');
  recordTest({
    name: 'Webhook Base URL',
    passed: !!webhookUrl && !isLocalhost,
    message: isLocalhost
      ? `⚠️ Set to localhost (${webhookUrl}) - Twilio callbacks won't work in production`
      : webhookUrl
        ? `Configured (${webhookUrl})`
        : 'Not configured - call status updates won\'t work',
  });

  // Cartesia (for TTS)
  const cartesiaConfigured = !!process.env.CARTESIA_API_KEY;
  recordTest({
    name: 'Cartesia TTS',
    passed: cartesiaConfigured,
    message: cartesiaConfigured
      ? 'Configured - will use Ferni\'s actual voice'
      : 'Not configured - will fall back to Twilio Polly voices',
  });

  // GCS for audio hosting
  const gcsConfigured =
    !!process.env.GCS_VOICE_BUCKET || !!process.env.GOOGLE_CLOUD_PROJECT;
  recordTest({
    name: 'GCS Audio Hosting',
    passed: gcsConfigured,
    message: gcsConfigured
      ? 'Configured - Cartesia audio will be hosted for playback'
      : 'Not configured - Cartesia audio won\'t work, will use Polly',
  });
}

async function testContactResolution(): Promise<void> {
  console.log('\n📇 CONTACT RESOLUTION TEST');
  console.log('─'.repeat(50));

  try {
    const { searchContacts } = await import(
      '../src/services/contacts/contact-relationship-service.js'
    );

    // Test searching for different contact types
    const testQueries = ['doctor', 'mom', 'dentist', 'favorite restaurant'];

    for (const query of testQueries) {
      const start = Date.now();
      const contacts = await searchContacts('test-user', query);
      const duration = Date.now() - start;

      recordTest({
        name: `Resolve "${query}"`,
        passed: true, // Resolution always passes, just might be empty
        message: contacts.length > 0
          ? `Found ${contacts.length} match(es): ${contacts[0].name}`
          : 'No saved contacts found (expected for test user)',
        duration,
        details: contacts.length > 0 ? { topMatch: contacts[0] } : undefined,
      });
    }
  } catch (error) {
    recordTest({
      name: 'Contact Resolution',
      passed: false,
      message: `Failed to import contact service: ${error}`,
    });
  }
}

async function testScriptGeneration(): Promise<void> {
  console.log('\n📝 SCRIPT GENERATION TEST');
  console.log('─'.repeat(50));

  try {
    const { selectScript, buildCallScript } = await import(
      '../src/tools/domains/telephony/scripts/index.js'
    );

    const testCases = [
      { contact: { name: 'Dr. Smith', phone: '555-1234', relationship: 'doctor' }, purpose: 'schedule a checkup' },
      { contact: { name: 'Olive Garden', phone: '555-5678', relationship: 'restaurant' }, purpose: 'make a reservation for 4' },
      { contact: { name: 'Mom', phone: '555-9999', relationship: 'mother' }, purpose: 'say good morning' },
      { contact: { name: 'Acme Corp', phone: '555-0000', relationship: 'business' }, purpose: 'inquire about services' },
    ];

    for (const { contact, purpose } of testCases) {
      const { script: template, type } = selectScript(contact, purpose);
      const script = buildCallScript(template, {
        agentName: 'Ferni',
        userName: 'Test User',
        contactName: contact.name,
        purpose,
        objective: 'general' as const,
      });

      recordTest({
        name: `Script: ${contact.relationship}`,
        passed: script.length > 100,
        message: `Generated ${type} script (${script.length} chars)`,
        details: { type, preview: script.slice(0, 200) + '...' },
      });
    }
  } catch (error) {
    recordTest({
      name: 'Script Generation',
      passed: false,
      message: `Failed: ${error}`,
    });
  }
}

async function testTtsCall(): Promise<void> {
  console.log('\n📞 TTS MESSAGE CALL TEST');
  console.log('─'.repeat(50));

  if (dryRun) {
    recordTest({
      name: 'TTS Call',
      passed: true,
      message: 'Skipped (dry run)',
    });
    return;
  }

  try {
    const { callWithPersonaVoice } = await import('../src/services/voice/voice-call.js');

    const message = 'Hey! This is Ferni validating the outbound calling system. If you can hear this message clearly, the test passed! Have a great day!';

    console.log(`   📱 Calling ${phoneNumber}...`);
    const start = Date.now();
    const result = await callWithPersonaVoice(phoneNumber!, message, 'ferni', {
      customGreeting: 'Hi there! This is Ferni.',
    });
    const duration = Date.now() - start;

    recordTest({
      name: 'TTS Call',
      passed: result.success,
      message: result.success
        ? `Call initiated in ${duration}ms (${result.usedCartesiaVoice ? 'Cartesia' : 'Polly'})`
        : `Failed: ${result.message}`,
      duration,
      details: result.success ? { callSid: result.callSid } : undefined,
    });

    if (result.success) {
      console.log('\n   📱 YOUR PHONE SHOULD RING NOW!');
      console.log('   Listen for Ferni\'s voice message.');
    }
  } catch (error) {
    recordTest({
      name: 'TTS Call',
      passed: false,
      message: `Exception: ${error}`,
    });
  }
}

async function testConversationalCall(): Promise<void> {
  console.log('\n🤖 CONVERSATIONAL CALL TEST');
  console.log('─'.repeat(50));

  if (dryRun) {
    recordTest({
      name: 'Conversational Call',
      passed: true,
      message: 'Skipped (dry run)',
    });
    return;
  }

  try {
    const { getOnBehalfCallOrchestrator } = await import(
      '../src/services/outreach/on-behalf-call-orchestrator.js'
    );

    const orchestrator = getOnBehalfCallOrchestrator();

    // Check if configured
    if (!orchestrator.isConfigured()) {
      recordTest({
        name: 'Conversational Call',
        passed: false,
        message: 'Orchestrator not configured (missing Twilio/LiveKit)',
      });
      return;
    }

    recordTest({
      name: 'Orchestrator Config',
      passed: true,
      message: 'Orchestrator is configured',
    });

    // Build request
    const request = {
      contactQuery: phoneNumber!,
      resolvedContact: {
        name: 'Test Contact',
        phone: phoneNumber!,
        relationship: 'test',
      },
      purpose: 'test the conversational calling system',
      objective: 'general' as const,
      callType: 'business' as const,
      originalSessionId: 'validation-test',
      userId: 'test-user',
      userTimezone: 'America/Los_Angeles',
      userName: 'Test User',
      userPreferences: {},
      recordingConsent: true,
    };

    console.log(`   📱 Initiating conversational call to ${phoneNumber}...`);
    console.log('   ⚠️  Note: This requires SIP trunk + agent dispatch to work fully');

    const start = Date.now();
    const callId = await orchestrator.initiateCall(request);
    const duration = Date.now() - start;

    recordTest({
      name: 'Conversational Call Initiated',
      passed: !!callId,
      message: `Call ID: ${callId} (initiated in ${duration}ms)`,
      duration,
      details: { callId },
    });

    if (callId) {
      console.log('\n   📱 YOUR PHONE SHOULD RING NOW!');
      console.log('   ⚠️  If there\'s dead air, the SIP/agent connection needs work.');
      console.log('   The call ID is:', callId);

      // Listen for events for 30 seconds
      console.log('\n   ⏳ Listening for call events (30s)...');

      orchestrator.on('call-ringing', () => console.log('   📞 RINGING...'));
      orchestrator.on('call-answered', () => console.log('   ✅ ANSWERED'));
      orchestrator.on('voicemail-detected', () => console.log('   📬 VOICEMAIL'));
      orchestrator.on('call-completed', (call) => {
        console.log(`   ✅ COMPLETED: ${call.status}`);
        recordTest({
          name: 'Conversational Call Completed',
          passed: true,
          message: `Status: ${call.status}`,
        });
      });
      orchestrator.on('call-failed', (call, error) => {
        console.log(`   ❌ FAILED: ${error}`);
        recordTest({
          name: 'Conversational Call Result',
          passed: false,
          message: `Failed: ${error}`,
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  } catch (error) {
    recordTest({
      name: 'Conversational Call',
      passed: false,
      message: `Exception: ${error}`,
    });
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🔍 OUTBOUND CALL VALIDATION SUITE');
  console.log('═'.repeat(50));
  console.log(`Target Phone: ${phoneNumber}`);
  console.log(`Dry Run: ${dryRun ? 'YES' : 'NO'}`);
  console.log('═'.repeat(50));

  // Always run environment validation
  await validateEnvironment();

  // Run requested tests
  const runAll = testAll || (!testTts && !testConversational);

  if (runAll || testTts) {
    await testContactResolution();
    await testScriptGeneration();
  }

  if (runAll || testTts) {
    await testTtsCall();
  }

  if (runAll || testConversational) {
    await testConversationalCall();
  }

  // Summary
  console.log('\n═'.repeat(50));
  console.log('📊 VALIDATION SUMMARY');
  console.log('═'.repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${results.length}`);

  if (failed > 0) {
    console.log('\n⚠️  FAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  if (!process.env.CARTESIA_API_KEY) {
    console.log('   - Add CARTESIA_API_KEY for Ferni\'s actual voice');
  }
  if (process.env.WEBHOOK_BASE_URL?.includes('localhost')) {
    console.log('   - Set WEBHOOK_BASE_URL to a public URL for production');
  }
  if (!process.env.SIP_TRUNK_ID) {
    console.log('   - Configure SIP_TRUNK_ID for conversational calls');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
