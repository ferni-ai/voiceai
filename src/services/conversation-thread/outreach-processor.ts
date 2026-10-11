/**
 * Superhuman Outreach Intelligence - Signal Processor
 *
 * Core processing logic: timing intelligence, signal processing,
 * action execution, signal accumulation, and integration helpers.
 *
 * @module services/conversation-thread/outreach-processor
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SuperhumanSignal, OutreachAction } from './outreach-signal-types.js';
import { OUTREACH_RULES } from './outreach-rules.js';
import {
  teamCelebrationOutreach,
  fullTeamSupportOutreach,
  mayaJordanPlanningOutreach,
  peterFerniInsightOutreach,
  initiateTeamRoundtableCall,
  type GroupOutreachResult,
} from './group-outreach.js';
import { ferniCheckInOutreach, mayaHabitOutreach } from './outbound-initiator.js';

const log = createLogger({ module: 'SuperhumanOutreachIntelligence' });

// ============================================================================
// TIMING INTELLIGENCE
// ============================================================================

/** Default quiet hours: 10pm - 8am */
const DEFAULT_QUIET_HOURS_START = 22;
const DEFAULT_QUIET_HOURS_END = 8;

/** Minimum hours between non-urgent outreach */
const MIN_HOURS_BETWEEN_OUTREACH = 4;

function checkTimingIntelligence(context: {
  lastOutreachAt?: Date;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}): { canOutreach: boolean; reason?: string } {
  const now = new Date();
  const currentHour = now.getHours();

  const quietStart = context.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
  const quietEnd = context.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;

  const isQuietHours =
    quietStart > quietEnd
      ? currentHour >= quietStart || currentHour < quietEnd
      : currentHour >= quietStart && currentHour < quietEnd;

  if (isQuietHours) {
    return {
      canOutreach: false,
      reason: `Quiet hours (${quietStart}:00 - ${quietEnd}:00)`,
    };
  }

  if (context.lastOutreachAt) {
    const hoursSinceLastOutreach =
      (now.getTime() - context.lastOutreachAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastOutreach < MIN_HOURS_BETWEEN_OUTREACH) {
      return {
        canOutreach: false,
        reason: `Recent outreach (${hoursSinceLastOutreach.toFixed(1)}h ago, min ${MIN_HOURS_BETWEEN_OUTREACH}h)`,
      };
    }
  }

  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend && (currentHour < 10 || currentHour > 20)) {
    return {
      canOutreach: false,
      reason: 'Weekend quiet time',
    };
  }

  return { canOutreach: true };
}

export function getOptimalOutreachTime(context: {
  quietHoursStart?: number;
  quietHoursEnd?: number;
  timezone?: string;
}): Date {
  const now = new Date();
  const currentHour = now.getHours();
  const quietEnd = context.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;

  const quietStart = context.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
  const isQuietHours =
    quietStart > quietEnd
      ? currentHour >= quietStart || currentHour < quietEnd
      : currentHour >= quietStart && currentHour < quietEnd;

  if (isQuietHours) {
    const optimalTime = new Date(now);
    if (currentHour >= quietStart) {
      optimalTime.setDate(optimalTime.getDate() + 1);
    }
    optimalTime.setHours(quietEnd + 1, 0, 0, 0);
    return optimalTime;
  }

  return now;
}

// ============================================================================
// SIGNAL PROCESSING
// ============================================================================

export async function processSuperhumanSignals(
  userId: string,
  signals: SuperhumanSignal[],
  userContext: {
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastOutreachAt?: Date;
    preferredName?: string;
    quietHoursStart?: number;
    quietHoursEnd?: number;
  }
): Promise<GroupOutreachResult | null> {
  if (signals.length === 0) return null;

  log.debug(
    { userId, signalCount: signals.length, signalTypes: signals.map((s) => s.type) },
    '🧠 Processing superhuman signals'
  );

  // TIMING INTELLIGENCE
  const hasUrgentSignal = signals.some((s) => s.severity === 'urgent');
  const hasCrisis = signals.some((s) => s.type === 'crisis_detected');

  if (!hasUrgentSignal && !hasCrisis) {
    const timing = checkTimingIntelligence(userContext);
    if (!timing.canOutreach) {
      log.debug({ userId, reason: timing.reason }, '⏰ Outreach deferred due to timing');
      return null;
    }
  }

  // GATING INTELLIGENCE
  const hasGatingSignal = signals.some((s) =>
    [
      'receptivity_low',
      'energy_wave_avoid',
      'silence_processing',
      'social_battery_depleted',
    ].includes(s.type)
  );

  const hasHighReceptivity = signals.some((s) => s.type === 'receptivity_high');
  const hasOptimalEnergy = signals.some((s) => s.type === 'energy_wave_optimal');

  if (hasGatingSignal && !hasUrgentSignal && !hasCrisis) {
    if (!hasHighReceptivity && !hasOptimalEnergy) {
      log.debug(
        {
          userId,
          gatingSignals: signals
            .filter((s) =>
              ['receptivity_low', 'energy_wave_avoid', 'silence_processing'].includes(s.type)
            )
            .map((s) => s.type),
        },
        '🚫 Outreach blocked by gating signals'
      );
      return null;
    }
  }

  // Find matching rules
  const matchingRules = OUTREACH_RULES.filter((rule) => {
    const signalTypesPresent = signals.map((s) => s.type);
    const triggersMet =
      rule.triggers.operator === 'AND'
        ? rule.triggers.signalTypes.every((t) => signalTypesPresent.includes(t))
        : rule.triggers.signalTypes.some((t) => signalTypesPresent.includes(t));

    if (!triggersMet) return false;

    if (rule.triggers.minSeverity) {
      const severityOrder = { low: 1, medium: 2, high: 3, urgent: 4 };
      const minLevel = severityOrder[rule.triggers.minSeverity];
      const hasMinSeverity = signals.some((s) => severityOrder[s.severity] >= minLevel);
      if (!hasMinSeverity) return false;
    }

    if (rule.conditions) {
      if (
        rule.conditions.relationshipStage &&
        !rule.conditions.relationshipStage.includes(
          userContext.relationshipStage as 'established' | 'deep'
        )
      ) {
        return false;
      }

      if (rule.conditions.recentOutreach && userContext.lastOutreachAt) {
        const hoursSinceOutreach =
          (Date.now() - userContext.lastOutreachAt.getTime()) / (1000 * 60 * 60);
        if (rule.conditions.recentOutreach === 'none_in_24h' && hoursSinceOutreach < 24) {
          return false;
        }
        if (rule.conditions.recentOutreach === 'none_in_week' && hoursSinceOutreach < 168) {
          return false;
        }
      }

      if (rule.conditions.timeOfDay === 'business_hours') {
        const hour = new Date().getHours();
        if (hour < 9 || hour > 18) return false;
      }
    }

    return true;
  });

  if (matchingRules.length === 0) {
    log.debug({ userId }, 'No matching outreach rules');
    return null;
  }

  matchingRules.sort((a, b) => b.priority - a.priority);
  const selectedRule = matchingRules[0];

  log.info(
    {
      userId,
      ruleName: selectedRule.name,
      priority: selectedRule.priority,
      triggerSignals: signals.map((s) => s.type),
    },
    '🎯 Selected outreach rule'
  );

  return await executeOutreachAction(userId, selectedRule.action, userContext);
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

async function executeOutreachAction(
  userId: string,
  action: OutreachAction,
  context: { preferredName?: string }
): Promise<GroupOutreachResult | null> {
  try {
    switch (action.type) {
      case 'full_team_support':
        return await fullTeamSupportOutreach(userId, {
          situation: action.situation,
          preferredName: context.preferredName,
        });

      case 'team_celebration':
        return await teamCelebrationOutreach(userId, {
          achievement: action.achievement,
          preferredName: context.preferredName,
        });

      case 'peter_ferni_insight':
        return await peterFerniInsightOutreach(userId, {
          topic: action.topic,
          insight: action.insight,
          preferredName: context.preferredName,
        });

      case 'maya_jordan_planning':
        return await mayaJordanPlanningOutreach(userId, {
          eventName: action.eventName,
          preferredName: context.preferredName,
        });

      case 'team_roundtable':
        return await initiateTeamRoundtableCall(userId, {
          personas: action.personas,
          topic: action.topic,
          reason: action.reason,
          preferredName: context.preferredName,
        });

      case 'ferni_check_in': {
        const ferniResult = await ferniCheckInOutreach(userId, {
          reason: action.reason,
        });
        return {
          success: ferniResult.success,
          outreachId: ferniResult.outreachId,
          threadId: ferniResult.threadId,
          channel: ferniResult.channel,
          message: ferniResult.message,
          personas: ['ferni'],
          error: ferniResult.error,
        };
      }

      case 'maya_habit_support': {
        const mayaResult = await mayaHabitOutreach(userId, {
          habitName: action.habitName,
          isEncouragement: action.isEncouragement,
        });
        return {
          success: mayaResult.success,
          outreachId: mayaResult.outreachId,
          threadId: mayaResult.threadId,
          channel: mayaResult.channel,
          message: mayaResult.message,
          personas: ['maya-habits'],
          error: mayaResult.error,
        };
      }

      default:
        log.warn({ action }, 'Unknown outreach action type');
        return null;
    }
  } catch (error) {
    log.error({ error: String(error), userId, action }, 'Failed to execute outreach action');
    return null;
  }
}

// ============================================================================
// SIGNAL ACCUMULATOR - Collect signals over time
// ============================================================================

const sessionSignals = new Map<string, SuperhumanSignal[]>();

export function accumulateSignal(userId: string, signal: SuperhumanSignal): void {
  const existing = sessionSignals.get(userId) || [];

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const filtered = existing.filter(
    (s) => s.timestamp.getTime() > fiveMinutesAgo || s.type !== signal.type
  );

  filtered.push(signal);

  if (filtered.length > 20) {
    filtered.shift();
  }

  sessionSignals.set(userId, filtered);

  log.debug(
    { userId, signalType: signal.type, totalSignals: filtered.length },
    '🧠 Signal accumulated'
  );
}

export function getAccumulatedSignals(userId: string, clear = false): SuperhumanSignal[] {
  const signals = sessionSignals.get(userId) || [];
  if (clear) {
    sessionSignals.delete(userId);
  }
  return signals;
}

export async function processAccumulatedSignals(
  userId: string,
  userContext: {
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastOutreachAt?: Date;
    preferredName?: string;
  }
): Promise<GroupOutreachResult | null> {
  const signals = getAccumulatedSignals(userId, true);

  if (signals.length === 0) {
    return null;
  }

  log.info(
    { userId, signalCount: signals.length },
    '🧠 Processing accumulated signals at session end'
  );

  return processSuperhumanSignals(userId, signals, userContext);
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

export async function integrateWithSemanticIntelligence(
  userId: string,
  turnData: {
    crisisDetected?: { type: string; severity: 'low' | 'moderate' | 'high' | 'severe' };
    capacityLevel?: {
      level: 'depleted' | 'low' | 'moderate' | 'good' | 'high';
      burnoutRisk: boolean;
      indicators: string[];
    };
    valuesConflict?: { statedValue: string; demonstratedValue: string; tension: string };
    openLoops?: Array<{ type: string; content: string; priority: number }>;
    temporalAnomaly?: { description: string; unusualBehavior: string };
    voiceDistress?: { hasStrain: boolean; hasTremor: boolean; arousal: number; valence: number };
    emotionalPeak?: { emotion: string; intensity: number };
  }
): Promise<void> {
  // Import signal generators lazily to avoid circular deps
  const {
    signalFromCrisis,
    signalFromCapacity,
    signalFromValuesConflict,
    signalFromOpenLoop,
    signalFromTemporalAnomaly,
    signalFromVoiceDistress,
  } = await import('./outreach-signal-generators.js');

  if (turnData.crisisDetected) {
    accumulateSignal(userId, signalFromCrisis(turnData.crisisDetected));
  }

  if (turnData.capacityLevel) {
    const signal = signalFromCapacity(turnData.capacityLevel);
    if (signal) accumulateSignal(userId, signal);
  }

  if (turnData.valuesConflict) {
    accumulateSignal(userId, signalFromValuesConflict(turnData.valuesConflict));
  }

  if (turnData.openLoops) {
    for (const loop of turnData.openLoops) {
      const signal = signalFromOpenLoop(loop);
      if (signal) accumulateSignal(userId, signal);
    }
  }

  if (turnData.temporalAnomaly) {
    accumulateSignal(userId, signalFromTemporalAnomaly(turnData.temporalAnomaly));
  }

  if (turnData.voiceDistress) {
    const signal = signalFromVoiceDistress(turnData.voiceDistress);
    if (signal) accumulateSignal(userId, signal);
  }

  if (turnData.emotionalPeak && turnData.emotionalPeak.intensity > 0.8) {
    accumulateSignal(userId, {
      type: 'emotional_peak',
      severity: turnData.emotionalPeak.intensity > 0.9 ? 'high' : 'medium',
      source: 'emotion-detection',
      data: turnData.emotionalPeak,
      timestamp: new Date(),
    });
  }
}
