/**
 * Easter Eggs UI - Hidden delights and surprises
 * 
 * Secret features that reward curious users:
 * - Konami code celebration
 * - Secret gestures
 * - Hidden messages
 * - Fun surprises
 */

import { celebrationsUI } from './celebrations.ui.js';
import { soundUI } from './sound.ui.js';

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
  // Listen for keyboard sequences
  document.addEventListener('keydown', handleKeyDown);
  
  // Listen for click patterns on avatar
  const avatar = document.getElementById('coachAvatar');
  avatar?.addEventListener('click', handleAvatarClick);
  
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
  
  console.log('🥚 Easter eggs initialized (shhh!)');
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

let shakeThreshold = 15;
let lastShakeTime = 0;
let shakeCount = 0;

function handleDeviceMotion(e: DeviceMotionEvent): void {
  const acceleration = e.accelerationIncludingGravity;
  if (!acceleration) return;
  
  const total = Math.abs(acceleration.x || 0) + 
                Math.abs(acceleration.y || 0) + 
                Math.abs(acceleration.z || 0);
  
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
  console.log(`🎉 Easter egg triggered: ${code}`);
  
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
  // Epic celebration
  soundUI.play('celebrate');
  celebrationsUI.fireworks(5);
  
  // Show achievement
  showSecretMessage('🎮 Konami Code Activated!', 'You found a secret!');
  
  // Temporary invincibility effect
  document.body.classList.add('konami-mode');
  setTimeout(() => {
    document.body.classList.remove('konami-mode');
  }, 5000);
}

function toggleDiscoMode(): void {
  discoMode = !discoMode;
  
  if (discoMode) {
    soundUI.play('celebrate');
    document.body.classList.add('disco-mode');
    showSecretMessage('🪩 Disco Mode!', 'Let\'s party!');
  } else {
    document.body.classList.remove('disco-mode');
  }
}

function toggleMatrixMode(): void {
  matrixMode = !matrixMode;
  
  if (matrixMode) {
    startMatrixRain();
    showSecretMessage('💊 Matrix Mode', 'Follow the white rabbit...');
  } else {
    stopMatrixRain();
  }
}

function triggerRainbowMode(): void {
  soundUI.play('success');
  document.body.classList.add('rainbow-mode');
  
  showSecretMessage('🌈 Rainbow Mode!', 'Taste the rainbow!');
  
  // Auto-disable after 10 seconds
  setTimeout(() => {
    document.body.classList.remove('rainbow-mode');
  }, 10000);
}

function triggerSecretWiggle(): void {
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
  soundUI.play('celebrate');
  celebrationsUI.sparkles({ count: 50, radius: 200 });
  
  if ('vibrate' in navigator) {
    // Safe vibration (iOS doesn't support vibration API)
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([100, 50, 100, 50, 200]);
      } catch {
        // Vibration not supported
      }
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
  const drops: number[] = Array(columns).fill(1);
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
// CLEANUP
// ============================================================================

export function dispose(): void {
  document.removeEventListener('keydown', handleKeyDown);
  
  const avatar = document.getElementById('coachAvatar');
  avatar?.removeEventListener('click', handleAvatarClick);
  
  window.removeEventListener('devicemotion', handleDeviceMotion);
  
  stopMatrixRain();
  
  document.body.classList.remove('disco-mode', 'rainbow-mode', 'konami-mode');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const easterEggsUI = {
  init: initEasterEggsUI,
  dispose,
};

