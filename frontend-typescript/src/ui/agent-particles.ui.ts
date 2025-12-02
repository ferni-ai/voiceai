/**
 * Agent Particles UI
 * 
 * Beautiful, expressive particle system that represents each agent's personality.
 * Features persona-specific colors, animations, and a warm coffee cup aesthetic.
 * 
 * Positioned above the connect button in the main area.
 */

import type { PersonaId } from '../types/persona.js';
import { tsParticles } from '@tsparticles/engine';
import { loadSlim } from '@tsparticles/slim';
import type { Container, ISourceOptions, MoveDirection } from '@tsparticles/engine';
import { addClass, removeClass } from '../utils/dom.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTAINER_ID = 'agent-particles';

// ============================================================================
// PERSONA PARTICLE CONFIGS
// ============================================================================

/**
 * Each persona has a unique visual signature expressed through particles.
 */
interface PersonaParticleConfig {
  colors: string[];
  emojis?: string[];
  speed: { min: number; max: number };
  direction: MoveDirection;
  size: { min: number; max: number };
  number: number;
  shape: 'circle' | 'star' | 'polygon' | 'image';
  glow: boolean;
  twinkle: boolean;
  wobble: boolean;
  description: string;
}

const PERSONA_PARTICLES: Record<PersonaId | 'default', PersonaParticleConfig> = {
  // Ferni (Coach) - Warm, welcoming coffee vibes ☕
  'jack-b': {
    colors: ['#8B4513', '#D2691E', '#CD853F', '#F4A460', '#DEB887', '#FFDAB9'],
    emojis: ['☕'],
    speed: { min: 0.3, max: 1 },
    direction: 'top' as MoveDirection,
    size: { min: 3, max: 8 },
    number: 30,
    shape: 'circle',
    glow: true,
    twinkle: true,
    wobble: true,
    description: 'Warm coffee steam rising',
  },
  
  // Jack Bogle - Steady, reliable mentor red
  'jack-bogle': {
    colors: ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca'],
    speed: { min: 0.2, max: 0.6 },
    direction: 'top' as MoveDirection,
    size: { min: 2, max: 5 },
    number: 25,
    shape: 'circle',
    glow: true,
    twinkle: false,
    wobble: false,
    description: 'Steady upward growth',
  },
  
  // Peter Lynch - Energetic stock picker green
  'peter-lynch': {
    colors: ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
    speed: { min: 1, max: 3 },
    direction: 'none' as MoveDirection,
    size: { min: 2, max: 6 },
    number: 45,
    shape: 'star',
    glow: true,
    twinkle: true,
    wobble: true,
    description: 'Dynamic stock energy',
  },
  
  // Alex - Clean, professional cyan/blue
  'comm-specialist': {
    colors: ['#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc'],
    speed: { min: 0.5, max: 1.5 },
    direction: 'top-right' as MoveDirection,
    size: { min: 2, max: 4 },
    number: 35,
    shape: 'circle',
    glow: true,
    twinkle: true,
    wobble: false,
    description: 'Messages flowing',
  },
  
  // Maya - Warm, supportive purple/lavender
  'spend-save': {
    colors: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
    speed: { min: 0.3, max: 0.8 },
    direction: 'top' as MoveDirection,
    size: { min: 3, max: 6 },
    number: 28,
    shape: 'circle',
    glow: true,
    twinkle: true,
    wobble: true,
    description: 'Gentle savings growth',
  },
  
  // Jordan - Exciting, adventurous pink/magenta
  'event-planner': {
    colors: ['#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8'],
    speed: { min: 1, max: 2.5 },
    direction: 'none' as MoveDirection,
    size: { min: 2, max: 5 },
    number: 50,
    shape: 'star',
    glow: true,
    twinkle: true,
    wobble: true,
    description: 'Celebration sparkles',
  },
  
  // Default fallback
  'default': {
    colors: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'],
    speed: { min: 0.5, max: 1.5 },
    direction: 'top' as MoveDirection,
    size: { min: 2, max: 5 },
    number: 30,
    shape: 'circle',
    glow: true,
    twinkle: true,
    wobble: false,
    description: 'Neutral flow',
  },
};

// Coffee cup steam colors are used in PERSONA_PARTICLES['jack-b']
// Keeping the warm brown palette consistent for the coffee aesthetic

// ============================================================================
// STATE
// ============================================================================

let particlesContainer: Container | null = null;
let particlesInitialized = false;
let currentPersona: PersonaId = 'jack-b';
let isActive = false;
let intensity = 0.5; // 0-1 based on audio/activity

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the agent particles system.
 */
export async function initAgentParticles(): Promise<void> {
  try {
    // Create container element
    createParticleContainer();
    
    // Load tsParticles engine
    if (!particlesInitialized) {
      await loadSlim(tsParticles);
      particlesInitialized = true;
      console.log('✅ Agent particles engine loaded');
    }
  } catch (error) {
    console.error('Failed to initialize agent particles:', error);
  }
}

/**
 * Create the particle container element in the DOM.
 */
function createParticleContainer(): void {
  let container = document.getElementById(CONTAINER_ID);
  
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'agent-particles';
    container.setAttribute('aria-hidden', 'true');
    
    // Insert into main, before the waveform
    const main = document.querySelector('.main');
    const waveform = document.getElementById('waveformContainer');
    
    if (main && waveform) {
      main.insertBefore(container, waveform);
    } else if (main) {
      main.insertBefore(container, main.firstChild);
    }
  }
}

// ============================================================================
// PARTICLE OPTIONS
// ============================================================================

/**
 * Generate particle options for a persona.
 */
function getParticleOptions(personaId: PersonaId, intensityLevel: number): ISourceOptions {
  const config = PERSONA_PARTICLES[personaId] || PERSONA_PARTICLES.default;
  const multiplier = 0.5 + intensityLevel * 0.5;
  
  // Special coffee steam effect for Ferni
  const isCoffeeMode = personaId === 'jack-b';
  
  return {
    fullScreen: false,
    fpsLimit: 60,
    particles: {
      number: {
        value: Math.floor(config.number * multiplier),
        density: {
          enable: true,
          width: 300,
          height: 200,
        },
      },
      color: {
        value: config.colors,
      },
      shape: {
        type: config.shape === 'star' ? 'star' : 'circle',
        ...(config.shape === 'star' && {
          options: {
            star: {
              sides: 5,
            },
          },
        }),
      },
      opacity: {
        value: { min: 0.3, max: 0.8 * multiplier },
        animation: {
          enable: config.twinkle,
          speed: 1,
          startValue: 'random',
          sync: false,
        },
      },
      size: {
        value: {
          min: config.size.min,
          max: config.size.max * multiplier,
        },
        animation: {
          enable: true,
          speed: isCoffeeMode ? 1 : 2,
          startValue: 'random',
          sync: false,
        },
      },
      move: {
        enable: true,
        speed: {
          min: config.speed.min * multiplier,
          max: config.speed.max * multiplier,
        },
        direction: config.direction,
        random: config.wobble,
        straight: false,
        outModes: {
          default: 'out',
          bottom: isCoffeeMode ? 'none' : 'out',
          top: 'out',
        },
        // Coffee steam has a gentle wave
        ...(isCoffeeMode && {
          path: {
            enable: true,
            delay: { value: 0 },
          },
          drift: {
            min: -1,
            max: 1,
          },
        }),
      },
      // Glow effect
      ...(config.glow && {
        shadow: {
          enable: true,
          blur: 8,
          color: config.colors[0],
        },
      }),
      // Life cycle for continuous renewal
      life: {
        duration: {
          value: isCoffeeMode ? 4 : 3,
          sync: false,
        },
        delay: {
          value: 0.5,
          sync: false,
        },
      },
    },
    detectRetina: true,
    background: {
      color: 'transparent',
    },
    // Emitter at the bottom for rising effect
    emitters: {
      position: {
        x: 50,
        y: isCoffeeMode ? 95 : 100, // Coffee steam comes from "cup" at bottom
      },
      rate: {
        quantity: Math.ceil(2 * multiplier),
        delay: 0.15,
      },
      size: {
        width: isCoffeeMode ? 60 : 100,
        height: 0,
      },
    },
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start the particle system for a persona.
 */
export async function start(personaId?: PersonaId): Promise<void> {
  if (!particlesInitialized) {
    await initAgentParticles();
  }
  
  isActive = true;
  currentPersona = personaId || currentPersona;
  
  const containerEl = document.getElementById(CONTAINER_ID);
  if (containerEl) {
    addClass(containerEl, 'active');
    // Add persona-specific class
    updatePersonaClass(containerEl, currentPersona);
  }
  
  await updateParticles();
  console.log(`🎨 Agent particles started: ${currentPersona}`);
}

/**
 * Update the persona-specific CSS class on the container.
 */
function updatePersonaClass(element: HTMLElement, personaId: PersonaId): void {
  // Remove old persona classes
  const classes = element.className.split(' ');
  const personaClasses = classes.filter(c => c.startsWith('persona-'));
  personaClasses.forEach(c => removeClass(element, c));
  
  // Add new persona class
  addClass(element, `persona-${personaId}`);
}

/**
 * Stop the particle system.
 */
export function stop(): void {
  isActive = false;
  
  const containerEl = document.getElementById(CONTAINER_ID);
  if (containerEl) {
    removeClass(containerEl, 'active');
  }
  
  if (particlesContainer) {
    particlesContainer.destroy();
    particlesContainer = null;
  }
}

/**
 * Set the current persona (triggers visual transition).
 */
export async function setPersona(personaId: PersonaId): Promise<void> {
  if (personaId === currentPersona && particlesContainer) {
    return;
  }
  
  console.log(`🎭 Particle persona switch: ${currentPersona} → ${personaId}`);
  currentPersona = personaId;
  
  // Update CSS class
  const containerEl = document.getElementById(CONTAINER_ID);
  if (containerEl) {
    updatePersonaClass(containerEl, personaId);
  }
  
  if (isActive) {
    await updateParticles();
  }
}

/**
 * Set intensity level (0-1) based on audio volume or activity.
 */
export function setIntensity(level: number): void {
  intensity = Math.max(0, Math.min(1, level));
  
  // Emit extra particles on high intensity
  if (intensity > 0.6 && particlesContainer && isActive) {
    const emitCount = Math.floor(intensity * 5);
    for (let i = 0; i < emitCount; i++) {
      particlesContainer.particles.addParticle({
        x: 150 + (Math.random() - 0.5) * 100,
        y: 180,
      });
    }
  }
}

/**
 * Trigger a burst effect (for celebrations, handoffs, etc.)
 */
export async function burst(count = 20): Promise<void> {
  if (!particlesContainer || !isActive) return;
  
  for (let i = 0; i < count; i++) {
    particlesContainer.particles.addParticle({
      x: 150 + (Math.random() - 0.5) * 150,
      y: 180 + (Math.random() - 0.5) * 50,
    });
  }
}

/**
 * Clean up resources.
 */
export function dispose(): void {
  stop();
  
  const containerEl = document.getElementById(CONTAINER_ID);
  if (containerEl) {
    containerEl.remove();
  }
}

// ============================================================================
// INTERNAL
// ============================================================================

/**
 * Update or create particles with current config.
 */
async function updateParticles(): Promise<void> {
  if (!particlesInitialized || !isActive) return;
  
  const options = getParticleOptions(currentPersona, intensity);
  
  try {
    // Destroy existing
    if (particlesContainer) {
      particlesContainer.destroy();
      particlesContainer = null;
    }
    
    // Create new
    const loaded = await tsParticles.load({
      id: CONTAINER_ID,
      options,
    });
    particlesContainer = loaded ?? null;
  } catch (error) {
    console.error('Failed to update agent particles:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const agentParticlesUI = {
  init: initAgentParticles,
  start,
  stop,
  setPersona,
  setIntensity,
  burst,
  dispose,
};

