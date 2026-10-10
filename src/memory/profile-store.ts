/**
 * The store agent-side code keeps user profile data in.
 *
 * About 45 call sites (topic tracking, persona memories, natural auth, the
 * projects / reminders / outreach tools, background tasks) used the in-memory
 * getDefaultStore(), so what they saved never reached Firestore and was gone
 * when the process restarted. With PERSIST_AGENT_PROFILES=true they use the
 * configured store (Firestore in production). It is off by default because
 * some of these run on every voice turn: turn it on in dev, measure turn
 * latency, then in production.
 *
 * @module memory/profile-store
 */

import type { MemoryStore } from './storage/store.js';

export type { MemoryStore };
import { getDefaultStore } from './storage/in-memory-store.js';
import { getStore } from './storage/store-factory.js';
import { getLogger } from '../utils/safe-logger.js';
import { withUsageTiming } from './profile-store-usage.js';

const logger = getLogger().child({ module: 'ProfileStore' });

// Logged once per process, on first use: proves the flag reached the process
// and that a profile-store caller actually ran (most per-turn uses are reads,
// which leave no trace in Firestore).
let firstUseLogged = false;

export function isAgentProfilePersistenceOn(): boolean {
  return process.env.PERSIST_AGENT_PROFILES === 'true';
}

export async function getProfileStore(): Promise<MemoryStore> {
  const persistent = isAgentProfilePersistenceOn();
  if (!firstUseLogged) {
    firstUseLogged = true;
    logger.info({ store: persistent ? 'configured' : 'in-memory' }, 'Agent profile store first used');
  }
  const store = persistent ? await getStore() : getDefaultStore();
  return withUsageTiming(store, persistent ? 'configured' : 'in-memory');
}
