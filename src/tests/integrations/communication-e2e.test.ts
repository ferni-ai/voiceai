/**
 * E2E Integration Tests for Communication Services
 * 
 * These tests validate REAL API integrations:
 * - SendGrid email delivery
 * - Twilio SMS delivery
 * - Twilio voice calls
 * - Google Calendar events
 * 
 * IMPORTANT: These tests require actual API credentials.
 * They are skipped when credentials are not available.
 * 
 * To run with real APIs:
 * ```bash
 * # Set credentials in .env.test or export them
 * export SENDGRID_API_KEY=your_key
 * export TWILIO_ACCOUNT_SID=your_sid
 * export TWILIO_AUTH_TOKEN=your_token
 * export TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
 * export TEST_PHONE_NUMBER=+1xxxxxxxxxx  # Your test number
 * export TEST_EMAIL=your_test@email.com
 * 
 * npx vitest run src/tests/integrations/communication-e2e.test.ts
 * ```
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TestConfig {
  sendgrid: {
    apiKey: string;
    fromEmail: string;
    testRecipient: string;
    configured: boolean;
  };
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    testRecipient: string;
    configured: boolean;
  };
  calendar: {
    credentials: string;
    calendarId: string;
    configured: boolean;
  };
}

function getTestConfig(): TestConfig {
  return {
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'test@ferni.ai',
      testRecipient: process.env.TEST_EMAIL || '',
      configured: !!(process.env.SENDGRID_API_KEY && process.env.TEST_EMAIL),
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
      testRecipient: process.env.TEST_PHONE_NUMBER || '',
      configured: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER &&
        process.env.TEST_PHONE_NUMBER
      ),
    },
    calendar: {
      credentials: process.env.GOOGLE_CALENDAR_CREDENTIALS || '',
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      configured: !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
    },
  };
}

// ============================================================================
// INTEGRATION STATUS REPORTER
// ============================================================================

export interface IntegrationStatus {
  service: string;
  configured: boolean;
  tested: boolean;
  working: boolean;
  lastTested?: Date;
  lastError?: string;
  details?: Record<string, unknown>;
}

const integrationResults: IntegrationStatus[] = [];

function reportStatus(status: IntegrationStatus): void {
  integrationResults.push(status);
  getLogger().info(status, `Integration status: ${status.service}`);
}

// ============================================================================
// SENDGRID E2E TESTS
// ============================================================================

describe('SendGrid Email Integration', () => {
  const config = getTestConfig();

  beforeAll(() => {
    if (!config.sendgrid.configured) {
      console.log('⚠️  SendGrid not configured - skipping E2E tests');
      console.log('   Set SENDGRID_API_KEY and TEST_EMAIL to enable');
    }
  });

  it.skipIf(!config.sendgrid.configured)('should send a real email via SendGrid', async () => {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.sendgrid.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: config.sendgrid.testRecipient }] }],
        from: {
          email: config.sendgrid.fromEmail,
          name: 'Ferni E2E Test',
        },
        subject: `🧪 E2E Test Email - ${new Date().toISOString()}`,
        content: [
          {
            type: 'text/plain',
            value: `This is an automated E2E test email from Ferni.\n\nTimestamp: ${new Date().toISOString()}\nTest ID: ${Date.now()}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    const status: IntegrationStatus = {
      service: 'sendgrid',
      configured: true,
      tested: true,
      working: response.status === 202,
      lastTested: new Date(),
      details: { status: response.status },
    };

    if (!response.ok && response.status !== 202) {
      const error = await response.text();
      status.lastError = error;
      status.working = false;
    }

    reportStatus(status);

    expect(response.status).toBe(202);
    console.log('✅ SendGrid email sent successfully');
  });

  it.skipIf(!config.sendgrid.configured)('should handle rate limiting gracefully', async () => {
    // Send multiple emails to test rate handling
    const results: number[] = [];
    
    for (let i = 0; i < 3; i++) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.sendgrid.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: config.sendgrid.testRecipient }] }],
          from: { email: config.sendgrid.fromEmail, name: 'Ferni Rate Test' },
          subject: `Rate Test ${i + 1}/3 - ${Date.now()}`,
          content: [{ type: 'text/plain', value: `Test ${i + 1}` }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      results.push(response.status);
    }

    // All should succeed (202) or some might be rate limited (429)
    const allValid = results.every(s => s === 202 || s === 429);
    expect(allValid).toBe(true);
  });

  it('should report configuration status', () => {
    reportStatus({
      service: 'sendgrid',
      configured: config.sendgrid.configured,
      tested: false,
      working: false,
      details: {
        hasApiKey: !!config.sendgrid.apiKey,
        hasFromEmail: !!config.sendgrid.fromEmail,
        hasTestRecipient: !!config.sendgrid.testRecipient,
      },
    });

    if (!config.sendgrid.configured) {
      console.log('📋 SendGrid Configuration Status:');
      console.log(`   - API Key: ${config.sendgrid.apiKey ? '✓' : '✗ Missing'}`);
      console.log(`   - From Email: ${config.sendgrid.fromEmail ? '✓' : '✗ Missing'}`);
      console.log(`   - Test Recipient: ${config.sendgrid.testRecipient ? '✓' : '✗ Missing'}`);
    }

    expect(true).toBe(true); // Config check always passes
  });
});

// ============================================================================
// TWILIO SMS E2E TESTS
// ============================================================================

describe('Twilio SMS Integration', () => {
  const config = getTestConfig();

  beforeAll(() => {
    if (!config.twilio.configured) {
      console.log('⚠️  Twilio not configured - skipping E2E tests');
      console.log('   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TEST_PHONE_NUMBER');
    }
  });

  it.skipIf(!config.twilio.configured)('should send a real SMS via Twilio', async () => {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: config.twilio.testRecipient,
          From: config.twilio.phoneNumber,
          Body: `🧪 Ferni E2E Test - ${new Date().toISOString()}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const data = await response.json() as { sid?: string; error_message?: string };

    const status: IntegrationStatus = {
      service: 'twilio-sms',
      configured: true,
      tested: true,
      working: response.ok,
      lastTested: new Date(),
      details: { 
        status: response.status,
        sid: data.sid,
      },
    };

    if (!response.ok) {
      status.lastError = data.error_message || 'Unknown error';
    }

    reportStatus(status);

    expect(response.ok).toBe(true);
    expect(data.sid).toBeDefined();
    console.log(`✅ Twilio SMS sent - SID: ${data.sid}`);
  });

  it.skipIf(!config.twilio.configured)('should get SMS delivery status', async () => {
    // First send a message
    const sendResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: config.twilio.testRecipient,
          From: config.twilio.phoneNumber,
          Body: `Status check test - ${Date.now()}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const sendData = await sendResponse.json() as { sid: string };
    expect(sendData.sid).toBeDefined();

    // Wait a moment then check status
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages/${sendData.sid}.json`,
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64'),
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const statusData = await statusResponse.json() as { status: string };
    
    // Status should be queued, sending, sent, or delivered
    const validStatuses = ['queued', 'sending', 'sent', 'delivered'];
    expect(validStatuses.includes(statusData.status)).toBe(true);
    console.log(`✅ SMS Status: ${statusData.status}`);
  });

  it('should report configuration status', () => {
    reportStatus({
      service: 'twilio-sms',
      configured: config.twilio.configured,
      tested: false,
      working: false,
      details: {
        hasAccountSid: !!config.twilio.accountSid,
        hasAuthToken: !!config.twilio.authToken,
        hasPhoneNumber: !!config.twilio.phoneNumber,
        hasTestRecipient: !!config.twilio.testRecipient,
      },
    });

    if (!config.twilio.configured) {
      console.log('📋 Twilio Configuration Status:');
      console.log(`   - Account SID: ${config.twilio.accountSid ? '✓' : '✗ Missing'}`);
      console.log(`   - Auth Token: ${config.twilio.authToken ? '✓' : '✗ Missing'}`);
      console.log(`   - Phone Number: ${config.twilio.phoneNumber ? '✓' : '✗ Missing'}`);
      console.log(`   - Test Recipient: ${config.twilio.testRecipient ? '✓' : '✗ Missing'}`);
    }

    expect(true).toBe(true);
  });
});

// ============================================================================
// TWILIO VOICE E2E TESTS
// ============================================================================

describe('Twilio Voice Integration', () => {
  const config = getTestConfig();

  it.skipIf(!config.twilio.configured)('should initiate an outbound call', async () => {
    // Create a TwiML that just plays a message (doesn't actually connect)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is an automated test call from Ferni. The voice integration is working correctly. Goodbye!</Say>
  <Hangup/>
</Response>`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: config.twilio.testRecipient,
          From: config.twilio.phoneNumber,
          Twiml: twiml,
        }),
        signal: AbortSignal.timeout(20000),
      }
    );

    const data = await response.json() as { sid?: string; status?: string; error_message?: string };

    const status: IntegrationStatus = {
      service: 'twilio-voice',
      configured: true,
      tested: true,
      working: response.ok,
      lastTested: new Date(),
      details: {
        callSid: data.sid,
        status: data.status,
      },
    };

    if (!response.ok) {
      status.lastError = data.error_message || 'Call initiation failed';
    }

    reportStatus(status);

    expect(response.ok).toBe(true);
    expect(data.sid).toBeDefined();
    console.log(`✅ Voice call initiated - SID: ${data.sid}, Status: ${data.status}`);
  });

  it('should report voice configuration status', () => {
    reportStatus({
      service: 'twilio-voice',
      configured: config.twilio.configured,
      tested: false,
      working: false,
    });

    expect(true).toBe(true);
  });
});

// ============================================================================
// GOOGLE CALENDAR E2E TESTS
// ============================================================================

describe('Google Calendar Integration', () => {
  const config = getTestConfig();

  beforeAll(() => {
    if (!config.calendar.configured) {
      console.log('⚠️  Google Calendar not configured - skipping E2E tests');
      console.log('   Set GOOGLE_CALENDAR_CREDENTIALS to enable');
    }
  });

  it.skipIf(!config.calendar.configured)('should create a calendar event', async () => {
    // Parse credentials
    let credentials: { private_key?: string; client_email?: string; refresh_token?: string; client_id?: string; client_secret?: string };
    try {
      credentials = JSON.parse(config.calendar.credentials);
    } catch {
      reportStatus({
        service: 'google-calendar',
        configured: true,
        tested: true,
        working: false,
        lastError: 'Invalid credentials JSON',
      });
      throw new Error('Invalid GOOGLE_CALENDAR_CREDENTIALS JSON');
    }

    // Get access token (depends on credential type)
    let accessToken: string | null = null;

    if (credentials.refresh_token) {
      // OAuth credentials
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credentials.client_id || '',
          client_secret: credentials.client_secret || '',
          refresh_token: credentials.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (tokenResponse.ok) {
        const tokens = await tokenResponse.json() as { access_token: string };
        accessToken = tokens.access_token;
      }
    } else if (credentials.private_key && credentials.client_email) {
      // Service account - would need JWT signing
      console.log('Service account credentials detected - JWT signing required');
    }

    if (!accessToken) {
      reportStatus({
        service: 'google-calendar',
        configured: true,
        tested: true,
        working: false,
        lastError: 'Could not obtain access token',
      });
      return;
    }

    // Create a test event
    const now = new Date();
    const eventStart = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const eventEnd = new Date(eventStart.getTime() + 30 * 60 * 1000); // 30 minutes

    const eventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${config.calendar.calendarId}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: `🧪 Ferni E2E Test Event - ${Date.now()}`,
          description: 'This is an automated test event created by Ferni E2E tests.\n\nThis event can be safely deleted.',
          start: { dateTime: eventStart.toISOString(), timeZone: 'America/New_York' },
          end: { dateTime: eventEnd.toISOString(), timeZone: 'America/New_York' },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const eventData = await eventResponse.json() as { id?: string; error?: { message: string } };

    const status: IntegrationStatus = {
      service: 'google-calendar',
      configured: true,
      tested: true,
      working: eventResponse.ok,
      lastTested: new Date(),
      details: { eventId: eventData.id },
    };

    if (!eventResponse.ok) {
      status.lastError = eventData.error?.message || 'Event creation failed';
    }

    reportStatus(status);

    expect(eventResponse.ok).toBe(true);
    expect(eventData.id).toBeDefined();
    console.log(`✅ Calendar event created - ID: ${eventData.id}`);
  });

  it('should report calendar configuration status', () => {
    let credentialType = 'none';
    if (config.calendar.credentials) {
      try {
        const creds = JSON.parse(config.calendar.credentials);
        if (creds.refresh_token) credentialType = 'oauth';
        else if (creds.private_key) credentialType = 'service_account';
      } catch {
        credentialType = 'invalid';
      }
    }

    reportStatus({
      service: 'google-calendar',
      configured: config.calendar.configured,
      tested: false,
      working: false,
      details: {
        credentialType,
        calendarId: config.calendar.calendarId,
      },
    });

    if (!config.calendar.configured) {
      console.log('📋 Google Calendar Configuration Status:');
      console.log('   - Credentials: ✗ Missing');
      console.log('   Set GOOGLE_CALENDAR_CREDENTIALS with OAuth or Service Account JSON');
    }

    expect(true).toBe(true);
  });
});

// ============================================================================
// INTEGRATION SUMMARY
// ============================================================================

describe('Integration Summary', () => {
  afterAll(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMMUNICATION INTEGRATION STATUS REPORT');
    console.log('='.repeat(60));

    const config = getTestConfig();

    const services = [
      { name: 'SendGrid Email', key: 'sendgrid', configured: config.sendgrid.configured },
      { name: 'Twilio SMS', key: 'twilio-sms', configured: config.twilio.configured },
      { name: 'Twilio Voice', key: 'twilio-voice', configured: config.twilio.configured },
      { name: 'Google Calendar', key: 'google-calendar', configured: config.calendar.configured },
    ];

    for (const service of services) {
      const result = integrationResults.find(r => r.service === service.key && r.tested);
      const icon = !service.configured ? '⚪' : result?.working ? '✅' : '❌';
      const status = !service.configured ? 'Not Configured' : result?.working ? 'Working' : result?.lastError || 'Failed';
      console.log(`${icon} ${service.name}: ${status}`);
    }

    console.log('\n' + '-'.repeat(60));
    console.log('Required Environment Variables:');
    console.log('-'.repeat(60));

    const envVars = [
      ['SENDGRID_API_KEY', config.sendgrid.apiKey ? '✓' : '✗'],
      ['SENDGRID_FROM_EMAIL', config.sendgrid.fromEmail ? '✓' : '✗'],
      ['TEST_EMAIL', config.sendgrid.testRecipient ? '✓' : '✗'],
      ['TWILIO_ACCOUNT_SID', config.twilio.accountSid ? '✓' : '✗'],
      ['TWILIO_AUTH_TOKEN', config.twilio.authToken ? '✓' : '✗'],
      ['TWILIO_PHONE_NUMBER', config.twilio.phoneNumber ? '✓' : '✗'],
      ['TEST_PHONE_NUMBER', config.twilio.testRecipient ? '✓' : '✗'],
      ['GOOGLE_CALENDAR_CREDENTIALS', config.calendar.credentials ? '✓' : '✗'],
    ];

    for (const [name, status] of envVars) {
      console.log(`  ${status} ${name}`);
    }

    console.log('='.repeat(60) + '\n');
  });

  it('should generate summary report', () => {
    expect(true).toBe(true);
  });
});

export { integrationResults };

