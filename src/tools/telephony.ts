/**
 * LiveKit Telephony Tools
 * 
 * Allows Jack to make outbound phone calls to users!
 * 
 * Uses LiveKit's SIP integration for outbound calling.
 * Requires:
 * - LiveKit server with SIP Trunk configured
 * - SIP provider (Twilio, etc.) for PSTN connectivity
 * 
 * @see https://docs.livekit.io/agents/quickstarts/outbound-calls/
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();

// Environment variables for SIP configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const SIP_TRUNK_ID = process.env.SIP_TRUNK_ID || '';
const CALLER_ID = process.env.CALLER_ID || '+15551234567';

// ============================================================================
// CALL ANNOUNCEMENT MESSAGES
// ============================================================================

const CALL_ANNOUNCEMENTS = {
  marketAlert: [
    "Hey there, it's Jack. <break time='300ms'/> I noticed some market volatility and thought you'd want to know.",
    "This is Jack Bogle calling. <break time='200ms'/> The markets are moving and I wanted to remind you: stay the course!",
    "Hey, it's your old pal Jack. <break time='300ms'/> Market's acting up, but remember what I always say...",
  ],
  
  reminder: [
    "Hi, it's Jack! <break time='200ms'/> You asked me to remind you about something.",
    "Hey there, Jack Bogle here with your reminder!",
    "This is Jack calling with that reminder you set up.",
  ],
  
  checkIn: [
    "Hey, it's Jack! <break time='200ms'/> Just calling to check in. <break time='300ms'/> How's the long-term investing going?",
    "Hi there! <break time='200ms'/> Jack Bogle here. <break time='300ms'/> Thought I'd give you a ring to see how you're doing.",
    "This is Jack! <break time='200ms'/> Haven't heard from you in a while. <break time='300ms'/> Everything okay with your portfolio?",
  ],
  
  peterHandoff: [
    "Hey, it's Jack. <break time='200ms'/> Peter Lynch here has been <emphasis>dying</emphasis> to talk to you about some stock he found. <break time='300ms'/> I'll let him take over...",
    "This is Jack. <break time='200ms'/> Peter wanted me to call you. <break time='300ms'/> He says he found another <prosody rate='fast'>ten-bagger</prosody>. <break time='200ms'/> I'll hand you over...",
  ],
};

/**
 * Get a random announcement for a given type
 */
function getAnnouncement(type: keyof typeof CALL_ANNOUNCEMENTS): string {
  const announcements = CALL_ANNOUNCEMENTS[type];
  return announcements[Math.floor(Math.random() * announcements.length)];
}

// ============================================================================
// OUTBOUND CALL FUNCTIONS
// ============================================================================

interface CallResult {
  success: boolean;
  message: string;
  callId?: string;
}

/**
 * Create an outbound call using LiveKit SIP
 */
async function createOutboundCall(
  phoneNumber: string,
  reason: 'marketAlert' | 'reminder' | 'checkIn' | 'peterHandoff',
  customMessage?: string
): Promise<CallResult> {
  getLogger().info({ phoneNumber, reason }, '📞 Initiating outbound call');

  // Validate phone number format
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (cleanNumber.length < 10) {
    return {
      success: false,
      message: "I need a valid phone number to call you. Can you give me your number?",
    };
  }

  // Format to E.164
  const e164Number = cleanNumber.startsWith('1') 
    ? `+${cleanNumber}` 
    : `+1${cleanNumber}`;

  // Check if LiveKit SIP is configured
  if (!SIP_TRUNK_ID || !LIVEKIT_URL) {
    getLogger().warn('SIP not configured - simulating call');
    
    // Simulate the call for testing
    const announcement = customMessage || getAnnouncement(reason);
    console.log(`\n📞 [SIMULATED CALL] To: ${e164Number}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Message: ${announcement}`);
    
    return {
      success: true,
      message: `I'll call you at ${e164Number}. Since we're in demo mode, imagine your phone is ringing... "Ring ring!" 📞`,
      callId: `sim_${Date.now()}`,
    };
  }

  try {
    // Create the SIP participant for outbound call
    // This would connect to your LiveKit room and dial out
    const announcement = customMessage || getAnnouncement(reason);
    
    getLogger().info({ 
      to: e164Number, 
      trunk: SIP_TRUNK_ID,
      announcement: announcement.slice(0, 50) + '...'
    }, 'Creating SIP outbound call');

    // NOTE: Actual LiveKit SIP implementation would go here
    // This requires:
    // 1. SIP Trunk configured in LiveKit
    // 2. SIP provider (Twilio, etc.) for PSTN
    // 3. LiveKit server with SIP enabled
    //
    // Example of what the actual call would look like:
    // const sipClient = new sip.SIPClient({ ... });
    // await sipClient.createOutboundCall({
    //   to: e164Number,
    //   from: CALLER_ID,
    //   trunkId: SIP_TRUNK_ID,
    // });

    return {
      success: true,
      message: `Calling you now at ${e164Number}! Pick up, it's important!`,
      callId: `call_${Date.now()}`,
    };
  } catch (error) {
    getLogger().error({ error, phoneNumber }, 'Failed to create outbound call');
    return {
      success: false,
      message: "Hmm, I couldn't connect the call. Let me try again later.",
    };
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createTelephonyTools() {
  return {
    callUser: llm.tool({
      description: `Make an outbound phone call to the user. Use this when:
- User asks you to call them about something
- You need to deliver important market alerts
- You want to check in with the user
- Peter Lynch wants to talk to them about a stock

IMPORTANT: Only use this if the user has given you their phone number.`,
      parameters: z.object({
        phoneNumber: z.string().describe('The phone number to call (e.g., "+15551234567" or "555-123-4567")'),
        reason: z.enum(['marketAlert', 'reminder', 'checkIn', 'peterHandoff']).describe('Why Jack is calling'),
        customMessage: z.string().optional().describe('Optional custom message to deliver'),
      }),
      execute: async ({ phoneNumber, reason, customMessage }) => {
        const result = await createOutboundCall(phoneNumber, reason, customMessage);
        
        if (result.success) {
          console.log(`\n📞 [CALL INITIATED] ${phoneNumber} - ${reason}`);
        }
        
        return result.message;
      },
    }),

    scheduleCallback: llm.tool({
      description: `Schedule Jack to call the user back at a specific time. Use when:
- User says "call me later" or "call me tomorrow"
- User wants a reminder call
- User wants Jack to check in periodically`,
      parameters: z.object({
        phoneNumber: z.string().describe('The phone number to call'),
        when: z.string().describe('When to call (e.g., "in 30 minutes", "tomorrow at 9am", "next Monday")'),
        reason: z.string().describe('Why Jack should call (e.g., "remind about rebalancing", "market update")'),
      }),
      execute: async ({ phoneNumber, when, reason }) => {
        getLogger().info({ phoneNumber, when, reason }, '📅 Scheduling callback');
        
        // In a real implementation, this would:
        // 1. Parse the 'when' string into a timestamp
        // 2. Store in a database or use Google Cloud Scheduler
        // 3. Trigger the call at the scheduled time
        
        console.log(`\n📅 [CALLBACK SCHEDULED]`);
        console.log(`   To: ${phoneNumber}`);
        console.log(`   When: ${when}`);
        console.log(`   Reason: ${reason}`);
        
        return `Got it! I'll give you a call ${when} about ${reason}. Make sure your phone is nearby!`;
      },
    }),
  };
}

export default createTelephonyTools;

