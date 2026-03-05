/**
 * Humanization Bridge - Better Than Human Signal Handlers
 *
 * Handles signals from the backend superhuman capabilities and
 * translates them to frontend EQ responses.
 *
 * These respond to signals from the backend emotion dispatcher:
 * - concern_detected: User is distressed → protective mode
 * - voice_state_detected: Voice-text mismatch → extra care
 * - emotional_trajectory: Mood is changing → adapt presence
 * - high_engagement: User is excited → match energy
 * - disengagement: User is drifting → gentle reconnection
 * - vulnerability: User shared something hard → holding space
 * - breakthrough: User had realization → celebrate subtly
 *
 * @module @ferni/eq/bridge/humanization-bridge
 */

import { EASING } from '../../config/animation-constants.js';
import { emotionState } from '../../emotion/emotion-state.js';
import type { EmotionalExpression } from '../../ui/ferni-expressions.ui.js';
import { ferniExpressions } from '../../ui/ferni-expressions.ui.js';
import { createLogger } from '../../utils/logger.js';
import type { BetterThanHumanSignal } from '../types.js';
import { getAvatarSoul } from '../utils/avatar-soul-loader.js';
import { playMicroExpression, setBreathSyncEnabled, setBreathSyncStrength } from '../capabilities/index.js';

const log = createLogger('HumanizationBridge');

// ============================================================================
// BTH UI HINT EMITTER
// Emits subtle UI hints when BTH signals are received, allowing UI components
// to display what Ferni noticed without being intrusive
// ============================================================================

type BthHintType =
  | 'delight'
  | 'inside_joke'
  | 'observation'
  | 'vulnerability'
  | 'memory'
  | 'relationship'
  | 'somatic'
  | 'anticipatory';

interface BthHintDetail {
  type: BthHintType;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Emit a BTH UI hint for frontend components to display
 * These are subtle, non-intrusive hints that show what Ferni noticed
 */
function emitBthUIHint(
  type: BthHintType,
  content: string,
  metadata?: Record<string, unknown>
): void {
  const detail: BthHintDetail = {
    type,
    content,
    metadata,
    timestamp: Date.now(),
  };

  // Emit custom event for UI components to catch
  const event = new CustomEvent('ferni:bth-hint', { detail });
  document.dispatchEvent(event);

  log.debug('BTH UI hint emitted', { type, content: content.slice(0, 50) });
}

// Export for external use
export { emitBthUIHint, type BthHintType, type BthHintDetail };

// ============================================================================
// AVATAR CONTAINER (for somatic presence)
// ============================================================================

let avatarContainer: HTMLElement | null = null;

/** Track somatic presence animations for cancel on cleanup */
const somaticAnimations: Animation[] = [];

/**
 * Set the avatar container element.
 * When set to null, cancels any active somatic animations.
 */
export function setAvatarContainer(container: HTMLElement | null): void {
  if (container === null) {
    for (const anim of somaticAnimations) {
      anim.cancel();
    }
    somaticAnimations.length = 0;
  }
  avatarContainer = container;
}

// ============================================================================
// BETTER THAN HUMAN SIGNAL HANDLERS
// ============================================================================

/**
 * Handle Better Than Human signals from backend
 */
export function handleBetterThanHumanSignal(signal: BetterThanHumanSignal): void {
  log.debug('Better Than Human signal received:', signal.signalType);

  switch (signal.signalType) {
    case 'emotional_bond_deepen':
      void handleEmotionalBondSignal(signal);
      break;
    case 'protective_instinct':
      void handleProtectiveInstinctSignal(signal);
      break;
    case 'spontaneous_delight':
      void handleSpontaneousDelightSignal(signal);
      break;
    case 'inside_joke_callback':
      void handleInsideJokeSignal(signal);
      break;
    case 'superhuman_observation':
      void handleSuperhumanObservationSignal(signal);
      break;
    case 'visible_vulnerability':
      void handleVisibleVulnerabilitySignal(signal);
      break;
    case 'temporal_insight':
      void handleTemporalInsightSignal(signal);
      break;
    case 'meta_relationship_moment':
      void handleMetaRelationshipSignal(signal);
      break;
    case 'somatic_presence':
      void handleSomaticPresenceSignal(signal);
      break;
    case 'anticipatory_presence':
      void handleAnticipatoryPresenceSignal(signal);
      break;
    case 'micro_expression':
      // Backend-driven subliminal flash (concern 60ms, delight 100ms, recognition 80ms)
      if (signal.microExpressionSubtype) {
        playMicroExpression(signal.microExpressionSubtype);
      }
      break;
  }
}

/**
 * Emotional bond deepening - warmth/trust/protectiveness
 */
async function handleEmotionalBondSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const bondLevel = signal.bondLevel || 0.7;

  if (soul) {
    soul.setGlowBleed(0.2 + bondLevel * 0.2, 'rgba(196, 162, 101, 0.5)');
    soul.setPupilDilation('CONNECTED', 'slow');
  }

  ferniExpressions.setExpression('warm', 400);
  playMicroExpression('warmth_pulse');
}

/**
 * Protective instinct - defending user from self-criticism
 */
async function handleProtectiveInstinctSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.8;

  if (soul) {
    soul.setPupilDilation('CONNECTED', 'fast');
    if (intensity > 0.8) {
      soul.enterProtectiveMode();
    }
  }

  ferniExpressions.setExpression('attentive', 300);
  playMicroExpression('protective');
}

/**
 * Spontaneous delight - appreciation/gratitude/joy
 */
async function handleSpontaneousDelightSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.8;

  if (soul) {
    soul.flashShimmer(intensity);
    soul.setPupilDilation('DILATED', 'fast');
    soul.setGlowBleed(0.25 + intensity * 0.15, 'rgba(196, 162, 101, 0.6)');
  }

  ferniExpressions.setExpression('pleased', 400);
  playMicroExpression('delight_flash');

  // Show subtle UI indicator for user's achievement
  if (signal.trigger) {
    emitBthUIHint('delight', signal.trigger);
  }
}

/**
 * Inside joke callback - shared humor reference
 * Backend sends memoryReference with the joke/humor context
 */
async function handleInsideJokeSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.75;

  if (soul) {
    soul.flashShimmer(intensity);
    soul.setPupilDilation('INTERESTED', 'fast');
  }

  ferniExpressions.setExpression('warm', 300);
  playMicroExpression('insider');

  // Show the shared humor reference to reinforce the connection
  if (signal.memoryReference) {
    emitBthUIHint('inside_joke', signal.memoryReference);
  }
}

/**
 * Superhuman observation - pattern surfacing
 * Backend sends observationType and observationContent
 */
async function handleSuperhumanObservationSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.75;

  if (soul) {
    soul.setPupilDilation('CONTRACTED', 'slow');
    // Brief glance away as if "recalling" the pattern
    soul.glanceAway(300);
  }

  ferniExpressions.setExpression('noticing', 400);
  playMicroExpression('noticing');

  // Surface the observation insight to the user
  if (signal.observationContent) {
    emitBthUIHint('observation', signal.observationContent, {
      type: signal.observationType,
      intensity,
    });
  }
}

/**
 * Visible vulnerability - Ferni showing appropriate uncertainty
 * Backend sends vulnerabilityType: 'uncertainty' | 'admission' | 'reflection' | 'growth'
 * This humanizes Ferni by not being artificially confident
 */
async function handleVisibleVulnerabilitySignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const vulnerabilityType = signal.vulnerabilityType || 'uncertainty';
  const intensity = signal.intensity || 0.6;

  // Different expressions based on vulnerability type
  const expressionMap: Record<string, { expression: string; glow: string }> = {
    uncertainty: { expression: 'contemplative', glow: 'rgba(154, 123, 90, 0.4)' },
    admission: { expression: 'thoughtful', glow: 'rgba(154, 123, 90, 0.35)' },
    reflection: { expression: 'reflective', glow: 'rgba(170, 140, 100, 0.4)' },
    growth: { expression: 'warm', glow: 'rgba(180, 150, 100, 0.45)' },
  };

  const config = expressionMap[vulnerabilityType] || expressionMap.uncertainty;

  if (soul) {
    soul.setPupilDilation('NEUTRAL', 'slow');
    soul.setGlowBleed(0.12 + intensity * 0.08, config?.glow ?? 'rgba(154, 123, 90, 0.4)');
  }

  ferniExpressions.setExpression((config?.expression ?? 'contemplative') as Parameters<typeof ferniExpressions.setExpression>[0], 500);

  // Emit hint to show Ferni's authentic uncertainty
  emitBthUIHint('vulnerability', vulnerabilityType, { intensity });
}

/**
 * Temporal insight - cross-session memory reference
 * Backend sends memoryReference with what Ferni remembers
 * e.g., "Last month you mentioned feeling stuck at work"
 */
async function handleTemporalInsightSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.8;

  if (soul) {
    soul.triggerMemorySpark();
    soul.setPupilDilation('CONNECTED', 'slow');
    soul.setGlowBleed(0.2, 'rgba(196, 162, 101, 0.4)');
  }

  ferniExpressions.setExpression('remembering', 400);
  playMicroExpression('memory_spark');

  // Show the memory reference so user sees what Ferni remembers
  if (signal.memoryReference) {
    emitBthUIHint('memory', signal.memoryReference, {
      timeSpan: signal.timeSpan,
      intensity,
    });
  }
}

/**
 * Meta-relationship moment - user reflects on their relationship with Ferni
 * Backend sends relationshipContext describing the relationship aspect
 * e.g., "growth", "trust", "appreciation"
 */
async function handleMetaRelationshipSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.85;
  const context = signal.relationshipContext || 'connection';

  if (soul) {
    soul.setPupilDilation('CONNECTED', 'slow');
    soul.setGlowBleed(0.25 + intensity * 0.1, 'rgba(196, 162, 101, 0.5)');
    soul.startComfortPulse();
  }

  ferniExpressions.setExpression('warm', 500);
  playMicroExpression('warmth_pulse');

  // Show that Ferni values this relationship moment
  emitBthUIHint('relationship', context, { intensity });
}

/**
 * Somatic presence - physical grounding cues for embodied support
 * Backend sends somaticType: 'breathing' | 'settling' | 'grounding' | 'pause'
 * Offers physical presence during distress or late-night sessions
 */
async function handleSomaticPresenceSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const somaticType = signal.somaticType || 'breathing';
  const intensity = signal.intensity || 0.6;

  // Handle each somatic type with appropriate physical cues
  switch (somaticType) {
    case 'breathing':
      // Slow, deep breathing animation - "let's take a breath together"
      if (avatarContainer) {
        avatarContainer.animate(
          [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(1px) scale(1.01)' },
            { transform: 'translateY(0) scale(1)' },
          ],
          {
            duration: 3000, // Slow breath cycle
            easing: EASING.GENTLE,
            iterations: 2,
          }
        );
      }
      if (soul) {
        soul.setPupilDilation('NEUTRAL', 'slow');
        setBreathSyncStrength(0.9);
        setBreathSyncEnabled(true);
      }
      ferniExpressions.setExpression('present', 600);
      break;

    case 'settling':
      // Settling into presence - gentle downward motion
      if (avatarContainer) {
        const anim = avatarContainer.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(2px)' },
            { transform: 'translateY(1px)' },
          ],
          {
            duration: 800,
            easing: EASING.GENTLE,
          }
        );
        somaticAnimations.push(anim);
        anim.onfinish = () => {
          const i = somaticAnimations.indexOf(anim);
          if (i >= 0) somaticAnimations.splice(i, 1);
        };
      }
      if (soul) {
        soul.setGlowBleed(0.15, 'rgba(154, 123, 90, 0.4)');
      }
      ferniExpressions.setExpression('attentive', 500);
      break;

    case 'grounding':
      // Deep grounding - stable, weighted presence
      if (avatarContainer) {
        const anim = avatarContainer.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(3px)' },
            { transform: 'translateY(2px)' },
          ],
          {
            duration: 1200,
            easing: EASING.GENTLE,
          }
        );
        somaticAnimations.push(anim);
        anim.onfinish = () => {
          const i = somaticAnimations.indexOf(anim);
          if (i >= 0) somaticAnimations.splice(i, 1);
        };
      }
      if (soul) {
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.setGlowBleed(0.2, 'rgba(120, 100, 80, 0.5)');
      }
      ferniExpressions.setExpression('present', 700);
      playMicroExpression('steady_presence');
      break;

    case 'pause':
      // Intentional pause - stillness with presence
      if (soul) {
        soul.setPupilDilation('NEUTRAL', 'slow');
        soul.setGlowBleed(0.1, 'rgba(154, 123, 90, 0.3)');
      }
      ferniExpressions.setExpression('contemplative', 800);
      break;
  }

  // Emit hint to show somatic support
  emitBthUIHint('somatic', somaticType, { intensity });
}

/**
 * Anticipatory presence - time-aware care
 * Backend sends timeContext: 'late_night' | 'early_morning' | 'weekend' | 'monday' | 'evening'
 * Shows Ferni is aware of WHEN user is reaching out, not just WHAT they say
 */
async function handleAnticipatoryPresenceSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const timeContext = signal.timeContext || 'evening';
  const intensity = signal.intensity || 0.7;

  // Adjust presence based on time context
  const timeConfig: Record<string, { expression: string; glow: string; microExpression: string }> = {
    late_night: {
      expression: 'gentle',
      glow: 'rgba(140, 120, 90, 0.4)', // Softer, warmer for late night
      microExpression: 'steady_presence',
    },
    early_morning: {
      expression: 'warm',
      glow: 'rgba(180, 150, 100, 0.45)', // Gentle awakening warmth
      microExpression: 'recognition',
    },
    weekend: {
      expression: 'relaxed',
      glow: 'rgba(196, 162, 101, 0.4)',
      microExpression: 'warmth_pulse',
    },
    monday: {
      expression: 'supportive',
      glow: 'rgba(160, 140, 100, 0.45)',
      microExpression: 'courage_support',
    },
    evening: {
      expression: 'present',
      glow: 'rgba(196, 162, 101, 0.45)',
      microExpression: 'recognition',
    },
  };

  const config = timeConfig[timeContext] || timeConfig.evening;

  if (soul) {
    soul.setPupilDilation('INTERESTED', 'slow');
    soul.setGlowBleed(0.2 + intensity * 0.1, config?.glow ?? 'rgba(196, 162, 101, 0.45)');
  }

  ferniExpressions.setExpression((config?.expression ?? 'present') as Parameters<typeof ferniExpressions.setExpression>[0], 400);
  playMicroExpression((config?.microExpression ?? 'recognition') as Parameters<typeof playMicroExpression>[0]);

  // Emit hint showing time awareness
  emitBthUIHint('anticipatory', timeContext, { intensity });
}

// ============================================================================
// BEHAVIOR SYSTEM SIGNAL HANDLERS
// Bidirectional behavior system - Code triggers speech, speech triggers code
// ============================================================================

/**
 * Handle behavior mode shift
 */
export function handleBehaviorModeShift(mode: string, reason?: string): void {
  log.debug('Behavior mode shift:', { mode, reason });

  const modeExpressionMap: Record<string, EmotionalExpression> = {
    presence: 'attentive',
    deep_listening: 'attentive',
    processing: 'thinking',
    celebration: 'excited',
    holding_space: 'empathetic',
    energy_match: 'neutral',
    grounding: 'present',
  };

  const expression = modeExpressionMap[mode];
  if (expression) {
    ferniExpressions.setExpression(expression);
  }

  if (mode === 'presence' || mode === 'holding_space' || mode === 'deep_listening') {
    setBreathSyncStrength(0.8);
    setBreathSyncEnabled(true);
  } else if (mode === 'celebration') {
    setBreathSyncStrength(0.3);
  }
}

/**
 * Handle behavior expression (non-verbal presence)
 */
export function handleBehaviorExpression(expression: string): void {
  log.debug('Behavior expression:', { expression });

  const expressionMap: Record<string, EmotionalExpression> = {
    breath: 'present',
    hum: 'pleased',
    nod: 'attentive',
    sigh: 'empathetic',
    soft_sound: 'attentive',
    yield: 'neutral',
  };

  const avatarExpression = expressionMap[expression];
  if (avatarExpression) {
    ferniExpressions.setExpression(avatarExpression);
  }
}

/**
 * Handle hold space (intentional silence)
 */
export function handleBehaviorHoldSpace(duration: number, reason?: string): void {
  log.debug('Behavior hold space:', { duration, reason });

  ferniExpressions.setExpression('empathetic');
  setBreathSyncStrength(0.9);

  setTimeout(() => {
    ferniExpressions.setExpression('neutral');
    setBreathSyncStrength(0.5);
  }, duration);
}

/**
 * Handle processing state (visible thinking)
 */
export function handleBehaviorProcessing(started: boolean, _expression?: string): void {
  log.debug('Behavior processing:', { started });

  if (started) {
    ferniExpressions.setExpression('thinking');
  } else {
    ferniExpressions.setExpression('neutral');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize Better Than Human signal handlers
 */
export function initBetterThanHumanSignalHandlers(): void {
  if (initialized) return;

  // Listen for humanization signals from backend
  document.addEventListener('humanization_signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  // Also listen via custom event channel (for WebSocket messages)
  document.addEventListener('ferni:humanization-signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  // Listen for BTH signals delegated from humanization-bridge.service.ts
  // (10 superhuman signal types: emotional_bond_deepen, protective_instinct, etc.)
  document.addEventListener('ferni:bth-signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  log.info('Better Than Human signal handlers initialized');
  initialized = true;
}

/**
 * Initialize behavior signal handlers from the bidirectional behavior system
 */
export function initBehaviorSignalHandlers(): void {
  // Mode shift - Ferni changed presence mode
  window.addEventListener('ferni:eq-mode-shift', ((event: CustomEvent) => {
    const { mode, reason } = event.detail;
    handleBehaviorModeShift(mode, reason);
  }) as EventListener);

  // Expression - Non-verbal presence triggered
  window.addEventListener('ferni:eq-expression', ((event: CustomEvent) => {
    const { expression } = event.detail;
    handleBehaviorExpression(expression);
  }) as EventListener);

  // Hold space - Intentional meaningful silence
  window.addEventListener('ferni:eq-hold-space', ((event: CustomEvent) => {
    const { duration, reason } = event.detail;
    handleBehaviorHoldSpace(duration, reason);
  }) as EventListener);

  // Processing state change
  window.addEventListener('ferni:eq-processing', ((event: CustomEvent) => {
    const { started, expression } = event.detail;
    handleBehaviorProcessing(started, expression);
  }) as EventListener);

  log.info('Behavior signal handlers initialized');
}

/**
 * Dispose handlers (cleanup)
 */
export function disposeSignalHandlers(): void {
  initialized = false;
  avatarContainer = null;
}
