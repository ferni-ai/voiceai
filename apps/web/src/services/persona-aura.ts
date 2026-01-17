/**
 * Persona Aura Service
 * 
 * Creates ambient persona awareness through:
 * - data-persona attribute on document root
 * - Subtle background glow that shifts with active persona
 * - CSS variables for persona-specific theming
 * 
 * BRAND PHILOSOPHY:
 * The persona's presence should feel like a warm glow in the room,
 * not a harsh spotlight. Users should feel the persona without
 * consciously noticing the UI changes.
 * 
 * @module @ferni/persona-aura
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('PersonaAura');

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'maya' | 'alex' | 'jordan' | 'peter' | 'nayan';

export interface PersonaAuraConfig {
  id: PersonaId;
  name: string;
  primary: string;
  secondary: string;
  glow: string;
  tint: string;
}

// ============================================================================
// PERSONA CONFIGURATIONS
// ============================================================================

const PERSONA_AURAS: Record<PersonaId, PersonaAuraConfig> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    primary: '#4a6741',     // Sage green
    secondary: '#3d5a35',
    glow: 'rgba(74, 103, 65, 0.15)',
    tint: 'rgba(74, 103, 65, 0.08)',
  },
  maya: {
    id: 'maya',
    name: 'Maya',
    primary: '#a67a6a',     // Warm terracotta
    secondary: '#8a635a',
    glow: 'rgba(166, 122, 106, 0.15)',
    tint: 'rgba(166, 122, 106, 0.08)',
  },
  alex: {
    id: 'alex',
    name: 'Alex',
    primary: '#5a6b8a',     // Calm slate blue
    secondary: '#4a5a73',
    glow: 'rgba(90, 107, 138, 0.15)',
    tint: 'rgba(90, 107, 138, 0.08)',
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    primary: '#c4856a',     // Warm coral
    secondary: '#a86d55',
    glow: 'rgba(196, 133, 106, 0.15)',
    tint: 'rgba(196, 133, 106, 0.08)',
  },
  peter: {
    id: 'peter',
    name: 'Peter',
    primary: '#3a6b73',     // Deep teal
    secondary: '#2d5359',
    glow: 'rgba(58, 107, 115, 0.15)',
    tint: 'rgba(58, 107, 115, 0.08)',
  },
  nayan: {
    id: 'nayan',
    name: 'Nayan',
    primary: '#b8956a',     // Golden amber
    secondary: '#9a7a52',
    glow: 'rgba(184, 149, 106, 0.15)',
    tint: 'rgba(184, 149, 106, 0.08)',
  },
};

// ============================================================================
// STATE
// ============================================================================

let currentPersona: PersonaId = 'ferni';
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get persona configuration by ID
 */
export function getPersonaConfig(personaId: PersonaId): PersonaAuraConfig {
  return PERSONA_AURAS[personaId] || PERSONA_AURAS.ferni;
}

/**
 * Apply persona aura to the document
 */
export function applyPersonaAura(
  personaId: PersonaId,
  element: HTMLElement = document.documentElement
): void {
  const config = getPersonaConfig(personaId);
  
  // Update data attribute
  element.setAttribute('data-persona', personaId);
  
  // Update CSS variables
  element.style.setProperty('--persona-primary', config.primary);
  element.style.setProperty('--persona-secondary', config.secondary);
  element.style.setProperty('--persona-glow', config.glow);
  element.style.setProperty('--persona-tint', config.tint);
  element.style.setProperty('--persona-name', `"${config.name}"`);
  
  currentPersona = personaId;
  log.debug('Persona aura applied:', personaId);
}

/**
 * Get current persona
 */
export function getCurrentPersona(): PersonaId {
  return currentPersona;
}

/**
 * Inject the ambient aura styles
 */
function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.setAttribute('data-persona-aura-styles', '');
  styleElement.textContent = `
    /* ========================================================================
       PERSONA AURA - Ambient Background Glow
       Subtle presence that feels like the persona is "in the room"
       ======================================================================== */
    
    /* Base aura layer - positioned behind everything */
    .app-container::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: -1;
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        var(--persona-tint, rgba(74, 103, 65, 0.08)) 0%,
        transparent 70%
      );
      transition: background ${DURATION.DELIBERATE}ms ${EASING.GENTLE};
      animation: personaAuraBreathe 8s ease-in-out infinite;
    }
    
    /* Subtle glow pulse */
    @keyframes personaAuraBreathe {
      0%, 100% {
        opacity: 0.6;
        transform: scale(1);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.02);
      }
    }
    
    /* Dark theme: More pronounced glow */
    [data-theme="midnight"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        var(--persona-glow, rgba(74, 103, 65, 0.15)) 0%,
        transparent 70%
      );
    }
    
    /* Accent line - subtle persona indicator at top */
    .app-container::after {
      content: '';
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 40%;
      height: 2px;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--persona-primary, #4a6741) 50%,
        transparent 100%
      );
      opacity: 0.3;
      pointer-events: none;
      z-index: 9999;
      transition: background ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    /* ========================================================================
       PERSONA-SPECIFIC ENHANCEMENTS
       ======================================================================== */
    
    /* Ferni - Sage green, grounding presence */
    [data-persona="ferni"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        rgba(74, 103, 65, 0.08) 0%,
        transparent 70%
      );
    }
    
    /* Maya - Warm terracotta, nurturing presence */
    [data-persona="maya"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        rgba(166, 122, 106, 0.08) 0%,
        transparent 70%
      );
    }
    
    /* Alex - Slate blue, calm analytical presence */
    [data-persona="alex"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        rgba(90, 107, 138, 0.08) 0%,
        transparent 70%
      );
    }
    
    /* Jordan - Warm coral, energetic presence */
    [data-persona="jordan"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        rgba(196, 133, 106, 0.08) 0%,
        transparent 70%
      );
    }
    
    /* Peter - Deep teal, thoughtful presence */
    [data-persona="peter"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        rgba(58, 107, 115, 0.08) 0%,
        transparent 70%
      );
    }
    
    /* Nayan - Golden amber, wise presence */
    [data-persona="nayan"] .app-container::before {
      background: radial-gradient(
        ellipse 80% 60% at 50% 40%,
        rgba(184, 149, 106, 0.08) 0%,
        transparent 70%
      );
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .app-container::before {
        animation: none;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize persona aura system
 */
export function initPersonaAura(): void {
  if (isInitialized) return;
  
  injectStyles();
  
  // Apply default persona
  applyPersonaAura('ferni');
  
  // Listen for persona changes from multiple event sources
  // Different parts of the app use different event names - we listen to all
  const handlePersonaChange = (personaId: PersonaId | string) => {
    // Normalize persona ID (some events use 'alex-chen', we want 'alex')
    const normalized = (personaId?.toString() || 'ferni').split('-')[0] as PersonaId;
    if (PERSONA_AURAS[normalized]) {
      applyPersonaAura(normalized);
    }
  };
  
  // Event 1: ferni:switch-persona (from team roster, command palette, keyboard shortcuts)
  document.addEventListener('ferni:switch-persona', ((e: CustomEvent) => {
    handlePersonaChange(e.detail?.personaId || e.detail?.persona);
  }) as EventListener);
  
  // Event 2: personachange (from theme system)
  window.addEventListener('personachange', ((e: CustomEvent) => {
    handlePersonaChange(e.detail?.persona);
  }) as EventListener);
  
  // Event 3: ferni:persona-change (legacy support)
  document.addEventListener('ferni:persona-change', ((e: CustomEvent) => {
    handlePersonaChange(e.detail?.persona || e.detail?.personaId);
  }) as EventListener);
  
  isInitialized = true;
  log.info('Persona aura system initialized');
}

/**
 * Dispose persona aura system
 */
export function disposePersonaAura(): void {
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
  isInitialized = false;
  log.info('Persona aura system disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personaAura = {
  init: initPersonaAura,
  dispose: disposePersonaAura,
  injectStyles,
  apply: applyPersonaAura,
  get: getCurrentPersona,
  getConfig: getPersonaConfig,
};

export default personaAura;
