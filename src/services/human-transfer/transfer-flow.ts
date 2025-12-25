/**
 * Transfer Flow Orchestrator
 *
 * > "Better than human means connecting you with the right human."
 *
 * Orchestrates the warm handoff from Ferni to human professionals.
 * Handles consent, summary generation, and connection initiation.
 *
 * @module services/human-transfer/transfer-flow
 */

import { createLogger } from '../../utils/safe-logger.js';
import { classifyEscalation, detectCrisisSignals } from './escalation-classifier.js';
import { generateTransferSummary, generateMinimalSummary } from './context-summary.js';
import type {
  EscalationType,
  EscalationDecision,
  TransferConsent,
  TransferRequest,
  TransferResult,
  TransferSummary,
  CrisisService,
} from './types.js';

const log = createLogger({ module: 'transfer-flow' });

// ============================================================================
// CRISIS SERVICES DATABASE
// ============================================================================

const CRISIS_SERVICES: Record<string, CrisisService> = {
  '988': {
    name: '988 Suicide & Crisis Lifeline',
    phone: '988',
    sms: '988',
    chat: 'https://988lifeline.org/chat/',
    available: '24/7',
    description: 'Free, confidential support for people in distress',
    specialization: ['suicide', 'crisis', 'mental-health'],
  },
  'crisis-text': {
    name: 'Crisis Text Line',
    sms: 'HOME to 741741',
    available: '24/7',
    description: 'Free crisis counseling via text',
    specialization: ['crisis', 'mental-health', 'text-preferred'],
  },
  'dv-hotline': {
    name: 'National Domestic Violence Hotline',
    phone: '1-800-799-7233',
    sms: 'START to 88788',
    chat: 'https://www.thehotline.org/get-help/',
    available: '24/7',
    description: 'Support for domestic violence survivors',
    specialization: ['domestic-violence', 'safety-planning'],
  },
  'samhsa': {
    name: 'SAMHSA National Helpline',
    phone: '1-800-662-4357',
    available: '24/7, 365 days',
    description: 'Free treatment referrals and information',
    specialization: ['substance-abuse', 'addiction', 'treatment-referral'],
  },
  'trevor': {
    name: 'Trevor Project',
    phone: '1-866-488-7386',
    sms: 'START to 678-678',
    chat: 'https://www.thetrevorproject.org/get-help/',
    available: '24/7',
    description: 'Crisis intervention for LGBTQ+ young people',
    specialization: ['lgbtq', 'youth', 'crisis'],
  },
  'veterans': {
    name: 'Veterans Crisis Line',
    phone: '988, then press 1',
    sms: '838255',
    chat: 'https://www.veteranscrisisline.net/get-help-now/chat/',
    available: '24/7',
    description: 'Support for veterans and their families',
    specialization: ['veterans', 'military', 'crisis'],
  },
  '211': {
    name: '211',
    phone: '211',
    sms: 'ZIP code to 898211',
    url: 'https://www.211.org/',
    available: '24/7 in most areas',
    description: 'Connect to local services for housing, food, utilities',
    specialization: ['financial', 'housing', 'food', 'utilities'],
  },
};

// ============================================================================
// THERAPY PLATFORMS
// ============================================================================

const THERAPY_PLATFORMS = {
  betterhelp: {
    name: 'BetterHelp',
    url: 'https://www.betterhelp.com/',
    description: 'Online therapy with licensed counselors',
    features: ['online', 'messaging', 'video', 'flexible'],
  },
  talkspace: {
    name: 'Talkspace',
    url: 'https://www.talkspace.com/',
    description: 'Therapy for individuals and couples',
    features: ['online', 'messaging', 'video', 'psychiatry'],
  },
  psychologyToday: {
    name: 'Psychology Today Directory',
    url: 'https://www.psychologytoday.com/us/therapists',
    description: 'Find local therapists by specialty and insurance',
    features: ['directory', 'local', 'insurance-filter', 'specialty-filter'],
  },
  openPath: {
    name: 'Open Path Collective',
    url: 'https://openpathcollective.org/',
    description: 'Affordable therapy ($30-$80 per session)',
    features: ['affordable', 'sliding-scale', 'online', 'in-person'],
  },
};

// ============================================================================
// TRANSFER FLOW
// ============================================================================

/**
 * Evaluate if transfer is needed based on conversation
 */
export function evaluateTransferNeed(transcript: string): EscalationDecision {
  const signals = detectCrisisSignals(transcript);
  return classifyEscalation(signals);
}

/**
 * Get available services for an escalation type
 */
export function getAvailableServices(escalationType: EscalationType): CrisisService[] {
  switch (escalationType) {
    case 'crisis_immediate':
    case 'crisis_support':
      return [CRISIS_SERVICES['988'], CRISIS_SERVICES['crisis-text']];
    case 'therapy':
    case 'psychiatry':
      return [CRISIS_SERVICES['988'], CRISIS_SERVICES['samhsa']];
    default:
      return [CRISIS_SERVICES['211']];
  }
}

/**
 * Initiate warm transfer to human professional
 */
export async function initiateWarmTransfer(
  request: TransferRequest
): Promise<TransferResult> {
  const { userId, decision, consent, summary } = request;

  log.info(
    {
      userId,
      escalationType: decision.type,
      urgency: decision.urgency,
      consentGranted: consent.granted,
    },
    '🤝 Initiating warm transfer'
  );

  // Check consent
  if (!consent.granted) {
    return {
      success: false,
      reason: 'User declined transfer',
      message: generateDeclinedMessage(decision),
      alternativeOffered: true,
      resources: getResourcesList(decision.type),
    };
  }

  // Route based on escalation type
  switch (decision.type) {
    case 'crisis_immediate':
      return initiateEmergencyTransfer(userId, decision, summary);

    case 'crisis_support':
      return initiateCrisisTransfer(userId, decision, summary);

    case 'therapy':
    case 'psychiatry':
      return initiateTherapyTransfer(userId, decision, consent, summary);

    case 'legal':
      return initiateLegalTransfer(userId, decision, summary);

    case 'financial':
      return initiateFinancialTransfer(userId, decision, summary);

    case 'medical':
      return initiateMedicalTransfer(userId, decision, summary);

    default:
      return {
        success: false,
        reason: 'Unknown transfer type',
        message: "I want to make sure you get the right support. Let's figure out what would help most.",
      };
  }
}

// ============================================================================
// TRANSFER IMPLEMENTATIONS
// ============================================================================

async function initiateEmergencyTransfer(
  userId: string,
  decision: EscalationDecision,
  summary?: TransferSummary
): Promise<TransferResult> {
  const service = CRISIS_SERVICES['988'];

  return {
    success: true,
    channel: 'direct_call',
    phoneNumber: service.phone,
    message: generateEmergencyMessage(service),
    resources: [
      {
        name: service.name,
        contact: service.phone!,
        description: service.description,
      },
    ],
  };
}

async function initiateCrisisTransfer(
  userId: string,
  decision: EscalationDecision,
  summary?: TransferSummary
): Promise<TransferResult> {
  const service = CRISIS_SERVICES['988'];
  const textService = CRISIS_SERVICES['crisis-text'];

  return {
    success: true,
    channel: 'direct_call',
    phoneNumber: service.phone,
    message: generateCrisisSupportMessage(service, textService),
    resources: [
      {
        name: service.name,
        contact: `Call or text ${service.phone}`,
        description: service.description,
      },
      {
        name: textService.name,
        contact: `Text ${textService.sms}`,
        description: textService.description,
      },
    ],
  };
}

async function initiateTherapyTransfer(
  userId: string,
  decision: EscalationDecision,
  consent: TransferConsent,
  summary?: TransferSummary
): Promise<TransferResult> {
  // For now, provide curated list of resources
  // Future: integrate with BetterHelp/Talkspace APIs
  
  const resources = [
    {
      name: THERAPY_PLATFORMS.psychologyToday.name,
      contact: THERAPY_PLATFORMS.psychologyToday.url,
      description: 'Find local therapists filtered by specialty, insurance, and more',
    },
    {
      name: THERAPY_PLATFORMS.betterhelp.name,
      contact: THERAPY_PLATFORMS.betterhelp.url,
      description: 'Online therapy with licensed counselors - flexible scheduling',
    },
    {
      name: THERAPY_PLATFORMS.openPath.name,
      contact: THERAPY_PLATFORMS.openPath.url,
      description: 'Affordable therapy ($30-$80/session) for those without insurance',
    },
  ];

  return {
    success: true,
    channel: 'referral_link',
    transferUrl: THERAPY_PLATFORMS.psychologyToday.url,
    message: generateTherapyMessage(summary),
    resources,
  };
}

async function initiateLegalTransfer(
  userId: string,
  decision: EscalationDecision,
  summary?: TransferSummary
): Promise<TransferResult> {
  return {
    success: true,
    channel: 'referral_link',
    message: `Legal situations can be complex, and you deserve proper legal advice. Here are some resources:

**Free/Low-Cost Legal Help:**
- **Legal Aid** - Search "legal aid" + your city for free services
- **Law school clinics** - Many law schools offer free consultations
- **State bar referral** - Your state bar can refer you to attorneys

**For Immediate Questions:**
- **LawHelp.org** - Find legal aid in your area
- **American Bar Association** - aba.org/public-resources

I'm still here if you want to talk through what's happening. Sometimes it helps to process before taking action.`,
    resources: [
      {
        name: 'LawHelp.org',
        contact: 'https://www.lawhelp.org/',
        description: 'Find free legal aid in your area',
      },
    ],
  };
}

async function initiateFinancialTransfer(
  userId: string,
  decision: EscalationDecision,
  summary?: TransferSummary
): Promise<TransferResult> {
  const service = CRISIS_SERVICES['211'];

  return {
    success: true,
    channel: 'referral_link',
    phoneNumber: service.phone,
    message: `Financial stress is real, and there's help available. Let me connect you with resources:

**Immediate Assistance:**
📞 **Call 211** - They connect you to local services for:
   - Rent/housing assistance
   - Utility bill help
   - Food assistance
   - Emergency funds

**Financial Guidance:**
- **NFCC** (National Foundation for Credit Counseling) - Free nonprofit counseling
- **Consumer Financial Protection Bureau** - consumerfinance.gov

I'm here to support you emotionally through this. The financial professionals can help with the practical side.`,
    resources: [
      {
        name: service.name,
        contact: `Call ${service.phone}`,
        description: service.description,
      },
      {
        name: 'NFCC',
        contact: '1-800-388-2227',
        description: 'Free nonprofit credit counseling',
      },
    ],
  };
}

async function initiateMedicalTransfer(
  userId: string,
  decision: EscalationDecision,
  summary?: TransferSummary
): Promise<TransferResult> {
  return {
    success: true,
    channel: 'referral_link',
    message: `Your health matters. Based on what you've described, please reach out to a medical professional:

**For Emergencies:**
- **911** - Life-threatening emergencies
- **Urgent Care** - For non-life-threatening but urgent needs

**For Non-Urgent Medical Questions:**
- Your primary care doctor
- **Telehealth services** - Many offer same-day video visits
- **Nurse advice lines** - Many insurance plans have 24/7 nurse lines

Please don't delay getting checked out. I'll be here when you get back.`,
    resources: [
      {
        name: '911 Emergency',
        contact: '911',
        description: 'For life-threatening emergencies',
      },
    ],
  };
}

// ============================================================================
// MESSAGE GENERATORS
// ============================================================================

function generateEmergencyMessage(service: CrisisService): string {
  return `I'm really concerned about what you're going through. I want to make sure you have the best support right now.

📞 **Please call or text ${service.phone}** - ${service.name}
   ${service.description}
   Available: ${service.available}

They're trained professionals who can help in ways I cannot. You don't have to face this alone.

I'm not going anywhere. I'll be here when you're ready to talk again.`;
}

function generateCrisisSupportMessage(main: CrisisService, text: CrisisService): string {
  return `I hear you, and I want you to have the best support possible right now.

**Options that might help:**

📞 **Call or text ${main.phone}** - ${main.name}
   Trained counselors available ${main.available}

📱 **Text ${text.sms}** - ${text.name}
   If talking feels too hard, texting is okay too

These are people who really understand what you're going through. There's no judgment, just support.

I'm also still here. Whatever you need.`;
}

function generateTherapyMessage(summary?: TransferSummary): string {
  let message = `Finding the right therapist is an important step, and I want to help make it easier.

**Here's what I'd suggest:**

1. **Psychology Today Directory** - psychologytoday.com/us/therapists
   Filter by your location, insurance, and what you're dealing with

2. **BetterHelp or Talkspace** - If you prefer online/flexible scheduling

3. **Open Path Collective** - If cost is a concern ($30-80/session)

**Tips for finding a good fit:**
- Many therapists offer a free 15-minute consultation
- It's okay to try a few before finding the right one
- Look for someone who specializes in what you're working through`;

  if (summary?.keyTopics && summary.keyTopics.length > 0) {
    message += `\n\n**Based on our conversations, you might look for someone who works with:**\n`;
    for (const topic of summary.keyTopics.slice(0, 3)) {
      message += `- ${topic}\n`;
    }
  }

  message += `\n\nI'll still be here between sessions. We make a good team.`;

  return message;
}

function generateDeclinedMessage(decision: EscalationDecision): string {
  if (decision.type === 'crisis_immediate' || decision.type === 'crisis_support') {
    return `I understand. Just know that these resources are always available if you change your mind:

📞 **988** - Call or text anytime, 24/7
📱 **Text HOME to 741741** - Crisis Text Line

I'm here with you. Let's keep talking.`;
  }

  return `That's okay. There's no pressure. These resources will be here whenever you're ready.

I'm still here for you. What would be most helpful right now?`;
}

function getResourcesList(
  escalationType: EscalationType
): Array<{ name: string; contact: string; description?: string }> {
  const services = getAvailableServices(escalationType);
  return services.map((s) => ({
    name: s.name,
    contact: s.phone || s.sms || s.url || '',
    description: s.description,
  }));
}

// ============================================================================
// CONSENT HANDLING
// ============================================================================

/**
 * Generate consent request message
 */
export function generateConsentRequest(decision: EscalationDecision): string {
  if (decision.type === 'crisis_immediate') {
    return `I'd like to connect you with crisis support. Would that be okay?`;
  }

  if (decision.type === 'therapy' || decision.type === 'psychiatry') {
    return `I think talking to a therapist could really help with what you're going through. 

I can share a brief summary of what we've discussed to help them understand - or I can just point you to resources and you can share what feels right.

What would you prefer?
- **Share a summary** - So they have context and you don't have to repeat yourself
- **Just the basics** - Topics only, no details
- **Nothing** - I'll just give you the resources`;
  }

  return `Would you like me to help connect you with someone who specializes in this?`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const transferFlow = {
  evaluateTransferNeed,
  getAvailableServices,
  initiateWarmTransfer,
  generateConsentRequest,
};

