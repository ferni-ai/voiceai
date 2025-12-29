#!/usr/bin/env npx tsx
/**
 * Test Natural Calls - "Better Than Human" Voice Calling
 *
 * This script tests the new natural calling system with:
 * - SSML-enhanced templates
 * - Persona voices (Cartesia TTS)
 * - Dynamic personalization
 * - Natural pacing and prosody
 *
 * Usage:
 *   npx tsx scripts/test-natural-calls.ts preview           # Preview all templates
 *   npx tsx scripts/test-natural-calls.ts call <phone>      # Make a test call
 *   npx tsx scripts/test-natural-calls.ts call <phone> --type=birthday
 *   npx tsx scripts/test-natural-calls.ts call <phone> --persona=maya-santos
 */

import 'dotenv/config';
import {
  makeNaturalCall,
  previewCallMessage,
  previewAllCallTypes,
  callThinkingOfYou,
  callCheckIn,
  callBirthday,
  callCelebration,
  callReminder,
  callAppointmentConfirmation,
  type CallTemplateType,
} from '../src/services/voice/natural-call.service.js';
import { generateFerniMessage, type MessageContext } from '../src/services/voice/ferni-message-generator.js';

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg?.split('=')[1];
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

// ============================================================================
// PREVIEW COMMAND
// ============================================================================

async function previewTemplates(): Promise<void> {
  console.log('\n🎤 NATURAL CALL TEMPLATES - Preview\n');
  console.log('=' .repeat(60));

  const recipientName = getArg('name') || 'Sarah';
  const personaId = getArg('persona') || 'ferni';

  console.log(`\nPreviewing templates for: ${recipientName} (Persona: ${personaId})\n`);

  const previews = previewAllCallTypes(recipientName, personaId);

  for (const [type, preview] of Object.entries(previews)) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📞 ${type.toUpperCase()}`);
    console.log(`${'─'.repeat(60)}`);
    console.log('\n📝 Plain Text:');
    console.log(`   ${preview.plainText}`);
    console.log(`\n⏱️  Estimated Duration: ${preview.estimatedDuration}s`);
    console.log(`🎭 Voice ID: ${preview.voiceId.slice(0, 20)}...`);
    console.log(`😊 Emotion: ${preview.emotion}`);
    console.log(`🏃 Speed: ${preview.speedMultiplier}x`);

    if (hasFlag('ssml')) {
      console.log('\n🎼 SSML:');
      console.log(`   ${preview.message.slice(0, 200)}...`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ Preview complete!\n');
  console.log('To make an actual call:');
  console.log('  npx tsx scripts/test-natural-calls.ts call <phone> --type=<type>\n');
}

// ============================================================================
// CALL COMMAND
// ============================================================================

async function makeTestCall(): Promise<void> {
  const phone = args[1];
  if (!phone || phone.startsWith('--')) {
    console.error('❌ Phone number required: npx tsx scripts/test-natural-calls.ts call <phone>');
    process.exit(1);
  }

  const type = (getArg('type') || 'thinking_of_you') as CallTemplateType;
  const personaId = getArg('persona') || 'ferni';
  const name = getArg('name') || 'Friend';
  const dryRun = hasFlag('dry-run');

  console.log('\n📞 NATURAL CALL TEST\n');
  console.log('=' .repeat(60));
  console.log(`Phone:      ${phone}`);
  console.log(`Type:       ${type}`);
  console.log(`Persona:    ${personaId}`);
  console.log(`Recipient:  ${name}`);
  console.log(`Dry Run:    ${dryRun}`);
  console.log('=' .repeat(60));

  // Preview the message first
  console.log('\n📝 Message Preview:');
  const preview = previewCallMessage(type, name, personaId, {
    customContext: {
      achievement: 'landing that new client',
      reminder: 'your dentist appointment tomorrow at 2pm',
      challenge: 'the project deadline',
      appointment: 'your doctor appointment',
      time: 'tomorrow at 3pm',
      location: "Dr. Johnson's office",
    },
  });

  console.log('\n' + preview.plainText);
  console.log(`\n⏱️  Estimated: ${preview.estimatedDuration}s`);

  if (dryRun) {
    console.log('\n🔹 Dry run - not making actual call');
    console.log('Remove --dry-run to make the call');
    return;
  }

  console.log('\n📞 Initiating call...\n');

  const result = await makeNaturalCall({
    phone,
    recipientName: name,
    type,
    personaId,
    context: {
      customContext: {
        achievement: 'landing that new client',
        reminder: 'your dentist appointment tomorrow at 2pm',
        challenge: 'the project deadline',
        appointment: 'your doctor appointment',
        time: 'tomorrow at 3pm',
        location: "Dr. Johnson's office",
      },
    },
  });

  if (result.success) {
    console.log('✅ Call initiated successfully!');
    console.log(`   Call SID: ${result.callSid}`);
    console.log(`   Used Cartesia Voice: ${result.usedCartesiaVoice ? 'Yes 🎙️' : 'No (Twilio fallback)'}`);
  } else {
    console.log('❌ Call failed:', result.message);
    if (result.error) console.log(`   Error: ${result.error}`);
  }

  console.log('\n' + '=' .repeat(60) + '\n');
}

// ============================================================================
// QUICK CALLS
// ============================================================================

async function quickCall(): Promise<void> {
  const phone = args[1];
  const quickType = args[0]; // thinking, checkin, birthday, celebration, reminder

  if (!phone || phone.startsWith('--')) {
    console.error(`❌ Phone required: npx tsx scripts/test-natural-calls.ts ${quickType} <phone>`);
    process.exit(1);
  }

  const name = getArg('name') || 'Friend';
  const personaId = getArg('persona') || 'ferni';

  console.log(`\n📞 Quick ${quickType} call to ${phone}...\n`);

  let result;

  switch (quickType) {
    case 'thinking':
      result = await callThinkingOfYou(phone, name, personaId);
      break;
    case 'checkin':
      result = await callCheckIn(phone, name, personaId, 14);
      break;
    case 'birthday':
      result = await callBirthday(phone, name, personaId);
      break;
    case 'celebration':
      result = await callCelebration(phone, name, 'getting that promotion', personaId);
      break;
    case 'reminder':
      result = await callReminder(phone, name, 'your dentist appointment tomorrow', personaId);
      break;
    case 'appointment':
      result = await callAppointmentConfirmation(
        phone,
        name,
        'your doctor appointment',
        'tomorrow at 3pm',
        "Dr. Smith's office",
        personaId
      );
      break;
    default:
      console.error(`Unknown quick type: ${quickType}`);
      process.exit(1);
  }

  if (result.success) {
    console.log('✅ Call initiated!');
    console.log(`   SID: ${result.callSid}`);
    console.log(`   Cartesia: ${result.usedCartesiaVoice ? '✓' : '✗'}`);
  } else {
    console.log('❌ Failed:', result.message);
  }

  console.log();
}

// ============================================================================
// GENERATE COMMAND - Let Ferni craft real messages
// ============================================================================

async function generateMessages(): Promise<void> {
  console.log('\n✨ FERNI MESSAGE GENERATOR - Real, Natural Messages\n');
  console.log('=' .repeat(60));
  console.log('Letting Ferni craft REAL messages (not templates!)');
  console.log('=' .repeat(60));

  const name = getArg('name') || 'Sarah';
  const purposes: MessageContext['purpose'][] = [
    'thinking_of_you',
    'check_in',
    'birthday',
    'celebration',
    'encouragement',
    'concern',
  ];

  for (const purpose of purposes) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📞 ${purpose.toUpperCase()}`);
    console.log(`${'─'.repeat(60)}`);

    const context: MessageContext = {
      recipientName: name,
      purpose,
      relationshipDepth: 'established',
      daysSinceContact: 14,
      previousTopics: ['career change', 'family visit'],
      timeOfDay: 'afternoon',
      details: purpose === 'celebration' ? { achievement: 'landing that new job' } : undefined,
    };

    // Generate 2 variations to show it's not templated
    for (let i = 1; i <= 2; i++) {
      const start = Date.now();
      const result = await generateFerniMessage(context);
      const elapsed = Date.now() - start;

      console.log(`\n  Variation ${i} (${elapsed}ms):`);
      console.log(`  "${result.message}"`);
      console.log(`  ⏱️ ~${result.estimatedDuration}s`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ Each message is UNIQUE - crafted by Ferni, not templates!');
  console.log('=' .repeat(60) + '\n');
}

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  console.log(`
🎤 NATURAL CALLS - "Better Than Human" Voice Calling

USAGE:
  npx tsx scripts/test-natural-calls.ts <command> [options]

COMMANDS:
  generate                   Let Ferni CRAFT real messages (not templates!)
  preview                    Preview template-based messages (legacy)
  call <phone>               Make a test call with full options
  thinking <phone>           Quick "thinking of you" call
  checkin <phone>            Quick check-in call
  birthday <phone>           Quick birthday call
  celebration <phone>        Quick celebration call
  reminder <phone>           Quick reminder call
  appointment <phone>        Quick appointment confirmation call

OPTIONS:
  --name=<name>              Recipient's name (default: "Friend")
  --persona=<id>             Persona to use (default: "ferni")
  --type=<type>              Call type for 'call' command
  --dry-run                  Preview without making actual call
  --ssml                     Show SSML in preview (legacy)

CALL TYPES:
  thinking_of_you, check_in, birthday, celebration, reminder,
  follow_up, encouragement, concern, gratitude,
  appointment_confirmation, appointment_reminder

PERSONAS:
  ferni, maya-santos, peter-john, alex-chen, jordan-taylor, nayan-patel

EXAMPLES:
  # Let Ferni craft real messages (RECOMMENDED!)
  npx tsx scripts/test-natural-calls.ts generate --name=Sarah

  # Make a real call (uses Ferni's crafted message)
  npx tsx scripts/test-natural-calls.ts thinking 8015551234 --name=Mom

  # Quick birthday call
  npx tsx scripts/test-natural-calls.ts birthday 8015551234 --name=Sarah

  # Dry run (preview without calling)
  npx tsx scripts/test-natural-calls.ts call 8015551234 --dry-run
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  switch (command) {
    case 'generate':
      await generateMessages();
      break;
    case 'preview':
      await previewTemplates();
      break;
    case 'call':
      await makeTestCall();
      break;
    case 'thinking':
    case 'checkin':
    case 'birthday':
    case 'celebration':
    case 'reminder':
    case 'appointment':
      await quickCall();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
