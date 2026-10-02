/**
 * Avatar Sidekicks - Expressive Side Companions
 * 
 * Small floating icons that appear BESIDE Ferni's avatar (not over it).
 * Think of these as "props" or "gestures" - like Ferni holding a coffee cup,
 * showing a lightbulb for an idea, or hearts drifting beside her.
 * 
 * DESIGN PHILOSOPHY:
 * ==================
 * Instead of covering Ferni's face/eyes with icons (which was "too much"),
 * these sidekicks float alongside her - like expressive hands or accessories.
 * 
 * - Coffee cup floating beside her in the morning
 * - Lightbulb appearing when she has an idea
 * - Musical notes drifting when discussing music
 * - Hearts floating during empathetic moments
 * - Sparkles dancing beside her during celebrations
 * 
 * ANIMATION PRINCIPLES:
 * ====================
 * 1. ENTRANCE: Icons float in from the side with gentle spring
 * 2. IDLE: Subtle bobbing/floating motion (breathing)
 * 3. EXIT: Fade and drift away naturally
 * 
 * POSITIONING:
 * ============
 * Icons appear in "slots" around the avatar:
 * - LEFT: Primary expressive slot (like left hand)
 * - RIGHT: Secondary slot (like right hand)
 * - Can show 1-2 icons at once for richness
 * 
 * Brand compliant: NO emojis - uses Lucide SVG icons only
 */

import { gsap } from '../utils/gsap-setup.js';
import { DURATION } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { SIDEKICK_ICONS } from './avatar-sidekick-icons.js';

const log = createLogger('AvatarSidekicks');

// GSAP helper
const toSeconds = (ms: number) => ms / 1000;

export type SidekickIcon = keyof typeof SIDEKICK_ICONS;
export type SidekickPosition = 'left' | 'right' | 'both';

// ============================================================================
// TYPES
// ============================================================================

interface SidekickConfig {
  icon: SidekickIcon;
  position?: SidekickPosition;
  duration?: number;       // How long to show (ms)
  color?: string;          // CSS color variable
  size?: 'sm' | 'md' | 'lg';
  animation?: 'float' | 'pulse' | 'bounce' | 'spin';
}

interface ActiveSidekick {
  element: HTMLElement;
  position: 'left' | 'right';
  timeline: gsap.core.Timeline;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let leftSlot: HTMLElement | null = null;
let rightSlot: HTMLElement | null = null;
let activeSidekicks: ActiveSidekick[] = [];
let isInitialized = false;
let eventAbortController: AbortController | null = null;

const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the sidekicks system.
 * Creates the side slots around the avatar.
 */
export function initAvatarSidekicks(): void {
  if (isInitialized) return;
  
  // HMR protection
  cleanupOrphanedElements();
  
  injectStyles();
  createContainer();
  setupEventListeners();
  
  isInitialized = true;
  log.info('Avatar sidekicks initialized');
}

/**
 * Clean up orphaned elements from HMR hot reloads.
 */
function cleanupOrphanedElements(): void {
  document.querySelectorAll('.avatar-sidekicks-container').forEach(el => el.remove());
  document.querySelectorAll('.sidekick-slot').forEach(el => el.remove());
  document.querySelectorAll('.sidekick-icon').forEach(el => el.remove());
}

/**
 * Create the sidekick container and slots.
 */
function createContainer(): void {
  const coach = document.getElementById('coach');
  const avatarContainer = coach?.querySelector('.avatar-container') as HTMLElement | null;
  
  if (!coach || !avatarContainer) {
    log.debug('Avatar container not found');
    return;
  }
  
  // Create main container INSIDE the avatar-container so it inherits its position
  container = document.createElement('div');
  container.className = 'avatar-sidekicks-container';
  container.setAttribute('aria-hidden', 'true');
  
  // Create left and right slots
  leftSlot = document.createElement('div');
  leftSlot.className = 'sidekick-slot sidekick-slot--left';
  
  rightSlot = document.createElement('div');
  rightSlot.className = 'sidekick-slot sidekick-slot--right';
  
  container.appendChild(leftSlot);
  container.appendChild(rightSlot);
  
  // Insert INSIDE avatar-container as a child
  // This way our absolute positioning works relative to the avatar
  avatarContainer.appendChild(container);
  
  log.debug('Sidekick container created');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show a sidekick icon beside the avatar.
 * 
 * @example
 * // Morning coffee sidekick
 * showSidekick({ icon: 'coffee', position: 'right', duration: 3000 });
 * 
 * // Idea moment with lightbulb
 * showSidekick({ icon: 'lightbulb', position: 'left', animation: 'bounce' });
 */
export function showSidekick(config: SidekickConfig): void {
  if (!isInitialized) initAvatarSidekicks();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
  const {
    icon,
    position = 'right',
    duration = 2500,
    color = 'var(--persona-primary, #4a6741)',
    size = 'md',
    animation = 'float',
  } = config;
  
  // Determine which slots to use
  const positions: ('left' | 'right')[] = position === 'both' 
    ? ['left', 'right'] 
    : [position];
  
  positions.forEach((pos, index) => {
    // Clear any existing sidekick in this slot
    clearSlot(pos);
    
    // Create and animate the sidekick
    const delay = position === 'both' ? index * 100 : 0;
    trackedTimeout(() => {
      createSidekick(icon, pos, duration, color, size, animation);
    }, delay);
  });
  
  log.debug('Sidekick shown:', icon, position);
}

/**
 * Show a pair of sidekicks (left and right) for emphasis.
 */
export function showSidekickPair(
  leftIcon: SidekickIcon, 
  rightIcon: SidekickIcon,
  duration = 2500
): void {
  showSidekick({ icon: leftIcon, position: 'left', duration });
  trackedTimeout(() => {
    showSidekick({ icon: rightIcon, position: 'right', duration: duration - 100 });
  }, 100);
}

/**
 * Clear all active sidekicks.
 */
export function clearAllSidekicks(): void {
  activeSidekicks.forEach(sidekick => {
    sidekick.timeline.kill();
    sidekick.element.remove();
  });
  activeSidekicks = [];
}

/**
 * Clear sidekick from a specific slot.
 */
function clearSlot(position: 'left' | 'right'): void {
  const existing = activeSidekicks.find(s => s.position === position);
  if (existing) {
    existing.timeline.kill();
    existing.element.remove();
    activeSidekicks = activeSidekicks.filter(s => s !== existing);
  }
}

// ============================================================================
// SIDEKICK CREATION & ANIMATION
// ============================================================================

/**
 * Create and animate a sidekick icon.
 */
function createSidekick(
  icon: SidekickIcon,
  position: 'left' | 'right',
  duration: number,
  color: string,
  size: 'sm' | 'md' | 'lg',
  animation: string
): void {
  const slot = position === 'left' ? leftSlot : rightSlot;
  if (!slot) {
    log.warn('Slot not found for position:', position);
    return;
  }
  
  const iconSvg = SIDEKICK_ICONS[icon];
  if (!iconSvg) {
    log.warn('Unknown sidekick icon:', icon);
    return;
  }
  
  // Size mapping - larger for visibility beside the avatar
  const sizeMap = { sm: 24, md: 32, lg: 40 };
  const iconSize = sizeMap[size];
  
  // Create sidekick element
  const sidekick = document.createElement('div');
  sidekick.className = `sidekick-icon sidekick-icon--${position} sidekick-icon--${size}`;
  sidekick.innerHTML = iconSvg;
  sidekick.style.cssText = `
    color: ${color};
    width: ${iconSize}px;
    height: ${iconSize}px;
    opacity: 0;
    transform: scale(0) translateY(10px);
  `;
  
  // Style the SVG
  const svg = sidekick.querySelector('svg');
  if (svg) {
    svg.style.width = '100%';
    svg.style.height = '100%';
  }
  
  slot.appendChild(sidekick);
  
  // Create animation timeline
  const tl = gsap.timeline({
    onComplete: () => {
      // Remove from active list when animation completes
      activeSidekicks = activeSidekicks.filter(s => s.element !== sidekick);
      sidekick.remove();
    }
  });
  
  // Track this sidekick
  activeSidekicks.push({ element: sidekick, position, timeline: tl });
  
  // === ENTRANCE ===
  // Float in from the side with spring physics
  const entranceX = position === 'left' ? -15 : 15;
  tl.set(sidekick, { 
    x: entranceX, 
    opacity: 0, 
    scale: 0.5,
    y: 8
  });
  
  tl.to(sidekick, {
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
    duration: toSeconds(DURATION.SLOW),
    ease: 'back.out(1.4)',
  });
  
  // === IDLE ANIMATION ===
  // Subtle movement while visible
  const idleDuration = duration - DURATION.SLOW - DURATION.NORMAL;
  
  switch (animation) {
    case 'float':
      // Gentle floating bob
      tl.to(sidekick, {
        y: -5,
        duration: toSeconds(idleDuration / 4),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 3,
      });
      break;
      
    case 'pulse':
      // Soft pulsing
      tl.to(sidekick, {
        scale: 1.1,
        duration: toSeconds(idleDuration / 6),
        ease: 'power2.inOut',
        yoyo: true,
        repeat: 5,
      });
      break;
      
    case 'bounce':
      // Playful bounce
      tl.to(sidekick, {
        y: -8,
        duration: toSeconds(DURATION.FAST),
        ease: 'power2.out',
      })
      .to(sidekick, {
        y: 0,
        duration: toSeconds(DURATION.FAST),
        ease: 'bounce.out',
        repeat: Math.floor(idleDuration / (DURATION.FAST * 2)) - 1,
        repeatDelay: toSeconds(DURATION.FAST),
      });
      break;
      
    case 'spin':
      // Gentle rotation
      tl.to(sidekick, {
        rotation: 360,
        duration: toSeconds(idleDuration),
        ease: 'none',
      });
      break;
      
    default:
      // Just hold with tiny micro-movements
      tl.to(sidekick, {
        y: -2,
        rotation: position === 'left' ? 3 : -3,
        duration: toSeconds(idleDuration),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 1,
      });
  }
  
  // === EXIT ===
  // Float away and fade
  tl.to(sidekick, {
    x: position === 'left' ? -20 : 20,
    y: -15,
    opacity: 0,
    scale: 0.6,
    rotation: position === 'left' ? -15 : 15,
    duration: toSeconds(DURATION.NORMAL),
    ease: 'power2.in',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Time of Day
// ============================================================================

/**
 * Show time-appropriate sidekick based on current hour.
 */
export function showTimeOfDaySidekick(): void {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 8) {
    // Early morning - sunrise
    showSidekick({ 
      icon: 'sunrise', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'float'
    });
  } else if (hour >= 8 && hour < 11) {
    // Morning - coffee
    showSidekick({ 
      icon: 'coffee', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-text-secondary, #9a7b5a)',
      animation: 'float'
    });
  } else if (hour >= 11 && hour < 17) {
    // Day - sunshine
    showSidekick({ 
      icon: 'sun', 
      position: 'right',
      duration: 2500,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'pulse'
    });
  } else if (hour >= 17 && hour < 19) {
    // Evening - sunset
    showSidekick({ 
      icon: 'sunset', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'float'
    });
  } else if (hour >= 19 && hour < 21) {
    // Late evening - cozy flame
    showSidekick({ 
      icon: 'flame', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-semantic-warning, #c4856a)',
      animation: 'float'
    });
  } else {
    // Night - moon
    showSidekick({ 
      icon: 'moon', 
      position: 'right',
      duration: 3000,
      color: 'var(--color-text-muted, #5a6b8a)',
      animation: 'float'
    });
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Emotional
// ============================================================================

/**
 * Show a lightbulb for "aha" moments.
 */
export function showIdea(): void {
  showSidekick({
    icon: 'lightbulb',
    position: 'left',
    duration: 2000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

/**
 * Show hearts for empathetic/loving moments.
 */
export function showLove(): void {
  showSidekick({
    icon: 'heart',
    position: 'right',
    duration: 2500,
    color: 'var(--color-semantic-error, #a67a6a)',
    animation: 'float',
  });
}

/**
 * Show sparkles for celebration.
 */
export function showCelebration(): void {
  showSidekickPair('sparkles', 'star', 2500);
}

/**
 * Show music notes when discussing music/playlists.
 */
export function showMusic(): void {
  showSidekick({
    icon: 'music',
    position: 'left',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

/**
 * Show thinking/brain for contemplative moments.
 */
export function showThinking(): void {
  showSidekick({
    icon: 'brain',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-secondary)',
    animation: 'pulse',
  });
}

/**
 * Show wave hand for greetings.
 */
export function showWave(): void {
  showSidekick({
    icon: 'hand',
    position: 'right',
    duration: 2000,
    color: 'var(--persona-primary)',
    animation: 'bounce',
    size: 'lg',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Activities
// ============================================================================

/**
 * Show reading/book icon for learning moments.
 */
export function showReading(): void {
  showSidekick({
    icon: 'bookOpen',
    position: 'left',
    duration: 3000,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

/**
 * Show headphones for music listening.
 */
export function showListening(): void {
  showSidekick({
    icon: 'headphones',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'pulse',
  });
}

/**
 * Show yoga for wellness/mindfulness.
 */
export function showWellness(): void {
  showSidekick({
    icon: 'yoga',
    position: 'left',
    duration: 3000,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

/**
 * Show art palette for creative moments.
 */
export function showCreative(): void {
  showSidekick({
    icon: 'palette',
    position: 'left',
    duration: 2500,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Weather & Environment
// ============================================================================

/**
 * Show rainbow for hopeful moments.
 */
export function showHope(): void {
  showSidekickPair('sparkle', 'rainbow', 3000);
}

/**
 * Show nature leaf for grounding.
 */
export function showGrounding(): void {
  showSidekick({
    icon: 'leaf',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

/**
 * Show waves for calm/flowing energy.
 */
export function showCalm(): void {
  showSidekick({
    icon: 'waves',
    position: 'right',
    duration: 3500,
    color: 'var(--color-text-muted, #5a6b8a)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Energy & Motivation
// ============================================================================

/**
 * Show lightning bolt for energy/motivation.
 */
export function showEnergy(): void {
  showSidekick({
    icon: 'zap',
    position: 'left',
    duration: 2000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

/**
 * Show trending up for progress.
 */
export function showProgress(): void {
  showSidekick({
    icon: 'trendingUp',
    position: 'right',
    duration: 2500,
    color: 'var(--color-semantic-success, #4a6741)',
    animation: 'bounce',
  });
}

/**
 * Show rocket for launching into action.
 */
export function showLaunch(): void {
  showSidekick({
    icon: 'rocket',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-primary)',
    animation: 'bounce',
  });
}

/**
 * Show growth plant for personal development.
 */
export function showGrowth(): void {
  showSidekick({
    icon: 'grow',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Milestones
// ============================================================================

/**
 * Show trophy for achievements.
 */
export function showAchievement(): void {
  showSidekick({
    icon: 'trophy',
    position: 'left',
    duration: 3000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

/**
 * Show gift for surprises/rewards.
 */
export function showGift(): void {
  showSidekick({
    icon: 'gift',
    position: 'right',
    duration: 3000,
    color: 'var(--color-semantic-error, #a67a6a)',
    animation: 'bounce',
  });
}

/**
 * Show cake for birthdays/anniversaries.
 */
export function showBirthday(): void {
  showSidekickPair('cake', 'party', 3500);
}

/**
 * Show crown for special recognition.
 */
export function showRecognition(): void {
  showSidekick({
    icon: 'crown',
    position: 'left',
    duration: 2500,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'pulse',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Communication
// ============================================================================

/**
 * Show chat bubble for discussion.
 */
export function showChat(): void {
  showSidekick({
    icon: 'chat',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-primary)',
    animation: 'float',
  });
}

/**
 * Show bell for reminders/notifications.
 */
export function showReminder(): void {
  showSidekick({
    icon: 'bell',
    position: 'right',
    duration: 2000,
    color: 'var(--color-semantic-warning, #b8956a)',
    animation: 'bounce',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Rest & Calm
// ============================================================================

/**
 * Show sleep/bedtime icon.
 */
export function showBedtime(): void {
  showSidekick({
    icon: 'moon',
    position: 'right',
    duration: 3000,
    color: 'var(--color-text-muted, #5a6b8a)',
    animation: 'float',
  });
}

/**
 * Show tea for relaxation.
 */
export function showRelaxation(): void {
  showSidekick({
    icon: 'tea',
    position: 'right',
    duration: 3000,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS - Focus & Planning
// ============================================================================

/**
 * Show focus/target for concentration.
 */
export function showFocus(): void {
  showSidekick({
    icon: 'focus',
    position: 'left',
    duration: 2500,
    color: 'var(--persona-primary)',
    animation: 'pulse',
  });
}

/**
 * Show calendar for planning.
 */
export function showPlanning(): void {
  showSidekick({
    icon: 'calendar',
    position: 'right',
    duration: 2500,
    color: 'var(--persona-secondary)',
    animation: 'float',
  });
}

/**
 * Show checkmark for completion.
 */
export function showComplete(): void {
  showSidekick({
    icon: 'checkCircle',
    position: 'right',
    duration: 2000,
    color: 'var(--color-semantic-success, #4a6741)',
    animation: 'bounce',
  });
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  const styleId = 'avatar-sidekicks-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* ========================================================================
       Avatar Sidekicks - Floating side companion icons
       ======================================================================== */
    
    /* Allow overflow so sidekicks can appear outside the avatar bounds */
    .avatar-container:has(.avatar-sidekicks-container) {
      overflow: visible !important;
    }
    
    .avatar-sidekicks-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: var(--z-floating, 20);
      overflow: visible;
    }
    
    /* Sidekick slots - positioned beside the avatar */
    .sidekick-slot {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
    }
    
    .sidekick-slot--left {
      right: calc(100% + 12px);
    }
    
    .sidekick-slot--right {
      left: calc(100% + 12px);
    }
    
    /* Sidekick icon styling */
    .sidekick-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 2px 4px rgba(44, 37, 32, 0.2));
      will-change: transform, opacity;
    }
    
    .sidekick-icon svg {
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    
    /* Size variants */
    .sidekick-icon--sm { transform-origin: center; }
    .sidekick-icon--md { transform-origin: center; }
    .sidekick-icon--lg { transform-origin: center; }
    
    /* Subtle glow on icons */
    .sidekick-icon::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.2)) 0%,
        transparent 70%
      );
      opacity: 0.5;
      pointer-events: none;
      z-index: -1;
    }
    
    /* Reduced motion - no animation */
    @media (prefers-reduced-motion: reduce) {
      .avatar-sidekicks-container {
        display: none;
      }
    }
    
    /* Dark theme adjustments */
    [data-theme='dark'] .sidekick-icon {
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
    }
    
    /* Responsive - hide on very small screens */
    @media (max-width: 360px) {
      .sidekick-slot {
        display: none;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  _clearAllTimeouts();
  clearAllSidekicks();
  removeEventListeners();
  
  container?.remove();
  container = null;
  leftSlot = null;
  rightSlot = null;
  isInitialized = false;
  
  // Remove injected styles
  const styleElement = document.getElementById('avatar-sidekicks-styles');
  styleElement?.remove();
  
  log.debug('Avatar sidekicks disposed');
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

/**
 * All the signals/events that can trigger sidekicks:
 * 
 * EMOTION SIGNALS (from voice prosody analysis):
 * - ferni:emotion-change - User's emotional state detected
 * - ferni:emotion-detected - Detailed emotion with confidence
 * 
 * ENGAGEMENT SIGNALS:
 * - ferni:celebration - Achievement or milestone
 * - ferni:memory-callback - Ferni remembered something
 * - ferni:growth-recognized - User growth detected
 * - ferni:concern-detected - User concern/distress
 * - ferni:deep-moment - Emotionally significant moment
 * 
 * CONVERSATION SIGNALS:
 * - ferni:conversation-start - Call began
 * - ferni:conversation-end - Call ended
 * - ferni:thinking - Ferni is processing
 * - ferni:user-speech-start/end - User speaking state
 * 
 * HUMANIZATION SIGNALS (from backend):
 * - humanization_signal with types: breakthrough, vulnerability, high_engagement, etc.
 * 
 * TOOL EXECUTION (from backend data messages):
 * - Music playing → music sidekick
 * - Calendar events → calendar sidekick
 * - Habit tracking → wellness sidekick
 * 
 * RELATIONSHIP MILESTONES:
 * - ferni:team-member-unlocked - New persona unlocked
 * - ferni:streak-milestone - Streak achievement
 * - ferni:milestone-celebrated - General milestone
 */

function setupEventListeners(): void {
  // Use AbortController for clean removal of all listeners
  if (eventAbortController) return; // Already set up
  eventAbortController = new AbortController();
  const signal = eventAbortController.signal;

  // ─────────────────────────────────────────────────────────────────
  // EMOTION SIGNALS - React to user's emotional state
  // Uses ferni:emotion-detected (the actual dispatched event name)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:emotion-detected', ((e: CustomEvent) => {
    const { emotion, intensity } = e.detail || {};
    if (!emotion || intensity < 0.6) return; // Only strong emotions
    
    // Map emotions to sidekick icons
    const emotionToIcon: Record<string, SidekickIcon> = {
      happy: 'sparkles',
      excited: 'zap',
      curious: 'lightbulb',
      sad: 'heart',
      empathetic: 'hug',
      proud: 'trophy',
      surprised: 'sparkle',
      thinking: 'brain',
      celebrating: 'party',
    };
    
    const icon = emotionToIcon[emotion as string];
    if (icon) {
      showSidekick({ icon, position: 'right', duration: 2500 });
    }
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // CELEBRATION & MILESTONE SIGNALS
  // Uses actual event names from brand-integration.ts
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:big-win from brand-integration.ts
  document.addEventListener('ferni:big-win', () => {
    showSidekickPair('sparkles', 'party', 3000);
  }, { signal });
  
  // ferni:small-win from brand-integration.ts
  document.addEventListener('ferni:small-win', () => {
    showSidekick({ icon: 'sparkle', position: 'right', duration: 2000 });
  }, { signal });

  document.addEventListener('ferni:memory-callback', () => {
    // Recognition moment - lightbulb to show "I remember!"
    showSidekick({ icon: 'lightbulb', position: 'right', duration: 2000 });
  }, { signal });

  // ferni:deep-moment from brand-integration.ts
  document.addEventListener('ferni:deep-moment', () => {
    // Heart for emotionally significant moments
    showSidekick({ icon: 'heart', position: 'right', duration: 3000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // RELATIONSHIP MILESTONES
  // Uses actual event names from brand-integration.ts
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:team-unlock (actual name, not team-member-unlocked)
  document.addEventListener('ferni:team-unlock', () => {
    showSidekickPair('sparkles', 'star', 4000);
  }, { signal });

  // ferni:streak from brand-integration.ts
  document.addEventListener('ferni:streak', ((e: CustomEvent) => {
    const streak = e.detail?.streak;
    if (streak >= 7) {
      showSidekickPair('trophy', 'flame', 3500);
    } else {
      showSidekick({ icon: 'flame', position: 'right', duration: 2500 });
    }
  }) as EventListener, { signal });

  // ferni:milestone from brand-integration.ts
  document.addEventListener('ferni:milestone', () => {
    showSidekick({ icon: 'trophy', position: 'right', duration: 3000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // CONVERSATION STATE SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // Only a long think earns the prop; every-turn props read as a tic.
  let longThinkTimer: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('ferni:thinking', ((e: CustomEvent) => {
    if (longThinkTimer) clearTimeout(longThinkTimer);
    longThinkTimer = e.detail?.thinking
      ? setTimeout(() => showSidekick({ icon: 'brain', position: 'right', duration: 2000 }), 1500)
      : null;
  }) as EventListener, { signal });

  // ferni:conversation-start is dispatched on window, not document
  window.addEventListener('ferni:conversation-start', () => {
    // Gentle wave on connection
    showSidekick({ icon: 'hand', position: 'right', duration: 2000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // MUSIC & MEDIA SIGNALS
  // Uses ferni:music-state (the actual dispatched event name)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:music-state', ((e: CustomEvent) => {
    const { state, isAmbient } = e.detail || {};
    if (state === 'playing') {
      // Different icon for ambient vs user-requested music
      const icon: SidekickIcon = isAmbient ? 'music' : 'headphones';
      showSidekick({ icon, position: 'right', duration: 4000 });
    }
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // HANDOFF / PERSONA SWITCH SIGNALS
  // These are dispatched on window by persona-magic.ui.ts
  // ─────────────────────────────────────────────────────────────────
  
  window.addEventListener('ferni:handoff-start', () => {
    // Wave goodbye as we hand off
    showSidekick({ icon: 'hand', position: 'left', duration: 2500 });
  }, { signal });

  window.addEventListener('ferni:handoff-complete', () => {
    // Sparkle to welcome new persona
    showSidekick({ icon: 'sparkle', position: 'right', duration: 2000 });
  }, { signal });
  
  // ferni:handoff from brand-integration.ts (alternate event)
  document.addEventListener('ferni:handoff', () => {
    showSidekick({ icon: 'sparkle', position: 'right', duration: 2000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // WEATHER / SKY-CHECK SIGNALS (internal emotional weather)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:sky-check', ((e: CustomEvent) => {
    const { weather, energy } = e.detail || {};
    
    // Map weather to sidekick icons
    const weatherToIcon: Record<string, SidekickIcon> = {
      sunny: 'sun',
      'partly-cloudy': 'cloudSun',
      cloudy: 'cloud',
      rainy: 'cloudRain',
      stormy: 'zap',
      foggy: 'cloud',
      rainbow: 'rainbow',
    };
    
    const icon = weatherToIcon[weather as string] || 'sun';
    const energyIcon: Record<string, SidekickIcon> = {
      high: 'zap',
      medium: 'coffee',
      low: 'moon',
    };
    
    // Show weather on left, energy indicator on right
    showSidekickPair(icon, energyIcon[energy as string] || 'coffee', 3500);
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // BIRTHDAY / ANNIVERSARY / IMPORTANT DATES
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:birthday-reminder', () => {
    showSidekickPair('cake', 'gift', 4000);
  }, { signal });

  document.addEventListener('ferni:anniversary-reminder', () => {
    showSidekickPair('heart', 'star', 4000);
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // GAMING & PLAY SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:game-started', ((e: CustomEvent) => {
    const gameType = e.detail?.gameType;
    if (gameType === 'dice' || gameType === 'random') {
      showSidekick({ icon: 'dice', position: 'right', duration: 3000 });
    } else {
      showSidekick({ icon: 'gamepad', position: 'right', duration: 3000 });
    }
  }) as EventListener, { signal });

  // ─────────────────────────────────────────────────────────────────
  // PROACTIVE OUTREACH (from proactive-outreach.ui.ts)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:proactive-outreach', ((e: CustomEvent) => {
    const type = e.detail?.type;
    if (type === 'thinking-of-you') {
      showSidekick({ icon: 'heart', position: 'right', duration: 3000 });
    } else if (type === 'check-in') {
      showSidekick({ icon: 'messageCircle', position: 'right', duration: 2500 });
    } else {
      showSidekick({ icon: 'bell', position: 'right', duration: 2000 });
    }
  }) as EventListener, { signal });
  
  // ferni:thinking-of-you from brand-integration.ts
  document.addEventListener('ferni:thinking-of-you', () => {
    showSidekick({ icon: 'heart', position: 'right', duration: 3000 });
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // BREAKTHROUGH MOMENTS (from humanization-bridge.service.ts)
  // ─────────────────────────────────────────────────────────────────
  
  document.addEventListener('ferni:breakthrough', () => {
    showSidekickPair('lightbulb', 'sparkles', 4000);
  }, { signal });

  // ─────────────────────────────────────────────────────────────────
  // JOURNAL & REFLECTION SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:journal-entry from voice-journal/save.ts
  document.addEventListener('ferni:journal-entry', () => {
    showSidekick({ icon: 'pen', position: 'right', duration: 2500 });
  }, { signal });
  
  // ─────────────────────────────────────────────────────────────────
  // WELLNESS & BREATHING SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:breathing-exercise from breathing-guide.ui.ts
  document.addEventListener('ferni:breathing-exercise', () => {
    showSidekick({ icon: 'wind', position: 'right', duration: 4000 });
  }, { signal });
  
  // ferni:meditation-started from game-picker.ui.ts (reflection games)
  document.addEventListener('ferni:meditation-started', () => {
    showSidekick({ icon: 'leaf', position: 'right', duration: 3000 });
  }, { signal });
  
  // ─────────────────────────────────────────────────────────────────
  // PROGRESS & GOALS SIGNALS
  // ─────────────────────────────────────────────────────────────────
  
  // ferni:goal-achieved from monetization-integration.service.ts
  document.addEventListener('ferni:goal-achieved', () => {
    showSidekickPair('trophy', 'confetti', 4000);
  }, { signal });
  
  // ferni:progress-tracked from growth-journey.service.ts
  document.addEventListener('ferni:progress-tracked', () => {
    showSidekick({ icon: 'trendingUp', position: 'right', duration: 2500 });
  }, { signal });
  
  // ferni:insights-generated from relationship-stage.service.ts
  document.addEventListener('ferni:insights-generated', () => {
    showSidekick({ icon: 'lightbulb', position: 'right', duration: 2500 });
  }, { signal });

  log.debug('Event listeners set up for sidekick triggers');
}

function removeEventListeners(): void {
  // AbortController cleanly removes all event listeners at once
  if (eventAbortController) {
    eventAbortController.abort();
    eventAbortController = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const avatarSidekicks = {
  init: initAvatarSidekicks,
  show: showSidekick,
  showPair: showSidekickPair,
  clear: clearAllSidekicks,
  dispose,
  
  // Time of Day
  timeOfDay: showTimeOfDaySidekick,
  
  // Ideas & Thinking
  idea: showIdea,
  thinking: showThinking,
  focus: showFocus,
  
  // Emotions & Connection
  love: showLove,
  celebrate: showCelebration,
  wave: showWave,
  hope: showHope,
  
  // Activities
  music: showMusic,
  listening: showListening,
  reading: showReading,
  wellness: showWellness,
  creative: showCreative,
  
  // Energy & Motivation
  energy: showEnergy,
  progress: showProgress,
  launch: showLaunch,
  growth: showGrowth,
  
  // Nature & Environment
  grounding: showGrounding,
  calm: showCalm,
  
  // Milestones & Celebrations
  achievement: showAchievement,
  gift: showGift,
  birthday: showBirthday,
  recognition: showRecognition,
  
  // Communication
  chat: showChat,
  reminder: showReminder,
  
  // Rest & Calm
  bedtime: showBedtime,
  relaxation: showRelaxation,
  
  // Focus & Planning
  planning: showPlanning,
  complete: showComplete,
  
  // Icon list for dev panel (organized by category)
  icons: Object.keys(SIDEKICK_ICONS) as SidekickIcon[],
  
  // Icon categories for better discovery in dev panel
  categories: {
    timeOfDay: ['coffee', 'sun', 'sunrise', 'sunset', 'moon', 'flame', 'clock', 'alarm', 'hourglass'],
    weather: ['cloud', 'cloudSun', 'cloudRain', 'snowflake', 'wind', 'rainbow'],
    nature: ['leaf', 'flower', 'sprout', 'palmtree', 'waves', 'grow'],
    ideas: ['lightbulb', 'brain', 'thinking', 'compass', 'focus', 'target', 'search'],
    emotions: ['heart', 'heartPulse', 'sparkles', 'sparkle', 'smile', 'laughing', 'wink', 'worried', 'hug', 'thumbsUp'],
    gestures: ['hand', 'handshake', 'pointer', 'flex'],
    activities: ['music', 'headphones', 'book', 'bookOpen', 'palette', 'brush', 'gamepad', 'yoga', 'movie', 'tent'],
    celebrations: ['trophy', 'star', 'crown', 'gift', 'cake', 'party', 'confetti', 'fireworks', 'rocket', 'flag'],
    energy: ['zap', 'trendingUp', 'activity', 'flame'],
    rest: ['sleepy', 'bedtime', 'tea', 'moon', 'cloud'],
    communication: ['messageCircle', 'chat', 'bell', 'phone', 'mail'],
    misc: ['eye', 'calendar', 'checkCircle', 'crystalBall', 'magic', 'layers', 'wifi', 'info', 'mic', 'pen', 'dice'],
    animals: ['turtle', 'snail', 'bug'],
  } as const,
};

export default avatarSidekicks;
