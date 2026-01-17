#!/usr/bin/env npx tsx
/**
 * Outbound Call System Validation
 *
 * Comprehensive E2E validation of all outbound calling capabilities.
 * Tests what works vs what doesn't and generates a gap analysis.
 *
 * Usage:
 *   npx tsx scripts/validate-outbound-system.ts [--phone NUMBER] [--live]
 *
 * Options:
 *   --phone NUMBER  Phone to use for live tests (default: dry run)
 *   --live          Run live tests (actually make calls)
 *   --verbose       Show detailed output
 *
 * @module scripts/validate-outbound-system
 */

import { config } from 'dotenv';
config();

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ValidationResult {
  name: string;
  category: 'configuration' | 'infrastructure' | 'capability' | 'e2e';
  status: 'pass' | 'fail' | 'partial' | 'not_tested';
  message: string;
  details?: string;
  gap?: string;
}

const results: ValidationResult[] = [];
const args = process.argv.slice(2);

const testPhoneNumber = args.find((_, i) => args[i - 1] === '--phone') || '';
const isLive = args.includes('--live');
const isVerbose = args.includes('--verbose');

function log(msg: string): void {
  console.log(msg);
}

function logDetail(msg: string): void {
  if (isVerbose) console.log(`   ${msg}`);
}

function addResult(result: ValidationResult): void {
  results.push(result);
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : result.status === 'partial' ? '⚠️' : '⏭️';
  log(`${icon} ${result.name}: ${result.message}`);
  if (result.gap && isVerbose) {
    log(`   🔧 GAP: ${result.gap}`);
  }
}

// ============================================================================
// CONFIGURATION CHECKS
// ============================================================================

async function checkConfiguration(): Promise<void> {
  log('\n📋 CONFIGURATION CHECKS\n' + '='.repeat(50));

  // Twilio
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  addResult({
    name: 'Twilio Account',
    category: 'configuration',
    status: twilioSid && twilioToken ? 'pass' : 'fail',
    message: twilioSid ? `SID: ${twilioSid.slice(0, 8)}...` : 'Not configured',
    gap: !twilioSid ? 'Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN' : undefined,
  });

  addResult({
    name: 'Twilio Phone Number',
    category: 'configuration',
    status: twilioPhone ? 'pass' : 'fail',
    message: twilioPhone || 'Not configured',
    gap: !twilioPhone ? 'Set TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER' : undefined,
  });

  // LiveKit
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitKey = process.env.LIVEKIT_API_KEY;
  const livekitSecret = process.env.LIVEKIT_API_SECRET;

  addResult({
    name: 'LiveKit',
    category: 'configuration',
    status: livekitUrl && livekitKey && livekitSecret ? 'pass' : 'fail',
    message: livekitUrl || 'Not configured',
    gap: !livekitUrl ? 'Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET' : undefined,
  });

  // SIP Trunk
  const sipTrunkId = process.env.SIP_TRUNK_ID;
  addResult({
    name: 'SIP Trunk (for conversational calls)',
    category: 'configuration',
    status: sipTrunkId ? 'pass' : 'partial',
    message: sipTrunkId ? `Trunk ID: ${sipTrunkId}` : 'Not configured - will use WebSocket fallback',
    gap: !sipTrunkId ? 'Set SIP_TRUNK_ID for lower latency conversational calls' : undefined,
  });

  // Cartesia TTS
  const cartesiaKey = process.env.CARTESIA_API_KEY;
  addResult({
    name: 'Cartesia TTS (Ferni\'s voice)',
    category: 'configuration',
    status: cartesiaKey ? 'pass' : 'fail',
    message: cartesiaKey ? 'Configured' : 'Not configured',
    gap: !cartesiaKey ? 'Set CARTESIA_API_KEY for persona voices' : undefined,
  });

  // GCS for audio hosting
  const gcsBucket = process.env.GCS_VOICE_BUCKET;
  addResult({
    name: 'GCS Audio Hosting',
    category: 'configuration',
    status: gcsBucket ? 'pass' : 'partial',
    message: gcsBucket || 'Not configured - Twilio fallback voices only',
    gap: !gcsBucket ? 'Set GCS_VOICE_BUCKET for Cartesia voice playback' : undefined,
  });

  // Webhook URL
  const webhookUrl = process.env.WEBHOOK_BASE_URL;
  addResult({
    name: 'Webhook Base URL',
    category: 'configuration',
    status: webhookUrl && !webhookUrl.includes('localhost') ? 'pass' : 'partial',
    message: webhookUrl || 'Not configured',
    gap: webhookUrl?.includes('localhost') 
      ? 'WEBHOOK_BASE_URL is localhost - Twilio callbacks won\'t work in production'
      : !webhookUrl ? 'Set WEBHOOK_BASE_URL to your public server URL' : undefined,
  });
}

// ============================================================================
// INFRASTRUCTURE CHECKS
// ============================================================================

async function checkInfrastructure(): Promise<void> {
  log('\n🏗️ INFRASTRUCTURE CHECKS\n' + '='.repeat(50));

  // Contact Service
  try {
    const { ContactRelationshipService } = await import('../src/services/contacts/contact-relationship-service.js');
    addResult({
      name: 'Contact Storage Service',
      category: 'infrastructure',
      status: 'pass',
      message: 'ContactRelationshipService available',
    });
  } catch {
    addResult({
      name: 'Contact Storage Service',
      category: 'infrastructure',
      status: 'fail',
      message: 'Could not load ContactRelationshipService',
      gap: 'Fix import errors in contact-relationship-service.ts',
    });
  }

  // On-behalf Orchestrator
  try {
    const { getOnBehalfCallOrchestrator } = await import('../src/services/outreach/on-behalf-call-orchestrator.js');
    const orchestrator = getOnBehalfCallOrchestrator();
    addResult({
      name: 'On-Behalf Call Orchestrator',
      category: 'infrastructure',
      status: 'pass',
      message: 'Orchestrator initialized',
    });
  } catch (err) {
    addResult({
      name: 'On-Behalf Call Orchestrator',
      category: 'infrastructure',
      status: 'fail',
      message: `Error: ${err}`,
      gap: 'Fix orchestrator initialization',
    });
  }

  // Call Scripts
  try {
    const scripts = await import('../src/tools/domains/telephony/scripts/index.js');
    const available: string[] = [];
    
    // Check if script templates are exported
    if (scripts.healthcareScript) available.push('healthcare');
    if (scripts.restaurantScript) available.push('restaurant');
    if (scripts.businessScript) available.push('business');
    if (scripts.personalScript) available.push('personal');
    
    // Also check buildCallScript function
    const hasBuildFunction = typeof scripts.buildCallScript === 'function';
    const hasSelectFunction = typeof scripts.selectScript === 'function';
    
    addResult({
      name: 'Call Scripts',
      category: 'infrastructure',
      status: available.length === 4 && hasBuildFunction && hasSelectFunction ? 'pass' : 'partial',
      message: `${available.length}/4 scripts: ${available.join(', ')}. buildCallScript: ${hasBuildFunction ? '✓' : '✗'}, selectScript: ${hasSelectFunction ? '✓' : '✗'}`,
      gap: available.length < 4 ? `Missing scripts: ${['healthcare', 'restaurant', 'business', 'personal'].filter(t => !available.includes(t)).join(', ')}` : undefined,
    });
  } catch (err) {
    addResult({
      name: 'Call Scripts',
      category: 'infrastructure',
      status: 'fail',
      message: `Error loading scripts: ${err}`,
      gap: 'Fix call script loading',
    });
  }

  // Call Result Capture
  try {
    const { captureCallResult } = await import('../src/services/outreach/call-result-capture.js');
    addResult({
      name: 'Call Result Capture',
      category: 'infrastructure',
      status: typeof captureCallResult === 'function' ? 'pass' : 'fail',
      message: 'Result capture available',
    });
  } catch {
    addResult({
      name: 'Call Result Capture',
      category: 'infrastructure',
      status: 'fail',
      message: 'Could not load call result capture',
      gap: 'Fix call-result-capture.ts imports',
    });
  }

  // Twilio Webhook Handler
  try {
    const { handleTwilioCallStatus } = await import('../src/servers/api/routes/twilio-call-status.js');
    addResult({
      name: 'Twilio Webhook Handler',
      category: 'infrastructure',
      status: typeof handleTwilioCallStatus === 'function' ? 'pass' : 'fail',
      message: 'Webhook handler available',
    });
  } catch {
    addResult({
      name: 'Twilio Webhook Handler',
      category: 'infrastructure',
      status: 'fail',
      message: 'Could not load webhook handler',
      gap: 'Fix twilio-call-status.ts',
    });
  }
}

// ============================================================================
// CAPABILITY CHECKS
// ============================================================================

async function checkCapabilities(): Promise<void> {
  log('\n🎯 CAPABILITY CHECKS\n' + '='.repeat(50));

  // TTS Message Call (one-way, no conversation)
  try {
    const { callWithPersonaVoice } = await import('../src/services/voice/voice-call.js');
    addResult({
      name: 'TTS Message Calls (one-way)',
      category: 'capability',
      status: 'pass',
      message: 'callWithPersonaVoice() available - plays message, hangs up',
      details: 'Works but NO conversation - just plays TTS and disconnects',
    });
  } catch {
    addResult({
      name: 'TTS Message Calls (one-way)',
      category: 'capability',
      status: 'fail',
      message: 'Could not load voice-call service',
    });
  }

  // Conversational Calls (two-way, agent talks)
  try {
    const { isConversationalCallsConfigured } = await import('../src/services/outreach/conversational-calls.js');
    const configured = isConversationalCallsConfigured();
    addResult({
      name: 'Conversational Calls (two-way)',
      category: 'capability',
      status: configured ? 'partial' : 'fail',
      message: configured ? 'Service configured but agent may not join properly' : 'Not configured',
      gap: !configured 
        ? 'Requires Twilio + LiveKit + SIP trunk configured'
        : 'Agent dispatch works but agent may not be responding - needs on-behalf-call-agent.ts fixed',
    });
  } catch {
    addResult({
      name: 'Conversational Calls (two-way)',
      category: 'capability',
      status: 'fail',
      message: 'Could not load conversational-calls service',
      gap: 'Fix conversational-calls.ts imports',
    });
  }

  // Machine Detection
  addResult({
    name: 'Machine Detection (Human vs Voicemail)',
    category: 'capability',
    status: 'partial',
    message: 'Twilio detects machine, but routing is incomplete',
    gap: 'When AnsweredBy=machine, need to: 1) Leave voicemail message, 2) Update outcome properly',
  });

  // IVR Navigation
  addResult({
    name: 'IVR Navigation (press 1 for...)',
    category: 'capability',
    status: 'fail',
    message: 'NOT IMPLEMENTED',
    gap: 'Need DTMF tone detection + generation, hold music detection, IVR menu state machine',
  });

  // Hold Music Detection
  addResult({
    name: 'Hold Music Detection',
    category: 'capability',
    status: 'fail',
    message: 'NOT IMPLEMENTED',
    gap: 'Need audio analysis to detect hold music vs human speech',
  });

  // Appointment Scheduling Flow
  addResult({
    name: 'Appointment Scheduling (complete flow)',
    category: 'capability',
    status: 'fail',
    message: 'NOT IMPLEMENTED',
    gap: 'Need: agent asks for dates → office responds → agent confirms → result captured',
  });

  // Result Notification
  try {
    const { isPushNotificationsAvailable } = await import('../src/services/outreach/delivery/push-notifications.js');
    const pushAvailable = isPushNotificationsAvailable();
    addResult({
      name: 'Push Notification for Results',
      category: 'capability',
      status: pushAvailable ? 'pass' : 'partial',
      message: pushAvailable ? 'Push notifications available' : 'Push not configured, will use stored notifications',
    });
  } catch {
    addResult({
      name: 'Push Notification for Results',
      category: 'capability',
      status: 'partial',
      message: 'Push notifications module not available',
    });
  }
}

// ============================================================================
// E2E VALIDATION (if --live)
// ============================================================================

async function runLiveTests(): Promise<void> {
  if (!isLive || !testPhoneNumber) {
    log('\n📱 E2E TESTS (skipped - use --live --phone NUMBER to enable)\n' + '='.repeat(50));
    addResult({
      name: 'E2E: TTS Message Call',
      category: 'e2e',
      status: 'not_tested',
      message: 'Skipped - use --live --phone NUMBER',
    });
    addResult({
      name: 'E2E: Conversational Call',
      category: 'e2e',
      status: 'not_tested',
      message: 'Skipped - use --live --phone NUMBER',
    });
    return;
  }

  log('\n📱 E2E TESTS (LIVE)\n' + '='.repeat(50));
  log(`Testing with phone: ${testPhoneNumber}`);

  // Test 1: TTS Message Call
  log('\n[1] Testing TTS Message Call...');
  try {
    const { callWithPersonaVoice } = await import('../src/services/voice/voice-call.js');
    const result = await callWithPersonaVoice(
      testPhoneNumber,
      'Hello! This is Ferni. I am testing the TTS message call system. If you hear this message clearly, test 1 passed!',
      'ferni',
      { customGreeting: 'Hey there!' }
    );
    addResult({
      name: 'E2E: TTS Message Call',
      category: 'e2e',
      status: result.success ? 'pass' : 'fail',
      message: result.success ? `Call SID: ${result.callSid}` : result.message,
      details: result.usedCartesiaVoice ? 'Used Cartesia voice' : 'Used Twilio Polly voice',
    });
  } catch (err) {
    addResult({
      name: 'E2E: TTS Message Call',
      category: 'e2e',
      status: 'fail',
      message: `Error: ${err}`,
    });
  }

  // Wait between tests
  await new Promise(r => setTimeout(r, 5000));

  // Test 2: Conversational Call (agent should join and talk)
  log('\n[2] Testing Conversational Call...');
  try {
    const { getOnBehalfCallOrchestrator } = await import('../src/services/outreach/on-behalf-call-orchestrator.js');
    const orchestrator = getOnBehalfCallOrchestrator();
    
    const result = await orchestrator.initiateCall({
      contactQuery: testPhoneNumber,
      resolvedContact: {
        name: 'Test User',
        phone: testPhoneNumber,
        relationship: 'contact',
      },
      purpose: 'This is a test of the conversational calling system. Ferni should be able to talk with you!',
      objective: 'general',
      callType: 'personal',
      originalSessionId: 'test-session',
      userId: 'test-user',
      userTimezone: 'America/Los_Angeles',
      userName: 'Test',
      recordingConsent: true,
    });

    addResult({
      name: 'E2E: Conversational Call Initiation',
      category: 'e2e',
      status: result.success ? 'partial' : 'fail',
      message: result.success 
        ? `Call initiated (${result.callId}) - CHECK IF AGENT SPEAKS!`
        : `Failed: ${result.error}`,
      gap: result.success 
        ? 'Call connects but agent may not speak - check on-behalf-call-agent.ts'
        : undefined,
    });
  } catch (err) {
    addResult({
      name: 'E2E: Conversational Call Initiation',
      category: 'e2e',
      status: 'fail',
      message: `Error: ${err}`,
    });
  }
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport(): void {
  log('\n\n' + '='.repeat(60));
  log('📊 OUTBOUND CALL SYSTEM VALIDATION REPORT');
  log('='.repeat(60));

  const categories = ['configuration', 'infrastructure', 'capability', 'e2e'] as const;
  
  for (const category of categories) {
    const catResults = results.filter(r => r.category === category);
    const passed = catResults.filter(r => r.status === 'pass').length;
    const failed = catResults.filter(r => r.status === 'fail').length;
    const partial = catResults.filter(r => r.status === 'partial').length;
    
    log(`\n${category.toUpperCase()}: ${passed}✅ ${partial}⚠️ ${failed}❌`);
  }

  // Critical gaps
  const gaps = results.filter(r => r.gap);
  if (gaps.length > 0) {
    log('\n\n🔧 CRITICAL GAPS TO FIX\n' + '-'.repeat(40));
    gaps.forEach((r, i) => {
      log(`${i + 1}. ${r.name}`);
      log(`   → ${r.gap}`);
    });
  }

  // Summary
  const passCount = results.filter(r => r.status === 'pass').length;
  const totalCount = results.length;
  const percentComplete = Math.round((passCount / totalCount) * 100);

  log('\n\n📈 OVERALL STATUS');
  log('-'.repeat(40));
  log(`Completion: ${percentComplete}% (${passCount}/${totalCount} checks passing)`);
  
  if (percentComplete < 50) {
    log('\n⛔ CRITICAL: Multiple core systems not working');
    log('   Priority: Fix configuration → infrastructure → capabilities');
  } else if (percentComplete < 80) {
    log('\n⚠️ WARNING: Some capabilities missing');
    log('   Priority: Fix the gaps listed above');
  } else {
    log('\n✅ Good progress! Address remaining gaps for full functionality');
  }

  // What works vs doesn't
  log('\n\n📋 SUMMARY: WHAT WORKS VS DOESN\'T');
  log('-'.repeat(40));
  log('\n✅ WORKING:');
  results.filter(r => r.status === 'pass').forEach(r => log(`   • ${r.name}`));
  
  log('\n⚠️ PARTIAL:');
  results.filter(r => r.status === 'partial').forEach(r => log(`   • ${r.name}: ${r.message}`));
  
  log('\n❌ NOT WORKING:');
  results.filter(r => r.status === 'fail').forEach(r => log(`   • ${r.name}: ${r.gap || r.message}`));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  log('🔍 OUTBOUND CALL SYSTEM VALIDATION');
  log('='.repeat(60));
  log(`Mode: ${isLive ? 'LIVE' : 'DRY RUN'}`);
  if (testPhoneNumber) log(`Test Phone: ${testPhoneNumber}`);
  log('');

  await checkConfiguration();
  await checkInfrastructure();
  await checkCapabilities();
  await runLiveTests();
  generateReport();
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
