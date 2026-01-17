/**
 * Calendar Sync Engine
 *
 * Handles bidirectional sync between Ferni's calendar and external providers.
 *
 * Sync Strategy:
 * - Ferni calendar is the canonical source of truth
 * - External events are imported into Ferni
 * - Ferni events can be exported to connected providers
 * - Conflicts are resolved based on user preference
 *
 * @module calendar/sync-engine
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  CalendarEvent,
  CalendarProvider,
  ProviderConnection,
  SyncResult,
  SyncConflict,
  SyncError,
  ConflictResolution,
} from './types.js';
import {
  getEvents,
  getEventsNeedingSync,
  importExternalEvent,
  updateEvent,
  getProviderConnections,
  updateProviderConnection,
  clearUserCache,
} from './unified-calendar-store.js';
import { getProvider } from './providers/provider-registry.js';

const log = getLogger();

// ============================================================================
// SYNC CONFIGURATION
// ============================================================================

interface SyncOptions {
  /** Days in the past to sync */
  pastDays?: number;
  /** Days in the future to sync */
  futureDays?: number;
  /** How to resolve conflicts */
  conflictResolution?: ConflictResolution;
  /** Force full sync (ignore timestamps) */
  fullSync?: boolean;
}

const DEFAULT_SYNC_OPTIONS: Required<SyncOptions> = {
  pastDays: 7,
  futureDays: 30,
  conflictResolution: 'newest-wins',
  fullSync: false,
};

// ============================================================================
// SYNC ENGINE CLASS
// ============================================================================

export class CalendarSyncEngine {
  private syncInProgress = new Set<string>();

  /**
   * Sync all connected providers for a user
   */
  async syncAll(userId: string, options: SyncOptions = {}): Promise<SyncResult[]> {
    const opts = { ...DEFAULT_SYNC_OPTIONS, ...options };
    const connections = await getProviderConnections(userId);

    const results: SyncResult[] = [];

    for (const connection of connections) {
      if (!connection.connected || !connection.syncEnabled) continue;

      const result = await this.syncProvider(userId, connection.provider, opts);
      results.push(result);
    }

    return results;
  }

  /**
   * Sync a specific provider
   */
  async syncProvider(
    userId: string,
    provider: CalendarProvider,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const syncKey = `${userId}:${provider}`;
    const opts = { ...DEFAULT_SYNC_OPTIONS, ...options };

    // Prevent concurrent syncs for same user/provider
    if (this.syncInProgress.has(syncKey)) {
      return {
        success: false,
        provider,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        conflicts: [],
        errors: [
          {
            message: 'Sync already in progress',
            code: 'SYNC_IN_PROGRESS',
            provider,
            timestamp: new Date(),
          },
        ],
        syncedAt: new Date(),
      };
    }

    this.syncInProgress.add(syncKey);

    const result: SyncResult = {
      success: true,
      provider,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      conflicts: [],
      errors: [],
      syncedAt: new Date(),
    };

    try {
      const adapter = getProvider(provider);
      if (!adapter) {
        throw new Error(`Provider ${provider} not found`);
      }

      const isConnected = await adapter.isConnected(userId);
      if (!isConnected) {
        throw new Error(`User not connected to ${provider}`);
      }

      // Calculate sync window
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - opts.pastDays);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + opts.futureDays);
      endDate.setHours(23, 59, 59, 999);

      log.info({ userId, provider, startDate, endDate }, 'Starting calendar sync');

      // Step 1: Pull events from provider
      const pullResult = await this.pullFromProvider(
        userId,
        provider,
        adapter,
        startDate,
        endDate,
        opts
      );
      result.eventsCreated += pullResult.created;
      result.eventsUpdated += pullResult.updated;
      result.conflicts.push(...pullResult.conflicts);
      result.errors.push(...pullResult.errors);

      // Step 2: Push pending events to provider
      const pushResult = await this.pushToProvider(userId, provider, adapter, startDate, endDate);
      result.eventsCreated += pushResult.created;
      result.eventsUpdated += pushResult.updated;
      result.eventsDeleted += pushResult.deleted;
      result.errors.push(...pushResult.errors);

      // Update last sync time
      const connections = await getProviderConnections(userId);
      const connection = connections.find((c) => c.provider === provider);
      if (connection) {
        connection.lastSyncedAt = new Date();
        connection.error = undefined;
        await updateProviderConnection(userId, connection);
      }

      // Clear cache to ensure fresh data
      clearUserCache(userId);

      log.info(
        {
          userId,
          provider,
          created: result.eventsCreated,
          updated: result.eventsUpdated,
          deleted: result.eventsDeleted,
          conflicts: result.conflicts.length,
        },
        'Calendar sync completed'
      );
    } catch (error) {
      result.success = false;
      result.errors.push({
        message: String(error),
        code: 'SYNC_ERROR',
        provider,
        timestamp: new Date(),
      });

      // Update connection with error
      const connections = await getProviderConnections(userId);
      const connection = connections.find((c) => c.provider === provider);
      if (connection) {
        connection.error = String(error);
        await updateProviderConnection(userId, connection);
      }

      log.error({ error: String(error), userId, provider }, 'Calendar sync failed');
    } finally {
      this.syncInProgress.delete(syncKey);
    }

    return result;
  }

  /**
   * Pull events from provider into Ferni
   */
  private async pullFromProvider(
    userId: string,
    provider: CalendarProvider,
    adapter: ReturnType<typeof getProvider>,
    startDate: Date,
    endDate: Date,
    opts: Required<SyncOptions>
  ): Promise<{
    created: number;
    updated: number;
    conflicts: SyncConflict[];
    errors: SyncError[];
  }> {
    const result = {
      created: 0,
      updated: 0,
      conflicts: [] as SyncConflict[],
      errors: [] as SyncError[],
    };

    if (!adapter) return result;

    try {
      // Fetch events from provider
      const providerEvents = await adapter.fetchEvents(userId, startDate, endDate);

      // Get existing Ferni events in same time range
      const ferniEvents = await getEvents(userId, startDate, endDate);

      // Build lookup map for existing events by external ID
      const existingByExternalId = new Map<string, CalendarEvent>();
      for (const event of ferniEvents) {
        if (event.externalId && event.source === provider) {
          existingByExternalId.set(event.externalId, event);
        }
      }

      // Import or update each provider event
      for (const providerEvent of providerEvents) {
        if (!providerEvent.externalId) continue;

        const existing = existingByExternalId.get(providerEvent.externalId);

        if (existing) {
          // Check for conflicts
          const conflict = this.detectConflict(existing, providerEvent);

          if (conflict) {
            const resolved = this.resolveConflict(conflict, opts.conflictResolution);

            if (resolved === 'provider') {
              // Update Ferni event with provider data
              await importExternalEvent(
                userId,
                provider,
                providerEvent.externalId,
                providerEvent.externalCalendarId || 'primary',
                {
                  title: providerEvent.title,
                  description: providerEvent.description,
                  location: providerEvent.location,
                  startTime: providerEvent.startTime,
                  endTime: providerEvent.endTime,
                  isAllDay: providerEvent.isAllDay,
                  attendees: providerEvent.attendees,
                  reminders: providerEvent.reminders,
                },
                providerEvent.etag
              );
              result.updated++;
            } else if (resolved === 'conflict') {
              result.conflicts.push(conflict);
            }
            // If resolved === 'ferni', keep Ferni's version (no action needed)
          } else {
            // No conflict, but check if etag changed (simple update)
            if (providerEvent.etag !== existing.etag) {
              await importExternalEvent(
                userId,
                provider,
                providerEvent.externalId,
                providerEvent.externalCalendarId || 'primary',
                {
                  title: providerEvent.title,
                  description: providerEvent.description,
                  location: providerEvent.location,
                  startTime: providerEvent.startTime,
                  endTime: providerEvent.endTime,
                  isAllDay: providerEvent.isAllDay,
                  attendees: providerEvent.attendees,
                  reminders: providerEvent.reminders,
                },
                providerEvent.etag
              );
              result.updated++;
            }
          }
        } else {
          // New event from provider
          await importExternalEvent(
            userId,
            provider,
            providerEvent.externalId,
            providerEvent.externalCalendarId || 'primary',
            {
              title: providerEvent.title,
              description: providerEvent.description,
              location: providerEvent.location,
              startTime: providerEvent.startTime,
              endTime: providerEvent.endTime,
              isAllDay: providerEvent.isAllDay,
              attendees: providerEvent.attendees,
              reminders: providerEvent.reminders,
            },
            providerEvent.etag
          );
          result.created++;
        }
      }
    } catch (error) {
      result.errors.push({
        message: `Pull failed: ${String(error)}`,
        code: 'PULL_ERROR',
        provider,
        timestamp: new Date(),
      });
    }

    return result;
  }

  /**
   * Push pending Ferni events to provider
   */
  private async pushToProvider(
    userId: string,
    provider: CalendarProvider,
    adapter: ReturnType<typeof getProvider>,
    _startDate: Date,
    _endDate: Date
  ): Promise<{
    created: number;
    updated: number;
    deleted: number;
    errors: SyncError[];
  }> {
    const result = { created: 0, updated: 0, deleted: 0, errors: [] as SyncError[] };

    if (!adapter) return result;

    try {
      // Get events needing sync
      const pendingEvents = await getEventsNeedingSync(userId);

      for (const event of pendingEvents) {
        try {
          if (event.syncStatus === 'deleted' && event.externalId) {
            // Delete from provider
            const success = await adapter.deleteEvent(
              userId,
              event.externalId,
              event.externalCalendarId
            );
            if (success) {
              result.deleted++;
            }
          } else if (event.syncStatus === 'pending') {
            if (event.externalId) {
              // Update existing event in provider
              const success = await adapter.updateEvent(userId, event);
              if (success) {
                event.syncStatus = 'synced';
                event.lastSyncAttempt = new Date();
                await updateEvent(userId, event.id, { status: event.status });
                result.updated++;
              }
            } else {
              // Create new event in provider
              const externalId = await adapter.createEvent(userId, event);
              if (externalId) {
                event.externalId = externalId;
                event.source = provider;
                event.syncStatus = 'synced';
                event.lastSyncAttempt = new Date();
                await updateEvent(userId, event.id, { status: event.status });
                result.created++;
              }
            }
          }
        } catch (error) {
          result.errors.push({
            eventId: event.id,
            message: `Failed to sync event: ${String(error)}`,
            code: 'PUSH_EVENT_ERROR',
            provider,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      result.errors.push({
        message: `Push failed: ${String(error)}`,
        code: 'PUSH_ERROR',
        provider,
        timestamp: new Date(),
      });
    }

    return result;
  }

  /**
   * Detect if there's a conflict between Ferni and provider versions
   */
  private detectConflict(
    ferniEvent: CalendarEvent,
    providerEvent: CalendarEvent
  ): SyncConflict | null {
    // If Ferni event was modified after last sync
    const ferniModified =
      ferniEvent.lastSyncAttempt && ferniEvent.updatedAt > ferniEvent.lastSyncAttempt;

    // Check for meaningful differences
    const timeDiff =
      ferniEvent.startTime.getTime() !== providerEvent.startTime.getTime() ||
      ferniEvent.endTime.getTime() !== providerEvent.endTime.getTime();

    const titleDiff = ferniEvent.title !== providerEvent.title;
    const locationDiff = ferniEvent.location !== providerEvent.location;

    if (!ferniModified) {
      // Provider is newer, no conflict
      return null;
    }

    if (!timeDiff && !titleDiff && !locationDiff) {
      // No meaningful differences
      return null;
    }

    // Determine conflict type
    let conflictType: SyncConflict['conflictType'] = 'both-modified';
    if (timeDiff && !titleDiff && !locationDiff) {
      conflictType = 'time';
    } else if (!timeDiff && titleDiff && !locationDiff) {
      conflictType = 'title';
    } else if (!timeDiff && !titleDiff && locationDiff) {
      conflictType = 'location';
    }

    return {
      eventId: ferniEvent.id,
      ferniEvent,
      providerEvent,
      conflictType,
      detectedAt: new Date(),
    };
  }

  /**
   * Resolve a conflict based on strategy
   */
  private resolveConflict(
    conflict: SyncConflict,
    strategy: ConflictResolution
  ): 'ferni' | 'provider' | 'conflict' {
    switch (strategy) {
      case 'ferni-wins':
        return 'ferni';

      case 'provider-wins':
        return 'provider';

      case 'newest-wins':
        const ferniTime = conflict.ferniEvent.updatedAt.getTime();
        const providerTime = conflict.providerEvent.updatedAt?.getTime() || 0;
        return ferniTime >= providerTime ? 'ferni' : 'provider';

      case 'manual':
      default:
        return 'conflict';
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let syncEngine: CalendarSyncEngine | null = null;

export function getSyncEngine(): CalendarSyncEngine {
  if (!syncEngine) {
    syncEngine = new CalendarSyncEngine();
  }
  return syncEngine;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Sync all providers for a user
 */
export async function syncAllProviders(
  userId: string,
  options?: SyncOptions
): Promise<SyncResult[]> {
  return getSyncEngine().syncAll(userId, options);
}

/**
 * Sync a specific provider
 */
export async function syncProvider(
  userId: string,
  provider: CalendarProvider,
  options?: SyncOptions
): Promise<SyncResult> {
  return getSyncEngine().syncProvider(userId, provider, options);
}

export default {
  CalendarSyncEngine,
  getSyncEngine,
  syncAllProviders,
  syncProvider,
};
