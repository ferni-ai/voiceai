/**
 * Custom Agent Persistence Service
 *
 * Handles Firestore storage for user-created custom agents.
 * Each user can have multiple custom agents stored in their
 * subcollection.
 *
 * @module custom-agent-persistence.service
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import type { CustomAgent, CreateCustomAgentRequest } from '../../types/custom-agent-api.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger().child({ module: 'CustomAgentPersistence' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_USERS = 'bogle_users';
const SUBCOLLECTION_CUSTOM_AGENTS = 'custom_agents';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Recursively removes undefined values from an object for Firestore compatibility.
 * Firestore does not accept undefined values in documents.
 */
function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value === undefined) {
      continue; // Skip undefined values
    }
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      // Recursively clean nested objects
      result[key] = removeUndefinedFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Handle arrays - filter out undefined elements and clean objects
      result[key] = value
        .filter((item) => item !== undefined)
        .map((item) =>
          item !== null && typeof item === 'object' && !(item instanceof Date)
            ? removeUndefinedFields(item as Record<string, unknown>)
            : item
        );
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Gets the Firestore reference for a user's custom agents collection
 */
function getCustomAgentsCollection(userId: string) {
  const db = getFirestore();
  return db.collection(COLLECTION_USERS).doc(userId).collection(SUBCOLLECTION_CUSTOM_AGENTS);
}

/**
 * Generates a unique ID for a custom agent
 */
function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates default values for a new custom agent
 */
function createDefaultAgent(
  userId: string,
  agentId: string,
  data: CreateCustomAgentRequest
): CustomAgent {
  const now = new Date();
  return {
    id: agentId,
    userId,
    name: data.name,
    displayName: data.displayName || data.name,
    description: data.description,
    type: data.type,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    voice: {
      type: 'selected',
      voiceId: '',
      status: 'pending',
      settings: {
        speed: 1.0,
        stability: 0.7,
        similarityBoost: 0.7,
      },
    },
    personality: {
      warmth: 0.5,
      humorLevel: 0.3,
      directness: 0.5,
      energy: 0.5,
      formality: 0.5,
      traits: [],
      values: [],
      cognitiveProfile: 'balanced',
      responsePatterns: {},
    },
    memories: {
      stories: [],
      wisdom: [],
      sharedMoments: [],
      journalEntries: data.type === 'twin' ? [] : undefined,
    },
    behaviors: {
      greetings: [],
      farewells: [],
      catchphrases: [],
      responsePatterns: {},
    },
    privacy: 'private',
    category: data.category,
    tags: data.tags || [],
    icon: data.icon,
    colors: data.colors,
  };
}

/**
 * Converts Firestore document data to CustomAgent type
 */
function docToCustomAgent(doc: FirebaseFirestore.DocumentSnapshot): CustomAgent | null {
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
    userId: data.userId,
    name: data.name,
    displayName: data.displayName,
    description: data.description,
    type: data.type,
    status: data.status,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
    updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    voice: data.voice,
    personality: data.personality,
    memories: data.memories,
    behaviors: data.behaviors,
    privacy: data.privacy,
    marketplaceId: data.marketplaceId,
    category: data.category,
    tags: data.tags || [],
    icon: data.icon,
    colors: data.colors,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Creates a new custom agent
 */
export async function createCustomAgent(
  userId: string,
  data: CreateCustomAgentRequest
): Promise<CustomAgent> {
  const agentId = generateAgentId();
  const agent = createDefaultAgent(userId, agentId, data);

  log.info({ userId, agentId, type: data.type }, 'Creating custom agent');

  try {
    const collection = getCustomAgentsCollection(userId);

    // Remove undefined fields for Firestore compatibility
    const firestoreDoc = removeUndefinedFields({
      ...agent,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    });

    await collection.doc(agentId).set(cleanForFirestore(firestoreDoc));

    log.info({ userId, agentId }, 'Custom agent created');
    return agent;
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to create custom agent');
    throw new Error(`Failed to create custom agent: ${(error as Error).message}`);
  }
}

/**
 * Gets a custom agent by ID
 */
export async function getCustomAgent(userId: string, agentId: string): Promise<CustomAgent | null> {
  log.debug({ userId, agentId }, 'Getting custom agent');

  try {
    const collection = getCustomAgentsCollection(userId);
    const doc = await collection.doc(agentId).get();
    return docToCustomAgent(doc);
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to get custom agent');
    throw new Error(`Failed to get custom agent: ${(error as Error).message}`);
  }
}

/**
 * Lists all custom agents for a user
 */
export async function listCustomAgents(userId: string): Promise<CustomAgent[]> {
  log.debug({ userId }, 'Listing custom agents');

  try {
    const collection = getCustomAgentsCollection(userId);
    const snapshot = await collection.orderBy('updatedAt', 'desc').get();

    const agents: CustomAgent[] = [];
    snapshot.forEach((doc) => {
      const agent = docToCustomAgent(doc);
      if (agent) {
        agents.push(agent);
      }
    });

    log.debug({ userId, count: agents.length }, 'Listed custom agents');
    return agents;
  } catch (error) {
    log.error({ error, userId }, 'Failed to list custom agents');
    throw new Error(`Failed to list custom agents: ${(error as Error).message}`);
  }
}

/**
 * Deep merges two objects, preserving existing values when partial updates are made
 */
function deepMerge<T>(existing: T, updates: Partial<T>): T {
  const result = { ...existing } as Record<string, unknown>;
  const existingRecord = existing as Record<string, unknown>;
  const updatesRecord = updates as Record<string, unknown>;

  for (const key in updatesRecord) {
    const updateValue = updatesRecord[key];
    const existingValue = existingRecord[key];

    if (updateValue === undefined) {
      continue; // Skip undefined values
    }

    // If both are objects (not arrays, not null), deep merge
    if (
      existingValue !== null &&
      updateValue !== null &&
      typeof existingValue === 'object' &&
      typeof updateValue === 'object' &&
      !Array.isArray(existingValue) &&
      !Array.isArray(updateValue) &&
      !(existingValue instanceof Date) &&
      !(updateValue instanceof Date)
    ) {
      result[key] = deepMerge(
        existingValue as Record<string, unknown>,
        updateValue as Record<string, unknown>
      );
    } else {
      result[key] = updateValue;
    }
  }

  return result as T;
}

/**
 * Updates a custom agent
 */
export async function updateCustomAgent(
  userId: string,
  agentId: string,
  data: Partial<CustomAgent>
): Promise<CustomAgent | null> {
  log.info({ userId, agentId }, 'Updating custom agent');

  try {
    const collection = getCustomAgentsCollection(userId);
    const docRef = collection.doc(agentId);

    // Check if agent exists
    const existing = await docRef.get();
    if (!existing.exists) {
      log.warn({ userId, agentId }, 'Custom agent not found for update');
      return null;
    }

    // Get existing data
    const existingData = existing.data() as CustomAgent;

    // Deep merge the updates with existing data
    const mergedData = deepMerge(existingData, data);
    mergedData.updatedAt = new Date();

    // Remove fields that shouldn't be updated directly
    delete (mergedData as Partial<CustomAgent>).id;
    delete (mergedData as Partial<CustomAgent>).userId;
    delete (mergedData as Partial<CustomAgent>).createdAt;

    // Remove undefined fields for Firestore compatibility
    const firestoreDoc = removeUndefinedFields(mergedData as unknown as Record<string, unknown>);

    await docRef.set(cleanForFirestore(firestoreDoc), { merge: true });

    // Fetch and return updated document
    const updated = await docRef.get();
    log.info({ userId, agentId }, 'Custom agent updated');
    return docToCustomAgent(updated);
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to update custom agent');
    throw new Error(`Failed to update custom agent: ${(error as Error).message}`);
  }
}

/**
 * Deletes a custom agent
 */
export async function deleteCustomAgent(userId: string, agentId: string): Promise<boolean> {
  log.info({ userId, agentId }, 'Deleting custom agent');

  try {
    const collection = getCustomAgentsCollection(userId);
    const docRef = collection.doc(agentId);

    // Check if agent exists
    const existing = await docRef.get();
    if (!existing.exists) {
      log.warn({ userId, agentId }, 'Custom agent not found for deletion');
      return false;
    }

    await docRef.delete();
    log.info({ userId, agentId }, 'Custom agent deleted');
    return true;
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to delete custom agent');
    throw new Error(`Failed to delete custom agent: ${(error as Error).message}`);
  }
}

// ============================================================================
// MEMORY OPERATIONS
// ============================================================================

/**
 * Adds a memory to a custom agent
 */
export async function addMemoryToAgent(
  userId: string,
  agentId: string,
  memoryType: 'stories' | 'wisdom' | 'sharedMoments' | 'journalEntries',
  memory: Record<string, unknown>
): Promise<CustomAgent | null> {
  log.info({ userId, agentId, memoryType }, 'Adding memory to custom agent');

  try {
    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return null;
    }

    // Add memory to appropriate array
    const memories = { ...agent.memories };
    const memoryWithId = {
      ...memory,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (memoryType === 'journalEntries' && memories.journalEntries) {
      memories.journalEntries = [...memories.journalEntries, memoryWithId as never];
    } else if (memoryType === 'stories') {
      memories.stories = [...memories.stories, memoryWithId as never];
    } else if (memoryType === 'wisdom') {
      memories.wisdom = [...memories.wisdom, memoryWithId as never];
    } else if (memoryType === 'sharedMoments') {
      memories.sharedMoments = [...memories.sharedMoments, memoryWithId as never];
    }

    return await updateCustomAgent(userId, agentId, { memories });
  } catch (error) {
    log.error({ error, userId, agentId, memoryType }, 'Failed to add memory');
    throw new Error(`Failed to add memory: ${(error as Error).message}`);
  }
}

/**
 * Removes a memory from a custom agent
 */
export async function removeMemoryFromAgent(
  userId: string,
  agentId: string,
  memoryType: 'stories' | 'wisdom' | 'sharedMoments' | 'journalEntries',
  memoryId: string
): Promise<CustomAgent | null> {
  log.info({ userId, agentId, memoryType, memoryId }, 'Removing memory from agent');

  try {
    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return null;
    }

    const memories = { ...agent.memories };

    if (memoryType === 'journalEntries' && memories.journalEntries) {
      memories.journalEntries = memories.journalEntries.filter((m) => m.id !== memoryId);
    } else if (memoryType === 'stories') {
      memories.stories = memories.stories.filter((m) => m.id !== memoryId);
    } else if (memoryType === 'wisdom') {
      memories.wisdom = memories.wisdom.filter((m) => m.id !== memoryId);
    } else if (memoryType === 'sharedMoments') {
      memories.sharedMoments = memories.sharedMoments.filter((m) => m.id !== memoryId);
    }

    return await updateCustomAgent(userId, agentId, { memories });
  } catch (error) {
    log.error({ error, userId, agentId, memoryId }, 'Failed to remove memory');
    throw new Error(`Failed to remove memory: ${(error as Error).message}`);
  }
}

// ============================================================================
// VOICE OPERATIONS
// ============================================================================

/**
 * Updates the voice configuration for a custom agent
 */
export async function updateAgentVoice(
  userId: string,
  agentId: string,
  voice: Partial<CustomAgent['voice']>
): Promise<CustomAgent | null> {
  log.info({ userId, agentId }, 'Updating agent voice');

  try {
    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return null;
    }

    const updatedVoice = {
      ...agent.voice,
      ...voice,
    };

    return await updateCustomAgent(userId, agentId, { voice: updatedVoice });
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to update agent voice');
    throw new Error(`Failed to update voice: ${(error as Error).message}`);
  }
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Gets all active custom agents for a user (for runtime loading)
 */
export async function getActiveCustomAgents(userId: string): Promise<CustomAgent[]> {
  log.debug({ userId }, 'Getting active custom agents');

  try {
    const collection = getCustomAgentsCollection(userId);
    const snapshot = await collection.where('status', '==', 'active').get();

    const agents: CustomAgent[] = [];
    snapshot.forEach((doc) => {
      const agent = docToCustomAgent(doc);
      if (agent) {
        agents.push(agent);
      }
    });

    return agents;
  } catch (error) {
    log.error({ error, userId }, 'Failed to get active custom agents');
    throw new Error(`Failed to get active agents: ${(error as Error).message}`);
  }
}

/**
 * Checks if a user owns a specific custom agent
 */
export async function userOwnsAgent(userId: string, agentId: string): Promise<boolean> {
  try {
    const agent = await getCustomAgent(userId, agentId);
    return agent !== null;
  } catch {
    return false;
  }
}
