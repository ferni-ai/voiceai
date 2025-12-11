/**
 * Weather Effects UI - Avatar-Centered Seasonal Expressions
 * 
 * Weather as CHARACTER MOMENTS, not background noise.
 * Effects appear around/on the avatar for comic/seasonal relief.
 * 
 * 🎬 PIXAR APPROACH:
 * - Weather enhances the character, not the scene
 * - Small, playful, human touches
 * - Used sparingly for delight, not always-on
 * 
 * EFFECTS:
 * - Snow: Few flakes drifting around avatar, maybe one lands on head
 * - Rain: Cozy vibe, umbrella appears briefly
 * - Leaves: A few autumn leaves swirl past
 * - Fireflies: Gentle glow near avatar at night
 * - Petals: Cherry blossoms drift by in spring
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WeatherEffects');

// ============================================================================
// TYPES
// ============================================================================

export type WeatherType = 'snow' | 'rain' | 'leaves' | 'fireflies' | 'petals' | 'none';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let currentWeather: WeatherType = 'none';
let animationInterval: number | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize weather effects - finds avatar and prepares container.
 */
export function initWeatherEffects(): void {
  if (isInitialized) return;
  
  // Inject styles
  injectStyles();
  
  isInitialized = true;
  log.debug('Weather effects initialized');
}

/**
 * Find or create the weather container around the avatar.
 */
function ensureContainer(): HTMLElement | null {
  if (container && document.body.contains(container)) {
    return container;
  }
  
  // Find the avatar element
  const avatar = document.querySelector('#coachAvatar, .coach-avatar, [data-avatar]');
  if (!avatar) {
    log.debug('Avatar not found for weather effects');
    return null;
  }
  
  // Create container that wraps around avatar area
  container = document.createElement('div');
  container.id = 'weather-effects';
  container.setAttribute('aria-hidden', 'true');
  
  // Position relative to avatar
  const avatarRect = avatar.getBoundingClientRect();
  const size = Math.max(avatarRect.width, avatarRect.height) * 2.5;
  
  container.style.cssText = `
    position: fixed;
    top: ${avatarRect.top + avatarRect.height / 2 - size / 2}px;
    left: ${avatarRect.left + avatarRect.width / 2 - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
    border-radius: 50%;
  `;
  
  document.body.appendChild(container);
  
  // Update position on resize
  const updatePosition = () => {
    if (!container) return;
    const rect = avatar.getBoundingClientRect();
    const s = Math.max(rect.width, rect.height) * 2.5;
    container.style.top = `${rect.top + rect.height / 2 - s / 2}px`;
    container.style.left = `${rect.left + rect.width / 2 - s / 2}px`;
    container.style.width = `${s}px`;
    container.style.height = `${s}px`;
  };
  
  window.addEventListener('resize', updatePosition);
  
  return container;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start a weather effect around the avatar.
 */
export function startWeather(type: WeatherType): void {
  // Check reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  stopWeather();
  
  if (type === 'none') return;
  
  const weatherContainer = ensureContainer();
  if (!weatherContainer) return;
  
  currentWeather = type;
  
  // Start the appropriate effect
  switch (type) {
    case 'snow':
      startSnow(weatherContainer);
      break;
    case 'rain':
      startRain(weatherContainer);
      break;
    case 'leaves':
      startLeaves(weatherContainer);
      break;
    case 'fireflies':
      startFireflies(weatherContainer);
      break;
    case 'petals':
      startPetals(weatherContainer);
      break;
  }
  
  log.info('Weather started:', type);
}

/**
 * Stop all weather effects.
 */
export function stopWeather(): void {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  
  if (container) {
    container.innerHTML = '';
  }
  
  currentWeather = 'none';
}

/**
 * Get current weather type.
 */
export function getCurrentWeather(): WeatherType {
  return currentWeather;
}

/**
 * Get current season (Northern Hemisphere).
 */
export function getCurrentSeason(): Season {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/**
 * Trigger a quick seasonal moment - a brief expression, not always-on.
 */
export function playSeasonalMoment(): void {
  const season = getCurrentSeason();
  const hour = new Date().getHours();
  const isEvening = hour >= 19 || hour <= 5;
  
  let weather: WeatherType = 'none';
  
  switch (season) {
    case 'winter':
      weather = 'snow';
      break;
    case 'spring':
      weather = 'petals';
      break;
    case 'summer':
      weather = isEvening ? 'fireflies' : 'none';
      break;
    case 'autumn':
      weather = 'leaves';
      break;
  }
  
  if (weather !== 'none') {
    startWeather(weather);
    // Auto-stop after a few seconds - it's a moment, not permanent
    setTimeout(() => stopWeather(), 8000);
  }
}

// ============================================================================
// WEATHER IMPLEMENTATIONS
// ============================================================================

function startSnow(weatherContainer: HTMLElement): void {
  // Create a few snowflakes that drift past the avatar
  const createFlake = () => {
    const flake = document.createElement('div');
    flake.className = 'weather-flake';

    const startX = 20 + Math.random() * 60; // % across container
    const size = 6 + Math.random() * 4;
    const duration = 3000 + Math.random() * 2000;
    const drift = (Math.random() - 0.5) * 30;

    // CSS snowflake shape instead of emoji
    flake.style.cssText = `
      position: absolute;
      top: -20px;
      left: ${startX}%;
      width: ${size}px;
      height: ${size}px;
      background: radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.3) 70%, transparent 100%);
      border-radius: 50%;
      opacity: 0.8;
      filter: drop-shadow(0 0 2px rgba(255,255,255,0.5));
    `;
    
    weatherContainer.appendChild(flake);
    
    flake.animate([
      { transform: 'translateY(0) translateX(0) rotate(0deg)', opacity: 0.7 },
      { transform: `translateY(${weatherContainer.clientHeight + 40}px) translateX(${drift}px) rotate(360deg)`, opacity: 0.3 }
    ], {
      duration,
      easing: 'linear',
    }).onfinish = () => flake.remove();
  };
  
  // Create flakes periodically - just a few
  createFlake();
  animationInterval = window.setInterval(createFlake, 1200);
}

function startRain(weatherContainer: HTMLElement): void {
  // Gentle rain drops
  const createDrop = () => {
    const drop = document.createElement('div');
    drop.className = 'weather-drop';
    
    const startX = 10 + Math.random() * 80;
    const duration = 800 + Math.random() * 400;
    
    drop.style.cssText = `
      position: absolute;
      top: -10px;
      left: ${startX}%;
      width: 2px;
      height: 12px;
      background: linear-gradient(to bottom, transparent, rgba(180, 200, 220, 0.6));
      border-radius: 0 0 2px 2px;
    `;
    
    weatherContainer.appendChild(drop);
    
    drop.animate([
      { transform: 'translateY(0)', opacity: 0.6 },
      { transform: `translateY(${weatherContainer.clientHeight + 20}px)`, opacity: 0.2 }
    ], {
      duration,
      easing: 'linear',
    }).onfinish = () => drop.remove();
  };
  
  createDrop();
  animationInterval = window.setInterval(createDrop, 300);
}

function startLeaves(weatherContainer: HTMLElement): void {
  // Autumn leaf colors instead of emojis
  const leafColors = ['#c0392b', '#e67e22', '#d35400', '#8b4513'];

  const createLeaf = () => {
    const leaf = document.createElement('div');
    leaf.className = 'weather-leaf';
    const color = leafColors[Math.floor(Math.random() * leafColors.length)] ?? '#c0392b';

    const startX = Math.random() * 100;
    const size = 8 + Math.random() * 6;
    const duration = 4000 + Math.random() * 2000;
    const drift = (Math.random() - 0.5) * 60;
    const rotation = Math.random() * 720 - 360;

    // CSS leaf shape instead of emoji
    leaf.style.cssText = `
      position: absolute;
      top: -30px;
      left: ${startX}%;
      width: ${size}px;
      height: ${size * 1.2}px;
      background: ${color};
      border-radius: 50% 0 50% 50%;
      opacity: 0.8;
    `;
    
    weatherContainer.appendChild(leaf);
    
    leaf.animate([
      { transform: 'translateY(0) translateX(0) rotate(0deg)', opacity: 0.8 },
      { transform: `translateY(${weatherContainer.clientHeight + 40}px) translateX(${drift}px) rotate(${rotation}deg)`, opacity: 0.4 }
    ], {
      duration,
      easing: EASING.GENTLE,
    }).onfinish = () => leaf.remove();
  };
  
  createLeaf();
  animationInterval = window.setInterval(createLeaf, 1500);
}

function startFireflies(weatherContainer: HTMLElement): void {
  // Gentle glowing dots that float around the avatar
  const createFirefly = () => {
    const firefly = document.createElement('div');
    firefly.className = 'weather-firefly';
    
    const startX = 20 + Math.random() * 60;
    const startY = 20 + Math.random() * 60;
    const size = 4 + Math.random() * 4;
    
    firefly.style.cssText = `
      position: absolute;
      top: ${startY}%;
      left: ${startX}%;
      width: ${size}px;
      height: ${size}px;
      background: rgba(255, 230, 140, 0.9);
      border-radius: 50%;
      box-shadow: 0 0 ${size * 2}px rgba(255, 230, 140, 0.8);
    `;
    
    weatherContainer.appendChild(firefly);
    
    // Float around gently
    const floatDuration = 3000 + Math.random() * 2000;
    const moveX = (Math.random() - 0.5) * 40;
    const moveY = (Math.random() - 0.5) * 40;
    
    firefly.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 0 },
      { transform: 'translate(0, 0) scale(1)', opacity: 0.9, offset: 0.1 },
      { transform: `translate(${moveX}px, ${moveY}px) scale(0.8)`, opacity: 0.6, offset: 0.5 },
      { transform: `translate(${moveX * 1.5}px, ${moveY * 1.5}px) scale(1)`, opacity: 0.9, offset: 0.7 },
      { transform: `translate(${moveX * 2}px, ${moveY * 2}px) scale(0.5)`, opacity: 0 }
    ], {
      duration: floatDuration,
      easing: EASING.GENTLE,
    }).onfinish = () => firefly.remove();
  };
  
  createFirefly();
  animationInterval = window.setInterval(createFirefly, 2000);
}

function startPetals(weatherContainer: HTMLElement): void {
  const createPetal = () => {
    const petal = document.createElement('div');
    petal.className = 'weather-petal';

    const startX = Math.random() * 100;
    const size = 8 + Math.random() * 5;
    const duration = 4000 + Math.random() * 2000;
    const drift = (Math.random() - 0.5) * 50;
    const rotation = Math.random() * 360;
    
    // CSS petal shape instead of emoji
    petal.style.cssText = `
      position: absolute;
      top: -25px;
      left: ${startX}%;
      width: ${size}px;
      height: ${size * 0.6}px;
      background: linear-gradient(135deg, #ffb7c5 0%, #ff9eb5 100%);
      border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
      opacity: 0.75;
    `;
    
    weatherContainer.appendChild(petal);
    
    petal.animate([
      { transform: 'translateY(0) translateX(0) rotate(0deg)', opacity: 0.75 },
      { transform: `translateY(${weatherContainer.clientHeight + 30}px) translateX(${drift}px) rotate(${rotation}deg)`, opacity: 0.3 }
    ], {
      duration,
      easing: EASING.GENTLE,
    }).onfinish = () => petal.remove();
  };
  
  createPetal();
  animationInterval = window.setInterval(createPetal, 1200);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  const styleId = 'weather-effects-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #weather-effects {
      transition: opacity ${DURATION.SLOW}ms ${EASING.GENTLE};
    }
    
    .weather-flake,
    .weather-leaf,
    .weather-petal {
      user-select: none;
    }
    
    /* Reduce motion support */
    @media (prefers-reduced-motion: reduce) {
      #weather-effects {
        display: none !important;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  stopWeather();
  
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
    container = null;
  }
  
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const weatherEffectsUI = {
  init: initWeatherEffects,
  start: startWeather,
  stop: stopWeather,
  toggle: (type: WeatherType) => {
    if (currentWeather === type) {
      stopWeather();
    } else {
      startWeather(type);
    }
  },
  current: getCurrentWeather,
  getSeason: getCurrentSeason,
  playMoment: playSeasonalMoment,
  dispose,
};
