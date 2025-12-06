/**
 * Thinking Indicator UI - Apple/Siri + Pixar inspired ✨
 * 
 * Instead of a separate indicator that causes layout shift,
 * thinking state is shown on the avatar itself:
 * - Pulsing ring glow around the avatar
 * - Small floating indicator below (absolutely positioned)
 * - 🎬 WALL-E style curious head tilt animation!
 * 
 * Each persona has their own thinking style and phrases.
 * 
 * Pixar Principles Applied:
 * - ANTICIPATION: Slight wind-up before tilt
 * - SECONDARY ACTION: Eyebrow raise during think
 * - FOLLOW-THROUGH: Gentle overshoot and settle
 * - APPEAL: Curious, engaged expression
 */

import { normalizeAgentId } from '../config/personas.js';
import type { PersonaId } from '../types/persona.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ThinkingUI');

// ============================================================================
// STATE
// ============================================================================

let coachElement: HTMLElement | null = null;
let floatElement: HTMLElement | null = null;
let textElement: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let avatarContainer: HTMLElement | null = null;
let curiousTiltAnimation: Animation | null = null;

// Persona-specific thinking phrases - each character thinks differently!
// Uses canonical IDs only - normalization handles legacy aliases
const PERSONA_THINKING_MESSAGES: Record<PersonaId, string[]> = {
  // Ferni - warm, encouraging, playful
  'ferni': [
    'Hmm, let me think...',
    'Ooh, good one...',
    'Let me ponder that...',
    'Thinking...',
    'Mulling it over...',
  ],
  // Nayan Patel - wise, measured, thoughtful
  'nayan-patel': [
    'Considering carefully...',
    'Let me reflect...',
    'Thinking it through...',
    'Pondering wisely...',
    'Taking a moment...',
  ],
  // Peter John - energetic, practical
  'peter-john': [
    'Great question...',
    'Let me dig into that...',
    'Analyzing...',
    'Running the numbers...',
    'Thinking...',
  ],
  // Alex Chen - thoughtful communicator
  'alex-chen': [
    'Let me think about how to say this...',
    'Considering your perspective...',
    'Hmm, thinking...',
    'Processing that...',
    'Finding the right words...',
  ],
  // Maya Santos - practical, organized
  'maya-santos': [
    'Crunching the numbers...',
    'Let me think...',
    'Considering options...',
    'Working on it...',
    'Almost there...',
  ],
  // Jordan Taylor - creative, enthusiastic
  'jordan-taylor': [
    'Ooh, let me think...',
    'So many ideas...',
    'Brainstorming...',
    'Just a moment...',
    'Getting creative...',
  ],
};

// Default fallback messages
const DEFAULT_THINKING_MESSAGES = [
  'Thinking...',
  'Hmm...',
  'Let me think...',
  'One moment...',
  'Processing...',
];

let messageIndex = 0;
let messageInterval: ReturnType<typeof setTimeout> | null = null;
let currentPersonaId: string = 'ferni';

// Connection progress state
let progressElement: HTMLElement | null = null;
let currentStep = 0;
const CONNECTION_STEPS = ['Auth', 'Joining', 'Audio', 'Ready'];

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initThinkingUI(): void {
  // Get the coach element (avatar container parent)
  coachElement = document.getElementById('coach');
  
  // Get the avatar container for Pixar animations
  avatarContainer = document.querySelector('.avatar-container');
  
  // Get the floating indicator and its text
  floatElement = document.getElementById('thinkingFloat');
  textElement = floatElement?.querySelector('.thinking-text') ?? null;
  
  if (!coachElement) {
    log.warn('Coach element not found for thinking UI');
    return;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the thinking indicator
 * Apple-style: Adds pulsing glow to avatar + shows floating indicator
 * 🎬 Pixar-style: WALL-E curious head tilt animation
 * NO LAYOUT SHIFT - everything is absolutely positioned
 */
export function show(message?: string): void {
  if (!coachElement) return;
  
  // Clear any pending hide
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  // Set initial message with persona personality
  if (textElement) {
    const messages = getThinkingMessages();
    textElement.textContent = message ?? messages[0] ?? 'Thinking...';
  }
  
  // Add thinking class to coach - triggers ring glow + shows float
  coachElement.classList.add('is-thinking');
  
  // 🎬 Start Pixar curious tilt animation
  startCuriousTilt();
  
  // Start cycling messages if no custom message
  if (!message) {
    startMessageCycle();
  }
}

/**
 * Hide the thinking indicator
 * Smooth exit animation via CSS transitions
 * 🎬 Pixar: Settle back from curious tilt
 */
export function hide(): void {
  if (!coachElement) return;
  
  // Stop message cycling
  stopMessageCycle();
  
  // 🎬 Stop curious tilt animation with smooth settle
  stopCuriousTilt();
  
  // Remove thinking class - CSS handles the exit animation
  coachElement.classList.remove('is-thinking');
}

/**
 * Update the thinking message
 */
export function setMessage(message: string): void {
  if (textElement) {
    textElement.textContent = message;
  }
}

// ============================================================================
// PERSONA MANAGEMENT
// ============================================================================

/**
 * Set the current persona for personality-specific thinking messages
 */
export function setPersona(personaId: string): void {
  currentPersonaId = personaId;
}

/**
 * Get thinking messages for current persona
 */
function getThinkingMessages(): string[] {
  // Normalize the persona ID to handle legacy aliases
  const normalizedId = normalizeAgentId(currentPersonaId);
  return PERSONA_THINKING_MESSAGES[normalizedId] ?? DEFAULT_THINKING_MESSAGES;
}

// ============================================================================
// MESSAGE CYCLING - Persona-specific personality
// ============================================================================

function startMessageCycle(): void {
  if (messageInterval) return;
  
  messageIndex = 0;
  const messages = getThinkingMessages();
  
  // Start with a random message for variety
  messageIndex = Math.floor(Math.random() * messages.length);
  if (textElement) {
    textElement.textContent = messages[messageIndex] ?? 'Thinking...';
  }
  
  // Cycle through messages with natural timing
  const cycleMessage = () => {
    messageIndex = (messageIndex + 1) % messages.length;
    if (textElement) {
      // Fade effect for smoother transitions
      textElement.style.opacity = '0.5';
      setTimeout(() => {
        if (textElement) {
          textElement.textContent = messages[messageIndex] ?? 'Thinking...';
          textElement.style.opacity = '1';
        }
      }, 150);
    }
    
    // Schedule next change with slight randomization (1.8-2.5s)
    const nextDelay = 1800 + Math.random() * 700;
    messageInterval = setTimeout(cycleMessage, nextDelay);
  };
  
  // Start cycling after initial delay
  messageInterval = setTimeout(cycleMessage, 2200);
}

function stopMessageCycle(): void {
  if (messageInterval) {
    clearTimeout(messageInterval);
    messageInterval = null;
  }
  
  // Reset text opacity
  if (textElement) {
    textElement.style.opacity = '1';
  }
}

// ============================================================================
// 🎬 PIXAR CURIOUS TILT ANIMATION - WALL-E Style
// ============================================================================

/**
 * Start the WALL-E-inspired curious head tilt animation.
 * 
 * Pixar Principles:
 * - ANTICIPATION: Brief dip before the tilt
 * - SQUASH & STRETCH: Subtle scale during motion
 * - ARCS: Curved motion path
 * - SECONDARY ACTION: Slight sway during hold
 * - FOLLOW-THROUGH: Gentle overshoot and settle
 */
function startCuriousTilt(): void {
  if (!avatarContainer) return;
  
  // Cancel any existing animation
  if (curiousTiltAnimation) {
    curiousTiltAnimation.cancel();
  }
  
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Persona-specific tilt intensity (some personas are more curious than others)
  const tiltIntensity = getCuriousTiltIntensity();
  
  // WALL-E curious tilt keyframes
  // Like WALL-E examining something interesting
  const keyframes: Keyframe[] = [
    // Start: Neutral
    { 
      transform: 'rotate(0deg) scale(1, 1)',
      offset: 0,
    },
    // Anticipation: Slight dip and squash
    { 
      transform: `rotate(${-tiltIntensity.angle * 0.2}deg) scale(1.005, 0.995) translateY(1px)`,
      offset: 0.1,
    },
    // Main tilt with stretch
    { 
      transform: `rotate(${tiltIntensity.angle}deg) scale(0.995, 1.005) translateY(-2px)`,
      offset: 0.35,
    },
    // Overshoot (follow-through)
    { 
      transform: `rotate(${tiltIntensity.angle * 1.15}deg) scale(0.998, 1.002) translateY(-2.5px)`,
      offset: 0.45,
    },
    // Settle to hold position
    { 
      transform: `rotate(${tiltIntensity.angle}deg) scale(1, 1) translateY(-2px)`,
      offset: 0.55,
    },
    // Subtle sway during "thinking" hold (secondary action)
    { 
      transform: `rotate(${tiltIntensity.angle * 0.92}deg) scale(1, 1) translateY(-1.8px)`,
      offset: 0.7,
    },
    { 
      transform: `rotate(${tiltIntensity.angle * 1.05}deg) scale(1, 1) translateY(-2.2px)`,
      offset: 0.85,
    },
    // Return to slight tilt (ready to continue or exit)
    { 
      transform: `rotate(${tiltIntensity.angle * 0.98}deg) scale(1, 1) translateY(-2px)`,
      offset: 1,
    },
  ];
  
  curiousTiltAnimation = avatarContainer.animate(keyframes, {
    duration: tiltIntensity.duration,
    iterations: Infinity,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Bouncy spring feel
    fill: 'forwards',
  });
}

/**
 * Stop the curious tilt animation with a smooth settle back.
 * Like WALL-E straightening up when done examining.
 */
function stopCuriousTilt(): void {
  if (!avatarContainer || !curiousTiltAnimation) return;
  
  // Get current transform to animate FROM
  const computedStyle = getComputedStyle(avatarContainer);
  const currentTransform = computedStyle.transform || 'none';
  
  // Cancel the looping animation
  curiousTiltAnimation.cancel();
  curiousTiltAnimation = null;
  
  // Animate back to neutral with follow-through
  // Check for reduced motion first
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    avatarContainer.style.transform = '';
    return;
  }
  
  const settleKeyframes: Keyframe[] = [
    { transform: currentTransform, offset: 0 },
    // Slight overshoot past neutral
    { transform: 'rotate(-0.8deg) scale(1.002, 0.998) translateY(0.5px)', offset: 0.4 },
    // Bounce back
    { transform: 'rotate(0.3deg) scale(0.999, 1.001) translateY(-0.2px)', offset: 0.7 },
    // Settle to neutral
    { transform: 'rotate(0deg) scale(1, 1) translateY(0px)', offset: 1 },
  ];
  
  const settleAnimation = avatarContainer.animate(settleKeyframes, {
    duration: 400,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fill: 'forwards',
  });
  
  // Clear transform after animation
  settleAnimation.onfinish = () => {
    if (avatarContainer) {
      avatarContainer.style.transform = '';
    }
  };
}

/**
 * Get persona-specific curious tilt parameters.
 * Each persona expresses curiosity differently!
 */
function getCuriousTiltIntensity(): { angle: number; duration: number } {
  // Persona-specific curiosity expressions
  const personaTilts: Record<string, { angle: number; duration: number }> = {
    // Ferni - playful, expressive curiosity
    'ferni': { angle: 4.5, duration: 3200 },
    'jack-b': { angle: 4.5, duration: 3200 },
    
    // Nayan Patel - subtle, wise contemplation
    'nayan-patel': { angle: 2.5, duration: 4000 },
    
    // Peter Lynch - eager, quick curiosity
    'peter-john': { angle: 5, duration: 2600 },
    
    // Alex Chen - thoughtful, measured tilt
    'alex-chen': { angle: 3.5, duration: 3500 },
    'comm-specialist': { angle: 3.5, duration: 3500 },
    
    // Maya Santos - practical, focused
    'maya-santos': { angle: 3, duration: 3000 },
    'spend-save': { angle: 3, duration: 3000 },
    
    // Jordan Taylor - enthusiastic, bouncy
    'jordan-taylor': { angle: 5.5, duration: 2800 },
    'event-planner': { angle: 5.5, duration: 2800 },
  };
  
  return personaTilts[currentPersonaId] ?? { angle: 4, duration: 3200 };
}

// ============================================================================
// CONNECTION PROGRESS - Apple-style step indicator
// ============================================================================

/**
 * Show connection progress with step indicator
 */
export function showProgress(step: number = 0): void {
  if (!floatElement) return;

  currentStep = step;

  // Create progress element if not exists
  if (!progressElement) {
    progressElement = document.createElement('div');
    progressElement.className = 'connection-progress';
    progressElement.innerHTML = CONNECTION_STEPS.map((_, i) =>
      `<div class="connection-step" data-step="${i}"></div>`
    ).join('');
    progressElement.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 8px;
    `;
    floatElement.appendChild(progressElement);
  }

  // Update step states
  const steps = progressElement.querySelectorAll('.connection-step');
  steps.forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i < step) {
      el.classList.add('completed');
    } else if (i === step) {
      el.classList.add('active');
    }
  });

  // Update message to match step
  if (textElement && step < CONNECTION_STEPS.length) {
    const stepMessages = ['Authenticating...', 'Joining room...', 'Connecting audio...', 'Almost ready...'];
    textElement.textContent = stepMessages[step] ?? 'Connecting...';
  }
}

/**
 * Advance to next connection step
 */
export function nextStep(): void {
  showProgress(currentStep + 1);
}

/**
 * Hide connection progress
 */
export function hideProgress(): void {
  if (progressElement) {
    progressElement.remove();
    progressElement = null;
  }
  currentStep = 0;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  stopMessageCycle();
  stopCuriousTilt();
  hideProgress();

  coachElement = null;
  floatElement = null;
  textElement = null;
  avatarContainer = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const thinkingUI = {
  init: initThinkingUI,
  show,
  hide,
  setMessage,
  setPersona,
  showProgress,
  nextStep,
  hideProgress,
  dispose,
};
