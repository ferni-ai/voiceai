/**
 * Gift & Card Suggestions
 *
 * "Better Than Human" gift recommendations based on:
 * - Contact's interests and hobbies
 * - Relationship type and closeness
 * - Occasion and budget
 * - Past gift history (to avoid repeats)
 *
 * @module services/contacts/gift-suggestions
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import type { EnhancedContact, OutreachOccasion, RelationshipType } from './types.js';

const log = createLogger({ module: 'gift-suggestions' });

// ============================================================================
// TYPES
// ============================================================================

export type GiftCategory =
  | 'experiences' // Concerts, classes, spa day
  | 'personalized' // Custom items with their name/photo
  | 'practical' // Useful items they'd actually use
  | 'indulgent' // Luxury treats
  | 'charitable' // Donations in their name
  | 'homemade' // DIY gifts
  | 'digital' // Subscriptions, gift cards
  | 'books' // Books on their interests
  | 'food_drink' // Gourmet food, wine, etc.
  | 'tech' // Gadgets and electronics
  | 'wellness' // Health and self-care
  | 'hobby' // Related to their hobbies
  | 'home' // Home decor and items
  | 'fashion'; // Clothing and accessories

export type BudgetRange = 'thoughtful' | 'moderate' | 'generous' | 'splurge';

const BUDGET_RANGES: Record<BudgetRange, { min: number; max: number; label: string }> = {
  thoughtful: { min: 0, max: 25, label: 'Under $25' },
  moderate: { min: 25, max: 75, label: '$25-75' },
  generous: { min: 75, max: 150, label: '$75-150' },
  splurge: { min: 150, max: 500, label: '$150+' },
};

export interface GiftSuggestion {
  id: string;
  name: string;
  description: string;
  category: GiftCategory;
  priceRange: BudgetRange;
  estimatedPrice?: string;
  whyThisGift: string; // Personalized reason
  whereToBuy?: string[]; // Suggested retailers
  personalizeHow?: string; // How to make it more personal
  alternativeIdeas?: string[]; // Related alternatives
}

export interface GiftRecommendation {
  contactName: string;
  occasion: OutreachOccasion;
  suggestions: GiftSuggestion[];
  budgetAdvice: string;
  timingAdvice: string;
  personalTouchIdeas: string[];
}

export interface PastGift {
  contactId: string;
  date: Date;
  occasion: string;
  giftDescription: string;
  category: GiftCategory;
  reaction?: 'loved_it' | 'liked_it' | 'neutral' | 'not_their_thing';
  notes?: string;
}

// ============================================================================
// INTEREST-BASED GIFT MAPPINGS
// ============================================================================

interface InterestGiftMap {
  interests: string[];
  gifts: Array<{
    name: string;
    description: string;
    category: GiftCategory;
    priceRanges: BudgetRange[];
    whereToBuy?: string[];
    personalizeHow?: string;
  }>;
}

const INTEREST_GIFT_MAPPINGS: InterestGiftMap[] = [
  {
    interests: ['cooking', 'food', 'chef', 'baking', 'recipes'],
    gifts: [
      {
        name: 'Specialty cooking class',
        description: 'An online or in-person class for their favorite cuisine',
        category: 'experiences',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Sur La Table', 'Local cooking schools', 'Airbnb Experiences'],
        personalizeHow: 'Choose a cuisine they love or want to learn',
      },
      {
        name: 'High-quality spice set',
        description: 'Artisan spices from around the world',
        category: 'food_drink',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Penzeys', 'The Spice House', 'Diaspora Co'],
      },
      {
        name: 'Personalized cutting board',
        description: 'Custom engraved with their name or a meaningful phrase',
        category: 'personalized',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Etsy', 'Williams Sonoma'],
        personalizeHow: 'Engrave their name, a family recipe title, or inside joke',
      },
      {
        name: 'Cookbook by their favorite chef',
        description: 'Latest cookbook from a chef they admire',
        category: 'books',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Amazon', 'Local bookstore'],
      },
    ],
  },
  {
    interests: ['fitness', 'gym', 'workout', 'running', 'yoga', 'exercise', 'health'],
    gifts: [
      {
        name: 'Massage or spa treatment',
        description: 'A relaxing recovery session for their muscles',
        category: 'wellness',
        priceRanges: ['moderate', 'generous', 'splurge'],
        whereToBuy: ['Local spas', 'Massage Envy', 'Float therapy centers'],
      },
      {
        name: 'High-quality water bottle or gear',
        description: "Premium workout essentials they'll use daily",
        category: 'practical',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Hydro Flask', 'Yeti', 'Lululemon'],
      },
      {
        name: 'Fitness class package',
        description: 'Credits for classes they want to try',
        category: 'experiences',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['ClassPass', 'Local studios'],
      },
      {
        name: 'Recovery tools',
        description: 'Foam roller, massage gun, or percussion device',
        category: 'wellness',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Amazon', 'REI', 'Theragun'],
      },
    ],
  },
  {
    interests: ['reading', 'books', 'literature', 'writing'],
    gifts: [
      {
        name: 'Book subscription box',
        description: 'Monthly curated books in their favorite genre',
        category: 'digital',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Book of the Month', 'Literati', 'The Strand'],
      },
      {
        name: 'Beautiful reading accessories',
        description: 'Premium bookmark, book light, or reading stand',
        category: 'practical',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Etsy', 'Amazon', 'Uncommon Goods'],
        personalizeHow: 'Choose something that matches their reading style',
      },
      {
        name: 'First edition or signed book',
        description: 'A special copy of their favorite book',
        category: 'personalized',
        priceRanges: ['generous', 'splurge'],
        whereToBuy: ['AbeBooks', 'Local rare bookstores'],
      },
      {
        name: 'Local bookstore gift card',
        description: 'Support indie bookstores and let them choose',
        category: 'digital',
        priceRanges: ['thoughtful', 'moderate', 'generous'],
        whereToBuy: ['Local independent bookstores'],
      },
    ],
  },
  {
    interests: ['travel', 'adventure', 'exploring', 'vacation', 'trips'],
    gifts: [
      {
        name: 'Travel accessories',
        description: 'Quality packing cubes, tech organizer, or travel pillow',
        category: 'practical',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Away', 'Peak Design', 'Amazon'],
      },
      {
        name: 'Experience in their bucket list destination',
        description: 'Activity or tour for their next trip',
        category: 'experiences',
        priceRanges: ['moderate', 'generous', 'splurge'],
        whereToBuy: ['Airbnb Experiences', 'Viator', 'GetYourGuide'],
      },
      {
        name: 'Beautiful world map or travel journal',
        description: 'Something to plan or document their adventures',
        category: 'personalized',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Etsy', 'National Geographic Store'],
        personalizeHow: "Mark places they've been or want to go",
      },
      {
        name: 'Language learning subscription',
        description: 'Help them learn the language of their dream destination',
        category: 'digital',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Babbel', 'Rosetta Stone', 'Pimsleur'],
      },
    ],
  },
  {
    interests: ['music', 'concerts', 'instruments', 'vinyl', 'spotify'],
    gifts: [
      {
        name: 'Concert tickets',
        description: 'See their favorite artist live',
        category: 'experiences',
        priceRanges: ['moderate', 'generous', 'splurge'],
        whereToBuy: ['Ticketmaster', 'StubHub', 'SeatGeek'],
      },
      {
        name: 'Vinyl record of meaningful album',
        description: 'A record that means something to your relationship',
        category: 'personalized',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Discogs', 'Local record stores', 'Amazon'],
        personalizeHow: 'Choose an album tied to a shared memory',
      },
      {
        name: 'Music streaming subscription',
        description: 'Premium music service for a year',
        category: 'digital',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Spotify', 'Apple Music', 'Tidal'],
      },
      {
        name: 'Quality headphones',
        description: 'Upgrade their listening experience',
        category: 'tech',
        priceRanges: ['generous', 'splurge'],
        whereToBuy: ['Sony', 'Bose', 'Apple', 'Sennheiser'],
      },
    ],
  },
  {
    interests: ['gardening', 'plants', 'flowers', 'nature', 'outdoors'],
    gifts: [
      {
        name: 'Specialty plant or rare cutting',
        description: 'Something unique for their collection',
        category: 'hobby',
        priceRanges: ['thoughtful', 'moderate', 'generous'],
        whereToBuy: ['Local nurseries', 'Etsy plant sellers', 'The Sill'],
      },
      {
        name: 'Quality gardening tools',
        description: "Beautiful, durable tools they'll use for years",
        category: 'practical',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ["Gardener's Supply", 'Terrain', 'Barebones'],
      },
      {
        name: 'Seed subscription or heirloom seeds',
        description: 'Interesting varieties to grow',
        category: 'hobby',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Baker Creek', "Johnny's Seeds", 'Seed Savers Exchange'],
      },
    ],
  },
  {
    interests: ['tech', 'gadgets', 'computers', 'programming', 'gaming'],
    gifts: [
      {
        name: 'Useful tech accessory',
        description: 'Quality cable, stand, or desk gadget',
        category: 'tech',
        priceRanges: ['thoughtful', 'moderate'],
        whereToBuy: ['Anker', 'Bellroy', 'Amazon'],
      },
      {
        name: 'Gaming or streaming gear',
        description: 'Something to enhance their setup',
        category: 'tech',
        priceRanges: ['moderate', 'generous', 'splurge'],
        whereToBuy: ['Best Buy', 'Amazon', 'Micro Center'],
      },
      {
        name: 'Online course in their interest',
        description: 'Learn something new in tech',
        category: 'digital',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Udemy', 'Coursera', 'Frontend Masters'],
      },
    ],
  },
  {
    interests: ['art', 'painting', 'creative', 'design', 'crafts', 'diy'],
    gifts: [
      {
        name: 'Quality art supplies',
        description: 'Premium materials in their medium',
        category: 'hobby',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Blick Art', "Jerry's Artarama", 'Michaels'],
      },
      {
        name: 'Art class or workshop',
        description: 'Learn a new technique or medium',
        category: 'experiences',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Skillshare', 'Local art studios', 'Domestika'],
      },
      {
        name: 'Museum membership',
        description: 'Year-long access to inspiring art',
        category: 'experiences',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Local art museums'],
      },
    ],
  },
  {
    interests: ['wine', 'beer', 'cocktails', 'spirits', 'whiskey'],
    gifts: [
      {
        name: 'Tasting experience',
        description: 'Wine tasting, brewery tour, or distillery visit',
        category: 'experiences',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Local wineries', 'Viator', 'Airbnb Experiences'],
      },
      {
        name: 'Premium bottle selection',
        description: "A special bottle they wouldn't buy themselves",
        category: 'food_drink',
        priceRanges: ['moderate', 'generous', 'splurge'],
        whereToBuy: ['Local wine shops', 'Total Wine', 'K&L Wine'],
      },
      {
        name: 'Quality bar tools',
        description: 'Professional-grade cocktail equipment',
        category: 'practical',
        priceRanges: ['moderate', 'generous'],
        whereToBuy: ['Cocktail Kingdom', 'Williams Sonoma'],
      },
    ],
  },
];

// ============================================================================
// RELATIONSHIP-BASED DEFAULTS
// ============================================================================

const RELATIONSHIP_GIFT_STYLES: Record<
  RelationshipType,
  {
    categories: GiftCategory[];
    defaultBudget: BudgetRange;
    personalTouch: string;
  }
> = {
  family: {
    categories: ['personalized', 'experiences', 'practical', 'homemade'],
    defaultBudget: 'generous',
    personalTouch: 'Add a handwritten note about a shared family memory',
  },
  partner: {
    categories: ['experiences', 'personalized', 'indulgent', 'wellness'],
    defaultBudget: 'generous',
    personalTouch: 'Reference something from your relationship journey',
  },
  friend: {
    categories: ['experiences', 'indulgent', 'hobby', 'food_drink'],
    defaultBudget: 'moderate',
    personalTouch: 'Include an inside joke or reference to a shared memory',
  },
  colleague: {
    categories: ['practical', 'digital', 'food_drink', 'books'],
    defaultBudget: 'moderate',
    personalTouch: 'Add a note about their professional accomplishments',
  },
  acquaintance: {
    categories: ['food_drink', 'digital', 'practical'],
    defaultBudget: 'thoughtful',
    personalTouch: 'A simple, thoughtful note is perfect',
  },
  mentor: {
    categories: ['books', 'experiences', 'personalized', 'practical'],
    defaultBudget: 'generous',
    personalTouch: 'Express gratitude for their guidance and impact',
  },
  mentee: {
    categories: ['books', 'digital', 'experiences', 'practical'],
    defaultBudget: 'moderate',
    personalTouch: 'Celebrate their growth and encourage their journey',
  },
  professional: {
    categories: ['practical', 'digital', 'food_drink'],
    defaultBudget: 'moderate',
    personalTouch: 'Keep it professional but warm',
  },
  other: {
    categories: ['food_drink', 'digital', 'practical'],
    defaultBudget: 'thoughtful',
    personalTouch: 'A sincere note goes a long way',
  },
};

// ============================================================================
// GIFT RECOMMENDATION ENGINE
// ============================================================================

/**
 * Generate gift recommendations for a contact
 */
export function generateGiftRecommendations(
  contact: EnhancedContact,
  occasion: OutreachOccasion,
  budget?: BudgetRange
): GiftRecommendation {
  const relationshipStyle =
    RELATIONSHIP_GIFT_STYLES[contact.relationship] || RELATIONSHIP_GIFT_STYLES.other;
  const selectedBudget = budget || relationshipStyle.defaultBudget;
  const budgetInfo = BUDGET_RANGES[selectedBudget];

  // Find matching interest-based gifts
  const matchingGifts: GiftSuggestion[] = [];

  for (const mapping of INTEREST_GIFT_MAPPINGS) {
    const hasMatchingInterest = contact.interests.some((interest) =>
      mapping.interests.some(
        (mappedInterest) =>
          interest.toLowerCase().includes(mappedInterest) ||
          mappedInterest.includes(interest.toLowerCase())
      )
    );

    if (hasMatchingInterest) {
      for (const gift of mapping.gifts) {
        // Filter by budget
        if (!gift.priceRanges.includes(selectedBudget)) continue;

        // Find which interest matched
        const matchedInterest = contact.interests.find((interest) =>
          mapping.interests.some(
            (mi) => interest.toLowerCase().includes(mi) || mi.includes(interest.toLowerCase())
          )
        );

        matchingGifts.push({
          id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: gift.name,
          description: gift.description,
          category: gift.category,
          priceRange: selectedBudget,
          estimatedPrice: budgetInfo.label,
          whyThisGift: `Because ${contact.name} is into ${matchedInterest || 'this'}`,
          whereToBuy: gift.whereToBuy,
          personalizeHow: gift.personalizeHow,
        });
      }
    }
  }

  // Add generic fallback suggestions if needed
  if (matchingGifts.length < 3) {
    matchingGifts.push(...getGenericGiftSuggestions(contact, occasion, selectedBudget));
  }

  // Deduplicate and limit
  const uniqueGifts = deduplicateGifts(matchingGifts).slice(0, 8);

  // Generate personal touch ideas
  const personalTouchIdeas = generatePersonalTouchIdeas(contact, occasion);

  // Generate timing advice
  const timingAdvice = generateTimingAdvice(occasion);

  return {
    contactName: contact.name,
    occasion,
    suggestions: uniqueGifts,
    budgetAdvice: `For ${contact.relationship === 'family' ? 'family' : contact.relationship === 'friend' ? 'close friends' : 'this relationship'}, ${budgetInfo.label} is a nice range.`,
    timingAdvice,
    personalTouchIdeas,
  };
}

function getGenericGiftSuggestions(
  contact: EnhancedContact,
  occasion: OutreachOccasion,
  budget: BudgetRange
): GiftSuggestion[] {
  const generic: GiftSuggestion[] = [];
  const budgetInfo = BUDGET_RANGES[budget];

  // Occasion-specific defaults
  if (occasion === 'birthday') {
    generic.push({
      id: `gift_generic_${Date.now()}_1`,
      name: 'Experience gift card',
      description: 'Let them choose their own adventure',
      category: 'experiences',
      priceRange: budget,
      estimatedPrice: budgetInfo.label,
      whyThisGift: 'Everyone loves choosing their own experience',
      whereToBuy: ['Cloud Nine Living', 'Virgin Experience Days'],
    });
  }

  if (occasion === 'christmas' || occasion === 'thanksgiving') {
    generic.push({
      id: `gift_generic_${Date.now()}_2`,
      name: 'Gourmet food basket',
      description: 'Artisan treats and goodies',
      category: 'food_drink',
      priceRange: budget,
      estimatedPrice: budgetInfo.label,
      whyThisGift: 'Perfect for holiday sharing',
      whereToBuy: ['Harry & David', 'Williams Sonoma', 'Local specialty shops'],
    });
  }

  // Universal fallbacks
  generic.push({
    id: `gift_generic_${Date.now()}_3`,
    name: 'Donation to their favorite cause',
    description: 'Give in their name to a cause they care about',
    category: 'charitable',
    priceRange: budget,
    estimatedPrice: budgetInfo.label,
    whyThisGift: 'Meaningful and thoughtful',
    personalizeHow: 'Find out what causes matter to them',
  });

  generic.push({
    id: `gift_generic_${Date.now()}_4`,
    name: 'Quality candle or home scent',
    description: 'A luxurious scent for their space',
    category: 'home',
    priceRange: budget,
    estimatedPrice: budgetInfo.label,
    whyThisGift: 'Universally appreciated and always nice to receive',
    whereToBuy: ['Diptyque', 'Boy Smells', 'Target (Threshold)', 'Anthropologie'],
  });

  return generic;
}

function deduplicateGifts(gifts: GiftSuggestion[]): GiftSuggestion[] {
  const seen = new Set<string>();
  return gifts.filter((gift) => {
    const key = gift.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generatePersonalTouchIdeas(
  contact: EnhancedContact,
  occasion: OutreachOccasion
): string[] {
  const ideas: string[] = [];

  // Always include a handwritten note
  ideas.push('Write a heartfelt handwritten note - it means more than the gift itself');

  // Shared memories
  if (contact.sharedMemories && contact.sharedMemories.length > 0) {
    ideas.push(`Reference your shared memory: "${contact.sharedMemories[0]}"`);
  }

  // Recent topics
  if (contact.recentTopics && contact.recentTopics.length > 0) {
    ideas.push(`Mention something they recently shared with you about ${contact.recentTopics[0]}`);
  }

  // Relationship-specific
  const style = RELATIONSHIP_GIFT_STYLES[contact.relationship];
  if (style) {
    ideas.push(style.personalTouch);
  }

  // Occasion-specific
  if (occasion === 'birthday') {
    ideas.push('Include a photo from a great memory together');
  } else if (occasion === 'christmas') {
    ideas.push('Consider wrapping it beautifully - presentation matters');
  }

  return ideas.slice(0, 5);
}

function generateTimingAdvice(occasion: OutreachOccasion): string {
  switch (occasion) {
    case 'birthday':
      return 'Order at least a week in advance. Consider delivering the day before for anticipation!';
    case 'christmas':
      return 'Order by December 10th to ensure delivery. In-store pickup is safer for last-minute gifts.';
    case 'new_year':
      return 'Deliver between December 26-31 for maximum impact.';
    case 'thanksgiving':
      return 'Order 2 weeks early. Food gifts are best delivered the week of.';
    case 'anniversary':
      return 'Plan 2-3 weeks ahead for personalized items. Day-of flowers always work too!';
    default:
      return 'Order at least a week ahead for delivery. Experiences can be gifted same-day!';
  }
}

// ============================================================================
// GIFT HISTORY TRACKING
// ============================================================================

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch {
    return null;
  }
}

/**
 * Record a gift given (to avoid suggesting the same thing again)
 */
export async function recordGiftGiven(userId: string, gift: Omit<PastGift, 'date'>): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('gift_history')
      .add({
        ...gift,
        date: new Date(),
      });

    log.info({ userId, contactId: gift.contactId }, 'Gift recorded');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record gift');
  }
}

/**
 * Get past gifts for a contact (to avoid repeats)
 */
export async function getPastGifts(userId: string, contactId: string): Promise<PastGift[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('gift_history')
      .where('contactId', '==', contactId)
      .orderBy('date', 'desc')
      .limit(10)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        date: data.date?.toDate() || new Date(),
      } as PastGift;
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get past gifts');
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const giftSuggestions = {
  generateRecommendations: generateGiftRecommendations,
  recordGift: recordGiftGiven,
  getPastGifts,
  BUDGET_RANGES,
};

export default giftSuggestions;
