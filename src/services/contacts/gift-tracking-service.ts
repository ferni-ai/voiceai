/**
 * Gift Tracking & Suggestion Service
 *
 * "Better Than Human" - Never forget a gift. Never repeat one.
 * Track gifts given/received and get AI-powered suggestions based on
 * the person's interests, past gifts, and relationship context.
 *
 * @module services/contacts/gift-tracking-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import { callLLM } from '../llm-utils.js';
import { getContact, recordInteraction } from './contact-relationship-service.js';
import type { Firestore } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'GiftTrackingService' });

// ============================================================================
// TYPES
// ============================================================================

export interface Gift {
  id: string;
  userId: string;
  contactId: string;
  contactName: string;
  direction: 'given' | 'received';
  item: string;
  description?: string;
  occasion: string;
  date: Date;
  price?: number;
  reaction?: 'loved' | 'liked' | 'neutral' | 'disliked';
  notes?: string;
  tags?: string[];
  imageUrl?: string;
}

export interface GiftSuggestion {
  idea: string;
  description: string;
  priceRange: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  tags: string[];
  avoidReason?: string; // If suggesting to avoid something
}

export interface GiftHistory {
  given: Gift[];
  received: Gift[];
  patterns: {
    favoriteCategories: string[];
    averageSpending: number;
    preferredOccasions: string[];
  };
}

// ============================================================================
// FIRESTORE + IN-MEMORY CACHE
// ============================================================================

const giftCache = new Map<string, Gift[]>();
const COLLECTION_NAME = 'user_gifts';

let db: Firestore | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<Firestore | null> | null = null;

async function getFirestore(): Promise<Firestore | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<Firestore | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Gift tracking Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for gift tracking');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

function getCacheKey(userId: string): string {
  return `gifts_${userId}`;
}

export function clearGiftCache(): void {
  giftCache.clear();
}

/**
 * Get Firestore collection reference for user's gifts
 */
async function getGiftsCollection(userId: string) {
  const firestore = await getFirestore();
  if (!firestore) return null;
  return firestore.collection(COLLECTION_NAME).doc(userId).collection('gifts');
}

/**
 * Load gifts from Firestore into cache
 */
async function loadGiftsFromFirestore(userId: string): Promise<Gift[]> {
  try {
    const collection = await getGiftsCollection(userId);
    if (!collection) {
      return giftCache.get(getCacheKey(userId)) || [];
    }

    const snapshot = await collection.orderBy('date', 'desc').get();

    const gifts: Gift[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date: data.date?.toDate?.() || new Date(data.date),
      } as Gift;
    });

    const key = getCacheKey(userId);
    giftCache.set(key, gifts);

    return gifts;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load gifts from Firestore, using cache');
    return giftCache.get(getCacheKey(userId)) || [];
  }
}

/**
 * Save gift to Firestore
 */
async function saveGiftToFirestore(userId: string, gift: Gift): Promise<void> {
  try {
    const collection = await getGiftsCollection(userId);
    if (!collection) {
      log.debug('Firestore not available, gift saved to cache only');
      return;
    }

    await collection.doc(gift.id).set(
      cleanForFirestore({
        ...gift,
        date: gift.date,
        createdAt: new Date(),
      })
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save gift to Firestore');
    // Don't throw - we still have it in cache
  }
}

// ============================================================================
// GIFT CRUD OPERATIONS
// ============================================================================

/**
 * Record a gift given or received
 *
 * "Better Than Human" Integration:
 * - Saves to Firestore for persistence
 * - Automatically records an interaction
 * - Updates relationship context
 */
export async function recordGift(userId: string, gift: Omit<Gift, 'id' | 'userId'>): Promise<Gift> {
  const key = getCacheKey(userId);
  const gifts = giftCache.get(key) || [];

  const newGift: Gift = {
    ...gift,
    id: `gift_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    date: gift.date instanceof Date ? gift.date : new Date(gift.date),
  };

  // Save to cache
  gifts.push(newGift);
  giftCache.set(key, gifts);

  // Save to Firestore for persistence
  await saveGiftToFirestore(userId, newGift);

  // "Better Than Human" - Automatically record as an interaction
  // This ensures gifts show up in interaction history and affect relationship strength
  try {
    await recordInteraction(userId, {
      contactId: gift.contactId,
      userId,
      date: newGift.date,
      type: gift.direction === 'given' ? 'gift_given' : 'gift_received',
      direction: gift.direction === 'given' ? 'outbound' : 'inbound',
      summary: `${gift.direction === 'given' ? 'Gave' : 'Received'} ${gift.item} for ${gift.occasion}`,
      topics: gift.tags,
      sentiment:
        gift.reaction === 'loved' || gift.reaction === 'liked'
          ? 'positive'
          : gift.reaction === 'disliked'
            ? 'negative'
            : 'positive', // Gifts are generally positive
      linkedGiftId: newGift.id,
      amount: gift.price,
    });
    log.debug({ giftId: newGift.id }, 'Gift recorded as interaction');
  } catch (interactionError) {
    // Don't fail gift recording if interaction fails
    log.warn({ error: String(interactionError) }, 'Failed to record gift as interaction');
  }

  log.info(
    { giftId: newGift.id, contactId: gift.contactId, direction: gift.direction },
    'Gift recorded'
  );

  return newGift;
}

/**
 * Get gift history for a contact
 */
export async function getGiftHistory(userId: string, contactId: string): Promise<GiftHistory> {
  const key = getCacheKey(userId);
  const allGifts = giftCache.get(key) || [];

  const contactGifts = allGifts.filter((g) => g.contactId === contactId);

  const given = contactGifts.filter((g) => g.direction === 'given');
  const received = contactGifts.filter((g) => g.direction === 'received');

  // Analyze patterns
  const allTags = contactGifts.flatMap((g) => g.tags || []);
  const tagCounts = allTags.reduce(
    (acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const favoriteCategories = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  const avgSpending =
    given.length > 0 ? given.reduce((sum, g) => sum + (g.price || 0), 0) / given.length : 0;

  const occasions = [...new Set(contactGifts.map((g) => g.occasion))];

  return {
    given,
    received,
    patterns: {
      favoriteCategories,
      averageSpending: Math.round(avgSpending),
      preferredOccasions: occasions,
    },
  };
}

/**
 * Get all gifts for a user
 * Loads from Firestore if not in cache
 */
export async function getAllGifts(userId: string): Promise<Gift[]> {
  const key = getCacheKey(userId);

  // Check cache first
  if (giftCache.has(key)) {
    return giftCache.get(key) || [];
  }

  // Load from Firestore
  return loadGiftsFromFirestore(userId);
}

/**
 * Update gift reaction
 */
export async function updateGiftReaction(
  userId: string,
  giftId: string,
  reaction: Gift['reaction']
): Promise<Gift | null> {
  const key = getCacheKey(userId);
  const gifts = giftCache.get(key) || [];

  const giftIndex = gifts.findIndex((g) => g.id === giftId);
  if (giftIndex === -1) return null;

  gifts[giftIndex].reaction = reaction;
  giftCache.set(key, gifts);

  return gifts[giftIndex];
}

// ============================================================================
// AI-POWERED GIFT SUGGESTIONS
// ============================================================================

/**
 * Generate personalized gift suggestions using LLM
 */
export async function generateGiftSuggestions(
  userId: string,
  contactId: string,
  occasion: string,
  budget?: { min: number; max: number }
): Promise<GiftSuggestion[]> {
  // Get contact info
  const contact = await getContact(userId, contactId);
  if (!contact) {
    log.warn({ userId, contactId }, 'Contact not found for gift suggestions');
    return getDefaultSuggestions(occasion, budget);
  }

  // Get gift history
  const history = await getGiftHistory(userId, contactId);

  // Build context for LLM
  const pastGiftsContext =
    history.given.length > 0
      ? `Past gifts given: ${history.given.map((g) => `${g.item} (${g.occasion}, reaction: ${g.reaction || 'unknown'})`).join(', ')}`
      : 'No gift history yet';

  const avoidList = history.given
    .filter((g) => g.reaction === 'disliked' || g.reaction === 'neutral')
    .map((g) => g.item);

  const lovedCategories = history.given
    .filter((g) => g.reaction === 'loved')
    .flatMap((g) => g.tags || []);

  const prompt = `You are a thoughtful gift advisor helping find the perfect gift for ${contact.name}.

Context:
- Relationship: ${contact.relationship || 'friend'}
- Occasion: ${occasion}
- Budget: ${budget ? `$${budget.min}-$${budget.max}` : 'flexible'}
- Their interests: ${contact.topics?.join(', ') || 'unknown'}
- ${pastGiftsContext}
${avoidList.length > 0 ? `- Avoid (didn't resonate): ${avoidList.join(', ')}` : ''}
${lovedCategories.length > 0 ? `- They loved gifts in these categories: ${lovedCategories.join(', ')}` : ''}
${contact.notes ? `- Notes: ${contact.notes}` : ''}

Generate 5 thoughtful, personalized gift suggestions. For each:
1. Be specific (not generic like "a book" - suggest a specific type or title)
2. Explain why this gift fits them personally
3. Consider their interests and relationship context
4. Avoid anything in the "avoid" list

Format each suggestion as JSON with these fields:
- idea: the gift idea (specific)
- description: 1-2 sentence description
- priceRange: estimated price range
- confidence: high/medium/low based on how well it fits
- reasoning: why this gift for this person
- tags: array of category tags

Return as a JSON array of 5 suggestions.`;

  try {
    const response = await callLLM(prompt, {
      temperature: 0.8,
      maxTokens: 800,
    });

    // Parse JSON response
    const jsonMatch = response?.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]) as GiftSuggestion[];
      return suggestions.slice(0, 5);
    }

    return getDefaultSuggestions(occasion, budget);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate gift suggestions');
    return getDefaultSuggestions(occasion, budget);
  }
}

/**
 * Default suggestions when LLM fails
 */
function getDefaultSuggestions(
  occasion: string,
  budget?: { min: number; max: number }
): GiftSuggestion[] {
  const defaults: Record<string, GiftSuggestion[]> = {
    birthday: [
      {
        idea: 'Personalized photo book',
        description: 'A custom photo book of shared memories',
        priceRange: '$30-60',
        confidence: 'medium',
        reasoning: 'Personal and thoughtful for any relationship',
        tags: ['personal', 'memories', 'keepsake'],
      },
      {
        idea: 'Experience gift card',
        description: 'Gift card for a local experience (spa, restaurant, activity)',
        priceRange: '$50-100',
        confidence: 'medium',
        reasoning: 'Creates memories rather than stuff',
        tags: ['experience', 'flexible', 'activity'],
      },
    ],
    christmas: [
      {
        idea: 'Cozy gift basket',
        description: 'Warm blanket, hot cocoa, and a good book',
        priceRange: '$40-80',
        confidence: 'medium',
        reasoning: 'Perfect for the winter season',
        tags: ['cozy', 'seasonal', 'comfort'],
      },
    ],
    default: [
      {
        idea: 'Handwritten letter with small gift',
        description: 'A heartfelt letter paired with their favorite treat',
        priceRange: '$10-30',
        confidence: 'medium',
        reasoning: 'Personal touch goes a long way',
        tags: ['personal', 'thoughtful', 'low-cost'],
      },
    ],
  };

  return defaults[occasion.toLowerCase()] || defaults.default;
}

// ============================================================================
// GIFT OCCASION REMINDERS
// ============================================================================

export interface GiftReminder {
  contactId: string;
  contactName: string;
  occasion: string;
  date: Date;
  daysUntil: number;
  suggestedBudget?: number;
  lastGiftGiven?: Gift;
}

/**
 * Get upcoming gift occasions
 */
export async function getUpcomingGiftOccasions(
  userId: string,
  daysAhead = 30
): Promise<GiftReminder[]> {
  const { getContacts } = await import('./contact-relationship-service.js');
  const contacts = await getContacts(userId);
  const reminders: GiftReminder[] = [];

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() + daysAhead);

  for (const contact of contacts) {
    if (!contact.importantDates) continue;

    for (const importantDate of contact.importantDates) {
      // Parse MM-DD date
      const [month, day] = importantDate.date.split('-').map(Number);
      if (!month || !day) continue;

      // Create date for this year
      const dateThisYear = new Date(today.getFullYear(), month - 1, day);

      // If already passed this year, check next year
      if (dateThisYear < today) {
        dateThisYear.setFullYear(dateThisYear.getFullYear() + 1);
      }

      // Check if within range
      if (dateThisYear <= cutoff) {
        const daysUntil = Math.ceil(
          (dateThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Get last gift given for this occasion
        const history = await getGiftHistory(userId, contact.contactId);
        const lastGift = history.given
          .filter((g) => g.occasion.toLowerCase().includes(importantDate.type))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        reminders.push({
          contactId: contact.contactId,
          contactName: contact.name,
          occasion: importantDate.label || importantDate.type,
          date: dateThisYear,
          daysUntil,
          suggestedBudget: history.patterns.averageSpending || undefined,
          lastGiftGiven: lastGift,
        });
      }
    }
  }

  // Sort by date
  reminders.sort((a, b) => a.daysUntil - b.daysUntil);

  return reminders;
}

// ============================================================================
// GIFT ANALYTICS
// ============================================================================

export interface GiftAnalytics {
  totalGiven: number;
  totalReceived: number;
  totalSpent: number;
  averagePerGift: number;
  topRecipients: Array<{ name: string; count: number }>;
  popularCategories: Array<{ category: string; count: number }>;
  reactionBreakdown: Record<string, number>;
}

/**
 * Get gift analytics for a user
 */
export async function getGiftAnalytics(userId: string): Promise<GiftAnalytics> {
  const allGifts = await getAllGifts(userId);

  const given = allGifts.filter((g) => g.direction === 'given');
  const received = allGifts.filter((g) => g.direction === 'received');

  // Calculate totals
  const totalSpent = given.reduce((sum, g) => sum + (g.price || 0), 0);

  // Top recipients
  const recipientCounts = given.reduce(
    (acc, g) => {
      acc[g.contactName] = (acc[g.contactName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const topRecipients = Object.entries(recipientCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Popular categories
  const tagCounts = allGifts
    .flatMap((g) => g.tags || [])
    .reduce(
      (acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  const popularCategories = Object.entries(tagCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Reaction breakdown
  const reactionBreakdown = given.reduce(
    (acc, g) => {
      const reaction = g.reaction || 'unknown';
      acc[reaction] = (acc[reaction] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    totalGiven: given.length,
    totalReceived: received.length,
    totalSpent,
    averagePerGift: given.length > 0 ? Math.round(totalSpent / given.length) : 0,
    topRecipients,
    popularCategories,
    reactionBreakdown,
  };
}
