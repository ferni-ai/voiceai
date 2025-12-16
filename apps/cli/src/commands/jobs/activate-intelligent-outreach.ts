#!/usr/bin/env npx tsx
/**
 * Activate Intelligent Outreach System
 *
 * This script:
 * 1. Starts the Outreach Decision Engine
 * 2. Initializes the Context Aggregator
 * 3. Sets up Superhuman Memory Integration
 * 4. Provides manual trigger capabilities
 *
 * Usage:
 *   npx tsx scripts/activate-intelligent-outreach.ts --status     # Check system status
 *   npx tsx scripts/activate-intelligent-outreach.ts --start      # Start the system
 *   npx tsx scripts/activate-intelligent-outreach.ts --trigger    # Test trigger outreach
 *   npx tsx scripts/activate-intelligent-outreach.ts --daily-job  # Run daily outreach job
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
const NC = '\x1b[0m';

const args = process.argv.slice(2);
const showStatus = args.includes('--status') || args.includes('-s');
const shouldStart = args.includes('--start');
const shouldTrigger = args.includes('--trigger') || args.includes('-t');
const runDaily = args.includes('--daily-job') || args.includes('-d');
const testUserId = process.env.TEST_USER_ID || 'test-user';

// ============================================================================
// SYSTEM STATUS CHECK
// ============================================================================

async function checkSystemStatus(): Promise<void> {
  console.log(`\n${CYAN}━━━ Intelligent Outreach System Status ━━━${NC}\n`);

  // Decision Engine
  try {
    const { getOutreachDecisionEngine } =
      await import('../src/services/outreach/decision-engine.js');
    const engine = getOutreachDecisionEngine();
    const allUsers = engine.getAllUserIds();
    console.log(`${GREEN}✓${NC} Decision Engine loaded`);
    console.log(`  ${GRAY}Users tracked: ${allUsers.length}${NC}`);
  } catch (error) {
    console.log(`${RED}✗${NC} Decision Engine: ${error}`);
  }

  // Context Aggregator
  try {
    const contextAgg = await import('../src/services/outreach/context-aggregator.js');
    console.log(`${GREEN}✓${NC} Context Aggregator loaded`);
  } catch (error) {
    console.log(`${RED}✗${NC} Context Aggregator: ${error}`);
  }

  // Thinking of You Engine
  try {
    const { getThinkingOfYouEngine } = await import('../src/services/outreach/thinking-of-you.js');
    const engine = getThinkingOfYouEngine();
    console.log(`${GREEN}✓${NC} Thinking of You Engine loaded`);
  } catch (error) {
    console.log(`${RED}✗${NC} Thinking of You Engine: ${error}`);
  }

  // Timing Intelligence
  try {
    const timing = await import('../src/services/outreach/timing-intelligence.js');
    console.log(`${GREEN}✓${NC} Timing Intelligence loaded`);
  } catch (error) {
    console.log(`${RED}✗${NC} Timing Intelligence: ${error}`);
  }

  // Superhuman Memory Integration
  try {
    const superhuman = await import('../src/services/outreach/superhuman-outreach-integration.js');
    console.log(`${GREEN}✓${NC} Superhuman Memory Integration loaded`);
  } catch (error) {
    console.log(`${YELLOW}○${NC} Superhuman Memory Integration: Not available`);
  }

  // Communication Services
  console.log(`\n${CYAN}━━━ Communication Channels ━━━${NC}\n`);

  // Twilio SMS
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    console.log(`${GREEN}✓${NC} Twilio SMS configured`);
  } else {
    console.log(`${RED}✗${NC} Twilio SMS not configured`);
  }

  // Twilio Voice
  if (process.env.TWILIO_PHONE_NUMBER) {
    console.log(`${GREEN}✓${NC} Twilio Voice configured (${process.env.TWILIO_PHONE_NUMBER})`);
  } else {
    console.log(`${RED}✗${NC} Twilio Voice not configured`);
  }

  // SendGrid Email
  if (process.env.SENDGRID_API_KEY) {
    console.log(`${GREEN}✓${NC} SendGrid Email configured`);
  } else {
    console.log(`${YELLOW}○${NC} SendGrid Email not configured`);
  }

  // Push Notifications
  if (process.env.VAPID_PUBLIC_KEY) {
    console.log(`${GREEN}✓${NC} Push Notifications configured`);
  } else {
    console.log(`${YELLOW}○${NC} Push Notifications not configured`);
  }
}

// ============================================================================
// START THE SYSTEM
// ============================================================================

async function startOutreachSystem(): Promise<void> {
  console.log(`\n${CYAN}━━━ Starting Intelligent Outreach System ━━━${NC}\n`);

  // 1. Start Decision Engine
  console.log(`${GRAY}Starting Decision Engine...${NC}`);
  try {
    const { startOutreachDecisionEngine } =
      await import('../src/services/outreach/decision-engine.js');
    const engine = startOutreachDecisionEngine();
    console.log(`${GREEN}✓${NC} Decision Engine started`);

    // Listen for outreach events
    engine.on('outreach-ready', (decision) => {
      console.log(
        `\n${MAGENTA}📤 OUTREACH READY${NC}`,
        `\n  User: ${decision.trigger.userId}`,
        `\n  Type: ${decision.trigger.type}`,
        `\n  Channel: ${decision.channel}`,
        `\n  Persona: ${decision.persona}`
      );
    });

    engine.on('trigger-added', (trigger) => {
      console.log(
        `${CYAN}📥 Trigger added:${NC} ${trigger.type} for ${trigger.userId} (${trigger.priority})`
      );
    });
  } catch (error) {
    console.log(`${RED}✗${NC} Failed to start Decision Engine: ${error}`);
  }

  // 2. Initialize Orchestrator
  console.log(`${GRAY}Initializing Outreach Orchestrator...${NC}`);
  try {
    const { getOutreachOrchestrator } =
      await import('../src/services/outreach/outreach-orchestrator.js');
    const orchestrator = getOutreachOrchestrator();
    console.log(`${GREEN}✓${NC} Outreach Orchestrator ready`);
  } catch (error) {
    console.log(`${RED}✗${NC} Failed to initialize Orchestrator: ${error}`);
  }

  console.log(`\n${GREEN}✓ Intelligent Outreach System is now active!${NC}`);
  console.log(`${GRAY}The system will process triggers and send outreach automatically.${NC}`);
  console.log(`${GRAY}Press Ctrl+C to stop.${NC}\n`);

  // Keep the process running
  process.on('SIGINT', () => {
    console.log(`\n${YELLOW}Stopping outreach system...${NC}`);
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

// ============================================================================
// TEST TRIGGER
// ============================================================================

async function testTriggerOutreach(): Promise<void> {
  console.log(`\n${CYAN}━━━ Testing Outreach Trigger ━━━${NC}\n`);

  const { getOutreachDecisionEngine } = await import('../src/services/outreach/decision-engine.js');
  const { updateUserContext } = await import('../src/services/outreach/context-aggregator.js');

  const engine = getOutreachDecisionEngine();
  const testPhone = process.env.TEST_PHONE_NUMBER;
  const userName = process.env.TEST_USER_NAME || 'Friend';

  if (!testPhone) {
    console.log(
      `${YELLOW}⚠ TEST_PHONE_NUMBER not set - trigger will be created but not delivered${NC}`
    );
  }

  // Set up test user context
  console.log(`${GRAY}Setting up test user context...${NC}`);

  // Update user state with context
  engine.updateUserState(testUserId, {
    outreachEnabled: true,
    allowedChannels: ['sms', 'call', 'email'],
    relationshipStage: 'established',
  });

  engine.updateUserContext(testUserId, {
    recentTopics: ['meditation practice', 'work stress'],
    currentStruggles: ['finding time to exercise'],
    recentWins: ['finished a big project'],
    emotionalState: 'stable',
  });

  console.log(`${GREEN}✓${NC} User context set`);

  // Listen for outreach
  engine.on('outreach-ready', async (decision) => {
    console.log(`\n${GREEN}✓ Outreach Generated!${NC}`);
    console.log(`  ${BOLD}Type:${NC} ${decision.trigger.type}`);
    console.log(`  ${BOLD}Channel:${NC} ${decision.channel}`);
    console.log(`  ${BOLD}Persona:${NC} ${decision.persona}`);
    console.log(`\n${BOLD}Message:${NC}`);
    console.log(`${GRAY}┌${'─'.repeat(60)}┐${NC}`);

    const message =
      decision.generatedMessage?.message || decision.generatedMessage?.voicemailMessage;
    if (message) {
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
    }
    console.log(`${GRAY}└${'─'.repeat(60)}┘${NC}`);

    // Actually send if phone configured
    if (testPhone && decision.channel === 'sms') {
      console.log(`\n${CYAN}Sending SMS to ${testPhone}...${NC}`);
      try {
        const { textUser } = await import('../src/tools/proactive-outreach.js');
        const result = await textUser(
          testUserId,
          decision.generatedMessage?.message || 'Test message from Ferni',
          decision.persona || 'ferni'
        );
        if (result.success) {
          console.log(`${GREEN}✓ SMS sent!${NC}`);
        } else {
          console.log(`${RED}✗ SMS failed: ${result.error}${NC}`);
        }
      } catch (error) {
        console.log(`${RED}✗ SMS error: ${error}${NC}`);
      }
    }

    setTimeout(() => process.exit(0), 1000);
  });

  // Create a test trigger
  console.log(`\n${GRAY}Creating test trigger...${NC}`);

  const triggerId = engine.addTrigger({
    type: 'thinking_of_you',
    userId: testUserId,
    priority: 'medium',
    reason: 'Just thinking of you and wanted to check in',
    context: {
      lastConversation: 'talked about meditation practice',
    },
  });

  console.log(`${GREEN}✓${NC} Trigger created: ${triggerId}`);
  console.log(`${GRAY}Waiting for processing...${NC}`);

  // Give it time to process
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log(`${YELLOW}Trigger may have been deferred (check timing/rate limits)${NC}`);
  process.exit(0);
}

// ============================================================================
// DAILY JOB
// ============================================================================

async function runDailyOutreachJob(): Promise<void> {
  console.log(`\n${CYAN}━━━ Running Daily Outreach Job ━━━${NC}\n`);

  try {
    const { runDailyOutreachJob } = await import('../src/services/outreach/daily-outreach-job.js');

    // Mock user profiles getter for testing
    const mockGetProfiles = async () => {
      // In production, this would fetch from your database
      return [
        {
          id: testUserId,
          customData: { proactiveOutreachEnabled: true },
        },
      ];
    };

    const result = await runDailyOutreachJob({
      getUserProfiles: mockGetProfiles as any,
      dryRun: !process.env.OUTREACH_LIVE,
      maxUsersPerRun: 10,
    });

    console.log(`\n${GREEN}✓ Daily job completed${NC}`);
    console.log(`  Users evaluated: ${result.usersEvaluated}`);
    console.log(`  Outreach sent: ${result.outreachSent}`);
    console.log(`  Duration: ${result.durationMs}ms`);

    if (Object.keys(result.byType).length > 0) {
      console.log(`  By type:`);
      for (const [type, count] of Object.entries(result.byType)) {
        console.log(`    - ${type}: ${count}`);
      }
    }

    if (result.errors.length > 0) {
      console.log(`\n${YELLOW}Errors:${NC}`);
      for (const err of result.errors) {
        console.log(`  - ${err.userId}: ${err.error}`);
      }
    }
  } catch (error) {
    console.log(`${RED}✗ Daily job failed: ${error}${NC}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n${BOLD}${CYAN}🧠 Intelligent Outreach System${NC}`);
  console.log(`${GRAY}${'═'.repeat(50)}${NC}`);

  if (showStatus || (!shouldStart && !shouldTrigger && !runDaily)) {
    await checkSystemStatus();
  }

  if (shouldStart) {
    await startOutreachSystem();
  }

  if (shouldTrigger) {
    await testTriggerOutreach();
  }

  if (runDaily) {
    await runDailyOutreachJob();
  }

  if (!shouldStart && !shouldTrigger && !runDaily) {
    console.log(`\n${GRAY}${'─'.repeat(50)}${NC}`);
    console.log(`\n${BOLD}Commands:${NC}`);
    console.log(`  ${CYAN}--status${NC}      Check system status`);
    console.log(`  ${CYAN}--start${NC}       Start the outreach system`);
    console.log(`  ${CYAN}--trigger${NC}     Test a manual outreach trigger`);
    console.log(`  ${CYAN}--daily-job${NC}   Run the daily outreach job`);
    console.log('');
  }
}

main().catch(console.error);
