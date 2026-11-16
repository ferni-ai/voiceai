/**
 * On worker start, the dev agent writes the flag values it booted with to
 * ops/agent_flag_snapshot, so the dev switchboard page shows what is running (LiveKit
 * never returns secret values) and can tell when a restart picked up a change.
 *
 * Only on dev's database by its exact name (isKnownDevDatabase) and with FLAG_SNAPSHOT on;
 * prod never writes it. The write never delays or fails the boot: src/agent.ts does not
 * await it, and every failure, including opening Firestore, is logged as a warning here.
 *
 * @module config/agent-flags/boot-snapshot
 */
import { flagOn, type Env } from '../env-flag.js';
import { isKnownDevDatabase } from '../firestore-database.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { FlagStore } from './adapters/flag-store.js';
import { buildFlagSnapshot } from './domain/snapshot.js';

const log = createLogger({ module: 'agent-flag-snapshot' });

export async function writeFlagSnapshotOnBoot(
  env: Env = process.env,
  store?: FlagStore
): Promise<void> {
  if (!isKnownDevDatabase(env) || !flagOn('FLAG_SNAPSHOT', env)) return;
  try {
    const snapshot = buildFlagSnapshot(env, new Date(), env.BUILD_SHA?.trim() || null);
    // Firestore is loaded only when it will be written to, so prod's boot never pulls it in here.
    const target = store ?? (await import('./adapters/flag-store.js')).firestoreFlagStore();
    await target.writeSnapshot(snapshot);
    log.info(
      { flags: Object.keys(snapshot.flags).length, buildSha: snapshot.buildSha },
      'Flag snapshot written'
    );
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Flag snapshot not written; the dev switchboard may show stale values'
    );
  }
}
