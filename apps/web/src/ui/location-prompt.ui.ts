/**
 * Location Prompt UI - "Better Than Human" Edition
 *
 * A warm, human prompt shown BEFORE the browser's permission dialog.
 * This explains WHY we're asking for location in a friendly way,
 * building trust before the technical prompt appears.
 *
 * PHILOSOPHY:
 * - The browser's "Allow location?" dialog feels robotic
 * - We show a warm explanation FIRST
 * - User decides with context, not confusion
 * - If they say "Not now", we remember and don't nag
 *
 * USAGE:
 * ```typescript
 * import { showLocationPrompt } from './ui/location-prompt.ui.js';
 *
 * // Show prompt and get user's decision
 * const result = await showLocationPrompt('weather');
 * if (result.allowed) {
 *   // Browser permission dialog will appear
 *   const location = await requestPreciseLocation('weather');
 * }
 * ```
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('LocationPromptUI');

// ============================================================================
// TYPES
// ============================================================================

export type LocationPromptContext = 'weather' | 'events' | 'timezone' | 'personalization';

export interface LocationPromptResult {
  allowed: boolean;
  rememberChoice: boolean;
}

// ============================================================================
// WARM PROMPT CONTENT
// ============================================================================

const PROMPT_CONTENT: Record<
  LocationPromptContext,
  { icon: string; title: string; message: string }
> = {
  weather: {
    icon: '🌤️',
    title: 'Local weather',
    message:
      "I'd love to mention your local weather when it's relevant. This helps me be more helpful—like suggesting you grab an umbrella or enjoy the sunshine.",
  },
  events: {
    icon: '📍',
    title: 'Nearby events',
    message:
      'With your location, I can tell you about interesting things happening near you—concerts, workshops, community events that might brighten your week.',
  },
  timezone: {
    icon: '🕐',
    title: 'Your time zone',
    message:
      'Knowing where you are helps me understand what time it is for you, so I can be more present and thoughtful in our conversations.',
  },
  personalization: {
    icon: '✨',
    title: 'Personalization',
    message:
      "Your location helps me make our conversations feel more personal and relevant—like I'm actually there with you.",
  },
};

// ============================================================================
// UI COMPONENT
// ============================================================================

let promptContainer: HTMLDivElement | null = null;
let resolvePrompt: ((result: LocationPromptResult) => void) | null = null;

/**
 * Show the warm location prompt.
 * Returns a promise that resolves when user makes a choice.
 */
export function showLocationPrompt(
  context: LocationPromptContext = 'personalization'
): Promise<LocationPromptResult> {
  // Clean up any existing prompt
  hideLocationPrompt();

  const content = PROMPT_CONTENT[context];

  return new Promise((resolve) => {
    resolvePrompt = resolve;

    // Create container
    promptContainer = document.createElement('div');
    promptContainer.className = 'ferni-location-prompt-overlay';
    promptContainer.innerHTML = `
      <div class="ferni-location-prompt-backdrop"></div>
      <div class="ferni-location-prompt-card" role="dialog" aria-modal="true" aria-labelledby="location-prompt-title">
        <div class="ferni-location-prompt-icon">${content.icon}</div>
        <h2 id="location-prompt-title" class="ferni-location-prompt-title">${content.title}</h2>
        <p class="ferni-location-prompt-message">${content.message}</p>
        <p class="ferni-location-prompt-note">This stays just between us—I only use it to make our conversations more personal.</p>
        <div class="ferni-location-prompt-actions">
          <button class="ferni-location-prompt-btn ferni-location-prompt-btn--secondary" data-action="not-now">
            Not now
          </button>
          <button class="ferni-location-prompt-btn ferni-location-prompt-btn--primary" data-action="allow">
            Allow location
          </button>
        </div>
      </div>
    `;

    // Add styles
    addStyles();

    // Add to DOM
    document.body.appendChild(promptContainer);

    // Animate in
    requestAnimationFrame(() => {
      promptContainer?.classList.add('ferni-location-prompt--visible');
    });

    // Handle clicks
    promptContainer.addEventListener('click', handleClick);

    // Handle escape key
    document.addEventListener('keydown', handleKeydown);

    // Focus the allow button
    const allowBtn = promptContainer.querySelector('[data-action="allow"]') as HTMLButtonElement;
    allowBtn?.focus();

    log.debug({ context }, '📍 Location prompt shown');
  });
}

/**
 * Hide the location prompt.
 */
export function hideLocationPrompt(): void {
  if (promptContainer) {
    promptContainer.classList.remove('ferni-location-prompt--visible');
    promptContainer.removeEventListener('click', handleClick);
    document.removeEventListener('keydown', handleKeydown);

    // Remove after animation
    setTimeout(() => {
      promptContainer?.remove();
      promptContainer = null;
    }, DURATION.SLOW);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleClick(event: Event): void {
  const target = event.target as HTMLElement;
  const action = target.closest('[data-action]')?.getAttribute('data-action');

  if (action === 'allow') {
    log.debug('📍 User allowed location prompt');
    resolvePrompt?.({ allowed: true, rememberChoice: true });
    hideLocationPrompt();
  } else if (action === 'not-now') {
    log.debug('📍 User declined location prompt');
    resolvePrompt?.({ allowed: false, rememberChoice: false });
    hideLocationPrompt();
  } else if (target.classList.contains('ferni-location-prompt-backdrop')) {
    // Close on backdrop click
    log.debug('📍 User dismissed location prompt via backdrop');
    resolvePrompt?.({ allowed: false, rememberChoice: false });
    hideLocationPrompt();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    log.debug('📍 User dismissed location prompt via Escape');
    resolvePrompt?.({ allowed: false, rememberChoice: false });
    hideLocationPrompt();
  }
}

// ============================================================================
// STYLES
// ============================================================================

let stylesAdded = false;

function addStyles(): void {
  if (stylesAdded) return;
  stylesAdded = true;

  const style = document.createElement('style');
  style.textContent = `
    .ferni-location-prompt-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 1rem);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .ferni-location-prompt--visible {
      opacity: 1;
      pointer-events: auto;
    }

    .ferni-location-prompt-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
      backdrop-filter: var(--glass-blur-subtle, blur(8px));
      -webkit-backdrop-filter: var(--glass-blur-subtle, blur(8px));
    }

    .ferni-location-prompt-card {
      position: relative;
      max-width: 400px;
      width: 100%;
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-2xl, 1.5rem);
      padding: var(--space-8, 2rem);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0,0,0,0.25));
      text-align: center;
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .ferni-location-prompt--visible .ferni-location-prompt-card {
      transform: scale(1) translateY(0);
    }

    .ferni-location-prompt-icon {
      font-size: 3rem;
      margin-bottom: var(--space-4, 1rem);
      line-height: 1;
    }

    .ferni-location-prompt-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-3, 0.75rem);
    }

    .ferni-location-prompt-message {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 1rem;
      line-height: 1.6;
      color: var(--color-text-secondary, #5a524c);
      margin: 0 0 var(--space-4, 1rem);
    }

    .ferni-location-prompt-note {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 0.875rem;
      color: var(--color-text-muted, #8a7f75);
      margin: 0 0 var(--space-6, 1.5rem);
    }

    .ferni-location-prompt-actions {
      display: flex;
      gap: var(--space-3, 0.75rem);
      justify-content: center;
    }

    .ferni-location-prompt-btn {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 1rem;
      font-weight: 500;
      padding: var(--space-3, 0.75rem) var(--space-6, 1.5rem);
      border-radius: var(--radius-full, 9999px);
      border: none;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      min-width: 120px;
    }

    .ferni-location-prompt-btn:focus-visible {
      outline: 2px solid var(--color-accent, #3d5a45);
      outline-offset: 2px;
    }

    .ferni-location-prompt-btn--secondary {
      background: var(--color-background-tertiary, #f5f1e8);
      color: var(--color-text-secondary, #5a524c);
    }

    .ferni-location-prompt-btn--secondary:hover {
      background: var(--color-background-secondary, #eae5dc);
    }

    .ferni-location-prompt-btn--primary {
      background: var(--color-accent, #3d5a45);
      color: white;
    }

    .ferni-location-prompt-btn--primary:hover {
      background: var(--color-accent-hover, #2d4a35);
      transform: translateY(-1px);
    }

    .ferni-location-prompt-btn--primary:active {
      transform: translateY(0);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .ferni-location-prompt-overlay,
      .ferni-location-prompt-card,
      .ferni-location-prompt-btn {
        transition: none;
      }
    }

    /* Dark theme */
    [data-theme="dark"] .ferni-location-prompt-card {
      background: var(--color-background-elevated, #2c2520);
    }

    [data-theme="dark"] .ferni-location-prompt-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="dark"] .ferni-location-prompt-message {
      color: var(--color-text-secondary, #e0dcd6);
    }

    [data-theme="dark"] .ferni-location-prompt-note {
      color: var(--color-text-muted, #a09890);
    }

    [data-theme="dark"] .ferni-location-prompt-btn--secondary {
      background: var(--color-background-tertiary, #3d3530);
      color: var(--color-text-secondary, #e0dcd6);
    }

    [data-theme="dark"] .ferni-location-prompt-btn--secondary:hover {
      background: var(--color-background-secondary, #4d4540);
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// INTEGRATION WITH GEOLOCATION SERVICE
// ============================================================================

/**
 * Request location with warm prompt first.
 * This is the recommended way to request location - shows warm prompt,
 * then triggers browser permission if user allows.
 */
export async function requestLocationWithWarmPrompt(
  context: LocationPromptContext = 'personalization'
): Promise<{ success: boolean; location?: { city?: string; countryCode?: string } }> {
  // Import geolocation service
  const { requestPreciseLocation, isLocationDenied } =
    await import('../services/geolocation.service.js');

  // Check if already denied
  if (isLocationDenied()) {
    log.debug('📍 Location previously denied, skipping prompt');
    return { success: false };
  }

  // Show warm prompt
  const promptResult = await showLocationPrompt(context);

  if (!promptResult.allowed) {
    return { success: false };
  }

  // User said yes - request from browser
  const result = await requestPreciseLocation(context);

  if (result.success && result.location) {
    return {
      success: true,
      location: {
        city: result.location.city,
        countryCode: result.location.countryCode,
      },
    };
  }

  return { success: false };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const locationPromptUI = {
  show: showLocationPrompt,
  hide: hideLocationPrompt,
  requestWithWarmPrompt: requestLocationWithWarmPrompt,
};

export default locationPromptUI;
