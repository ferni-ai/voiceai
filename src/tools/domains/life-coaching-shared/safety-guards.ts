/**
 * Safety Guards for Life Coaching
 *
 * Detects crisis situations and ensures appropriate referral.
 * This is CRITICAL - we support, not replace professional help.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  coachingFloorRead,
  CRISIS_SEVERITY,
  EMERGENCY_FOR_THEM,
  IN_DANGER_NOW,
  scoreCrisisLanguage,
  type CoachingFloorRead,
} from '../../../services/safety/index.js';
import type { SafetyAssessment, CrisisResource, EmotionalState } from './types.js';

const log = getLogger();

// ============================================================================
// CRISIS RESOURCES
// ============================================================================

export const CRISIS_RESOURCES: Record<string, CrisisResource> = {
  general: {
    name: '988 Suicide & Crisis Lifeline',
    description: 'Free, confidential support 24/7',
    phone: '988',
    text: '988',
    website: 'https://988lifeline.org',
    available: '24/7',
  },
  text: {
    name: 'Crisis Text Line',
    description: 'Text-based crisis support',
    text: 'HOME to 741741',
    website: 'https://crisistextline.org',
    available: '24/7',
  },
  domesticViolence: {
    name: 'National Domestic Violence Hotline',
    description: 'Support for domestic violence survivors',
    phone: '1-800-799-7233',
    text: 'START to 88788',
    website: 'https://thehotline.org',
    available: '24/7',
  },
  sexualAssault: {
    name: 'RAINN',
    description: 'Sexual assault support',
    phone: '1-800-656-4673',
    website: 'https://rainn.org',
    available: '24/7',
  },
  eatingDisorder: {
    name: 'NEDA Helpline',
    description: 'Eating disorder support',
    phone: '1-800-931-2237',
    text: 'NEDA to 741741',
    website: 'https://nationaleatingdisorders.org',
    available: 'Mon-Thu 9am-9pm ET, Fri 9am-5pm ET',
  },
  lgbtq: {
    name: 'Trevor Project',
    description: 'LGBTQ+ crisis support',
    phone: '1-866-488-7386',
    text: 'START to 678-678',
    website: 'https://thetrevorproject.org',
    available: '24/7',
  },
  veterans: {
    name: 'Veterans Crisis Line',
    description: 'Support for veterans',
    phone: '988 (press 1)',
    text: '838255',
    website: 'https://veteranscrisisline.net',
    available: '24/7',
  },
  substance: {
    name: 'SAMHSA National Helpline',
    description: 'Substance abuse support',
    phone: '1-800-662-4357',
    website: 'https://samhsa.gov/find-help/national-helpline',
    available: '24/7',
  },
};

// ============================================================================
// ASSESSMENT FUNCTIONS
// ============================================================================

const IMMINENT_FLAG = 'suicidal: imminent means or attempt';
const FOR_THEM_FLAG = 'third party: emergency';

type Tier = Pick<SafetyAssessment, 'level' | 'recommendedAction'>;

/** The floor's own resource per category; suicidal and self-harm lines get the lifeline. */
const FLOOR_RESOURCE: Partial<
  Record<CoachingFloorRead['hits'][number]['category'], CrisisResource>
> = {
  abuse: CRISIS_RESOURCES.domesticViolence,
  eatingDisorder: CRISIS_RESOURCES.eatingDisorder,
};

/** Any flag is crisis, three concern phrases urgent, one (or the guard's distress) a check-in. */
function tierOf(flagged: boolean, concerns: number, distress: boolean): Tier {
  if (flagged) return { level: 'crisis', recommendedAction: 'immediate_referral' };
  if (concerns >= 3) return { level: 'urgent', recommendedAction: 'resources' };
  if (concerns >= 1 || distress) return { level: 'concerning', recommendedAction: 'check_in' };
  return { level: 'safe', recommendedAction: 'continue' };
}

/**
 * Assess safety level of user's message. The crisis guard reads the words (services/safety, the
 * kernel every voice turn uses); the coaching floor there only adds reads the guard does not make
 * yet, and never lowers one. Guard tiers map to the consumers' actions: crisis -> crisis
 * (immediate referral: the anger tool returns the crisis response, checkSafety blocks), means or
 * an attempt -> the 911 line first, a distress signal below crisis -> concerning (check-in).
 */
export function assessSafety(text: string): SafetyAssessment {
  const guard = scoreCrisisLanguage(text);
  const floor = coachingFloorRead(text);
  const flags: string[] = [];
  const resources: CrisisResource[] = [];
  const offerLifeline = (): void => {
    if (resources.includes(CRISIS_RESOURCES.general)) return;
    resources.push(CRISIS_RESOURCES.general, CRISIS_RESOURCES.text);
  };

  for (const { category, phrase } of floor.hits) {
    flags.push(`${category}: "${phrase}"`);
    const resource = FLOOR_RESOURCE[category];
    if (resource) resources.push(resource);
    else if (category !== 'violence') offerLifeline();
  }
  if (guard.isCrisis) {
    flags.push(`guard: ${guard.subject ?? 'self'}`);
    if (guard.subject !== 'third_party') offerLifeline();
  }
  // Means in hand, an attempt underway, or someone else down and not getting up (the guard's read).
  if (guard.indicators.includes('third_party_emergency')) flags.push(FOR_THEM_FLAG);
  else if (guard.indicators.includes('imminent_danger')) flags.push(IMMINENT_FLAG);

  const concernCount = floor.concerns;
  const distress = guard.severity >= CRISIS_SEVERITY.implicit;
  const { level, recommendedAction } = tierOf(flags.length > 0, concernCount, distress);
  // 988 at crisis or urgent, whatever the category: violence, abuse, eating carried none.
  const needs988 = level === 'crisis' || level === 'urgent';
  if (needs988 && !resources.includes(CRISIS_RESOURCES.general)) {
    resources.push(CRISIS_RESOURCES.general);
  }

  if (flags.length > 0 || concernCount > 0) {
    log.warn({ level, flags, concernCount }, 'Safety assessment detected concerns');
  }

  return { level, flags, recommendedAction, resources };
}

/**
 * Get crisis response message
 */
export function getCrisisResponse(assessment: SafetyAssessment): string {
  if (assessment.level === 'crisis') {
    let response =
      "I'm really glad you told me this, and I want you to know I take it seriously.\n\n";
    if (assessment.flags.includes(FOR_THEM_FLAG)) response += `${EMERGENCY_FOR_THEM}\n\n`;
    if (assessment.flags.includes(IMMINENT_FLAG)) {
      response += `If you've taken something or you're in danger right now, ${IN_DANGER_NOW}\n\n`;
    }
    response +=
      "What you're going through sounds really hard, and you deserve support from someone trained to help.\n\n";

    if (assessment.resources && assessment.resources.length > 0) {
      response += '**Please reach out now:**\n';
      for (const resource of assessment.resources) {
        response += `\n• **${resource.name}**`;
        if (resource.phone) response += ` - Call ${resource.phone}`;
        if (resource.text) response += ` or text ${resource.text}`;
        response += ` (${resource.available})`;
      }
    }

    response +=
      "\n\nI'm here for you, and talking to a crisis counselor doesn't mean you're broken - it means you're brave enough to get support.";

    return response;
  }

  if (assessment.level === 'urgent') {
    let response = "I hear that you're really struggling. ";
    response +=
      'Sometimes having someone to talk to who specializes in this can make a real difference.\n\n';

    if (assessment.resources && assessment.resources.length > 0) {
      response += 'If you want to talk to someone trained in this, you can reach:\n';
      for (const resource of assessment.resources) {
        response += `• ${resource.name}: ${resource.phone || resource.text}\n`;
      }
    }

    response += "\nI'm also here to listen. What do you need right now?";

    return response;
  }

  return 'I want to check in - how are you really doing?';
}

/**
 * Check if topic requires professional referral
 */
export function needsProfessionalReferral(topic: string): {
  needs: boolean;
  reason?: string;
  resource?: CrisisResource;
} {
  const lower = topic.toLowerCase();

  // Eating disorders need professional help
  if (
    lower.includes('eating disorder') ||
    lower.includes('anorexia') ||
    lower.includes('bulimia') ||
    lower.includes('binge eating')
  ) {
    return {
      needs: true,
      reason: 'Eating disorders benefit significantly from specialized professional support.',
      resource: CRISIS_RESOURCES.eatingDisorder,
    };
  }

  // Trauma processing needs professional guidance
  if (lower.includes('trauma') || lower.includes('ptsd') || lower.includes('abuse')) {
    return {
      needs: true,
      reason:
        'Processing trauma is most effective with a trained trauma therapist. I can support you alongside that work.',
    };
  }

  // Severe mental health conditions
  if (
    lower.includes('psychosis') ||
    lower.includes('hearing voices') ||
    lower.includes('seeing things')
  ) {
    return {
      needs: true,
      reason: "What you're describing would benefit from professional evaluation.",
      resource: CRISIS_RESOURCES.general,
    };
  }

  return { needs: false };
}

// EMOTIONAL STATE SAFETY

/**
 * Check if emotional state warrants concern
 */
export function isEmotionalStateConcerning(state: EmotionalState): boolean {
  return state === 'distressed' || state === 'numb';
}

/**
 * Get grounding suggestion for distressed state
 */
export function getGroundingSuggestion(): string {
  return `Let's take a breath together first. Can you feel your feet on the ground? Notice 5 things you can see around you. You're here, in this moment, and you're safe.`;
}

// SAFE BOUNDARIES FOR AI COACHING

/**
 * Topics we redirect to professionals
 */
export const PROFESSIONAL_REFERRAL_TOPICS = [
  'medication management',
  'psychiatric diagnosis',
  'medical advice',
  'legal advice',
  'financial advice',
  'active addiction treatment',
  'couples therapy (we can support individuals)',
];

/**
 * Get appropriate disclaimer for sensitive topics
 */
export function getTopicDisclaimer(topic: string): string | null {
  const lower = topic.toLowerCase();

  if (lower.includes('medic') || lower.includes('health condition')) {
    return "I can offer support and help you prepare for conversations with healthcare providers, but I can't give medical advice.";
  }

  if (lower.includes('legal')) {
    return 'I can help you think through situations, but for legal matters, please consult with a qualified attorney.';
  }

  if (lower.includes('suicid') || lower.includes('self-harm')) {
    return "If you're having thoughts of suicide or self-harm, please reach out to 988 - they're trained to help.";
  }

  return null;
}

// DOMAIN-AWARE SAFETY THRESHOLDS

/**
 * Some domains need stricter safety checks than others.
 * HIGH = trauma, grief, chronic conditions (always check carefully)
 * MEDIUM = boundaries, anger, body image (check with context)
 * STANDARD = procrastination, digital wellness, dating (standard checks)
 */
export type DomainSensitivity = 'high' | 'medium' | 'standard';

const DOMAIN_SENSITIVITY: Record<string, DomainSensitivity> = {
  // High sensitivity - always check carefully
  'trauma-support': 'high',
  grief: 'high',
  'chronic-conditions': 'high',
  crisis: 'high',
  intimacy: 'high',

  // Medium sensitivity - context-aware checking
  boundaries: 'medium',
  anger: 'medium',
  'body-relationship': 'medium',
  'burnout-recovery': 'medium',
  'breakup-recovery': 'medium',
  midlife: 'medium',

  // Standard sensitivity - normal checks
  procrastination: 'standard',
  'digital-wellness': 'standard',
  perfectionism: 'standard',
  'social-skills': 'standard',
  dating: 'standard',
  neurodiversity: 'standard',
};

/**
 * Additional indicators to check for high-sensitivity domains
 */
const HIGH_SENSITIVITY_INDICATORS = [
  'flashback',
  'triggered',
  "can't breathe",
  'panic',
  'dissociating',
  'unsafe',
  'scared',
  'terrified',
  'trauma',
];

/**
 * Check safety with domain context
 * High-sensitivity domains have stricter thresholds
 */
export function checkSafetyForDomain(
  query: string,
  domain: string
): { isSafe: boolean; warning?: string; intervention?: string } {
  const sensitivity = DOMAIN_SENSITIVITY[domain] || 'standard';
  const assessment = assessSafety(query);

  // For high-sensitivity domains, also check additional indicators
  if (sensitivity === 'high') {
    const lower = query.toLowerCase();
    for (const indicator of HIGH_SENSITIVITY_INDICATORS) {
      if (lower.includes(indicator)) {
        // For high-sensitivity domains, these are urgent
        if (assessment.level === 'safe') {
          return {
            isSafe: true,
            warning: `High-sensitivity domain "${domain}" - detected: "${indicator}". Proceed with extra care.`,
          };
        }
      }
    }

    // In high-sensitivity domains, concerning becomes urgent
    if (assessment.level === 'concerning') {
      return {
        isSafe: true,
        warning: `High-sensitivity domain "${domain}" - some concerns detected. Consider offering resources.`,
      };
    }
  }

  // For medium-sensitivity domains
  if (sensitivity === 'medium') {
    if (assessment.level === 'concerning') {
      return {
        isSafe: true,
        warning: `Medium-sensitivity domain "${domain}" - monitor for escalation.`,
      };
    }
  }

  // Standard check
  if (assessment.level === 'crisis') {
    return {
      isSafe: false,
      warning: 'Crisis indicators detected',
      intervention: getCrisisResponse(assessment),
    };
  }

  if (assessment.level === 'urgent') {
    return {
      isSafe: false,
      warning: 'Urgent concerns detected',
      intervention: getCrisisResponse(assessment),
    };
  }

  if (assessment.level === 'concerning') {
    return {
      isSafe: true,
      warning: 'Some concerning indicators detected - proceed with care',
    };
  }

  return { isSafe: true };
}

/**
 * Get domain sensitivity level
 */
export function getDomainSensitivity(domain: string): DomainSensitivity {
  return DOMAIN_SENSITIVITY[domain] || 'standard';
}

// CONVENIENCE WRAPPER

/**
 * Check if user input contains concerning content (domain-agnostic)
 * Returns an object with safety status and optional intervention
 *
 * This is the primary function used by life coaching domain tools.
 */
export function checkSafety(query: string): {
  isSafe: boolean;
  warning?: string;
  intervention?: string;
} {
  const assessment = assessSafety(query);

  if (assessment.level === 'crisis') {
    return {
      isSafe: false,
      warning: 'Crisis indicators detected',
      intervention: getCrisisResponse(assessment),
    };
  }

  if (assessment.level === 'urgent') {
    return {
      isSafe: false,
      warning: 'Urgent concerns detected',
      intervention: getCrisisResponse(assessment),
    };
  }

  if (assessment.level === 'concerning') {
    // Concerning but not crisis - allow tool to proceed but flag it
    return {
      isSafe: true,
      warning: 'Some concerning indicators detected - proceed with care',
    };
  }

  return { isSafe: true };
}

/**
 * Simple safety guard object for domain tools (legacy interface)
 * @deprecated Use checkSafety() or checkSafetyForDomain() function directly instead
 */
export const safetyGuard = {
  checkSafety,
  checkSafetyForDomain,
};
