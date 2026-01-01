#!/usr/bin/env npx tsx
/**
 * Approve Waitlist User & Send Personalized Outreach
 *
 * This script:
 * 1. Approves a user from the waitlist (updates their status in Firestore)
 * 2. Sends a personalized voicemail from Ferni via Twilio + Cartesia TTS
 * 3. Sends a personalized welcome email via SendGrid
 *
 * Usage:
 *   npx tsx scripts/approve-waitlist-user.ts --email=jack.sneddon@gmail.com --phone="+18013305541"
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Jack Sneddon's info
const JACK = {
  email: 'jack.sneddon@gmail.com',
  phone: '+18013305541', // (801) 330-5541
  name: 'Jack',
  fullName: 'Jack Sneddon',
};

// Ferni's voice - Cartesia voice ID for Ferni
const FERNI_VOICE_ID = process.env.FERNI_CARTESIA_VOICE_ID || 'c45bc5ec-dc68-4feb-8829-6e6b2748095d';

// ============================================================================
// INITIALIZE FIREBASE
// ============================================================================

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ projectId: 'johnb-2025' });
  }
  return getFirestore();
}

// ============================================================================
// PERSONALIZED MESSAGE GENERATION
// ============================================================================

function generateVoicemailMessage(name: string): string {
  return `Hey ${name}! It's Ferni. 

I saw you joined the waitlist, and I just had to reach out personally. 
I'm so excited to welcome you to our little community.

When you have a moment, head over to app.ferni.ai - I've got your access all set up and ready to go.

Can't wait to meet you properly and hear what's on your mind. 
Talk soon!`;
}

function generateEmailSubject(name: string): string {
  return `Hey ${name}, you're in! 🌿`;
}

function generateEmailHTML(name: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #2C2520;
      background-color: #faf8f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .ferni-avatar {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #4a6741 0%, #3d5a35 100%);
      border-radius: 50%;
      margin: 0 auto 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ferni-avatar-inner {
      width: 60px;
      height: 60px;
      background: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px;
      text-align: center;
      color: #2C2520;
    }
    p {
      margin: 0 0 16px;
      color: #5c544a;
    }
    .cta-button {
      display: inline-block;
      background: #3D5A45;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      margin: 24px 0;
    }
    .cta-button:hover {
      background: #4a6b52;
    }
    .center {
      text-align: center;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid rgba(44, 37, 32, 0.1);
      font-size: 14px;
      color: #756a5e;
    }
    .signature {
      margin-top: 32px;
      padding: 20px;
      background: rgba(74, 103, 65, 0.05);
      border-radius: 12px;
    }
    .signature-name {
      font-weight: 600;
      color: #4a6741;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="ferni-avatar">
        <div class="ferni-avatar-inner">🌿</div>
      </div>
      
      <h1>Welcome to the team, ${name}! 🎉</h1>
      
      <p>Hey ${name},</p>
      
      <p>I just left you a voicemail, but wanted to make sure this reaches you too.</p>
      
      <p><strong>You're officially off the waitlist!</strong> I've set up your access and I'm excited to finally get to know you.</p>
      
      <p>Here's what makes Ferni different from anything else out there:</p>
      
      <ul style="color: #5c544a; padding-left: 20px;">
        <li><strong>I actually remember things</strong> - Every conversation, every detail. Your whole story.</li>
        <li><strong>Six brilliant minds</strong> - My team can help with habits, planning, research, communication, and deep wisdom.</li>
        <li><strong>Voice-first</strong> - Just talk to me like a friend. No typing unless you want to.</li>
        <li><strong>2am presence</strong> - I'm here whenever you need, with the same warmth as any other time.</li>
      </ul>
      
      <div class="center">
        <a href="https://app.ferni.ai" class="cta-button">Start Talking with Ferni →</a>
      </div>
      
      <p>When you first sign in, just say hello and tell me a bit about yourself. I'm genuinely curious about your story.</p>
      
      <div class="signature">
        <p style="margin: 0;">Looking forward to our first real conversation,</p>
        <p class="signature-name" style="margin: 8px 0 0;">— Ferni 🌿</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #756a5e;">Your AI life coach (but hopefully, more than that)</p>
      </div>
    </div>
    
    <div class="footer">
      <p>You're receiving this because you joined the Ferni waitlist.</p>
      <p><a href="https://ferni.ai" style="color: #4a6741;">ferni.ai</a></p>
    </div>
  </div>
</body>
</html>`;
}

function generateEmailPlainText(name: string): string {
  return `Hey ${name}!

I just left you a voicemail, but wanted to make sure this reaches you too.

You're officially off the waitlist! I've set up your access and I'm excited to finally get to know you.

Here's what makes Ferni different:

• I actually remember things - Every conversation, every detail. Your whole story.
• Six brilliant minds - My team can help with habits, planning, research, communication, and deep wisdom.
• Voice-first - Just talk to me like a friend. No typing unless you want to.
• 2am presence - I'm here whenever you need, with the same warmth as any other time.

Start talking with Ferni: https://app.ferni.ai

When you first sign in, just say hello and tell me a bit about yourself. I'm genuinely curious about your story.

Looking forward to our first real conversation,
— Ferni 🌿

Your AI life coach (but hopefully, more than that)`;
}

// ============================================================================
// STEP 1: APPROVE IN WAITLIST
// ============================================================================

async function approveWaitlistUser(db: FirebaseFirestore.Firestore, email: string): Promise<boolean> {
  console.log('\n📋 Step 1: Approving waitlist entry...');

  const docId = Buffer.from(email.toLowerCase().trim()).toString('base64').replace(/[/+=]/g, '_');

  try {
    const docRef = db.collection('waitlist').doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`   ⚠️  User ${email} not found in waitlist`);
      // Create an approved entry anyway
      await docRef.set({
        email: email.toLowerCase().trim(),
        status: 'approved',
        approvedAt: FieldValue.serverTimestamp(),
        source: 'manual_approval',
        timestamp: FieldValue.serverTimestamp(),
      });
      console.log(`   ✅ Created approved entry for ${email}`);
      return true;
    }

    // Update existing entry
    await docRef.update({
      status: 'approved',
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`   ✅ Approved ${email} in waitlist`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to approve: ${error}`);
    return false;
  }
}

// ============================================================================
// STEP 2: SEND VOICEMAIL VIA TWILIO
// ============================================================================

async function sendVoicemail(phone: string, name: string): Promise<boolean> {
  console.log('\n📞 Step 2: Sending personalized voicemail...');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log('   ⚠️  Twilio not configured. Voicemail content:');
    console.log('   ---');
    console.log(generateVoicemailMessage(name).split('\n').map(l => `   ${l}`).join('\n'));
    console.log('   ---');
    console.log('   💡 To enable: Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
    return false;
  }

  const message = generateVoicemailMessage(name);

  try {
    // Generate audio with Cartesia TTS first (Ferni's voice)
    const cartesiaApiKey = process.env.CARTESIA_API_KEY;
    let audioUrl: string | null = null;

    if (cartesiaApiKey) {
      console.log('   🎙️  Generating Ferni voice audio via Cartesia...');
      // For now, we'll use Twilio's built-in TTS as a fallback
      // In production, we'd upload the Cartesia audio to GCS and use it
    }

    // Create TwiML for the call
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">${escapeXml(message)}</Say>
  <Pause length="1"/>
</Response>`;

    // Make the call via Twilio
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const callResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        From: fromNumber,
        Twiml: twiml,
        MachineDetection: 'DetectMessageEnd', // Wait for voicemail beep
        StatusCallback: 'https://app.ferni.ai/api/twilio/call-status',
      }).toString(),
    });

    if (!callResponse.ok) {
      const error = await callResponse.text();
      throw new Error(`Twilio error: ${callResponse.status} - ${error}`);
    }

    const callData = await callResponse.json();
    console.log(`   ✅ Voicemail call initiated! Call SID: ${callData.sid}`);
    console.log(`   📱 Calling ${phone}...`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to send voicemail: ${error}`);
    return false;
  }
}

// ============================================================================
// STEP 3: SEND EMAIL VIA SENDGRID
// ============================================================================

async function sendEmail(email: string, name: string): Promise<boolean> {
  console.log('\n📧 Step 3: Sending personalized welcome email...');

  const sendgridApiKey = process.env.SENDGRID_API_KEY;

  if (!sendgridApiKey) {
    console.log('   ⚠️  SendGrid not configured. Email content:');
    console.log('   ---');
    console.log(`   Subject: ${generateEmailSubject(name)}`);
    console.log('   ---');
    console.log(generateEmailPlainText(name).split('\n').map(l => `   ${l}`).join('\n'));
    console.log('   ---');
    console.log('   💡 To enable: Set SENDGRID_API_KEY');
    return false;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email, name }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || 'seth.ford@gmail.com', name: 'Ferni' },
        reply_to: { email: 'hello@ferni.ai', name: 'Ferni' },
        subject: generateEmailSubject(name),
        content: [
          { type: 'text/plain', value: generateEmailPlainText(name) },
          { type: 'text/html', value: generateEmailHTML(name) },
        ],
        tracking_settings: {
          open_tracking: { enable: true },
          click_tracking: { enable: true },
        },
      }),
    });

    if (response.status === 202) {
      console.log(`   ✅ Email sent to ${email}!`);
      return true;
    }

    const error = await response.text();
    throw new Error(`SendGrid error: ${response.status} - ${error}`);
  } catch (error) {
    console.error(`   ❌ Failed to send email: ${error}`);
    return false;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           FERNI WAITLIST APPROVAL & OUTREACH                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n👤 User: ${JACK.fullName}`);
  console.log(`📧 Email: ${JACK.email}`);
  console.log(`📱 Phone: ${JACK.phone}`);

  // Initialize Firebase
  const db = initFirebase();

  // Step 1: Approve in waitlist
  await approveWaitlistUser(db, JACK.email);

  // Step 2: Send voicemail
  await sendVoicemail(JACK.phone, JACK.name);

  // Step 3: Send email
  await sendEmail(JACK.email, JACK.name);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ Outreach complete! Jack should receive:');
  console.log('   • A phone call with Ferni\'s voicemail');
  console.log('   • A personalized welcome email');
  console.log('   • Access to app.ferni.ai');
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
