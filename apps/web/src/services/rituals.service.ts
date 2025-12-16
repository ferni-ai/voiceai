/**
 * Rituals Service
 *
 * Manages user-created rituals with localStorage persistence and backend sync.
 * Handles CRUD operations for custom practices.
 */

import { createLogger } from '../utils/logger.js';
import { apiPost, apiDelete, getUserId } from '../utils/api.js';
import type { CustomRitual } from '../ui/ritual-builder.ui.js';

const log = createLogger('Rituals');

// ============================================================================
// TYPES
// ============================================================================

export interface SavedRitual extends CustomRitual {
  id: string;
  createdAt: string;
  updatedAt: string;
  streak: number;
  lastCompletedAt: string | null;
  completedDates: string[]; // ISO date strings
}

export interface RitualsServiceCallbacks {
  onRitualCreated?: (ritual: SavedRitual) => void;
  onRitualUpdated?: (ritual: SavedRitual) => void;
  onRitualDeleted?: (ritualId: string) => void;
  onStreakUpdated?: (ritual: SavedRitual) => void;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEY = 'ferni_user_rituals';

// ============================================================================
// RITUALS SERVICE
// ============================================================================

class RitualsService {
  private rituals: Map<string, SavedRitual> = new Map();
  private callbacks: RitualsServiceCallbacks = {};
  private initialized = false;

  /**
   * Initialize the service by loading from localStorage
   */
  initialize(): void {
    if (this.initialized) return;

    this.loadFromStorage();
    this.initialized = true;
    log.info('Rituals service initialized', { count: this.rituals.size });
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: RitualsServiceCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Create a new ritual from the builder
   */
  async createRitual(ritual: CustomRitual): Promise<SavedRitual> {
    const id = `ritual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const savedRitual: SavedRitual = {
      ...ritual,
      id,
      createdAt: now,
      updatedAt: now,
      streak: 0,
      lastCompletedAt: null,
      completedDates: [],
    };

    this.rituals.set(id, savedRitual);
    this.saveToStorage();

    // Try to sync to backend
    await this.syncToBackend(savedRitual);

    this.callbacks.onRitualCreated?.(savedRitual);
    log.info('Ritual created', { id, name: ritual.name });

    return savedRitual;
  }

  /**
   * Update an existing ritual
   */
  async updateRitual(id: string, updates: Partial<CustomRitual>): Promise<SavedRitual | null> {
    const existing = this.rituals.get(id);
    if (!existing) {
      log.warn('Ritual not found for update', { id });
      return null;
    }

    const updated: SavedRitual = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.rituals.set(id, updated);
    this.saveToStorage();

    // Try to sync to backend
    await this.syncToBackend(updated);

    this.callbacks.onRitualUpdated?.(updated);
    log.info('Ritual updated', { id, name: updated.name });

    return updated;
  }

  /**
   * Delete a ritual
   */
  async deleteRitual(id: string): Promise<boolean> {
    const ritual = this.rituals.get(id);
    if (!ritual) {
      log.warn('Ritual not found for deletion', { id });
      return false;
    }

    this.rituals.delete(id);
    this.saveToStorage();

    // Try to delete from backend
    await this.deleteFromBackend(id);

    this.callbacks.onRitualDeleted?.(id);
    log.info('Ritual deleted', { id, name: ritual.name });

    return true;
  }

  /**
   * Mark a ritual as completed for today
   */
  async completeRitual(id: string): Promise<SavedRitual | null> {
    const ritual = this.rituals.get(id);
    if (!ritual) {
      log.warn('Ritual not found for completion', { id });
      return null;
    }

    const today = new Date().toISOString().split('T')[0] ?? '';
    
    // Don't double-count completions
    if (today && ritual.completedDates.includes(today)) {
      log.debug('Ritual already completed today', { id });
      return ritual;
    }

    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0] ?? '';
    
    const wasCompletedYesterday = yesterdayStr ? ritual.completedDates.includes(yesterdayStr) : false;
    const newStreak = wasCompletedYesterday ? ritual.streak + 1 : 1;

    const completedDates: string[] = today 
      ? [...ritual.completedDates, today].slice(-90)
      : ritual.completedDates;

    const updated: SavedRitual = {
      ...ritual,
      streak: newStreak,
      lastCompletedAt: new Date().toISOString(),
      completedDates, // Keep last 90 days
      updatedAt: new Date().toISOString(),
    };

    this.rituals.set(id, updated);
    this.saveToStorage();

    // Try to sync to backend
    await this.syncToBackend(updated);

    this.callbacks.onStreakUpdated?.(updated);
    log.info('Ritual completed', { id, name: updated.name, streak: newStreak });

    return updated;
  }

  /**
   * Get all rituals
   */
  getAllRituals(): SavedRitual[] {
    this.initialize();
    return Array.from(this.rituals.values());
  }

  /**
   * Get a ritual by ID
   */
  getRitual(id: string): SavedRitual | null {
    this.initialize();
    return this.rituals.get(id) ?? null;
  }

  /**
   * Get rituals due today based on frequency
   */
  getRitualsDueToday(): SavedRitual[] {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const todayStr = today.toISOString().split('T')[0] ?? '';

    return this.getAllRituals().filter(ritual => {
      // Check if already completed today
      if (todayStr && ritual.completedDates.includes(todayStr)) {
        return false;
      }

      // Check frequency
      switch (ritual.frequency) {
        case 'daily':
          return true;
        case 'weekday':
          return !isWeekend;
        case 'weekend':
          return isWeekend;
        case 'weekly':
          // Due on Monday, or if never completed
          return dayOfWeek === 1 || !ritual.lastCompletedAt;
        default:
          return true;
      }
    });
  }

  /**
   * Get rituals with active streaks
   */
  getActiveStreaks(): SavedRitual[] {
    return this.getAllRituals().filter(r => r.streak > 0);
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as SavedRitual[];
        this.rituals = new Map(data.map(r => [r.id, r]));
        log.debug('Loaded rituals from storage', { count: this.rituals.size });
      }
    } catch (err) {
      log.error('Failed to load rituals from storage', err);
    }
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.rituals.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      log.debug('Saved rituals to storage', { count: data.length });
    } catch (err) {
      log.error('Failed to save rituals to storage', err);
    }
  }

  // ============================================================================
  // BACKEND SYNC
  // ============================================================================

  private async syncToBackend(ritual: SavedRitual): Promise<void> {
    const userId = getUserId();
    if (!userId) {
      log.debug('No user ID, skipping backend sync');
      return;
    }

    try {
      const result = await apiPost('/api/rituals', { ritual });

      if (!result.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      log.debug('Ritual synced to backend', { id: ritual.id });
    } catch (err) {
      // Silent fail - localStorage is the source of truth
      log.debug('Backend sync failed (non-critical)', err);
    }
  }

  private async deleteFromBackend(ritualId: string): Promise<void> {
    const userId = getUserId();
    if (!userId) return;

    try {
      const result = await apiDelete(`/api/rituals/${ritualId}`);

      if (!result.ok) {
        throw new Error(result.error || 'Delete failed');
      }

      log.debug('Ritual deleted from backend', { id: ritualId });
    } catch (err) {
      log.debug('Backend delete failed (non-critical)', err);
    }
  }

  /**
   * Sync all rituals to backend (for initial sync or recovery)
   */
  async syncAllToBackend(): Promise<void> {
    const userId = getUserId();
    if (!userId) return;

    const rituals = this.getAllRituals();
    for (const ritual of rituals) {
      await this.syncToBackend(ritual);
    }

    log.info('All rituals synced to backend', { count: rituals.length });
  }

  /**
   * Clear all data (for account deletion)
   */
  clearAll(): void {
    this.rituals.clear();
    localStorage.removeItem(STORAGE_KEY);
    log.info('All rituals cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const ritualsService = new RitualsService();

export function initRitualsService(): void {
  ritualsService.initialize();
}

export default ritualsService;

