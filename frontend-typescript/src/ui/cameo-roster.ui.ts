/**
 * Cameo Roster UI - Team Member Pop-In Animations
 *
 * When a team member does a "cameo" (quick pop-in during Ferni's conversation),
 * they physically appear in the roster:
 *
 * POP IN:
 * 1. Ferni shifts left to make room
 * 2. Cameo persona pops in beside Ferni (with fun bounce)
 * 3. Gentle glow indicates they're the one speaking
 *
 * POP OUT:
 * 1. Cameo persona slides toward the "More" button
 * 2. Shrinks and disappears "into" the button (like going back to the drawer)
 * 3. Ferni shifts back to original position
 *
 * This creates a spatial, playful feel - like team members are physically
 * joining and leaving the conversation.
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getPersonaColorConfig } from '../config/persona-colors.js';
import { getPersona } from '../config/personas.js';
import { cameoService } from '../services/cameo.service.js';
import type { PersonaId } from '../types/persona.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CameoRoster');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;

// Current cameo state
let activeCameoPersona: PersonaId | null = null;
let cameoElement: HTMLElement | null = null;

// Element references
let rosterContainer: HTMLElement | null = null;
let ferniElement: HTMLElement | null = null;
let marketplaceBtn: HTMLElement | null = null;
let teamDivider: HTMLElement | null = null;

// Animation state
let currentAnimation: Animation | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initCameoRoster(): void {
  if (isInitialized) return;

  // Inject styles first (always needed)
  injectCameoRosterStyles();

  // Subscribe to cameo events
  cameoService.onCameoStart(handleCameoStart);
  cameoService.onCameoEnd(handleCameoEnd);

  isInitialized = true;
  log.info('Cameo roster initialized (elements will be found on demand)');
}

/**
 * Find roster elements fresh each time (roster is dynamically built)
 */
function findRosterElements(): boolean {
  rosterContainer = document.getElementById('teamRoster');
  if (!rosterContainer) {
    log.warn('Team roster not found');
    return false;
  }

  // Find Ferni's element (the coordinator)
  ferniElement = rosterContainer.querySelector('[data-persona-id="ferni"]');
  if (!ferniElement) {
    log.warn('Ferni element not found');
    return false;
  }

  // Find the divider (added after Ferni in dynamic roster)
  teamDivider = rosterContainer.querySelector('.team-divider:not(.team-divider--marketplace)');

  // Find marketplace button
  marketplaceBtn = document.getElementById('marketplaceBtn');

  log.debug('Found roster elements:', {
    ferni: !!ferniElement,
    divider: !!teamDivider,
    marketplace: !!marketplaceBtn,
  });

  return true;
}

export function disposeCameoRoster(): void {
  if (cameoElement) {
    cameoElement.remove();
    cameoElement = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  if (currentAnimation) {
    currentAnimation.cancel();
    currentAnimation = null;
  }

  activeCameoPersona = null;
  isInitialized = false;
}

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

const ROSTER_RETRY_CONFIG = {
  /** Max retries when roster elements not found */
  MAX_RETRIES: 5,
  /** Delay between retries (ms) - increases with each retry */
  BASE_DELAY: 100,
  /** Max total time to wait for roster (ms) */
  MAX_WAIT: 2000,
};

// ============================================================================
// CAMEO HANDLERS
// ============================================================================

/**
 * Find roster elements with retry logic
 * The roster is dynamically built and may not be ready when cameo triggers
 */
async function findRosterElementsWithRetry(): Promise<boolean> {
  for (let attempt = 0; attempt < ROSTER_RETRY_CONFIG.MAX_RETRIES; attempt++) {
    if (findRosterElements()) {
      if (attempt > 0) {
        log.info(`🎬 Roster elements found on attempt ${attempt + 1}`);
      }
      return true;
    }

    // Wait with exponential backoff
    const delay = ROSTER_RETRY_CONFIG.BASE_DELAY * Math.pow(1.5, attempt);
    if (delay > ROSTER_RETRY_CONFIG.MAX_WAIT) {
      break;
    }

    log.debug(`🎬 Roster not ready, retrying in ${delay}ms (attempt ${attempt + 1})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return false;
}

function handleCameoStart(personaId: string, personaName: string, isFirstCameo: boolean): void {
  log.info('🎬 Cameo pop-in:', { personaId, personaName, isFirstCameo });

  // Find elements with retry (roster is dynamically built)
  void handleCameoStartAsync(personaId, personaName, isFirstCameo);
}

async function handleCameoStartAsync(
  personaId: string,
  _personaName: string,
  isFirstCameo: boolean
): Promise<void> {
  // Find elements with retry logic
  if (!(await findRosterElementsWithRetry())) {
    log.error('Cannot start cameo - roster elements not found after retries');
    return;
  }

  // Clean up any existing cameo
  if (cameoElement) {
    cameoElement.remove();
    cameoElement = null;
  }

  activeCameoPersona = personaId as PersonaId;

  // Get persona colors
  const persona = getPersona(personaId as PersonaId);
  const colors = persona.colors || getPersonaColorConfig(personaId);
  const primaryColor = colors?.primary || '#4a6741';
  const glowColor = colors?.glow || `${primaryColor}80`; // 50% opacity fallback
  const gradient =
    colors?.gradient ||
    `linear-gradient(135deg, ${colors?.secondary || '#3d5a35'}, ${primaryColor})`;

  // Create the cameo avatar element with persona colors
  cameoElement = createCameoElement(
    personaId as PersonaId,
    persona.initials,
    persona.name,
    gradient,
    primaryColor,
    glowColor
  );

  // Phase 1: Shift Ferni left to make room
  animateFerniShift('left');

  // Phase 2: Insert and animate the cameo element
  setTimeout(() => {
    if (!cameoElement || !rosterContainer || !ferniElement) {
      log.error('Lost elements during cameo animation');
      return;
    }

    // Insert after the divider if it exists, otherwise after Ferni
    const insertAfter = teamDivider || ferniElement;
    insertAfter.insertAdjacentElement('afterend', cameoElement);

    log.debug('Inserted cameo element after:', insertAfter.className);

    // Animate pop-in
    animateCameoPopIn(cameoElement, isFirstCameo);
  }, 150);
}

function handleCameoEnd(): void {
  log.info('🎬 Cameo pop-out');

  if (!cameoElement || !activeCameoPersona) {
    log.warn('No active cameo to end');
    return;
  }

  // Re-find elements in case DOM changed
  findRosterElements();

  // Phase 1: Animate cameo sliding toward marketplace button
  animateCameoPopOut(cameoElement).then(() => {
    // Phase 2: Shift Ferni back
    animateFerniShift('back');

    // Clean up
    if (cameoElement) {
      cameoElement.remove();
      cameoElement = null;
    }
    activeCameoPersona = null;

    log.debug('Cameo cleanup complete');
  });
}

// ============================================================================
// ELEMENT CREATION
// ============================================================================

function createCameoElement(
  personaId: PersonaId,
  initials: string,
  name: string,
  gradient: string,
  primaryColor: string,
  glowColor: string
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'team-member team-member--cameo';
  element.setAttribute('data-persona-id', personaId);
  element.setAttribute('data-cameo', 'true');

  // Get first name for display
  const firstName = name.split(' ')[0] || name;

  element.innerHTML = `
    <div class="team-avatar-container">
      <div class="team-avatar-ring cameo-ring"></div>
      <div class="team-avatar" style="--persona-gradient: ${gradient};">
        ${initials}
      </div>
    </div>
    <span class="team-name">${firstName}</span>
  `;

  // Set persona color CSS variables for halo/glow
  // Start invisible and scaled down for animation
  element.style.cssText = `
    --cameo-color: ${primaryColor};
    --cameo-glow: ${glowColor};
    opacity: 0;
    transform: scale(0) translateY(10px);
    pointer-events: none;
  `;

  log.debug('Created cameo element:', { personaId, initials, firstName, primaryColor });

  return element;
}

// ============================================================================
// ANIMATIONS
// ============================================================================

/**
 * Shift Ferni left to make room, or back to original position
 */
function animateFerniShift(direction: 'left' | 'back'): void {
  if (!ferniElement) return;

  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const isShiftingLeft = direction === 'left';

  ferniElement.animate(
    [
      {
        transform: isShiftingLeft ? 'translateX(0)' : 'translateX(-8px)',
      },
      {
        transform: isShiftingLeft ? 'translateX(-8px)' : 'translateX(0)',
      },
    ],
    {
      duration: DURATION.SLOW,
      easing: EASING.SPRING_GENTLE,
      fill: 'forwards',
    }
  );

  // Also shift the divider
  if (teamDivider) {
    teamDivider.animate(
      [
        {
          transform: isShiftingLeft ? 'translateX(0)' : 'translateX(-4px)',
        },
        {
          transform: isShiftingLeft ? 'translateX(-4px)' : 'translateX(0)',
        },
      ],
      {
        duration: DURATION.SLOW,
        easing: EASING.SPRING_GENTLE,
        fill: 'forwards',
      }
    );
  }
}

/**
 * Animate the cameo avatar popping in
 */
function animateCameoPopIn(element: HTMLElement, isFirstCameo: boolean): void {
  log.debug('Animating cameo pop-in, isFirstCameo:', isFirstCameo);

  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.style.opacity = '1';
    element.style.transform = 'scale(1) translateY(0)';
    element.classList.add('cameo-speaking');
    log.debug('Reduced motion - showing immediately');
    return;
  }

  // More dramatic animation for first cameo
  const duration = isFirstCameo ? DURATION.DELIBERATE : DURATION.SLOW;

  // Clear initial hidden styles
  element.style.opacity = '0';
  element.style.transform = 'scale(0) translateY(20px)';

  currentAnimation = element.animate(
    [
      // Start: Invisible, tiny, below
      {
        opacity: '0',
        transform: 'scale(0) translateY(20px)',
        offset: 0,
      },
      // Overshoot: Pop up with bounce
      {
        opacity: '1',
        transform: 'scale(1.2) translateY(-8px)',
        offset: 0.6,
      },
      // Settle with slight squash
      {
        opacity: '1',
        transform: 'scale(0.95) translateY(2px)',
        offset: 0.8,
      },
      // Final position
      {
        opacity: '1',
        transform: 'scale(1) translateY(0)',
        offset: 1,
      },
    ],
    {
      duration,
      easing: EASING.SPRING,
      fill: 'forwards',
    }
  );

  // Add speaking glow after pop-in completes
  currentAnimation.onfinish = () => {
    // Make sure final styles are applied
    element.style.opacity = '1';
    element.style.transform = 'scale(1) translateY(0)';
    element.classList.add('cameo-speaking');
    log.debug('Cameo pop-in animation complete');
  };

  // Extra celebration for first cameo
  if (isFirstCameo) {
    setTimeout(() => {
      createWelcomeSparkles(element);
    }, duration * 0.6);
  }
}

/**
 * Animate the cameo avatar sliding out toward the marketplace button
 */
async function animateCameoPopOut(element: HTMLElement): Promise<void> {
  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.style.opacity = '0';
    return;
  }

  // Remove speaking state
  element.classList.remove('cameo-speaking');

  // Get positions for the slide
  const elementRect = element.getBoundingClientRect();
  const targetRect = marketplaceBtn?.getBoundingClientRect();

  // Calculate distance to marketplace button (or just slide right if no button)
  const slideDistance = targetRect
    ? targetRect.left - elementRect.left + targetRect.width / 2
    : 100;

  return new Promise((resolve) => {
    currentAnimation = element.animate(
      [
        // Start: Current position
        {
          opacity: 1,
          transform: 'scale(1) translateX(0)',
          offset: 0,
        },
        // Anticipation: Slight pull back
        {
          opacity: 1,
          transform: 'scale(1.05) translateX(-5px)',
          offset: 0.15,
        },
        // Slide toward button while shrinking
        {
          opacity: 0.8,
          transform: `scale(0.6) translateX(${slideDistance * 0.7}px)`,
          offset: 0.6,
        },
        // Disappear "into" the button
        {
          opacity: 0,
          transform: `scale(0.2) translateX(${slideDistance}px)`,
          offset: 1,
        },
      ],
      {
        duration: DURATION.MODERATE,
        easing: EASING.EASE_IN,
        fill: 'forwards',
      }
    );

    // Pulse the marketplace button when cameo "enters" it
    if (marketplaceBtn) {
      setTimeout(() => {
        pulseMarketplaceButton();
      }, DURATION.MODERATE * 0.7);
    }

    currentAnimation.onfinish = () => resolve();
  });
}

/**
 * Pulse the marketplace button when cameo enters it
 */
function pulseMarketplaceButton(): void {
  if (!marketplaceBtn) return;

  marketplaceBtn.animate(
    [
      { transform: 'scale(1)', boxShadow: '0 0 0 0 var(--persona-glow)' },
      { transform: 'scale(1.15)', boxShadow: '0 0 20px 5px var(--persona-glow)' },
      { transform: 'scale(1)', boxShadow: '0 0 0 0 var(--persona-glow)' },
    ],
    {
      duration: DURATION.SLOW,
      easing: EASING.SPRING_GENTLE,
    }
  );
}

/**
 * Create sparkle particles for first-time cameo
 */
function createWelcomeSparkles(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < 8; i++) {
    const sparkle = document.createElement('div');
    const angle = (i / 8) * Math.PI * 2;
    const distance = 30 + Math.random() * 20;

    sparkle.style.cssText = `
      position: fixed;
      width: 4px;
      height: 4px;
      background: white;
      border-radius: 50%;
      left: ${centerX}px;
      top: ${centerY}px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 0 6px white, 0 0 12px rgba(255, 255, 255, 0.6);
    `;

    document.body.appendChild(sparkle);

    sparkle.animate(
      [
        {
          opacity: 1,
          transform: 'translate(-50%, -50%) scale(1)',
        },
        {
          opacity: 0,
          transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0)`,
        },
      ],
      {
        duration: DURATION.MODERATE,
        easing: EASING.EASE_OUT,
      }
    );

    setTimeout(() => sparkle.remove(), DURATION.MODERATE);
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectCameoRosterStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'cameo-roster-styles';
  styleElement.textContent = `
    /* Cameo team member in roster - OVERRIDE entrance animation opacity */
    .team-member--cameo {
      position: relative;
      z-index: 10;
      /* Override entrance-roster opacity: 0 rule */
      animation: none !important;
    }

    /* Ensure visibility even during entrance animation */
    .entrance-roster .team-member--cameo,
    .app-loaded .entrance-roster .team-member--cameo {
      animation: none !important;
    }

    /* Speaking glow ring - uses --cameo-color set on element */
    .team-member--cameo .cameo-ring {
      border-color: var(--cameo-color);
      box-shadow: 0 0 0 2px var(--cameo-color);
    }

    /* Active speaking state */
    .team-member--cameo.cameo-speaking {
      opacity: 1 !important;
      transform: scale(1) translateY(0) !important;
    }

    /* Talking halo - smaller, won't clip */
    .team-member--cameo.cameo-speaking .team-avatar-container::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 50%;
      border: 2px solid var(--cameo-color);
      animation: cameo-halo-pulse 1.2s ease-in-out infinite;
      z-index: 1;
    }

    /* Glow on avatar - matches persona color */
    .team-member--cameo.cameo-speaking .team-avatar {
      box-shadow: 
        0 0 0 2px var(--cameo-color),
        0 0 10px var(--cameo-color),
        0 0 20px var(--cameo-glow);
    }

    /* Speaking label - matches persona color */
    .team-member--cameo .team-name {
      font-size: 10px;
      color: var(--cameo-color) !important;
      font-weight: 700;
      opacity: 1 !important;
      display: block !important;
    }

    /* Halo pulse - subtle */
    @keyframes cameo-halo-pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.05);
        opacity: 0.6;
      }
    }

    /* Marketplace button ready to "receive" */
    #marketplaceBtn.receiving-cameo {
      animation: marketplace-ready 0.3s ease-out;
    }

    @keyframes marketplace-ready {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    /* Mobile: ensure cameo is visible */
    @media (max-width: 767px) {
      .team-member--cameo {
        /* Ensure visible on mobile too */
        display: flex !important;
      }
      
      /* Name visible on mobile too */
      .team-member--cameo .team-name {
        display: block !important;
        font-size: 9px;
      }
    }
    
    /* Even on tiny screens, show the cameo name */
    @media (max-width: 380px) {
      .team-member--cameo .team-name {
        display: block !important;
        font-size: 8px;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .team-member--cameo.cameo-speaking .team-avatar-container::after {
        animation: none;
        opacity: 0.5;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// TESTING HELPERS
// ============================================================================

/**
 * Manually trigger a cameo pop-in for testing
 */
export function testCameoPopIn(personaId: string = 'peter-john'): void {
  log.info('🧪 Test cameo pop-in:', personaId);

  // Make sure we're initialized
  if (!isInitialized) {
    initCameoRoster();
  }

  const persona = getPersona(personaId as PersonaId);
  handleCameoStart(personaId, persona.name, true);
}

/**
 * Manually trigger a cameo pop-out for testing
 */
export function testCameoPopOut(): void {
  log.info('🧪 Test cameo pop-out');
  handleCameoEnd();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cameoRoster = {
  init: initCameoRoster,
  dispose: disposeCameoRoster,
  testPopIn: testCameoPopIn,
  testPopOut: testCameoPopOut,
};

export default cameoRoster;

// ============================================================================
// 🧪 DEV HELPER - Expose on window for console testing
// ============================================================================

if (typeof window !== 'undefined') {
  /**
   * 🎬 Cameo Roster Preview Helper
   *
   * Test cameo pop-in/pop-out in the roster from browser console:
   *
   * ```js
   * // Pop in a team member
   * cameoRoster.popIn('maya-santos')
   *
   * // Pop them back out
   * cameoRoster.popOut()
   *
   * // Quick demo
   * cameoRoster.demo()
   * ```
   */
  const cameoRosterHelper = {
    popIn: (personaId: string = 'peter-john') => {
      /* eslint-disable no-console */
      console.log('🎬 cameoRoster.popIn called with:', personaId);

      if (!isInitialized) {
        console.log('🎬 Initializing cameo roster...');
        initCameoRoster();
      }

      // Find elements and log what we found
      const found = findRosterElements();
      console.log('🎬 Elements found:', {
        found,
        rosterContainer: !!rosterContainer,
        ferniElement: !!ferniElement,
        teamDivider: !!teamDivider,
        marketplaceBtn: !!marketplaceBtn,
      });

      if (!found) {
        console.error('🎬 Cannot pop in - elements not found!');
        return;
      }

      testCameoPopIn(personaId);
      /* eslint-enable no-console */
    },

    popOut: () => {
      /* eslint-disable no-console */
      console.log('🎬 cameoRoster.popOut called');
      console.log('🎬 Active cameo:', activeCameoPersona);
      console.log('🎬 Cameo element:', cameoElement);
      /* eslint-enable no-console */
      testCameoPopOut();
    },

    demo: async () => {
      const personas = ['peter-john', 'maya-santos', 'alex-chen', 'nayan-patel', 'jordan-taylor'];
      /* eslint-disable no-console */
      console.log('🎬 Running cameo roster demo...');

      for (const persona of personas) {
        console.log('🎬 Demo: popping in', persona);
        testCameoPopIn(persona);
        await new Promise((r) => setTimeout(r, 2500));
        console.log('🎬 Demo: popping out', persona);
        testCameoPopOut();
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log('🎬 Demo complete!');
      /* eslint-enable no-console */
    },

    // Debug: show current state
    debug: () => {
      /* eslint-disable no-console */
      console.log('🎬 Cameo Roster Debug State:');
      console.log('  isInitialized:', isInitialized);
      console.log('  activeCameoPersona:', activeCameoPersona);
      console.log('  cameoElement:', cameoElement);
      console.log('  rosterContainer:', rosterContainer);
      console.log('  ferniElement:', ferniElement);
      console.log('  teamDivider:', teamDivider);
      console.log('  marketplaceBtn:', marketplaceBtn);

      // Try to find elements fresh
      const roster = document.getElementById('teamRoster');
      console.log('  Fresh roster lookup:', roster);
      if (roster) {
        console.log('  Roster children:', roster.children.length);
        console.log('  Ferni in roster:', roster.querySelector('[data-persona-id="ferni"]'));
        console.log('  Divider in roster:', roster.querySelector('.team-divider'));
        console.log('  All team members:', roster.querySelectorAll('.team-member').length);
      }
      /* eslint-enable no-console */
    },

    help: () => {
      /* eslint-disable no-console */
      console.log(`
🎬 Cameo Roster Preview Helper
════════════════════════════════

COMMANDS:
  cameoRoster.popIn('peter-john')   Pop a team member into the roster
  cameoRoster.popOut()              Slide them back to the "More" button
  cameoRoster.demo()                Run through all personas
  cameoRoster.debug()               Show current state (for debugging)

PERSONAS:
  peter-john, maya-santos, alex-chen, jordan-taylor, nayan-patel

HOW IT WORKS:
  1. Ferni shifts left to make room
  2. Team member pops in with a bouncy animation
  3. Glowing ring shows they're speaking
  4. When done, they slide toward "More" button
  5. Ferni shifts back to original position
      `);
      /* eslint-enable no-console */
    },
  };

  (window as unknown as Record<string, unknown>).cameoRoster = cameoRosterHelper;
}
