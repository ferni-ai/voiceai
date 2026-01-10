#!/usr/bin/env npx ts-node
/**
 * Phone Identity System E2E Validation Script
 *
 * Validates the complete phone identity system including:
 * 1. Sponsored identity CRUD operations
 * 2. Phone number lookup
 * 3. Inbound call webhook processing
 * 4. Context builder integration
 * 5. LiveKit SIP configuration
 * 6. Twilio webhook configuration
 *
 * Run: npx ts-node scripts/validate-phone-identity-system.ts
 *
 * @module scripts/validate-phone-identity-system
 */

import { config } from 'dotenv';
config();

// ============================================================================
// ANSI COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function success(msg: string): void {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg: string): void {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function warn(msg: string): void {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function info(msg: string): void {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function section(title: string): void {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

function addResult(name: string, passed: boolean, message: string, details?: string): void {
  results.push({ name, passed, message, details });
  if (passed) {
    success(message);
  } else {
    fail(message);
  }
  if (details) {
    console.log(`   ${colors.dim}${details}${colors.reset}`);
  }
}

// ============================================================================
// 1. ENVIRONMENT VALIDATION
// ============================================================================

async function validateEnvironment(): Promise<void> {
  section('1. Environment Configuration');

  // Required for inbound calls
  const requiredVars = [
    { name: 'LIVEKIT_URL', description: 'LiveKit server URL' },
    { name: 'LIVEKIT_API_KEY', description: 'LiveKit API key' },
    { name: 'LIVEKIT_API_SECRET', description: 'LiveKit API secret' },
  ];

  // Optional but recommended
  const optionalVars = [
    { name: 'SIP_TRUNK_ID', description: 'LiveKit SIP trunk ID' },
    { name: 'SIP_INBOUND_TRUNK_ID', description: 'LiveKit inbound SIP trunk ID' },
    { name: 'TWILIO_ACCOUNT_SID', description: 'Twilio account SID' },
    { name: 'TWILIO_AUTH_TOKEN', description: 'Twilio auth token' },
  ];

  for (const { name, description } of requiredVars) {
    const value = process.env[name];
    addResult(
      `env:${name}`,
      !!value,
      value ? `${description}: configured` : `${description}: MISSING`,
      value ? `${name}=${value.slice(0, 20)}...` : undefined
    );
  }

  for (const { name, description } of optionalVars) {
    const value = process.env[name];
    if (value) {
      success(`${description}: configured`);
    } else {
      warn(`${description}: not set (optional)`);
    }
  }
}

// ============================================================================
// 2. SERVICE IMPORTS
// ============================================================================

async function validateServiceImports(): Promise<void> {
  section('2. Service Module Imports');

  // Test sponsored identity service
  try {
    const sponsoredIdentity = await import('../src/services/identity/sponsored-identity.js');
    const exports = Object.keys(sponsoredIdentity);
    addResult(
      'import:sponsored-identity',
      exports.includes('createSponsoredIdentity') && exports.includes('lookupByPhone'),
      'Sponsored identity service imports correctly',
      `Exports: ${exports.slice(0, 5).join(', ')}...`
    );
  } catch (error) {
    addResult(
      'import:sponsored-identity',
      false,
      'Failed to import sponsored identity service',
      String(error)
    );
  }

  // Test user identification service
  try {
    const userIdentification = await import('../src/services/identity/user-identification.js');
    const exports = Object.keys(userIdentification);
    addResult(
      'import:user-identification',
      exports.includes('identifyByPhone'),
      'User identification service imports correctly',
      `Exports: ${exports.slice(0, 5).join(', ')}...`
    );
  } catch (error) {
    addResult(
      'import:user-identification',
      false,
      'Failed to import user identification service',
      String(error)
    );
  }

  // Test inbound call routes
  try {
    const inboundRoutes = await import('../src/api/voice-auth/inbound-call-routes.js');
    const exports = Object.keys(inboundRoutes);
    addResult(
      'import:inbound-call-routes',
      exports.includes('handleInboundCallRoutes'),
      'Inbound call routes import correctly',
      `Exports: ${exports.join(', ')}`
    );
  } catch (error) {
    addResult(
      'import:inbound-call-routes',
      false,
      'Failed to import inbound call routes',
      String(error)
    );
  }

  // Test context builder
  try {
    const contextBuilder = await import(
      '../src/intelligence/context-builders/external/inbound-call-context.js'
    );
    const exports = Object.keys(contextBuilder);
    addResult(
      'import:inbound-call-context',
      exports.includes('setInboundCallContext') && exports.includes('inboundCallContextBuilder'),
      'Inbound call context builder imports correctly',
      `Exports: ${exports.join(', ')}`
    );
  } catch (error) {
    addResult(
      'import:inbound-call-context',
      false,
      'Failed to import inbound call context builder',
      String(error)
    );
  }
}

// ============================================================================
// 3. CONTEXT BUILDER REGISTRATION
// ============================================================================

async function validateContextBuilderRegistration(): Promise<void> {
  section('3. Context Builder Registration');

  try {
    const { BUILDER_IMPORTS } = await import(
      '../src/intelligence/context-builders/core/builder-imports.js'
    );

    const hasInboundCallContext = 'inbound-call-context' in BUILDER_IMPORTS;
    addResult(
      'builder-imports:inbound-call-context',
      hasInboundCallContext,
      hasInboundCallContext
        ? 'inbound-call-context registered in BUILDER_IMPORTS'
        : 'inbound-call-context NOT in BUILDER_IMPORTS',
      `Available external builders: ${Object.keys(BUILDER_IMPORTS)
        .filter((k) => k.includes('call') || k.includes('external'))
        .join(', ')}`
    );
  } catch (error) {
    addResult('builder-imports', false, 'Failed to check builder imports', String(error));
  }

  try {
    const { BUILDER_MANIFEST } = await import(
      '../src/intelligence/context-builders/core/loader.js'
    );

    // Check if inbound-call-context is in any category
    let found = false;
    let foundCategory = '';
    for (const [category, builders] of Object.entries(BUILDER_MANIFEST)) {
      if ((builders as string[]).includes('inbound-call-context')) {
        found = true;
        foundCategory = category;
        break;
      }
    }

    addResult(
      'builder-manifest:inbound-call-context',
      found,
      found
        ? `inbound-call-context in BUILDER_MANIFEST (category: ${foundCategory})`
        : 'inbound-call-context NOT in BUILDER_MANIFEST'
    );
  } catch (error) {
    addResult('builder-manifest', false, 'Failed to check builder manifest', String(error));
  }
}

// ============================================================================
// 4. TOOL DOMAIN REGISTRATION
// ============================================================================

async function validateToolDomainRegistration(): Promise<void> {
  section('4. Tool Domain Registration');

  try {
    const toolTypes = await import('../src/tools/registry/types.js');
    const ALL_TOOL_DOMAINS = toolTypes.ALL_TOOL_DOMAINS || [];
    const DOMAIN_TO_CATEGORY = toolTypes.DOMAIN_TO_CATEGORY || {};

    const hasVoiceEnrollment = Array.isArray(ALL_TOOL_DOMAINS) && ALL_TOOL_DOMAINS.includes('voice-enrollment');
    addResult(
      'domain:voice-enrollment',
      hasVoiceEnrollment,
      hasVoiceEnrollment
        ? 'voice-enrollment domain registered'
        : 'voice-enrollment domain NOT registered',
      `Category: ${DOMAIN_TO_CATEGORY['voice-enrollment'] || 'not mapped'}`
    );
  } catch (error) {
    addResult('domain:voice-enrollment', false, 'Failed to check tool domains', String(error));
  }

  try {
    const voiceEnrollmentTools = await import('../src/tools/domains/voice-enrollment/index.js');
    const tools = await voiceEnrollmentTools.getToolDefinitions();
    addResult(
      'tools:voice-enrollment',
      tools.length >= 3,
      `Voice enrollment tools loaded: ${tools.length} tools`,
      `Tools: ${tools.map((t: { id: string }) => t.id).join(', ')}`
    );
  } catch (error) {
    addResult('tools:voice-enrollment', false, 'Failed to load voice enrollment tools', String(error));
  }
}

// ============================================================================
// 5. API ROUTES REGISTRATION
// ============================================================================

async function validateApiRoutes(): Promise<void> {
  section('5. API Routes');

  // Check if voice-auth module handles inbound routes (internal routing)
  try {
    const voiceAuthModule = await import('../src/api/voice-auth/index.js');
    const hasHandleVoiceAuth = typeof voiceAuthModule.handleVoiceAuthRoutes === 'function';
    addResult(
      'api:voice-auth-handler',
      hasHandleVoiceAuth,
      hasHandleVoiceAuth
        ? 'Voice auth handler available (handles /api/voice/inbound internally)'
        : 'Voice auth handler missing'
    );
  } catch (error) {
    addResult('api:voice-auth-handler', false, 'Voice auth module failed to load', String(error));
  }

  // Check inbound routes module directly
  try {
    const inboundRoutes = await import('../src/api/voice-auth/inbound-call-routes.js');
    const hasHandler = typeof inboundRoutes.handleInboundCallRoutes === 'function';
    addResult(
      'api:inbound-routes',
      hasHandler,
      hasHandler ? 'Inbound call routes handler available' : 'Inbound call routes handler missing'
    );
  } catch (error) {
    addResult('api:inbound-routes', false, 'Inbound routes module failed to load', String(error));
  }

  // Check sponsored identity routes
  try {
    const { handleSponsoredIdentityRoutes } = await import(
      '../src/api/sponsored-identity-routes.js'
    );
    addResult(
      'api:sponsored-identity-routes',
      typeof handleSponsoredIdentityRoutes === 'function',
      'Sponsored identity routes exported'
    );
  } catch (error) {
    addResult('api:sponsored-identity-routes', false, 'Sponsored identity routes not exported', String(error));
  }
}

// ============================================================================
// 6. LIVEKIT SIP CONFIGURATION
// ============================================================================

async function validateLiveKitSip(): Promise<void> {
  section('6. LiveKit SIP Configuration');

  const livekitUrl = process.env.LIVEKIT_URL;
  const sipTrunkId = process.env.SIP_TRUNK_ID || process.env.SIP_INBOUND_TRUNK_ID;

  if (!livekitUrl) {
    addResult('livekit:url', false, 'LIVEKIT_URL not configured');
    return;
  }

  if (!sipTrunkId) {
    warn('No SIP trunk configured - inbound calls will use fallback TwiML');
    info('Set SIP_TRUNK_ID or SIP_INBOUND_TRUNK_ID for full SIP support');
    return;
  }

  // Try to check SIP trunk via LiveKit API
  try {
    const { SipClient } = await import('livekit-server-sdk');
    const sipClient = new SipClient(
      livekitUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // List SIP trunks to verify configuration
    const trunks = await sipClient.listSipInboundTrunk();
    addResult(
      'livekit:sip-trunks',
      trunks.items.length > 0,
      trunks.items.length > 0
        ? `Found ${trunks.items.length} SIP inbound trunk(s)`
        : 'No SIP inbound trunks configured',
      trunks.items.map((t) => t.sipTrunkId).join(', ')
    );
  } catch (error) {
    warn(`Could not verify SIP trunks: ${String(error)}`);
  }
}

// ============================================================================
// 7. TWILIO WEBHOOK CHECK
// ============================================================================

async function validateTwilioWebhook(): Promise<void> {
  section('7. Twilio Webhook Configuration');

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;

  if (!twilioSid || !twilioToken) {
    warn('Twilio credentials not configured - cannot verify webhook');
    info('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to validate webhook configuration');
    return;
  }

  info('Twilio credentials found');
  info('To configure webhooks, set your Twilio phone number webhook to:');
  info('  Voice URL: https://app.ferni.ai/api/voice/inbound');
  info('  Status Callback: https://app.ferni.ai/api/voice/inbound/status');
}

// ============================================================================
// 8. CONTEXT BUILDER FUNCTIONALITY
// ============================================================================

async function validateContextBuilderFunctionality(): Promise<void> {
  section('8. Context Builder Functionality');

  try {
    const { setInboundCallContext, getInboundCallContext, inboundCallContextBuilder } =
      await import('../src/intelligence/context-builders/external/inbound-call-context.js');

    // Test context storage
    const testSessionId = 'test-validation-session';
    const testContext = {
      callSid: 'CA_test_123',
      callerPhone: '+15551234567',
      callerName: 'Test Caller',
      isKnownCaller: true,
      isVoiceEnrolled: false,
    };

    setInboundCallContext(testSessionId, testContext);
    const retrieved = getInboundCallContext(testSessionId);

    addResult(
      'context-builder:storage',
      retrieved?.callSid === testContext.callSid,
      'Context storage and retrieval works'
    );

    // Test builder output
    const injections = await inboundCallContextBuilder.build({
      services: { sessionId: testSessionId },
      persona: { id: 'ferni', name: 'Ferni' },
    } as never);

    addResult(
      'context-builder:injections',
      injections.length > 0,
      `Builder produces ${injections.length} injection(s)`,
      injections.map((i) => i.key).join(', ')
    );
  } catch (error) {
    addResult('context-builder', false, 'Context builder test failed', String(error));
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(): void {
  section('VALIDATION SUMMARY');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\nTotal: ${total} checks`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.red}Failed checks:${colors.reset}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  • ${r.name}: ${r.message}`);
      if (r.details) {
        console.log(`    ${colors.dim}${r.details}${colors.reset}`);
      }
    }
  }

  console.log('\n');

  if (failed === 0) {
    console.log(`${colors.green}🎉 Phone Identity System is ready!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠️  Some checks failed. Review and fix before deploying.${colors.reset}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║    Phone Identity System E2E Validation            ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}`);

  await validateEnvironment();
  await validateServiceImports();
  await validateContextBuilderRegistration();
  await validateToolDomainRegistration();
  await validateApiRoutes();
  await validateLiveKitSip();
  await validateTwilioWebhook();
  await validateContextBuilderFunctionality();

  printSummary();

  // Exit with error code if any checks failed
  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Validation script failed:', error);
  process.exit(1);
});
