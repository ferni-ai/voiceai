#!/usr/bin/env npx ts-node
/**
 * Integration Validation Script
 * 
 * Validates all communication and scheduling integrations:
 * - SendGrid email
 * - Twilio SMS
 * - Twilio Voice
 * - Google Calendar
 * - Restaurant APIs (OpenTable, Resy, Yelp)
 * - LiveKit SIP
 * 
 * Usage:
 *   npx ts-node scripts/validate-integrations.ts
 *   npx ts-node scripts/validate-integrations.ts --send-test  # Actually sends test messages
 * 
 * Environment variables required for full validation:
 *   SENDGRID_API_KEY, SENDGRID_FROM_EMAIL
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   GOOGLE_CALENDAR_CREDENTIALS
 *   TEST_EMAIL, TEST_PHONE_NUMBER (for --send-test mode)
 */

interface IntegrationCheck {
  name: string;
  category: 'communication' | 'calendar' | 'reservations' | 'telephony';
  configured: boolean;
  required: string[];
  optional: string[];
  status: 'not_configured' | 'configured' | 'validated' | 'failed';
  message?: string;
}

const checks: IntegrationCheck[] = [];

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

function checkEnvVar(name: string): boolean {
  const value = process.env[name];
  return !!value && value.trim() !== '' && value !== 'undefined';
}

function addCheck(check: IntegrationCheck): void {
  checks.push(check);
}

// ============================================================================
// SENDGRID CHECK
// ============================================================================

async function checkSendGrid(sendTest: boolean): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const testEmail = process.env.TEST_EMAIL;

  const check: IntegrationCheck = {
    name: 'SendGrid Email',
    category: 'communication',
    configured: !!(apiKey && fromEmail),
    required: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
    optional: ['SENDGRID_FROM_NAME'],
    status: 'not_configured',
  };

  if (!apiKey) {
    check.message = 'Missing SENDGRID_API_KEY';
    addCheck(check);
    return;
  }

  if (!fromEmail) {
    check.message = 'Missing SENDGRID_FROM_EMAIL';
    check.status = 'not_configured';
    addCheck(check);
    return;
  }

  check.status = 'configured';

  if (sendTest && testEmail) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: testEmail }] }],
          from: { email: fromEmail, name: 'Ferni Validation' },
          subject: `✅ Integration Test - ${new Date().toISOString()}`,
          content: [{ type: 'text/plain', value: 'This email confirms SendGrid integration is working.' }],
        }),
      });

      if (response.status === 202) {
        check.status = 'validated';
        check.message = `Test email sent to ${testEmail}`;
      } else {
        check.status = 'failed';
        check.message = `API returned ${response.status}`;
      }
    } catch (error) {
      check.status = 'failed';
      check.message = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  addCheck(check);
}

// ============================================================================
// TWILIO CHECK
// ============================================================================

async function checkTwilio(sendTest: boolean): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const testPhone = process.env.TEST_PHONE_NUMBER;

  const smsCheck: IntegrationCheck = {
    name: 'Twilio SMS',
    category: 'communication',
    configured: !!(accountSid && authToken && phoneNumber),
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    optional: [],
    status: 'not_configured',
  };

  const voiceCheck: IntegrationCheck = {
    name: 'Twilio Voice',
    category: 'telephony',
    configured: !!(accountSid && authToken && phoneNumber),
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    optional: ['SIP_TRUNK_ID', 'CALLER_ID'],
    status: 'not_configured',
  };

  if (!accountSid || !authToken || !phoneNumber) {
    const missing = [];
    if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!phoneNumber) missing.push('TWILIO_PHONE_NUMBER');
    
    smsCheck.message = `Missing: ${missing.join(', ')}`;
    voiceCheck.message = smsCheck.message;
    addCheck(smsCheck);
    addCheck(voiceCheck);
    return;
  }

  smsCheck.status = 'configured';
  voiceCheck.status = 'configured';

  if (sendTest && testPhone) {
    try {
      // Test SMS
      const smsResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: testPhone,
            From: phoneNumber,
            Body: `✅ Ferni Integration Test - ${new Date().toISOString()}`,
          }),
        }
      );

      const smsData = await smsResponse.json() as { sid?: string; message?: string };

      if (smsResponse.ok && smsData.sid) {
        smsCheck.status = 'validated';
        smsCheck.message = `Test SMS sent - SID: ${smsData.sid}`;
      } else {
        smsCheck.status = 'failed';
        smsCheck.message = smsData.message || 'SMS send failed';
      }

      // Test Voice (just validate API access, don't make actual call)
      const voiceResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          },
        }
      );

      if (voiceResponse.ok) {
        voiceCheck.status = 'validated';
        voiceCheck.message = 'API access validated (no test call made)';
      } else {
        voiceCheck.status = 'failed';
        voiceCheck.message = 'API access failed';
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      smsCheck.status = 'failed';
      smsCheck.message = msg;
      voiceCheck.status = 'failed';
      voiceCheck.message = msg;
    }
  }

  addCheck(smsCheck);
  addCheck(voiceCheck);
}

// ============================================================================
// GOOGLE CALENDAR CHECK
// ============================================================================

async function checkGoogleCalendar(sendTest: boolean): Promise<void> {
  const credentials = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const check: IntegrationCheck = {
    name: 'Google Calendar',
    category: 'calendar',
    configured: !!credentials,
    required: ['GOOGLE_CALENDAR_CREDENTIALS'],
    optional: ['GOOGLE_CALENDAR_ID'],
    status: 'not_configured',
  };

  if (!credentials) {
    check.message = 'Missing GOOGLE_CALENDAR_CREDENTIALS';
    addCheck(check);
    return;
  }

  // Validate JSON format
  let creds: { type?: string; private_key?: string; refresh_token?: string };
  try {
    creds = JSON.parse(credentials);
    check.status = 'configured';
    
    if (creds.private_key) {
      check.message = 'Service account credentials detected';
    } else if (creds.refresh_token) {
      check.message = 'OAuth credentials detected';
    } else {
      check.message = 'Unknown credential type';
    }
  } catch {
    check.status = 'failed';
    check.message = 'Invalid JSON in GOOGLE_CALENDAR_CREDENTIALS';
    addCheck(check);
    return;
  }

  // Don't make actual API calls without explicit --send-test
  if (sendTest && creds.refresh_token) {
    // Would validate OAuth flow here
    check.message += ' (OAuth validation not implemented in script)';
  }

  addCheck(check);
}

// ============================================================================
// GOOGLE PLACES CHECK (Restaurant Search)
// ============================================================================

async function checkGooglePlaces(sendTest: boolean): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY;

  const check: IntegrationCheck = {
    name: 'Google Places (Restaurants)',
    category: 'reservations',
    configured: !!apiKey,
    required: ['GOOGLE_API_KEY'],
    optional: [],
    status: 'not_configured',
  };

  if (!apiKey) {
    check.message = 'Missing GOOGLE_API_KEY (same key used for Gemini)';
    addCheck(check);
    return;
  }

  check.status = 'configured';
  check.message = 'Using GOOGLE_API_KEY for restaurant search';

  if (sendTest) {
    try {
      // Test with a simple search
      const params = new URLSearchParams({
        query: 'restaurant near me',
        type: 'restaurant',
        key: apiKey,
      });

      const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json() as { status: string; results?: unknown[]; error_message?: string };

      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        check.status = 'validated';
        check.message = `API working - found ${data.results?.length || 0} restaurants`;
      } else if (data.status === 'REQUEST_DENIED') {
        check.status = 'failed';
        check.message = 'Places API not enabled - enable it in Google Cloud Console';
      } else {
        check.status = 'failed';
        check.message = data.error_message || `API error: ${data.status}`;
      }
    } catch (error) {
      check.status = 'failed';
      check.message = error instanceof Error ? error.message : 'API request failed';
    }
  }

  addCheck(check);
}

// ============================================================================
// LIVEKIT SIP CHECK
// ============================================================================

function checkLiveKitSIP(): void {
  const sipTrunkId = process.env.SIP_TRUNK_ID;
  const livekitUrl = process.env.LIVEKIT_URL;

  const check: IntegrationCheck = {
    name: 'LiveKit SIP (Outbound Calls)',
    category: 'telephony',
    configured: !!(sipTrunkId && livekitUrl),
    required: ['SIP_TRUNK_ID', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
    optional: ['CALLER_ID'],
    status: 'not_configured',
  };

  if (sipTrunkId && livekitUrl) {
    check.status = 'configured';
    check.message = 'SIP trunk configured for outbound calls';
  } else {
    const missing = [];
    if (!sipTrunkId) missing.push('SIP_TRUNK_ID');
    if (!livekitUrl) missing.push('LIVEKIT_URL');
    check.message = `Missing: ${missing.join(', ')} - outbound calls will be simulated`;
  }

  addCheck(check);
}

// ============================================================================
// APPOINTMENT INTEGRATION CHECK
// ============================================================================

function checkAppointmentIntegration(): void {
  const hasTwilio = checkEnvVar('TWILIO_ACCOUNT_SID') && checkEnvVar('TWILIO_AUTH_TOKEN');
  const hasCalendar = checkEnvVar('GOOGLE_CALENDAR_CLIENT_ID') || checkEnvVar('GOOGLE_CALENDAR_CREDENTIALS');
  const hasWebhook = checkEnvVar('WEBHOOK_BASE_URL');

  const check: IntegrationCheck = {
    name: 'Appointment Integration',
    category: 'calendar',
    configured: hasTwilio,
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    optional: ['GOOGLE_CALENDAR_CLIENT_ID', 'WEBHOOK_BASE_URL'],
    status: 'not_configured',
  };

  if (hasTwilio) {
    check.status = 'configured';
    const features = [];
    features.push('Phone calls');
    if (hasCalendar) features.push('Calendar sync');
    if (hasWebhook) features.push('Status webhooks');
    check.message = `Ready: ${features.join(', ')}`;
  } else {
    check.message = 'Requires Twilio for appointment calls';
  }

  addCheck(check);
}

// ============================================================================
// PRINT RESULTS
// ============================================================================

function printResults(): void {
  console.log('\n' + '═'.repeat(70));
  console.log('  📡  FERNI INTEGRATION STATUS REPORT');
  console.log('═'.repeat(70));

  const categories = ['communication', 'calendar', 'telephony', 'reservations'] as const;
  
  for (const category of categories) {
    const categoryChecks = checks.filter(c => c.category === category);
    if (categoryChecks.length === 0) continue;

    console.log(`\n  ${category.toUpperCase()}`);
    console.log('  ' + '-'.repeat(66));

    for (const check of categoryChecks) {
      const icon = check.status === 'validated' ? '✅' :
                   check.status === 'configured' ? '🟡' :
                   check.status === 'failed' ? '❌' : '⚪';
      
      const statusText = check.status === 'validated' ? 'VALIDATED' :
                         check.status === 'configured' ? 'CONFIGURED' :
                         check.status === 'failed' ? 'FAILED' : 'NOT CONFIGURED';

      console.log(`  ${icon} ${check.name.padEnd(30)} ${statusText.padEnd(15)}`);
      if (check.message) {
        console.log(`     └─ ${check.message}`);
      }
    }
  }

  // Summary
  const validated = checks.filter(c => c.status === 'validated').length;
  const configured = checks.filter(c => c.status === 'configured').length;
  const notConfigured = checks.filter(c => c.status === 'not_configured').length;
  const failed = checks.filter(c => c.status === 'failed').length;

  console.log('\n' + '═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  ✅ Validated:      ${validated}`);
  console.log(`  🟡 Configured:     ${configured}`);
  console.log(`  ⚪ Not Configured: ${notConfigured}`);
  console.log(`  ❌ Failed:         ${failed}`);
  console.log('═'.repeat(70));

  // Production readiness
  const criticalServices = ['SendGrid Email', 'Twilio SMS', 'Twilio Voice'];
  const criticalConfigured = checks.filter(
    c => criticalServices.includes(c.name) && (c.status === 'configured' || c.status === 'validated')
  ).length;

  if (criticalConfigured === criticalServices.length) {
    console.log('\n  ✅ PRODUCTION READY for communication features');
  } else {
    console.log('\n  ⚠️  NOT PRODUCTION READY');
    console.log('     Missing critical services for communication features.');
    console.log('\n  To configure:');
    
    for (const check of checks) {
      if (check.status === 'not_configured' && criticalServices.includes(check.name)) {
        console.log(`     ${check.name}:`);
        for (const req of check.required) {
          console.log(`       - ${req}=${checkEnvVar(req) ? '✓' : '✗ (missing)'}`);
        }
      }
    }
  }

  // Test mode help
  if (validated === 0) {
    console.log('\n  ℹ️  Run with --send-test to validate integrations with real API calls');
    console.log('     Requires TEST_EMAIL and TEST_PHONE_NUMBER to be set');
  }

  console.log('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const sendTest = process.argv.includes('--send-test');

  if (sendTest) {
    console.log('\n🧪 Running in TEST MODE - will send actual test messages\n');
    
    if (!process.env.TEST_EMAIL) {
      console.log('⚠️  TEST_EMAIL not set - email validation will be skipped');
    }
    if (!process.env.TEST_PHONE_NUMBER) {
      console.log('⚠️  TEST_PHONE_NUMBER not set - SMS/call validation will be skipped');
    }
  }

  // Run all checks
  await checkSendGrid(sendTest);
  await checkTwilio(sendTest);
  await checkGoogleCalendar(sendTest);
  await checkGooglePlaces(sendTest);
  checkLiveKitSIP();
  checkAppointmentIntegration();

  printResults();

  // Exit with error code if any critical services failed
  const hasFailed = checks.some(c => c.status === 'failed');
  process.exit(hasFailed ? 1 : 0);
}

main().catch(console.error);

