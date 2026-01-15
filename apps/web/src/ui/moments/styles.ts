/**
 * Moments System Styles
 *
 * CSS-in-JS styles for the unified feedback system.
 * All moments appear near or from the avatar.
 *
 * @module ui/moments/styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { MOMENT_Z_INDEX } from './constants.js';

// ============================================================================
// STYLE INJECTION
// ============================================================================

let styleElement: HTMLStyleElement | null = null;

export function injectMomentStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'ferni-moments-styles';
  styleElement.textContent = MOMENT_STYLES;
  document.head.appendChild(styleElement);
}

export function removeMomentStyles(): void {
  styleElement?.remove();
  styleElement = null;
}

// ============================================================================
// CSS STYLES
// ============================================================================

const MOMENT_STYLES = `
/* ============================================================================
   MOMENTS CONTAINER
   Positioned near the avatar for conversational feel
   ============================================================================ */

.moments-container {
  position: fixed;
  top: calc(260px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: ${MOMENT_Z_INDEX.whisper};
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
}

@media (max-width: 480px) {
  .moments-container {
    top: calc(220px + env(safe-area-inset-top, 0px));
  }
}

/* ============================================================================
   WHISPER (Level 1)
   Small, cute, pill-shaped confirmations
   ============================================================================ */

.moment-whisper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  border-radius: var(--radius-full, 9999px);
  font-family: var(--font-body, 'Inter', system-ui);
  font-size: clamp(12px, 2.8vw, 14px);
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
  max-width: calc(100vw - 48px);
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: var(--shadow-md);
  pointer-events: auto;
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}

.moment-whisper--info {
  background: var(--persona-primary, #4a6741);
  color: white;
  border: 1px solid var(--persona-secondary, #3d5a35);
}

.moment-whisper--success {
  background: var(--persona-primary, #4a6741);
  color: white;
  border: 1px solid var(--persona-secondary, #3d5a35);
}

.moment-whisper--warning {
  background: var(--color-semantic-warning, #b8956a);
  color: white;
  border: 1px solid var(--color-semantic-warning-border, rgba(184, 149, 106, 0.8));
}

.moment-whisper--error {
  background: var(--color-semantic-error, #a65a52);
  color: white;
  border: 1px solid var(--color-semantic-error-border, rgba(166, 90, 82, 0.8));
}

.moment-whisper--entering {
  animation: whisper-enter ${DURATION.SLOW}ms ${EASING.SPRING} forwards;
}

.moment-whisper--exiting {
  animation: whisper-exit ${DURATION.NORMAL}ms ${EASING.STANDARD} forwards;
}

@keyframes whisper-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes whisper-exit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}

/* ============================================================================
   NOTICE (Level 2)
   Events with optional actions, triggers avatar pulse
   ============================================================================ */

.moment-notice {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--radius-xl, 16px);
  font-family: var(--font-body, 'Inter', system-ui);
  font-size: clamp(13px, 3vw, 15px);
  font-weight: 500;
  max-width: 320px;
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  opacity: 0;
  transform: translateY(12px) scale(0.9);
}

.moment-notice--seeds {
  background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
  color: white;
}

.moment-notice--badge {
  background: var(--color-semantic-success, #4a8741);
  color: white;
}

.moment-notice--entering {
  animation: notice-enter ${DURATION.SLOW}ms ${EASING.SPRING} ${DURATION.FAST}ms forwards;
}

.moment-notice--exiting {
  animation: notice-exit ${DURATION.NORMAL}ms ${EASING.EXPO_OUT} forwards;
}

@keyframes notice-enter {
  0% {
    opacity: 0;
    transform: translateY(12px) scale(0.9);
  }
  70% {
    opacity: 1;
    transform: translateY(0) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes notice-exit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
}

/* Notice amount styling (for seeds) */
.moment-notice__amount {
  font-weight: 700;
  font-size: 1.1em;
}

.moment-notice__reason {
  opacity: 0.9;
}

/* Notice action button */
.moment-notice__action {
  display: inline-flex;
  align-items: center;
  margin-left: var(--space-2, 8px);
  padding: var(--space-1, 4px) var(--space-3, 12px);
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-md, 8px);
  color: inherit;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
}

.moment-notice__action:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.02);
}

.moment-notice__action:active {
  transform: scale(0.98);
}

/* Shimmer effect for celebration notices */
.moment-notice--celebration::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: linear-gradient(90deg, 
    transparent 0%, 
    rgba(255, 255, 255, 0.3) 50%, 
    transparent 100%
  );
  opacity: 0;
  animation: shimmer 1.5s ease-in-out;
}

@keyframes shimmer {
  0% {
    opacity: 0;
    transform: translateX(-100%);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(100%);
  }
}

/* ============================================================================
   CELEBRATION (Level 3)
   Milestone moments with sparkles
   ============================================================================ */

.moment-celebration {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: ${MOMENT_Z_INDEX.celebration};
  padding: var(--space-6, 24px) var(--space-8, 32px);
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: 
    var(--shadow-2xl),
    0 0 60px var(--persona-glow, rgba(74, 103, 65, 0.3));
  text-align: center;
  max-width: 90vw;
  pointer-events: auto;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.8);
}

.moment-celebration--entering {
  animation: celebration-enter ${DURATION.SLOW}ms ${EASING.SPRING} forwards;
}

.moment-celebration--exiting {
  animation: celebration-exit ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
}

@keyframes celebration-enter {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes celebration-exit {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95) translateY(-20px);
  }
}

.moment-celebration__icon {
  width: 48px;
  height: 48px;
  margin: 0 auto var(--space-3, 12px);
  color: var(--persona-primary, #4a6741);
}

.moment-celebration__icon svg {
  width: 100%;
  height: 100%;
}

.moment-celebration__title {
  font-family: var(--font-display, 'Plus Jakarta Sans');
  font-size: clamp(20px, 5vw, 24px);
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-2, 8px) 0;
}

.moment-celebration__subtitle {
  font-family: var(--font-body, 'Inter');
  font-size: clamp(14px, 3.5vw, 16px);
  color: var(--color-text-secondary, #70605a);
  margin: 0;
}

/* ============================================================================
   MILESTONE (Level 4)
   Full modal experience
   ============================================================================ */

.moment-milestone {
  position: fixed;
  inset: 0;
  z-index: ${MOMENT_Z_INDEX.milestone};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4, 16px);
  pointer-events: none;
  opacity: 0;
}

.moment-milestone--visible {
  opacity: 1;
  pointer-events: auto;
}

.moment-milestone__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.moment-milestone__card {
  position: relative;
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  max-width: clamp(294px, 90vw, 420px);
  width: 100%;
  padding: var(--space-8, 32px);
  text-align: center;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.8) translateY(40px);
}

.moment-milestone--entering .moment-milestone__card {
  animation: milestone-card-enter ${DURATION.DRAMATIC}ms ${EASING.SPRING} ${DURATION.NORMAL}ms forwards;
}

.moment-milestone--exiting .moment-milestone__card {
  animation: milestone-card-exit ${DURATION.SLOW}ms ${EASING.STANDARD} forwards;
}

@keyframes milestone-card-enter {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(40px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes milestone-card-exit {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(-20px);
  }
}

.moment-milestone__close {
  position: absolute;
  top: var(--space-4, 16px);
  right: var(--space-4, 16px);
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-background-secondary, #f5f3f0);
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #7a6f63);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  z-index: 1;
}

.moment-milestone__close:hover {
  background: var(--color-background-tertiary, #ebe8e3);
  color: var(--color-text-primary, #2C2520);
}

.moment-milestone__close svg {
  width: 18px;
  height: 18px;
}

.moment-milestone__eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--persona-primary, #4a6741);
  margin-bottom: var(--space-2, 8px);
  opacity: 0;
}

.moment-milestone__title {
  font-family: var(--font-display, 'Plus Jakarta Sans');
  font-size: clamp(1.5rem, 5vw, 1.75rem);
  font-weight: 700;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-3, 12px) 0;
  line-height: 1.2;
  opacity: 0;
}

.moment-milestone__message {
  font-family: var(--font-body, 'Inter');
  font-size: clamp(0.9rem, 3.5vw, 0.95rem);
  line-height: 1.6;
  color: var(--color-text-secondary, #5a5048);
  margin: 0 0 var(--space-6, 24px) 0;
  opacity: 0;
}

.moment-milestone__stats {
  display: flex;
  justify-content: center;
  gap: var(--space-6, 24px);
  margin-bottom: var(--space-6, 24px);
  opacity: 0;
}

.moment-milestone__stat {
  text-align: center;
}

.moment-milestone__stat-value {
  font-family: var(--font-display, 'Plus Jakarta Sans');
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary, #2C2520);
}

.moment-milestone__stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted, #7a6f63);
}

.moment-milestone__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  opacity: 0;
}

.moment-milestone__button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--radius-lg, 12px);
  font-family: var(--font-body, 'Inter');
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.moment-milestone__button--primary {
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
}

.moment-milestone__button--primary:hover {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-1px);
}

.moment-milestone__button--secondary {
  background: transparent;
  color: var(--color-text-secondary, #5a5048);
  border: 2px solid var(--color-border, #d4d0c8);
}

.moment-milestone__button--secondary:hover {
  background: var(--color-background-secondary, #faf8f5);
  border-color: var(--color-border-hover, #c4c0b8);
}

.moment-milestone__button svg {
  width: 18px;
  height: 18px;
}

/* Content stagger animation */
.moment-milestone--entering .moment-milestone__eyebrow {
  animation: milestone-content-enter ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} ${DURATION.SLOW}ms forwards;
}

.moment-milestone--entering .moment-milestone__title {
  animation: milestone-content-enter ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} ${DURATION.SLOW + 80}ms forwards;
}

.moment-milestone--entering .moment-milestone__message {
  animation: milestone-content-enter ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} ${DURATION.SLOW + 160}ms forwards;
}

.moment-milestone--entering .moment-milestone__stats {
  animation: milestone-content-enter ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} ${DURATION.SLOW + 240}ms forwards;
}

.moment-milestone--entering .moment-milestone__actions {
  animation: milestone-content-enter ${DURATION.DELIBERATE}ms ${EASING.EXPO_OUT} ${DURATION.SLOW + 320}ms forwards;
}

@keyframes milestone-content-enter {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============================================================================
   SPARKLES
   Particle effects for celebrations
   ============================================================================ */

.moment-sparkle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: white;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
}

@keyframes sparkle-burst {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--spark-x), var(--spark-y)) scale(0);
  }
}

/* ============================================================================
   BADGE DISPLAY
   Persistent indicators near avatar
   ============================================================================ */

.moments-badges {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--space-2, 8px);
  z-index: ${MOMENT_Z_INDEX.badge};
}

.moments-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  padding: var(--space-1, 4px) var(--space-2, 8px);
  background: var(--glass-background, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition: transform ${DURATION.FAST}ms ${EASING.SPRING},
              background ${DURATION.FAST}ms;
}

.moments-badge:hover {
  background: var(--color-bg-elevated, rgba(255, 255, 255, 0.15));
  transform: scale(1.05);
}

.moments-badge__icon {
  width: 16px;
  height: 16px;
}

.moments-badge__count {
  font-family: var(--font-display, 'Plus Jakarta Sans');
  font-size: var(--text-xs, 0.75rem);
  font-weight: 600;
  color: var(--color-text-primary, white);
}

.moments-badge--streak .moments-badge__icon {
  color: var(--color-semantic-warning, #f59e0b);
  animation: flame-flicker 2s ease-in-out infinite;
}

.moments-badge--seeds .moments-badge__icon {
  color: var(--persona-primary, #4a6741);
}

.moments-badge--achievements .moments-badge__icon {
  color: var(--color-semantic-success, #4a8741);
}

.moments-badge--new::after {
  content: '';
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: var(--color-semantic-error, #ef4444);
  border-radius: var(--radius-full, 9999px);
  animation: badge-pulse 2s ease-in-out infinite;
}

@keyframes flame-flicker {
  0%, 100% { transform: scaleY(1); opacity: 1; }
  25% { transform: scaleY(1.05); opacity: 0.9; }
  50% { transform: scaleY(0.95); opacity: 1; }
  75% { transform: scaleY(1.03); opacity: 0.95; }
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.8; }
}

/* ============================================================================
   REDUCED MOTION
   ============================================================================ */

@media (prefers-reduced-motion: reduce) {
  .moment-whisper,
  .moment-notice,
  .moment-celebration,
  .moment-milestone__card {
    animation: none !important;
    transition: opacity ${DURATION.FAST}ms linear !important;
  }

  .moment-whisper--entering,
  .moment-notice--entering,
  .moment-celebration--entering {
    opacity: 1;
    transform: none;
  }

  .moment-whisper--exiting,
  .moment-notice--exiting,
  .moment-celebration--exiting {
    opacity: 0;
  }

  .moment-milestone--entering .moment-milestone__card {
    opacity: 1;
    transform: none;
  }

  .moment-milestone--entering .moment-milestone__eyebrow,
  .moment-milestone--entering .moment-milestone__title,
  .moment-milestone--entering .moment-milestone__message,
  .moment-milestone--entering .moment-milestone__stats,
  .moment-milestone--entering .moment-milestone__actions {
    animation: none !important;
    opacity: 1;
    transform: none;
  }

  .moments-badge--streak .moments-badge__icon,
  .moment-notice--celebration::before,
  .moments-badge--new::after {
    animation: none !important;
  }

  .moment-sparkle {
    display: none !important;
  }
}

/* ============================================================================
   DARK THEME
   ============================================================================ */

@media (prefers-color-scheme: dark) {
  .moment-celebration {
    background: var(--color-background-elevated, #3a3330);
  }

  .moment-milestone__backdrop {
    background: rgba(28, 24, 20, 0.85);
  }

  .moment-milestone__card {
    background: var(--color-background-elevated, #3a3330);
  }

  .moment-milestone__close {
    background: var(--color-background-tertiary, #4a4540);
  }

  .moment-milestone__close:hover {
    background: var(--color-background-secondary, #5a5550);
  }

  .moment-milestone__button--secondary {
    border-color: var(--color-border, #5a5550);
  }

  .moment-milestone__button--secondary:hover {
    background: var(--color-background-tertiary, #4a4540);
  }
}

/* ============================================================================
   MOBILE
   ============================================================================ */

@media (max-width: 480px) {
  .moment-whisper {
    font-size: 12px;
    padding: var(--space-1, 4px) var(--space-3, 12px);
  }

  .moment-notice {
    font-size: 13px;
    max-width: calc(100vw - 32px);
  }

  .moment-celebration {
    padding: var(--space-4, 16px) var(--space-6, 24px);
  }

  .moment-milestone__card {
    padding: var(--space-6, 24px);
    max-height: calc(100vh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0) - 32px);
    max-height: calc(100dvh - env(safe-area-inset-top, 0) - env(safe-area-inset-bottom, 0) - 32px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
`;
