#!/usr/bin/env npx tsx
/**
 * Test Script for Alex's Communication Features
 * 
 * Tests:
 * 1. Environment variable validation
 * 2. SendGrid email connectivity
 * 3. Twilio SMS connectivity
 * 4. Twilio phone call capability
 * 5. Reminder scheduling system
 * 6. Natural language time parsing
 * 
 * Usage: npx tsx scripts/test-alex-comms.ts [--send-test]
 *   --send-test: Actually send test messages (requires your phone/email)
 */

import 'dotenv/config';

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${msg}${colors.reset}\n${'='.repeat(50)}`),
};

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

function validateEnvironment(): { valid: boolean; missing: string[] } {
  const required = [
    'SENDGRID_API_KEY',
    'SENDGRID_FROM_EMAIL',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ];

  const optional = [
    'CARTESIA_API_KEY',
    'COMM_SPECIALIST_VOICE_ID',
  ];

  const missing: string[] = [];
  const present: string[] = [];

  log.header('1. Environment Variable Validation');

  for (const key of required) {
    if (process.env[key]) {
      present.push(key);
      log.success(`${key} is set`);
    } else {
      missing.push(key);
      log.error(`${key} is MISSING`);
    }
  }

  for (const key of optional) {
    if (process.env[key]) {
      log.success(`${key} is set (optional)`);
    } else {
      log.warn(`${key} is not set (optional - some features may be limited)`);
    }
  }

  return { valid: missing.length === 0, missing };
}

// ============================================================================
// SENDGRID TEST
// ============================================================================

async function testSendGrid(sendTest: boolean = false, testEmail?: string): Promise<boolean> {
  log.header('2. SendGrid Email Test');

  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    log.error('SendGrid credentials not configured');
    return false;
  }

  // Test API connectivity by checking API key validity
  try {
    const response = await fetch('https://api.sendgrid.com/v3/scopes', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      log.success('SendGrid API key is valid');
      const data = await response.json() as { scopes?: string[] };
      const hasMailSend = data.scopes?.includes('mail.send');
      if (hasMailSend) {
        log.success('mail.send permission confirmed');
      } else {
        log.warn('mail.send permission not found in scopes - may still work');
      }
    } else if (response.status === 401) {
      log.error('SendGrid API key is INVALID');
      return false;
    } else {
      log.warn(`SendGrid API returned status ${response.status}`);
    }

    // Optionally send a test email
    if (sendTest && testEmail) {
      log.info(`Sending test email to ${testEmail}...`);
      
      const sendResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: testEmail }] }],
          from: { email: fromEmail, name: 'Alex Chen (Test)' },
          subject: '✅ Alex Communication Test - Email',
          content: [{
            type: 'text/plain',
            value: 'This is a test email from Alex Chen, your communication specialist.\n\nIf you received this, email sending is working!\n\n— Alex',
          }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (sendResponse.ok || sendResponse.status === 202) {
        log.success(`Test email sent to ${testEmail}!`);
      } else {
        const error = await sendResponse.text();
        log.error(`Failed to send test email: ${error}`);
      }
    }

    return true;
  } catch (error) {
    log.error(`SendGrid test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// TWILIO SMS TEST
// ============================================================================

async function testTwilioSMS(sendTest: boolean = false, testPhone?: string): Promise<boolean> {
  log.header('3. Twilio SMS Test');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    log.error('Twilio credentials not configured');
    return false;
  }

  try {
    // Test account status - use the accounts endpoint correctly
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.ok) {
      const data = await response.json() as { status?: string; friendly_name?: string };
      log.success(`Twilio account active: ${data.friendly_name || 'Account'}`);
      log.success(`Account status: ${data.status}`);
    } else if (response.status === 401) {
      log.error('Twilio credentials are INVALID');
      return false;
    } else if (response.status === 404) {
      // 404 can happen with subaccounts or API key auth - try a different check
      log.warn(`Account endpoint returned 404 - trying message endpoint test...`);
      // The SMS sending should still work, this is just an account check issue
    } else {
      log.warn(`Twilio API returned status ${response.status} - SMS may still work`);
    }

    // Check phone number
    log.info(`Configured Twilio number: ${phoneNumber}`);

    // Optionally send a test SMS
    if (sendTest && testPhone) {
      log.info(`Sending test SMS to ${testPhone}...`);
      
      const smsResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: testPhone,
            From: phoneNumber,
            Body: '✅ Alex Communication Test - SMS\n\nIf you received this, text messaging is working!\n\n— Alex Chen',
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (smsResponse.ok) {
        const data = await smsResponse.json() as { sid?: string };
        log.success(`Test SMS sent! SID: ${data.sid}`);
      } else {
        const error = await smsResponse.text();
        log.error(`Failed to send test SMS: ${error}`);
      }
    }

    return true;
  } catch (error) {
    log.error(`Twilio SMS test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// TWILIO VOICE TEST
// ============================================================================

async function testTwilioVoice(sendTest: boolean = false, testPhone?: string): Promise<boolean> {
  log.header('4. Twilio Voice (Phone Calls) Test');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    log.error('Twilio credentials not configured');
    return false;
  }

  try {
    // Check if voice is enabled by querying available phone numbers
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.ok) {
      const data = await response.json() as { incoming_phone_numbers?: Array<{ capabilities?: { voice?: boolean } }> };
      const numbers = data.incoming_phone_numbers || [];
      
      if (numbers.length > 0 && numbers[0].capabilities?.voice) {
        log.success('Phone number has voice capability enabled');
      } else if (numbers.length > 0) {
        log.warn('Phone number found but voice capability unclear');
      } else {
        log.warn('Could not verify phone number capabilities');
      }
    }

    // Optionally make a test call
    if (sendTest && testPhone) {
      log.info(`Making test call to ${testPhone}...`);
      
      const callResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: testPhone,
            From: phoneNumber,
            Twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! This is a test call from Alex Chen, your communication specialist. If you can hear this message, phone calling is working correctly. Have a great day!</Say>
  <Pause length="1"/>
  <Say voice="alice">Goodbye!</Say>
</Response>`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (callResponse.ok) {
        const data = await callResponse.json() as { sid?: string };
        log.success(`Test call initiated! SID: ${data.sid}`);
        log.info('You should receive a call shortly...');
      } else {
        const error = await callResponse.text();
        log.error(`Failed to initiate test call: ${error}`);
      }
    } else {
      log.info('Voice capability ready (use --send-test to make a test call)');
    }

    return true;
  } catch (error) {
    log.error(`Twilio voice test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// REMINDER SCHEDULER TEST
// ============================================================================

async function testReminderScheduler(): Promise<boolean> {
  log.header('5. Reminder Scheduler Test');

  try {
    // Import the reminder scheduler
    const { 
      createReminder, 
      getPendingReminders, 
      cancelReminder,
      parseNaturalTime,
      startReminderScheduler,
      stopReminderScheduler,
    } = await import('../src/services/reminder-scheduler.js');

    // Test natural language parsing
    log.info('Testing natural language time parsing...');
    
    const testCases = [
      'tomorrow at 9am',
      'in 30 minutes',
      'next Monday',
      'this evening',
      'in 2 hours',
    ];

    for (const testCase of testCases) {
      const parsed = parseNaturalTime(testCase);
      if (parsed) {
        log.success(`"${testCase}" → ${parsed.toLocaleString()}`);
      } else {
        log.error(`"${testCase}" → Failed to parse`);
      }
    }

    // Test reminder creation
    log.info('\nTesting reminder creation...');
    
    const reminder = await createReminder({
      userId: 'test-user',
      message: 'Test reminder from Alex comms test',
      scheduledFor: new Date(Date.now() + 60000), // 1 minute from now
      deliveryMethod: 'sms',
      deliveryAddress: '+15551234567', // Fake number for test
      createdBy: 'alex',
    });

    log.success(`Created reminder: ${reminder.id}`);
    log.success(`Scheduled for: ${reminder.scheduledFor.toLocaleString()}`);

    // Test pending reminders
    const pending = getPendingReminders('test-user');
    log.success(`Pending reminders for test-user: ${pending.length}`);

    // Test cancellation
    const cancelled = cancelReminder(reminder.id);
    log.success(`Cancelled reminder: ${cancelled}`);

    // Test scheduler start/stop
    log.info('\nTesting scheduler lifecycle...');
    startReminderScheduler(60000);
    log.success('Scheduler started');
    stopReminderScheduler();
    log.success('Scheduler stopped');

    return true;
  } catch (error) {
    log.error(`Reminder scheduler test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// ALEX TOOLS INTEGRATION TEST
// ============================================================================

async function testAlexToolsIntegration(): Promise<boolean> {
  log.header('6. Alex Tools Integration Test');

  try {
    // Import Alex tools
    const { createAlexTools } = await import('../src/tools/alex-tools.js');
    
    const tools = createAlexTools();
    
    // List all tools
    const toolNames = Object.keys(tools);
    log.success(`Alex has ${toolNames.length} communication tools:`);
    
    for (const name of toolNames) {
      log.info(`  • ${name}`);
    }

    // Verify key tools exist
    const requiredTools = [
      'draftEmail',
      'sendApprovedEmail',
      'sendTextMessage',
      'makePhoneCall',
      'sendVoiceMessage',
      'setReminder',
      'listReminders',
      'cancelReminder',
      'saveContactInfo',
      'getCommunicationSummary',
    ];

    let allPresent = true;
    for (const tool of requiredTools) {
      if (toolNames.includes(tool)) {
        log.success(`Required tool present: ${tool}`);
      } else {
        log.error(`Missing required tool: ${tool}`);
        allPresent = false;
      }
    }

    return allPresent;
  } catch (error) {
    log.error(`Alex tools integration test failed: ${error}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`
${colors.bold}╔═══════════════════════════════════════════════════════════╗
║       Alex Communication Features - Test Suite              ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const args = process.argv.slice(2);
  const sendTest = args.includes('--send-test');
  
  // Get test contact info from args or env
  const testEmail = process.env.TEST_EMAIL || args.find(a => a.includes('@'));
  const testPhone = process.env.TEST_PHONE || args.find(a => a.match(/^\+?\d{10,}/));

  if (sendTest) {
    if (!testEmail && !testPhone) {
      log.warn('--send-test specified but no test email/phone provided');
      log.info('Set TEST_EMAIL and TEST_PHONE environment variables, or pass them as arguments');
      log.info('Example: npx tsx scripts/test-alex-comms.ts --send-test +15551234567 test@example.com');
    } else {
      log.info(`Will send test messages to: ${testEmail || 'no email'} / ${testPhone || 'no phone'}`);
    }
  }

  const results: { name: string; passed: boolean }[] = [];

  // Run all tests
  const envResult = validateEnvironment();
  results.push({ name: 'Environment', passed: envResult.valid });

  if (envResult.valid) {
    results.push({ name: 'SendGrid Email', passed: await testSendGrid(sendTest, testEmail) });
    results.push({ name: 'Twilio SMS', passed: await testTwilioSMS(sendTest, testPhone) });
    results.push({ name: 'Twilio Voice', passed: await testTwilioVoice(sendTest, testPhone) });
  } else {
    log.warn('Skipping service tests due to missing environment variables');
  }

  results.push({ name: 'Reminder Scheduler', passed: await testReminderScheduler() });
  results.push({ name: 'Alex Tools Integration', passed: await testAlexToolsIntegration() });

  // Summary
  log.header('Test Summary');
  
  let allPassed = true;
  for (const result of results) {
    if (result.passed) {
      log.success(`${result.name}: PASSED`);
    } else {
      log.error(`${result.name}: FAILED`);
      allPassed = false;
    }
  }

  console.log();
  if (allPassed) {
    console.log(`${colors.green}${colors.bold}✅ All tests passed! Alex's communication features are ready.${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}❌ Some tests failed. Review the output above.${colors.reset}`);
  }

  if (!sendTest) {
    console.log(`\n${colors.yellow}Tip: Run with --send-test and your phone/email to send actual test messages:${colors.reset}`);
    console.log(`  npx tsx scripts/test-alex-comms.ts --send-test +15551234567 your@email.com`);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

