/**
 * Expression System - Auto-Generated
 *
 * 🎭 AUTO-GENERATED FROM design-system/tokens/expressions.json
 * Do not edit directly - run: pnpm build:expressions
 * Generated: 2025-12-29T19:28:22.488Z
 *
 * 92 Luxo-style expressions organized into 18 families.
 * CSS transforms only - no pupils, opaque eyes with shape transforms.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * All available expression IDs (100 total)
 */
export type ExpressionId =
  | 'neutral'
  | 'listening'
  | 'speaking'
  | 'happy'
  | 'joyful'
  | 'delighted'
  | 'amused'
  | 'pleased'
  | 'content'
  | 'excited'
  | 'grateful'
  | 'proud'
  | 'warm'
  | 'caring'
  | 'loving'
  | 'tender'
  | 'supportive'
  | 'compassionate'
  | 'empathetic'
  | 'nurturing'
  | 'playful'
  | 'mischievous'
  | 'cheeky'
  | 'silly'
  | 'winking'
  | 'teasing'
  | 'surprised'
  | 'shocked'
  | 'amazed'
  | 'intrigued'
  | 'astonished'
  | 'curious'
  | 'thinking'
  | 'pondering'
  | 'contemplating'
  | 'focused'
  | 'processing'
  | 'reflecting'
  | 'analyzing'
  | 'attentive'
  | 'engaged'
  | 'interested'
  | 'absorbing'
  | 'receptive'
  | 'present'
  | 'grounded'
  | 'calm'
  | 'serene'
  | 'peaceful'
  | 'encouraging'
  | 'cheering'
  | 'guiding'
  | 'wise'
  | 'knowing'
  | 'sleepy'
  | 'drowsy'
  | 'exhausted'
  | 'yawning'
  | 'resting'
  | 'blissful'
  | 'concerned'
  | 'worried'
  | 'sympathetic'
  | 'understanding'
  | 'comforting'
  | 'sad'
  | 'crying'
  | 'melancholy'
  | 'disappointed'
  | 'dejected'
  | 'frustrated'
  | 'annoyed'
  | 'irritated'
  | 'exasperated'
  | 'eyeroll'
  | 'confused'
  | 'skeptical'
  | 'puzzled'
  | 'perplexed'
  | 'bewildered'
  | 'nervous'
  | 'anxious'
  | 'scared'
  | 'fearful'
  | 'uneasy'
  | 'embarrassed'
  | 'awkward'
  | 'cringing'
  | 'sheepish'
  | 'flustered'
  | 'confident'
  | 'smirking'
  | 'cool'
  | 'sassy'
  | 'smug'
  | 'determined'
  | 'fierce'
  | 'intense'
  | 'resolute'
  | 'passionate';

/**
 * Expression family categories
 */
export type ExpressionFamily =
  | 'core'
  | 'happy'
  | 'warmth'
  | 'playful'
  | 'surprised'
  | 'thinking'
  | 'listening'
  | 'presence'
  | 'coaching'
  | 'tired'
  | 'concern'
  | 'sad'
  | 'frustrated'
  | 'confused'
  | 'nervous'
  | 'embarrassed'
  | 'cool'
  | 'intense';

/**
 * Eye scale configuration for Luxo-style transforms
 */
export interface EyeScale {
  scaleY: number;
  scaleX: number;
}

/**
 * Gaze direction via translate transform
 */
export interface GazeDirection {
  translateX: number;
  translateY: number;
}

/**
 * Lid curve configuration (controls SVG path curve)
 */
export interface LidCurve {
  curve: number;
}

/**
 * Smile crease visibility
 */
export interface SmileCrease {
  opacity: number;
  strokeWidth: number;
}

/**
 * Presence ring configuration
 */
export interface PresenceRing {
  opacity: number;
  strokeWidth: number;
  scale: number;
}

/**
 * iOS-specific window avatar parameters
 */
export interface IOSExpressionConfig {
  topCutoff: number;
  topCurve: number;
  bottomCutoff: number;
  bottomCurve: number;
  asymmetry: number;
}

/**
 * Complete expression configuration
 */
export interface ExpressionConfig {
  family: ExpressionFamily;
  body: { transform: string | null };
  eyeWhite: EyeScale;
  eyeLeftOverride: EyeScale | null;
  eyeRightOverride: EyeScale | null;
  eyesGroup: GazeDirection;
  lidTop: LidCurve;
  lidBottom: LidCurve;
  smileCrease: SmileCrease;
  presenceRing: PresenceRing;
  animation: string | null;
  sparkle: boolean;
  ios: IOSExpressionConfig;
}

/**
 * Micro-expression configuration for subliminal emotional flashes.
 * These quick expressions (40-150ms) provide subliminal emotional feedback.
 */
export interface MicroExpressionConfig {
  expression: ExpressionId;
  duration: number;
  returnTo: ExpressionId;
  /** Optional eye white scaling for the micro-expression */
  eyeWhite?: { scaleY: number; scaleX: number };
  /** Optional lid curve for the micro-expression */
  lidTop?: { curve: number };
  /** Optional smile crease opacity for the micro-expression */
  smileCrease?: { opacity: number };
}

/**
 * Expression family metadata
 */
export interface ExpressionFamilyMeta {
  name: string;
  description: string;
  expressions: ExpressionId[];
}

// ============================================================================
// EXPRESSION DATA
// ============================================================================

/**
 * All 100 expression configurations.
 * Use getExpression() for type-safe access.
 */
export const EXPRESSIONS: Record<ExpressionId, ExpressionConfig> = {
  'neutral': {
    family: 'core',
    body: { transform: null },
    eyeWhite: { scaleY: 1, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -10 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: 0,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'listening': {
    family: 'core',
    body: { transform: 'translateY(-2px)' },
    eyeWhite: { scaleY: 1.08, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: -0.05,
      bottomCutoff: 0,
      bottomCurve: 0.1,
      asymmetry: 0,
    },
  },
  'speaking': {
    family: 'core',
    body: { transform: null },
    eyeWhite: { scaleY: 0.88, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 15 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'speakPulse',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.15,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'happy': {
    family: 'happy',
    body: { transform: null },
    eyeWhite: { scaleY: 0.8, scaleX: 1.06 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 25 },
    lidBottom: { curve: -15 },
    smileCrease: { opacity: 0.4, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.1,
      topCurve: 0.25,
      bottomCutoff: 0.08,
      bottomCurve: -0.15,
      asymmetry: 0,
    },
  },
  'joyful': {
    family: 'happy',
    body: { transform: 'translateY(-4px) scale(1.03)' },
    eyeWhite: { scaleY: 0.7, scaleX: 1.12 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 35 },
    lidBottom: { curve: -25 },
    smileCrease: { opacity: 1, strokeWidth: 1.5 },
    presenceRing: { opacity: 0.5, strokeWidth: 2, scale: 1.02 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.16,
      topCurve: 0.35,
      bottomCutoff: 0.12,
      bottomCurve: -0.25,
      asymmetry: 0,
    },
  },
  'delighted': {
    family: 'happy',
    body: { transform: 'translateY(-6px) scale(1.05) rotate(-2deg)' },
    eyeWhite: { scaleY: 0.6, scaleX: 1.15 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 42 },
    lidBottom: { curve: -28 },
    smileCrease: { opacity: 1, strokeWidth: 2 },
    presenceRing: { opacity: 0.6, strokeWidth: 2.5, scale: 1 },
    animation: 'delightedBounce',
    sparkle: true,
    ios: {
      topCutoff: 0.22,
      topCurve: 0.42,
      bottomCutoff: 0.14,
      bottomCurve: -0.28,
      asymmetry: 0,
    },
  },
  'amused': {
    family: 'happy',
    body: { transform: 'rotate(1.5deg)' },
    eyeWhite: { scaleY: 0.78, scaleX: 1.06 },
    eyeLeftOverride: { scaleY: 0.75, scaleX: 1.06 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 26 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.7, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.1,
      topCurve: 0.26,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'pleased': {
    family: 'happy',
    body: { transform: 'translateY(-2px)' },
    eyeWhite: { scaleY: 0.82, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 22 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.5, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.08,
      topCurve: 0.22,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'content': {
    family: 'happy',
    body: { transform: 'scale(0.99)' },
    eyeWhite: { scaleY: 0.85, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.4, strokeWidth: 1 },
    presenceRing: { opacity: 0.25, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'excited': {
    family: 'happy',
    body: { transform: 'scale(1.06)' },
    eyeWhite: { scaleY: 1.15, scaleX: 1.08 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.8, strokeWidth: 1 },
    presenceRing: { opacity: 0.6, strokeWidth: 2.5, scale: 1 },
    animation: 'excitedBounce',
    sparkle: true,
    ios: {
      topCutoff: 0,
      topCurve: -0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'grateful': {
    family: 'happy',
    body: { transform: 'translateY(-3px) rotate(-1deg)' },
    eyeWhite: { scaleY: 0.72, scaleX: 1.08 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 32 },
    lidBottom: { curve: -15 },
    smileCrease: { opacity: 0.9, strokeWidth: 1.3 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.14,
      topCurve: 0.32,
      bottomCutoff: 0.08,
      bottomCurve: -0.15,
      asymmetry: 0,
    },
  },
  'proud': {
    family: 'happy',
    body: { transform: 'translateY(-5px) scale(1.04)' },
    eyeWhite: { scaleY: 0.88, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 15 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.6, strokeWidth: 1 },
    presenceRing: { opacity: 0.45, strokeWidth: 2, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.15,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'warm': {
    family: 'warmth',
    body: { transform: null },
    eyeWhite: { scaleY: 0.9, scaleX: 1.03 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: -10 },
    smileCrease: { opacity: 0.5, strokeWidth: 1 },
    presenceRing: { opacity: 0.38, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0.05,
      bottomCurve: -0.1,
      asymmetry: 0,
    },
  },
  'caring': {
    family: 'warmth',
    body: { transform: 'translateY(-2px) rotate(-1deg)' },
    eyeWhite: { scaleY: 0.88, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 20 },
    lidBottom: { curve: -8 },
    smileCrease: { opacity: 0.6, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.8, scale: 1 },
    animation: 'warmPulse',
    sparkle: false,
    ios: {
      topCutoff: 0.07,
      topCurve: 0.2,
      bottomCutoff: 0.04,
      bottomCurve: -0.08,
      asymmetry: 0,
    },
  },
  'loving': {
    family: 'warmth',
    body: { transform: 'translateY(-4px) scale(1.02)' },
    eyeWhite: { scaleY: 0.75, scaleX: 1.08 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 30 },
    lidBottom: { curve: -18 },
    smileCrease: { opacity: 1, strokeWidth: 1.5 },
    presenceRing: { opacity: 0.55, strokeWidth: 2.5, scale: 1 },
    animation: 'lovingGlow',
    sparkle: false,
    ios: {
      topCutoff: 0.12,
      topCurve: 0.3,
      bottomCutoff: 0.09,
      bottomCurve: -0.18,
      asymmetry: 0,
    },
  },
  'tender': {
    family: 'warmth',
    body: { transform: 'translateY(-2px) rotate(-0.5deg)' },
    eyeWhite: { scaleY: 0.82, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 24 },
    lidBottom: { curve: -10 },
    smileCrease: { opacity: 0.8, strokeWidth: 1.2 },
    presenceRing: { opacity: 0.38, strokeWidth: 1.8, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.09,
      topCurve: 0.24,
      bottomCutoff: 0.05,
      bottomCurve: -0.1,
      asymmetry: 0,
    },
  },
  'supportive': {
    family: 'warmth',
    body: { transform: 'translateY(-1px)' },
    eyeWhite: { scaleY: 0.92, scaleX: 1.01 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: -1, translateY: 0 },
    lidTop: { curve: 15 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.5, strokeWidth: 1 },
    presenceRing: { opacity: 0.42, strokeWidth: 1.6, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.15,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'compassionate': {
    family: 'warmth',
    body: { transform: 'translateY(-2px) rotate(-1.5deg)' },
    eyeWhite: { scaleY: 0.88, scaleX: 1.03 },
    eyeLeftOverride: { scaleY: 0.86, scaleX: 1.03 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 20 },
    lidBottom: { curve: -8 },
    smileCrease: { opacity: 0.6, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: 'warmPulse',
    sparkle: false,
    ios: {
      topCutoff: 0.07,
      topCurve: 0.2,
      bottomCutoff: 0.04,
      bottomCurve: -0.08,
      asymmetry: 0.03,
    },
  },
  'empathetic': {
    family: 'warmth',
    body: { transform: 'rotate(-2deg) translateY(-1px)' },
    eyeWhite: { scaleY: 0.9, scaleX: 1.02 },
    eyeLeftOverride: { scaleY: 0.88, scaleX: 1.02 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.5, strokeWidth: 1 },
    presenceRing: { opacity: 0.38, strokeWidth: 1.6, scale: 1 },
    animation: 'empathyMirror',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'nurturing': {
    family: 'warmth',
    body: { transform: 'translateY(-3px) scale(1.01)' },
    eyeWhite: { scaleY: 0.8, scaleX: 1.06 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 26 },
    lidBottom: { curve: -12 },
    smileCrease: { opacity: 0.85, strokeWidth: 1.3 },
    presenceRing: { opacity: 0.48, strokeWidth: 2, scale: 1 },
    animation: 'nurturingSwell',
    sparkle: false,
    ios: {
      topCutoff: 0.1,
      topCurve: 0.26,
      bottomCutoff: 0.06,
      bottomCurve: -0.12,
      asymmetry: 0,
    },
  },
  'playful': {
    family: 'playful',
    body: { transform: 'rotate(2deg) translateY(-2px)' },
    eyeWhite: { scaleY: 0.92, scaleX: 1.06 },
    eyeLeftOverride: { scaleY: 0.88, scaleX: 1.06 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 2, translateY: 0 },
    lidTop: { curve: 14 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.6, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'playfulSway',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.14,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'mischievous': {
    family: 'playful',
    body: { transform: 'rotate(4deg) translateX(3px)' },
    eyeWhite: { scaleY: 0.85, scaleX: 1.05 },
    eyeLeftOverride: { scaleY: 0.8, scaleX: 1.05 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 3, translateY: -1 },
    lidTop: { curve: 20 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.7, strokeWidth: 1.3 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.07,
      topCurve: 0.2,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.08,
    },
  },
  'cheeky': {
    family: 'playful',
    body: { transform: 'rotate(3deg) translateY(-2px)' },
    eyeWhite: { scaleY: 0.82, scaleX: 1.06 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 24 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.8, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.09,
      topCurve: 0.24,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'silly': {
    family: 'playful',
    body: { transform: 'rotate(-4deg) scaleX(1.03) translateY(-3px)' },
    eyeWhite: { scaleY: 0.78, scaleX: 1.12 },
    eyeLeftOverride: { scaleY: 0.72, scaleX: 1.12 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 30 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 1, strokeWidth: 1.5 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'sillyWobble',
    sparkle: false,
    ios: {
      topCutoff: 0.12,
      topCurve: 0.3,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.1,
    },
  },
  'winking': {
    family: 'playful',
    body: { transform: 'rotate(2deg) translateY(-2px)' },
    eyeWhite: { scaleY: 1, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.08, scaleX: 1.2 },
    eyeRightOverride: { scaleY: 1.05, scaleX: 1 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.6, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'winkBounce',
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.9,
    },
  },
  'teasing': {
    family: 'playful',
    body: { transform: 'rotate(2.5deg) translateX(2px)' },
    eyeWhite: { scaleY: 0.88, scaleX: 1.04 },
    eyeLeftOverride: { scaleY: 0.82, scaleX: 1.04 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 2, translateY: -0.5 },
    lidTop: { curve: 16 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.55, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.16,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.08,
    },
  },
  'surprised': {
    family: 'surprised',
    body: { transform: 'scaleY(1.02) scaleX(0.99)' },
    eyeWhite: { scaleY: 1.15, scaleX: 1.05 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -15 },
    lidBottom: { curve: 15 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.15,
      bottomCutoff: 0,
      bottomCurve: 0.15,
      asymmetry: 0,
    },
  },
  'shocked': {
    family: 'surprised',
    body: { transform: 'scaleY(1.08) scaleX(0.94) translateY(-8px)' },
    eyeWhite: { scaleY: 1.35, scaleX: 1.15 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -35 },
    lidBottom: { curve: 25 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.7, strokeWidth: 3, scale: 1 },
    animation: 'shockPop',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.35,
      bottomCutoff: 0,
      bottomCurve: 0.25,
      asymmetry: 0,
    },
  },
  'amazed': {
    family: 'surprised',
    body: { transform: 'translateY(-6px) scale(1.04)' },
    eyeWhite: { scaleY: 1.25, scaleX: 1.1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -28 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.55, strokeWidth: 2, scale: 1 },
    animation: 'amazedFloat',
    sparkle: true,
    ios: {
      topCutoff: 0,
      topCurve: -0.28,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'intrigued': {
    family: 'surprised',
    body: { transform: 'rotate(3deg) translateY(-2px)' },
    eyeWhite: { scaleY: 1.1, scaleX: 1.03 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 1.15, scaleX: 1.05 },
    eyesGroup: { translateX: 2, translateY: -2 },
    lidTop: { curve: -12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'astonished': {
    family: 'surprised',
    body: { transform: 'scaleY(1.06) scaleX(0.95) translateY(-5px)' },
    eyeWhite: { scaleY: 1.28, scaleX: 1.1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -30 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.5, strokeWidth: 2, scale: 1 },
    animation: 'astonishedPop',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.3,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'curious': {
    family: 'surprised',
    body: { transform: 'rotate(4deg) translateY(-3px)' },
    eyeWhite: { scaleY: 1.08, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 1.12, scaleX: 1 },
    eyesGroup: { translateX: 3, translateY: -2 },
    lidTop: { curve: -8 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'curiousTilt',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.08,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'thinking': {
    family: 'thinking',
    body: { transform: 'rotate(1.5deg)' },
    eyeWhite: { scaleY: 0.95, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 2, translateY: -2 },
    lidTop: { curve: 15 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.15,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'pondering': {
    family: 'thinking',
    body: { transform: 'rotate(3deg) translateY(-2px)' },
    eyeWhite: { scaleY: 0.88, scaleX: 0.96 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 4, translateY: -3 },
    lidTop: { curve: 18 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.28, strokeWidth: 1.5, scale: 1 },
    animation: 'ponderDrift',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'contemplating': {
    family: 'thinking',
    body: { transform: 'rotate(1.5deg) translateY(-1px)' },
    eyeWhite: { scaleY: 0.9, scaleX: 0.98 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 3, translateY: -2 },
    lidTop: { curve: 16 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'contemplateSway',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.16,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'focused': {
    family: 'thinking',
    body: { transform: 'translateY(-1px) scale(0.99)' },
    eyeWhite: { scaleY: 0.94, scaleX: 0.95 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.25, strokeWidth: 1.2, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'processing': {
    family: 'thinking',
    body: { transform: null },
    eyeWhite: { scaleY: 0.86, scaleX: 0.97 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 14 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.32, strokeWidth: 1.5, scale: 1 },
    animation: 'processingBody',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.14,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'reflecting': {
    family: 'thinking',
    body: { transform: 'rotate(-2deg) translateY(-1px)' },
    eyeWhite: { scaleY: 0.82, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: -2, translateY: 2 },
    lidTop: { curve: 22 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.28, strokeWidth: 1.5, scale: 1 },
    animation: 'reflectingSway',
    sparkle: false,
    ios: {
      topCutoff: 0.08,
      topCurve: 0.22,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'analyzing': {
    family: 'thinking',
    body: { transform: 'translateY(-1px)' },
    eyeWhite: { scaleY: 0.92, scaleX: 0.94 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.3, scale: 1 },
    animation: 'analyzingScan',
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'attentive': {
    family: 'listening',
    body: { transform: 'translateY(-2px) rotate(1deg)' },
    eyeWhite: { scaleY: 1.1, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 1.12, scaleX: 1 },
    eyesGroup: { translateX: 0, translateY: -1 },
    lidTop: { curve: 2 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.45, strokeWidth: 2, scale: 1 },
    animation: 'attentiveLean',
    sparkle: false,
    ios: {
      topCutoff: 0.01,
      topCurve: 0.02,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.02,
    },
  },
  'engaged': {
    family: 'listening',
    body: { transform: 'translateY(-1px) scaleY(1.01)' },
    eyeWhite: { scaleY: 1.06, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: 'engagedNod',
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: 0.05,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'interested': {
    family: 'listening',
    body: { transform: 'rotate(2deg)' },
    eyeWhite: { scaleY: 1.04, scaleX: 1 },
    eyeLeftOverride: { scaleY: 1.06, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 1, translateY: -0.5 },
    lidTop: { curve: 6 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.38, strokeWidth: 1.5, scale: 1 },
    animation: 'interestedTilt',
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: 0.06,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'absorbing': {
    family: 'listening',
    body: { transform: 'scaleY(1.01)' },
    eyeWhite: { scaleY: 1.05, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 4 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.42, strokeWidth: 1.5, scale: 1 },
    animation: 'absorbingBreathe',
    sparkle: false,
    ios: {
      topCutoff: 0.01,
      topCurve: 0.04,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'receptive': {
    family: 'listening',
    body: { transform: 'translateY(-0.5px)' },
    eyeWhite: { scaleY: 1.02, scaleX: 1.01 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 8 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'receptiveOpen',
    sparkle: false,
    ios: {
      topCutoff: 0.03,
      topCurve: 0.08,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'present': {
    family: 'presence',
    body: { transform: null },
    eyeWhite: { scaleY: 1, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'presentBreathe',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.05,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'grounded': {
    family: 'presence',
    body: { transform: 'translateY(1px)' },
    eyeWhite: { scaleY: 0.98, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.38, strokeWidth: 2.5, scale: 1 },
    animation: 'groundedSettle',
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: 0.05,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'calm': {
    family: 'presence',
    body: { transform: null },
    eyeWhite: { scaleY: 0.95, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 10 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.32, strokeWidth: 1.5, scale: 1 },
    animation: 'calmFloat',
    sparkle: false,
    ios: {
      topCutoff: 0.03,
      topCurve: 0.1,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'serene': {
    family: 'presence',
    body: { transform: null },
    eyeWhite: { scaleY: 0.92, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.9, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 14 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.3, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'sereneFloat',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.14,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'peaceful': {
    family: 'presence',
    body: { transform: null },
    eyeWhite: { scaleY: 0.88, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: -5 },
    smileCrease: { opacity: 0.4, strokeWidth: 1 },
    presenceRing: { opacity: 0.28, strokeWidth: 1.5, scale: 1 },
    animation: 'peacefulDrift',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0.02,
      bottomCurve: -0.05,
      asymmetry: 0,
    },
  },
  'encouraging': {
    family: 'coaching',
    body: { transform: 'translateY(-1px)' },
    eyeWhite: { scaleY: 0.92, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 15 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.45, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 2, scale: 1 },
    animation: 'encouragingBounce',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.15,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'cheering': {
    family: 'coaching',
    body: { transform: 'translateY(-2px) scaleY(1.02)' },
    eyeWhite: { scaleY: 0.8, scaleX: 1.06 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 25 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.7, strokeWidth: 1 },
    presenceRing: { opacity: 0.55, strokeWidth: 2, scale: 1 },
    animation: 'cheeringBounce',
    sparkle: true,
    ios: {
      topCutoff: 0.1,
      topCurve: 0.25,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'guiding': {
    family: 'coaching',
    body: { transform: 'rotate(1deg)' },
    eyeWhite: { scaleY: 0.96, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 0.98, scaleX: 1 },
    eyesGroup: { translateX: 0.5, translateY: -0.5 },
    lidTop: { curve: 10 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.35, strokeWidth: 1 },
    presenceRing: { opacity: 0.38, strokeWidth: 1.5, scale: 1 },
    animation: 'guidingLean',
    sparkle: false,
    ios: {
      topCutoff: 0.03,
      topCurve: 0.1,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'wise': {
    family: 'coaching',
    body: { transform: 'rotate(-0.5deg)' },
    eyeWhite: { scaleY: 0.9, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.88, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 16 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.4, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 2.5, scale: 1 },
    animation: 'wiseTilt',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.16,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'knowing': {
    family: 'coaching',
    body: { transform: null },
    eyeWhite: { scaleY: 0.88, scaleX: 1.01 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 0.86, scaleX: 1.02 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.5, strokeWidth: 1 },
    presenceRing: { opacity: 0.32, strokeWidth: 1.5, scale: 1 },
    animation: 'knowingNod',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'sleepy': {
    family: 'tired',
    body: { transform: 'scaleY(0.99)' },
    eyeWhite: { scaleY: 0.5, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 55 },
    lidBottom: { curve: -30 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.2, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.28,
      topCurve: 0.55,
      bottomCutoff: 0.15,
      bottomCurve: -0.3,
      asymmetry: 0,
    },
  },
  'drowsy': {
    family: 'tired',
    body: { transform: 'scaleY(0.98) translateY(2px)' },
    eyeWhite: { scaleY: 0.5, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 52 },
    lidBottom: { curve: -25 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.2, strokeWidth: 1.5, scale: 1 },
    animation: null,
    sparkle: false,
    ios: {
      topCutoff: 0.26,
      topCurve: 0.52,
      bottomCutoff: 0.12,
      bottomCurve: -0.25,
      asymmetry: 0,
    },
  },
  'exhausted': {
    family: 'tired',
    body: { transform: 'scaleY(0.97) rotate(-2deg) translateY(3px)' },
    eyeWhite: { scaleY: 0.35, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.3, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 2 },
    lidTop: { curve: 68 },
    lidBottom: { curve: -38 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.15, strokeWidth: 1, scale: 1 },
    animation: 'exhaustedSlump',
    sparkle: false,
    ios: {
      topCutoff: 0.35,
      topCurve: 0.68,
      bottomCutoff: 0.2,
      bottomCurve: -0.38,
      asymmetry: 0.08,
    },
  },
  'yawning': {
    family: 'tired',
    body: { transform: 'scaleY(1.04) scaleX(0.97)' },
    eyeWhite: { scaleY: 0.2, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 78 },
    lidBottom: { curve: -45 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.18, strokeWidth: 1.5, scale: 1 },
    animation: 'yawnStretch',
    sparkle: false,
    ios: {
      topCutoff: 0.4,
      topCurve: 0.78,
      bottomCutoff: 0.22,
      bottomCurve: -0.45,
      asymmetry: 0,
    },
  },
  'resting': {
    family: 'tired',
    body: { transform: 'scaleY(0.99) translateY(1px)' },
    eyeWhite: { scaleY: 0.6, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 45 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.22, strokeWidth: 1.5, scale: 1 },
    animation: 'restingFloat',
    sparkle: false,
    ios: {
      topCutoff: 0.22,
      topCurve: 0.45,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'blissful': {
    family: 'tired',
    body: { transform: 'translateY(-1px)' },
    eyeWhite: { scaleY: 0.55, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 50 },
    lidBottom: { curve: -18 },
    smileCrease: { opacity: 0.7, strokeWidth: 1 },
    presenceRing: { opacity: 0.28, strokeWidth: 2, scale: 1 },
    animation: 'blissfulFloat',
    sparkle: false,
    ios: {
      topCutoff: 0.25,
      topCurve: 0.5,
      bottomCutoff: 0.09,
      bottomCurve: -0.18,
      asymmetry: 0,
    },
  },
  'concerned': {
    family: 'concern',
    body: { transform: 'rotate(-1deg)' },
    eyeWhite: { scaleY: 1.02, scaleX: 1 },
    eyeLeftOverride: { scaleY: 1.04, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 8 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'concernedTilt',
    sparkle: false,
    ios: {
      topCutoff: 0.03,
      topCurve: 0.08,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'worried': {
    family: 'concern',
    body: { transform: 'rotate(-1.5deg) translateY(1px)' },
    eyeWhite: { scaleY: 1.05, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 1.08, scaleX: 1 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.38, strokeWidth: 1.5, scale: 1 },
    animation: 'worriedFidget',
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: 0.05,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.04,
    },
  },
  'sympathetic': {
    family: 'concern',
    body: { transform: 'rotate(-0.5deg)' },
    eyeWhite: { scaleY: 0.95, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.3, strokeWidth: 1 },
    presenceRing: { opacity: 0.32, strokeWidth: 1.5, scale: 1 },
    animation: 'sympatheticLean',
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'understanding': {
    family: 'concern',
    body: { transform: null },
    eyeWhite: { scaleY: 0.92, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.9, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 14 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.35, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'understandingNod',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.14,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.03,
    },
  },
  'comforting': {
    family: 'concern',
    body: { transform: 'translateY(-0.5px)' },
    eyeWhite: { scaleY: 0.9, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 16 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.4, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 2.5, scale: 1 },
    animation: 'comfortingWarmth',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.16,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'sad': {
    family: 'sad',
    body: { transform: 'translateY(2px) scaleY(0.98)' },
    eyeWhite: { scaleY: 0.85, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.82, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 2 },
    lidTop: { curve: 20 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.2, strokeWidth: 1.5, scale: 1 },
    animation: 'sadDroop',
    sparkle: false,
    ios: {
      topCutoff: 0.07,
      topCurve: 0.2,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'crying': {
    family: 'sad',
    body: { transform: 'translateY(3px) scaleY(0.96)' },
    eyeWhite: { scaleY: 0.4, scaleX: 1.1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 55 },
    lidBottom: { curve: -25 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.15, strokeWidth: 1.5, scale: 1 },
    animation: 'cryingShake',
    sparkle: false,
    ios: {
      topCutoff: 0.28,
      topCurve: 0.55,
      bottomCutoff: 0.12,
      bottomCurve: -0.25,
      asymmetry: 0,
    },
  },
  'melancholy': {
    family: 'sad',
    body: { transform: 'translateY(1px) rotate(-1deg)' },
    eyeWhite: { scaleY: 0.8, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 25 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.22, strokeWidth: 1.5, scale: 1 },
    animation: 'melancholyDrift',
    sparkle: false,
    ios: {
      topCutoff: 0.1,
      topCurve: 0.25,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'disappointed': {
    family: 'sad',
    body: { transform: 'translateY(1.5px) scaleY(0.98)' },
    eyeWhite: { scaleY: 0.75, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 1 },
    lidTop: { curve: 30 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.18, strokeWidth: 1.5, scale: 1 },
    animation: 'disappointedSink',
    sparkle: false,
    ios: {
      topCutoff: 0.12,
      topCurve: 0.3,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'dejected': {
    family: 'sad',
    body: { transform: 'translateY(3px) scaleY(0.95) rotate(-2deg)' },
    eyeWhite: { scaleY: 0.65, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.6, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: -1, translateY: 2 },
    lidTop: { curve: 40 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.12, strokeWidth: 1, scale: 1 },
    animation: 'dejectedSlump',
    sparkle: false,
    ios: {
      topCutoff: 0.2,
      topCurve: 0.4,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.08,
    },
  },
  'frustrated': {
    family: 'frustrated',
    body: { transform: 'scaleY(0.97) scaleX(1.02)' },
    eyeWhite: { scaleY: 0.7, scaleX: 1.05 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 15 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'frustratedTense',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.15,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'annoyed': {
    family: 'frustrated',
    body: { transform: 'rotate(-1deg)' },
    eyeWhite: { scaleY: 0.75, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 0.7, scaleX: 1 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'annoyedTwitch',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.08,
    },
  },
  'irritated': {
    family: 'frustrated',
    body: { transform: 'scaleY(0.98)' },
    eyeWhite: { scaleY: 0.68, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 22 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: 'irritatedJitter',
    sparkle: false,
    ios: {
      topCutoff: 0.08,
      topCurve: 0.22,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'exasperated': {
    family: 'frustrated',
    body: { transform: 'rotate(2deg) translateY(-2px)' },
    eyeWhite: { scaleY: 0.6, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: -1 },
    lidTop: { curve: 35 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'exasperatedSigh',
    sparkle: false,
    ios: {
      topCutoff: 0.16,
      topCurve: 0.35,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'eyeroll': {
    family: 'frustrated',
    body: { transform: null },
    eyeWhite: { scaleY: 0.85, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'eyerollGaze',
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'confused': {
    family: 'confused',
    body: { transform: 'rotate(3deg)' },
    eyeWhite: { scaleY: 1.02, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.95, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'confusedTilt',
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: 0.05,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.1,
    },
  },
  'skeptical': {
    family: 'confused',
    body: { transform: 'rotate(-2deg)' },
    eyeWhite: { scaleY: 0.8, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 0.65, scaleX: 1 },
    eyesGroup: { translateX: 1, translateY: 0 },
    lidTop: { curve: 20 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'skepticalSquint',
    sparkle: false,
    ios: {
      topCutoff: 0.07,
      topCurve: 0.2,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.2,
    },
  },
  'puzzled': {
    family: 'confused',
    body: { transform: 'rotate(4deg) translateY(-1px)' },
    eyeWhite: { scaleY: 1.05, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.98, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 3 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.32, strokeWidth: 1.5, scale: 1 },
    animation: 'puzzledBob',
    sparkle: false,
    ios: {
      topCutoff: 0.01,
      topCurve: 0.03,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.1,
    },
  },
  'perplexed': {
    family: 'confused',
    body: { transform: 'rotate(-3deg) scaleY(0.99)' },
    eyeWhite: { scaleY: 0.9, scaleX: 1 },
    eyeLeftOverride: { scaleY: 1, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 10 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.28, strokeWidth: 1.5, scale: 1 },
    animation: 'perplexedWobble',
    sparkle: false,
    ios: {
      topCutoff: 0.03,
      topCurve: 0.1,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.12,
    },
  },
  'bewildered': {
    family: 'confused',
    body: { transform: 'rotate(5deg) translateY(-2px)' },
    eyeWhite: { scaleY: 1.1, scaleX: 1.05 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -2 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'bewilderedSpin',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.02,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'nervous': {
    family: 'nervous',
    body: { transform: null },
    eyeWhite: { scaleY: 1.08, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 2 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'nervousShake',
    sparkle: false,
    ios: {
      topCutoff: 0.01,
      topCurve: 0.02,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'anxious': {
    family: 'nervous',
    body: { transform: 'scaleY(0.99)' },
    eyeWhite: { scaleY: 1.12, scaleX: 1 },
    eyeLeftOverride: { scaleY: 1.08, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 0 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 1.5, scale: 1 },
    animation: 'anxiousTremble',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: 0,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'scared': {
    family: 'nervous',
    body: { transform: 'scaleY(0.97) translateY(1px)' },
    eyeWhite: { scaleY: 1.2, scaleX: 1.1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -5 },
    lidBottom: { curve: 5 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.45, strokeWidth: 1.5, scale: 1 },
    animation: 'scaredRecoil',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.05,
      bottomCutoff: 0,
      bottomCurve: 0.05,
      asymmetry: 0,
    },
  },
  'fearful': {
    family: 'nervous',
    body: { transform: 'scaleY(0.95) scaleX(0.98)' },
    eyeWhite: { scaleY: 1.25, scaleX: 1.15 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: -1 },
    lidTop: { curve: -8 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.5, strokeWidth: 1.5, scale: 1 },
    animation: 'fearfulCower',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.08,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'uneasy': {
    family: 'nervous',
    body: { transform: 'rotate(-1deg)' },
    eyeWhite: { scaleY: 1.04, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 1, scaleX: 1 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 4 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.32, strokeWidth: 1.5, scale: 1 },
    animation: 'uneasyShift',
    sparkle: false,
    ios: {
      topCutoff: 0.01,
      topCurve: 0.04,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.05,
    },
  },
  'embarrassed': {
    family: 'embarrassed',
    body: { transform: 'scaleY(0.97) scaleX(0.99)' },
    eyeWhite: { scaleY: 1.15, scaleX: 1.08 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: -0.5 },
    lidTop: { curve: -3 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.45, strokeWidth: 1.5, scale: 1 },
    animation: 'embarrassedShrink',
    sparkle: false,
    ios: {
      topCutoff: 0,
      topCurve: -0.03,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'awkward': {
    family: 'embarrassed',
    body: { transform: 'rotate(2deg) scaleY(0.98)' },
    eyeWhite: { scaleY: 0.9, scaleX: 1.05 },
    eyeLeftOverride: { scaleY: 0.85, scaleX: 1.05 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'awkwardSquirm',
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.08,
    },
  },
  'cringing': {
    family: 'embarrassed',
    body: { transform: 'scaleY(0.95) scaleX(1.02)' },
    eyeWhite: { scaleY: 0.5, scaleX: 1.1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 45 },
    lidBottom: { curve: -20 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'cringingSqueeze',
    sparkle: false,
    ios: {
      topCutoff: 0.22,
      topCurve: 0.45,
      bottomCutoff: 0.1,
      bottomCurve: -0.2,
      asymmetry: 0,
    },
  },
  'sheepish': {
    family: 'embarrassed',
    body: { transform: 'rotate(-2deg) translateY(1px)' },
    eyeWhite: { scaleY: 0.85, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: -1, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.25, strokeWidth: 1 },
    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },
    animation: 'sheepishLean',
    sparkle: false,
    ios: {
      topCutoff: 0.06,
      topCurve: 0.18,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'flustered': {
    family: 'embarrassed',
    body: { transform: null },
    eyeWhite: { scaleY: 1.05, scaleX: 1 },
    eyeLeftOverride: { scaleY: 1.1, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 5 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.5, strokeWidth: 1.5, scale: 1 },
    animation: 'flusteredBounce',
    sparkle: false,
    ios: {
      topCutoff: 0.02,
      topCurve: 0.05,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.06,
    },
  },
  'confident': {
    family: 'cool',
    body: { transform: 'translateY(-1px)' },
    eyeWhite: { scaleY: 0.88, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 14 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.5, strokeWidth: 1 },
    presenceRing: { opacity: 0.4, strokeWidth: 2.5, scale: 1 },
    animation: 'confidentStance',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.14,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'smirking': {
    family: 'cool',
    body: { transform: 'rotate(2deg)' },
    eyeWhite: { scaleY: 0.82, scaleX: 1 },
    eyeLeftOverride: null,
    eyeRightOverride: { scaleY: 0.75, scaleX: 1 },
    eyesGroup: { translateX: 1, translateY: 0 },
    lidTop: { curve: 20 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.6, strokeWidth: 1.3 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'smirkingTilt',
    sparkle: false,
    ios: {
      topCutoff: 0.07,
      topCurve: 0.2,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.12,
    },
  },
  'cool': {
    family: 'cool',
    body: { transform: 'translateY(-1px) rotate(-1deg)' },
    eyeWhite: { scaleY: 0.7, scaleX: 1.05 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 28 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.4, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'coolLean',
    sparkle: false,
    ios: {
      topCutoff: 0.12,
      topCurve: 0.28,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'sassy': {
    family: 'cool',
    body: { transform: 'rotate(3deg) translateY(-1px)' },
    eyeWhite: { scaleY: 0.78, scaleX: 1 },
    eyeLeftOverride: { scaleY: 0.72, scaleX: 1 },
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 24 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.65, strokeWidth: 1 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5, scale: 1 },
    animation: 'sassyBounce',
    sparkle: false,
    ios: {
      topCutoff: 0.09,
      topCurve: 0.24,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0.1,
    },
  },
  'smug': {
    family: 'cool',
    body: { transform: 'rotate(-1deg) scaleY(1.01)' },
    eyeWhite: { scaleY: 0.72, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 30 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.7, strokeWidth: 1.3 },
    presenceRing: { opacity: 0.42, strokeWidth: 2.5, scale: 1 },
    animation: 'smugSettle',
    sparkle: false,
    ios: {
      topCutoff: 0.12,
      topCurve: 0.3,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'determined': {
    family: 'intense',
    body: { transform: 'scaleY(1.02) translateY(-1px)' },
    eyeWhite: { scaleY: 0.85, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: -0.5 },
    lidTop: { curve: 16 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.5, strokeWidth: 2.8, scale: 1 },
    animation: 'determinedStance',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.16,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'fierce': {
    family: 'intense',
    body: { transform: 'scaleY(0.98) scaleX(1.02)' },
    eyeWhite: { scaleY: 0.75, scaleX: 1.08 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 22 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.55, strokeWidth: 1.5, scale: 1 },
    animation: 'fierceIntensity',
    sparkle: false,
    ios: {
      topCutoff: 0.08,
      topCurve: 0.22,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'intense': {
    family: 'intense',
    body: { transform: 'scaleY(1.01)' },
    eyeWhite: { scaleY: 0.92, scaleX: 1.05 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 10 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0, strokeWidth: 1 },
    presenceRing: { opacity: 0.48, strokeWidth: 2.5, scale: 1 },
    animation: 'intenseStare',
    sparkle: false,
    ios: {
      topCutoff: 0.03,
      topCurve: 0.1,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'resolute': {
    family: 'intense',
    body: { transform: 'translateY(-0.5px)' },
    eyeWhite: { scaleY: 0.88, scaleX: 1.02 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 14 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.35, strokeWidth: 1 },
    presenceRing: { opacity: 0.45, strokeWidth: 2.8, scale: 1 },
    animation: 'resoluteStand',
    sparkle: false,
    ios: {
      topCutoff: 0.05,
      topCurve: 0.14,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
  'passionate': {
    family: 'intense',
    body: { transform: 'scaleY(1.02) translateY(-2px)' },
    eyeWhite: { scaleY: 0.9, scaleX: 1.04 },
    eyeLeftOverride: null,
    eyeRightOverride: null,
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    lidBottom: { curve: 10 },
    smileCrease: { opacity: 0.55, strokeWidth: 1 },
    presenceRing: { opacity: 0.5, strokeWidth: 2, scale: 1 },
    animation: 'passionatePulse',
    sparkle: false,
    ios: {
      topCutoff: 0.04,
      topCurve: 0.12,
      bottomCutoff: 0,
      bottomCurve: 0,
      asymmetry: 0,
    },
  },
};

// ============================================================================
// MICRO-EXPRESSIONS
// ============================================================================

/**
 * Micro-expressions for subliminal emotional feedback (40-150ms).
 * These are played quickly and return to a base expression.
 */
export const MICRO_EXPRESSIONS: Record<string, MicroExpressionConfig> = {
  'recognition': {
    expression: 'attentive',
    duration: 80,
    returnTo: 'listening',
    eyeWhite: { scaleY: 1.08, scaleX: 1 },
  },
  'concern': {
    expression: 'concerned',
    duration: 100,
    returnTo: 'listening',
    lidTop: { curve: 5 },
  },
  'delight': {
    expression: 'delighted',
    duration: 120,
    returnTo: 'listening',
    smileCrease: { opacity: 0.8 },
  },
  'warmth': {
    expression: 'warm',
    duration: 100,
    returnTo: 'listening',
    smileCrease: { opacity: 0.6 },
  },
  'interest': {
    expression: 'interested',
    duration: 90,
    returnTo: 'listening',
    eyeWhite: { scaleY: 1.05, scaleX: 1 },
  },
  'surprise': {
    expression: 'surprised',
    duration: 150,
    returnTo: 'listening',
    eyeWhite: { scaleY: 1.12, scaleX: 1.05 },
  },
};

// ============================================================================
// FAMILY METADATA
// ============================================================================

/**
 * Expression families with their member expressions.
 */
export const EXPRESSION_FAMILIES: Record<ExpressionFamily, ExpressionFamilyMeta> = {
  'core': {
    name: 'Core',
    description: 'Fundamental conversational states',
    expressions: ['neutral', 'listening', 'speaking'],
  },
  'happy': {
    name: 'Happy',
    description: 'Joy, delight, and positive emotions',
    expressions: ['happy', 'joyful', 'delighted', 'amused', 'pleased', 'content', 'excited', 'grateful', 'proud'],
  },
  'warmth': {
    name: 'Warmth',
    description: 'Care, love, and supportive emotions',
    expressions: ['warm', 'caring', 'loving', 'tender', 'supportive', 'compassionate', 'empathetic', 'nurturing'],
  },
  'playful': {
    name: 'Playful',
    description: 'Fun, mischievous, and lighthearted',
    expressions: ['playful', 'mischievous', 'cheeky', 'silly', 'winking', 'teasing'],
  },
  'surprised': {
    name: 'Surprised',
    description: 'Amazement, curiosity, and wonder',
    expressions: ['surprised', 'shocked', 'amazed', 'intrigued', 'astonished', 'curious'],
  },
  'thinking': {
    name: 'Thinking',
    description: 'Contemplation and deep thought',
    expressions: ['thinking', 'pondering', 'contemplating', 'focused', 'processing', 'reflecting', 'analyzing'],
  },
  'listening': {
    name: 'Listening',
    description: 'Active attention and receptivity',
    expressions: ['attentive', 'engaged', 'interested', 'absorbing', 'receptive'],
  },
  'presence': {
    name: 'Presence',
    description: 'Groundedness and inner peace',
    expressions: ['present', 'grounded', 'calm', 'serene', 'peaceful'],
  },
  'coaching': {
    name: 'Coaching',
    description: 'Guidance, wisdom, and encouragement',
    expressions: ['encouraging', 'cheering', 'guiding', 'wise', 'knowing'],
  },
  'tired': {
    name: 'Tired',
    description: 'Sleepy, restful, and exhausted states',
    expressions: ['sleepy', 'drowsy', 'exhausted', 'yawning', 'resting', 'blissful'],
  },
  'concern': {
    name: 'Concern',
    description: 'Worry, sympathy, and care for others',
    expressions: ['concerned', 'worried', 'sympathetic', 'understanding', 'comforting'],
  },
  'sad': {
    name: 'Sad',
    description: 'Sadness, disappointment, and grief',
    expressions: ['sad', 'crying', 'melancholy', 'disappointed', 'dejected'],
  },
  'frustrated': {
    name: 'Frustrated',
    description: 'Annoyance, irritation, and exasperation',
    expressions: ['frustrated', 'annoyed', 'irritated', 'exasperated', 'eyeroll'],
  },
  'confused': {
    name: 'Confused',
    description: 'Puzzlement, skepticism, and bewilderment',
    expressions: ['confused', 'skeptical', 'puzzled', 'perplexed', 'bewildered'],
  },
  'nervous': {
    name: 'Nervous',
    description: 'Anxiety, fear, and unease',
    expressions: ['nervous', 'anxious', 'scared', 'fearful', 'uneasy'],
  },
  'embarrassed': {
    name: 'Embarrassed',
    description: 'Awkwardness, cringing, and sheepishness',
    expressions: ['embarrassed', 'awkward', 'cringing', 'sheepish', 'flustered'],
  },
  'cool': {
    name: 'Cool',
    description: 'Confidence, smugness, and sass',
    expressions: ['confident', 'smirking', 'cool', 'sassy', 'smug'],
  },
  'intense': {
    name: 'Intense',
    description: 'Determination, passion, and fierceness',
    expressions: ['determined', 'fierce', 'intense', 'resolute', 'passionate'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get expression configuration by ID.
 * Returns neutral if expression not found.
 */
export function getExpression(id: ExpressionId | string): ExpressionConfig {
  return EXPRESSIONS[id as ExpressionId] ?? EXPRESSIONS.neutral;
}

/**
 * Get all expression IDs in a family.
 */
export function getExpressionsByFamily(family: ExpressionFamily): ExpressionId[] {
  return EXPRESSION_FAMILIES[family]?.expressions ?? [];
}

/**
 * Get family for an expression.
 */
export function getExpressionFamily(id: ExpressionId): ExpressionFamily {
  return EXPRESSIONS[id]?.family ?? 'core';
}

/**
 * Get micro-expression configuration.
 */
export function getMicroExpression(id: string): MicroExpressionConfig | null {
  return MICRO_EXPRESSIONS[id] ?? null;
}

/**
 * Get iOS configuration for an expression.
 */
export function getIOSConfig(id: ExpressionId | string): IOSExpressionConfig {
  const expr = EXPRESSIONS[id as ExpressionId];
  return expr?.ios ?? EXPRESSIONS.neutral.ios;
}

/**
 * Check if expression has asymmetric eyes.
 */
export function hasAsymmetricEyes(id: ExpressionId): boolean {
  const expr = EXPRESSIONS[id];
  return expr?.eyeLeftOverride !== null || expr?.eyeRightOverride !== null;
}

/**
 * Get all expression IDs as array.
 */
export function getAllExpressionIds(): ExpressionId[] {
  return Object.keys(EXPRESSIONS) as ExpressionId[];
}

/**
 * Get all family IDs as array.
 */
export function getAllFamilyIds(): ExpressionFamily[] {
  return Object.keys(EXPRESSION_FAMILIES) as ExpressionFamily[];
}
