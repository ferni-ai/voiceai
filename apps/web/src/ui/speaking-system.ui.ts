/**
 * Speaking System UI - Three-Layer Animation System
 * 
 * "Three layers working in harmony to convey speech without a mouth"
 * 
 * LAYERS:
 * 1. Body Pulse (PRIMARY) - Avatar squash/stretch with voice volume
 * 2. Halo Pulse (AMBIENT) - Presence ring scales + secondary waves
 * 3. Lid Mouth (DETAIL) - Bottom lid opens with volume
 * 
 * PHILOSOPHY:
 * Like Pixar's WALL-E and Luxo Jr., we don't need a literal mouth to
 * communicate. The whole body conveys the voice. Body pulse is PRIMARY,
 * halo is AMBIENT (peripheral awareness), lid is DETAIL (articulation).
 * 
 * @see design-system/docs/brand/SPEAKING-SYSTEM.md
 * @see design-system/tokens/animation.json → speakingSystem
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('SpeakingSystem');

// ============================================================================
// CONFIGURATION (from design tokens)
// ============================================================================

const CONFIG = {
  body: {
    maxScaleY: 1.08,       // +8% stretch when loud
    minScaleX: 0.97,       // -3% squash when loud (inverse)
    squashRatio: 0.4,      // Horizontal compression ratio
    eyeSquintMax: 0.15,    // Eyes squint 15% when speaking loud
    smoothingAttack: 0.25, // Fast response to volume up
    smoothingRelease: 0.08 // Slow decay for organic feel
  },
  halo: {
    maxScale: 1.015,       // +1.5% scale at max volume
    minOpacity: 0.3,       // Idle opacity
    maxOpacity: 0.5,       // Speaking opacity
    waveCount: 2,          // Number of secondary waves
    waveScaleIncrement: 0.04,  // Each wave slightly larger
    waveOpacityDecay: 0.5      // Each wave more transparent
  },
  lid: {
    bottomYClosed: 110,    // Neutral (invisible)
    bottomYOpen: 70,       // Max open (showing green orb)
    topYClosed: -10,       // Neutral (invisible)
    topYOpen: 15,          // Slight close when speaking
    smoothingAttack: 0.25,
    smoothingRelease: 0.12
  },
  timing: {
    transitionMs: 80,
    phraseRhythmMs: 450,
    wavePhaseOffsetMs: 100
  }
};

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let isSpeaking = false;
let currentVolume = 0;
let smoothedVolume = 0;
let animationFrame: number | null = null;

// DOM Elements
let avatarContainer: HTMLElement | null = null;
let avatarRing: HTMLElement | null = null;
let lidTop: SVGPathElement | null = null;
let lidBottom: SVGPathElement | null = null;
let haloWaves: HTMLElement[] = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the three-layer speaking system.
 * Call this after DOM is ready.
 */
export function initSpeakingSystem(): void {
  if (isInitialized) return;
  
  avatarContainer = document.querySelector('.avatar-container');
  avatarRing = document.getElementById('avatarRing');
  
  if (!avatarContainer || !avatarRing) {
    log.warn('Speaking system: Required elements not found');
    return;
  }
  
  // Create halo wave elements
  createHaloWaves();
  
  // Connect to lid elements (created by ferni-expressions.ui.ts)
  connectToLidOverlay();
  
  isInitialized = true;
  log.info('🔊 Speaking system initialized (3-layer: body, halo, lid)');
}

/**
 * Create secondary halo wave elements for the "sound emanating" effect
 */
function createHaloWaves(): void {
  if (!avatarRing) return;
  
  // Clean up existing waves
  haloWaves.forEach(wave => wave.remove());
  haloWaves = [];
  
  // Create wave container
  const waveContainer = document.createElement('div');
  waveContainer.className = 'speaking-halo-waves';
  waveContainer.setAttribute('aria-hidden', 'true');
  
  // Create secondary waves
  for (let i = 0; i < CONFIG.halo.waveCount; i++) {
    const wave = document.createElement('div');
    wave.className = `speaking-halo-wave speaking-halo-wave-${i + 1}`;
    wave.style.cssText = `
      position: absolute;
      inset: -${10 + (i * 6)}px;
      border-radius: 50%;
      border: 1.5px solid var(--persona-primary, #4a6741);
      opacity: 0;
      pointer-events: none;
      transition: transform ${CONFIG.timing.transitionMs}ms ease-out,
                  opacity ${CONFIG.timing.transitionMs}ms ease-out;
    `;
    waveContainer.appendChild(wave);
    haloWaves.push(wave);
  }
  
  // Insert waves before the ring
  avatarRing.parentElement?.insertBefore(waveContainer, avatarRing);
  
  log.debug('Created halo wave elements:', haloWaves.length);
}

/**
 * Connect to the lid overlay system (created by ferni-expressions.ui.ts)
 */
function connectToLidOverlay(): void {
  // The lid overlay is created dynamically, so we query for it
  const lidOverlay = document.querySelector('.ferni-lid-overlay');
  if (lidOverlay) {
    lidTop = lidOverlay.querySelector('.lid-top') as SVGPathElement;
    lidBottom = lidOverlay.querySelector('.lid-bottom') as SVGPathElement;
    log.debug('Connected to lid overlay');
  } else {
    // Try again later - lid overlay might not exist yet
    setTimeout(connectToLidOverlay, 500);
  }
}

// ============================================================================
// SPEAKING CONTROL
// ============================================================================

/**
 * Start the speaking animation.
 * Called when Ferni begins speaking.
 */
export function startSpeaking(): void {
  if (!isInitialized) {
    initSpeakingSystem();
  }
  
  isSpeaking = true;
  
  if (animationFrame === null) {
    animationFrame = requestAnimationFrame(animateLoop);
    log.debug('🔊 Speaking animation started');
  }
}

/**
 * Stop the speaking animation.
 * Called when Ferni stops speaking.
 */
export function stopSpeaking(): void {
  isSpeaking = false;
  
  // Let the animation naturally decay
  // The animateLoop will stop itself when volume reaches 0
}

/**
 * Update the current voice volume (0-1).
 * Called by audio visualization system.
 */
export function updateVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, volume));
  
  // Auto-start if volume comes in while not speaking
  if (currentVolume > 0.05 && animationFrame === null) {
    isSpeaking = true;
    animationFrame = requestAnimationFrame(animateLoop);
  }
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

/**
 * Main animation loop - updates all three layers
 */
function animateLoop(): void {
  // Smooth the volume
  const cfg = isSpeaking ? CONFIG.body.smoothingAttack : CONFIG.body.smoothingRelease;
  const targetVolume = isSpeaking ? currentVolume : 0;
  smoothedVolume += (targetVolume - smoothedVolume) * cfg;
  
  // If not speaking and volume near zero, stop
  if (!isSpeaking && smoothedVolume < 0.001) {
    smoothedVolume = 0;
    resetAllLayers();
    animationFrame = null;
    log.debug('🔊 Speaking animation stopped');
    return;
  }
  
  // Update all three layers
  updateBodyPulse(smoothedVolume);
  updateHaloPulse(smoothedVolume);
  updateLidMouth(smoothedVolume);
  
  // Continue loop
  animationFrame = requestAnimationFrame(animateLoop);
}

// ============================================================================
// LAYER 1: BODY PULSE
// ============================================================================

function updateBodyPulse(volume: number): void {
  if (!avatarContainer) return;
  
  // Calculate squash/stretch
  const stretchAmount = volume * (CONFIG.body.maxScaleY - 1);
  const squashAmount = stretchAmount * CONFIG.body.squashRatio;
  
  const scaleY = 1 + stretchAmount;
  const scaleX = 1 - squashAmount;
  
  // Apply transform
  avatarContainer.style.setProperty('--speaking-scale-x', String(scaleX));
  avatarContainer.style.setProperty('--speaking-scale-y', String(scaleY));
  
  // Apply directly for immediate feedback
  avatarContainer.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
}

// ============================================================================
// LAYER 2: HALO PULSE
// ============================================================================

function updateHaloPulse(volume: number): void {
  if (!avatarRing) return;
  
  // Primary ring
  const scale = 1 + (volume * (CONFIG.halo.maxScale - 1));
  const opacity = CONFIG.halo.minOpacity + (volume * (CONFIG.halo.maxOpacity - CONFIG.halo.minOpacity));
  
  avatarRing.style.transform = `scale(${scale})`;
  avatarRing.style.opacity = String(opacity);
  
  // Secondary waves (only visible when speaking)
  haloWaves.forEach((wave, i) => {
    const waveScale = scale + ((i + 1) * CONFIG.halo.waveScaleIncrement * volume);
    const waveOpacity = opacity * Math.pow(CONFIG.halo.waveOpacityDecay, i + 1) * volume;
    
    wave.style.transform = `scale(${waveScale})`;
    wave.style.opacity = String(Math.max(0, waveOpacity));
  });
}

// ============================================================================
// LAYER 3: LID MOUTH
// ============================================================================

function updateLidMouth(volume: number): void {
  if (!lidBottom) {
    // Try to reconnect
    connectToLidOverlay();
    return;
  }
  
  // Bottom lid opens with volume
  const bottomY = CONFIG.lid.bottomYClosed - (volume * (CONFIG.lid.bottomYClosed - CONFIG.lid.bottomYOpen));
  lidBottom.setAttribute('d', `M 0,100 Q 50,${bottomY} 100,100 L 100,100 L 0,100 Z`);
  
  // Top lid slightly closes with volume (effort expression)
  if (lidTop) {
    const topY = CONFIG.lid.topYClosed + (volume * (CONFIG.lid.topYOpen - CONFIG.lid.topYClosed));
    lidTop.setAttribute('d', `M 0,0 Q 50,${topY} 100,0 L 100,0 L 0,0 Z`);
  }
}

// ============================================================================
// RESET
// ============================================================================

function resetAllLayers(): void {
  // Reset body
  if (avatarContainer) {
    avatarContainer.style.transform = '';
    avatarContainer.style.removeProperty('--speaking-scale-x');
    avatarContainer.style.removeProperty('--speaking-scale-y');
  }
  
  // Reset halo
  if (avatarRing) {
    avatarRing.style.transform = '';
    avatarRing.style.opacity = String(CONFIG.halo.minOpacity);
  }
  
  // Reset waves
  haloWaves.forEach(wave => {
    wave.style.transform = '';
    wave.style.opacity = '0';
  });
  
  // Reset lids
  if (lidBottom) {
    lidBottom.setAttribute('d', `M 0,100 Q 50,${CONFIG.lid.bottomYClosed} 100,100 L 100,100 L 0,100 Z`);
  }
  if (lidTop) {
    lidTop.setAttribute('d', `M 0,0 Q 50,${CONFIG.lid.topYClosed} 100,0 L 100,0 L 0,0 Z`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const speakingSystem = {
  init: initSpeakingSystem,
  start: startSpeaking,
  stop: stopSpeaking,
  updateVolume,
  get isActive() { return isSpeaking; },
  get currentVolume() { return smoothedVolume; }
};

export default speakingSystem;
