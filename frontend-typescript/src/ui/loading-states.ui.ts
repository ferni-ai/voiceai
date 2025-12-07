/**
 * Loading States UI - Pixar-Quality Loading Experiences
 * 
 * 🎬 PIXAR PRINCIPLES APPLIED:
 * - ANTICIPATION: Building excitement before reveal
 * - APPEAL: Loading feels welcoming, not frustrating
 * - TIMING: Perfect rhythm that doesn't drag
 * - SECONDARY ACTION: Supporting animations add life
 * 
 * Features:
 * - Personality warmth gradient pulse
 * - Shimmer effect with persona colors
 * - WALL-E curious tilt when ready
 * - Dust particle initialization effect
 * - Luxo Jr. lamp bounce on load
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let prefersReducedMotion = false;

// Animation elements and IDs
let warmthPulseId: number | null = null;
let shimmerElement: HTMLElement | null = null;
let dustContainer: HTMLElement | null = null;

// Current persona color
let currentPersonaColor = '#4a7c59'; // Ferni green default

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initLoadingStates(): void {
  if (isInitialized) return;
  
  // Check reduced motion preference
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });
  
  isInitialized = true;
}

// ============================================================================
// 🌡️ WARMTH GRADIENT PULSE - Personality warmth during loading
// ============================================================================

/**
 * Start a warm, inviting gradient pulse.
 * Like a gentle heartbeat that says "I'm here, warming up for you."
 */
export function startWarmthPulse(element?: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  const target = element ?? document.body;
  
  // Create overlay element
  const overlay = document.createElement('div');
  overlay.id = 'warmth-pulse-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: -1;
    opacity: 0.4;
    background: radial-gradient(ellipse at center, ${currentPersonaColor}20 0%, transparent 70%);
  `;
  
  target.appendChild(overlay);
  
  let phase = 0;
  
  const pulse = () => {
    phase += 0.03;
    const opacity = 0.2 + Math.sin(phase) * 0.2;
    const scale = 1 + Math.sin(phase * 0.5) * 0.1;
    
    overlay.style.opacity = String(opacity);
    overlay.style.transform = `scale(${scale})`;
    
    warmthPulseId = requestAnimationFrame(pulse);
  };
  
  warmthPulseId = requestAnimationFrame(pulse);
}

/**
 * Stop the warmth pulse.
 */
export function stopWarmthPulse(): void {
  if (warmthPulseId) {
    cancelAnimationFrame(warmthPulseId);
    warmthPulseId = null;
  }
  
  const overlay = document.getElementById('warmth-pulse-overlay');
  if (overlay) {
    // Fade out
    overlay.style.transition = 'opacity 0.5s ease-out';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 500);
  }
}

// ============================================================================
// ✨ SHIMMER EFFECT - Anticipation during connection
// ============================================================================

/**
 * Add shimmer effect to an element.
 * The classic loading shimmer, but warmer and more organic.
 */
export function addShimmer(element: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  // Remove existing shimmer
  removeShimmer(element);
  
  shimmerElement = document.createElement('div');
  shimmerElement.className = 'pixar-shimmer';
  shimmerElement.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    border-radius: inherit;
  `;
  
  const shine = document.createElement('div');
  shine.style.cssText = `
    position: absolute;
    top: 0;
    left: -100%;
    width: 50%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      ${currentPersonaColor}30,
      transparent
    );
    animation: shimmer-slide 2s infinite ease-in-out;
  `;
  
  // Add keyframes if not exists
  if (!document.getElementById('shimmer-keyframes')) {
    const style = document.createElement('style');
    style.id = 'shimmer-keyframes';
    style.textContent = `
      @keyframes shimmer-slide {
        0% { left: -100%; }
        100% { left: 200%; }
      }
    `;
    document.head.appendChild(style);
  }
  
  shimmerElement.appendChild(shine);
  
  // Make parent relative if needed
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }
  
  element.appendChild(shimmerElement);
}

/**
 * Remove shimmer effect.
 */
export function removeShimmer(element: HTMLElement): void {
  const shimmer = element.querySelector('.pixar-shimmer');
  shimmer?.remove();
  shimmerElement = null;
}

// ============================================================================
// 🤖 WALL-E CURIOUS TILT - Ready state animation
// ============================================================================

/**
 * Play the WALL-E curious tilt when ready.
 * Like WALL-E perking up when he sees something interesting.
 */
export function playReadyTilt(element: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  element.animate([
    // Starting position
    { transform: 'rotate(0deg) scale(1)', offset: 0 },
    // Quick anticipation (slight opposite)
    { transform: 'rotate(-2deg) scale(0.98)', offset: 0.1 },
    // Main tilt with squash
    { transform: 'rotate(5deg) scale(1.02, 0.98)', offset: 0.35 },
    // Overshoot
    { transform: 'rotate(7deg) scale(1.01, 0.99)', offset: 0.45 },
    // Settle
    { transform: 'rotate(4deg) scale(1)', offset: 0.6 },
    // Return with bounce
    { transform: 'rotate(-1deg) scale(1.01)', offset: 0.8 },
    // Final settle
    { transform: 'rotate(0deg) scale(1)', offset: 1 },
  ], {
    duration: DURATION.DRAMATIC,
    easing: EASING.SPRING,
    fill: 'forwards',
  });
}

// ============================================================================
// 🌬️ DUST PARTICLES - Initialization effect
// ============================================================================

/**
 * Create magical dust particles on initialization.
 * Like WALL-E's world coming to life.
 */
export function createDustParticles(container?: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  const parent = container ?? document.body;
  
  // Create dust container
  dustContainer = document.createElement('div');
  dustContainer.id = 'dust-particles';
  dustContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-loading);
    overflow: hidden;
  `;
  
  parent.appendChild(dustContainer);
  
  // Create dust particles
  const particleCount = 30;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    const size = 2 + Math.random() * 4;
    const startX = Math.random() * 100;
    const startY = 100 + Math.random() * 20; // Start below viewport
    const endX = startX + (Math.random() - 0.5) * 30;
    const endY = -10 - Math.random() * 20; // End above viewport
    const duration = 3000 + Math.random() * 2000;
    const delay = i * 100;
    
    particle.style.cssText = `
      position: absolute;
      left: ${startX}%;
      top: ${startY}%;
      width: ${size}px;
      height: ${size}px;
      background: ${currentPersonaColor};
      border-radius: 50%;
      opacity: 0;
    `;
    
    dustContainer.appendChild(particle);
    
    // Animate dust rising
    setTimeout(() => {
      particle.animate([
        { 
          transform: 'translate(0, 0) scale(1)', 
          opacity: 0,
          offset: 0 
        },
        { 
          transform: `translate(${(endX - startX) * 0.3}vw, ${(endY - startY) * 0.3}vh) scale(1.2)`, 
          opacity: 0.6,
          offset: 0.2 
        },
        { 
          transform: `translate(${(endX - startX) * 0.7}vw, ${(endY - startY) * 0.7}vh) scale(1)`, 
          opacity: 0.4,
          offset: 0.7 
        },
        { 
          transform: `translate(${endX - startX}vw, ${endY - startY}vh) scale(0.5)`, 
          opacity: 0,
          offset: 1 
        },
      ], {
        duration,
        easing: 'ease-out',
        fill: 'forwards',
      });
    }, delay);
  }
  
  // Remove container after all particles done
  setTimeout(() => {
    removeDustParticles();
  }, 5500);
}

/**
 * Remove dust particles.
 */
export function removeDustParticles(): void {
  if (dustContainer?.parentNode) {
    dustContainer.parentNode.removeChild(dustContainer);
    dustContainer = null;
  }
}

// ============================================================================
// 💡 LUXO JR. LAMP BOUNCE - Page load celebration
// ============================================================================

/**
 * Play the iconic Luxo Jr. lamp bounce on page load.
 * A warm welcome that says "We're ready!"
 */
export function playLuxoBounce(element: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  // The famous Pixar lamp hop sequence
  element.animate([
    // Rest
    { transform: 'translateY(0) scaleY(1) scaleX(1)', offset: 0 },
    // Anticipation squash
    { transform: 'translateY(5px) scaleY(0.85) scaleX(1.1)', offset: 0.1 },
    { transform: 'translateY(8px) scaleY(0.8) scaleX(1.15)', offset: 0.15 },
    // Launch!
    { transform: 'translateY(-40px) scaleY(1.2) scaleX(0.9)', offset: 0.35 },
    // Peak with hang time
    { transform: 'translateY(-50px) scaleY(1.1) scaleX(0.95)', offset: 0.45 },
    { transform: 'translateY(-48px) scaleY(1.08) scaleX(0.96)', offset: 0.5 },
    // Fall
    { transform: 'translateY(-20px) scaleY(1.15) scaleX(0.92)', offset: 0.6 },
    // Land with squash
    { transform: 'translateY(10px) scaleY(0.75) scaleX(1.2)', offset: 0.72 },
    // Recovery bounce
    { transform: 'translateY(-15px) scaleY(1.1) scaleX(0.95)', offset: 0.82 },
    // Small settle
    { transform: 'translateY(3px) scaleY(0.95) scaleX(1.03)', offset: 0.92 },
    // Final rest
    { transform: 'translateY(0) scaleY(1) scaleX(1)', offset: 1 },
  ], {
    duration: DURATION.ENTRANCE,
    easing: EASING.LINEAR, // We're controlling the easing through keyframes
    fill: 'forwards',
  });
}

// ============================================================================
// 🔄 CONNECTION PROGRESS ANIMATION
// ============================================================================

/**
 * Animate connection progress steps.
 * Each step bounces in with Pixar energy.
 */
export function animateProgressStep(stepElement: HTMLElement, stepIndex: number): void {
  if (prefersReducedMotion) return;
  
  const delay = stepIndex * 150;
  
  setTimeout(() => {
    stepElement.animate([
      { transform: 'scale(0) rotate(-10deg)', opacity: 0, offset: 0 },
      { transform: 'scale(1.2) rotate(5deg)', opacity: 1, offset: 0.5 },
      { transform: 'scale(0.95) rotate(-2deg)', opacity: 1, offset: 0.75 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 1 },
    ], {
      duration: DURATION.MODERATE,
      easing: EASING.SPRING,
      fill: 'forwards',
    });
  }, delay);
}

// ============================================================================
// 🎨 COLOR UPDATES
// ============================================================================

/**
 * Update the persona color for loading effects.
 */
export function setPersonaColor(color: string): void {
  currentPersonaColor = color;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  stopWarmthPulse();
  removeDustParticles();
  
  // Remove any shimmer keyframes
  const keyframes = document.getElementById('shimmer-keyframes');
  keyframes?.remove();
  
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const loadingStatesUI = {
  init: initLoadingStates,
  startWarmthPulse,
  stopWarmthPulse,
  addShimmer,
  removeShimmer,
  playReadyTilt,
  createDustParticles,
  removeDustParticles,
  playLuxoBounce,
  animateProgressStep,
  setPersonaColor,
  dispose,
};

