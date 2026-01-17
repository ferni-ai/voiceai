/**
 * Domain Outreach Triggers
 *
 * Automatically schedules outreach when domain-specific tools are executed.
 * Life stage domains get appropriate follow-up triggers.
 *
 * @module services/outreach/domain-outreach-triggers
 */

import { createLogger } from '../../utils/safe-logger.js';
import { publishOutreachTrigger, publishEmotionalSupportTrigger } from './trigger-publisher.js';
import type { OutreachPriority } from './decision-engine.js';

const log = createLogger({ module: 'DomainOutreachTriggers' });

// ============================================================================
// TYPES
// ============================================================================

interface DomainTriggerConfig {
  /** Type of outreach trigger */
  type:
    | 'emotional_support'
    | 'commitment_check'
    | 'thinking_of_you'
    | 'celebration'
    | 'habit_check';
  /** Days until follow-up (0 = immediate) */
  followUpDays: number;
  /** Default message/reason */
  message: string;
  /** Best persona for this domain */
  persona: string;
  /** Priority level */
  priority: OutreachPriority;
  /** Whether this is a sensitive topic requiring gentler approach */
  sensitive?: boolean;
}

// ============================================================================
// DOMAIN TRIGGER CONFIGS
// ============================================================================

const DOMAIN_TRIGGERS: Record<string, DomainTriggerConfig> = {
  // Life Stage Domains
  'new-parent': {
    type: 'emotional_support',
    followUpDays: 3,
    message: 'Checking in on how parenthood is going',
    persona: 'ferni',
    priority: 'medium',
  },
  'empty-nest': {
    type: 'thinking_of_you',
    followUpDays: 7,
    message: 'Thinking about your transition to empty nest',
    persona: 'ferni',
    priority: 'low',
  },
  infidelity: {
    type: 'emotional_support',
    followUpDays: 5,
    message: 'Gentle check-in after our conversation',
    persona: 'ferni',
    priority: 'medium',
    sensitive: true,
  },
  'health-diagnosis': {
    type: 'emotional_support',
    followUpDays: 7,
    message: 'Thinking about you and your health journey',
    persona: 'ferni',
    priority: 'medium',
    sensitive: true,
  },
  'job-loss': {
    type: 'commitment_check',
    followUpDays: 5,
    message: 'Following up on your job search and wellbeing',
    persona: 'ferni',
    priority: 'medium',
  },
  sobriety: {
    type: 'emotional_support',
    followUpDays: 1, // More frequent for recovery
    message: 'Daily recovery check-in',
    persona: 'ferni',
    priority: 'high',
    sensitive: true,
  },
  'sandwich-generation': {
    type: 'emotional_support',
    followUpDays: 5,
    message: 'Checking on your caregiving balance',
    persona: 'ferni',
    priority: 'medium',
  },
  'blended-family': {
    type: 'thinking_of_you',
    followUpDays: 7,
    message: 'How is the family integration going?',
    persona: 'ferni',
    priority: 'low',
  },
  'coming-out': {
    type: 'emotional_support',
    followUpDays: 3,
    message: 'Thinking about you and your journey',
    persona: 'ferni',
    priority: 'medium',
    sensitive: true,
  },
  'faith-transition': {
    type: 'thinking_of_you',
    followUpDays: 7,
    message: 'Reflecting on your spiritual journey',
    persona: 'nayan',
    priority: 'low',
  },
  divorce: {
    type: 'emotional_support',
    followUpDays: 5,
    message: 'Checking in during your transition',
    persona: 'ferni',
    priority: 'medium',
    sensitive: true,
  },
  grief: {
    type: 'emotional_support',
    followUpDays: 3,
    message: "I've been thinking about you",
    persona: 'ferni',
    priority: 'medium',
    sensitive: true,
  },
  'breakup-recovery': {
    type: 'emotional_support',
    followUpDays: 5,
    message: 'How are you doing after our last conversation?',
    persona: 'ferni',
    priority: 'medium',
  },

  // Emotional Domains
  anxiety: {
    type: 'emotional_support',
    followUpDays: 2,
    message: 'Checking in on your anxiety',
    persona: 'ferni',
    priority: 'medium',
  },
  depression: {
    type: 'emotional_support',
    followUpDays: 2,
    message: 'Gentle check-in',
    persona: 'ferni',
    priority: 'high',
    sensitive: true,
  },
  burnout: {
    type: 'emotional_support',
    followUpDays: 3,
    message: 'How is your capacity doing?',
    persona: 'maya',
    priority: 'medium',
  },
  anger: {
    type: 'thinking_of_you',
    followUpDays: 2,
    message: 'Following up on what we discussed',
    persona: 'ferni',
    priority: 'low',
  },
  shame: {
    type: 'emotional_support',
    followUpDays: 3,
    message: 'Thinking about our conversation',
    persona: 'ferni',
    priority: 'medium',
    sensitive: true,
  },
  envy: {
    type: 'thinking_of_you',
    followUpDays: 5,
    message: 'How are you feeling about things?',
    persona: 'ferni',
    priority: 'low',
  },
  resentment: {
    type: 'thinking_of_you',
    followUpDays: 5,
    message: 'Checking in on your journey toward peace',
    persona: 'nayan',
    priority: 'low',
  },

  // Habit/Lifestyle Domains
  'habit-coaching': {
    type: 'habit_check',
    followUpDays: 1,
    message: 'Quick habit check-in',
    persona: 'maya',
    priority: 'low',
  },
  'morning-routine': {
    type: 'habit_check',
    followUpDays: 1,
    message: 'How was your morning?',
    persona: 'maya',
    priority: 'low',
  },
  sleep: {
    type: 'habit_check',
    followUpDays: 2,
    message: 'How is your sleep going?',
    persona: 'maya',
    priority: 'low',
  },
  exercise: {
    type: 'habit_check',
    followUpDays: 2,
    message: 'Quick fitness check-in',
    persona: 'maya',
    priority: 'low',
  },

  // Planning Domains
  'event-planning': {
    type: 'commitment_check',
    followUpDays: 3,
    message: 'How is the planning going?',
    persona: 'jordan',
    priority: 'low',
  },
  'goal-setting': {
    type: 'commitment_check',
    followUpDays: 7,
    message: 'Progress check on your goals',
    persona: 'ferni',
    priority: 'low',
  },
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Called when a domain tool is executed.
 * Schedules appropriate follow-up outreach.
 */
export async function onDomainToolExecuted(
  userId: string,
  domain: string,
  toolId: string,
  sessionId: string,
  options?: {
    emotionDetected?: string;
    emotionIntensity?: number;
    skipIfRecent?: boolean;
  }
): Promise<void> {
  const config = DOMAIN_TRIGGERS[domain];

  if (!config) {
    log.debug({ domain, toolId }, 'No outreach config for domain');
    return;
  }

  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + config.followUpDays);

  try {
    // If emotion detected and high intensity, use emotional support trigger
    if (options?.emotionDetected && options?.emotionIntensity && options.emotionIntensity > 0.6) {
      await publishEmotionalSupportTrigger(
        userId,
        options.emotionDetected,
        options.emotionIntensity,
        {
          sessionId,
          personaId: config.persona,
          topics: [domain],
        }
      );

      log.info(
        {
          userId,
          domain,
          emotion: options.emotionDetected,
          intensity: options.emotionIntensity,
        },
        '🎯 Emotion-driven outreach scheduled'
      );
      return;
    }

    // Standard domain-based outreach
    await publishOutreachTrigger({
      userId,
      type: config.type,
      priority: config.priority,
      reason: config.message,
      scheduledFor: scheduledFor.toISOString(),
      sessionId,
      personaId: config.persona,
      context: {
        metadata: {
          triggerDomain: domain,
          triggerTool: toolId,
          sensitive: config.sensitive,
        },
      },
    });

    log.info(
      {
        userId,
        domain,
        followUpDays: config.followUpDays,
        type: config.type,
      },
      '📅 Domain follow-up scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), domain, userId }, 'Failed to schedule domain outreach');
  }
}

/**
 * Get the trigger config for a domain
 */
export function getDomainTriggerConfig(domain: string): DomainTriggerConfig | undefined {
  return DOMAIN_TRIGGERS[domain];
}

/**
 * Check if a domain has outreach triggers configured
 */
export function hasDomainTrigger(domain: string): boolean {
  return domain in DOMAIN_TRIGGERS;
}

/**
 * Get all domains with trigger configs
 */
export function getAllTriggeredDomains(): string[] {
  return Object.keys(DOMAIN_TRIGGERS);
}

/**
 * Get all sensitive domains (require gentle handling)
 */
export function getSensitiveDomains(): string[] {
  return Object.entries(DOMAIN_TRIGGERS)
    .filter(([, config]) => config.sensitive)
    .map(([domain]) => domain);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  onDomainToolExecuted,
  getDomainTriggerConfig,
  hasDomainTrigger,
  getAllTriggeredDomains,
  getSensitiveDomains,
  DOMAIN_TRIGGERS,
};
