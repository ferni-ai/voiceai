#!/usr/bin/env npx tsx
/**
 * E2E Test Script for Voice Message + MMS Integration
 *
 * Tests the complete flow:
 * 1. Environment variable validation
 * 2. Cartesia TTS API connection and audio generation
 * 3. Google Cloud Storage bucket access and upload
 * 4. Twilio MMS sending with media attachment
 * 5. Full integration test
 *
 * Usage:
 *   npx tsx scripts/test-voice-mms-e2e.ts           # Validate configuration
 *   npx tsx scripts/test-voice-mms-e2e.ts --test    # Run full test (no actual send)
 *   npx tsx scripts/test-voice-mms-e2e.ts --send    # Actually send test MMS (requires TEST_PHONE)
 *
 * Environment variables required:
 *   CARTESIA_API_KEY          - Cartesia TTS API key
 *   GOOGLE_CLOUD_PROJECT      - GCP project ID (or GCS_VOICE_BUCKET)
 *   GCS_VOICE_BUCKET          - Optional: explicit bucket name
 *   TWILIO_ACCOUNT_SID        - Twilio account SID
 *   TWILIO_AUTH_TOKEN         - Twilio auth token
 *   TWILIO_PHONE_NUMBER       - Twilio phone number (with MMS capability)
 *   TEST_PHONE                - Your phone number for --send mode
 */

import 'dotenv/config';

// ANSI colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const log = {
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`${colors.cyan}→${colors.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${colors.bold}${colors.magenta}${msg}${colors.reset}\n${'─'.repeat(60)}`),
  subheader: (msg: string) => console.log(`\n${colors.bold}${msg}${colors.reset}`),
  dim: (msg: string) => console.log(`${colors.dim}  ${msg}${colors.reset}`),
};

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

function addResult(result: TestResult): void {
  results.push(result);
  if (result.passed) {
    log.success(`${result.name}: ${result.message}`);
  } else {
    log.error(`${result.name}: ${result.message}`);
  }
  if (result.duration) {
    log.dim(`Duration: ${result.duration}ms`);
  }
}

// ============================================================================
// 1. ENVIRONMENT VALIDATION
// ============================================================================

function validateEnvironment(): boolean {
  log.header('1. Environment Variable Validation');

  const required: Record<string, string> = {
    CARTESIA_API_KEY: 'Cartesia TTS API key for voice generation',
    TWILIO_ACCOUNT_SID: 'Twilio account SID for SMS/MMS',
    TWILIO_AUTH_TOKEN: 'Twilio auth token',
    TWILIO_PHONE_NUMBER: 'Twilio phone number (MMS-enabled)',
  };

  const gcsRequired = {
    GCS_VOICE_BUCKET: 'GCS bucket for audio storage',
    GOOGLE_CLOUD_PROJECT: 'GCP project ID (auto-derives bucket)',
  };

  const optional: Record<string, string> = {
    TEST_PHONE: 'Your phone number for --send mode',
    GOOGLE_APPLICATION_CREDENTIALS: 'Path to GCP service account JSON',
  };

  let allValid = true;

  // Check required vars
  log.subheader('Required Variables:');
  for (const [key, desc] of Object.entries(required)) {
    if (process.env[key]) {
      log.success(`${key} is set`);
      log.dim(desc);
    } else {
      log.error(`${key} is MISSING`);
      log.dim(desc);
      allValid = false;
    }
  }

  // Check GCS (one of two required)
  log.subheader('GCS Configuration (one required):');
  const hasGcsBucket = !!process.env.GCS_VOICE_BUCKET;
  const hasGcpProject = !!process.env.GOOGLE_CLOUD_PROJECT;

  if (hasGcsBucket) {
    log.success(`GCS_VOICE_BUCKET is set: ${process.env.GCS_VOICE_BUCKET}`);
  } else if (hasGcpProject) {
    const derivedBucket = `${process.env.GOOGLE_CLOUD_PROJECT}-voice-audio`;
    log.success(`GOOGLE_CLOUD_PROJECT is set, will use bucket: ${derivedBucket}`);
  } else {
    log.error('Neither GCS_VOICE_BUCKET nor GOOGLE_CLOUD_PROJECT is set');
    log.dim('GCS is required for hosting audio files for MMS');
    allValid = false;
  }

  // Check optional vars
  log.subheader('Optional Variables:');
  for (const [key, desc] of Object.entries(optional)) {
    if (process.env[key]) {
      log.success(`${key} is set`);
    } else {
      log.warn(`${key} is not set`);
    }
    log.dim(desc);
  }

  addResult({
    name: 'Environment Validation',
    passed: allValid,
    message: allValid ? 'All required variables configured' : 'Missing required variables',
  });

  return allValid;
}

// ============================================================================
// 2. CARTESIA TTS TEST
// ============================================================================

async function testCartesiaTTS(): Promise<{ passed: boolean; audioBuffer?: Buffer }> {
  log.header('2. Cartesia TTS API Test');

  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    addResult({
      name: 'Cartesia TTS',
      passed: false,
      message: 'API key not configured',
    });
    return { passed: false };
  }

  const testText = "Hey, this is a test voice message from Ferni. Hope you're having a great day!";

  log.step('Generating test audio with Cartesia TTS...');
  log.dim(`Text: "${testText}"`);

  const startTime = Date.now();

  try {
    // Use Ferni's voice ID (from voice-registry)
    const voiceId = 'a0e99841-438c-4a64-b679-ae501e7d6091'; // Ferni's voice

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: testText,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 44100,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      addResult({
        name: 'Cartesia TTS',
        passed: false,
        message: `API error: ${response.status} - ${errorText}`,
        duration,
      });
      return { passed: false };
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    addResult({
      name: 'Cartesia TTS',
      passed: true,
      message: `Generated ${audioBuffer.length} bytes of audio`,
      duration,
      details: {
        audioSize: audioBuffer.length,
        format: 'mp3',
        sampleRate: 44100,
      },
    });

    log.dim(`Audio size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

    return { passed: true, audioBuffer };
  } catch (error) {
    const duration = Date.now() - startTime;
    addResult({
      name: 'Cartesia TTS',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      duration,
    });
    return { passed: false };
  }
}

// ============================================================================
// 3. GCS UPLOAD TEST
// ============================================================================

async function testGCSUpload(audioBuffer: Buffer): Promise<{ passed: boolean; audioUrl?: string }> {
  log.header('3. Google Cloud Storage Test');

  const gcsBucket =
    process.env.GCS_VOICE_BUCKET ||
    (process.env.GOOGLE_CLOUD_PROJECT ? `${process.env.GOOGLE_CLOUD_PROJECT}-voice-audio` : '');

  if (!gcsBucket) {
    addResult({
      name: 'GCS Upload',
      passed: false,
      message: 'No GCS bucket configured',
    });
    return { passed: false };
  }

  log.step(`Uploading to bucket: ${gcsBucket}`);

  const startTime = Date.now();
  const filename = `test-voice-mms/test-${Date.now()}.mp3`;

  try {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const bucket = storage.bucket(gcsBucket);

    // First check if bucket exists and is accessible
    log.step('Checking bucket access...');
    const [exists] = await bucket.exists();

    if (!exists) {
      // Try to create the bucket
      log.warn(`Bucket ${gcsBucket} does not exist, attempting to create...`);
      try {
        await storage.createBucket(gcsBucket, {
          location: 'us-central1',
          storageClass: 'STANDARD',
        });
        log.success(`Created bucket: ${gcsBucket}`);
      } catch (createError) {
        addResult({
          name: 'GCS Upload',
          passed: false,
          message: `Bucket does not exist and could not create: ${createError}`,
          duration: Date.now() - startTime,
        });
        return { passed: false };
      }
    }

    // Upload the file
    log.step('Uploading audio file...');
    const file = bucket.file(filename);

    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=3600',
      },
      public: true,
    });

    const audioUrl = `https://storage.googleapis.com/${gcsBucket}/${filename}`;
    const duration = Date.now() - startTime;

    // Verify the file is accessible
    log.step('Verifying public access...');
    const verifyResponse = await fetch(audioUrl, { method: 'HEAD' });

    if (!verifyResponse.ok) {
      addResult({
        name: 'GCS Upload',
        passed: false,
        message: `File uploaded but not publicly accessible: ${verifyResponse.status}`,
        duration,
      });
      return { passed: false };
    }

    addResult({
      name: 'GCS Upload',
      passed: true,
      message: `Uploaded to ${audioUrl}`,
      duration,
      details: {
        bucket: gcsBucket,
        filename,
        publicUrl: audioUrl,
      },
    });

    log.dim(`Public URL: ${audioUrl}`);

    return { passed: true, audioUrl };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide helpful hints for common errors
    if (errorMsg.includes('Could not load the default credentials')) {
      log.warn('Hint: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path');
    } else if (errorMsg.includes('does not have storage')) {
      log.warn('Hint: Grant Storage Admin role to your service account');
    }

    addResult({
      name: 'GCS Upload',
      passed: false,
      message: `Error: ${errorMsg}`,
      duration,
    });
    return { passed: false };
  }
}

// ============================================================================
// 4. TWILIO MMS TEST
// ============================================================================

async function testTwilioMMS(
  audioUrl: string,
  actualSend: boolean = false
): Promise<{ passed: boolean }> {
  log.header('4. Twilio MMS Test');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const testPhone = process.env.TEST_PHONE;

  if (!accountSid || !authToken || !fromNumber) {
    addResult({
      name: 'Twilio MMS',
      passed: false,
      message: 'Twilio credentials not configured',
    });
    return { passed: false };
  }

  // First, verify Twilio credentials
  log.step('Verifying Twilio credentials...');

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    // Check account status
    const accountResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!accountResponse.ok) {
      addResult({
        name: 'Twilio MMS',
        passed: false,
        message: `Twilio auth failed: ${accountResponse.status}`,
      });
      return { passed: false };
    }

    const accountData = (await accountResponse.json()) as { status: string; friendly_name: string };
    log.success(`Twilio account verified: ${accountData.friendly_name}`);
    log.dim(`Account status: ${accountData.status}`);

    // Check if the phone number supports MMS
    log.step('Checking MMS capability...');

    const phoneResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(fromNumber)}`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (phoneResponse.ok) {
      const phoneData = (await phoneResponse.json()) as {
        incoming_phone_numbers: Array<{
          capabilities: { mms: boolean; sms: boolean };
          phone_number: string;
        }>;
      };
      if (phoneData.incoming_phone_numbers?.length > 0) {
        const capabilities = phoneData.incoming_phone_numbers[0].capabilities;
        if (capabilities?.mms) {
          log.success(`Phone ${fromNumber} supports MMS`);
        } else {
          log.warn(`Phone ${fromNumber} may not support MMS - SMS only`);
        }
      }
    }

    if (!actualSend) {
      addResult({
        name: 'Twilio MMS',
        passed: true,
        message: 'Credentials verified (use --send to actually send)',
      });
      return { passed: true };
    }

    // Actually send the MMS
    if (!testPhone) {
      addResult({
        name: 'Twilio MMS',
        passed: false,
        message: 'TEST_PHONE not set - cannot send test MMS',
      });
      return { passed: false };
    }

    log.step(`Sending MMS to ${testPhone}...`);

    const cleanPhone = testPhone.replace(/\D/g, '');
    const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    const startTime = Date.now();
    const mmsResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: e164Phone,
          From: fromNumber,
          Body: '🎤 Test voice message from Ferni E2E test',
          MediaUrl: audioUrl,
        }),
      }
    );

    const duration = Date.now() - startTime;

    if (!mmsResponse.ok) {
      const errorText = await mmsResponse.text();
      addResult({
        name: 'Twilio MMS',
        passed: false,
        message: `MMS send failed: ${errorText}`,
        duration,
      });
      return { passed: false };
    }

    const mmsData = (await mmsResponse.json()) as { sid: string; status: string };

    addResult({
      name: 'Twilio MMS',
      passed: true,
      message: `MMS sent! SID: ${mmsData.sid}`,
      duration,
      details: {
        messageSid: mmsData.sid,
        status: mmsData.status,
        to: e164Phone,
        mediaUrl: audioUrl,
      },
    });

    log.success(`📱 Check your phone for the voice message!`);

    return { passed: true };
  } catch (error) {
    addResult({
      name: 'Twilio MMS',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { passed: false };
  }
}

// ============================================================================
// 5. FULL INTEGRATION TEST (Using reminder-scheduler)
// ============================================================================

async function testFullIntegration(actualSend: boolean = false): Promise<{ passed: boolean }> {
  log.header('5. Full Integration Test (reminder-scheduler)');

  if (!actualSend) {
    log.info('Skipping full integration test (use --send to run)');
    addResult({
      name: 'Full Integration',
      passed: true,
      message: 'Skipped (use --send flag)',
    });
    return { passed: true };
  }

  const testPhone = process.env.TEST_PHONE;
  if (!testPhone) {
    addResult({
      name: 'Full Integration',
      passed: false,
      message: 'TEST_PHONE not set',
    });
    return { passed: false };
  }

  try {
    log.step('Creating voice message via reminder-scheduler...');

    // Import the actual service
    const { createVoiceMessage, sendVoiceMessage } =
      await import('../src/services/reminder-scheduler.js');

    const startTime = Date.now();

    // Create a voice message
    const voiceMessage = await createVoiceMessage({
      userId: 'test-user',
      message:
        "Hey! Just wanted to check in and see how you're doing. This is Ferni testing the voice message system.",
      voiceId: 'ferni',
    });

    log.dim(`Voice message created: ${voiceMessage.id}`);
    log.dim(`Status: ${voiceMessage.status}`);

    if (voiceMessage.audioUrl) {
      log.success(`Audio URL: ${voiceMessage.audioUrl}`);
    }

    // Send the voice message
    log.step('Sending voice message...');
    const result = await sendVoiceMessage(voiceMessage.id, testPhone);

    const duration = Date.now() - startTime;

    const success = !result.includes('trouble') && !result.includes('error');

    addResult({
      name: 'Full Integration',
      passed: success,
      message: result,
      duration,
      details: {
        voiceMessageId: voiceMessage.id,
        audioUrl: voiceMessage.audioUrl,
        status: voiceMessage.status,
      },
    });

    if (success) {
      log.success('📱 Full E2E test complete! Check your phone.');
    }

    return { passed: success };
  } catch (error) {
    addResult({
      name: 'Full Integration',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { passed: false };
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(): void {
  log.header('📊 Test Summary');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n  Total:  ${total}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.bold}Failed Tests:${colors.reset}`);
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.name}: ${result.message}`);
    }
  }

  console.log('');

  if (failed === 0) {
    console.log(`${colors.green}${colors.bold}✅ All tests passed!${colors.reset}`);
  } else {
    console.log(
      `${colors.red}${colors.bold}❌ Some tests failed. See details above.${colors.reset}`
    );
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runTest = args.includes('--test');
  const actualSend = args.includes('--send');

  console.log(`
${colors.bold}${colors.magenta}╔════════════════════════════════════════════════════════════╗
║          Voice Message + MMS E2E Integration Test          ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (actualSend) {
    log.warn('🚀 LIVE MODE: Will actually send MMS to TEST_PHONE');
    console.log('');
  }

  // 1. Validate environment
  const envValid = validateEnvironment();

  if (!envValid) {
    log.error('\nFix environment variables before continuing.');
    printSummary();
    return;
  }

  // 2. Test Cartesia TTS
  const { passed: ttsOk, audioBuffer } = await testCartesiaTTS();

  if (!ttsOk || !audioBuffer) {
    log.error('\nCartesia TTS failed - cannot continue.');
    printSummary();
    return;
  }

  // 3. Test GCS Upload
  const { passed: gcsOk, audioUrl } = await testGCSUpload(audioBuffer);

  if (!gcsOk || !audioUrl) {
    log.error('\nGCS upload failed - cannot continue.');
    printSummary();
    return;
  }

  // 4. Test Twilio MMS
  await testTwilioMMS(audioUrl, actualSend);

  // 5. Full Integration (only with --send)
  if (runTest || actualSend) {
    await testFullIntegration(actualSend);
  }

  // Print summary
  printSummary();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
