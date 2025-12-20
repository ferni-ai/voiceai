#!/usr/bin/env npx tsx
/**
 * Ferni Voice Referral - Viral Growth Tool
 *
 * Have Ferni call someone to introduce herself!
 * Now with SSML for natural-sounding speech! 🎤
 *
 * Modes:
 *   - Simple (default): One-way voice message with Ferni's voice
 *   - Conversational (--chat): Two-way call via LiveKit SIP
 *
 * Usage:
 *   npx tsx scripts/ferni-invite-call.ts --name "Sarah" --phone "+15551234567" --from "Seth"
 *   npx tsx scripts/ferni-invite-call.ts --name "Mom" --phone "+15551234567" --from "Seth" --occasion "Christmas"
 *   npx tsx scripts/ferni-invite-call.ts --name "Jake" --phone "+15551234567" --from "Seth" --support "a tough week"
 *   npx tsx scripts/ferni-invite-call.ts --name "Sarah" --phone "+15551234567" --from "Seth" --chat  # Two-way!
 */

import 'dotenv/config';
import {
  makeVoiceReferralCall,
  makeConversationalReferralCall,
  INTRO_TEMPLATES,
} from '../src/tools/domains/referral/voice-referral.js';
import { enhanceOutboundMessage } from '../src/services/voice-call.js';
import { isConversationalCallsConfigured } from '../src/services/outreach/conversational-calls.js';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const recipientName = getArg('--name');
  const recipientPhone = getArg('--phone');
  const referrerName = getArg('--from') || 'a friend';
  const occasion = getArg('--occasion');
  const support = getArg('--support');
  const note = getArg('--note');
  const preview = args.includes('--preview');
  const conversational = args.includes('--chat') || args.includes('--conversational');

  if (!recipientName || !recipientPhone) {
    console.log(`
🌱 Ferni Voice Referral - Viral Growth Tool

Have Ferni personally call someone to introduce herself!
Now with SSML for natural-sounding speech! 🎤

Usage:
  npx tsx scripts/ferni-invite-call.ts --name "Name" --phone "+1234567890" --from "YourName"

Options:
  --name      Friend's name (required)
  --phone     Friend's phone number (required)
  --from      Your name / who's referring (default: "a friend")
  --occasion  Special occasion (e.g., "Christmas", "birthday")
  --support   If they're going through something (e.g., "a tough week")
  --note      Personal note to include
  --preview   Show the message (with SSML) without calling
  --chat      Use two-way conversational call (requires LiveKit SIP)

Examples:
  # Simple introduction
  npx tsx scripts/ferni-invite-call.ts --name "Sarah" --phone "+15551234567" --from "Seth"

  # Holiday greeting + intro
  npx tsx scripts/ferni-invite-call.ts --name "Mom" --phone "+15551234567" --from "Seth" --occasion "Christmas"

  # Supportive outreach
  npx tsx scripts/ferni-invite-call.ts --name "Jake" --phone "+15551234567" --from "Seth" --support "a tough week at work"

  # Preview the SSML message
  npx tsx scripts/ferni-invite-call.ts --name "Sarah" --phone "+15551234567" --from "Seth" --preview
`);
    process.exit(1);
  }

  console.log('\n🌱 Ferni Voice Referral\n');
  console.log(`   To: ${recipientName}`);
  console.log(`   Phone: ${recipientPhone}`);
  console.log(`   From: ${referrerName}`);
  if (occasion) console.log(`   Occasion: ${occasion}`);
  if (support) console.log(`   Support: ${support}`);
  if (note) console.log(`   Note: ${note}`);
  if (conversational) {
    const sipConfigured = isConversationalCallsConfigured();
    console.log(`   Mode: Two-way conversation ${sipConfigured ? '✅' : '⚠️ (SIP not configured)'}`);
  }
  console.log('');

  // Generate the message for preview
  let message: string;
  if (occasion) {
    message = INTRO_TEMPLATES.holiday(referrerName, recipientName, occasion);
  } else if (support) {
    message = INTRO_TEMPLATES.support(referrerName, recipientName, support);
  } else if (note) {
    message = INTRO_TEMPLATES.withContext(referrerName, recipientName, note);
  } else {
    message = INTRO_TEMPLATES.simple(referrerName, recipientName);
  }

  // Determine call type for SSML
  const ssmlCallType = occasion ? 'celebration' : support ? 'support' : 'introduction';
  const enhancedMessage = enhanceOutboundMessage(message, {
    personaId: 'ferni',
    callType: ssmlCallType as 'introduction' | 'support' | 'celebration',
    relationshipStage: 'new',
    addOpeningWarmth: true,
  });

  if (preview) {
    console.log('📝 Plain Message:\n');
    console.log('   ' + message.replace(/\n/g, '\n   '));
    console.log('\n');
    console.log('🎤 SSML-Enhanced Message:\n');
    console.log('   ' + enhancedMessage.replace(/\n/g, '\n   '));
    console.log('\n');
    console.log('ℹ️  Preview mode - no call made. Remove --preview to call.\n');
    return;
  }

  if (conversational) {
    // Two-way call via LiveKit SIP
    console.log('📞 Initiating two-way conversation...\n');

    const result = await makeConversationalReferralCall({
      referrerId: 'cli-user',
      referrerName,
      recipientName,
      recipientPhone,
      personalNote: note || (support ? `going through ${support}` : undefined),
      occasion,
    });

    if (result.success) {
      console.log('✅ Conversational call initiated!\n');
      console.log(`   Call ID: ${result.callId}`);
      console.log('');
      console.log(`🎉 ${recipientName} will have a REAL conversation with Ferni!`);
      console.log(`   Ferni knows ${referrerName} sent her and will be warm and helpful.`);
      console.log('');
    } else {
      console.log('❌ Call failed:', result.error);
    }
  } else {
    // One-way voice message
    console.log('📞 Calling now (with SSML enhancement)...\n');

    const result = await makeVoiceReferralCall({
      referrerId: 'cli-user',
      referrerName,
      recipientName,
      recipientPhone,
      personalNote: note,
      occasion,
      supportSituation: support,
    });

    if (result.success) {
      console.log('✅ Call initiated!\n');
      console.log(`   Call SID: ${result.callSid}`);
      console.log('');
      console.log(`🎉 ${recipientName} will receive a warm introduction from Ferni!`);
      console.log(`   They'll hear that ${referrerName} was thinking of them.`);
      console.log('');
    } else {
      console.log('❌ Call failed:', result.error);
    }
  }
}

main().catch(console.error);

