/**
 * Presence UI - Avatar breathing and life effects
 * 
 * Makes the avatar feel alive with:
 * - Subtle breathing animation
 * - Ambient glow pulsing
 * - Eye-tracking effect (follows cursor)
 * - Reaction animations
 */

// ============================================================================
// STATE
// ============================================================================

let avatarElement: HTMLElement | null = null;
let avatarContainer: HTMLElement | null = null;
let isConnected = false;
let isSpeaking = false;
let isListening = false;
let animationId: number | null = null;
let lastMouseX = 0;
let lastMouseY = 0;

// Animation parameters
const BREATHING_SPEED = 0.001;  // Slower for subtle effect
// GLOW_INTENSITY is controlled via CSS --presence-glow variable
const EYE_TRACK_STRENGTH = 5;   // Max pixels offset
const SMOOTHING = 0.1;

// Current animation state
let breathPhase = 0;
let currentOffsetX = 0;
let currentOffsetY = 0;
let currentGlow = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initPresenceUI(): void {
  avatarElement = document.getElementById('coachAvatar');
  avatarContainer = document.querySelector('.avatar-container');
  
  if (!avatarElement) {
    console.warn('Avatar element not found');
    return;
  }
  
  // Track mouse for eye-tracking effect
  document.addEventListener('mousemove', handleMouseMove);
  
  // Start ambient animation
  startAnimation();
  
  console.log('💫 Presence UI initialized');
}

// ============================================================================
// MOUSE TRACKING
// ============================================================================

function handleMouseMove(e: MouseEvent): void {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

// ============================================================================
// ANIMATION
// ============================================================================

function startAnimation(): void {
  if (animationId !== null) return;
  
  const animate = (timestamp: number) => {
    // Update breathing phase
    breathPhase = timestamp * BREATHING_SPEED;
    
    // Calculate breathing scale
    const breathScale = 1 + Math.sin(breathPhase) * 0.008;
    
    // Calculate glow intensity
    const targetGlow = isConnected 
      ? (isSpeaking ? 0.4 : isListening ? 0.25 : 0.15)
      : 0.08;
    currentGlow += (targetGlow - currentGlow) * 0.05;
    const glowPulse = currentGlow + Math.sin(breathPhase * 1.5) * 0.03;
    
    // Calculate eye-tracking offset (subtle)
    if (avatarElement) {
      const rect = avatarElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = lastMouseX - centerX;
      const dy = lastMouseY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Normalize and limit
      const maxDistance = 500;
      const normalizedDistance = Math.min(distance / maxDistance, 1);
      
      const targetOffsetX = (dx / distance || 0) * EYE_TRACK_STRENGTH * normalizedDistance;
      const targetOffsetY = (dy / distance || 0) * EYE_TRACK_STRENGTH * normalizedDistance * 0.5;
      
      // Smooth transition
      currentOffsetX += (targetOffsetX - currentOffsetX) * SMOOTHING;
      currentOffsetY += (targetOffsetY - currentOffsetY) * SMOOTHING;
    }
    
    // Apply transforms
    if (avatarContainer) {
      avatarContainer.style.transform = `
        scale(${breathScale})
        translate(${currentOffsetX}px, ${currentOffsetY}px)
      `;
    }
    
    // Apply glow
    if (avatarElement) {
      avatarElement.style.setProperty('--presence-glow', String(glowPulse));
    }
    
    animationId = requestAnimationFrame(animate);
  };
  
  animationId = requestAnimationFrame(animate);
}

function stopAnimation(): void {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

// ============================================================================
// STATE UPDATES
// ============================================================================

export function setConnected(connected: boolean): void {
  isConnected = connected;
  
  if (avatarElement) {
    avatarElement.classList.toggle('presence-connected', connected);
  }
}

export function setSpeaking(speaking: boolean): void {
  isSpeaking = speaking;
  
  if (avatarElement) {
    avatarElement.classList.toggle('presence-speaking', speaking);
  }
}

export function setListening(listening: boolean): void {
  isListening = listening;
  
  if (avatarElement) {
    avatarElement.classList.toggle('presence-listening', listening);
  }
}

// ============================================================================
// REACTIONS
// ============================================================================

/**
 * Trigger a reaction animation
 */
export function react(type: 'nod' | 'shake' | 'bounce' | 'pulse'): void {
  if (!avatarContainer) return;
  
  // Remove any existing reaction class
  avatarContainer.classList.remove('react-nod', 'react-shake', 'react-bounce', 'react-pulse');
  
  // Force reflow
  void avatarContainer.offsetWidth;
  
  // Add new reaction
  avatarContainer.classList.add(`react-${type}`);
  
  // Remove after animation
  setTimeout(() => {
    avatarContainer?.classList.remove(`react-${type}`);
  }, 500);
}

/**
 * Nod animation (agreement)
 */
export function nod(): void {
  react('nod');
}

/**
 * Shake animation (disagreement)
 */
export function shake(): void {
  react('shake');
}

/**
 * Bounce animation (excitement)
 */
export function bounce(): void {
  react('bounce');
}

/**
 * Pulse animation (attention)
 */
export function pulse(): void {
  react('pulse');
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  stopAnimation();
  document.removeEventListener('mousemove', handleMouseMove);
  
  // Reset transforms
  if (avatarContainer) {
    avatarContainer.style.transform = '';
  }
  
  avatarElement = null;
  avatarContainer = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const presenceUI = {
  init: initPresenceUI,
  setConnected,
  setSpeaking,
  setListening,
  react,
  nod,
  shake,
  bounce,
  pulse,
  dispose,
};

