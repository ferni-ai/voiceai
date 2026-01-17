/**
 * Concern Detection - Recognizing Distress
 *
 * Ferni detects distress signals from voice and content patterns,
 * responding with appropriate care before users ask.
 *
 * BETTER THAN HUMAN: Most people don't notice when friends are struggling.
 * Ferni catches subtle signals humans miss, showing care without being intrusive.
 *
 * @module @ferni/eq/capabilities/concern-detection
 */

import { emotionState } from '../../emotion/emotion-state.js';
import { ferniExpressions } from '../../ui/ferni-expressions.ui.js';
import { createLogger } from '../../utils/logger.js';
import type { ConcernAnalysisInput, ConcernLevel, ConcernState } from '../types.js';
import { getAvatarSoul } from '../utils/avatar-soul-loader.js';
import { playMicroExpression } from './micro-expressions.js';

const log = createLogger('ConcernDetection');

// ============================================================================
// TRIGGER WEIGHTS
// ============================================================================

const CONCERN_TRIGGERS = {
  // Voice patterns
  voice_strain: 0.3,
  long_pauses: 0.2,
  sighing: 0.25,
  breaking_voice: 0.5,

  // Content patterns
  negative_self_talk: 0.4,
  hopelessness_words: 0.5,
  isolation_mentions: 0.3,
  overwhelm_language: 0.35,
};

// ============================================================================
// KEYWORD PATTERNS
// ============================================================================

const CONCERN_KEYWORDS = {
  negative_self_talk: [
    /i('m| am) (so )?(stupid|dumb|idiot|worthless)/i,
    /i (can't|cannot) do (anything|this)/i,
    /what('s| is) wrong with me/i,
    /i('m| am) (such )?a (failure|mess|disaster)/i,
  ],
  hopelessness_words: [
    /nothing (ever )?(works|helps|matters)/i,
    /what('s| is) the point/i,
    /i give up/i,
    /it('s| is) hopeless/i,
    /why (even )?bother/i,
  ],
  isolation_mentions: [
    /no one (understands|cares|listens)/i,
    /i('m| am) (so )?(alone|lonely)/i,
    /nobody (gets|understands) (it|me)/i,
  ],
  overwhelm_language: [
    /i can('t|not) (handle|take|deal with) (this|it)/i,
    /too much/i,
    /i('m| am) (so )?(overwhelmed|stressed|burnt out)/i,
    /everything is (falling apart|too much)/i,
  ],
};

// ============================================================================
// STATE
// ============================================================================

const concernState: ConcernState = {
  level: 'none',
  duration: 0,
  triggers: [],
  lastCheckTime: 0,
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Analyze content for concern triggers.
 */
export function analyzeConcern(content: ConcernAnalysisInput): ConcernLevel {
  let concernScore = 0;
  const triggers: string[] = [];

  // Voice-based triggers
  if (content.voiceStrain && content.voiceStrain > 0.5) {
    concernScore += CONCERN_TRIGGERS.voice_strain * content.voiceStrain;
    triggers.push('voice_strain');
  }

  if (content.pauseFrequency && content.pauseFrequency > 0.3) {
    concernScore += CONCERN_TRIGGERS.long_pauses;
    triggers.push('long_pauses');
  }

  if (content.sighing) {
    concernScore += CONCERN_TRIGGERS.sighing;
    triggers.push('sighing');
  }

  if (content.voiceBreaking) {
    concernScore += CONCERN_TRIGGERS.breaking_voice;
    triggers.push('breaking_voice');
  }

  // Content-based triggers
  if (content.transcript) {
    for (const [category, patterns] of Object.entries(CONCERN_KEYWORDS)) {
      for (const pattern of patterns) {
        if (pattern.test(content.transcript)) {
          concernScore += CONCERN_TRIGGERS[category as keyof typeof CONCERN_TRIGGERS] || 0.3;
          triggers.push(category);
          break; // Only count each category once
        }
      }
    }
  }

  // Determine level
  let level: ConcernLevel = 'none';
  if (concernScore > 0.8) {
    level = 'significant';
  } else if (concernScore > 0.5) {
    level = 'moderate';
  } else if (concernScore > 0.2) {
    level = 'mild';
  }

  // Update state
  concernState.level = level;
  concernState.triggers = triggers;
  concernState.lastCheckTime = Date.now();

  // If level increased, trigger response
  if (level !== 'none') {
    respondToConcern(level, triggers);

    // Telemetry: Track concern detection
    document.dispatchEvent(
      new CustomEvent('ferni:telemetry', {
        detail: { type: 'concern_detected', level, triggers, score: concernScore },
      })
    );
  }

  return level;
}

// ============================================================================
// RESPONSE
// ============================================================================

/**
 * Respond to detected concern with appropriate expression.
 * Now integrated with Avatar Soul for visual comfort cues.
 */
async function respondToConcern(level: ConcernLevel, triggers: string[]): Promise<void> {
  log.debug('Concern detected:', level, triggers);

  // Avatar Soul integration for visual comfort
  const soul = await getAvatarSoul();

  switch (level) {
    case 'mild':
      // Subtle visual comfort - warmer glow, slightly larger pupils
      if (soul) {
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.setGlowBleed(0.25, 'rgba(154, 123, 90, 0.4)');
      }
      // Subtle: slower breathing, softer glow, slight lean-in
      ferniExpressions.setExpression('attentive', 400);
      emotionState.setEmotion('holdingSpace');
      break;

    case 'moderate':
      // More visible comfort - start comfort pulse
      if (soul) {
        soul.setPupilDilation('CONNECTED', 'slow');
        soul.startComfortPulse();
        // Dispatch concern detected event for other systems
        document.dispatchEvent(
          new CustomEvent('ferni:concern-detected', {
            detail: { level, triggers },
          })
        );
      }
      // Visible: warm expression, gentle acknowledgment
      ferniExpressions.setExpression('empathetic', 600, 3000);
      emotionState.setEmotion('holding');
      break;

    case 'significant':
      // Full protective mode - avatar draws closer
      if (soul) {
        soul.enterProtectiveMode();
      }
      // Active: direct acknowledgment, offer support
      ferniExpressions.empathy();
      emotionState.setEmotion('accompanying');
      // Trigger gentle check-in
      document.dispatchEvent(
        new CustomEvent('ferni:gentle-checkin', {
          detail: { triggers, level },
        })
      );
      break;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current concern state.
 */
export function getConcernState(): Readonly<ConcernState> {
  return { ...concernState };
}

/**
 * Get concern level
 */
export function getConcernLevel(): ConcernLevel {
  return concernState.level;
}

/**
 * Get concern triggers
 */
export function getConcernTriggers(): readonly string[] {
  return [...concernState.triggers];
}

/**
 * Reset concern state
 */
export function resetConcernState(): void {
  concernState.level = 'none';
  concernState.triggers = [];
  concernState.duration = 0;
}

/**
 * Get available trigger categories
 */
export function getTriggerCategories(): readonly string[] {
  return Object.keys(CONCERN_TRIGGERS);
}
