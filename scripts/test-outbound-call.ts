#!/usr/bin/env npx tsx
/**
 * Test Outbound Call - E2E Validation
 *
 * Tests the full flow of making an outbound call on behalf of a user.
 * This validates:
 * 1. Contact resolution (or use provided phone number)
 * 2. Script generation
 * 3. LiveKit room creation + agent dispatch
 * 4. Twilio call initiation
 * 5. Call completion and result capture
 *
 * Usage:
 *   npx tsx scripts/test-outbound-call.ts --phone 8012017497 --purpose "schedule an appointment"
 *   npx tsx scripts/test-outbound-call.ts --contact "my doctor" --purpose "reschedule to next week"
 *
 * @module scripts/test-outbound-call
 */

import { config } from 'dotenv';
config(); // Load .env file

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

const phoneNumber = getArg('phone');
const contactQuery = getArg('contact');
const purpose = getArg('purpose') || 'test call to validate the system';
const userId = getArg('userId') || 'test-user-123';
const userName = getArg('userName') || 'Test User';
const dryRun = args.includes('--dry-run');

if (!phoneNumber && !contactQuery) {
  console.error(`
Test Outbound Call - E2E Validation
====================================

Usage:
  npx tsx scripts/test-outbound-call.ts --phone <number> [--purpose "reason"]
  npx tsx scripts/test-outbound-call.ts --contact "my doctor" [--purpose "reason"]

Options:
  --phone      Phone number to call (e.g., 8012017497)
  --contact    Contact query to resolve (e.g., "my doctor", "mom")
  --purpose    Purpose of the call (default: "test call")
  --userId     User ID (default: test-user-123)
  --userName   User name (default: Test User)
  --dry-run    Don't actually make the call, just validate setup

Examples:
  # Call a specific number
  npx tsx scripts/test-outbound-call.ts --phone 8012017497 --purpose "test validation"

  # Call a saved contact
  npx tsx scripts/test-outbound-call.ts --contact "my doctor" --purpose "reschedule appointment"

  # Dry run (validate setup without calling)
  npx tsx scripts/test-outbound-call.ts --phone 8012017497 --dry-run
`);
  process.exit(1);
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log('\n📞 OUTBOUND CALL E2E TEST');
  console.log('='.repeat(50));
  console.log(`Contact:   ${contactQuery || 'N/A (using phone number)'}`);
  console.log(`Phone:     ${phoneNumber || 'Will be resolved from contact'}`);
  console.log(`Purpose:   ${purpose}`);
  console.log(`User:      ${userName} (${userId})`);
  console.log(`Dry Run:   ${dryRun ? 'YES' : 'NO'}`);
  console.log('='.repeat(50));

  // -------------------------------------------------------------------------
  // STEP 1: VALIDATE CONFIGURATION
  // -------------------------------------------------------------------------
  console.log('\n[1/5] Validating configuration...');

  const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('   Please set these in your .env file');
    process.exit(1);
  }

  console.log('   ✅ Twilio: Configured');
  console.log(`      SID: ${process.env.TWILIO_ACCOUNT_SID?.slice(0, 10)}...`);
  console.log(`      Phone: ${process.env.TWILIO_PHONE_NUMBER}`);
  console.log('   ✅ LiveKit: Configured');
  console.log(`      URL: ${process.env.LIVEKIT_URL}`);

  // -------------------------------------------------------------------------
  // STEP 2: RESOLVE CONTACT (if using contact query)
  // -------------------------------------------------------------------------
  console.log('\n[2/5] Resolving contact...');

  let resolvedPhone = phoneNumber;
  let resolvedName = contactQuery || 'Direct Call';
  let relationship = 'contact';

  if (contactQuery && !phoneNumber) {
    try {
      const { searchContacts } = await import(
        '../src/services/contacts/contact-relationship-service.js'
      );
      const contacts = await searchContacts(userId, contactQuery);

      if (contacts.length > 0) {
        const contact = contacts[0];
        resolvedPhone = contact.phone || undefined;
        resolvedName = contact.name;
        relationship = contact.relationship || 'contact';
        console.log(`   ✅ Found contact: ${resolvedName}`);
        console.log(`      Phone: ${resolvedPhone}`);
        console.log(`      Relationship: ${relationship}`);
      } else {
        console.error(`   ❌ No contact found matching "${contactQuery}"`);
        console.error('      Try adding a contact first or use --phone directly');
        process.exit(1);
      }
    } catch (error) {
      console.error(`   ❌ Error searching contacts: ${error}`);
      process.exit(1);
    }
  } else {
    console.log(`   ✅ Using provided phone number: ${resolvedPhone}`);
  }

  if (!resolvedPhone) {
    console.error('   ❌ No phone number available');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 3: BUILD CALL REQUEST
  // -------------------------------------------------------------------------
  console.log('\n[3/5] Building call request...');

  const { inferObjective } = await import('../src/tools/domains/telephony/call-on-behalf.js');
  const objective = inferObjective(purpose);
  console.log(`   Objective: ${objective}`);

  const callRequest = {
    contactQuery: contactQuery || resolvedPhone,
    resolvedContact: {
      name: resolvedName,
      phone: resolvedPhone,
      relationship,
    },
    purpose,
    objective,
    callType: 'business' as const,
    originalSessionId: 'test-session',
    userId,
    userTimezone: 'America/Los_Angeles',
    userName,
    userPreferences: {},
    recordingConsent: true,
  };

  console.log(`   ✅ Request built:`, JSON.stringify(callRequest, null, 2).slice(0, 500) + '...');

  // -------------------------------------------------------------------------
  // STEP 4: GENERATE SCRIPT
  // -------------------------------------------------------------------------
  console.log('\n[4/5] Generating call script...');

  const { selectScript, buildCallScript } = await import(
    '../src/tools/domains/telephony/scripts/index.js'
  );
  const { script: scriptTemplate, type: scriptType } = selectScript(
    callRequest.resolvedContact,
    purpose
  );
  const script = buildCallScript(scriptTemplate, {
    agentName: 'Ferni',
    userName,
    contactName: resolvedName,
    purpose,
    objective,
  });

  console.log(`   Script type: ${scriptType}`);
  console.log(`   Script preview:\n${script.slice(0, 500)}...`);

  // -------------------------------------------------------------------------
  // STEP 5: INITIATE CALL (unless dry run)
  // -------------------------------------------------------------------------
  if (dryRun) {
    console.log('\n[5/5] DRY RUN - Skipping actual call');
    console.log('   ✅ All validations passed!');
    console.log('   Run without --dry-run to make the actual call');
    return;
  }

  console.log('\n[5/5] Initiating call via orchestrator...');

  try {
    const { getOnBehalfCallOrchestrator } = await import(
      '../src/services/outreach/on-behalf-call-orchestrator.js'
    );

    const orchestrator = getOnBehalfCallOrchestrator();

    // Check if configured
    if (!orchestrator.isConfigured()) {
      console.error('   ❌ Orchestrator not configured (missing Twilio/LiveKit credentials)');
      process.exit(1);
    }

    console.log('   📞 Calling...');
    const callId = await orchestrator.initiateCall(callRequest);

    console.log(`   ✅ Call initiated!`);
    console.log(`   Call ID: ${callId}`);
    console.log('\n📱 Check your phone! The call should come through shortly.');
    console.log('   (The Ferni agent will join and handle the conversation)');

    // Monitor for a bit
    console.log('\n⏳ Monitoring call status for 60 seconds...');

    orchestrator.on('call-ringing', (call) => {
      console.log('   📞 RINGING...');
    });

    orchestrator.on('call-answered', (call) => {
      console.log('   ✅ ANSWERED!');
    });

    orchestrator.on('voicemail-detected', (call) => {
      console.log('   📬 VOICEMAIL DETECTED');
    });

    orchestrator.on('call-completed', (call) => {
      console.log('   ✅ CALL COMPLETED');
      console.log(`   Status: ${call.status}`);
      console.log(`   Outcome: ${call.outcome?.outcome || 'Unknown'}`);
      process.exit(0);
    });

    orchestrator.on('call-failed', (call, error) => {
      console.log(`   ❌ CALL FAILED: ${error}`);
      process.exit(1);
    });

    // Wait up to 60 seconds
    await new Promise((resolve) => setTimeout(resolve, 60000));
    console.log('\n⏰ Monitoring timeout reached. Call may still be in progress.');
  } catch (error) {
    console.error(`   ❌ Failed to initiate call: ${error}`);
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
