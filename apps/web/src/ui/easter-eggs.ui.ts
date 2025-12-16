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

import { DURATION, EASING } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { celebrationsUI } from './celebrations.ui.js';
import { soundUI } from './sound.ui.js';

// Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

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
  {
    id: 'konami',
    name: 'Konami Master',
    description: 'Entered the legendary code',
    unlocked: false,
  },
  { id: 'disco', name: 'Disco King', description: 'Turned on the disco lights', unlocked: false },
  { id: 'matrix', name: 'Neo', description: 'Saw the Matrix', unlocked: false },
  { id: 'rainbow', name: 'Rainbow Walker', description: 'Found all the colors', unlocked: false },
  { id: 'eye-poke', name: 'Curious One', description: 'Discovered the eye', unlocked: false },
  {
    id: 'shake',
    name: 'Earthquake',
    description: 'Shook the device like you meant it',
    unlocked: false,
  },
  {
    id: 'triple-click',
    name: 'Clicker',
    description: 'Triple-clicked the avatar',
    unlocked: false,
  },
  { id: 'petting', name: 'Gentle Soul', description: 'Made Ferni feel loved', unlocked: false },
  { id: 'stretch', name: 'Stretchy', description: 'Pulled Ferni like taffy', unlocked: false },
  { id: 'tilt', name: 'Tipsy', description: 'Made Ferni slide around', unlocked: false },
  { id: 'night-owl', name: 'Night Owl', description: 'Chatted past midnight', unlocked: false },
  { id: 'early-bird', name: 'Early Bird', description: 'First chat of the day', unlocked: false },
];

// 🎬 Personality quirks
let lastQuirkTime = 0;
let quirkTimeoutId: ReturnType<typeof setTimeout> | null = null;

// 🐾 Long press petting state
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let isPetting = false;
const LONG_PRESS_DURATION = 500; // ms to trigger petting

// 🪢 Pull-to-stretch state
let pullStartY = 0;
let isPulling = false;
let currentStretch = 0;

// 📱 Tilt response state
let tiltEnabled = false;
let tiltAnimationId: number | null = null;

// 😴 Time-aware personality state
let sleepyModeActive = false;
let sleepyCheckInterval: ReturnType<typeof setInterval> | null = null;

// 💭 Daydreaming / idle state
let lastActivityTime = Date.now();
let isDaydreaming = false;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
const IDLE_THRESHOLD = 45000; // 45 seconds to start daydreaming
const DAYDREAM_DURATION = 4000; // How long the daydream animation lasts

// Secret codes
const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];
const DISCO_CODE = ['d', 'i', 's', 'c', 'o'];
const MATRIX_CODE = ['m', 'a', 't', 'r', 'i', 'x'];
const RAINBOW_CODE = ['r', 'a', 'i', 'n', 'b', 'o', 'w'];

// Triple-click pattern timing
const TRIPLE_CLICK_TIMEOUT = 400;

// ============================================================================
// HMR CLEANUP - Required per brand guidelines
// ============================================================================

/**
 * Clean up any orphaned elements from HMR reloads
 */
function cleanupOrphanedElements(): void {
  // Remove disco elements
  document.querySelectorAll('.disco-ball').forEach((el) => el.remove());
  document.querySelectorAll('.disco-floor').forEach((el) => el.remove());
  // Remove matrix elements
  document.querySelectorAll('.matrix-canvas').forEach((el) => el.remove());
  // Remove dance party elements
  document.querySelectorAll('.dance-party-container').forEach((el) => el.remove());
  // Remove achievement badges
  document.querySelectorAll('.easter-egg-achievement-badge').forEach((el) => el.remove());
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initEasterEggsUI(): void {
  // HMR cleanup first
  cleanupOrphanedElements();
  
  // 🎬 Load saved achievements
  loadAchievements();
  
  // Listen for keyboard sequences
  document.addEventListener('keydown', handleKeyDown);
  
  // Listen for click patterns on avatar
  const avatar = document.getElementById('coachAvatar');
  const avatarContainer = document.querySelector('.avatar-container');
  avatar?.addEventListener('click', handleAvatarClick);
  
  // 🎬 Listen for eye area clicks (WALL-E style)
  avatar?.addEventListener('click', handleEyeClick);

  // 🐾 Long press petting
  avatarContainer?.addEventListener('mousedown', handlePressStart as EventListener);
  avatarContainer?.addEventListener('touchstart', handlePressStart as EventListener, {
    passive: true,
  });
  avatarContainer?.addEventListener('mouseup', handlePressEnd);
  avatarContainer?.addEventListener('mouseleave', handlePressEnd);
  avatarContainer?.addEventListener('touchend', handlePressEnd);
  avatarContainer?.addEventListener('touchcancel', handlePressEnd);

  // 🪢 Pull-to-stretch
  avatarContainer?.addEventListener('touchstart', handlePullStart as EventListener, {
    passive: true,
  });
  avatarContainer?.addEventListener('touchmove', handlePullMove as EventListener, {
    passive: false,
  });
  avatarContainer?.addEventListener('touchend', handlePullEnd);
  
  // 🎬 Start random quirk timer
  scheduleRandomQuirk();

  // 😴 Check for sleepy mode (late night)
  checkSleepyMode();
  sleepyCheckInterval = setInterval(checkSleepyMode, 60000); // Check every minute

  // 🌅 Check for morning stretch (first interaction of day)
  checkMorningStretch();

  // 💭 Start idle/daydreaming detection
  startIdleDetection();

  // 🗣️ Listen for speech events (laughter, sighs, thank you)
  window.addEventListener('ferni:transcript-update', handleTranscriptForReactions as EventListener);
  window.addEventListener('ferni:user-audio-level', handleAudioLevelForReactions as EventListener);
  
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
            initTiltResponse();
          }
        } catch {
          // Permission denied or error - silently ignore
        }
      } else {
        // Non-iOS or older iOS - just add listener
        window.addEventListener('devicemotion', handleDeviceMotion);
        initTiltResponse();
      }
    };
    
    // Request on first user interaction (required for iOS)
    document.addEventListener('click', () => void requestMotionPermission(), { once: true });
  }
  
  // 📱 Also try DeviceOrientation for tilt (separate from motion)
  if (window.DeviceOrientationEvent) {
    document.addEventListener(
      'click',
      () => {
        initTiltResponse();
      },
      { once: true }
    );
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
  
  const total =
    Math.abs(acceleration.x ?? 0) + Math.abs(acceleration.y ?? 0) + Math.abs(acceleration.z ?? 0);
  
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
  trackedTimeout(() => {
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
  trackedTimeout(() => {
    document.body.classList.remove('rainbow-mode');
  }, 10000);
}

function triggerSecretWiggle(): void {
  unlockAchievement('triple-click');
  const avatar = document.querySelector('.avatar-container');
  if (avatar) {
    avatar.classList.add('secret-wiggle');
    soundUI.play('success');
    trackedTimeout(() => {
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
  
  trackedTimeout(() => {
    message.classList.remove('visible');
    trackedTimeout(() => message.remove(), 500);
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

// State for eye poke easter egg
let eyePokeActive = false;
let eyePokeElement: HTMLElement | null = null;
let lastEyeClickTime = 0;
const DOUBLE_CLICK_THRESHOLD = 400; // ms

/**
 * Handle double-clicks on the avatar to reveal the eye.
 * Creates a surprised blink reaction like WALL-E.
 */
function handleEyeClick(_e: MouseEvent): void {
  const now = Date.now();
  const timeSinceLastClick = now - lastEyeClickTime;
  lastEyeClickTime = now;
  
  // Double-click detection
  if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
    triggerEyePoke();
  }
}

/**
 * Create the eye SVG element for the poked eye easter egg.
 * This is the detailed eye that appears when the FE is clicked.
 */
function createPokedEyeSVG(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'poked-eye-svg');
  svg.style.cssText = `
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity ${DURATION.NORMAL}ms ease, transform ${DURATION.NORMAL}ms ${EASING.SPRING};
  `;

  // Outer circle (the green orb)
  const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  outer.setAttribute('cx', '50');
  outer.setAttribute('cy', '50');
  outer.setAttribute('r', '45');
  outer.setAttribute('fill', 'var(--persona-primary, #4a6741)');
  svg.appendChild(outer);

  // Eye white
  const eyeWhite = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  eyeWhite.setAttribute('cx', '50');
  eyeWhite.setAttribute('cy', '50');
  eyeWhite.setAttribute('rx', '22');
  eyeWhite.setAttribute('ry', '22');
  eyeWhite.setAttribute('fill', '#ffffff');
  eyeWhite.setAttribute('class', 'eye-white');
  svg.appendChild(eyeWhite);

  // Iris
  const iris = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  iris.setAttribute('cx', '50');
  iris.setAttribute('cy', '50');
  iris.setAttribute('r', '14');
  iris.setAttribute('fill', '#5a8060');
  iris.setAttribute('class', 'eye-iris');
  svg.appendChild(iris);

  // Pupil
  const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  pupil.setAttribute('cx', '50');
  pupil.setAttribute('cy', '50');
  pupil.setAttribute('r', '7');
  pupil.setAttribute('fill', '#2c2520');
  pupil.setAttribute('class', 'eye-pupil');
  svg.appendChild(pupil);

  // Catchlight (the little white reflection)
  const catchlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  catchlight.setAttribute('cx', '45');
  catchlight.setAttribute('cy', '45');
  catchlight.setAttribute('r', '3');
  catchlight.setAttribute('fill', '#ffffff');
  catchlight.setAttribute('opacity', '0.9');
  svg.appendChild(catchlight);

  // Upper eyelid (for blink animation)
  const upperLid = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  upperLid.setAttribute('cx', '50');
  upperLid.setAttribute('cy', '28');
  upperLid.setAttribute('rx', '24');
  upperLid.setAttribute('ry', '22');
  upperLid.setAttribute('fill', 'var(--persona-primary, #4a6741)');
  upperLid.setAttribute('class', 'upper-lid');
  upperLid.style.cssText = 'transform-origin: 50px 50px; transition: transform 150ms ease-out;';
  svg.appendChild(upperLid);

  // Lower eyelid (for blink animation)
  const lowerLid = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  lowerLid.setAttribute('cx', '50');
  lowerLid.setAttribute('cy', '72');
  lowerLid.setAttribute('rx', '24');
  lowerLid.setAttribute('ry', '22');
  lowerLid.setAttribute('fill', 'var(--persona-primary, #4a6741)');
  lowerLid.setAttribute('class', 'lower-lid');
  lowerLid.style.cssText = 'transform-origin: 50px 50px; transition: transform 150ms ease-out;';
  svg.appendChild(lowerLid);

  return svg;
}

/**
 * Trigger the eye poke reaction.
 * Hides the FE text, reveals a detailed eye, then blinks like it's been poked.
 */
function triggerEyePoke(): void {
  // Prevent multiple triggers
  if (eyePokeActive) return;
  eyePokeActive = true;

  unlockAchievement('eye-poke');
  
  const avatar = document.getElementById('coachAvatar');
  const avatarText = document.getElementById('avatarText');

  if (!avatar || !avatarText) {
    eyePokeActive = false;
    return;
  }
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    eyePokeActive = false;
    return;
  }
  
  soundUI.play('click');

  // Create and add the eye element if it doesn't exist
  if (!eyePokeElement) {
    eyePokeElement = document.createElement('div');
    eyePokeElement.className = 'poked-eye-container';
    eyePokeElement.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    `;
    eyePokeElement.appendChild(createPokedEyeSVG());
    avatar.appendChild(eyePokeElement);
  }

  const eyeSvg = eyePokeElement.querySelector('.poked-eye-svg') as SVGSVGElement;
  const upperLid = eyePokeElement.querySelector('.upper-lid') as SVGEllipseElement;
  const lowerLid = eyePokeElement.querySelector('.lower-lid') as SVGEllipseElement;
  const eyeWhite = eyePokeElement.querySelector('.eye-white') as SVGEllipseElement;
  const pupil = eyePokeElement.querySelector('.eye-pupil') as SVGCircleElement;

  // Phase 1: Hide FE text, reveal eye (200ms)
  avatarText.style.transition = 'opacity 150ms ease, transform 150ms ease';
  avatarText.style.opacity = '0';
  avatarText.style.transform = 'scale(0.8)';

  trackedTimeout(() => {
    if (!eyeSvg) return;
    eyeSvg.style.opacity = '1';
    eyeSvg.style.transform = 'scale(1)';

    // Phase 2: Surprised wide-eye reaction (300ms after reveal)
    trackedTimeout(() => {
      // Widen eye in surprise
      if (eyeWhite) {
        eyeWhite.animate(
          [
            { rx: 22, ry: 22 },
            { rx: 25, ry: 28 }, // Wide open!
            { rx: 22, ry: 22 },
          ],
          { duration: DURATION.STANDARD, easing: EASING.STANDARD }
        );
      }

      // Pupil shrinks in surprise
      if (pupil) {
        pupil.animate(
          [
            { r: 7 },
            { r: 5 }, // Shrink!
            { r: 7 },
          ],
          { duration: DURATION.STANDARD, easing: EASING.STANDARD }
        );
      }

      // Phase 3: Rapid blink sequence (like being poked!) - 400ms after surprise
      trackedTimeout(() => {
        // Blink 1: Fast squint
        if (upperLid && lowerLid) {
          upperLid.style.transform = 'translateY(18px)';
          lowerLid.style.transform = 'translateY(-18px)';

          // Open quickly
          trackedTimeout(() => {
            upperLid.style.transform = 'translateY(0)';
            lowerLid.style.transform = 'translateY(0)';

            // Blink 2: Another quick blink
            trackedTimeout(() => {
              upperLid.style.transform = 'translateY(18px)';
              lowerLid.style.transform = 'translateY(-18px)';

              // Open
              trackedTimeout(() => {
                upperLid.style.transform = 'translateY(0)';
                lowerLid.style.transform = 'translateY(0)';

                // Blink 3: Final settling blink
                trackedTimeout(() => {
                  upperLid.style.transform = 'translateY(12px)';
                  lowerLid.style.transform = 'translateY(-12px)';

                  trackedTimeout(() => {
                    upperLid.style.transform = 'translateY(0)';
                    lowerLid.style.transform = 'translateY(0)';

                    // Phase 4: Reverse animation - hide eye, show FE (after 1.5s total eye time)
                    trackedTimeout(() => {
                      if (eyeSvg) {
                        eyeSvg.style.opacity = '0';
                        eyeSvg.style.transform = 'scale(0.8)';
                      }

                      trackedTimeout(() => {
                        avatarText.style.opacity = '1';
                        avatarText.style.transform = 'scale(1)';

                        // Reset state
                        trackedTimeout(() => {
                          avatarText.style.transition = '';
                          avatarText.style.transform = '';
                          eyePokeActive = false;
                        }, 200);
                      }, 150);
                    }, 600);
                  }, 150);
                }, 200);
              }, 100);
            }, 150);
          }, 100);
        }
      }, 300);
    }, 200);
  }, 150);
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
  
  quirkTimeoutId = trackedTimeout(() => {
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
  
  // Build quirk list based on current state
  let quirks = [quirk_curiousLook, quirk_happyBounce, quirk_lookAround, quirk_birdWatching];

  // Late night? More likely to yawn or nod off
  if (sleepyModeActive) {
    quirks = [
    quirk_sleepyYawn,
      quirk_sleepyYawn,
      triggerSleepyBehavior,
      quirk_curiousLook,
    quirk_lookAround,
  ];
  } else {
    // Normal hours - include yawn but less frequent
    quirks.push(quirk_sleepyYawn);
  }
  
  const randomQuirk = quirks[Math.floor(Math.random() * quirks.length)];
  randomQuirk?.();
}

/**
 * Quirk: Avatar looks around curiously
 */
function quirk_curiousLook(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate(
    [
    { transform: 'rotate(0deg)', offset: 0 },
    { transform: 'rotate(-5deg) translateX(-3px)', offset: 0.2 },
    { transform: 'rotate(-5deg) translateX(-3px)', offset: 0.4 },
    { transform: 'rotate(5deg) translateX(3px)', offset: 0.6 },
    { transform: 'rotate(5deg) translateX(3px)', offset: 0.8 },
    { transform: 'rotate(0deg)', offset: 1 },
    ],
    {
    duration: DURATION.AMBIENT_FAST * 0.66, // ~2000ms quirk
    easing: EASING.EASE_IN_OUT,
    }
  );
}

/**
 * Quirk: Avatar does a sleepy yawn
 */
function quirk_sleepyYawn(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate(
    [
    { transform: 'scale(1)', offset: 0 },
    // Inhale
    { transform: 'scale(1.05, 0.95) translateY(-3px)', offset: 0.2 },
    { transform: 'scale(1.08, 0.92) translateY(-5px)', offset: 0.4 },
    // Hold
    { transform: 'scale(1.06, 0.94) translateY(-4px)', offset: 0.6 },
    // Exhale/settle
    { transform: 'scale(0.98, 1.02) translateY(2px)', offset: 0.8 },
    { transform: 'scale(1)', offset: 1 },
    ],
    {
    duration: DURATION.AMBIENT_FAST * 0.83, // ~2500ms quirk
    easing: EASING.EASE_IN_OUT,
    }
  );
}

/**
 * Quirk: Avatar does a happy little bounce
 */
function quirk_happyBounce(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate(
    [
    { transform: 'translateY(0)', offset: 0 },
    { transform: 'translateY(-8px)', offset: 0.15 },
    { transform: 'translateY(2px)', offset: 0.35 },
    { transform: 'translateY(-4px)', offset: 0.55 },
    { transform: 'translateY(1px)', offset: 0.75 },
    { transform: 'translateY(0)', offset: 1 },
    ],
    {
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
    }
  );
}

/**
 * Quirk: Avatar looks around (side to side)
 */
function quirk_lookAround(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;
  
  avatar.animate(
    [
    { transform: 'translateX(0) rotate(0deg)', offset: 0 },
    { transform: 'translateX(-5px) rotate(-2deg)', offset: 0.25 },
    { transform: 'translateX(0) rotate(0deg)', offset: 0.5 },
    { transform: 'translateX(5px) rotate(2deg)', offset: 0.75 },
    { transform: 'translateX(0) rotate(0deg)', offset: 1 },
    ],
    {
    duration: DURATION.GLACIAL,
    easing: EASING.EASE_IN_OUT,
    }
  );
}

// ============================================================================
// 🎬 ACHIEVEMENT SYSTEM
// ============================================================================

/**
 * Unlock an achievement.
 */
function unlockAchievement(id: string): void {
  const achievement = achievements.find((a) => a.id === id);
  if (!achievement || achievement.unlocked) return;
  
  achievement.unlocked = true;
  achievement.unlockedAt = Date.now();
  
  // Save to localStorage
  try {
    const saved = achievements.filter((a) => a.unlocked).map((a) => a.id);
    localStorage.setItem('ferni-achievements', JSON.stringify(saved));
  } catch {
    // localStorage not available
  }

  // Emit event for Ferni Moments tracking
  window.dispatchEvent(
    new CustomEvent('ferni:achievement-unlocked', {
      detail: { id, achievement },
    })
  );
  
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
      ids.forEach((id) => {
        const achievement = achievements.find((a) => a.id === id);
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
    transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
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
  trackedTimeout(() => {
    notification.style.transform = 'translateX(120%)';
    trackedTimeout(() => notification.remove(), 400);
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
  return achievements.filter((a) => a.unlocked).length;
}

// ============================================================================
// 🐾 LONG PRESS PETTING - Hold avatar for contentment
// ============================================================================

function handlePressStart(_e: MouseEvent | TouchEvent): void {
  // Don't trigger during other interactions
  if (eyePokeActive || isPulling) return;

  // Record activity
  recordActivity();

  longPressTimer = trackedTimeout(() => {
    startPetting();
  }, LONG_PRESS_DURATION);
}

function handlePressEnd(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (isPetting) {
    endPetting();
  }
}

function startPetting(): void {
  isPetting = true;
  unlockAchievement('petting');

  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Settled, content animation - like a cat being petted
  avatar.style.transition = 'transform 300ms ease-out';
  avatar.style.transform = 'scale(1.05) translateY(-3px)';

  // Add a gentle pulse while being petted
  avatar.classList.add('being-petted');

  // Inject petting styles if not already
  if (!document.getElementById('petting-styles')) {
    const style = document.createElement('style');
    style.id = 'petting-styles';
    style.textContent = `
      .being-petted {
        animation: petting-contentment 1.5s ease-in-out infinite;
      }
      @keyframes petting-contentment {
        0%, 100% { transform: scale(1.05) translateY(-3px); }
        50% { transform: scale(1.07) translateY(-5px); }
      }
    `;
    document.head.appendChild(style);
  }

  soundUI.play('success');
}

function endPetting(): void {
  isPetting = false;

  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  avatar.classList.remove('being-petted');

  // Happy shimmy on release
  avatar.animate(
    [
      { transform: 'scale(1.05) translateY(-3px)' },
      { transform: 'scale(1) translateX(-4px) rotate(-3deg)' },
      { transform: 'scale(1) translateX(4px) rotate(3deg)' },
      { transform: 'scale(1) translateX(-2px) rotate(-1deg)' },
      { transform: 'scale(1) translateX(0) rotate(0)' },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    }
  );

  avatar.style.transition = '';
  avatar.style.transform = '';
}

// ============================================================================
// 🪢 PULL-TO-STRETCH - Drag down stretches Ferni like taffy
// ============================================================================

function handlePullStart(e: TouchEvent): void {
  if (isPetting || eyePokeActive) return;

  const touch = e.touches[0];
  if (touch) {
    pullStartY = touch.clientY;
    isPulling = false;
    currentStretch = 0;
  }
}

function handlePullMove(e: TouchEvent): void {
  if (pullStartY === 0) return;

  const touch = e.touches[0];
  if (!touch) return;

  const deltaY = touch.clientY - pullStartY;

  // Only activate on downward pull
  if (deltaY > 20) {
    isPulling = true;
    recordActivity();

    // Prevent page scroll while stretching
    e.preventDefault();

    // Calculate stretch amount (max 60px)
    currentStretch = Math.min(60, deltaY * 0.5);

    const avatar = document.querySelector('.avatar-container');
    if (avatar instanceof HTMLElement) {
      // Stretch effect - squash horizontally, stretch vertically
      const scaleY = 1 + currentStretch / 100;
      const scaleX = 1 - currentStretch / 300;
      avatar.style.transform = `scaleX(${scaleX}) scaleY(${scaleY}) translateY(${currentStretch / 3}px)`;
      avatar.style.transition = 'none';
    }
  }
}

function handlePullEnd(): void {
  if (!isPulling) {
    pullStartY = 0;
    return;
  }

  isPulling = false;
  pullStartY = 0;

  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  // Award achievement if stretched enough
  if (currentStretch > 30) {
    unlockAchievement('stretch');
    soundUI.play('click');

    // Snap back with surprised bounce
    avatar.animate(
      [
        { transform: avatar.style.transform },
        { transform: 'scaleX(1.15) scaleY(0.85) translateY(5px)', offset: 0.2 },
        { transform: 'scaleX(0.95) scaleY(1.08) translateY(-8px)', offset: 0.4 },
        { transform: 'scaleX(1.03) scaleY(0.97) translateY(2px)', offset: 0.7 },
        { transform: 'scale(1) translateY(0)', offset: 1 },
      ],
      {
        duration: DURATION.DRAMATIC,
        easing: EASING.SPRING,
      }
    );
  }

  avatar.style.transform = '';
  avatar.style.transition = '';
  currentStretch = 0;
}

// ============================================================================
// 📱 TILT RESPONSE - Gyroscope-based sliding
// ============================================================================

function initTiltResponse(): void {
  if (tiltEnabled) return;

  // Check if DeviceOrientation is available
  if (!window.DeviceOrientationEvent) return;

  const handleOrientation = (e: DeviceOrientationEvent) => {
    // gamma is left-right tilt (-90 to 90)
    const gamma = e.gamma ?? 0;

    // Only respond to significant tilts
    if (Math.abs(gamma) < 10) {
      resetTiltPosition();
      return;
    }

    tiltEnabled = true;
    applyTiltEffect(gamma);
  };

  window.addEventListener('deviceorientation', handleOrientation);
}

function applyTiltEffect(gamma: number): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Award achievement on first significant tilt
  if (Math.abs(gamma) > 25 && !achievements.find((a) => a.id === 'tilt')?.unlocked) {
    unlockAchievement('tilt');
  }

  // Calculate slide amount (max 30px)
  const slideX = Math.max(-30, Math.min(30, gamma * 0.8));
  const tilt = gamma * 0.1;

  avatar.style.transition = 'transform 150ms ease-out';
  avatar.style.transform = `translateX(${slideX}px) rotate(${tilt}deg)`;

  recordActivity();
}

function resetTiltPosition(): void {
  const avatar = document.querySelector('.avatar-container');
  if (avatar instanceof HTMLElement && tiltEnabled) {
    avatar.style.transition = 'transform 300ms ease-out';
    avatar.style.transform = '';
  }
}

// ============================================================================
// 😴 SLEEPY MODE - Late night drowsiness
// ============================================================================

function checkSleepyMode(): void {
  const hour = new Date().getHours();

  // Sleepy between midnight and 5am
  const shouldBeSleepy = hour >= 0 && hour < 5;

  if (shouldBeSleepy && !sleepyModeActive) {
    sleepyModeActive = true;
    unlockAchievement('night-owl');
    // Increase yawn frequency in quirks
  } else if (!shouldBeSleepy && sleepyModeActive) {
    sleepyModeActive = false;
  }
}

/**
 * Sleepy yawn - more dramatic version for late night
 */
function triggerSleepyBehavior(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Slow blink / nod off animation
  avatar.animate(
    [
      { transform: 'scale(1) translateY(0)', offset: 0 },
      { transform: 'scale(0.98) translateY(3px)', offset: 0.3 },
      { transform: 'scale(0.96) translateY(8px)', offset: 0.5 }, // Nodding off
      { transform: 'scale(0.96) translateY(8px)', offset: 0.6 },
      { transform: 'scale(1.02) translateY(-5px)', offset: 0.7 }, // Startled awake!
      { transform: 'scale(1) translateY(0)', offset: 1 },
    ],
    {
      duration: DURATION.GLACIAL * 1.5,
      easing: EASING.EASE_IN_OUT,
    }
  );
}

// ============================================================================
// 🌅 MORNING STRETCH - First interaction of day
// ============================================================================

function checkMorningStretch(): void {
  const today = new Date().toDateString();
  const storedDate = localStorage.getItem('ferni-last-interaction-date');

  if (storedDate !== today) {
    // First interaction of the day!
    localStorage.setItem('ferni-last-interaction-date', today);

    // Small delay to let app initialize
    trackedTimeout(() => {
      triggerMorningStretch();
    }, 1500);
  }
}

function triggerMorningStretch(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  unlockAchievement('early-bird');

  // Wake-up stretch animation
  avatar.animate(
    [
      { transform: 'scale(0.95) translateY(5px)', offset: 0 }, // Sleepy
      { transform: 'scale(0.97) translateY(3px)', offset: 0.1 },
      { transform: 'scale(1) translateY(0)', offset: 0.2 },
      { transform: 'scale(1.08, 0.94) translateY(-8px)', offset: 0.4 }, // Big stretch up
      { transform: 'scale(1.1, 0.92) translateY(-12px)', offset: 0.5 }, // Peak stretch
      { transform: 'scale(0.95, 1.05) translateY(3px)', offset: 0.7 }, // Settle down
      { transform: 'scale(1.02) translateY(-2px)', offset: 0.85 }, // Little bounce
      { transform: 'scale(1) translateY(0)', offset: 1 },
    ],
    {
      duration: DURATION.GLACIAL,
      easing: EASING.SPRING,
    }
  );

  soundUI.play('success');
}

// ============================================================================
// 🗣️ SPEECH REACTIONS - Laughter, sighs, thank you
// ============================================================================

let lastLaughTime = 0;
let lastSighTime = 0;
let lastThankYouTime = 0;

function handleTranscriptForReactions(e: CustomEvent): void {
  const { transcript } = e.detail || {};
  if (!transcript || typeof transcript !== 'string') return;

  const text = transcript.toLowerCase();
  const now = Date.now();

  // Thank you detection
  if (
    (text.includes('thank you') || text.includes('thanks') || text.includes('appreciate')) &&
    now - lastThankYouTime > 5000
  ) {
    lastThankYouTime = now;
    triggerThankYouBeam();
  }
}

function handleAudioLevelForReactions(e: CustomEvent): void {
  const { isSpeaking } = e.detail || {};
  if (!isSpeaking) return;

  // This is a simplified detection - in production you'd use
  // actual audio analysis for laughter/sighs
  // For now, we'll trigger these based on transcript signals
  // The triggerLaughterEcho and triggerSighEmpathy can be called
  // from external audio analysis systems
}

/**
 * Trigger warm glow when user says thank you
 */
function triggerThankYouBeam(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  recordActivity();

  // Warm beam/blush animation
  celebrationsUI.warmthGlow({ intensity: 'warm' });

  // Happy wiggle
  avatar.animate(
    [
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(1.08) translateY(-3px)', offset: 0.2 },
      { transform: 'scale(1.05) rotate(-2deg)', offset: 0.4 },
      { transform: 'scale(1.05) rotate(2deg)', offset: 0.6 },
      { transform: 'scale(1.02)', offset: 0.8 },
      { transform: 'scale(1)', offset: 1 },
    ],
    {
      duration: DURATION.DRAMATIC,
      easing: EASING.SPRING,
    }
  );
}

/**
 * React to user laughter by joining in
 */
export function triggerLaughterEcho(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  const now = Date.now();
  if (now - lastLaughTime < 3000) return; // Don't repeat too often
  lastLaughTime = now;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  recordActivity();

  // Chuckle animation - bouncy and joyful
  avatar.animate(
    [
      { transform: 'scale(1) rotate(0)', offset: 0 },
      { transform: 'scale(1.06) translateY(-4px) rotate(-2deg)', offset: 0.15 },
      { transform: 'scale(0.98) translateY(2px) rotate(1deg)', offset: 0.3 },
      { transform: 'scale(1.04) translateY(-3px) rotate(-1deg)', offset: 0.45 },
      { transform: 'scale(0.99) translateY(1px) rotate(0.5deg)', offset: 0.6 },
      { transform: 'scale(1.02) translateY(-1px)', offset: 0.75 },
      { transform: 'scale(1)', offset: 1 },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
    }
  );
}

/**
 * React to user sigh with empathetic lean-in
 */
export function triggerSighEmpathy(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  const now = Date.now();
  if (now - lastSighTime < 5000) return;
  lastSighTime = now;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  recordActivity();

  // Empathetic lean-in - "I noticed, I'm here"
  avatar.animate(
    [
      { transform: 'scale(1) translateY(0)', offset: 0 },
      { transform: 'scale(1.02) translateY(-5px) rotate(-2deg)', offset: 0.3 }, // Lean in
      { transform: 'scale(1.02) translateY(-5px) rotate(-2deg)', offset: 0.6 }, // Hold
      { transform: 'scale(1) translateY(0) rotate(0)', offset: 1 },
    ],
    {
      duration: DURATION.GLACIAL,
      easing: EASING.GENTLE,
    }
  );
}

// ============================================================================
// 🐦 BIRD WATCHING - Occasional look up at passing things
// ============================================================================

function quirk_birdWatching(): void {
  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Look up, track something, look back
  avatar.animate(
    [
      { transform: 'translateY(0) rotate(0)', offset: 0 },
      { transform: 'translateY(-3px) rotate(-5deg)', offset: 0.15 }, // Look up-left
      { transform: 'translateY(-5px) rotate(-3deg)', offset: 0.3 }, // Track...
      { transform: 'translateY(-4px) rotate(0deg)', offset: 0.45 }, // Across...
      { transform: 'translateY(-3px) rotate(3deg)', offset: 0.6 }, // To right...
      { transform: 'translateY(-2px) rotate(5deg)', offset: 0.75 }, // Still watching
      { transform: 'translateY(0) rotate(0)', offset: 1 }, // Back to normal
    ],
    {
      duration: DURATION.GLACIAL * 1.5,
      easing: EASING.EASE_IN_OUT,
    }
  );
}

// ============================================================================
// 💭 DAYDREAMING - Idle staring, snap back when interacted
// ============================================================================

function startIdleDetection(): void {
  // Track activity
  document.addEventListener('click', recordActivity);
  document.addEventListener('touchstart', recordActivity, { passive: true });
  document.addEventListener('keydown', recordActivity);

  // Check for idle state periodically
  idleCheckInterval = setInterval(checkIdleState, 5000);
}

function recordActivity(): void {
  lastActivityTime = Date.now();

  // If currently daydreaming, snap out of it
  if (isDaydreaming) {
    snapOutOfDaydream();
  }
}

function checkIdleState(): void {
  const now = Date.now();
  const idleTime = now - lastActivityTime;

  // Don't daydream if connected or reduced motion
  const isConnected = document.body.classList.contains('connected');
  if (isConnected) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (idleTime > IDLE_THRESHOLD && !isDaydreaming) {
    startDaydreaming();
  }
}

function startDaydreaming(): void {
  isDaydreaming = true;

  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  // Dreamy, unfocused animation - staring off into space
  avatar.animate(
    [
      { transform: 'translateX(0) rotate(0)', offset: 0 },
      { transform: 'translateX(8px) rotate(5deg) scale(0.98)', offset: 0.3 }, // Drift off
      { transform: 'translateX(10px) rotate(6deg) scale(0.97)', offset: 0.5 }, // Deep in thought
      { transform: 'translateX(10px) rotate(6deg) scale(0.97)', offset: 0.8 }, // Hold...
      { transform: 'translateX(8px) rotate(5deg) scale(0.98)', offset: 1 },
    ],
    {
      duration: DAYDREAM_DURATION,
      easing: EASING.EASE_IN_OUT,
      fill: 'forwards',
    }
  );
}

function snapOutOfDaydream(): void {
  isDaydreaming = false;

  const avatar = document.querySelector('.avatar-container');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  // Startled snap-back animation - "oh, you're here!"
  avatar.animate(
    [
      { transform: 'translateX(10px) rotate(6deg) scale(0.97)', offset: 0 },
      { transform: 'translateX(-5px) rotate(-3deg) scale(1.05)', offset: 0.2 }, // Startled!
      { transform: 'translateX(3px) rotate(2deg) scale(0.98)', offset: 0.4 },
      { transform: 'translateX(-1px) rotate(-0.5deg) scale(1.01)', offset: 0.7 },
      { transform: 'translateX(0) rotate(0) scale(1)', offset: 1 },
    ],
    {
      duration: DURATION.DELIBERATE,
      easing: EASING.SPRING,
    }
  );

  soundUI.play('click');
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('keydown', handleKeyDown);
  
  const avatar = document.getElementById('coachAvatar');
  const avatarContainer = document.querySelector('.avatar-container');

  avatar?.removeEventListener('click', handleAvatarClick);
  avatar?.removeEventListener('click', handleEyeClick);

  // Remove petting listeners
  avatarContainer?.removeEventListener('mousedown', handlePressStart as EventListener);
  avatarContainer?.removeEventListener('touchstart', handlePressStart as EventListener);
  avatarContainer?.removeEventListener('mouseup', handlePressEnd);
  avatarContainer?.removeEventListener('mouseleave', handlePressEnd);
  avatarContainer?.removeEventListener('touchend', handlePressEnd);
  avatarContainer?.removeEventListener('touchcancel', handlePressEnd);

  // Remove pull listeners
  avatarContainer?.removeEventListener('touchstart', handlePullStart as EventListener);
  avatarContainer?.removeEventListener('touchmove', handlePullMove as EventListener);
  avatarContainer?.removeEventListener('touchend', handlePullEnd);

  // Remove activity listeners
  document.removeEventListener('click', recordActivity);
  document.removeEventListener('touchstart', recordActivity);
  document.removeEventListener('keydown', recordActivity);

  // Remove speech event listeners
  window.removeEventListener(
    'ferni:transcript-update',
    handleTranscriptForReactions as EventListener
  );
  window.removeEventListener(
    'ferni:user-audio-level',
    handleAudioLevelForReactions as EventListener
  );
  
  window.removeEventListener('devicemotion', handleDeviceMotion);
  
  stopMatrixRain();
  stopDanceParty();
  
  // Clear quirk timeout
  if (quirkTimeoutId) {
    clearTimeout(quirkTimeoutId);
    quirkTimeoutId = null;
  }

  // Clear long press timer
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  // Clear sleepy mode interval
  if (sleepyCheckInterval) {
    clearInterval(sleepyCheckInterval);
    sleepyCheckInterval = null;
  }

  // Clear idle check interval
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }

  // Clear tilt animation
  if (tiltAnimationId) {
    cancelAnimationFrame(tiltAnimationId);
    tiltAnimationId = null;
  }

  // Clean up eye poke element
  if (eyePokeElement) {
    eyePokeElement.remove();
    eyePokeElement = null;
  }
  eyePokeActive = false;

  // Reset states
  isPetting = false;
  isPulling = false;
  tiltEnabled = false;
  sleepyModeActive = false;
  isDaydreaming = false;
  
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
  // Emotional reactions - can be triggered from audio analysis
  triggerLaughterEcho,
  triggerSighEmpathy,
  triggerThankYouBeam,
  // Manual triggers for testing
  triggerMorningStretch,
  triggerSleepyBehavior,
};
