/**
 * Loading Orchestrator Service - Choreographed Loading States
 *
 * Apple/Google-quality loading UX that prevents jarring spinners and
 * provides a choreographed, delightful loading experience.
 *
 * Features:
 * - Minimum loading duration (prevents flicker)
 * - Skeleton screens with shimmer
 * - Progressive content reveal
 * - Loading state coordination across components
 * - Optimistic UI support
 *
 * @module loading-orchestrator.service
 */

import { DURATION, EASING } from '../config/animation-constants';
import { createLogger } from '../utils/logger';

const log = createLogger('LoadingOrchestrator');

// ============================================================================
// TYPES
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface LoadingTask {
  id: string;
  state: LoadingState;
  startTime: number;
  minDuration: number;
  message?: string;
  progress?: number;
  onComplete?: () => void;
}

export interface LoadingOptions {
  /** Minimum time to show loading state (prevents flicker) */
  minDuration?: number;
  /** Message to display while loading */
  message?: string;
  /** Show skeleton placeholder */
  skeleton?: boolean;
  /** Delay before showing loading indicator */
  delay?: number;
  /** Progress value 0-100 (for determinate loading) */
  progress?: number;
}

// ============================================================================
// STATE
// ============================================================================

const tasks = new Map<string, LoadingTask>();
const listeners = new Map<string, Set<(task: LoadingTask) => void>>();

/** Global minimum duration to prevent flicker (150ms is the threshold for perceiving change) */
const DEFAULT_MIN_DURATION = 300;

/** Delay before showing loading indicator (prevents flash for fast operations) */
const DEFAULT_DELAY = 150;

// ============================================================================
// CORE ORCHESTRATOR
// ============================================================================

/**
 * Starts a loading task with choreographed timing.
 * @param id Unique identifier for the task.
 * @param options Loading options.
 */
export function startLoading(id: string, options: LoadingOptions = {}): void {
  const { minDuration = DEFAULT_MIN_DURATION, message, delay = DEFAULT_DELAY, progress } = options;

  const task: LoadingTask = {
    id,
    state: 'loading',
    startTime: Date.now(),
    minDuration,
    message,
    progress,
  };

  // If delay is specified, don't immediately notify listeners
  if (delay > 0) {
    setTimeout(() => {
      // Check if still loading (operation might have completed)
      if (tasks.get(id)?.state === 'loading') {
        notifyListeners(id, task);
      }
    }, delay);
  } else {
    notifyListeners(id, task);
  }

  tasks.set(id, task);
  log.debug('Loading started:', { id, minDuration, message });
}

/**
 * Completes a loading task with choreographed timing.
 * @param id The task identifier.
 * @param state The final state ('success' or 'error').
 */
export function completeLoading(
  id: string,
  state: 'success' | 'error' = 'success'
): Promise<void> {
  const task = tasks.get(id);
  if (!task) {
    log.warn('Attempted to complete unknown loading task:', id);
    return Promise.resolve();
  }

  const elapsed = Date.now() - task.startTime;
  const remaining = Math.max(0, task.minDuration - elapsed);

  return new Promise((resolve) => {
    // Ensure minimum duration to prevent flicker
    setTimeout(() => {
      task.state = state;
      notifyListeners(id, task);
      task.onComplete?.();
      tasks.delete(id);
      log.debug('Loading completed:', { id, state, duration: elapsed + remaining });
      resolve();
    }, remaining);
  });
}

/**
 * Updates progress for a loading task.
 * @param id The task identifier.
 * @param progress Progress value 0-100.
 */
export function updateProgress(id: string, progress: number): void {
  const task = tasks.get(id);
  if (task) {
    task.progress = Math.min(100, Math.max(0, progress));
    notifyListeners(id, task);
  }
}

/**
 * Updates the loading message.
 * @param id The task identifier.
 * @param message New message.
 */
export function updateMessage(id: string, message: string): void {
  const task = tasks.get(id);
  if (task) {
    task.message = message;
    notifyListeners(id, task);
  }
}

/**
 * Gets the current state of a loading task.
 * @param id The task identifier.
 * @returns The loading task or undefined.
 */
export function getLoadingState(id: string): LoadingTask | undefined {
  return tasks.get(id);
}

/**
 * Checks if any loading is in progress.
 * @param ids Optional array of specific task IDs to check.
 * @returns True if any specified tasks (or any tasks if none specified) are loading.
 */
export function isLoading(ids?: string[]): boolean {
  if (ids) {
    return ids.some((id) => tasks.get(id)?.state === 'loading');
  }
  return Array.from(tasks.values()).some((t) => t.state === 'loading');
}

// ============================================================================
// LISTENER MANAGEMENT
// ============================================================================

/**
 * Subscribes to loading state changes for a task.
 * @param id The task identifier.
 * @param callback Callback when state changes.
 * @returns Unsubscribe function.
 */
export function onLoadingChange(
  id: string,
  callback: (task: LoadingTask) => void
): () => void {
  if (!listeners.has(id)) {
    listeners.set(id, new Set());
  }
  listeners.get(id)!.add(callback);

  // If task already exists, call immediately
  const task = tasks.get(id);
  if (task) {
    callback(task);
  }

  return () => {
    listeners.get(id)?.delete(callback);
  };
}

function notifyListeners(id: string, task: LoadingTask): void {
  listeners.get(id)?.forEach((callback) => callback(task));
}

// ============================================================================
// SKELETON UTILITIES
// ============================================================================

const SKELETON_STYLES = `
/* Skeleton Loading Animations */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-background-tertiary) 0%,
    var(--color-background-secondary) 50%,
    var(--color-background-tertiary) 100%
  );
  background-size: 200% 100%;
  animation: skeletonShimmer 1.5s infinite ease-in-out;
  border-radius: var(--radius-sm);
}

@keyframes skeletonShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Skeleton variants */
.skeleton--text {
  height: 1em;
  width: 100%;
  margin-bottom: 0.5em;
}

.skeleton--text:last-child {
  width: 70%;
}

.skeleton--heading {
  height: 1.5em;
  width: 60%;
  margin-bottom: 1em;
}

.skeleton--avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
}

.skeleton--button {
  width: 120px;
  height: 44px;
  border-radius: var(--radius-lg);
}

.skeleton--card {
  width: 100%;
  height: 200px;
  border-radius: var(--radius-xl);
}

.skeleton--image {
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: var(--radius-lg);
}

/* Content reveal animation */
.content-reveal {
  animation: contentReveal ${DURATION.SLOW}ms ${EASING.EASE_OUT_EXPO} forwards;
}

@keyframes contentReveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Staggered reveal */
.content-reveal-stagger > * {
  opacity: 0;
  animation: contentReveal ${DURATION.SLOW}ms ${EASING.EASE_OUT_EXPO} forwards;
}

.content-reveal-stagger > *:nth-child(1) { animation-delay: 0ms; }
.content-reveal-stagger > *:nth-child(2) { animation-delay: 50ms; }
.content-reveal-stagger > *:nth-child(3) { animation-delay: 100ms; }
.content-reveal-stagger > *:nth-child(4) { animation-delay: 150ms; }
.content-reveal-stagger > *:nth-child(5) { animation-delay: 200ms; }
.content-reveal-stagger > *:nth-child(6) { animation-delay: 250ms; }
.content-reveal-stagger > *:nth-child(n+7) { animation-delay: 300ms; }

/* Pulse loading indicator */
.loading-pulse {
  animation: loadingPulse 1s ${EASING.STANDARD} infinite;
}

@keyframes loadingPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Progress bar */
.loading-progress {
  height: 4px;
  background: var(--color-background-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.loading-progress__bar {
  height: 100%;
  background: var(--gradient-progress-bar);
  border-radius: var(--radius-full);
  transition: width ${DURATION.NORMAL}ms ${EASING.STANDARD};
}

.loading-progress__bar--indeterminate {
  width: 30%;
  animation: loadingProgressIndeterminate 1.5s ${EASING.STANDARD} infinite;
}

@keyframes loadingProgressIndeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .skeleton,
  .content-reveal,
  .content-reveal-stagger > *,
  .loading-pulse,
  .loading-progress__bar--indeterminate {
    animation: none !important;
  }
  
  .content-reveal,
  .content-reveal-stagger > * {
    opacity: 1;
    transform: none;
  }
}
`;

let skeletonStylesInjected = false;

/**
 * Injects skeleton loading styles.
 */
export function injectSkeletonStyles(): void {
  if (skeletonStylesInjected || document.getElementById('skeleton-styles')) return;

  const style = document.createElement('style');
  style.id = 'skeleton-styles';
  style.textContent = SKELETON_STYLES;
  document.head.appendChild(style);
  skeletonStylesInjected = true;

  log.debug('Skeleton styles injected');
}

/**
 * Creates a skeleton placeholder element.
 * @param type The type of skeleton to create.
 * @param count Number of skeletons to create (for text).
 * @returns The skeleton element.
 */
export function createSkeleton(
  type: 'text' | 'heading' | 'avatar' | 'button' | 'card' | 'image' = 'text',
  count: number = 1
): HTMLElement {
  injectSkeletonStyles();

  const container = document.createElement('div');

  if (type === 'text' && count > 1) {
    for (let i = 0; i < count; i++) {
      const line = document.createElement('div');
      line.className = 'skeleton skeleton--text';
      container.appendChild(line);
    }
  } else {
    const skeleton = document.createElement('div');
    skeleton.className = `skeleton skeleton--${type}`;
    container.appendChild(skeleton);
  }

  return container;
}

/**
 * Replaces an element with a skeleton while loading.
 * @param element The element to replace.
 * @param skeletonType The type of skeleton to show.
 * @returns Function to restore the original element.
 */
export function showSkeleton(
  element: HTMLElement,
  skeletonType: 'text' | 'heading' | 'avatar' | 'button' | 'card' | 'image' = 'text'
): () => void {
  const skeleton = createSkeleton(skeletonType);
  skeleton.style.width = `${element.offsetWidth}px`;
  skeleton.style.height = `${element.offsetHeight}px`;

  element.style.display = 'none';
  element.parentNode?.insertBefore(skeleton, element);

  return () => {
    skeleton.remove();
    element.style.display = '';
    element.classList.add('content-reveal');
  };
}

// ============================================================================
// HIGH-LEVEL UTILITIES
// ============================================================================

/**
 * Wraps an async operation with loading orchestration.
 * @param id Task identifier.
 * @param operation The async operation to execute.
 * @param options Loading options.
 * @returns The result of the operation.
 */
export async function withLoading<T>(
  id: string,
  operation: () => Promise<T>,
  options: LoadingOptions = {}
): Promise<T> {
  startLoading(id, options);

  try {
    const result = await operation();
    await completeLoading(id, 'success');
    return result;
  } catch (error) {
    await completeLoading(id, 'error');
    throw error;
  }
}

/**
 * Creates a loading button that shows state.
 * @param button The button element.
 * @param loadingText Text to show while loading.
 * @returns Control object.
 */
export function createLoadingButton(
  button: HTMLButtonElement,
  loadingText: string = 'Loading...'
): { start: () => void; complete: (success?: boolean) => void } {
  const originalText = button.textContent;
  const originalDisabled = button.disabled;

  const start = () => {
    button.disabled = true;
    button.classList.add('loading-pulse');
    button.textContent = loadingText;
  };

  const complete = (success: boolean = true) => {
    button.disabled = originalDisabled;
    button.classList.remove('loading-pulse');
    button.textContent = originalText;

    if (success) {
      button.classList.add('content-reveal');
      setTimeout(() => button.classList.remove('content-reveal'), DURATION.SLOW);
    }
  };

  return { start, complete };
}

/**
 * Creates a progress indicator.
 * @param container The container element.
 * @param determinate Whether progress is determinate or indeterminate.
 * @returns Control object.
 */
export function createProgressIndicator(
  container: HTMLElement,
  determinate: boolean = false
): { setProgress: (percent: number) => void; remove: () => void } {
  injectSkeletonStyles();

  const progress = document.createElement('div');
  progress.className = 'loading-progress';
  progress.innerHTML = `
    <div class="loading-progress__bar ${determinate ? '' : 'loading-progress__bar--indeterminate'}"></div>
  `;
  container.appendChild(progress);

  const bar = progress.querySelector('.loading-progress__bar') as HTMLElement;

  const setProgress = (percent: number) => {
    bar.classList.remove('loading-progress__bar--indeterminate');
    bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  };

  const remove = () => {
    progress.remove();
  };

  return { setProgress, remove };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Disposes all loading state and styles.
 */
export function dispose(): void {
  tasks.clear();
  listeners.clear();
  document.getElementById('skeleton-styles')?.remove();
  skeletonStylesInjected = false;
  log.debug('Loading orchestrator disposed');
}

