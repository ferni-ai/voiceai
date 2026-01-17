/**
 * Soul Stats Service
 *
 * Tracks and provides metrics for "Avatar Soul" responses - the superhuman
 * emotional intelligence capabilities that make Ferni "better than human".
 *
 * Metrics tracked:
 * - Micro-expressions: Subliminal 40-150ms emotional flashes
 * - Protective modes: Avatar scales up, draws closer during distress
 * - Comfort pulses: Warm pulsing glow during self-soothing
 * - Memory sparks: Golden flash acknowledging emotional peaks
 *
 * @module SoulStatsService
 */

import { createLogger } from '../utils/logger.js';
import { getAdminHeadersAsync } from '../admin/admin-api.js';

const log = createLogger('SoulStatsService');

// ============================================================================
// TYPES
// ============================================================================

export interface SoulStats {
  /** Number of micro-expressions triggered in the last 24 hours */
  microExpressions24h: number;
  /** Number of times protective mode was activated */
  protectiveModes: number;
  /** Number of comfort pulse sequences */
  comfortPulses: number;
  /** Number of memory spark triggers */
  memorySparks: number;
  /** Timestamp of last stats update */
  lastUpdated?: string;
}

export interface SoulStatsEvent {
  type: 'micro_expression' | 'protective_mode' | 'comfort_pulse' | 'memory_spark';
  timestamp: string;
  sessionId?: string;
  trigger?: string;
  duration?: number;
}

// ============================================================================
// LOCAL TRACKING (Client-side accumulation)
// ============================================================================

const localStats: SoulStats = {
  microExpressions24h: 0,
  protectiveModes: 0,
  comfortPulses: 0,
  memorySparks: 0,
};

const STORAGE_KEY = 'ferni_soul_stats';
const STATS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredStats {
  stats: SoulStats;
  savedAt: string;
}

/**
 * Load stats from localStorage (for client-side persistence)
 */
function loadLocalStats(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredStats = JSON.parse(stored);
      const savedAt = new Date(data.savedAt).getTime();
      const now = Date.now();

      // Reset if older than 24 hours
      if (now - savedAt > STATS_TTL_MS) {
        log.debug('Local stats expired, resetting');
        saveLocalStats();
        return;
      }

      Object.assign(localStats, data.stats);
      log.debug('Loaded local soul stats', localStats);
    }
  } catch (err) {
    log.warn('Failed to load local soul stats', err);
  }
}

/**
 * Save stats to localStorage
 */
function saveLocalStats(): void {
  try {
    const data: StoredStats = {
      stats: { ...localStats },
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    log.warn('Failed to save local soul stats', err);
  }
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class SoulStatsService {
  private initialized = false;
  private serverStats: SoulStats | null = null;

  /**
   * Initialize the service and load persisted stats
   */
  init(): void {
    if (this.initialized) return;
    loadLocalStats();
    this.initialized = true;
    log.info('Soul stats service initialized');
  }

  /**
   * Record a micro-expression trigger
   */
  recordMicroExpression(trigger?: string): void {
    localStats.microExpressions24h++;
    saveLocalStats();
    log.debug('Recorded micro-expression', { trigger, total: localStats.microExpressions24h });
  }

  /**
   * Record protective mode activation
   */
  recordProtectiveMode(sessionId?: string): void {
    localStats.protectiveModes++;
    saveLocalStats();
    log.debug('Recorded protective mode', { sessionId, total: localStats.protectiveModes });
  }

  /**
   * Record comfort pulse trigger
   */
  recordComfortPulse(): void {
    localStats.comfortPulses++;
    saveLocalStats();
    log.debug('Recorded comfort pulse', { total: localStats.comfortPulses });
  }

  /**
   * Record memory spark trigger
   */
  recordMemorySpark(): void {
    localStats.memorySparks++;
    saveLocalStats();
    log.debug('Recorded memory spark', { total: localStats.memorySparks });
  }

  /**
   * Get combined stats (local + server if available)
   */
  getStats(): SoulStats {
    if (this.serverStats) {
      // Merge local and server stats
      return {
        microExpressions24h: localStats.microExpressions24h + (this.serverStats.microExpressions24h || 0),
        protectiveModes: localStats.protectiveModes + (this.serverStats.protectiveModes || 0),
        comfortPulses: localStats.comfortPulses + (this.serverStats.comfortPulses || 0),
        memorySparks: localStats.memorySparks + (this.serverStats.memorySparks || 0),
        lastUpdated: this.serverStats.lastUpdated,
      };
    }
    return { ...localStats, lastUpdated: new Date().toISOString() };
  }

  /**
   * Fetch stats from server API (admin only)
   */
  async fetchFromServer(): Promise<SoulStats> {
    try {
      const headers = await getAdminHeadersAsync();
      const response = await fetch('/api/v1/admin/soul/stats', { headers });

      if (response.ok) {
        const data = await response.json();
        this.serverStats = data as SoulStats;
        log.debug('Fetched server soul stats', this.serverStats);
        return this.getStats();
      }

      // API not yet implemented - return local stats
      if (response.status === 404) {
        log.debug('Soul stats API not yet implemented, using local stats');
        return this.getStats();
      }

      log.warn('Failed to fetch soul stats from server', { status: response.status });
    } catch (err) {
      log.warn('Error fetching soul stats', err);
    }

    return this.getStats();
  }

  /**
   * Reset local stats (for testing)
   */
  resetLocalStats(): void {
    localStats.microExpressions24h = 0;
    localStats.protectiveModes = 0;
    localStats.comfortPulses = 0;
    localStats.memorySparks = 0;
    this.serverStats = null;
    this.initialized = false;
    saveLocalStats();
    log.info('Soul stats reset');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const soulStatsService = new SoulStatsService();

/**
 * Initialize soul stats tracking (call on app startup)
 */
export function initSoulStats(): void {
  soulStatsService.init();
}
