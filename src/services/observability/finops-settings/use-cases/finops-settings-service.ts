/**
 * Reading and saving the FinOps settings through the store, with a brief cache so a burst
 * of dashboard reads costs one document read. A save writes through and answers with what
 * the store then holds; a store that is down is an error, never the defaults passed off as
 * saved figures.
 *
 * @module services/observability/finops-settings/use-cases/finops-settings-service
 */
import { TimeoutError, withTimeout } from '../../../../utils/async.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import {
  applyFinOpsPatch,
  DEFAULT_FINOPS_SETTINGS,
  type FinOpsSettingsPatch,
  type SavedFinOpsSettings,
} from '../domain/finops-settings.js';
import type { FinOpsSettingsStore } from '../ports/finops-settings-store.js';

const log = createLogger({ module: 'finops-settings' });

/** How long a read is reused before the store is asked again, by default. */
const FINOPS_SETTINGS_TTL_MS = 5_000;

/** The settings store could not be read or written; `reason` says why. */
export class FinOpsSettingsUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`FinOps settings unavailable: ${reason}`);
    this.name = 'FinOpsSettingsUnavailableError';
  }
}

function unavailable(error: unknown): FinOpsSettingsUnavailableError {
  if (error instanceof TimeoutError) {
    return new FinOpsSettingsUnavailableError(`Firestore did not answer within ${error.timeoutMs / 1000}s`); // prettier-ignore
  }
  return new FinOpsSettingsUnavailableError(error instanceof Error ? error.message : String(error));
}

export interface FinOpsSettingsService {
  /** The settings last read or saved (the defaults before the first read). */
  current: () => SavedFinOpsSettings;
  /** The saved settings, from the cache while it is fresh. */
  load: () => Promise<SavedFinOpsSettings>;
  /** Save `patch` as `updatedBy` and answer with the settings the store holds after it. */
  save: (patch: FinOpsSettingsPatch, updatedBy: string) => Promise<SavedFinOpsSettings>;
}

/**
 * How long one store call may take before it counts as unavailable, by default. The Admin
 * SDK retries UNAVAILABLE for about 40 s and the server drops the socket at 30 s, so with
 * no deadline a down store reached the browser as a dropped connection instead of a 503.
 */
const FINOPS_SETTINGS_DEADLINE_MS = 5_000;

export function createFinOpsSettingsService(
  store: FinOpsSettingsStore,
  {
    now = Date.now,
    ttlMs = FINOPS_SETTINGS_TTL_MS,
    deadlineMs = FINOPS_SETTINGS_DEADLINE_MS,
  }: { now?: () => number; ttlMs?: number; deadlineMs?: number } = {}
): FinOpsSettingsService {
  let cached: SavedFinOpsSettings = DEFAULT_FINOPS_SETTINGS;
  let readAt: number | null = null;

  async function readThrough(): Promise<SavedFinOpsSettings> {
    try {
      cached =
        (await withTimeout(store.read(), deadlineMs, 'FinOps settings read')) ??
        DEFAULT_FINOPS_SETTINGS;
      readAt = now();
      return cached;
    } catch (error) {
      readAt = null;
      log.error({ error: String(error) }, 'FinOps settings store unavailable');
      throw unavailable(error);
    }
  }

  return {
    current: () => cached,
    async load() {
      if (readAt !== null && now() - readAt < ttlMs) return cached;
      return readThrough();
    },
    async save(patch, updatedBy) {
      const meta = { updatedAt: new Date(now()).toISOString(), updatedBy };
      try {
        await withTimeout(store.merge(patch, meta), deadlineMs, 'FinOps settings save');
      } catch (error) {
        readAt = null;
        log.error({ error: String(error), updatedBy }, 'FinOps settings save failed');
        throw unavailable(error);
      }
      log.info({ fields: Object.keys(patch), updatedBy }, 'FinOps settings saved');
      try {
        return await readThrough();
      } catch (error) {
        // The write landed: answer it over the last values read, and reread next time
        log.warn({ error: String(error), updatedBy }, 'FinOps settings saved but not read back');
        cached = applyFinOpsPatch(cached, patch, meta);
        return cached;
      }
    },
  };
}
