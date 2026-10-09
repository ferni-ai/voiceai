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
import { getDefaultStore } from './storage/in-memory-store.js';
import { getStore } from './storage/store-factory.js';

export function isAgentProfilePersistenceOn(): boolean {
  return process.env.PERSIST_AGENT_PROFILES === 'true';
}

export async function getProfileStore(): Promise<MemoryStore> {
  return isAgentProfilePersistenceOn() ? getStore() : getDefaultStore();
}
