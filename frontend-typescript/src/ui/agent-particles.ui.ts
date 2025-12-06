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
import { getParticleProfile, type ParticleProfile } from '@design-system/tokens';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Particles');

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTAINER_ID = 'agent-particles';

// ============================================================================
// DESIGN SYSTEM INTEGRATION
// ============================================================================

/**
 * Get persona colors from CSS variables (design system integration)
 */
function getPersonaColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const primary = style.getPropertyValue('--persona-primary').trim();
  const secondary = style.getPropertyValue('--persona-secondary').trim();

  if (primary && secondary) {
    return [primary, secondary];
  }
  if (primary) {
    return [primary];
  }
  // Fallback to accent color
  const accent = style.getPropertyValue('--color-accent-primary').trim();
  return accent ? [accent] : ['#4a6741']; // Ferni sage green fallback
}

// Runtime behavior interface (extends design system profile)
interface PersonaParticleBehavior {
  speed: { min: number; max: number };
  direction: MoveDirection;
  size: { min: number; max: number };
  number: number;
  shape: 'circle' | 'star' | 'polygon' | 'image';
  glow: boolean;
  twinkle: boolean;
  wobble: boolean;
  description: string;
  isCoffeeMode?: boolean;
}

/**
 * Convert design system particle profile to runtime behavior.
 */
function profileToBehavior(profile: ParticleProfile, personaId?: string): PersonaParticleBehavior {
  return {
    speed: profile.speed,
    direction: profile.direction as MoveDirection,
    size: profile.size,
    number: profile.count,
    shape: profile.shape as 'circle' | 'star' | 'polygon' | 'image',
    glow: profile.glow,
    twinkle: profile.twinkle,
    wobble: profile.wobble,
    description: profile.description,
    isCoffeeMode: personaId === 'ferni' || personaId === 'jack-b',
  };
}

/**
 * Get particle behavior for a persona from design system.
 */
function getPersonaBehavior(personaId: string): PersonaParticleBehavior {
  const profile = getParticleProfile(personaId);
  return profileToBehavior(profile, personaId);
}

// ============================================================================
// STATE
// ============================================================================

let particlesContainer: Container | null = null;
let particlesInitialized = false;
let currentPersona: PersonaId = 'ferni';
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
    }
  } catch (error) {
    log.error('Failed to initialize agent particles:', error);
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
 * Colors are read from CSS variables (design system integration)
 */
function getParticleOptions(personaId: PersonaId, intensityLevel: number): ISourceOptions {
  const behavior = getPersonaBehavior(personaId);
  const colors = getPersonaColors(); // Read from CSS
  const multiplier = 0.5 + intensityLevel * 0.5;

  // Special coffee steam effect for Ferni
  const isCoffeeMode = behavior.isCoffeeMode === true;
  
  return {
    fullScreen: false,
    fpsLimit: 60,
    particles: {
      number: {
        value: Math.floor(behavior.number * multiplier),
        density: {
          enable: true,
          width: 300,
          height: 200,
        },
      },
      color: {
        value: colors,
      },
      shape: {
        type: behavior.shape === 'star' ? 'star' : 'circle',
        ...(behavior.shape === 'star' && {
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
          enable: behavior.twinkle,
          speed: 1,
          startValue: 'random',
          sync: false,
        },
      },
      size: {
        value: {
          min: behavior.size.min,
          max: behavior.size.max * multiplier,
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
          min: behavior.speed.min * multiplier,
          max: behavior.speed.max * multiplier,
        },
        direction: behavior.direction,
        random: behavior.wobble,
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
      ...(behavior.glow && {
        shadow: {
          enable: true,
          blur: 8,
          color: colors[0],
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
  currentPersona = personaId ?? currentPersona;
  
  const containerEl = document.getElementById(CONTAINER_ID);
  if (containerEl) {
    addClass(containerEl, 'active');
    // Add persona-specific class
    updatePersonaClass(containerEl, currentPersona);
  }
  
  await updateParticles();
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
export function burst(count = 20): void {
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
    log.error('Failed to update agent particles:', error);
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

