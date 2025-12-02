/**
 * Waveform UI - Expressive Bars Visualization
 * 
 * Features:
 * - Bars that dance with audio and form emotion shapes
 * - Happy = smile curve, Sad = frown, Excited = bouncy peaks
 * - Mouth-like expressions through bar height patterns
 * - Persona-specific colors and energy
 */

import type { PersonaId } from '../types/persona.js';
import type { VoiceEmotion } from '../types/events.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BAR_COUNT = 9; // More bars for smoother curves
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 52;

// ============================================================================
// EMOTION SHAPES - Bar height multipliers to form expressions
// Each array represents relative heights for bars (center = index 4)
// ============================================================================

interface EmotionShape {
  // Height multipliers for each bar position (0-1)
  curve: number[];
  // Animation style
  jitter: number;      // Random movement (0-1)
  bounce: number;      // Bounce intensity (0-1)  
  speed: number;       // Animation speed multiplier
}

const EMOTION_SHAPES: Record<VoiceEmotion | 'speaking', EmotionShape> = {
  // Neutral - gentle hill
  neutral: {
    curve: [0.3, 0.5, 0.7, 0.85, 1.0, 0.85, 0.7, 0.5, 0.3],
    jitter: 0,
    bounce: 0,
    speed: 1,
  },
  // Speaking - dynamic mouth-like movement
  speaking: {
    curve: [0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4],
    jitter: 0.15,
    bounce: 0.2,
    speed: 1,
  },
  // Happy - SMILE shape (edges up, slight dip in center)
  happy: {
    curve: [0.9, 0.7, 0.5, 0.4, 0.35, 0.4, 0.5, 0.7, 0.9],
    jitter: 0.1,
    bounce: 0.3,
    speed: 1.1,
  },
  // Excited - ALL BARS HIGH with bounce!
  excited: {
    curve: [0.85, 0.95, 1.0, 0.9, 1.0, 0.9, 1.0, 0.95, 0.85],
    jitter: 0.25,
    bounce: 0.5,
    speed: 1.4,
  },
  // Sad - FROWN shape (edges down, center up)
  sad: {
    curve: [0.2, 0.35, 0.55, 0.75, 0.85, 0.75, 0.55, 0.35, 0.2],
    jitter: 0.05,
    bounce: 0,
    speed: 0.7,
  },
  // Anxious - UNEVEN, jittery
  anxious: {
    curve: [0.6, 0.4, 0.7, 0.5, 0.8, 0.45, 0.75, 0.35, 0.55],
    jitter: 0.35,
    bounce: 0.15,
    speed: 1.3,
  },
  // Frustrated - SHARP peaks, aggressive
  frustrated: {
    curve: [0.3, 0.8, 0.4, 0.9, 0.5, 0.85, 0.35, 0.75, 0.25],
    jitter: 0.2,
    bounce: 0.1,
    speed: 1.2,
  },
  // Calm - GENTLE, even wave
  calm: {
    curve: [0.5, 0.6, 0.7, 0.75, 0.8, 0.75, 0.7, 0.6, 0.5],
    jitter: 0.02,
    bounce: 0.05,
    speed: 0.6,
  },
};

// ============================================================================
// PERSONA CONFIGURATIONS
// ============================================================================

interface PersonaWaveformConfig {
  color: string;
  energy: number;
  smoothing: number;
  speed: number;
}

const PERSONA_CONFIGS: Record<PersonaId | 'default', PersonaWaveformConfig> = {
  'jack-b': {
    color: '#8b5cf6',
    energy: 0.75,
    smoothing: 0.7,
    speed: 1.0,
  },
  'jack-bogle': {
    color: '#ef4444',
    energy: 0.6,
    smoothing: 0.8,
    speed: 0.9,
  },
  'peter-lynch': {
    color: '#10b981',
    energy: 0.9,
    smoothing: 0.55,
    speed: 1.2,
  },
  'comm-specialist': {
    color: '#06b6d4',
    energy: 0.7,
    smoothing: 0.75,
    speed: 1.0,
  },
  'spend-save': {
    color: '#a78bfa',
    energy: 0.65,
    smoothing: 0.8,
    speed: 0.95,
  },
  'event-planner': {
    color: '#ec4899',
    energy: 0.95,
    smoothing: 0.5,
    speed: 1.25,
  },
  default: {
    color: '#8b5cf6',
    energy: 0.75,
    smoothing: 0.7,
    speed: 1.0,
  },
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let barsContainer: HTMLElement | null = null;
let bars: HTMLElement[] = [];
let emotionIndicator: HTMLElement | null = null;

let currentConfig = PERSONA_CONFIGS['jack-b'];
let currentEmotion: VoiceEmotion | 'neutral' = 'neutral';
let currentShape: EmotionShape = { ...EMOTION_SHAPES.neutral };
let targetShape: EmotionShape = { ...EMOTION_SHAPES.neutral };

let animationId: number | null = null;
let lastVolume = 0;
let smoothedVolume = 0;
let isSpeaking = false;
let isTransitioning = false; // True during agent handoff

// Per-bar state - use explicit initialization
const barHeights: number[] = [];
const barTargets: number[] = [];
for (let i = 0; i < BAR_COUNT; i++) {
  barHeights[i] = MIN_BAR_HEIGHT;
  barTargets[i] = MIN_BAR_HEIGHT;
}

// Animation timing
let lastTimestamp = 0;
let wavePhase = 0;

// Interpolated shape curve (for smooth transitions between emotions)
const interpolatedCurve: number[] = [];
for (let i = 0; i < BAR_COUNT; i++) {
  interpolatedCurve[i] = EMOTION_SHAPES.neutral.curve[i] ?? 0.5;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initWaveformUI(): void {
  container = document.getElementById('waveformContainer');
  
  if (!container) {
    console.warn('Waveform container not found');
    return;
  }

  // Find or create bars container
  barsContainer = container.querySelector('.waveform-bars');
  if (!barsContainer) {
    barsContainer = document.createElement('div');
    barsContainer.className = 'waveform-bars';
    container.innerHTML = '';
    container.appendChild(barsContainer);
    
    emotionIndicator = document.createElement('div');
    emotionIndicator.className = 'emotion-indicator';
    emotionIndicator.id = 'emotionIndicator';
    container.appendChild(emotionIndicator);
  }

  emotionIndicator = container.querySelector('.emotion-indicator');
  createBars();
  updateBarsStyle();
  
  console.log('✨ Waveform UI initialized (expressive bars mode)');
}

function createBars(): void {
  if (!barsContainer) return;
  
  barsContainer.innerHTML = '';
  bars = [];
  
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.setProperty('--bar-index', String(i));
    bar.style.height = `${MIN_BAR_HEIGHT}px`;
    barsContainer.appendChild(bar);
    bars.push(bar);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function start(): void {
  if (!container) return;
  container.classList.add('active');
  startAnimation();
}

export function stop(): void {
  if (!container) return;
  container.classList.remove('active', 'speaking', 'listening', 'thinking', 'has-emotion');
  container.removeAttribute('data-emotion');
  stopAnimation();
  isSpeaking = false;
  currentEmotion = 'neutral';
  targetShape = EMOTION_SHAPES.neutral;
  resetBarsToIdle();
}

export function setSpeaking(speaking: boolean): void {
  if (!container) return;
  
  isSpeaking = speaking;
  
  if (speaking) {
    container.classList.add('speaking');
    container.classList.remove('listening', 'thinking');
    // Use speaking shape, or emotion shape if one is active
    targetShape = currentEmotion !== 'neutral' 
      ? EMOTION_SHAPES[currentEmotion] 
      : EMOTION_SHAPES.speaking;
    startAnimation();
  } else {
    container.classList.remove('speaking');
    targetShape = currentEmotion !== 'neutral'
      ? EMOTION_SHAPES[currentEmotion]
      : EMOTION_SHAPES.neutral;
    smoothWindDown();
  }
}

export function setListening(listening: boolean): void {
  if (!container) return;
  
  if (listening) {
    container.classList.add('listening');
    container.classList.remove('speaking', 'thinking');
    startAnimation();
  } else {
    container.classList.remove('listening');
  }
}

export function setThinking(thinking: boolean): void {
  if (!container) return;
  
  if (thinking) {
    container.classList.add('thinking');
    container.classList.remove('speaking', 'listening');
    startAnimation();
  } else {
    container.classList.remove('thinking');
  }
}

export function setVolume(volume: number): void {
  lastVolume = Math.max(0, Math.min(1, volume));
  // Debug: Log volume occasionally to verify data is flowing
  if (Math.random() < 0.02 && volume > 0.001) {
    console.log(`🎵 Waveform volume: ${(volume * 100).toFixed(1)}%`);
  }
}

export function setPersona(personaId: PersonaId): void {
  currentConfig = PERSONA_CONFIGS[personaId] || PERSONA_CONFIGS.default;
  updateBarsStyle();
}

export function setEmotion(emotion: VoiceEmotion, intensity: number = 1): void {
  if (!container) return;
  
  currentEmotion = emotion;
  
  // Set target shape based on emotion
  const emotionShape = EMOTION_SHAPES[emotion] || EMOTION_SHAPES.neutral;
  targetShape = emotionShape;
  
  // Update UI classes
  container.classList.add('has-emotion');
  container.setAttribute('data-emotion', emotion);
  
  // Show emotion indicator
  if (emotionIndicator) {
    const emotionEmojis: Record<VoiceEmotion, string> = {
      neutral: '',
      happy: '😊',
      excited: '🎉',
      sad: '😢',
      anxious: '😰',
      frustrated: '😤',
      calm: '😌',
    };
    emotionIndicator.textContent = emotionEmojis[emotion] || '';
    emotionIndicator.style.opacity = String(intensity);
  }
  
  // Start animation to morph into shape
  startAnimation();
  
  // Clear emotion after duration
  setTimeout(() => {
    if (currentEmotion === emotion) {
      container?.classList.remove('has-emotion');
      container?.removeAttribute('data-emotion');
      currentEmotion = 'neutral';
      targetShape = isSpeaking ? EMOTION_SHAPES.speaking : EMOTION_SHAPES.neutral;
      if (emotionIndicator) emotionIndicator.textContent = '';
    }
  }, 4000);
}

export function celebrate(): void {
  setEmotion('excited', 1);
  container?.classList.add('celebrating');
  setTimeout(() => container?.classList.remove('celebrating'), 1000);
}

export function thinkPulse(): void {
  container?.classList.add('think-pulse');
  setTimeout(() => container?.classList.remove('think-pulse'), 600);
}

/**
 * Set transitioning state during agent handoffs.
 * Creates a shimmer/loading effect.
 */
export function setTransitioning(transitioning: boolean): void {
  isTransitioning = transitioning;
  if (!container) return;
  
  if (transitioning) {
    container.classList.add('transitioning');
    // Set a gentle shimmer shape
    targetShape = {
      curve: [0.3, 0.4, 0.5, 0.6, 0.7, 0.6, 0.5, 0.4, 0.3],
      jitter: 0.05,
      bounce: 0,
      speed: 0.5,
    };
    console.log('🔄 Waveform: transitioning ON');
  } else {
    container.classList.remove('transitioning');
    // Return to speaking or neutral
    targetShape = isSpeaking ? EMOTION_SHAPES.speaking : EMOTION_SHAPES.neutral;
    console.log('🔄 Waveform: transitioning OFF');
  }
}

// ============================================================================
// ANIMATION ENGINE
// ============================================================================

function startAnimation(): void {
  if (animationId !== null) return;
  
  lastTimestamp = performance.now();
  
  const animate = (timestamp: number) => {
    const deltaTime = Math.min(timestamp - lastTimestamp, 50);
    lastTimestamp = timestamp;
    
    // Update phase
    const shapeSpeed = targetShape.speed * currentConfig.speed;
    wavePhase += deltaTime * 0.004 * shapeSpeed;
    
    // Smooth volume - use faster response for more reactive feel
    // Higher factor = faster response (less smoothing)
    const smoothingFactor = Math.max(0.3, 1 - currentConfig.smoothing * 0.7);
    smoothedVolume += (lastVolume - smoothedVolume) * smoothingFactor;
    
    // Interpolate shape curve toward target
    interpolateShape();
    
    // Update bars
    updateBars();
    
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

function interpolateShape(): void {
  // Smoothly morph between current shape and target shape
  const lerpFactor = 0.08;
  
  for (let i = 0; i < BAR_COUNT; i++) {
    const target = targetShape.curve[i] ?? 0.5;
    const current = interpolatedCurve[i] ?? 0.5;
    interpolatedCurve[i] = current + (target - current) * lerpFactor;
  }
  
  // Also interpolate shape properties
  currentShape = {
    curve: [...interpolatedCurve],
    jitter: currentShape.jitter + (targetShape.jitter - currentShape.jitter) * lerpFactor,
    bounce: currentShape.bounce + (targetShape.bounce - currentShape.bounce) * lerpFactor,
    speed: currentShape.speed + (targetShape.speed - currentShape.speed) * lerpFactor,
  };
}

function updateBars(): void {
  const isThinking = container?.classList.contains('thinking');
  const isListening = container?.classList.contains('listening');
  
  for (let i = 0; i < BAR_COUNT; i++) {
    const shapeCurve = currentShape.curve[i] ?? 0.5;
    let targetHeight: number;
    
    if (isTransitioning) {
      // Shimmer effect during handoff - gentle wave that travels across bars
      const shimmerWave = Math.sin(wavePhase * 2 + i * 0.4) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + shimmerWave * MAX_BAR_HEIGHT * 0.4;
    } else if (isSpeaking) {
      // Lower threshold - even small volume should be detected
      const hasRealVolume = smoothedVolume > 0.005;
      
      if (hasRealVolume) {
        // Real volume + shape curve - boost the volume effect
        const volumeFactor = Math.pow(smoothedVolume, 0.7) * currentConfig.energy * 1.5;
        const baseHeight = shapeCurve * MAX_BAR_HEIGHT * Math.min(1, volumeFactor);
        
        // Add wave motion
        const wave = Math.sin(wavePhase * 3 + i * 0.5) * currentShape.bounce * 8;
        
        // Add jitter
        const jitter = (Math.random() - 0.5) * currentShape.jitter * 15;
        
        targetHeight = MIN_BAR_HEIGHT + baseHeight + wave + jitter;
      } else {
        // Simulated speech with shape
        const talkMotion = Math.sin(wavePhase * 4 + i * 0.4) * 0.5 + 0.5;
        const variation = Math.sin(wavePhase * 7 + i * 0.8) * 0.3;
        
        const baseHeight = shapeCurve * MAX_BAR_HEIGHT * currentConfig.energy;
        const motionHeight = baseHeight * (0.3 + talkMotion * 0.5 + variation * 0.2);
        
        // Add bounce
        const bounce = Math.sin(wavePhase * 5 + i * 0.6) * currentShape.bounce * 6;
        
        // Add jitter
        const jitter = (Math.random() - 0.5) * currentShape.jitter * 10;
        
        targetHeight = MIN_BAR_HEIGHT + motionHeight + bounce + jitter;
      }
    } else if (isThinking) {
      // Thinking wave with shape influence
      const thinkWave = Math.sin(wavePhase * 2 + i * 0.6) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT * 0.25 * shapeCurve) * thinkWave;
    } else if (isListening) {
      // Listening breath with shape
      const breathe = Math.sin(wavePhase * 0.8) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT * 0.15 * shapeCurve) * breathe;
    } else {
      // Idle - subtle shape presence
      const idle = Math.sin(wavePhase * 0.5 + i * 0.3) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT * 0.08 * shapeCurve) * idle;
    }
    
    barTargets[i] = Math.max(MIN_BAR_HEIGHT, Math.min(MAX_BAR_HEIGHT, targetHeight));
  }
  
  // Smooth interpolation
  const lerpFactor = 0.2;
  
  for (let i = 0; i < BAR_COUNT; i++) {
    const currentHeight = barHeights[i] ?? MIN_BAR_HEIGHT;
    const targetHeight = barTargets[i] ?? MIN_BAR_HEIGHT;
    const newHeight = currentHeight + (targetHeight - currentHeight) * lerpFactor;
    barHeights[i] = Math.max(MIN_BAR_HEIGHT, Math.min(MAX_BAR_HEIGHT, newHeight));
    
    const bar = bars[i];
    if (bar) {
      bar.style.height = `${barHeights[i]}px`;
    }
  }
}

function smoothWindDown(): void {
  const windDown = () => {
    let allSettled = true;
    
    for (let i = 0; i < BAR_COUNT; i++) {
      barTargets[i] = MIN_BAR_HEIGHT;
      const height = barHeights[i] ?? MIN_BAR_HEIGHT;
      if (height > MIN_BAR_HEIGHT + 1) {
        allSettled = false;
      }
    }
    
    if (!allSettled && !isSpeaking) {
      requestAnimationFrame(windDown);
    }
  };
  
  windDown();
}

function resetBarsToIdle(): void {
  for (let i = 0; i < BAR_COUNT; i++) {
    barHeights[i] = MIN_BAR_HEIGHT;
    barTargets[i] = MIN_BAR_HEIGHT;
    interpolatedCurve[i] = EMOTION_SHAPES.neutral.curve[i] ?? 0.5;
    const bar = bars[i];
    if (bar) {
      bar.style.height = `${MIN_BAR_HEIGHT}px`;
    }
  }
}

function updateBarsStyle(): void {
  if (!container) return;
  
  container.style.setProperty('--waveform-color', currentConfig.color);
  
  bars.forEach(bar => {
    bar.style.setProperty('--bar-color', currentConfig.color);
  });
}

// ============================================================================
// CLEANUP & EXPORTS
// ============================================================================

export function dispose(): void {
  stopAnimation();
  container = null;
  barsContainer = null;
  bars = [];
  emotionIndicator = null;
}

export const waveformUI = {
  init: initWaveformUI,
  start,
  stop,
  setSpeaking,
  setListening,
  setThinking,
  setTransitioning,
  setPersona,
  setEmotion,
  setVolume,
  celebrate,
  thinkPulse,
  dispose,
};
