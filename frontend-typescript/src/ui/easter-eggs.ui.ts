/**
 * Easter Eggs UI - Hidden delights and surprises
 * 
 * 🎬 PIXAR PRINCIPLES APPLIED:
 * - APPEAL: Rewarding, delightful discoveries
 * - EXAGGERATION: Over-the-top celebrations
 * - TIMING: Perfectly paced reveals
 * - SECONDARY ACTION: Characters react to discoveries
 * 
 * Secret features that reward curious users:
 * - Konami code dance party (full Pixar celebration!)
 * - Avatar eye click interaction (WALL-E style)
 * - Random personality quirks
 * - Achievement tracking
 * - Secret gestures
 * - Hidden messages
 */

import { celebrationsUI } from './celebrations.ui.js';
import { soundUI } from './sound.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

type SecretCode = 'konami' | 'disco' | 'matrix' | 'rainbow';

// ============================================================================
// STATE
// ============================================================================

let keySequence: string[] = [];
let lastKeyTime = 0;
let clickPattern: number[] = [];
let lastClickTime = 0;
let discoMode = false;
let matrixMode = false;
let matrixCanvas: HTMLCanvasElement | null = null;
let matrixAnimationId: number | null = null;
let dancePartyMode = false;
let danceAnimationId: number | null = null;

// 🎬 Achievement tracking
interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: number;
}

const achievements: Achievement[] = [
  { id: 'konami', name: 'Konami Master', description: 'Entered the legendary code', unlocked: false },
  { id: 'disco', name: 'Disco King', description: 'Turned on the disco lights', unlocked: false },
  { id: 'matrix', name: 'Neo', description: 'Saw the Matrix', unlocked: false },
  { id: 'rainbow', name: 'Rainbow Walker', description: 'Found all the colors', unlocked: false },
  { id: 'eye-poke', name: 'Curious One', description: 'Poked the avatar\'s eye', unlocked: false },
  { id: 'shake', name: 'Earthquake', description: 'Shook the device like you meant it', unlocked: false },
  { id: 'triple-click', name: 'Clicker', description: 'Triple-clicked the avatar', unlocked: false },
];

// 🎬 Personality quirks
let lastQuirkTime = 0;
let quirkTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Secret codes
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const DISCO_CODE = ['d', 'i', 's', 'c', 'o'];
const MATRIX_CODE = ['m', 'a', 't', 'r', 'i', 'x'];
const RAINBOW_CODE = ['r', 'a', 'i', 'n', 'b', 'o', 'w'];

// Triple-click pattern timing
const TRIPLE_CLICK_TIMEOUT = 400;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initEasterEggsUI(): void {
  // 🎬 Load saved achievements
  loadAchievements();
  
  // Listen for keyboard sequences
  document.addEventListener('keydown', handleKeyDown);
  
  // Listen for click patterns on avatar
  const avatar = document.getElementById('coachAvatar');
  avatar?.addEventListener('click', handleAvatarClick);
  
  // 🎬 Listen for eye area clicks (WALL-E style)
  avatar?.addEventListener('click', handleEyeClick);
  
  // 🎬 Start random quirk timer
  scheduleRandomQuirk();
  
  // Listen for shake gesture (mobile)
  // iOS 13+ requires permission for DeviceMotion
  if (window.DeviceMotionEvent) {
    const requestMotionPermission = async () => {
      // Check if permission API exists (iOS 13+)
      const DeviceMotionEventWithPermission = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      
      if (typeof DeviceMotionEventWithPermission.requestPermission === 'function') {
        try {
          const permission = await DeviceMotionEventWithPermission.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('devicemotion', handleDeviceMotion);
          }
        } catch {
          // Permission denied or error - silently ignore
          console.debug('DeviceMotion permission denied or unavailable');
        }
      } else {
        // Non-iOS or older iOS - just add listener
        window.addEventListener('devicemotion', handleDeviceMotion);
      }
    };
    
    // Request on first user interaction (required for iOS)
    document.addEventListener('click', () => void requestMotionPermission(), { once: true });
  }
  
}

// ============================================================================
// KEYBOARD SEQUENCES
// ============================================================================

function handleKeyDown(e: KeyboardEvent): void {
  const now = Date.now();
  
  // Reset sequence if too much time passed
  if (now - lastKeyTime > 2000) {
    keySequence = [];
  }
  
  lastKeyTime = now;
  keySequence.push(e.key);
  
  // Keep only last 12 keys
  if (keySequence.length > 12) {
    keySequence.shift();
  }
  
  // Check for codes
  checkCodes();
}

function checkCodes(): void {
  const sequence = keySequence.join(',');
  
  if (sequence.endsWith(KONAMI_CODE.join(','))) {
    triggerEasterEgg('konami');
    keySequence = [];
  } else if (sequence.endsWith(DISCO_CODE.join(','))) {
    triggerEasterEgg('disco');
    keySequence = [];
  } else if (sequence.endsWith(MATRIX_CODE.join(','))) {
    triggerEasterEgg('matrix');
    keySequence = [];
  } else if (sequence.endsWith(RAINBOW_CODE.join(','))) {
    triggerEasterEgg('rainbow');
    keySequence = [];
  }
}

// ============================================================================
// CLICK PATTERNS
// ============================================================================

function handleAvatarClick(): void {
  const now = Date.now();
  
  // Reset pattern if too much time passed
  if (now - lastClickTime > TRIPLE_CLICK_TIMEOUT) {
    clickPattern = [];
  }
  
  lastClickTime = now;
  clickPattern.push(now);
  
  // Triple click detection
  if (clickPattern.length >= 3) {
    const first = clickPattern[0];
    const third = clickPattern[2];
    if (first !== undefined && third !== undefined) {
      const timeDiff = third - first;
      if (timeDiff < TRIPLE_CLICK_TIMEOUT * 2) {
        triggerSecretWiggle();
        clickPattern = [];
      }
    }
  }
  
  // Keep only last 3 clicks
  if (clickPattern.length > 3) {
    clickPattern.shift();
  }
}

// ============================================================================
// DEVICE MOTION (Shake detection)
// ============================================================================

const shakeThreshold = 15;
let lastShakeTime = 0;
let shakeCount = 0;

function handleDeviceMotion(e: DeviceMotionEvent): void {
  const acceleration = e.accelerationIncludingGravity;
  if (!acceleration) return;
  
  const total = Math.abs(acceleration.x ?? 0) + 
                Math.abs(acceleration.y ?? 0) + 
                Math.abs(acceleration.z ?? 0);
  
  const now = Date.now();
  
  if (total > shakeThreshold) {
    if (now - lastShakeTime > 100) {
      shakeCount++;
      lastShakeTime = now;
      
      // 5 shakes triggers surprise
      if (shakeCount >= 5) {
        triggerShakeSurprise();
        shakeCount = 0;
      }
    }
  }
  
  // Reset shake count after 2 seconds
  if (now - lastShakeTime > 2000) {
    shakeCount = 0;
  }
}

// ============================================================================
// EASTER EGG EFFECTS
// ============================================================================

function triggerEasterEgg(code: SecretCode): void {
  
  switch (code) {
    case 'konami':
      triggerKonamiCode();
      break;
    case 'disco':
      toggleDiscoMode();
      break;
    case 'matrix':
      toggleMatrixMode();
      break;
    case 'rainbow':
      triggerRainbowMode();
      break;
  }
}

function triggerKonamiCode(): void {
  // 🎬 Unlock achievement
  unlockAchievement('konami');
  
  // Warm celebration
  soundUI.play('celebrate');
  celebrationsUI.warmthGlow({ intensity: 'warm' });
  celebrationsUI.gentleBounce();
  
  // Show achievement - clean, no emoji
  showSecretMessage('Konami Code', 'Dance party activated!');
  
  // 🎬 Start the FULL PIXAR DANCE PARTY!
  startDanceParty();
  
  // Temporary special effect
  document.body.classList.add('konami-mode');
  setTimeout(() => {
    document.body.classList.remove('konami-mode');
    stopDanceParty();
  }, 8000);
}

function toggleDiscoMode(): void {
  discoMode = !discoMode;
  
  if (discoMode) {
    unlockAchievement('disco');
    soundUI.play('celebrate');
    document.body.classList.add('disco-mode');
    showSecretMessage('Disco Mode', 'Lights on.');
  } else {
    document.body.classList.remove('disco-mode');
  }
}

function toggleMatrixMode(): void {
  matrixMode = !matrixMode;
  
  if (matrixMode) {
    unlockAchievement('matrix');
    startMatrixRain();
    showSecretMessage('Matrix Mode', 'Follow the white rabbit.');
  } else {
    stopMatrixRain();
  }
}

function triggerRainbowMode(): void {
  unlockAchievement('rainbow');
  soundUI.play('success');
  document.body.classList.add('rainbow-mode');
  
  showSecretMessage('Rainbow Mode', 'Full spectrum.');
  
  // Auto-disable after 10 seconds
  setTimeout(() => {
    document.body.classList.remove('rainbow-mode');
  }, 10000);
}

function triggerSecretWiggle(): void {
  unlockAchievement('triple-click');
  const avatar = document.querySelector('.avatar-container');
  if (avatar) {
    avatar.classList.add('secret-wiggle');
    soundUI.play('success');
    setTimeout(() => {
      avatar.classList.remove('secret-wiggle');
    }, 1000);
  }
}

function triggerShakeSurprise(): void {
  unlockAchievement('shake');
  soundUI.play('celebrate');
  celebrationsUI.warmthGlow({ intensity: 'warm' });
  celebrationsUI.gentleBounce();
  
  // Safe vibration (iOS doesn't support vibration API)
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([100, 50, 100]);
    } catch {
      // Vibration not supported
    }
  }
}

// ============================================================================
// MATRIX RAIN EFFECT
// ============================================================================

function startMatrixRain(): void {
  matrixCanvas = document.createElement('canvas');
  matrixCanvas.id = 'matrixCanvas';
  matrixCanvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    opacity: 0.15;
  `;
  
  document.body.insertBefore(matrixCanvas, document.body.firstChild);
  
  const ctx = matrixCanvas.getContext('2d')!;
  matrixCanvas.width = window.innerWidth;
  matrixCanvas.height = window.innerHeight;
  
  const columns = Math.floor(matrixCanvas.width / 20);
  const drops: number[] = new Array<number>(columns).fill(1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$¥£€@#%&*';
  
  function drawMatrix(): void {
    if (!ctx || !matrixCanvas) return;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    
    ctx.fillStyle = '#0f0';
    ctx.font = '15px monospace';
    
    for (let i = 0; i < drops.length; i++) {
      const dropValue = drops[i] ?? 1;
      const char = chars[Math.floor(Math.random() * chars.length)] ?? 'A';
      ctx.fillText(char, i * 20, dropValue * 20);
      
      if (dropValue * 20 > matrixCanvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] = dropValue + 1;
    }
    
    if (matrixMode) {
      matrixAnimationId = requestAnimationFrame(drawMatrix);
    }
  }
  
  drawMatrix();
}

function stopMatrixRain(): void {
  if (matrixAnimationId) {
    cancelAnimationFrame(matrixAnimationId);
    matrixAnimationId = null;
  }
  
  if (matrixCanvas) {
    matrixCanvas.remove();
    matrixCanvas = null;
  }
}

// ============================================================================
// SECRET MESSAGES
// ============================================================================

function showSecretMessage(title: string, subtitle: string): void {
  const message = document.createElement('div');
  message.className = 'secret-message';
  message.innerHTML = `
    <div class="secret-title">${title}</div>
    <div class="secret-subtitle">${subtitle}</div>
  `;
  
  document.body.appendChild(message);
  
  requestAnimationFrame(() => {
    message.classList.add('visible');
  });
  
  setTimeout(() => {
    message.classList.remove('visible');
    setTimeout(() => message.remove(), 500);
  }, 3000);
}

// ============================================================================
// ZEN CELEBRATION - Meditative joy mode
// ============================================================================

/**
 * Start a zen-inspired celebration.
 * Instead of chaotic bouncing, this creates a harmonious,
 * synchronized breathing effect across all elements.
 * Like the whole UI is peacefully meditating together.
 */
function startDanceParty(): void {
  if (dancePartyMode) return;
  dancePartyMode = true;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Get all elements
  const avatar = document.querySelector('.avatar-container');
  const teamMembers = document.querySelectorAll('.team-member');
  const connectButton = document.querySelector('.btn-connect');
  const waveformBars = document.querySelectorAll('.waveform-bar');
  
  let phase = 0;
  
  const zenCelebration = () => {
    if (!dancePartyMode) return;
    
    // Much slower phase increment - meditative rhythm
    phase += 0.02;
    
    // Avatar: Gentle breathing and very subtle sway
    if (avatar instanceof HTMLElement) {
      const breathe = Math.sin(phase) * 3; // Subtle vertical breathing
      const sway = Math.sin(phase * 0.5) * 2; // Very slow side sway
      const tilt = Math.sin(phase * 0.7) * 0.5; // Barely perceptible tilt
      avatar.style.transform = `
        translateY(${breathe}px) 
        translateX(${sway}px) 
        rotate(${tilt}deg)
      `;
    }
    
    // Team members: Staggered gentle wave, like leaves in a breeze
    teamMembers.forEach((member, i) => {
      if (member instanceof HTMLElement) {
        const offset = i * 0.3;
        const wave = Math.sin(phase + offset) * 2;
        member.style.transform = `translateY(${wave}px)`;
      }
    });
    
    // Connect button: Gentle warmth pulse
    if (connectButton instanceof HTMLElement) {
      const warmth = 1 + Math.sin(phase) * 0.015;
      connectButton.style.transform = `scale(${warmth})`;
    }
    
    // Waveform bars: Smooth breathing pattern
    waveformBars.forEach((bar, i) => {
      if (bar instanceof HTMLElement) {
        const height = 12 + Math.sin(phase + i * 0.15) * 8;
        bar.style.height = `${height}px`;
      }
    });
    
    danceAnimationId = requestAnimationFrame(zenCelebration);
  };
  
  danceAnimationId = requestAnimationFrame(zenCelebration);
}

/**
 * Stop the dance party and return to normal.
 */
function stopDanceParty(): void {
  dancePartyMode = false;
  
  if (danceAnimationId) {
    cancelAnimationFrame(danceAnimationId);
    danceAnimationId = null;
  }
  
  // Reset transforms
  const avatar = document.querySelector('.avatar-container');
  const teamMembers = document.querySelectorAll('.team-member');
  const connectButton = document.querySelector('.btn-connect');
  
  if (avatar instanceof HTMLElement) {
    avatar.style.transform = '';
  }
  
  teamMembers.forEach((member) => {
    if (member instanceof HTMLElement) {
      member.style.transform = '';
    }
  });
  
  if (connectButton instanceof HTMLElement) {
    connectButton.style.transform = '';
  }
}

// ============================================================================
// 🎬 AVATAR EYE INTERACTION - WALL-E style curiosity
// ============================================================================

/**
 * Handle clicks on the avatar's "eye" area.
 * Creates a surprised blink reaction like WALL-E.
 */
function handleEyeClick(e: MouseEvent): void {
  const avatar = document.getElementById('coachAvatar');
  if (!avatar) return;
  
  const rect = avatar.getBoundingClientRect();
  const relativeX = e.clientX - rect.left;
  const relativeY = e.clientY - rect.top;
  
  // Check if click is in the upper-middle "eye" area
  const isEyeArea = 
    relativeX > rect.width * 0.3 && 
    relativeX < rect.width * 0.7 &&
    relativeY > rect.height * 0.2 && 
    relativeY < rect.height * 0.5;
  
  if (isEyeArea) {
    triggerEyePoke();
  }
}

/**
 * Trigger the eye poke reaction.
 */
function triggerEyePoke(): void {
  unlockAchievement('eye-poke');
  
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Surprised blink animation
  avatar.animate([
    { transform: 'scale(1)', offset: 0 },
    // Quick squeeze (surprised!)
    { transform: 'scale(1.1, 0.9)', offset: 0.1 },
    { transform: 'scale(0.95, 1.05)', offset: 0.2 },
    // Lean back
    { transform: 'scale(1) translateY(-5px) rotate(-3deg)', offset: 0.3 },
    // Return with bounce
    { transform: 'scale(1.02) translateY(2px)', offset: 0.6 },
    { transform: 'scale(0.99)', offset: 0.8 },
    { transform: 'scale(1)', offset: 1 },
  ], {
    duration: DURATION.DELIBERATE,
    easing: EASING.SPRING,
  });
  
  soundUI.play('click');
}

// ============================================================================
// 🎬 RANDOM PERSONALITY QUIRKS
// ============================================================================

/**
 * Schedule a random quirk to happen.
 */
function scheduleRandomQuirk(): void {
  // Random time between 30-120 seconds
  const delay = 30000 + Math.random() * 90000;
  
  quirkTimeoutId = setTimeout(() => {
    triggerRandomQuirk();
    scheduleRandomQuirk(); // Schedule next
  }, delay);
}

/**
 * Trigger a random personality quirk.
 * Small moments of character that make the AI feel alive.
 */
function triggerRandomQuirk(): void {
  // Don't interrupt if user is actively engaged
  const isConnected = document.body.classList.contains('connected');
  if (isConnected) {
    return;
  }
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  const now = performance.now();
  if (now - lastQuirkTime < 10000) return; // Min 10s between quirks
  lastQuirkTime = now;
  
  const quirks = [
    quirk_curiousLook,
    quirk_sleepyYawn,
    quirk_happyBounce,
    quirk_lookAround,
  ];
  
  const randomQuirk = quirks[Math.floor(Math.random() * quirks.length)];
  randomQuirk?.();
}

/**
 * Quirk: Avatar looks around curiously
 */
function quirk_curiousLook(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate([
    { transform: 'rotate(0deg)', offset: 0 },
    { transform: 'rotate(-5deg) translateX(-3px)', offset: 0.2 },
    { transform: 'rotate(-5deg) translateX(-3px)', offset: 0.4 },
    { transform: 'rotate(5deg) translateX(3px)', offset: 0.6 },
    { transform: 'rotate(5deg) translateX(3px)', offset: 0.8 },
    { transform: 'rotate(0deg)', offset: 1 },
  ], {
    duration: DURATION.AMBIENT_FAST * 0.66, // ~2000ms quirk
    easing: EASING.EASE_IN_OUT,
  });
}

/**
 * Quirk: Avatar does a sleepy yawn
 */
function quirk_sleepyYawn(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate([
    { transform: 'scale(1)', offset: 0 },
    // Inhale
    { transform: 'scale(1.05, 0.95) translateY(-3px)', offset: 0.2 },
    { transform: 'scale(1.08, 0.92) translateY(-5px)', offset: 0.4 },
    // Hold
    { transform: 'scale(1.06, 0.94) translateY(-4px)', offset: 0.6 },
    // Exhale/settle
    { transform: 'scale(0.98, 1.02) translateY(2px)', offset: 0.8 },
    { transform: 'scale(1)', offset: 1 },
  ], {
    duration: DURATION.AMBIENT_FAST * 0.83, // ~2500ms quirk
    easing: EASING.EASE_IN_OUT,
  });
}

/**
 * Quirk: Avatar does a happy little bounce
 */
function quirk_happyBounce(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate([
    { transform: 'translateY(0)', offset: 0 },
    { transform: 'translateY(-8px)', offset: 0.15 },
    { transform: 'translateY(2px)', offset: 0.35 },
    { transform: 'translateY(-4px)', offset: 0.55 },
    { transform: 'translateY(1px)', offset: 0.75 },
    { transform: 'translateY(0)', offset: 1 },
  ], {
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  });
}

/**
 * Quirk: Avatar looks around (side to side)
 */
function quirk_lookAround(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate([
    { transform: 'translateX(0) rotate(0deg)', offset: 0 },
    { transform: 'translateX(-5px) rotate(-2deg)', offset: 0.25 },
    { transform: 'translateX(0) rotate(0deg)', offset: 0.5 },
    { transform: 'translateX(5px) rotate(2deg)', offset: 0.75 },
    { transform: 'translateX(0) rotate(0deg)', offset: 1 },
  ], {
    duration: DURATION.GLACIAL,
    easing: EASING.EASE_IN_OUT,
  });
}

// ============================================================================
// 🎬 ACHIEVEMENT SYSTEM
// ============================================================================

/**
 * Unlock an achievement.
 */
function unlockAchievement(id: string): void {
  const achievement = achievements.find(a => a.id === id);
  if (!achievement || achievement.unlocked) return;
  
  achievement.unlocked = true;
  achievement.unlockedAt = Date.now();
  
  // Save to localStorage
  try {
    const saved = achievements.filter(a => a.unlocked).map(a => a.id);
    localStorage.setItem('ferni-achievements', JSON.stringify(saved));
  } catch {
    // localStorage not available
  }
  
  // Show achievement notification
  showAchievementNotification(achievement);
}

/**
 * Load saved achievements from localStorage.
 */
function loadAchievements(): void {
  try {
    const saved = localStorage.getItem('ferni-achievements');
    if (saved) {
      const ids = JSON.parse(saved) as string[];
      ids.forEach(id => {
        const achievement = achievements.find(a => a.id === id);
        if (achievement) {
          achievement.unlocked = true;
        }
      });
    }
  } catch {
    // localStorage not available or corrupted
  }
}

/**
 * Show achievement unlock notification.
 */
function showAchievementNotification(achievement: Achievement): void {
  const notification = document.createElement('div');
  notification.className = 'achievement-notification';
  notification.innerHTML = `
    <div class="achievement-icon" style="font-size: 24px; font-weight: 600; color: var(--persona-text, #ffffff);">★</div>
    <div class="achievement-content">
      <div class="achievement-title">${achievement.name}</div>
      <div class="achievement-desc">${achievement.description}</div>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, var(--persona-primary, #4a6741) 0%, var(--persona-secondary, #3d5a35) 100%);
    color: var(--persona-text, #ffffff);
    padding: 16px 20px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    z-index: var(--z-notification);
    transform: translateX(120%);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  `;
  
  const icon = notification.querySelector('.achievement-icon');
  if (icon instanceof HTMLElement) {
    icon.style.cssText = 'font-size: 28px;';
  }
  
  const title = notification.querySelector('.achievement-title');
  if (title instanceof HTMLElement) {
    title.style.cssText = 'font-weight: 600; font-size: 14px;';
  }
  
  const desc = notification.querySelector('.achievement-desc');
  if (desc instanceof HTMLElement) {
    desc.style.cssText = 'font-size: 12px; opacity: 0.8;';
  }
  
  document.body.appendChild(notification);
  
  // Animate in
  requestAnimationFrame(() => {
    notification.style.transform = 'translateX(0)';
  });
  
  // Play sound
  soundUI.play('success');
  
  // Animate out after delay
  setTimeout(() => {
    notification.style.transform = 'translateX(120%)';
    setTimeout(() => notification.remove(), 400);
  }, 4000);
}

/**
 * Get all achievements.
 */
export function getAchievements(): Achievement[] {
  return [...achievements];
}

/**
 * Get count of unlocked achievements.
 */
export function getUnlockedCount(): number {
  return achievements.filter(a => a.unlocked).length;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('keydown', handleKeyDown);
  
  const avatar = document.getElementById('coachAvatar');
  avatar?.removeEventListener('click', handleAvatarClick);
  avatar?.removeEventListener('click', handleEyeClick);
  
  window.removeEventListener('devicemotion', handleDeviceMotion);
  
  stopMatrixRain();
  stopDanceParty();
  
  // Clear quirk timeout
  if (quirkTimeoutId) {
    clearTimeout(quirkTimeoutId);
    quirkTimeoutId = null;
  }
  
  document.body.classList.remove('disco-mode', 'rainbow-mode', 'konami-mode');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const easterEggsUI = {
  init: initEasterEggsUI,
  dispose,
  getAchievements,
  getUnlockedCount,
  triggerDanceParty: startDanceParty,
  stopDanceParty,
};

