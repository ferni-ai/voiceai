/**
 * Captured Data Awareness Context Builder
 *
 * Surfaces what the "Better Than Human" passive capture has learned about this user.
 * This enables Ferni to reference saved information naturally.
 *
 * Data surfaced:
 * - Saved contacts (phone numbers, relationships)
 * - Pet information
 * - Favorite places
 * - Relationship network summary
 * - Recent capture activity
 *
 * Philosophy: Ferni should know WHAT has been captured so they can
 * reference it naturally ("I have your mom's number saved" vs guessing)
 *
 * @module intelligence/context-builders/awareness/captured-data-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHintInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';

const log = createLogger({ module: 'context:captured-data-awareness' });

// ============================================================================
// TYPES
// ============================================================================

interface CapturedDataSummary {
  contacts: Array<{ name?: string; relationship?: string; hasPhone: boolean; hasEmail: boolean }>;
  pets: Array<{ name: string; type: string }>;
  locations: Array<{ name: string; type: string }>;
  relationshipCount: number;
  recentCaptures: Array<{ type: string; summary: string; when: Date }>;
}

// ============================================================================
// DATA LOADERS
// ============================================================================

async function loadCapturedData(userId: string): Promise<CapturedDataSummary | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const summary: CapturedDataSummary = {
      contacts: [],
      pets: [],
      locations: [],
      relationshipCount: 0,
      recentCaptures: [],
    };

    // Load contacts
    const contactsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('contacts')
      .limit(10)
      .get();

    summary.contacts = contactsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        name: data.name,
        relationship: data.relationship,
        hasPhone: !!data.phone,
        hasEmail: !!data.email,
      };
    });

    // Load pets
    const petsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pets')
      .limit(5)
      .get();

    summary.pets = petsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        name: data.name || 'unnamed',
        type: data.type || 'pet',
      };
    });

    // Load favorite places
    const locationsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('favorite_places')
      .limit(5)
      .get();

    summary.locations = locationsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        name: data.name || 'unnamed place',
        type: data.type || 'place',
      };
    });

    // Load relationship count
    const relationshipsSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationships')
      .limit(50)
      .get();

    summary.relationshipCount = relationshipsSnap.size;

    return summary;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load captured data');
    return null;
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

function formatCapturedDataContext(data: CapturedDataSummary): string {
  const parts: string[] = [];

  // Contacts
  if (data.contacts.length > 0) {
    const contactList = data.contacts
      .slice(0, 5)
      .map((c) => {
        const parts = [];
        if (c.name) parts.push(c.name);
        if (c.relationship) parts.push(`(${c.relationship})`);
        if (c.hasPhone) parts.push('📱');
        if (c.hasEmail) parts.push('✉️');
        return `• ${parts.join(' ')}`;
      })
      .join('\n');
    parts.push(`SAVED CONTACTS (${data.contacts.length}):\n${contactList}`);
  }

  // Pets
  if (data.pets.length > 0) {
    const petList = data.pets.map((p) => `• ${p.name} (${p.type})`).join('\n');
    parts.push(`THEIR PETS:\n${petList}`);
  }

  // Favorite places
  if (data.locations.length > 0) {
    const placeList = data.locations.map((l) => `• ${l.name} (${l.type})`).join('\n');
    parts.push(`FAVORITE PLACES:\n${placeList}`);
  }

  // Relationships
  if (data.relationshipCount > 0) {
    parts.push(`RELATIONSHIPS MAPPED: ${data.relationshipCount} people in their life`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `[WHAT YOU KNOW ABOUT THEM - Reference naturally, don't recite]
${parts.join('\n\n')}

Use this knowledge naturally: "I have your mom's number if you need it" not "According to my records..."`;
}

async function buildCapturedDataAwareness(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { services, userData } = input;
  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;

  // Only inject after first few turns (avoid overwhelming early)
  if (!userId || turnCount < 2) {
    return [];
  }

  // Only inject occasionally (every 5 turns or session start)
  const shouldInject = turnCount === 2 || turnCount % 5 === 0;
  if (!shouldInject) {
    return [];
  }

  try {
    const data = await loadCapturedData(userId);
    if (!data) {
      return [];
    }

    const hasData =
      data.contacts.length > 0 ||
      data.pets.length > 0 ||
      data.locations.length > 0 ||
      data.relationshipCount > 0;

    if (!hasData) {
      return [];
    }

    const context = formatCapturedDataContext(data);
    if (!context) {
      return [];
    }

    log.debug(
      {
        userId,
        turnCount,
        contacts: data.contacts.length,
        pets: data.pets.length,
        locations: data.locations.length,
      },
      '📋 Captured data awareness injected'
    );

    return [
      createHintInjection('captured_data_awareness', context, {
        priority: 40, // Lower than emotional/safety builders
      }),
    ];
  } catch (error) {
    log.debug({ error: String(error) }, 'Captured data awareness failed');
    return [];
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

export const capturedDataAwarenessBuilder: ContextBuilder = {
  name: 'captured-data-awareness',
  description: 'Surfaces what passive capture has learned about the user',
  priority: 45, // Middle priority - not critical but useful
  category: BuilderCategory.CONTEXT,
  build: buildCapturedDataAwareness,
};

registerContextBuilder(capturedDataAwarenessBuilder);

export default capturedDataAwarenessBuilder;
