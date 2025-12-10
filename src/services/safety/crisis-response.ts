/**
 * Crisis Response System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Generates warm, human responses to crisis situations.
 * Never abandons the user while connecting them to appropriate resources.
 *
 * Philosophy:
 * - "I'm here, AND I want you to have more support"
 * - Validate feelings before offering resources
 * - Warm language, not clinical
 * - Stay present throughout
 *
 * @module CrisisResponse
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisSeverity, CrisisSignal, CrisisType } from './crisis-detection.js';

const log = createLogger({ module: 'CrisisResponse' });

// ============================================================================
// TYPES
// ============================================================================

export interface CrisisResource {
  name: string;
  description: string;
  phone?: string;
  text?: string;
  chat?: string;
  available: string; // "24/7", "8am-11pm EST", etc.
  specialization?: string[];
}

export interface CrisisResponseContent {
  /** The empathetic opening (validation) */
  validation: string;

  /** The offer to stay present */
  presence: string;

  /** The warm resource introduction (if applicable) */
  resourceIntro?: string;

  /** Primary resource to offer */
  primaryResource?: CrisisResource;

  /** Additional resources */
  additionalResources?: CrisisResource[];

  /** Follow-up question to keep engaged */
  followUp: string;

  /** Full combined response text */
  fullResponse: string;

  /** SSML version with appropriate pauses and tone */
  ssml: string;
}

export interface CrisisResponseContext {
  /** The crisis signal being responded to */
  signal: CrisisSignal;

  /** User's name (if known) */
  userName?: string;

  /** Persona generating the response */
  personaId: string;

  /** Time of day */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';

  /** Whether this is the first crisis mention in session */
  isFirstMention: boolean;
}

// ============================================================================
// CRISIS RESOURCES
// ============================================================================

const CRISIS_RESOURCES: Record<CrisisType, CrisisResource[]> = {
  suicidal_ideation: [
    {
      name: '988 Suicide & Crisis Lifeline',
      description: 'Free, confidential support 24/7',
      phone: '988',
      text: 'Text 988',
      chat: 'https://988lifeline.org/chat',
      available: '24/7',
    },
    {
      name: 'Crisis Text Line',
      description: 'Text with a trained crisis counselor',
      text: 'Text HOME to 741741',
      available: '24/7',
    },
    {
      name: 'International Association for Suicide Prevention',
      description: 'Find resources in your country',
      chat: 'https://www.iasp.info/resources/Crisis_Centres/',
      available: '24/7',
    },
  ],

  self_harm: [
    {
      name: '988 Suicide & Crisis Lifeline',
      description: 'Support for self-harm and suicidal thoughts',
      phone: '988',
      text: 'Text 988',
      available: '24/7',
    },
    {
      name: 'To Write Love on Her Arms',
      description: 'Hope and help for people struggling with self-injury',
      chat: 'https://twloha.com/find-help/',
      available: '24/7',
    },
  ],

  domestic_abuse: [
    {
      name: 'National Domestic Violence Hotline',
      description: 'Confidential support, safety planning, and resources',
      phone: '1-800-799-7233',
      text: 'Text START to 88788',
      chat: 'https://www.thehotline.org/get-help/',
      available: '24/7',
    },
    {
      name: 'National Coalition Against Domestic Violence',
      description: 'Resources and local shelter finder',
      chat: 'https://ncadv.org/get-help',
      available: '24/7',
    },
  ],

  child_abuse: [
    {
      name: 'Childhelp National Child Abuse Hotline',
      description: 'For anyone concerned about a child',
      phone: '1-800-422-4453',
      available: '24/7',
    },
    {
      name: 'Child Protective Services',
      description: 'Report suspected abuse',
      phone: 'Contact local CPS',
      available: '24/7',
    },
  ],

  elder_abuse: [
    {
      name: 'Eldercare Locator',
      description: 'Connect with local services for older adults',
      phone: '1-800-677-1116',
      available: '24/7',
    },
    {
      name: 'Adult Protective Services',
      description: 'Report suspected elder abuse',
      phone: 'Contact local APS',
      available: 'Varies by location',
    },
  ],

  substance_crisis: [
    {
      name: 'SAMHSA National Helpline',
      description: 'Free, confidential treatment referrals 24/7',
      phone: '1-800-662-4357',
      available: '24/7',
      specialization: ['addiction', 'substance abuse', 'treatment referral'],
    },
    {
      name: 'Poison Control',
      description: 'For overdose or poisoning emergencies',
      phone: '1-800-222-1222',
      available: '24/7',
    },
  ],

  severe_distress: [
    {
      name: '988 Suicide & Crisis Lifeline',
      description: 'Support for emotional distress',
      phone: '988',
      text: 'Text 988',
      available: '24/7',
    },
    {
      name: 'Crisis Text Line',
      description: 'Text with a trained crisis counselor',
      text: 'Text HOME to 741741',
      available: '24/7',
    },
  ],

  panic_attack: [
    {
      name: 'NAMI Helpline',
      description: 'Mental health support and resources',
      phone: '1-800-950-6264',
      text: 'Text NAMI to 741741',
      available: 'M-F 10am-10pm ET',
    },
  ],

  psychotic_symptoms: [
    {
      name: '988 Suicide & Crisis Lifeline',
      description: 'Mental health crisis support',
      phone: '988',
      text: 'Text 988',
      available: '24/7',
    },
    {
      name: 'NAMI Helpline',
      description: 'Mental health support and resources',
      phone: '1-800-950-6264',
      available: 'M-F 10am-10pm ET',
    },
  ],

  eating_disorder_crisis: [
    {
      name: 'National Eating Disorders Association Helpline',
      description: 'Support and treatment resources',
      phone: '1-800-931-2237',
      text: 'Text NEDA to 741741',
      available: 'M-Th 11am-9pm, F 11am-5pm ET',
      specialization: ['eating disorders', 'anorexia', 'bulimia', 'binge eating'],
    },
  ],

  sexual_assault: [
    {
      name: 'RAINN National Sexual Assault Hotline',
      description: 'Confidential support from trained staff',
      phone: '1-800-656-4673',
      chat: 'https://hotline.rainn.org/online',
      available: '24/7',
    },
  ],
};

// ============================================================================
// VALIDATION PHRASES
// ============================================================================

/**
 * Empathetic validation phrases by crisis type
 */
const VALIDATION_PHRASES: Record<CrisisType, string[]> = {
  suicidal_ideation: [
    "I hear you. What you're carrying sounds unbearably heavy right now.",
    'Thank you for telling me this. It takes courage to share something this real.',
    "I'm here. What you're feeling is real, and you don't have to face it alone.",
    "That sounds like so much pain. I'm glad you told me.",
  ],
  self_harm: [
    "I hear you. The urge to hurt yourself is telling you something about how much pain you're in.",
    "Thank you for trusting me with this. That's a lot to carry.",
    "I'm here. You don't have to face this alone.",
  ],
  domestic_abuse: [
    "I believe you. What you're describing is not okay, and it's not your fault.",
    'Thank you for trusting me with this. You deserve to feel safe.',
    "I hear you. What's happening to you matters, and so do you.",
  ],
  child_abuse: [
    "Thank you for telling me. Protecting children is so important, and I'm glad you're speaking up.",
    "I hear you. This is serious, and you're doing the right thing by talking about it.",
  ],
  elder_abuse: [
    "Thank you for telling me. What's happening isn't okay, and I'm glad you're speaking up.",
    'I hear you. This matters, and so does the person being hurt.',
  ],
  substance_crisis: [
    'I hear you. Addiction is so hard, and asking for help is brave.',
    "Thank you for telling me. You don't have to fight this alone.",
    "I'm here. What you're going through is real, and there's no shame in needing support.",
  ],
  severe_distress: [
    "I hear you. What you're feeling is overwhelming right now, and that's okay to say.",
    'Thank you for telling me. Sometimes everything really is too much.',
    "I'm here with you. This moment is hard, and you don't have to pretend otherwise.",
  ],
  panic_attack: [
    "I'm right here with you. This feeling is temporary, even though it doesn't feel like it.",
    "I hear you. Panic attacks are terrifying, and what you're feeling is real.",
    "I'm here. Let's breathe through this together.",
  ],
  psychotic_symptoms: [
    "I hear you. What you're experiencing sounds really frightening.",
    "Thank you for telling me. You don't have to figure this out alone.",
    "I'm here. What you're going through is real to you, and that matters.",
  ],
  eating_disorder_crisis: [
    "I hear you. The relationship with food and your body is so complicated, and you're not alone.",
    "Thank you for trusting me with this. What you're dealing with is hard.",
    "I'm here. You deserve support, and there's no shame in needing it.",
  ],
  sexual_assault: [
    'I believe you. What happened was not your fault.',
    'Thank you for trusting me with this. It takes so much courage to share.',
    "I'm here. You don't have to face this alone, and you deserve support.",
  ],
};

/**
 * Presence phrases - staying with the user
 */
const PRESENCE_PHRASES = [
  "I'm not going anywhere.",
  "I'm right here with you.",
  "You don't have to face this alone.",
  "I'm here, and I'm staying.",
  "We're in this together.",
];

/**
 * Resource introduction phrases - warm, not clinical
 */
const RESOURCE_INTRO_PHRASES = [
  'I want you to have more support than just me.',
  'There are people who specialize in exactly this, and I think they could help.',
  'You deserve people in your corner who are trained for moments like this.',
  "I'm here for you, AND I want you to have backup.",
  'Can I share something that might help?',
];

/**
 * Follow-up questions to keep engagement
 */
const FOLLOW_UP_QUESTIONS: Record<CrisisSeverity, string[]> = {
  critical: [
    'Will you call them with me here?',
    'Can we keep talking while you reach out?',
    'What do you need right now?',
  ],
  high: [
    'What would help most right now?',
    'Is there someone safe you can be with tonight?',
    "Can we talk about what's happening?",
  ],
  medium: [
    "Want to tell me more about what's going on?",
    "What's been weighing on you?",
    'How long have you been carrying this?',
  ],
  low: ["What's on your mind?", 'Want to talk about it?', "I'm here to listen."],
};

// ============================================================================
// RESPONSE GENERATION
// ============================================================================

/**
 * Generate a warm, human crisis response
 */
export function generateCrisisResponse(context: CrisisResponseContext): CrisisResponseContent {
  const { signal, userName, personaId, isFirstMention } = context;
  const { type, severity } = signal;

  // Select phrases
  const validationOptions = VALIDATION_PHRASES[type] || VALIDATION_PHRASES.severe_distress;
  const validation = validationOptions[Math.floor(Math.random() * validationOptions.length)];

  const presence = PRESENCE_PHRASES[Math.floor(Math.random() * PRESENCE_PHRASES.length)];

  const followUpOptions = FOLLOW_UP_QUESTIONS[severity];
  const followUp = followUpOptions[Math.floor(Math.random() * followUpOptions.length)];

  // Get resources for this crisis type
  const resources = CRISIS_RESOURCES[type] || CRISIS_RESOURCES.severe_distress;
  const primaryResource = resources[0];
  const additionalResources = resources.slice(1);

  // Build response based on severity
  let resourceIntro: string | undefined;
  let fullResponse: string;

  if (severity === 'critical' || severity === 'high') {
    resourceIntro =
      RESOURCE_INTRO_PHRASES[Math.floor(Math.random() * RESOURCE_INTRO_PHRASES.length)];

    const resourceDetails = formatResourceForVoice(primaryResource);

    fullResponse = [validation, presence, resourceIntro, resourceDetails, followUp].join(' ');
  } else {
    // Medium/low severity - validate and explore first
    fullResponse = [validation, presence, followUp].join(' ');
  }

  // Add name if known and this is a serious moment
  if (userName && (severity === 'critical' || severity === 'high')) {
    fullResponse = fullResponse.replace(/^(I hear you|I'm here|Thank you)/, `${userName}, $1`);
  }

  // Generate SSML with appropriate pauses
  const ssml = generateCrisisSSML(fullResponse, severity);

  log.info(
    {
      crisisType: type,
      severity,
      isFirstMention,
      hasResource: !!primaryResource,
    },
    '💙 Generated crisis response'
  );

  return {
    validation,
    presence,
    resourceIntro,
    primaryResource: severity === 'critical' || severity === 'high' ? primaryResource : undefined,
    additionalResources: severity === 'critical' ? additionalResources : undefined,
    followUp,
    fullResponse,
    ssml,
  };
}

/**
 * Format a resource for voice delivery (natural speech)
 */
function formatResourceForVoice(resource: CrisisResource): string {
  const parts: string[] = [];

  if (resource.phone) {
    parts.push(`You can call ${resource.name} at ${formatPhoneForVoice(resource.phone)}`);
  } else if (resource.text) {
    parts.push(`You can text them: ${resource.text}`);
  }

  if (resource.available === '24/7') {
    parts.push("They're available anytime, day or night");
  }

  return parts.join('. ') + '.';
}

/**
 * Format phone number for natural voice reading
 */
function formatPhoneForVoice(phone: string): string {
  // 988 stays as "nine eighty-eight"
  if (phone === '988') {
    return '988';
  }

  // 1-800 numbers - read naturally
  if (phone.startsWith('1-800')) {
    return phone; // Let TTS handle it
  }

  return phone;
}

/**
 * Generate SSML with appropriate pauses and tone for crisis response
 */
function generateCrisisSSML(text: string, severity: CrisisSeverity): string {
  let ssml = text;

  // Add opening pause to let words land
  ssml = `<break time="500ms"/>${ssml}`;

  // Add pauses after validation statements
  ssml = ssml.replace(/\. (I'm here|I'm not going|You don't have)/g, '.<break time="400ms"/> $1');

  // Slow down for phone numbers
  ssml = ssml.replace(/(\d{3}[-.]?\d{3}[-.]?\d{4}|\d{3})/g, '<prosody rate="slow">$1</prosody>');

  // Add emphasis on key phrases
  if (severity === 'critical') {
    ssml = ssml.replace(
      /(Will you call|Can we keep talking)/g,
      '<emphasis level="moderate">$1</emphasis>'
    );
  }

  return ssml;
}

/**
 * Get additional resources for a crisis type (for follow-up or data message)
 */
export function getCrisisResources(crisisType: CrisisType): CrisisResource[] {
  return CRISIS_RESOURCES[crisisType] || CRISIS_RESOURCES.severe_distress;
}

/**
 * Generate a grounding exercise for panic/severe distress
 */
export function getGroundingExercise(): string {
  const exercises = [
    "Let's try something together. Can you name 5 things you can see right now?",
    "Let's ground together. Feel your feet on the floor. What does that feel like?",
    'Breathe with me. In for 4... hold for 4... out for 4. Again.',
    'Look around the room. Can you find something blue? Something soft?',
  ];
  return exercises[Math.floor(Math.random() * exercises.length)];
}

/**
 * Generate a safety check question
 */
export function getSafetyCheckQuestion(crisisType: CrisisType): string {
  const DEFAULT_QUESTIONS = [
    'Are you somewhere safe right now?',
    'Is there someone who can be with you?',
  ];

  const questions: Partial<Record<CrisisType, string[]>> = {
    suicidal_ideation: [
      'Are you somewhere safe right now?',
      'Do you have access to anything you could use to hurt yourself?',
      'Is there someone who can be with you tonight?',
    ],
    self_harm: [
      'Have you hurt yourself today?',
      'Are you somewhere safe right now?',
      "Do you have access to things you've used before?",
    ],
    domestic_abuse: [
      'Are you safe to talk right now? Can your partner hear you?',
      'Do you have a safe place you could go if you needed to leave?',
      "Is there someone you trust who knows what's happening?",
    ],
  };

  const options = questions[crisisType] || DEFAULT_QUESTIONS;
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateCrisisResponse,
  getCrisisResources,
  getGroundingExercise,
  getSafetyCheckQuestion,
};
