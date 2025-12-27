/**
 * Predictive UI System
 *
 * Anticipatory interface patterns that feel magical.
 * The best interface is one that's already prepared for what you need.
 *
 * @module @ferni/predictive-ui
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('PredictiveUI');

// ============================================================================
// TYPES
// ============================================================================

export type LoadingStage = 'instant' | 'fast' | 'normal' | 'slow' | 'extended';
export type PersonalizationLevel = 'minimal' | 'balanced' | 'dense';
export type InteractionSpeed = 'deliberate' | 'balanced' | 'quick';
export type VisualComplexity = 'calm' | 'balanced' | 'rich';

export interface HoverIntentOptions {
  detectionRadius: number;      // px
  velocityThreshold: number;    // px/s
  preloadDelay: number;         // ms
  onIntent: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
}

export interface PreloadConfig {
  morning: string[];
  evening: string[];
  weekend: string[];
}

export interface LoadingStageConfig {
  stage: LoadingStage;
  duration: string;
  show: string;
  message?: string;
}

export interface UserPreferences {
  informationDensity: PersonalizationLevel;
  interactionSpeed: InteractionSpeed;
  visualComplexity: VisualComplexity;
}

// ============================================================================
// LOADING STAGES (from predictive.json)
// ============================================================================

const _LOADING_STAGES: Record<LoadingStage, LoadingStageConfig> = {
  instant: {
    stage: 'instant',
    duration: '0-100ms',
    show: 'nothing',
  },
  fast: {
    stage: 'fast',
    duration: '100-300ms',
    show: 'subtle-pulse',
  },
  normal: {
    stage: 'normal',
    duration: '300ms-1s',
    show: 'skeleton',
  },
  slow: {
    stage: 'slow',
    duration: '1-5s',
    show: 'skeleton + progress',
  },
  extended: {
    stage: 'extended',
    duration: '5s+',
    show: 'skeleton + progress + message',
    message: 'Still working on that...',
  },
};

const EXTENDED_MESSAGES = [
  'Still working on that...',
  'Almost there...',
  'Thanks for waiting...',
];

// ============================================================================
// PERSONALIZATION SETTINGS (from predictive.json)
// ============================================================================

const DENSITY_SETTINGS: Record<PersonalizationLevel, { spacing: number; fontSize: number; itemsPerView: number }> = {
  minimal: { spacing: 1.5, fontSize: 1.1, itemsPerView: 3 },
  balanced: { spacing: 1, fontSize: 1, itemsPerView: 5 },
  dense: { spacing: 0.8, fontSize: 0.95, itemsPerView: 8 },
};

const SPEED_SETTINGS: Record<InteractionSpeed, { animationSpeed: number; holdDuration: number; tooltipDelay: string }> = {
  deliberate: { animationSpeed: 0.8, holdDuration: 1.2, tooltipDelay: '400ms' },
  balanced: { animationSpeed: 1, holdDuration: 1, tooltipDelay: '300ms' },
  quick: { animationSpeed: 1.3, holdDuration: 0.7, tooltipDelay: '150ms' },
};

const COMPLEXITY_SETTINGS: Record<VisualComplexity, { particles: string; gradients: string; animations: string }> = {
  calm: { particles: 'none', gradients: 'subtle', animations: 'minimal' },
  balanced: { particles: 'light', gradients: 'moderate', animations: 'standard' },
  rich: { particles: 'full', gradients: 'vibrant', animations: 'expressive' },
};

// ============================================================================
// HOVER INTENT DETECTION
// ============================================================================

interface MouseVelocity {
  x: number;
  y: number;
  speed: number;
  timestamp: number;
}

/**
 * Detect hover intent based on mouse trajectory
 * Preloads content when mouse is moving toward an element
 */
export function createHoverIntent(
  element: HTMLElement,
  options: HoverIntentOptions
): { destroy: () => void } {
  const {
    detectionRadius = 100,
    velocityThreshold = 50,
    preloadDelay = 100,
    onIntent,
    onEnter,
    onLeave,
  } = options;

  let lastMouse: { x: number; y: number; time: number } | null = null;
  let velocity: MouseVelocity = { x: 0, y: 0, speed: 0, timestamp: 0 };
  let intentTimeout: ReturnType<typeof setTimeout> | null = null;
  let hasTriggeredIntent = false;

  const getElementCenter = (): { x: number; y: number } => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const calculateVelocity = (e: MouseEvent): MouseVelocity => {
    const now = performance.now();

    if (!lastMouse) {
      lastMouse = { x: e.clientX, y: e.clientY, time: now };
      return { x: 0, y: 0, speed: 0, timestamp: now };
    }

    const dt = (now - lastMouse.time) / 1000; // seconds
    if (dt === 0) return velocity;

    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;

    lastMouse = { x: e.clientX, y: e.clientY, time: now };

    return { x: dx / dt, y: dy / dt, speed, timestamp: now };
  };

  const isMovingToward = (mouseX: number, mouseY: number, vel: MouseVelocity): boolean => {
    const center = getElementCenter();
    const toElement = {
      x: center.x - mouseX,
      y: center.y - mouseY,
    };

    // Normalize vectors
    const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    const toMag = Math.sqrt(toElement.x * toElement.x + toElement.y * toElement.y);

    if (velMag === 0 || toMag === 0) return false;

    // Dot product (cos of angle)
    const dot = (vel.x * toElement.x + vel.y * toElement.y) / (velMag * toMag);

    // Moving toward if dot product > 0.5 (within 60 degrees)
    return dot > 0.5;
  };

  const isWithinRadius = (mouseX: number, mouseY: number): boolean => {
    const center = getElementCenter();
    const distance = Math.sqrt(
      Math.pow(mouseX - center.x, 2) + Math.pow(mouseY - center.y, 2)
    );
    return distance < detectionRadius;
  };

  const handleMouseMove = (e: MouseEvent) => {
    velocity = calculateVelocity(e);

    // Check if within detection radius
    if (!isWithinRadius(e.clientX, e.clientY)) {
      hasTriggeredIntent = false;
      return;
    }

    // Check if moving toward element with sufficient velocity
    if (
      !hasTriggeredIntent &&
      velocity.speed > velocityThreshold &&
      isMovingToward(e.clientX, e.clientY, velocity)
    ) {
      // Schedule intent callback
      if (!intentTimeout) {
        intentTimeout = setTimeout(() => {
          hasTriggeredIntent = true;
          onIntent();
          log.debug('Hover intent detected', { element: element.id || element.className });
        }, preloadDelay);
      }
    }
  };

  const handleMouseEnter = () => {
    if (intentTimeout) {
      clearTimeout(intentTimeout);
      intentTimeout = null;
    }
    onEnter?.();
  };

  const handleMouseLeave = () => {
    if (intentTimeout) {
      clearTimeout(intentTimeout);
      intentTimeout = null;
    }
    hasTriggeredIntent = false;
    lastMouse = null;
    onLeave?.();
  };

  // Attach listeners
  document.addEventListener('mousemove', handleMouseMove);
  element.addEventListener('mouseenter', handleMouseEnter);
  element.addEventListener('mouseleave', handleMouseLeave);

  return {
    destroy: () => {
      document.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
      if (intentTimeout) clearTimeout(intentTimeout);
    },
  };
}

// ============================================================================
// TIME-BASED PRELOADING
// ============================================================================

const TIME_PRELOAD_CONFIG: PreloadConfig = {
  morning: ['calendar', 'weather', 'priorities'],
  evening: ['reflections', 'tomorrow-prep', 'wind-down'],
  weekend: ['weekly-review', 'personal-goals', 'relationships'],
};

/**
 * Get current time-based preload suggestions
 */
export function getTimeBasedPreloads(): string[] {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Weekend
  if (day === 0 || day === 6) {
    return TIME_PRELOAD_CONFIG.weekend;
  }

  // Morning (5am - 11am)
  if (hour >= 5 && hour < 11) {
    return TIME_PRELOAD_CONFIG.morning;
  }

  // Evening (6pm - 11pm)
  if (hour >= 18 && hour < 23) {
    return TIME_PRELOAD_CONFIG.evening;
  }

  // Default - balanced mix
  return ['priorities', 'calendar'];
}

/**
 * Contextual preload suggestions based on recent activity
 */
export function getContextualPreloads(recentContext: string): string[] {
  const contextMap: Record<string, string[]> = {
    'goal-discussion': ['goal-tracker', 'milestone-history'],
    'emotional-conversation': ['mood-insights', 'journal'],
    'scheduling-talk': ['calendar', 'reminders'],
    'relationship-talk': ['your-people', 'connection-heart'],
    'habit-review': ['habit-tracker', 'streak-history'],
  };

  return contextMap[recentContext] || [];
}

// ============================================================================
// LOADING STATE ORCHESTRATOR
// ============================================================================

interface LoadingOrchestrator {
  startLoading: () => void;
  updateProgress: (progress: number) => void;
  complete: () => void;
  getElement: () => HTMLElement;
}

/**
 * Create an intelligent loading state orchestrator
 */
export function createLoadingOrchestrator(
  container: HTMLElement,
  options: {
    onStageChange?: (stage: LoadingStage) => void;
    customMessages?: string[];
  } = {}
): LoadingOrchestrator {
  const { onStageChange, customMessages = EXTENDED_MESSAGES } = options;

  let startTime: number | null = null;
  let currentStage: LoadingStage = 'instant';
  let progressValue = 0;
  let messageIndex = 0;
  let stageCheckInterval: ReturnType<typeof setInterval> | null = null;
  let messageInterval: ReturnType<typeof setInterval> | null = null;

  // Create loading UI elements
  const wrapper = document.createElement('div');
  wrapper.className = 'ferni-loading-orchestrator';
  wrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
  `;

  // Skeleton placeholder
  const skeleton = document.createElement('div');
  skeleton.className = 'ferni-loading-skeleton';
  skeleton.style.cssText = `
    width: 100%;
    height: 60px;
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0%,
      rgba(255,255,255,0.08) 50%,
      rgba(255,255,255,0.04) 100%
    );
    background-size: 200% 100%;
    border-radius: 12px;
    animation: ferni-shimmer 1.5s infinite;
    display: none;
  `;

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'ferni-loading-progress';
  progressBar.style.cssText = `
    width: 100%;
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    overflow: hidden;
    display: none;
  `;

  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    height: 100%;
    width: 0%;
    background: var(--color-accent, #4A7C59);
    border-radius: 2px;
    transition: width 0.3s ease;
  `;
  progressBar.appendChild(progressFill);

  // Message
  const message = document.createElement('div');
  message.className = 'ferni-loading-message';
  message.style.cssText = `
    font-size: 14px;
    color: var(--color-text-muted, #888);
    display: none;
  `;

  wrapper.appendChild(skeleton);
  wrapper.appendChild(progressBar);
  wrapper.appendChild(message);

  // Inject shimmer animation
  if (!document.getElementById('ferni-loading-styles')) {
    const style = document.createElement('style');
    style.id = 'ferni-loading-styles';
    style.textContent = `
      @keyframes ferni-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes ferni-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  const updateStage = (elapsed: number) => {
    let newStage: LoadingStage = 'instant';

    if (elapsed > 5000) {
      newStage = 'extended';
    } else if (elapsed > 1000) {
      newStage = 'slow';
    } else if (elapsed > 300) {
      newStage = 'normal';
    } else if (elapsed > 100) {
      newStage = 'fast';
    }

    if (newStage !== currentStage) {
      currentStage = newStage;
      onStageChange?.(newStage);
      applyStageUI(newStage);
      log.debug('Loading stage changed', { stage: newStage, elapsed });
    }
  };

  const applyStageUI = (stage: LoadingStage) => {
    // Reset all
    skeleton.style.display = 'none';
    progressBar.style.display = 'none';
    message.style.display = 'none';

    switch (stage) {
      case 'fast':
        skeleton.style.display = 'block';
        skeleton.style.animation = 'ferni-pulse 1s infinite';
        break;

      case 'normal':
        skeleton.style.display = 'block';
        skeleton.style.animation = 'ferni-shimmer 1.5s infinite';
        break;

      case 'slow':
        skeleton.style.display = 'block';
        progressBar.style.display = 'block';
        break;

      case 'extended':
        skeleton.style.display = 'block';
        progressBar.style.display = 'block';
        message.style.display = 'block';
        message.textContent = customMessages[0];

        // Rotate messages
        if (!messageInterval) {
          messageInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % customMessages.length;
            message.textContent = customMessages[messageIndex];
          }, 3000);
        }
        break;
    }
  };

  return {
    startLoading: () => {
      startTime = performance.now();
      currentStage = 'instant';
      progressValue = 0;
      messageIndex = 0;

      container.appendChild(wrapper);

      // Start checking stage
      stageCheckInterval = setInterval(() => {
        if (startTime) {
          updateStage(performance.now() - startTime);
        }
      }, 100);
    },

    updateProgress: (progress: number) => {
      progressValue = Math.min(1, Math.max(0, progress));
      progressFill.style.width = `${progressValue * 100}%`;
    },

    complete: () => {
      if (stageCheckInterval) clearInterval(stageCheckInterval);
      if (messageInterval) clearInterval(messageInterval);
      stageCheckInterval = null;
      messageInterval = null;
      startTime = null;

      // Fade out
      wrapper.style.transition = 'opacity 0.3s ease';
      wrapper.style.opacity = '0';
      setTimeout(() => {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
      }, 300);
    },

    getElement: () => wrapper,
  };
}

// ============================================================================
// SCROLL ANTICIPATION
// ============================================================================

interface ScrollAnticipation {
  destroy: () => void;
}

/**
 * Preload content based on scroll direction and velocity
 */
export function createScrollAnticipation(
  container: HTMLElement,
  options: {
    lookAheadDistance: number;      // viewports
    preloadThreshold: number;       // viewports
    onPreload: (direction: 'up' | 'down') => void;
  }
): ScrollAnticipation {
  const { lookAheadDistance: _lookAheadDistance = 2, preloadThreshold = 0.5, onPreload } = options;

  let lastScrollTop = 0;
  let lastScrollTime = 0;
  let scrollVelocity = 0;
  const hasPreloaded: { up: boolean; down: boolean } = { up: false, down: false };

  const handleScroll = () => {
    const now = performance.now();
    const currentScrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;

    // Calculate velocity
    const dt = (now - lastScrollTime) / 1000;
    if (dt > 0) {
      scrollVelocity = (currentScrollTop - lastScrollTop) / dt;
    }

    const direction: 'up' | 'down' = scrollVelocity > 0 ? 'down' : 'up';

    // Check if we should preload based on position and velocity
    const distanceToEnd = direction === 'down'
      ? scrollHeight - currentScrollTop - viewportHeight
      : currentScrollTop;

    const thresholdPx = preloadThreshold * viewportHeight;

    if (distanceToEnd < thresholdPx && !hasPreloaded[direction]) {
      hasPreloaded[direction] = true;
      onPreload(direction);
      log.debug('Scroll anticipation triggered', { direction, velocity: scrollVelocity });
    }

    // Reset preload flag when scrolling away
    if (direction === 'down' && currentScrollTop < lastScrollTop) {
      hasPreloaded.down = false;
    } else if (direction === 'up' && currentScrollTop > lastScrollTop) {
      hasPreloaded.up = false;
    }

    lastScrollTop = currentScrollTop;
    lastScrollTime = now;
  };

  container.addEventListener('scroll', handleScroll, { passive: true });

  return {
    destroy: () => {
      container.removeEventListener('scroll', handleScroll);
    },
  };
}

// ============================================================================
// SKELETON GENERATOR
// ============================================================================

export interface SkeletonConfig {
  type: 'text' | 'avatar' | 'card' | 'button';
  lines?: number;
  width?: string;
}

/**
 * Create skeleton placeholder elements
 */
export function createSkeleton(config: SkeletonConfig): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = 'ferni-skeleton';
  skeleton.style.cssText = `
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0%,
      rgba(255,255,255,0.08) 50%,
      rgba(255,255,255,0.04) 100%
    );
    background-size: 200% 100%;
    animation: ferni-shimmer 1.5s infinite;
  `;

  switch (config.type) {
    case 'text':
      skeleton.style.height = '1em';
      skeleton.style.width = config.width || `${60 + Math.random() * 30}%`;
      skeleton.style.borderRadius = '4px';
      skeleton.style.marginBottom = '0.5em';

      if (config.lines && config.lines > 1) {
        const container = document.createElement('div');
        for (let i = 0; i < config.lines; i++) {
          const line = skeleton.cloneNode() as HTMLElement;
          line.style.width = `${60 + Math.random() * 30}%`;
          container.appendChild(line);
        }
        return container;
      }
      break;

    case 'avatar':
      skeleton.style.width = '40px';
      skeleton.style.height = '40px';
      skeleton.style.borderRadius = '50%';
      break;

    case 'card':
      skeleton.style.width = config.width || '100%';
      skeleton.style.aspectRatio = '16/9';
      skeleton.style.borderRadius = '16px';
      break;

    case 'button':
      skeleton.style.width = config.width || '120px';
      skeleton.style.height = '44px';
      skeleton.style.borderRadius = '22px';
      break;
  }

  return skeleton;
}

// ============================================================================
// USER PREFERENCE ADAPTATION
// ============================================================================

interface AdaptiveSettings {
  density: typeof DENSITY_SETTINGS.balanced;
  speed: typeof SPEED_SETTINGS.balanced;
  complexity: typeof COMPLEXITY_SETTINGS.balanced;
}

let userPreferences: UserPreferences = {
  informationDensity: 'balanced',
  interactionSpeed: 'balanced',
  visualComplexity: 'balanced',
};

/**
 * Update user preferences for UI adaptation
 */
export function setUserPreferences(prefs: Partial<UserPreferences>): void {
  userPreferences = { ...userPreferences, ...prefs };
  applyPreferences();
  log.info('User preferences updated', userPreferences);
}

/**
 * Get current adaptive settings based on preferences
 */
export function getAdaptiveSettings(): AdaptiveSettings {
  return {
    density: DENSITY_SETTINGS[userPreferences.informationDensity],
    speed: SPEED_SETTINGS[userPreferences.interactionSpeed],
    complexity: COMPLEXITY_SETTINGS[userPreferences.visualComplexity],
  };
}

/**
 * Apply preferences to CSS custom properties
 */
function applyPreferences(): void {
  const settings = getAdaptiveSettings();
  const root = document.documentElement;

  // Density
  root.style.setProperty('--ferni-spacing-multiplier', String(settings.density.spacing));
  root.style.setProperty('--ferni-font-size-multiplier', String(settings.density.fontSize));

  // Speed
  root.style.setProperty('--ferni-animation-speed', String(settings.speed.animationSpeed));
  root.style.setProperty('--ferni-tooltip-delay', settings.speed.tooltipDelay);

  // Complexity
  root.style.setProperty('--ferni-particles', settings.complexity.particles);
  root.style.setProperty('--ferni-gradients', settings.complexity.gradients);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

export function initPredictiveUI(): void {
  if (initialized) return;
  initialized = true;

  applyPreferences();
  log.info('Predictive UI initialized', { timeBasedPreloads: getTimeBasedPreloads() });
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  initPredictiveUI();
}
