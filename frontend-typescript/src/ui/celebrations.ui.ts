/**
 * Celebrations UI - Human-like Joy and Expressiveness
 * 
 * Apple/Japanese aesthetic: Subtle warmth, breathing animations,
 * and purposeful motion that feels alive rather than gamified.
 * 
 * Key principles:
 * - No particle explosions or confetti
 * - Warmth through glow and color temperature
 * - Breathing through scale and opacity
 * - Connection through soft bounces
 */

// ============================================================================
// TYPES
// ============================================================================

type CelebrationIntensity = 'subtle' | 'gentle' | 'warm';

interface WarmthOptions {
  intensity?: CelebrationIntensity;
  duration?: number;
  target?: HTMLElement | null;
}

// ============================================================================
// STATE
// ============================================================================

const activeAnimations: Map<HTMLElement, Animation[]> = new Map();

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initCelebrationsUI(): void {
}

// ============================================================================
// CORE EFFECTS - Human-like warmth and breathing
// ============================================================================

/**
 * Express warmth through a soft glow animation.
 * Like a candle flickering or warm sunlight.
 */
export function warmthGlow(options: WarmthOptions = {}): void {
  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;
  
  const intensity = options.intensity ?? 'gentle';
  const duration = options.duration ?? (intensity === 'subtle' ? 800 : intensity === 'gentle' ? 1200 : 1500);
  
  // Add animation class
  target.classList.add('warmth-glow', `warmth-${intensity}`);
  
  // Clean up after animation
  setTimeout(() => {
    target.classList.remove('warmth-glow', `warmth-${intensity}`);
  }, duration);
}

/**
 * Express acknowledgement through gentle bounce.
 * Like a nod or bow - understated recognition.
 */
export function gentleBounce(options: WarmthOptions = {}): void {
  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;
  
  target.classList.add('gentle-bounce');
  
  setTimeout(() => {
    target.classList.remove('gentle-bounce');
  }, 600);
}

/**
 * Express connection through warmth spreading outward.
 * Like the feeling of being understood.
 */
export function connectionWarmth(options: WarmthOptions = {}): void {
  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;
  
  target.classList.add('connection-warmth');
  
  setTimeout(() => {
    target.classList.remove('connection-warmth');
  }, 1500);
}

/**
 * Soft acknowledgement - barely perceptible but felt.
 * For small moments of connection.
 */
export function softAcknowledge(options: WarmthOptions = {}): void {
  const target = options.target ?? document.querySelector('.avatar-container');
  if (!target) return;
  
  target.classList.add('soft-acknowledge');
  
  setTimeout(() => {
    target.classList.remove('soft-acknowledge');
  }, 400);
}

// ============================================================================
// LEGACY API - Maintained for compatibility but redirected to zen effects
// ============================================================================

/**
 * @deprecated Use warmthGlow() instead - confetti is not aligned with zen aesthetic
 */
export function confetti(_options: { 
  count?: number; 
  origin?: { x: number; y: number };
  spread?: number;
  colors?: string[];
} = {}): void {
  // Redirect to warmth glow
  warmthGlow({ intensity: 'gentle' });
}

/**
 * @deprecated Use warmthGlow() instead - sparkles replaced with warmth
 */
export function sparkles(_options: {
  count?: number;
  origin?: { x: number; y: number };
  radius?: number;
  colors?: string[];
} = {}): void {
  // Redirect to warmth glow
  warmthGlow({ intensity: 'gentle' });
}

/**
 * @deprecated Use connectionWarmth() instead
 */
export function firework(_x: number, _y: number, _color?: string): void {
  connectionWarmth();
}

/**
 * @deprecated Use connectionWarmth() instead
 */
export function fireworks(_count = 3): void {
  connectionWarmth();
}

/**
 * @deprecated Use softAcknowledge() instead
 */
export function bubbles(_options: {
  count?: number;
  colors?: string[];
} = {}): void {
  softAcknowledge();
}

// ============================================================================
// MILESTONE CELEBRATIONS - Warm acknowledgements, not explosions
// ============================================================================

/**
 * First connection - warm welcome, not a party.
 */
export function celebrateFirstConnection(): void {
  connectionWarmth();
  
  // Also add a subtle glow to the app
  const app = document.getElementById('app');
  if (app) {
    app.classList.add('first-connection');
    setTimeout(() => app.classList.remove('first-connection'), 2000);
  }
}

/**
 * Milestone achieved - gentle acknowledgement with message.
 */
export function celebrateMilestone(milestone: string): void {
  warmthGlow({ intensity: 'warm' });
  showMilestoneToast(milestone);
}

/**
 * Discovery moment - soft recognition.
 */
export function celebrateDiscovery(): void {
  gentleBounce();
  warmthGlow({ intensity: 'subtle' });
}

/**
 * Milestone celebration - avatar-based (no text toast).
 * The avatar shows success through its behavior.
 */
function showMilestoneToast(_message: string): void {
  // Avatar feedback - joy reaction with warm glow
  const avatar = document.getElementById('coachAvatar');
  const avatarRing = document.getElementById('avatarRing');
  
  if (avatar) {
    // Joy animation - bouncy and warm
    avatar.animate([
      { transform: 'scale(1) translateY(0)', filter: 'brightness(1)' },
      { transform: 'scale(1.04) translateY(-4px)', filter: 'brightness(1.1)' },
      { transform: 'scale(0.98) translateY(1px)', filter: 'brightness(1.05)' },
      { transform: 'scale(1.02) translateY(-2px)', filter: 'brightness(1.08)' },
      { transform: 'scale(1) translateY(0)', filter: 'brightness(1)' },
    ], { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  }
  
  if (avatarRing) {
    // Ring celebration pulse
    avatarRing.animate([
      { opacity: '0.6', transform: 'scale(1)', boxShadow: '0 0 0 transparent' },
      { opacity: '0.9', transform: 'scale(1.05)', boxShadow: '0 0 15px var(--persona-glow)' },
      { opacity: '0.7', transform: 'scale(1)', boxShadow: '0 0 8px var(--persona-glow)' },
    ], { duration: 800, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  // Clear any active animation classes
  const elements = document.querySelectorAll('.warmth-glow, .gentle-bounce, .connection-warmth, .soft-acknowledge');
  elements.forEach(el => {
    el.classList.remove('warmth-glow', 'gentle-bounce', 'connection-warmth', 'soft-acknowledge');
  });
  
  activeAnimations.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const celebrationsUI = {
  init: initCelebrationsUI,
  // New zen API
  warmthGlow,
  gentleBounce,
  connectionWarmth,
  softAcknowledge,
  // Legacy API (redirects to zen effects)
  confetti,
  sparkles,
  firework,
  fireworks,
  bubbles,
  // Milestones
  celebrateFirstConnection,
  celebrateMilestone,
  celebrateDiscovery,
  dispose,
};
