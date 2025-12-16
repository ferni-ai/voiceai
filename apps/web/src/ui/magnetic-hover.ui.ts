/**
 * Magnetic Hover Effect (WALL-E curiosity)
 *
 * Buttons "reach" toward the cursor like WALL-E's curious head tilts.
 * A delightful micro-interaction that makes the UI feel alive.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MagneticHover');

const MAGNETIC_STRENGTH = 0.4; // How much buttons "reach" toward cursor
const MAGNETIC_RADIUS = 100;   // Pixels - how far the magnetic effect extends

let isInitialized = false;

/**
 * Initialize the magnetic hover effect on buttons.
 */
export function initMagneticHover(): void {
  if (isInitialized) return;

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseleave', handleMouseLeave);

  isInitialized = true;
  log.debug('Magnetic hover initialized');
}

/**
 * Dispose of the magnetic hover effect.
 */
export function disposeMagneticHover(): void {
  if (!isInitialized) return;

  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseleave', handleMouseLeave);

  // Reset all magnetic elements
  resetAllMagneticElements();

  isInitialized = false;
  log.debug('Magnetic hover disposed');
}

/**
 * Handle mouse movement - calculate magnetic pull for nearby buttons.
 */
function handleMouseMove(e: MouseEvent): void {
  const magneticElements = document.querySelectorAll('.btn-magnetic, .btn-primary, .btn-connect');

  magneticElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance < MAGNETIC_RADIUS) {
      // Within magnetic range - calculate pull
      const pull = (1 - distance / MAGNETIC_RADIUS) * MAGNETIC_STRENGTH;
      const moveX = deltaX * pull;
      const moveY = deltaY * pull;

      (el as HTMLElement).style.setProperty('--magnetic-x', moveX.toString());
      (el as HTMLElement).style.setProperty('--magnetic-y', moveY.toString());
      el.classList.add('magnetic-active');
    } else {
      // Outside range - reset
      (el as HTMLElement).style.setProperty('--magnetic-x', '0');
      (el as HTMLElement).style.setProperty('--magnetic-y', '0');
      el.classList.remove('magnetic-active');
    }
  });
}

/**
 * Handle mouse leaving the document - reset all magnetic elements.
 */
function handleMouseLeave(): void {
  resetAllMagneticElements();
}

/**
 * Reset all magnetic elements to their default state.
 */
function resetAllMagneticElements(): void {
  const magneticElements = document.querySelectorAll('.btn-magnetic, .btn-primary, .btn-connect');
  magneticElements.forEach((el) => {
    (el as HTMLElement).style.setProperty('--magnetic-x', '0');
    (el as HTMLElement).style.setProperty('--magnetic-y', '0');
    el.classList.remove('magnetic-active');
  });
}

export const magneticHoverUI = {
  init: initMagneticHover,
  dispose: disposeMagneticHover,
};
