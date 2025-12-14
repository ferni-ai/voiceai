/**
 * Ferni Splash Screen - Animated Three Stones Logo Introduction
 * 
 * A beautiful splash screen that animates the logo on app load.
 * The eye "opens" and looks around before the app reveals.
 * 
 * @example
 * import { showSplashScreen } from './ui/splash-screen.ui.js';
 * 
 * // Show splash on app load
 * await showSplashScreen();
 * // App content reveals after animation
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('SplashScreen');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// CONSTANTS
// ============================================================================

const SPLASH_ID = 'ferni-splash-screen';

// Note: These colors are CSS variable fallbacks for the splash screen,
// which may render before the design system is fully loaded.
// The values should match tokens.css: --color-background-primary, etc.
const COLORS = {
  background: 'var(--color-background-primary, #F5F1E8)',
  sage: 'var(--persona-primary, #4a6741)',
  sageLight: 'var(--persona-secondary, #5a8060)',
  ink: 'var(--color-text-primary, #2c2520)',
  white: 'var(--color-background-elevated, #ffffff)',
};

// ============================================================================
// SPLASH SCREEN
// ============================================================================

/**
 * Show the animated splash screen
 * Returns a promise that resolves when animation completes
 */
export async function showSplashScreen(): Promise<void> {
  log.info('Showing splash screen');
  
  // Create splash container
  const splash = document.createElement('div');
  splash.id = SPLASH_ID;
  splash.innerHTML = getSplashHTML();
  splash.style.cssText = getSplashStyles();
  
  document.body.prepend(splash);
  
  // Run the animation sequence
  await runSplashAnimation(splash);
  
  // Fade out and remove
  await fadeOutSplash(splash);
  
  log.info('Splash screen complete');
}

/**
 * Check if splash screen is currently showing
 */
export function isSplashActive(): boolean {
  return document.getElementById(SPLASH_ID) !== null;
}

/**
 * Force hide splash screen (for error recovery)
 */
export function hideSplash(): void {
  const splash = document.getElementById(SPLASH_ID);
  if (splash) {
    splash.remove();
  }
}

// ============================================================================
// ANIMATION SEQUENCE
// ============================================================================

async function runSplashAnimation(container: HTMLElement): Promise<void> {
  const logo = container.querySelector('.splash-logo') as SVGSVGElement;
  const eyeGroup = logo?.querySelector('.eye-group') as SVGGElement;
  const pupilGroup = logo?.querySelector('.pupil-group') as SVGGElement;
  const tagline = container.querySelector('.splash-tagline') as HTMLElement;
  
  if (!logo || !eyeGroup || !pupilGroup) {
    log.warn('Splash elements not found');
    return;
  }
  
  // Phase 1: Logo scales in with spring bounce (0-600ms)
  await animatePhase(logo, [
    { transform: 'scale(0.5)', opacity: 0 },
    { transform: 'scale(1.1)', opacity: 1, offset: 0.6 },
    { transform: 'scale(1)', opacity: 1 },
  ], 600, EASING.SPRING);
  
  // Phase 2: Eye "wakes up" - pupil dilates and looks around (600-1600ms)
  // Runs in parallel with Phase 2b (void marks this as intentional fire-and-forget)
  void animatePhase(pupilGroup, [
    { transform: 'scale(1)' },
    { transform: 'scale(0.8)', offset: 0.2 },  // Dilate
    { transform: 'scale(1) translateX(4px)', offset: 0.4 },  // Look right
    { transform: 'scale(1) translateX(-4px)', offset: 0.6 },  // Look left
    { transform: 'scale(1) translateY(-2px)', offset: 0.8 },  // Look up
    { transform: 'scale(1)' },  // Center
  ], 1000, EASING.GENTLE);
  
  // Phase 2b: Subtle eye bounce (parallel)
  await animatePhase(eyeGroup, [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-3px)', offset: 0.3 },
    { transform: 'translateY(0)', offset: 0.6 },
    { transform: 'translateY(-2px)', offset: 0.8 },
    { transform: 'translateY(0)' },
  ], 1000, EASING.GENTLE);
  
  // Phase 3: Tagline fades in (1600-2200ms)
  if (tagline) {
    await animatePhase(tagline, [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], 600, EASING.GENTLE);
  }
  
  // Hold for a moment
  await sleep(300);
}

async function fadeOutSplash(container: HTMLElement): Promise<void> {
  await animatePhase(container, [
    { opacity: 1 },
    { opacity: 0 },
  ], DURATION.SLOW, EASING.GENTLE);
  
  container.remove();
}

// ============================================================================
// HELPERS
// ============================================================================

function animatePhase(
  element: Element,
  keyframes: Keyframe[],
  duration: number,
  easing: string
): Promise<void> {
  return new Promise((resolve) => {
    const animation = element.animate(keyframes, {
      duration,
      easing,
      fill: 'forwards',
    });
    animation.onfinish = () => resolve();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => trackedTimeout(resolve, ms));
}

// ============================================================================
// HTML & STYLES
// ============================================================================

function getSplashHTML(): string {
  return `
    <div class="splash-content">
      <svg class="splash-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <!-- Outer Stone -->
        <circle cx="50" cy="50" r="45" fill="${COLORS.sage}"/>
        
        <!-- Eye Group -->
        <g class="eye-group">
          <circle cx="50" cy="50" r="18" fill="${COLORS.white}"/>
          <circle cx="50" cy="50" r="12" fill="${COLORS.sageLight}"/>
          
          <!-- Pupil Group -->
          <g class="pupil-group">
            <circle cx="50" cy="50" r="6" fill="${COLORS.ink}"/>
            <circle cx="47" cy="47" r="2" fill="${COLORS.white}" opacity="0.9"/>
          </g>
        </g>
      </svg>
      
      <p class="splash-tagline">Your AI team is ready</p>
    </div>
  `;
}

function getSplashStyles(): string {
  return `
    position: fixed;
    inset: 0;
    z-index: var(--z-system);
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${COLORS.background};
  `;
}

// Add component styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  #${SPLASH_ID} .splash-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  
  #${SPLASH_ID} .splash-logo {
    width: 120px;
    height: 120px;
  }
  
  #${SPLASH_ID} .splash-logo .eye-group {
    transform-origin: 50px 50px;
  }
  
  #${SPLASH_ID} .splash-logo .pupil-group {
    transform-origin: 50px 50px;
  }
  
  #${SPLASH_ID} .splash-tagline {
    font-family: var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif);
    font-size: var(--text-lg, 1.125rem);
    font-weight: var(--font-weight-medium, 500);
    line-height: var(--leading-snug, 1.375);
    color: ${COLORS.ink};
    opacity: 0;
    margin: 0;
  }
  
  @media (prefers-reduced-motion: reduce) {
    #${SPLASH_ID} .splash-logo,
    #${SPLASH_ID} .splash-tagline {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }
`;
document.head.appendChild(styleSheet);

// ============================================================================
// EXPORTS
// ============================================================================

export default showSplashScreen;

