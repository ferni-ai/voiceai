/**
 * Avatar Expression Controller
 * 
 * Bridges expression tokens from expressions.json to actual SVG manipulation.
 * This implements the Luxo-style animation system for Ferni avatars.
 */

import type { Expression } from './Avatar';

/**
 * Expression state from tokens
 */
export interface ExpressionState {
  body: { transform: string };
  eyeWhite: { scaleX: number; scaleY: number };
  eyeLeft?: { scaleX: number; scaleY: number };
  eyeRight?: { scaleX: number; scaleY: number };
  eyesGroup: { translateX: number; translateY: number };
  lidTop: { curve: number | string; furrow?: boolean; asymmetry?: number; droop?: boolean };
  lidBottom?: { curve: number | string };
  smileCrease: { opacity: number; strokeWidth?: number; asymmetry?: number };
  presenceRing: { opacity: number; strokeWidth?: number };
  sparkleGroup?: { opacity: number };
  animation?: string;
}

/**
 * Core expression states (simplified subset)
 */
const EXPRESSIONS: Record<Expression, ExpressionState> = {
  neutral: {
    body: { transform: 'none' },
    eyeWhite: { scaleX: 1, scaleY: 1 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 12 },
    smileCrease: { opacity: 0 },
    presenceRing: { opacity: 0.2 },
  },
  
  happy: {
    body: { transform: 'none' },
    eyeWhite: { scaleX: 1.06, scaleY: 0.8 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 25 },
    lidBottom: { curve: -15 },
    smileCrease: { opacity: 0.5 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.5 },
  },
  
  curious: {
    body: { transform: 'rotate(3deg)' },
    eyeWhite: { scaleX: 1.05, scaleY: 1.06 },
    eyeLeft: { scaleX: 1.05, scaleY: 1.1 },
    eyesGroup: { translateX: 2, translateY: -1 },
    lidTop: { curve: -8, asymmetry: 0.15 },
    smileCrease: { opacity: 0 },
    presenceRing: { opacity: 0.32 },
  },
  
  concerned: {
    body: { transform: 'rotate(-1.5deg) translateY(-1px)' },
    eyeWhite: { scaleX: 1.02, scaleY: 0.95 },
    eyesGroup: { translateX: -1, translateY: 0 },
    lidTop: { curve: 8, furrow: true },
    smileCrease: { opacity: 0 },
    presenceRing: { opacity: 0.35, strokeWidth: 1.6 },
  },
  
  thinking: {
    body: { transform: 'rotate(1.5deg)' },
    eyeWhite: { scaleX: 1, scaleY: 0.95 },
    eyesGroup: { translateX: 2, translateY: -2 },
    lidTop: { curve: 15 },
    smileCrease: { opacity: 0 },
    presenceRing: { opacity: 0.25 },
  },
  
  excited: {
    body: { transform: 'scale(1.06)' },
    eyeWhite: { scaleX: 1.08, scaleY: 1.15 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -12 },
    smileCrease: { opacity: 0.8 },
    sparkleGroup: { opacity: 1 },
    presenceRing: { opacity: 0.6, strokeWidth: 2.5 },
    animation: 'excitedBounce',
  },
  
  sleepy: {
    body: { transform: 'scaleY(0.99)' },
    eyeWhite: { scaleX: 1, scaleY: 0.5 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 55 },
    lidBottom: { curve: 30 },
    smileCrease: { opacity: 0 },
    presenceRing: { opacity: 0.15 },
  },
  
  surprised: {
    body: { transform: 'scaleY(1.02) scaleX(0.99)' },
    eyeWhite: { scaleX: 1.05, scaleY: 1.15 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: -15 },
    lidBottom: { curve: 15 },
    smileCrease: { opacity: 0 },
    presenceRing: { opacity: 0.4 },
  },
  
  warm: {
    body: { transform: 'none' },
    eyeWhite: { scaleX: 1.03, scaleY: 0.9 },
    eyesGroup: { translateX: 0, translateY: 0 },
    lidTop: { curve: 18 },
    lidBottom: { curve: -10 },
    smileCrease: { opacity: 0.4 },
    presenceRing: { opacity: 0.3 },
  },
};

/**
 * Get expression state
 */
export function getExpressionState(expression: Expression): ExpressionState {
  return EXPRESSIONS[expression] || EXPRESSIONS.neutral;
}

/**
 * Apply expression to SVG element
 */
export function applyExpression(
  svgElement: SVGSVGElement | null,
  expression: Expression
): void {
  if (!svgElement) return;
  
  const state = getExpressionState(expression);
  
  // Apply body transform
  const bodyGroup = svgElement.querySelector('.ferni-body-group') as SVGGElement | null;
  if (bodyGroup) {
    bodyGroup.style.transform = state.body.transform;
  }
  
  // Apply eye transforms
  const eyes = svgElement.querySelectorAll('.ferni-eye');
  eyes.forEach((eye, index) => {
    const eyeState = index === 0 
      ? (state.eyeLeft || state.eyeWhite) 
      : (state.eyeRight || state.eyeWhite);
    (eye as SVGElement).style.transform = 
      `scaleX(${eyeState.scaleX}) scaleY(${eyeState.scaleY})`;
  });
  
  // Apply eyes group gaze
  const eyesGroup = svgElement.querySelector('.ferni-eyes-group') as SVGGElement | null;
  if (eyesGroup) {
    eyesGroup.style.transform = 
      `translate(${state.eyesGroup.translateX}px, ${state.eyesGroup.translateY}px)`;
  }
  
  // Apply ring opacity
  const ring = svgElement.querySelector('#ferni-ring') as SVGCircleElement | null;
  if (ring) {
    ring.style.opacity = String(state.presenceRing.opacity);
    if (state.presenceRing.strokeWidth) {
      ring.style.strokeWidth = String(state.presenceRing.strokeWidth);
    }
  }
  
  // Apply smile
  const smile = svgElement.querySelector('#ferni-smile-crease') as SVGPathElement | null;
  if (smile) {
    smile.style.opacity = String(state.smileCrease.opacity);
  }
  
  // Apply sparkles
  if (state.sparkleGroup) {
    const sparkles = svgElement.querySelectorAll('.ferni-sparkle');
    sparkles.forEach((sparkle) => {
      (sparkle as SVGElement).style.opacity = String(state.sparkleGroup!.opacity);
    });
  }
}

/**
 * Interpolate between two expressions for smooth transitions
 */
export function interpolateExpressions(
  from: Expression,
  to: Expression,
  progress: number // 0-1
): ExpressionState {
  const fromState = getExpressionState(from);
  const toState = getExpressionState(to);
  
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  
  return {
    body: {
      transform: progress < 0.5 ? fromState.body.transform : toState.body.transform,
    },
    eyeWhite: {
      scaleX: lerp(fromState.eyeWhite.scaleX, toState.eyeWhite.scaleX),
      scaleY: lerp(fromState.eyeWhite.scaleY, toState.eyeWhite.scaleY),
    },
    eyesGroup: {
      translateX: lerp(fromState.eyesGroup.translateX, toState.eyesGroup.translateX),
      translateY: lerp(fromState.eyesGroup.translateY, toState.eyesGroup.translateY),
    },
    lidTop: {
      curve: lerp(
        typeof fromState.lidTop.curve === 'number' ? fromState.lidTop.curve : 12,
        typeof toState.lidTop.curve === 'number' ? toState.lidTop.curve : 12
      ),
    },
    smileCrease: {
      opacity: lerp(fromState.smileCrease.opacity, toState.smileCrease.opacity),
    },
    presenceRing: {
      opacity: lerp(fromState.presenceRing.opacity, toState.presenceRing.opacity),
      strokeWidth: lerp(
        fromState.presenceRing.strokeWidth || 1,
        toState.presenceRing.strokeWidth || 1
      ),
    },
  };
}

/**
 * Micro-expression definitions (40-150ms subliminal flashes)
 */
export const MICRO_EXPRESSIONS = {
  recognition: { expression: 'attentive' as const, duration: 80, returnTo: 'listening' },
  concern: { expression: 'concerned' as const, duration: 100, returnTo: 'listening' },
  delight: { expression: 'delighted' as const, duration: 120, returnTo: 'happy' },
  warmth: { expression: 'warm' as const, duration: 100, returnTo: 'listening' },
  interest: { expression: 'interested' as const, duration: 90, returnTo: 'listening' },
  surprise: { expression: 'surprised' as const, duration: 80, returnTo: 'listening' },
} as const;

/**
 * Play a micro-expression (subliminal trust-building)
 */
export function playMicroExpression(
  type: keyof typeof MICRO_EXPRESSIONS,
  applyFn: (expression: string) => void,
  currentExpression: string
): void {
  const micro = MICRO_EXPRESSIONS[type];
  
  // Flash to the micro-expression
  applyFn(micro.expression);
  
  // Return to previous expression after duration
  setTimeout(() => {
    applyFn(currentExpression);
  }, micro.duration);
}
