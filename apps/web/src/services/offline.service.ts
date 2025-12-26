/**
 * Offline Service - Unified Offline State Management
 *
 * Provides:
 * - Offline state detection and events
 * - Service worker registration
 * - Offline data queue for syncing
 * - LocalStorage persistence for critical data
 *
 * Usage:
 * ```typescript
 * import { offlineService, isOffline, onOfflineChange } from './offline.service';
 *
 * // Check offline status
 * if (isOffline()) {
 *   showOfflineBanner();
 * }
 *
 * // Listen for changes
 * onOfflineChange((offline) => {
 *   updateUI(offline);
 * });
 *
 * // Queue data for sync when online
 * offlineService.queueForSync('api/endpoint', data);
 * ```
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('OfflineService');

// ============================================================================
// TYPES
// ============================================================================

export interface SyncQueueItem {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  data: unknown;
  timestamp: number;
  retries: number;
}

export interface OfflineState {
  isOffline: boolean;
  lastOnline: number | null;
  pendingSyncCount: number;
  serviceWorkerStatus: 'unsupported' | 'installing' | 'waiting' | 'active' | 'error';
}

type OfflineChangeCallback = (isOffline: boolean) => void;

// ============================================================================
// STATE
// ============================================================================

const SYNC_QUEUE_KEY = 'ferni_sync_queue';
const MAX_QUEUE_SIZE = 100;
const MAX_RETRIES = 3;

const offlineState: OfflineState = {
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  lastOnline: null,
  pendingSyncCount: 0,
  serviceWorkerStatus: 'unsupported',
};

const listeners: Set<OfflineChangeCallback> = new Set();
let syncInProgress = false;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if currently offline
 */
export function isOffline(): boolean {
  return offlineState.isOffline;
}

/**
 * Get full offline state
 */
export function getOfflineState(): OfflineState {
  return { ...offlineState };
}

/**
 * Subscribe to offline state changes
 */
export function onOfflineChange(callback: OfflineChangeCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Initialize offline service
 * Call this once on app startup
 */
export function initOfflineService(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Load pending sync count
  const queue = loadSyncQueue();
  offlineState.pendingSyncCount = queue.length;

  // Set initial state
  offlineState.isOffline = !navigator.onLine;
  if (navigator.onLine) {
    offlineState.lastOnline = Date.now();
  }

  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Register service worker
  void registerServiceWorker();

  log.info('Offline service initialized', { isOffline: offlineState.isOffline });
}

/**
 * Dispose offline service
 */
export function disposeOfflineService(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  listeners.clear();
}

// ============================================================================
// SERVICE WORKER
// ============================================================================

/**
 * Nuclear cache clear - use ?clearcache in URL to force complete refresh
 * This unregisters service workers and clears all caches
 */
async function checkForCacheClear(): Promise<boolean> {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('clearcache')) {
    return false;
  }

  log.info('🧹 Cache clear requested via URL parameter');

  try {
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        log.info('Unregistered service worker', { scope: registration.scope });
      }
    }

    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        log.info('Deleted cache', { cacheName });
      }
    }

    // Clear localStorage items that might cause issues
    localStorage.removeItem('ferni_admin_key');
    localStorage.removeItem('ferni_dev_mode');

    // Remove the clearcache param and reload
    urlParams.delete('clearcache');
    const newUrl = urlParams.toString() 
      ? `${window.location.pathname}?${urlParams.toString()}`
      : window.location.pathname;
    
    log.info('Cache cleared! Reloading...');
    window.location.replace(newUrl);
    return true;
  } catch (error) {
    log.error('Cache clear failed', { error: String(error) });
    return false;
  }
}

async function registerServiceWorker(): Promise<void> {
  // Check for cache clear request first
  if (await checkForCacheClear()) {
    return; // Page will reload
  }

  if (!('serviceWorker' in navigator)) {
    log.warn('Service workers not supported');
    offlineState.serviceWorkerStatus = 'unsupported';
    return;
  }

  try {
    offlineState.serviceWorkerStatus = 'installing';

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Track registration state
    if (registration.installing) {
      offlineState.serviceWorkerStatus = 'installing';
      registration.installing.addEventListener('statechange', handleSWStateChange);
    } else if (registration.waiting) {
      offlineState.serviceWorkerStatus = 'waiting';
    } else if (registration.active) {
      offlineState.serviceWorkerStatus = 'active';
    }

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', handleSWStateChange);
      }
    });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    log.info('Service worker registered', { 
      scope: registration.scope,
      status: offlineState.serviceWorkerStatus 
    });
  } catch (error) {
    log.error('Service worker registration failed', { error: String(error) });
    offlineState.serviceWorkerStatus = 'error';
  }
}

function handleSWStateChange(event: Event): void {
  const target = event.target as ServiceWorker;
  log.debug('Service worker state changed', { state: target.state });

  switch (target.state) {
    case 'installing':
      offlineState.serviceWorkerStatus = 'installing';
      break;
    case 'installed':
      offlineState.serviceWorkerStatus = 'waiting';
      break;
    case 'activated':
      offlineState.serviceWorkerStatus = 'active';
      break;
    case 'redundant':
      offlineState.serviceWorkerStatus = 'error';
      break;
  }
}

function handleSWMessage(event: MessageEvent): void {
  const { type, ...data } = event.data || {};

  switch (type) {
    case 'notification-click':
      // Dispatch custom event for app to handle
      window.dispatchEvent(new CustomEvent('ferni:notification-click', { detail: data }));
      break;
    case 'notification-dismissed':
      window.dispatchEvent(new CustomEvent('ferni:notification-dismissed', { detail: data }));
      break;
    case 'sync-complete':
      log.info('Background sync completed');
      break;
  }
}

// ============================================================================
// ONLINE/OFFLINE HANDLERS
// ============================================================================

function handleOnline(): void {
  offlineState.isOffline = false;
  offlineState.lastOnline = Date.now();

  log.info('Connection restored');

  // Notify listeners
  listeners.forEach((callback) => {
    try {
      callback(false);
    } catch (error) {
      log.error('Offline listener error', { error: String(error) });
    }
  });

  // Dispatch event
  window.dispatchEvent(new CustomEvent('ferni:online'));

  // Process sync queue
  void processSyncQueue();
}

function handleOffline(): void {
  offlineState.isOffline = true;

  log.warn('Connection lost');

  // Notify listeners
  listeners.forEach((callback) => {
    try {
      callback(true);
    } catch (error) {
      log.error('Offline listener error', { error: String(error) });
    }
  });

  // Dispatch event
  window.dispatchEvent(new CustomEvent('ferni:offline'));
}

// ============================================================================
// SYNC QUEUE
// ============================================================================

/**
 * Queue data for sync when online
 */
export function queueForSync(
  url: string,
  data: unknown,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST'
): string {
  const queue = loadSyncQueue();

  // Enforce max queue size
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift(); // Remove oldest
  }

  const item: SyncQueueItem = {
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    url,
    method,
    data,
    timestamp: Date.now(),
    retries: 0,
  };

  queue.push(item);
  saveSyncQueue(queue);

  offlineState.pendingSyncCount = queue.length;

  log.debug('Queued for sync', { url, queueSize: queue.length });

  // If online, process immediately
  if (!offlineState.isOffline) {
    void processSyncQueue();
  }

  return item.id;
}

/**
 * Get pending sync items
 */
export function getPendingSyncItems(): SyncQueueItem[] {
  return loadSyncQueue();
}

/**
 * Clear sync queue
 */
export function clearSyncQueue(): void {
  saveSyncQueue([]);
  offlineState.pendingSyncCount = 0;
}

async function processSyncQueue(): Promise<void> {
  if (syncInProgress || offlineState.isOffline) {
    return;
  }

  syncInProgress = true;
  const queue = loadSyncQueue();

  if (queue.length === 0) {
    syncInProgress = false;
    return;
  }

  log.info('Processing sync queue', { count: queue.length });

  const processed: string[] = [];
  const failed: SyncQueueItem[] = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item.data),
      });

      if (response.ok) {
        processed.push(item.id);
        log.debug('Sync item processed', { id: item.id, url: item.url });
      } else if (item.retries < MAX_RETRIES) {
        item.retries++;
        failed.push(item);
      } else {
        log.warn('Sync item failed after max retries', { id: item.id, url: item.url });
        processed.push(item.id); // Remove from queue
      }
    } catch (error) {
      if (item.retries < MAX_RETRIES) {
        item.retries++;
        failed.push(item);
      } else {
        log.warn('Sync item failed after max retries', { 
          id: item.id, 
          url: item.url,
          error: String(error)
        });
        processed.push(item.id);
      }
    }
  }

  // Update queue with failed items only
  saveSyncQueue(failed);
  offlineState.pendingSyncCount = failed.length;

  log.info('Sync queue processed', { 
    processed: processed.length, 
    remaining: failed.length 
  });

  syncInProgress = false;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function loadSyncQueue(): SyncQueueItem[] {
  try {
    const stored = localStorage.getItem(SYNC_QUEUE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    log.warn('Failed to load sync queue', { error: String(error) });
  }
  return [];
}

function saveSyncQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    log.warn('Failed to save sync queue', { error: String(error) });
  }
}

// ============================================================================
// OFFLINE DATA HELPERS
// ============================================================================

const OFFLINE_DATA_PREFIX = 'ferni_offline_';

/**
 * Save data for offline access
 */
export function saveOfflineData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`${OFFLINE_DATA_PREFIX}${key}`, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (error) {
    log.warn('Failed to save offline data', { key, error: String(error) });
  }
}

/**
 * Load offline data
 */
export function loadOfflineData<T>(key: string, maxAge?: number): T | null {
  try {
    const stored = localStorage.getItem(`${OFFLINE_DATA_PREFIX}${key}`);
    if (!stored) {
      return null;
    }

    const { data, timestamp } = JSON.parse(stored);

    // Check if expired
    if (maxAge && Date.now() - timestamp > maxAge) {
      localStorage.removeItem(`${OFFLINE_DATA_PREFIX}${key}`);
      return null;
    }

    return data as T;
  } catch (error) {
    log.warn('Failed to load offline data', { key, error: String(error) });
    return null;
  }
}

/**
 * Clear offline data
 */
export function clearOfflineData(key?: string): void {
  if (key) {
    localStorage.removeItem(`${OFFLINE_DATA_PREFIX}${key}`);
    return;
  }

  // Clear all offline data
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(OFFLINE_DATA_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const offlineService = {
  init: initOfflineService,
  dispose: disposeOfflineService,
  isOffline,
  getState: getOfflineState,
  onChange: onOfflineChange,
  queueForSync,
  getPendingSyncItems,
  clearSyncQueue,
  saveData: saveOfflineData,
  loadData: loadOfflineData,
  clearData: clearOfflineData,
};

export default offlineService;

