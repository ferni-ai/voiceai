/**
 * Injectable data sources for the world-model snapshot.
 *
 * Defaults wrap stores already on main (entity_store, human signals,
 * unified user model, STM topics). Tests inject fakes — no network.
 *
 * @module intelligence/world-model/sources
 */

import { getRecentTopics } from '../../memory/dynamic/stm-buffer.js';
import {
  getAllEntities,
  getRelationshipsForEntity,
} from '../../memory/entity-store/index.js';
import { getPersistedHumanSignals } from '../../memory/human-signal-persistence.js';
import { loadUserModel } from '../unified-user-model.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'world-model:sources' });

export interface LooseEntity {
  id?: unknown;
  canonicalName?: unknown;
  name?: unknown;
  type?: unknown;
  relationship?: unknown;
  specificRelation?: unknown;
  attributes?: unknown;
  properties?: unknown;
}

export interface LooseRelationship {
  id?: unknown;
  fromEntity?: unknown;
  toEntity?: unknown;
  type?: unknown;
  label?: unknown;
}

export interface LooseAvoidance {
  topic?: unknown;
  approach?: unknown;
  possibleReason?: unknown;
}

export interface LooseHumanSignals {
  avoidances?: LooseAvoidance[];
  dreams?: Array<{ description?: unknown; title?: unknown }>;
  values?: Array<{ value?: unknown; name?: unknown }>;
}

export interface LooseUserModel {
  communicationStyle?: {
    verbosity?: string;
    formality?: string;
    preferredResponseLength?: string;
    directnessPreference?: number;
  };
  emotionalProfile?: {
    supportStyle?: string;
    baselineValence?: number;
  };
}

export interface WorldModelSources {
  listEntities: (userId: string) => Promise<LooseEntity[]>;
  listRelationships: (userId: string, entityIds: string[]) => Promise<LooseRelationship[]>;
  getHumanSignals: (userId: string) => Promise<LooseHumanSignals | null>;
  getUserModel: (userId: string) => Promise<LooseUserModel | null>;
  getSessionTopics: (sessionId: string) => string[];
}

async function defaultListEntities(userId: string): Promise<LooseEntity[]> {
  try {
    return (await getAllEntities(userId, {
      types: ['person', 'goal', 'commitment'],
      limit: 32,
    })) as unknown as LooseEntity[];
  } catch {
    try {
      return (await getAllEntities(userId, { limit: 32 })) as unknown as LooseEntity[];
    } catch (error) {
      log.debug({ userId, error: String(error) }, 'entity_store list failed');
      return [];
    }
  }
}

async function defaultListRelationships(
  userId: string,
  entityIds: string[]
): Promise<LooseRelationship[]> {
  const seen = new Set<string>();
  const out: LooseRelationship[] = [];
  const results = await Promise.allSettled(
    entityIds.slice(0, 8).map((id) => getRelationshipsForEntity(userId, id))
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      log.debug({ userId, error: String(result.reason) }, 'relationship list failed');
      continue;
    }
    for (const rel of result.value) {
      const id = typeof rel.id === 'string' ? rel.id : `${rel.fromEntity}:${rel.toEntity}:${rel.type}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(rel as unknown as LooseRelationship);
    }
  }
  return out;
}

async function defaultGetHumanSignals(userId: string): Promise<LooseHumanSignals | null> {
  try {
    return (await getPersistedHumanSignals(userId)) as LooseHumanSignals;
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'human-signal read failed');
    return null;
  }
}

async function defaultGetUserModel(userId: string): Promise<LooseUserModel | null> {
  try {
    return await loadUserModel(userId);
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'user-model read failed');
    return null;
  }
}

export function createDefaultWorldModelSources(): WorldModelSources {
  return {
    listEntities: defaultListEntities,
    listRelationships: defaultListRelationships,
    getHumanSignals: defaultGetHumanSignals,
    getUserModel: defaultGetUserModel,
    getSessionTopics: (sessionId) => {
      try {
        return getRecentTopics(sessionId);
      } catch {
        return [];
      }
    },
  };
}
