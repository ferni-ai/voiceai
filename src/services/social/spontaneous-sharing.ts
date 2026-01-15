/**
 * Spontaneous Sharing Service
 *
 * Surfaces persona quirks, contradictions, and personal details naturally
 * based on conversation context and relationship stage.
 *
 * PERSISTENCE: Tracks what's been shared to avoid repetition. Persists to
 * Firestore via the unified persistence layer.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { loadPersonaBehaviors } from './persona-behavior-manager.js';
import type { PersonaRelationshipStage } from '../../types/user-profile.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const logger = getLogger().child({ service: 'SpontaneousSharing' });

// ============================================================================
// Types
// ============================================================================

export interface SharingContext {
  personaId: string;
  relationshipStage: PersonaRelationshipStage;
  currentTopic?: string;
  userMessage?: string;
  turnCount: number;
}

export interface ShareResult {
  content: string;
  type:
    | 'endearing_contradiction'
    | 'simple_joy'
    | 'pet_peeve'
    | 'growth_edge'
    | 'relationship_moment'
    | 'guilty_pleasure'
    | 'strong_opinion';
  triggered_by?: string;
}

// Track what's been shared to avoid repetition
const sharedContent = new Map<string, Set<string>>(); // personaId:userId -> Set of shared content

// ============================================================================
// PERSISTENCE
// ============================================================================

interface SharedContentData {
  sharedByPersona: Record<string, string[]>; // personaId -> content array
  updatedAt: string;
}

let persistenceStore: PersistenceStore<SharedContentData> | null = null;
let isInitialized = false;

/**
 * Initialize persistence for spontaneous sharing
 */
export async function initializeSpontaneousSharingPersistence(): Promise<void> {
  if (isInitialized) return;

  persistenceStore = createPersistenceStore<SharedContentData>({
    collection: 'spontaneous_sharing',
    syncIntervalMs: 30000, // Sync every 30 seconds (not critical data)
    maxPendingChanges: 50,
  });

  isInitialized = true;
  logger.info('Spontaneous sharing persistence initialized');
}

/**
 * Load shared content from persistence for a user
 */
async function loadSharedContent(userId: string): Promise<void> {
  if (!persistenceStore) return;

  try {
    const data = await persistenceStore.load(userId);
    if (!data?.sharedByPersona) return;

    for (const [personaId, content] of Object.entries(data.sharedByPersona)) {
      const key = `${personaId}:${userId}`;
      sharedContent.set(key, new Set(content));
    }

    logger.debug({ userId }, 'Loaded shared content from persistence');
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to load shared content');
  }
}

/**
 * Persist shared content to Firestore for a user
 */
function persistSharedContent(userId: string): void {
  if (!persistenceStore) return;

  const sharedByPersona: Record<string, string[]> = {};

  for (const [key, content] of sharedContent.entries()) {
    if (key.endsWith(`:${userId}`)) {
      const personaId = key.split(':')[0];
      sharedByPersona[personaId] = Array.from(content);
    }
  }

  persistenceStore.set(cleanForFirestore(userId), {
    sharedByPersona,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Shutdown spontaneous sharing persistence
 */
export async function shutdownSpontaneousSharingPersistence(): Promise<void> {
  if (persistenceStore) {
    await persistenceStore.flush();
    logger.info('Spontaneous sharing persistence shutdown complete');
  }
}

// ============================================================================
// Core Functions
// ============================================================================

function getRandomItem<T>(arr: T[] | undefined): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Ensure shared content is loaded for a user (call before checking)
 */
async function ensureSharedContentLoaded(userId: string): Promise<void> {
  // Check if any content for this user is loaded
  const hasAnyContent = Array.from(sharedContent.keys()).some((key) => key.endsWith(`:${userId}`));
  if (!hasAnyContent && persistenceStore) {
    await loadSharedContent(userId);
  }
}

function hasBeenShared(personaId: string, userId: string, content: string): boolean {
  const key = `${personaId}:${userId}`;
  return sharedContent.get(key)?.has(content) ?? false;
}

function markAsShared(personaId: string, userId: string, content: string): void {
  const key = `${personaId}:${userId}`;
  let shared = sharedContent.get(key);
  if (!shared) {
    shared = new Set();
    sharedContent.set(key, shared);
  }
  shared.add(cleanForFirestore(content));

  // Persist to Firestore
  persistSharedContent(userId);
}

/**
 * Check if topic matches any trigger words
 */
function matchesTrigger(text: string, triggers: string[]): boolean {
  const lowerText = text.toLowerCase();
  return triggers.some((trigger) => lowerText.includes(trigger.toLowerCase()));
}

/**
 * Get relationship gate check
 */
function meetsRelationshipGate(
  required: PersonaRelationshipStage,
  current: PersonaRelationshipStage
): boolean {
  const order: PersonaRelationshipStage[] = [
    'stranger',
    'acquaintance',
    'friend',
    'trusted_advisor',
  ];
  return order.indexOf(current) >= order.indexOf(required);
}

/**
 * Try to surface an endearing contradiction
 */
export async function surfaceEnderingContradiction(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  // Need at least acquaintance level
  if (!meetsRelationshipGate('acquaintance', context.relationshipStage)) {
    return null;
  }

  const behaviors = await loadPersonaBehaviors(context.personaId);
  if (!behaviors) return null;

  const quirks = behaviors['quirks'] as Record<string, unknown> | undefined;
  const contradictions = quirks?.['endearing_contradictions'] as string[] | undefined;

  if (!contradictions || contradictions.length === 0) return null;

  // Random chance to share (don't share every time)
  if (Math.random() > 0.15) return null;

  // Ensure shared content is loaded from persistence
  await ensureSharedContentLoaded(userId);

  // Find one that hasn't been shared
  const available = contradictions.filter((c) => !hasBeenShared(context.personaId, userId, c));
  const chosen = getRandomItem(available);

  if (!chosen) return null;

  markAsShared(context.personaId, userId, chosen);

  return {
    content: chosen,
    type: 'endearing_contradiction',
  };
}

/**
 * Try to share a simple joy based on topic
 */
export async function shareSimpleJoy(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  const behaviors = await loadPersonaBehaviors(context.personaId);
  if (!behaviors) return null;

  const quirks = behaviors['quirks'] as Record<string, unknown> | undefined;
  const joys = quirks?.['things_that_make_me_unreasonably_happy'] as string[] | undefined;

  if (!joys || joys.length === 0) return null;

  // Low chance to share spontaneously
  if (Math.random() > 0.1) return null;

  // Ensure shared content is loaded from persistence
  await ensureSharedContentLoaded(userId);

  const available = joys.filter((j) => !hasBeenShared(context.personaId, userId, j));
  const chosen = getRandomItem(available);

  if (!chosen) return null;

  markAsShared(context.personaId, userId, chosen);

  return {
    content: chosen,
    type: 'simple_joy',
  };
}

/**
 * Reference a pet peeve when relevant topic comes up
 */
export async function referencePetPeeve(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  if (!context.userMessage && !context.currentTopic) return null;

  const behaviors = await loadPersonaBehaviors(context.personaId);
  if (!behaviors) return null;

  const quirks = behaviors['quirks'] as Record<string, unknown> | undefined;
  const peeves = quirks?.['things_that_make_me_unreasonably_annoyed'] as string[] | undefined;

  if (!peeves || peeves.length === 0) return null;

  // Ensure shared content is loaded from persistence
  await ensureSharedContentLoaded(userId);

  // Check if any peeve is relevant to current topic
  const text = `${context.userMessage || ''} ${context.currentTopic || ''}`;

  for (const peeve of peeves) {
    // Extract key words from the peeve (simple extraction)
    const peeveWords = peeve
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);

    if (peeveWords.some((word) => text.toLowerCase().includes(word))) {
      if (!hasBeenShared(context.personaId, userId, peeve)) {
        markAsShared(context.personaId, userId, peeve);
        return {
          content: peeve,
          type: 'pet_peeve',
          triggered_by: context.currentTopic || context.userMessage,
        };
      }
    }
  }

  return null;
}

/**
 * Share a growth edge (Maya-style vulnerability)
 */
export async function shareGrowthEdge(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  // Need friend level
  if (!meetsRelationshipGate('friend', context.relationshipStage)) {
    return null;
  }

  const behaviors = await loadPersonaBehaviors(context.personaId);
  if (!behaviors) return null;

  const quirks = behaviors['quirks'] as Record<string, unknown> | undefined;
  const edges = quirks?.['growth_edges'] as string[] | undefined;

  if (!edges || edges.length === 0) return null;

  // Rare chance (this is vulnerable content)
  if (Math.random() > 0.05) return null;

  // Ensure shared content is loaded from persistence
  await ensureSharedContentLoaded(userId);

  const available = edges.filter((e) => !hasBeenShared(context.personaId, userId, e));
  const chosen = getRandomItem(available);

  if (!chosen) return null;

  markAsShared(context.personaId, userId, chosen);

  return {
    content: chosen,
    type: 'growth_edge',
  };
}

/**
 * Share a relationship moment
 */
export async function shareRelationshipMoment(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  // Need friend level
  if (!meetsRelationshipGate('friend', context.relationshipStage)) {
    return null;
  }

  const behaviors = await loadPersonaBehaviors(context.personaId);
  if (!behaviors) return null;

  const quirks = behaviors['quirks'] as Record<string, unknown> | undefined;
  const moments = quirks?.['relationship_moments'] as string[] | undefined;

  if (!moments || moments.length === 0) return null;

  // Low chance
  if (Math.random() > 0.08) return null;

  // Ensure shared content is loaded from persistence
  await ensureSharedContentLoaded(userId);

  const available = moments.filter((m) => !hasBeenShared(context.personaId, userId, m));
  const chosen = getRandomItem(available);

  if (!chosen) return null;

  markAsShared(context.personaId, userId, chosen);

  return {
    content: chosen,
    type: 'relationship_moment',
  };
}

/**
 * Share a guilty pleasure
 */
export async function shareGuiltyPleasure(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  // Need acquaintance level
  if (!meetsRelationshipGate('acquaintance', context.relationshipStage)) {
    return null;
  }

  const behaviors = await loadPersonaBehaviors(context.personaId);
  if (!behaviors) return null;

  const quirks = behaviors['quirks'] as Record<string, unknown> | undefined;
  const pleasures = quirks?.['guilty_pleasures'] as string[] | undefined;

  if (!pleasures || pleasures.length === 0) return null;

  // Low chance
  if (Math.random() > 0.1) return null;

  // Ensure shared content is loaded from persistence
  await ensureSharedContentLoaded(userId);

  const available = pleasures.filter((p) => !hasBeenShared(context.personaId, userId, p));
  const chosen = getRandomItem(available);

  if (!chosen) return null;

  markAsShared(context.personaId, userId, chosen);

  return {
    content: chosen,
    type: 'guilty_pleasure',
  };
}

/**
 * Try all spontaneous sharing options and return the best one
 */
export async function trySpontaneousShare(
  context: SharingContext,
  userId: string
): Promise<ShareResult | null> {
  // Don't share in the first few turns
  if (context.turnCount < 3) return null;

  // Try different types in priority order
  const attempts = [
    async () => referencePetPeeve(context, userId), // Most context-dependent
    async () => surfaceEnderingContradiction(context, userId),
    async () => shareSimpleJoy(context, userId),
    async () => shareGuiltyPleasure(context, userId),
    async () => shareRelationshipMoment(context, userId),
    async () => shareGrowthEdge(context, userId), // Most vulnerable
  ];

  for (const attempt of attempts) {
    const result = await attempt();
    if (result) return result;
  }

  return null;
}

/**
 * Clear shared content tracking for a user
 */
export async function clearSharedContent(personaId: string, userId: string): Promise<void> {
  const key = `${personaId}:${userId}`;
  sharedContent.delete(key);

  // Also clear from persistence
  if (persistenceStore) {
    await persistenceStore.delete(userId);
  }
}

// Export as service object
export const SpontaneousSharingService = {
  initialize: initializeSpontaneousSharingPersistence,
  shutdown: shutdownSpontaneousSharingPersistence,
  surfaceContradiction: surfaceEnderingContradiction,
  shareJoy: shareSimpleJoy,
  referencePeeve: referencePetPeeve,
  shareGrowthEdge,
  shareRelationshipMoment,
  shareGuiltyPleasure,
  trySpontaneousShare,
  clearSharedContent,
};

export default SpontaneousSharingService;
