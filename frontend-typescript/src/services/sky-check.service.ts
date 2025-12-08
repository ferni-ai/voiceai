/**
 * Sky Check Service
 *
 * Manages daily emotional weather check-ins with backend sync.
 * Records mood/energy and retrieves history.
 */

import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('SkyCheck');

// ============================================================================
// TYPES
// ============================================================================

export type WeatherPrimary = 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
export type EnergyLevel = 'high' | 'medium' | 'low';

export interface SkyCheckInput {
  primary: WeatherPrimary;
  energy: EnergyLevel;
  note?: string;
}

export interface SkyCheckEntry {
  date: string;
  weather: {
    primary: WeatherPrimary;
    energy: EnergyLevel;
    note?: string;
  };
  ritualId: string;
}

export interface SkyCheckServiceCallbacks {
  onSkyCheckRecorded?: (entry: SkyCheckEntry) => void;
  onHistoryUpdated?: (history: SkyCheckEntry[]) => void;
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

const STORAGE_KEY = 'ferni_sky_checks';
const MAX_LOCAL_ENTRIES = 30; // Keep last 30 days locally

// ============================================================================
// SKY CHECK SERVICE
// ============================================================================

class SkyCheckService {
  private history: SkyCheckEntry[] = [];
  private callbacks: SkyCheckServiceCallbacks = {};
  private initialized = false;

  /**
   * Initialize the service by loading from localStorage
   */
  initialize(): void {
    if (this.initialized) return;

    this.loadFromStorage();
    this.initialized = true;
    log.info('Sky check service initialized', { count: this.history.length });
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: SkyCheckServiceCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Record a new sky check
   */
  async recordSkyCheck(weather: SkyCheckInput): Promise<SkyCheckEntry | null> {
    const now = new Date().toISOString();
    
    const entry: SkyCheckEntry = {
      date: now,
      weather: {
        primary: weather.primary,
        energy: weather.energy,
        note: weather.note,
      },
      ritualId: 'ferni-sky-check',
    };

    // Save locally first (optimistic update)
    this.addToHistory(entry);
    this.saveToStorage();

    // Sync to backend
    try {
      const result = await apiPost<{ success: boolean; recordedAt: string }>('/api/sky-check', { weather });
      
      if (result.ok) {
        log.info('Sky check recorded', { weather: weather.primary, energy: weather.energy });
        this.callbacks.onSkyCheckRecorded?.(entry);
        return entry;
      } else {
        log.warn('Backend sync failed', { error: result.error });
        // Keep local entry even if backend fails
        return entry;
      }
    } catch (err) {
      log.warn('Backend sync error', err);
      // Keep local entry even if backend fails
      return entry;
    }
  }

  /**
   * Get sky check history
   */
  async getHistory(days = 30): Promise<SkyCheckEntry[]> {
    this.initialize();

    // Try to fetch from backend first
    try {
      const result = await apiGet<{ history: SkyCheckEntry[]; stats: { totalSkyChecks: number } }>(
        '/api/sky-check/history',
        { days: String(days) }
      );
      
      if (result.ok && result.data?.history) {
        this.history = result.data.history;
        this.saveToStorage();
        log.debug('Loaded history from backend', { count: this.history.length });
        this.callbacks.onHistoryUpdated?.(this.history);
        return this.history;
      }
    } catch (err) {
      log.warn('Failed to fetch history from backend', err);
    }

    // Return local cache
    return this.history;
  }

  /**
   * Get today's sky check (if any)
   */
  getTodaySkyCheck(): SkyCheckEntry | null {
    this.initialize();
    
    const today = new Date().toISOString().split('T')[0];
    return this.history.find(entry => entry.date.startsWith(today ?? '')) ?? null;
  }

  /**
   * Check if sky check was done today
   */
  isDoneToday(): boolean {
    return this.getTodaySkyCheck() !== null;
  }

  /**
   * Get recent history (last 7 days)
   */
  getRecentHistory(): SkyCheckEntry[] {
    this.initialize();
    return this.history.slice(0, 7);
  }

  /**
   * Get weather streak (consecutive days)
   */
  getCurrentStreak(): number {
    this.initialize();
    
    if (this.history.length === 0) return 0;
    
    let streak = 0;
    let currentDate = new Date();
    
    // Check if today's check is done
    const todayStr = currentDate.toISOString().split('T')[0];
    const hasToday = this.history.some(e => e.date.startsWith(todayStr ?? ''));
    
    if (!hasToday) {
      // If no check today, start from yesterday
      currentDate.setDate(currentDate.getDate() - 1);
    }
    
    for (let i = 0; i < this.history.length && i < 365; i++) {
      const checkDateStr = currentDate.toISOString().split('T')[0];
      const hasCheck = this.history.some(e => e.date.startsWith(checkDateStr ?? ''));
      
      if (hasCheck) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return streak;
  }

  /**
   * Clear all data (for account deletion)
   */
  clearAll(): void {
    this.history = [];
    localStorage.removeItem(STORAGE_KEY);
    log.info('Sky check history cleared');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private addToHistory(entry: SkyCheckEntry): void {
    // Add to beginning (most recent first)
    this.history.unshift(entry);
    
    // Keep only last N entries locally
    if (this.history.length > MAX_LOCAL_ENTRIES) {
      this.history = this.history.slice(0, MAX_LOCAL_ENTRIES);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.history = JSON.parse(stored) as SkyCheckEntry[];
        log.debug('Loaded sky checks from storage', { count: this.history.length });
      }
    } catch (err) {
      log.error('Failed to load sky checks from storage', err);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
      log.debug('Saved sky checks to storage', { count: this.history.length });
    } catch (err) {
      log.error('Failed to save sky checks to storage', err);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const skyCheckService = new SkyCheckService();

export function initSkyCheckService(): void {
  skyCheckService.initialize();
}

export default skyCheckService;

