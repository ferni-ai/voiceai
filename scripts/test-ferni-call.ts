#!/usr/bin/env npx tsx
/**
 * Test Ferni Outbound Calls - Comprehensive Testing
 *
 * Tests both use cases:
 * 1. VOICEMAIL - When user doesn't answer, leave a warm, personal message
 * 2. LIVE PICKUP - When user answers, have a real conversation
 *
 * Usage:
 *   npx tsx scripts/test-ferni-call.ts                    # Check config + preview
 *   npx tsx scripts/test-ferni-call.ts --voicemail        # Make call (voicemail mode)
 *   npx tsx scripts/test-ferni-call.ts --conversation     # Make call (conversation mode)
 *   npx tsx scripts/test-ferni-call.ts --context          # Preview with rich context
 *
 * Environment:
 *   TEST_PHONE_NUMBER  - Your phone to receive the call
 *   TEST_USER_NAME     - Name to use in greeting (default: "there")
 */

import 'dotenv/config';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

const args = process.argv.slice(2);
const shouldCallVoicemail = args.includes('--voicemail') || args.includes('-v');
const shouldCallConversation = args.includes('--conversation') || args.includes('-c');
const showRichContext = args.includes('--context') || args.includes('--rich');
const showHelp = args.includes('--help') || args.includes('-h');

// ============================================================================
// HELP
// ============================================================================

if (showHelp) {
  console.log(`
${BOLD}${CYAN}Ferni Outbound Call Test${NC}

${BOLD}Usage:${NC}
  npx tsx scripts/test-ferni-call.ts [options]

${BOLD}Options:${NC}
  ${CYAN}--voicemail, -v${NC}     Make a real call (plays voicemail message)
  ${CYAN}--conversation, -c${NC}  Make a real call (starts live conversation)
  ${CYAN}--context${NC}           Preview with rich personal context
  ${CYAN}--help, -h${NC}          Show this help

${BOLD}Environment Variables:${NC}
  TEST_PHONE_NUMBER   Your phone number to receive the call
  TEST_USER_NAME      Name to use in greeting

${BOLD}Examples:${NC}
  # Preview what Ferni would say
  npx tsx scripts/test-ferni-call.ts

  # Preview with personal context (struggles, wins, etc.)
  npx tsx scripts/test-ferni-call.ts --context

  # Make a real test call (voicemail style)
  TEST_USER_NAME="Seth" npx tsx scripts/test-ferni-call.ts --voicemail
`);
  process.exit(0);
}

// ============================================================================
// CONTEXT EXAMPLES
// ============================================================================

interface TestContext {
  name: string;
  description: string;
  context: {
    userId: string;
    userName: string;
    preferredName?: string;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    trigger: {
      type: string;
      reason: string;
      urgency: 'low' | 'medium' | 'high' | 'urgent';
    };
    context: {
      recentTopics?: string[];
      recentWins?: string[];
      currentStruggles?: string[];
      upcomingEvents?: string[];
      emotionalState?: string;
      lastConversationSummary?: string;
    };
    commitment?: string;
    milestone?: string;
    goal?: string;
    event?: string;
  };
}

const TEST_CONTEXTS: TestContext[] = [
  {
    name: 'Warm Introduction',
    description: 'First time Ferni calls someone',
    context: {
      userId: 'test-user',
      userName: process.env.TEST_USER_NAME || 'there',
      relationshipStage: 'new',
      trigger: { type: 'thinking_of_you', reason: 'First check-in', urgency: 'low' },
      context: {},
    },
  },
  {
    name: 'With Recent Conversation',
    description: 'Ferni remembers what you talked about',
    context: {
      userId: 'test-user',
      userName: process.env.TEST_USER_NAME || 'there',
      relationshipStage: 'established',
      trigger: { type: 'thinking_of_you', reason: 'Following up', urgency: 'low' },
      context: {
        lastConversationSummary: 'feeling torn about the job offer',
      },
    },
  },
  {
    name: 'Supporting Through Struggle',
    description: 'Ferni checks in on something difficult',
    context: {
      userId: 'test-user',
      userName: process.env.TEST_USER_NAME || 'there',
      relationshipStage: 'established',
      trigger: { type: 'emotional_support', reason: 'Check-in', urgency: 'low' },
      context: {
        currentStruggles: ['reconnecting with your sister'],
        emotionalState: 'processing some family stuff',
      },
    },
  },
  {
    name: 'Celebrating a Win',
    description: 'Ferni celebrates an achievement',
    context: {
      userId: 'test-user',
      userName: process.env.TEST_USER_NAME || 'there',
      relationshipStage: 'established',
      trigger: { type: 'celebration', reason: 'Big win!', urgency: 'low' },
      context: {
        recentWins: ['finishing your first 5K'],
      },
      milestone: 'running your first 5K',
    },
  },
  {
    name: 'Deep Relationship Check-in',
    description: 'Intimate, like a close friend',
    context: {
      userId: 'test-user',
      userName: process.env.TEST_USER_NAME || 'there',
      relationshipStage: 'deep',
      trigger: { type: 'thinking_of_you', reason: 'Just because', urgency: 'low' },
      context: {
        lastConversationSummary: 'your mom and how much you miss her',
      },
    },
  },
  {
    name: 'Commitment Check',
    description: 'Following up on something they committed to',
    context: {
      userId: 'test-user',
      userName: process.env.TEST_USER_NAME || 'there',
      relationshipStage: 'building',
      trigger: { type: 'commitment_check', reason: 'Checking in', urgency: 'low' },
      context: {
        recentTopics: ['starting that meditation practice'],
      },
      commitment: 'trying meditation this week',
    },
  },
];

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

interface ConfigStatus {
  twilioConfigured: boolean;
  cartesiaConfigured: boolean;
  gcsConfigured: boolean;
  livekitConfigured: boolean;
  testPhoneSet: boolean;
  missing: string[];
  warnings: string[];
}

function checkConfiguration(): ConfigStatus {
  const status: ConfigStatus = {
    twilioConfigured: false,
    cartesiaConfigured: false,
    gcsConfigured: false,
    livekitConfigured: false,
    testPhoneSet: false,
    missing: [],
    warnings: [],
  };

  // Twilio
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  status.twilioConfigured = !!(twilioSid && twilioToken && twilioPhone);

  // Cartesia
  status.cartesiaConfigured = !!process.env.CARTESIA_API_KEY;

  // GCS
  status.gcsConfigured = !!(process.env.GCS_VOICE_BUCKET || process.env.GOOGLE_CLOUD_PROJECT);

  // LiveKit (for conversation mode)
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitKey = process.env.LIVEKIT_API_KEY;
  const livekitSecret = process.env.LIVEKIT_API_SECRET;
  status.livekitConfigured = !!(livekitUrl && livekitKey && livekitSecret);

  // Test phone
  status.testPhoneSet = !!process.env.TEST_PHONE_NUMBER;

  // Build warnings/missing
  if (!status.twilioConfigured) {
    status.missing.push('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
  }
  if (!status.testPhoneSet) {
    status.missing.push('TEST_PHONE_NUMBER');
  }
  if (!status.cartesiaConfigured) {
    status.warnings.push('CARTESIA_API_KEY not set - will use Twilio fallback voice');
  }
  if (!status.gcsConfigured && status.cartesiaConfigured) {
    status.warnings.push('GCS not configured - Cartesia voice needs audio hosting');
  }
  if (!status.livekitConfigured) {
    status.warnings.push('LiveKit not configured - conversation mode unavailable');
  }

  return status;
}

function printConfigStatus(status: ConfigStatus): void {
  console.log(`\n${CYAN}━━━ Configuration ━━━${NC}\n`);

  // Twilio
  if (status.twilioConfigured) {
    console.log(`${GREEN}✓${NC} Twilio ${GRAY}(${process.env.TWILIO_PHONE_NUMBER})${NC}`);
  } else {
    console.log(`${RED}✗${NC} Twilio not configured`);
  }

  // Voice
  const voiceStatus =
    status.cartesiaConfigured && status.gcsConfigured
      ? `${GREEN}✓${NC} Ferni's Cartesia voice`
      : status.cartesiaConfigured
        ? `${YELLOW}○${NC} Cartesia (needs GCS for hosting)`
        : `${YELLOW}○${NC} Twilio fallback voice`;
  console.log(voiceStatus);

  // LiveKit
  if (status.livekitConfigured) {
    console.log(`${GREEN}✓${NC} LiveKit ${GRAY}(conversation mode available)${NC}`);
  } else {
    console.log(`${YELLOW}○${NC} LiveKit not configured ${GRAY}(voicemail mode only)${NC}`);
  }

  // Test phone
  if (status.testPhoneSet) {
    console.log(`${GREEN}✓${NC} Test phone: ${process.env.TEST_PHONE_NUMBER}`);
  } else {
    console.log(`${RED}✗${NC} TEST_PHONE_NUMBER not set`);
  }

  if (status.warnings.length > 0) {
    console.log(`\n${YELLOW}Warnings:${NC}`);
    for (const warn of status.warnings) {
      console.log(`  ${YELLOW}⚠${NC} ${warn}`);
    }
  }
}

// ============================================================================
// PREVIEW VOICEMAILS
// ============================================================================

async function previewVoicemails(contexts: TestContext[]): Promise<void> {
  console.log(`\n${CYAN}━━━ Voicemail Previews ━━━${NC}`);

  const { generateVoicemailMessage, generateWarmIntroductionVoicemail } =
    await import('../src/services/outreach/persona-voice-generator.js');

  for (const testCtx of contexts) {
    console.log(`\n${BOLD}${MAGENTA}${testCtx.name}${NC}`);
    console.log(`${DIM}${testCtx.description}${NC}`);
    console.log(
      `${GRAY}Stage: ${testCtx.context.relationshipStage} | Trigger: ${testCtx.context.trigger.type}${NC}`
    );

    let message: string;

    if (testCtx.name === 'Warm Introduction') {
      message = generateWarmIntroductionVoicemail(
        'ferni',
        testCtx.context.userName,
        testCtx.context.relationshipStage
      );
    } else {
      message = generateVoicemailMessage('ferni', testCtx.context, 'casual');
    }

    // Pretty print the message
    console.log(`\n${GRAY}┌${'─'.repeat(60)}┐${NC}`);
    const words = message.split(' ');
    let line = '';
    for (const word of words) {
      if (line.length + word.length > 56) {
        console.log(`${GRAY}│${NC} ${line.padEnd(58)} ${GRAY}│${NC}`);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) {
      console.log(`${GRAY}│${NC} ${line.padEnd(58)} ${GRAY}│${NC}`);
    }
    console.log(`${GRAY}└${'─'.repeat(60)}┘${NC}`);
  }
}

// ============================================================================
// MAKE VOICEMAIL CALL
// ============================================================================

async function makeVoicemailCall(): Promise<void> {
  console.log(`\n${CYAN}━━━ Making Voicemail Call ━━━${NC}\n`);

  const { callWithPersonaVoice } = await import('../src/services/voice-call.js');
  const { generateWarmIntroductionVoicemail } =
    await import('../src/services/outreach/persona-voice-generator.js');

  const testPhone = process.env.TEST_PHONE_NUMBER!;
  const userName = process.env.TEST_USER_NAME || 'there';

  // Generate the warm introduction message
  const message = generateWarmIntroductionVoicemail('ferni', userName, 'new');

  console.log(`${GRAY}Message:${NC}`);
  console.log(`${DIM}"${message}"${NC}\n`);
  console.log(`${GRAY}Calling ${testPhone}...${NC}`);

  const result = await callWithPersonaVoice(testPhone, message, 'ferni', {
    fallbackToTwilioVoice: true,
  });

  if (result.success) {
    console.log(`\n${GREEN}✓ Call initiated!${NC}`);
    console.log(`  ${GRAY}Call SID: ${result.callSid}${NC}`);
    console.log(
      `  ${result.usedCartesiaVoice ? `${GREEN}✓ Ferni's Cartesia voice${NC}` : `${YELLOW}○ Twilio fallback voice${NC}`}`
    );
    console.log(`\n${CYAN}📱 Your phone should ring shortly!${NC}`);
  } else {
    console.log(`\n${RED}✗ Call failed: ${result.message}${NC}`);
  }
}

// ============================================================================
// MAKE CONVERSATION CALL
// ============================================================================

async function makeConversationCall(): Promise<void> {
  console.log(`\n${CYAN}━━━ Making Conversational Call ━━━${NC}\n`);

  const { isConversationalCallsConfigured, makeConversationalCall } =
    await import('../src/services/outreach/conversational-calls.js');

  if (!isConversationalCallsConfigured()) {
    console.log(`${RED}✗ Conversational calls not configured${NC}`);
    console.log(`${GRAY}Need: TWILIO_*, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET${NC}`);
    console.log(`\n${YELLOW}Falling back to voicemail mode...${NC}`);
    await makeVoicemailCall();
    return;
  }

  const testPhone = process.env.TEST_PHONE_NUMBER!;
  const userName = process.env.TEST_USER_NAME || 'there';

  console.log(`${GRAY}Initiating conversation with ${userName} at ${testPhone}...${NC}`);

  try {
    const call = await makeConversationalCall({
      trigger: {
        id: `test-${Date.now()}`,
        type: 'thinking_of_you',
        reason: 'Test call',
        urgency: 'low',
      },
      user: {
        id: 'test-user',
        name: userName,
        phone: testPhone,
        relationshipStage: 'established',
      },
      context: {},
      approach: {
        tone: 'casual',
        primaryGoal: 'Warm introduction and check-in',
      },
      persona: 'ferni',
    });

    console.log(`\n${GREEN}✓ Conversational call initiated!${NC}`);
    console.log(`  ${GRAY}Call ID: ${call.id}${NC}`);
    console.log(`  ${GRAY}Twilio SID: ${call.twilioCallSid}${NC}`);
    console.log(`  ${GRAY}LiveKit Room: ${call.livekitRoomName}${NC}`);
    console.log(`\n${CYAN}📱 Your phone should ring shortly!${NC}`);
    console.log(`${CYAN}   When you answer, Ferni will join the call.${NC}`);
  } catch (error) {
    console.log(`\n${RED}✗ Failed to initiate call: ${error}${NC}`);
    console.log(`\n${YELLOW}Falling back to voicemail mode...${NC}`);
    await makeVoicemailCall();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}🌟 Ferni Outbound Call Test${NC}`);
  console.log(`${GRAY}${'═'.repeat(50)}${NC}`);

  // Check configuration
  const status = checkConfiguration();
  printConfigStatus(status);

  // Determine which contexts to preview
  const contextsToShow = showRichContext ? TEST_CONTEXTS : TEST_CONTEXTS.slice(0, 2);

  // Preview voicemails
  await previewVoicemails(contextsToShow);

  // Make calls if requested
  if (shouldCallVoicemail) {
    if (!status.twilioConfigured || !status.testPhoneSet) {
      console.log(`\n${RED}Cannot make call - missing configuration${NC}`);
      process.exit(1);
    }
    await makeVoicemailCall();
  } else if (shouldCallConversation) {
    if (!status.twilioConfigured || !status.testPhoneSet) {
      console.log(`\n${RED}Cannot make call - missing configuration${NC}`);
      process.exit(1);
    }
    await makeConversationCall();
  } else {
    // Show usage hints
    console.log(`\n${GRAY}${'─'.repeat(50)}${NC}`);
    console.log(`\n${BOLD}To make a test call:${NC}`);
    console.log(
      `  ${CYAN}npx tsx scripts/test-ferni-call.ts --voicemail${NC}     ${GRAY}(plays message)${NC}`
    );
    console.log(
      `  ${CYAN}npx tsx scripts/test-ferni-call.ts --conversation${NC}  ${GRAY}(live chat)${NC}`
    );
    console.log(`\n${BOLD}To see more examples:${NC}`);
    console.log(`  ${CYAN}npx tsx scripts/test-ferni-call.ts --context${NC}`);
  }

  console.log('');
}

main().catch(console.error);
