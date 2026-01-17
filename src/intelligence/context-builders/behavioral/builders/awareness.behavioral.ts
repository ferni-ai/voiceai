/**
 * Awareness Behavioral Builder
 *
 * Converts temporal and contextual awareness into behavioral signals.
 * The actual facts (time, user name) go in the awareness system.
 * This builder handles the BEHAVIORAL implications of those facts.
 *
 * Example:
 * - Fact: "Time: 2:30 AM" (in awareness)
 * - Behavior: { tone: 'gentle', pace: 'slow' } (from this builder)
 *
 * @module intelligence/context-builders/behavioral/builders/awareness
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// ============================================================================
// TIME-OF-DAY BEHAVIOR
// ============================================================================

/**
 * Get behavioral signals based on time of day
 */
function getTimeOfDayBehavior(hour: number): Partial<BehavioralSignals> {
  // Late night (12am-5am): They're up late, be gentle
  if (hour >= 0 && hour < 5) {
    return {
      tone: 'gentle',
      pace: 'slow',
      energy: 'subdued',
      style: 'supportive',
    };
  }

  // Early morning (5am-9am): Calm, settling in
  if (hour >= 5 && hour < 9) {
    return {
      tone: 'warm',
      pace: 'normal',
      energy: 'calm',
    };
  }

  // Morning (9am-12pm): Active, productive
  if (hour >= 9 && hour < 12) {
    return {
      energy: 'warm',
      pace: 'normal',
    };
  }

  // Afternoon (12pm-5pm): Full energy
  if (hour >= 12 && hour < 17) {
    return {
      energy: 'warm',
      pace: 'normal',
    };
  }

  // Evening (5pm-9pm): Winding down
  if (hour >= 17 && hour < 21) {
    return {
      tone: 'warm',
      energy: 'calm',
    };
  }

  // Night (9pm-12am): Getting late
  return {
    tone: 'gentle',
    pace: 'slow',
    energy: 'subdued',
  };
}

// ============================================================================
// SESSION STAGE BEHAVIOR
// ============================================================================

/**
 * Get behavioral signals based on session stage
 */
function getSessionStageBehavior(turnCount: number): Partial<BehavioralSignals> {
  // First few turns: Warm up, establish rapport
  if (turnCount <= 3) {
    return {
      tone: 'warm',
      style: 'exploratory',
      questionStyle: 'open',
    };
  }

  // Mid conversation: Flowing
  if (turnCount <= 10) {
    return {
      style: 'collaborative',
    };
  }

  // Longer conversation: May need variety or winding down
  if (turnCount > 20) {
    return {
      length: 'moderate', // Don't overload in long conversations
    };
  }

  return {};
}

// ============================================================================
// RETURNING USER BEHAVIOR
// ============================================================================

/**
 * Get behavioral signals for returning users
 */
function getReturningUserBehavior(
  daysSinceLastChat: number | undefined
): Partial<BehavioralSignals> {
  if (!daysSinceLastChat) return {};

  // Just yesterday: Casual continuation
  if (daysSinceLastChat === 1) {
    return {
      tone: 'warm',
    };
  }

  // A few days: Warm reconnection
  if (daysSinceLastChat <= 7) {
    return {
      tone: 'warm',
    };
  }

  // A while: Acknowledge the gap warmly
  if (daysSinceLastChat > 30) {
    return {
      tone: 'warm',
      style: 'supportive',
    };
  }

  return {};
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

async function buildAwarenessBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userData, userProfile } = input;

  const signals: BehavioralSignals = {
    source: 'awareness',
    confidence: 0.5, // Lower confidence - contextual, not user-driven
    priority: 20, // Low priority - can be overridden
  };

  // Time of day behavior
  const hour = new Date().getHours();
  const timeSignals = getTimeOfDayBehavior(hour);
  Object.assign(signals, timeSignals);

  // Session stage behavior
  const turnCount = userData?.turnCount || 0;
  const sessionSignals = getSessionStageBehavior(turnCount);
  Object.assign(signals, sessionSignals);

  // Returning user behavior
  if (userProfile?.lastContact) {
    const daysSince = Math.floor(
      (Date.now() - new Date(userProfile.lastContact).getTime()) / (1000 * 60 * 60 * 24)
    );
    const returningSignals = getReturningUserBehavior(daysSince);
    Object.assign(signals, returningSignals);
  }

  // Weekend behavior (slightly more relaxed)
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
  if (isWeekend) {
    signals.pace = signals.pace || 'normal';
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'awareness',
  description: 'Contextual awareness (time, session) to behavioral guidance',
  priority: 10, // Low priority - sets baseline that others override
  category: 'context',
  build: buildAwarenessBehavior,
});

export { buildAwarenessBehavior };
