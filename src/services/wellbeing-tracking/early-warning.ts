/**
 * Early Warning System
 *
 * Phase 21: Predict struggles before they become crises.
 * Multi-signal pattern detection for depression, anxiety, burnout, etc.
 *
 * @module EarlyWarning
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { WellbeingDimensions, WellbeingProfile } from './index.js';

const log = getLogger().child({ module: 'early-warning' });

// ============================================================================
// TYPES
// ============================================================================

export type WarningType =
  | 'depression_risk'
  | 'anxiety_spike'
  | 'burnout_trajectory'
  | 'isolation_pattern'
  | 'sleep_deterioration'
  | 'motivation_collapse'
  | 'hopelessness_pattern'
  | 'crisis_risk';

export type WarningSeverity = 'watch' | 'concern' | 'urgent';

export interface WarningSignal {
  signal: string;
  weight: number; // 0-1
  observation: string;
  detected: boolean;
  source: 'wellbeing' | 'conversation' | 'pattern' | 'voice';
}

export interface EarlyWarning {
  id: string;
  userId: string;
  type: WarningType;
  severity: WarningSeverity;
  confidence: number; // 0-1

  // What triggered the warning
  signals: WarningSignal[];
  triggerScore: number; // Sum of triggered signal weights

  // Context
  detectedAt: Date;
  context?: string;

  // Recommended actions
  recommendations: {
    forUser: string[];
    forFerni: string[];
    suggestProfessional: boolean;
  };

  // History
  previousOccurrences: number;
  wasAccurate?: boolean; // Feedback on past warnings
}

export interface WarningPattern {
  type: WarningType;
  signals: Array<{
    signal: string;
    weight: number;
    detector: (profile: WellbeingProfile, conversationContext?: ConversationData) => boolean;
    observation: string;
  }>;
  threshold: number; // Sum of weights needed to trigger
  severeThreshold: number; // Threshold for 'urgent' severity
}

export interface ConversationData {
  recentMessages?: string[];
  emotionalTone?: string;
  topics?: string[];
  sessionDuration?: number;
  daysSinceLastSession?: number;
}

export interface WarningHistory {
  userId: string;
  warnings: EarlyWarning[];
  lastChecked: Date;
  accuracyScore: number; // 0-1, how often warnings were accurate
}

// ============================================================================
// STORAGE
// ============================================================================

const warningHistories = new Map<string, WarningHistory>();

// ============================================================================
// WARNING PATTERNS
// ============================================================================

const WARNING_PATTERNS: WarningPattern[] = [
  {
    type: 'depression_risk',
    signals: [
      {
        signal: 'mood_declining_3_days',
        weight: 0.25,
        observation: 'Mood has been declining for 3+ days',
        detector: (profile) => {
          const trends = profile.weeklyTrends.find((t) => t.dimension === 'mood');
          return trends?.direction === 'declining' && trends.magnitude > 0.05;
        },
      },
      {
        signal: 'energy_below_baseline',
        weight: 0.2,
        observation: 'Energy consistently below personal baseline',
        detector: (profile) => {
          const current = profile.current?.dimensions.energy;
          const baseline = profile.personalBaseline?.dimensions.energy;
          return current !== undefined && baseline !== undefined && current < baseline - 0.2;
        },
      },
      {
        signal: 'sleep_disruption',
        weight: 0.15,
        observation: 'Sleep quality has deteriorated',
        detector: (profile) => {
          const sleep = profile.current?.dimensions.sleepQuality;
          return sleep !== undefined && sleep < 0.4;
        },
      },
      {
        signal: 'social_withdrawal',
        weight: 0.15,
        observation: 'Increased loneliness or social withdrawal',
        detector: (profile) => {
          const loneliness = profile.current?.dimensions.loneliness;
          return loneliness !== undefined && loneliness > 0.6;
        },
      },
      {
        signal: 'hopelessness_language',
        weight: 0.15,
        observation: 'Expressions of hopelessness detected',
        detector: (profile) => {
          const hope = profile.current?.dimensions.hopefulness;
          return hope !== undefined && hope < 0.3;
        },
      },
      {
        signal: 'motivation_drop',
        weight: 0.1,
        observation: 'Motivation has significantly decreased',
        detector: (profile) => {
          const motivation = profile.current?.dimensions.motivation;
          return motivation !== undefined && motivation < 0.3;
        },
      },
    ],
    threshold: 0.5,
    severeThreshold: 0.75,
  },
  {
    type: 'anxiety_spike',
    signals: [
      {
        signal: 'worry_elevated',
        weight: 0.3,
        observation: 'Worry levels significantly elevated',
        detector: (profile) => {
          const worry = profile.current?.dimensions.worry;
          return worry !== undefined && worry > 0.7;
        },
      },
      {
        signal: 'physical_tension',
        weight: 0.2,
        observation: 'Physical tension reported',
        detector: (profile) => {
          const tension = profile.current?.dimensions.physicalTension;
          return tension !== undefined && tension > 0.6;
        },
      },
      {
        signal: 'sleep_anxiety',
        weight: 0.2,
        observation: 'Sleep disrupted by anxiety',
        detector: (profile) => {
          const worry = profile.current?.dimensions.worry;
          const sleep = profile.current?.dimensions.sleepQuality;
          return (worry ?? 0) > 0.5 && (sleep ?? 1) < 0.4;
        },
      },
      {
        signal: 'catastrophizing_increase',
        weight: 0.15,
        observation: 'Increased catastrophic thinking',
        detector: (_profile, context) => {
          // Would integrate with distortion detector
          return context?.emotionalTone === 'anxious';
        },
      },
      {
        signal: 'avoidance_pattern',
        weight: 0.15,
        observation: 'Avoidance behaviors mentioned',
        detector: (_profile, context) => {
          const avoidanceWords = ['avoiding', "can't face", 'too scared', 'what if'];
          return (
            context?.recentMessages?.some((m) =>
              avoidanceWords.some((w) => m.toLowerCase().includes(w))
            ) ?? false
          );
        },
      },
    ],
    threshold: 0.5,
    severeThreshold: 0.8,
  },
  {
    type: 'burnout_trajectory',
    signals: [
      {
        signal: 'exhaustion_persistent',
        weight: 0.3,
        observation: 'Persistent exhaustion beyond normal tiredness',
        detector: (profile) => {
          const energy = profile.current?.dimensions.energy;
          const trend = profile.weeklyTrends.find((t) => t.dimension === 'energy');
          return (energy ?? 1) < 0.3 && trend?.direction === 'declining';
        },
      },
      {
        signal: 'cynicism_increase',
        weight: 0.2,
        observation: 'Increased cynicism or detachment',
        detector: (profile) => {
          const meaning = profile.current?.dimensions.meaningfulness;
          return meaning !== undefined && meaning < 0.3;
        },
      },
      {
        signal: 'effectiveness_doubt',
        weight: 0.2,
        observation: 'Doubting professional effectiveness',
        detector: (_profile, context) => {
          const doubts = ['pointless', 'waste of time', 'not making a difference', 'why bother'];
          return (
            context?.recentMessages?.some((m) => doubts.some((d) => m.toLowerCase().includes(d))) ??
            false
          );
        },
      },
      {
        signal: 'work_life_imbalance',
        weight: 0.15,
        observation: 'Work-life balance severely compromised',
        detector: (profile) => {
          const selfCare = profile.current?.dimensions.selfCareLevel;
          return selfCare !== undefined && selfCare < 0.3;
        },
      },
      {
        signal: 'reduced_productivity',
        weight: 0.15,
        observation: 'Significant reduction in productivity mentioned',
        detector: (_profile, context) => {
          const indicators = [
            "can't focus",
            'getting nothing done',
            'falling behind',
            'overwhelmed',
          ];
          return (
            context?.recentMessages?.some((m) =>
              indicators.some((i) => m.toLowerCase().includes(i))
            ) ?? false
          );
        },
      },
    ],
    threshold: 0.5,
    severeThreshold: 0.7,
  },
  {
    type: 'isolation_pattern',
    signals: [
      {
        signal: 'loneliness_high',
        weight: 0.35,
        observation: 'High loneliness reported',
        detector: (profile) => {
          const loneliness = profile.current?.dimensions.loneliness;
          return loneliness !== undefined && loneliness > 0.7;
        },
      },
      {
        signal: 'social_withdrawal',
        weight: 0.25,
        observation: 'Social withdrawal behaviors',
        detector: (_profile, context) => {
          const indicators = ["haven't seen anyone", 'staying home', "don't want to talk", 'alone'];
          return (
            context?.recentMessages?.some((m) =>
              indicators.some((i) => m.toLowerCase().includes(i))
            ) ?? false
          );
        },
      },
      {
        signal: 'connection_decline',
        weight: 0.2,
        observation: 'Social satisfaction declining',
        detector: (profile) => {
          const social = profile.current?.dimensions.socialSatisfaction;
          return social !== undefined && social < 0.3;
        },
      },
      {
        signal: 'days_since_contact',
        weight: 0.2,
        observation: 'Extended time since last conversation',
        detector: (_profile, context) => {
          return (context?.daysSinceLastSession ?? 0) > 7;
        },
      },
    ],
    threshold: 0.5,
    severeThreshold: 0.75,
  },
  {
    type: 'sleep_deterioration',
    signals: [
      {
        signal: 'sleep_quality_low',
        weight: 0.4,
        observation: 'Sleep quality significantly reduced',
        detector: (profile) => {
          const sleep = profile.current?.dimensions.sleepQuality;
          return sleep !== undefined && sleep < 0.3;
        },
      },
      {
        signal: 'sleep_declining',
        weight: 0.3,
        observation: 'Sleep quality declining over time',
        detector: (profile) => {
          const trend = profile.weeklyTrends.find((t) => t.dimension === 'sleepQuality');
          return trend?.direction === 'declining';
        },
      },
      {
        signal: 'sleep_mentions',
        weight: 0.3,
        observation: 'Sleep problems mentioned in conversation',
        detector: (_profile, context) => {
          const indicators = ["can't sleep", 'insomnia', 'waking up', 'nightmares', 'exhausted'];
          return (
            context?.recentMessages?.some((m) =>
              indicators.some((i) => m.toLowerCase().includes(i))
            ) ?? false
          );
        },
      },
    ],
    threshold: 0.5,
    severeThreshold: 0.8,
  },
  {
    type: 'hopelessness_pattern',
    signals: [
      {
        signal: 'hope_very_low',
        weight: 0.4,
        observation: 'Hopefulness severely diminished',
        detector: (profile) => {
          const hope = profile.current?.dimensions.hopefulness;
          return hope !== undefined && hope < 0.2;
        },
      },
      {
        signal: 'hopeless_language',
        weight: 0.35,
        observation: 'Hopeless language detected',
        detector: (_profile, context) => {
          const indicators = [
            'no point',
            'never get better',
            'always be this way',
            "what's the use",
            'give up',
            "can't go on",
          ];
          return (
            context?.recentMessages?.some((m) =>
              indicators.some((i) => m.toLowerCase().includes(i))
            ) ?? false
          );
        },
      },
      {
        signal: 'meaning_absent',
        weight: 0.25,
        observation: 'Sense of meaning or purpose absent',
        detector: (profile) => {
          const meaning = profile.current?.dimensions.meaningfulness;
          return meaning !== undefined && meaning < 0.2;
        },
      },
    ],
    threshold: 0.5,
    severeThreshold: 0.7,
  },
  {
    type: 'crisis_risk',
    signals: [
      {
        signal: 'self_harm_language',
        weight: 0.5,
        observation: 'Language suggesting self-harm risk',
        detector: (_profile, context) => {
          const indicators = [
            'hurt myself',
            'end it',
            "don't want to be here",
            'better off without me',
            "can't take it anymore",
            'want to die',
            'kill myself',
          ];
          return (
            context?.recentMessages?.some((m) =>
              indicators.some((i) => m.toLowerCase().includes(i))
            ) ?? false
          );
        },
      },
      {
        signal: 'hopelessness_severe',
        weight: 0.3,
        observation: 'Severe hopelessness detected',
        detector: (profile) => {
          const hope = profile.current?.dimensions.hopefulness;
          return hope !== undefined && hope < 0.1;
        },
      },
      {
        signal: 'isolation_severe',
        weight: 0.2,
        observation: 'Severe isolation with other risk factors',
        detector: (profile) => {
          const loneliness = profile.current?.dimensions.loneliness;
          const hope = profile.current?.dimensions.hopefulness;
          return (loneliness ?? 0) > 0.8 && (hope ?? 1) < 0.3;
        },
      },
    ],
    threshold: 0.3, // Lower threshold for crisis
    severeThreshold: 0.5,
  },
];

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

const RECOMMENDATIONS: Record<
  WarningType,
  {
    forUser: string[];
    forFerni: string[];
    suggestProfessionalAt: WarningSeverity;
  }
> = {
  depression_risk: {
    forUser: [
      'Try to get outside for a short walk today',
      'Reach out to one person who cares about you',
      'Do one small thing that usually brings you joy',
      'Be gentle with yourself - this is temporary',
    ],
    forFerni: [
      'Use warmer, more supportive tone',
      'Celebrate even tiny wins',
      'Gently check in on sleep and eating',
      'Avoid pushing for action - focus on being present',
    ],
    suggestProfessionalAt: 'concern',
  },
  anxiety_spike: {
    forUser: [
      'Try the 5-4-3-2-1 grounding technique',
      'Take three slow, deep breaths',
      'Write down your worries to get them out of your head',
      'Focus on what you can control right now',
    ],
    forFerni: [
      'Speak more slowly and calmly',
      'Offer grounding exercises proactively',
      'Help break big worries into smaller pieces',
      'Validate the anxiety without feeding it',
    ],
    suggestProfessionalAt: 'urgent',
  },
  burnout_trajectory: {
    forUser: [
      'Take a real break - even 10 minutes',
      'Say no to one thing this week',
      'Do something that has nothing to do with productivity',
      "Talk to someone about how you're really doing",
    ],
    forFerni: [
      'Acknowledge the exhaustion without judgment',
      'Help identify what can be delegated or dropped',
      'Focus on restoration, not optimization',
      'Gently challenge productivity-guilt',
    ],
    suggestProfessionalAt: 'concern',
  },
  isolation_pattern: {
    forUser: [
      'Text or call one person today',
      'Go somewhere with other people, even briefly',
      'Consider a low-pressure social activity',
      'Remember: loneliness lies - people do care',
    ],
    forFerni: [
      'Be extra present and engaged',
      'Gently encourage social connection',
      'Validate the difficulty of reaching out',
      "Remind them they're not alone",
    ],
    suggestProfessionalAt: 'concern',
  },
  sleep_deterioration: {
    forUser: [
      'Try a consistent sleep and wake time',
      'Reduce screen time before bed',
      'Try a relaxation technique at bedtime',
      'Avoid caffeine after 2pm',
    ],
    forFerni: [
      'Gently explore sleep habits',
      'Offer relaxation exercises',
      'Connect sleep to overall wellbeing',
      'Check for underlying worries affecting sleep',
    ],
    suggestProfessionalAt: 'urgent',
  },
  motivation_collapse: {
    forUser: [
      'Start with the smallest possible action',
      'Commit to just 5 minutes of something',
      'Remember why things used to matter',
      "This feeling is temporary, even if it doesn't feel that way",
    ],
    forFerni: [
      "Don't push for motivation",
      'Validate how hard this is',
      'Help find tiny wins',
      "Explore what's underneath the lack of motivation",
    ],
    suggestProfessionalAt: 'concern',
  },
  hopelessness_pattern: {
    forUser: [
      "This feeling will pass, even if it doesn't seem like it",
      'Reach out to someone who cares',
      'Focus only on getting through today',
      'Consider talking to a professional',
    ],
    forFerni: [
      'Be very gentle and patient',
      "Don't try to fix or solve",
      'Validate the pain',
      'Gently suggest professional support',
    ],
    suggestProfessionalAt: 'watch',
  },
  crisis_risk: {
    forUser: [
      'Please reach out to a crisis line (988 in US)',
      "Tell someone you trust how you're feeling",
      'Go somewhere safe with other people',
      'You matter, and help is available',
    ],
    forFerni: [
      'Express genuine care and concern',
      'Provide crisis resources immediately',
      "Stay present and don't end session abruptly",
      'Follow up proactively',
    ],
    suggestProfessionalAt: 'watch',
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check for early warnings.
 */
export function checkWarnings(
  profile: WellbeingProfile,
  context?: ConversationData
): EarlyWarning[] {
  const warnings: EarlyWarning[] = [];
  const history = getOrCreateHistory(profile.userId);

  for (const pattern of WARNING_PATTERNS) {
    const triggeredSignals: WarningSignal[] = [];
    let triggerScore = 0;

    for (const signalDef of pattern.signals) {
      const detected = signalDef.detector(profile, context);
      triggeredSignals.push({
        signal: signalDef.signal,
        weight: signalDef.weight,
        observation: signalDef.observation,
        detected,
        source: 'wellbeing',
      });

      if (detected) {
        triggerScore += signalDef.weight;
      }
    }

    if (triggerScore >= pattern.threshold) {
      const severity: WarningSeverity =
        triggerScore >= pattern.severeThreshold
          ? 'urgent'
          : triggerScore >= pattern.threshold + 0.15
            ? 'concern'
            : 'watch';

      const recs = RECOMMENDATIONS[pattern.type];
      const previousCount = history.warnings.filter((w) => w.type === pattern.type).length;

      const warning: EarlyWarning = {
        id: `warn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: profile.userId,
        type: pattern.type,
        severity,
        confidence: Math.min(triggerScore / pattern.severeThreshold, 0.95),
        signals: triggeredSignals,
        triggerScore,
        detectedAt: new Date(),
        recommendations: {
          forUser: selectRecommendations(recs.forUser, severity),
          forFerni: recs.forFerni,
          suggestProfessional: severityLevel(severity) >= severityLevel(recs.suggestProfessionalAt),
        },
        previousOccurrences: previousCount,
      };

      warnings.push(warning);

      // Store in history
      history.warnings.push(warning);
      history.lastChecked = new Date();

      log.warn(
        { userId: profile.userId, type: pattern.type, severity, score: triggerScore },
        'Early warning detected'
      );
    }
  }

  return warnings;
}

/**
 * Get active warnings for a user.
 */
export function getActiveWarnings(userId: string): EarlyWarning[] {
  const history = warningHistories.get(userId);
  if (!history) return [];

  // Return warnings from last 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return history.warnings.filter((w) => w.detectedAt >= cutoff);
}

/**
 * Get warning context for LLM.
 */
export function getWarningContextInjection(userId: string): string {
  const active = getActiveWarnings(userId);
  if (active.length === 0) return '';

  // Get most severe warning
  const mostSevere = active.sort(
    (a, b) => severityLevel(b.severity) - severityLevel(a.severity)
  )[0];

  return `[⚠️ EARLY WARNING ACTIVE]
Type: ${formatWarningType(mostSevere.type)}
Severity: ${mostSevere.severity.toUpperCase()}

Guidance for you:
${mostSevere.recommendations.forFerni.map((r) => `- ${r}`).join('\n')}

${mostSevere.recommendations.suggestProfessional ? '⚡ Consider gently suggesting professional support' : ''}`;
}

/**
 * Record feedback on warning accuracy.
 */
export function recordWarningFeedback(
  userId: string,
  warningId: string,
  wasAccurate: boolean
): void {
  const history = warningHistories.get(userId);
  if (!history) return;

  const warning = history.warnings.find((w) => w.id === warningId);
  if (warning) {
    warning.wasAccurate = wasAccurate;

    // Recalculate accuracy score
    const feedbackWarnings = history.warnings.filter((w) => w.wasAccurate !== undefined);
    if (feedbackWarnings.length > 0) {
      const accurate = feedbackWarnings.filter((w) => w.wasAccurate).length;
      history.accuracyScore = accurate / feedbackWarnings.length;
    }
  }
}

/**
 * Get crisis resources.
 */
export function getCrisisResources(): {
  hotlines: Array<{ name: string; number: string; country: string }>;
  text: Array<{ name: string; number: string; country: string }>;
  online: Array<{ name: string; url: string }>;
} {
  return {
    hotlines: [
      { name: 'National Suicide Prevention Lifeline', number: '988', country: 'US' },
      { name: 'Crisis Text Line', number: 'Text HOME to 741741', country: 'US' },
      { name: 'Samaritans', number: '116 123', country: 'UK' },
      { name: 'Lifeline', number: '13 11 14', country: 'Australia' },
    ],
    text: [
      { name: 'Crisis Text Line', number: 'HOME to 741741', country: 'US' },
      { name: 'Shout', number: 'SHOUT to 85258', country: 'UK' },
    ],
    online: [
      {
        name: 'International Association for Suicide Prevention',
        url: 'https://www.iasp.info/resources/Crisis_Centres/',
      },
      { name: 'FindAHelpline', url: 'https://findahelpline.com/' },
    ],
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getOrCreateHistory(userId: string): WarningHistory {
  if (!warningHistories.has(userId)) {
    warningHistories.set(userId, {
      userId,
      warnings: [],
      lastChecked: new Date(),
      accuracyScore: 1.0, // Assume accurate until proven otherwise
    });
  }
  return warningHistories.get(userId)!;
}

function severityLevel(severity: WarningSeverity): number {
  const levels: Record<WarningSeverity, number> = { watch: 1, concern: 2, urgent: 3 };
  return levels[severity];
}

function selectRecommendations(all: string[], severity: WarningSeverity): string[] {
  // Return more recommendations for more severe warnings
  const count = severity === 'urgent' ? 4 : severity === 'concern' ? 3 : 2;
  return all.slice(0, count);
}

function formatWarningType(type: WarningType): string {
  const names: Record<WarningType, string> = {
    depression_risk: 'Depression Risk',
    anxiety_spike: 'Anxiety Spike',
    burnout_trajectory: 'Burnout Trajectory',
    isolation_pattern: 'Isolation Pattern',
    sleep_deterioration: 'Sleep Deterioration',
    motivation_collapse: 'Motivation Collapse',
    hopelessness_pattern: 'Hopelessness Pattern',
    crisis_risk: 'Crisis Risk',
  };
  return names[type] || type;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const earlyWarning = {
  check: checkWarnings,
  getActive: getActiveWarnings,
  getContextInjection: getWarningContextInjection,
  recordFeedback: recordWarningFeedback,
  getCrisisResources,
};

export default earlyWarning;
