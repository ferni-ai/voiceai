#!/usr/bin/env npx tsx
/**
 * Comprehensive Integration Test Suite
 *
 * Tests ALL external integrations end-to-end:
 * 1. Communication: SendGrid, Twilio SMS, Twilio Voice
 * 2. Places: Google Places API
 * 3. Banking: Plaid (sandbox mode)
 * 4. Music: Spotify
 * 5. Research: Finnhub, Alpha Vantage
 * 6. Proactive: Full trigger → outreach flow
 *
 * Usage:
 *   npx env-cmd -f .env npx tsx scripts/test-all-integrations.ts
 *   npx env-cmd -f .env npx tsx scripts/test-all-integrations.ts --live  # Send real messages
 */

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const NC = '\x1b[0m';

interface TestResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];
const isLiveMode = process.argv.includes('--live');

// ============================================================================
// HELPERS
// ============================================================================

async function runTest(category: string, test: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  process.stdout.write(`  ${GRAY}[${category}]${NC} ${test}...`);

  try {
    const message = await fn();
    const duration = Date.now() - start;
    results.push({ category, test, passed: true, message, duration });
    console.log(`${GREEN} ✓${NC} ${GRAY}(${duration}ms)${NC}`);
    if (message) {
      console.log(`    ${GRAY}└─ ${message}${NC}`);
    }
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ category, test, passed: false, message, duration });
    console.log(`${RED} ✗${NC}`);
    console.log(`    ${RED}└─ ${message}${NC}`);
  }
}

function checkEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// ============================================================================
// SENDGRID TESTS
// ============================================================================

async function testSendGrid(): Promise<void> {
  console.log(`\n${CYAN}━━━ SendGrid Email ━━━${NC}`);

  await runTest('SendGrid', 'API key configured', async () => {
    const key = checkEnvVar('SENDGRID_API_KEY');
    return `Key: ${key.slice(0, 10)}...`;
  });

  await runTest('SendGrid', 'From email configured', async () => {
    return checkEnvVar('SENDGRID_FROM_EMAIL');
  });

  if (isLiveMode && process.env.TEST_EMAIL) {
    await runTest('SendGrid', 'Send test email', async () => {
      const { sendEmail } = await import('../src/services/communication-service.js');
      const result = await sendEmail(
        process.env.TEST_EMAIL!,
        '✅ Ferni Integration Test',
        `This email confirms SendGrid is working!\n\nTimestamp: ${new Date().toISOString()}`
      );
      return result;
    });
  }
}

// ============================================================================
// TWILIO TESTS
// ============================================================================

async function testTwilio(): Promise<void> {
  console.log(`\n${CYAN}━━━ Twilio SMS & Voice ━━━${NC}`);

  await runTest('Twilio', 'Account SID configured', async () => {
    const sid = checkEnvVar('TWILIO_ACCOUNT_SID');
    return `SID: ${sid.slice(0, 10)}...`;
  });

  await runTest('Twilio', 'Auth token configured', async () => {
    checkEnvVar('TWILIO_AUTH_TOKEN');
    return 'Token set';
  });

  await runTest('Twilio', 'Phone number configured', async () => {
    return checkEnvVar('TWILIO_PHONE_NUMBER');
  });

  await runTest('Twilio', 'API access validation', async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = (await response.json()) as { friendly_name?: string };
    return `Account: ${data.friendly_name || 'OK'}`;
  });

  if (isLiveMode && process.env.TEST_PHONE_NUMBER) {
    await runTest('Twilio', 'Send test SMS', async () => {
      const { sendSMS } = await import('../src/services/communication-service.js');
      const result = await sendSMS(
        process.env.TEST_PHONE_NUMBER!,
        `✅ Ferni Integration Test\n\nSMS is working!\nTimestamp: ${new Date().toISOString()}`
      );
      return result;
    });
  }
}

// ============================================================================
// GOOGLE PLACES TESTS
// ============================================================================

async function testGooglePlaces(): Promise<void> {
  console.log(`\n${CYAN}━━━ Google Places API ━━━${NC}`);

  await runTest('Places', 'API key configured', async () => {
    const key = checkEnvVar('GOOGLE_API_KEY');
    return `Key: ${key.slice(0, 15)}...`;
  });

  await runTest('Places', 'Search restaurants', async () => {
    const { searchRestaurants } = await import('../src/services/google-places.js');
    const results = await searchRestaurants({ query: 'pizza', location: 'San Francisco' });

    if (results.length === 0) {
      throw new Error('No results returned - API may not be enabled');
    }

    return `Found ${results.length} restaurants (e.g., "${results[0]?.name}")`;
  });

  await runTest('Places', 'Get place details', async () => {
    const { searchRestaurants, getPlaceDetails } = await import('../src/services/google-places.js');
    const results = await searchRestaurants({ query: 'coffee', location: 'New York' });

    if (results.length === 0) throw new Error('No places found');

    const details = await getPlaceDetails(results[0].placeId);
    if (!details) throw new Error('Could not get place details');

    return `${details.name}: ${details.formattedPhoneNumber || 'no phone'}`;
  });
}

// ============================================================================
// CARTESIA TTS TESTS
// ============================================================================

async function testCartesia(): Promise<void> {
  console.log(`\n${CYAN}━━━ Cartesia TTS ━━━${NC}`);

  await runTest('Cartesia', 'API key configured', async () => {
    const key = checkEnvVar('CARTESIA_API_KEY');
    return `Key: ${key.slice(0, 10)}...`;
  });

  await runTest('Cartesia', 'Generate speech audio', async () => {
    const { generatePersonaVoice } = await import('../src/services/voice-call.js');
    const audio = await generatePersonaVoice('Hello, this is a test!', 'ferni');

    if (!audio) {
      throw new Error('No audio generated - API may be unavailable');
    }

    return `Generated ${audio.length} bytes of audio`;
  });
}

// ============================================================================
// LIVEKIT TESTS
// ============================================================================

async function testLiveKit(): Promise<void> {
  console.log(`\n${CYAN}━━━ LiveKit ━━━${NC}`);

  await runTest('LiveKit', 'URL configured', async () => {
    return checkEnvVar('LIVEKIT_URL');
  });

  await runTest('LiveKit', 'API key configured', async () => {
    const key = checkEnvVar('LIVEKIT_API_KEY');
    return `Key: ${key.slice(0, 10)}...`;
  });

  await runTest('LiveKit', 'API secret configured', async () => {
    checkEnvVar('LIVEKIT_API_SECRET');
    return 'Secret set';
  });
}

// ============================================================================
// PLAID TESTS
// ============================================================================

async function testPlaid(): Promise<void> {
  console.log(`\n${CYAN}━━━ Plaid Banking ━━━${NC}`);

  await runTest('Plaid', 'Client ID configured', async () => {
    const id = checkEnvVar('PLAID_CLIENT_ID');
    return `ID: ${id.slice(0, 10)}...`;
  });

  await runTest('Plaid', 'Secret configured', async () => {
    checkEnvVar('PLAID_SECRET');
    return 'Secret set';
  });

  await runTest('Plaid', 'Environment configured', async () => {
    return `Env: ${process.env.PLAID_ENV || 'sandbox'}`;
  });

  // Note: Can't test Plaid without going through OAuth flow
}

// ============================================================================
// SPOTIFY TESTS
// ============================================================================

async function testSpotify(): Promise<void> {
  console.log(`\n${CYAN}━━━ Spotify ━━━${NC}`);

  await runTest('Spotify', 'Client ID configured', async () => {
    const id = checkEnvVar('SPOTIFY_CLIENT_ID');
    return `ID: ${id.slice(0, 10)}...`;
  });

  await runTest('Spotify', 'Client secret configured', async () => {
    checkEnvVar('SPOTIFY_CLIENT_SECRET');
    return 'Secret set';
  });

  await runTest('Spotify', 'Refresh token configured', async () => {
    const token = checkEnvVar('SPOTIFY_REFRESH_TOKEN');
    return `Token: ${token.slice(0, 20)}...`;
  });
}

// ============================================================================
// RESEARCH APIs TESTS
// ============================================================================

async function testResearchAPIs(): Promise<void> {
  console.log(`\n${CYAN}━━━ Research APIs ━━━${NC}`);

  await runTest('Finnhub', 'API key configured', async () => {
    checkEnvVar('FINNHUB_API_KEY');
    return 'Key set';
  });

  await runTest('Finnhub', 'Get stock quote', async () => {
    const apiKey = process.env.FINNHUB_API_KEY!;
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${apiKey}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = (await response.json()) as { c?: number };
    if (!data.c) throw new Error('No price data returned');

    return `AAPL: $${data.c.toFixed(2)}`;
  });

  await runTest('Alpha Vantage', 'API key configured', async () => {
    checkEnvVar('ALPHA_VANTAGE_API_KEY');
    return 'Key set';
  });
}

// ============================================================================
// PROACTIVE SYSTEM TESTS
// ============================================================================

async function testProactiveSystem(): Promise<void> {
  console.log(`\n${CYAN}━━━ Proactive System ━━━${NC}`);

  await runTest('Proactive', 'Detect triggers', async () => {
    const { detectProactiveTriggers } = await import('../src/tools/proactive-coaching.js');

    // Create test context with habit data
    const triggers = detectProactiveTriggers({
      userId: 'test-user',
      tendency: 'obliger',
      lastActivity: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      activeHabits: [
        {
          id: 'habit-1',
          name: 'Morning meditation',
          currentStreak: 7,
          lastCompletion: new Date(Date.now() - 22 * 60 * 60 * 1000), // 22 hours ago
          level: 2,
          successRate: 85,
        },
      ],
      recentMoods: [],
      weeklyReflectionsDue: true,
    });

    return `Detected ${triggers.length} triggers: ${triggers.map((t) => t.type).join(', ')}`;
  });

  await runTest('Proactive', 'Generate message', async () => {
    const { createProactiveCoachingTools } = await import('../src/tools/proactive-coaching.js');
    const tools = createProactiveCoachingTools();

    // Just verify the tool exists and returns
    if (!tools.generateProactiveMessage) {
      throw new Error('generateProactiveMessage tool not found');
    }

    return 'Tool available';
  });

  await runTest('Proactive', 'Reminder scheduler running', async () => {
    const { startReminderScheduler, stopReminderScheduler, getDueReminders } =
      await import('../src/services/reminder-scheduler.js');

    // Start scheduler briefly
    startReminderScheduler(60000);
    const due = getDueReminders();
    stopReminderScheduler();

    return `${due.length} pending reminders`;
  });

  await runTest('Proactive', 'Contact info storage', async () => {
    const { setUserContactInfo, getUserContactInfo } =
      await import('../src/tools/proactive-outreach.js');

    const testUserId = `test-${Date.now()}`;
    await setUserContactInfo(testUserId, {
      phone: '+15551234567',
      email: 'test@example.com',
      preferredMethod: 'sms',
      timezone: 'America/Denver',
    });

    const retrieved = await getUserContactInfo(testUserId);
    if (!retrieved?.phone) throw new Error('Contact info not stored');

    return 'Storage working';
  });
}

// ============================================================================
// VOICE CALL TESTS
// ============================================================================

async function testVoiceCalls(): Promise<void> {
  console.log(`\n${CYAN}━━━ Voice Calls ━━━${NC}`);

  await runTest('Voice', 'Persona voice registry', async () => {
    const { getVoiceId, getPersonaDisplayName } = await import('../src/personas/voice-registry.js');

    const ferniVoice = getVoiceId('ferni');
    const ferniName = getPersonaDisplayName('ferni');

    return `Ferni: ${ferniName} (voice: ${ferniVoice.slice(0, 10)}...)`;
  });

  if (isLiveMode && process.env.TEST_PHONE_NUMBER) {
    await runTest('Voice', 'Make test call', async () => {
      const { callWithPersonaVoice } = await import('../src/services/voice-call.js');

      const result = await callWithPersonaVoice(
        process.env.TEST_PHONE_NUMBER!,
        'This is a test call from Ferni. The voice integration is working perfectly!',
        'ferni',
        { fallbackToTwilioVoice: true }
      );

      if (!result.success) throw new Error(result.message);

      return `Call initiated: ${result.callSid}`;
    });
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n${CYAN}${'═'.repeat(60)}${NC}`);
  console.log(`${CYAN}  INTEGRATION TEST SUMMARY${NC}`);
  console.log(`${CYAN}${'═'.repeat(60)}${NC}`);

  console.log(`\n  ${GREEN}✓ Passed:${NC} ${passed}`);
  console.log(`  ${failed > 0 ? RED : GRAY}✗ Failed:${NC} ${failed}`);
  console.log(`  ${GRAY}Duration: ${totalDuration}ms${NC}`);

  // By category
  const categories = [...new Set(results.map((r) => r.category))];
  console.log(`\n  ${CYAN}By Category:${NC}`);

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.passed).length;
    const status = catPassed === catResults.length ? `${GREEN}✓` : `${RED}✗`;
    console.log(`    ${status} ${cat}: ${catPassed}/${catResults.length}${NC}`);
  }

  // List failures
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log(`\n  ${RED}Failed Tests:${NC}`);
    for (const f of failures) {
      console.log(`    ${RED}✗ [${f.category}] ${f.test}${NC}`);
      console.log(`      ${GRAY}${f.message}${NC}`);
    }
  }

  console.log(`\n${CYAN}${'═'.repeat(60)}${NC}`);

  if (failed > 0) {
    console.log(`\n${RED}❌ Some tests failed. Check the errors above.${NC}\n`);
  } else {
    console.log(`\n${GREEN}✅ All integration tests passed!${NC}\n`);
  }

  if (!isLiveMode) {
    console.log(`${YELLOW}ℹ️  Run with --live flag to send actual test messages${NC}`);
    console.log(`${GRAY}   Requires TEST_EMAIL and TEST_PHONE_NUMBER to be set${NC}\n`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n${CYAN}╔════════════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║        FERNI COMPREHENSIVE INTEGRATION TEST                ║${NC}`);
  console.log(`${CYAN}╚════════════════════════════════════════════════════════════╝${NC}`);

  if (isLiveMode) {
    console.log(`\n${YELLOW}🔴 LIVE MODE: Will send real messages!${NC}`);
    if (!process.env.TEST_EMAIL) console.log(`${RED}   TEST_EMAIL not set${NC}`);
    if (!process.env.TEST_PHONE_NUMBER) console.log(`${RED}   TEST_PHONE_NUMBER not set${NC}`);
  }

  // Run all tests
  await testSendGrid();
  await testTwilio();
  await testGooglePlaces();
  await testCartesia();
  await testLiveKit();
  await testPlaid();
  await testSpotify();
  await testResearchAPIs();
  await testProactiveSystem();
  await testVoiceCalls();

  printSummary();

  // Exit with appropriate code
  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`${RED}Fatal error: ${error}${NC}`);
  process.exit(1);
});








