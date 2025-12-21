/**
 * Gift Registry & Thank-You Tracking - Jordan's Celebration Support
 *
 * Helps track gifts received, thank-you notes sent, and registry management
 * for any life milestone celebration.
 *
 * NOW INTEGRATED with Firestore-backed gift-tracking-service for persistence!
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger, generateId } from '../../utils/tool-helpers.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  recordGift as persistGift,
  getGiftHistory,
  getAllGifts,
  generateGiftSuggestions as getAISuggestions,
  getUpcomingGiftOccasions,
  type Gift as GiftRecord,
} from '../../../services/contacts/gift-tracking-service.js';
import { searchContacts } from '../../../services/contacts/contact-relationship-service.js';

// ============================================================================
// TYPES (kept for backward compatibility with registry features)
// ============================================================================

export interface Gift {
  id: string;
  eventId?: string;
  from: string;
  fromEmail?: string;
  description: string;
  estimatedValue?: number;
  receivedDate: Date;
  thankYouSent: boolean;
  thankYouSentDate?: Date;
  notes?: string;
}

export interface RegistryItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  priority: 'must-have' | 'nice-to-have' | 'dream';
  category: string;
  url?: string;
  purchased: boolean;
  purchasedBy?: string;
}

export interface Registry {
  id: string;
  eventName: string;
  eventType: 'wedding' | 'baby-shower' | 'housewarming' | 'birthday' | 'other';
  items: RegistryItem[];
  createdAt: Date;
}

// ============================================================================
// STORAGE (registries only - gifts now use Firestore)
// ============================================================================

const registries = new Map<string, Registry>();

// ============================================================================
// GIFT IDEAS DATABASE
// ============================================================================

export const GIFT_IDEAS: Record<
  string,
  Array<{ category: string; items: Array<{ name: string; priceRange: string }> }>
> = {
  wedding: [
    {
      category: 'Kitchen',
      items: [
        { name: 'Stand Mixer', priceRange: '$200-$400' },
        { name: 'Cookware Set', priceRange: '$100-$300' },
        { name: 'Knife Set', priceRange: '$100-$300' },
        { name: 'Espresso Machine', priceRange: '$200-$800' },
        { name: 'Air Fryer', priceRange: '$50-$150' },
      ],
    },
    {
      category: 'Home',
      items: [
        { name: 'Luxury Bedding Set', priceRange: '$150-$400' },
        { name: 'Dyson Vacuum', priceRange: '$300-$600' },
        { name: 'Smart Home Devices', priceRange: '$50-$200' },
        { name: 'Artwork', priceRange: '$100-$500' },
      ],
    },
    {
      category: 'Experience',
      items: [
        { name: 'Honeymoon Fund Contribution', priceRange: 'Any' },
        { name: 'Date Night Fund', priceRange: 'Any' },
        { name: 'Cooking Class Together', priceRange: '$100-$200' },
      ],
    },
  ],
  'baby-shower': [
    {
      category: 'Big Items',
      items: [
        { name: 'Stroller', priceRange: '$200-$800' },
        { name: 'Car Seat', priceRange: '$150-$400' },
        { name: 'Crib', priceRange: '$150-$500' },
        { name: 'Baby Monitor', priceRange: '$50-$300' },
      ],
    },
    {
      category: 'Daily Essentials',
      items: [
        { name: 'Diaper Subscription', priceRange: '$50-$100/month' },
        { name: 'Bottle Set', priceRange: '$30-$100' },
        { name: 'Swaddles & Sleep Sacks', priceRange: '$30-$80' },
        { name: 'Baby Clothes (0-6mo)', priceRange: '$20-$100' },
      ],
    },
    {
      category: 'For Parents',
      items: [
        { name: 'Meal Delivery Gift Card', priceRange: '$50-$200' },
        { name: 'Coffee/Caffeine Supply', priceRange: '$20-$50' },
        { name: 'Self-Care Kit', priceRange: '$30-$100' },
      ],
    },
  ],
  housewarming: [
    {
      category: 'Practical',
      items: [
        { name: 'Tool Kit', priceRange: '$50-$150' },
        { name: 'Fire Extinguisher', priceRange: '$30-$50' },
        { name: 'First Aid Kit', priceRange: '$20-$40' },
        { name: 'Step Ladder', priceRange: '$50-$100' },
      ],
    },
    {
      category: 'Comfort',
      items: [
        { name: 'Throw Blankets', priceRange: '$30-$100' },
        { name: 'Candles', priceRange: '$20-$60' },
        { name: 'Plants', priceRange: '$20-$80' },
        { name: 'Welcome Mat', priceRange: '$30-$80' },
      ],
    },
    {
      category: 'Hosting',
      items: [
        { name: 'Bar Cart Essentials', priceRange: '$50-$200' },
        { name: 'Serving Platters', priceRange: '$30-$100' },
        { name: 'Wine/Spirits', priceRange: '$30-$100' },
      ],
    },
  ],
};

// ============================================================================
// THANK YOU NOTE TEMPLATES
// ============================================================================

export const THANK_YOU_TEMPLATES = {
  wedding: [
    "Dear {name},\n\nThank you so much for the beautiful {gift}. We can't wait to use it in our new life together! Your presence at our wedding made the day even more special.\n\nWith love and gratitude,\n{senders}",
    'Dear {name},\n\nWhat a thoughtful gift! The {gift} is exactly what we needed. Thank you for celebrating our special day with us and for your generous gift.\n\nWarmly,\n{senders}',
  ],
  'baby-shower': [
    "Dear {name},\n\nThank you for the wonderful {gift}! We're so excited to use it when baby arrives. Your support and generosity mean the world to us.\n\nWith gratitude,\n{senders}",
    'Dear {name},\n\nWhat a perfect gift! The {gift} will be so useful. Thank you for thinking of us and for celebrating this exciting time with us.\n\nLove,\n{senders}',
  ],
  housewarming: [
    "Dear {name},\n\nThank you for the {gift}! It's already making our new house feel more like home. We so appreciate you celebrating this milestone with us.\n\nWarmly,\n{senders}",
  ],
  general: [
    'Dear {name},\n\nThank you so much for the {gift}. Your thoughtfulness means so much to us!\n\nWith gratitude,\n{senders}',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createGiftRegistryTools() {
  return {
    // ========== LOG A GIFT RECEIVED ==========
    logGiftReceived: llm.tool({
      description: getToolDescription('logGiftReceived'),
      parameters: z.object({
        from: z.string().describe('Who gave the gift'),
        description: z.string().describe('What the gift was'),
        eventName: z
          .string()
          .optional()
          .describe('What event it was for (e.g., birthday, Christmas)'),
        estimatedValue: z.number().optional().describe('Approximate value in dollars'),
        notes: z.string().optional().describe('Any notes about the gift'),
      }),
      execute: async ({ from, description, eventName, estimatedValue, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        // Try to find contact to link the gift
        const matches = await searchContacts(userId, from);
        const contactId =
          matches.length > 0
            ? matches[0].contactId
            : `unknown_${from.toLowerCase().replace(/\s+/g, '_')}`;

        // Persist to Firestore
        await persistGift(userId, {
          contactId,
          contactName: from,
          direction: 'received',
          item: description,
          description: notes,
          occasion: eventName || 'general',
          date: new Date(),
          price: estimatedValue,
        });

        return `🎁 Gift logged!\n\n**From:** ${from}\n**Gift:** ${description}${estimatedValue ? `\n**Value:** ~$${estimatedValue}` : ''}\n\n📝 Don't forget to send a thank-you note! I'll remind you.`;
      },
    }),

    // ========== LOG A GIFT GIVEN ==========
    logGiftGiven: llm.tool({
      description:
        'Log a gift that you gave to someone. Helps track gift-giving patterns and avoid repeats.',
      parameters: z.object({
        to: z.string().describe('Who you gave the gift to'),
        description: z.string().describe('What the gift was'),
        occasion: z
          .string()
          .optional()
          .describe('What occasion it was for (birthday, Christmas, etc.)'),
        price: z.number().optional().describe('How much you spent'),
        reaction: z
          .enum(['loved', 'liked', 'neutral', 'disliked'])
          .optional()
          .describe('How they reacted'),
        notes: z.string().optional().describe('Any notes about the gift'),
      }),
      execute: async ({ to, description, occasion, price, reaction, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        // Try to find contact to link the gift
        const matches = await searchContacts(userId, to);
        const contactId =
          matches.length > 0
            ? matches[0].contactId
            : `unknown_${to.toLowerCase().replace(/\s+/g, '_')}`;

        // Persist to Firestore
        await persistGift(userId, {
          contactId,
          contactName: to,
          direction: 'given',
          item: description,
          description: notes,
          occasion: occasion || 'general',
          date: new Date(),
          price,
          reaction,
        });

        const reactionEmoji =
          reaction === 'loved'
            ? '😍'
            : reaction === 'liked'
              ? '😊'
              : reaction === 'neutral'
                ? '😐'
                : reaction === 'disliked'
                  ? '😬'
                  : '';

        return `🎁 Gift recorded!\n\n**To:** ${to}\n**Gift:** ${description}${price ? `\n**Spent:** $${price}` : ''}${reaction ? `\n**Their reaction:** ${reactionEmoji} ${reaction}` : ''}\n\nI'll remember this so we don't accidentally repeat it!`;
      },
    }),

    // ========== MARK THANK YOU SENT ==========
    markThankYouSent: llm.tool({
      description: getToolDescription('markThankYouSent'),
      parameters: z.object({
        giftFrom: z.string().describe('Who the gift was from'),
      }),
      execute: async ({ giftFrom }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        // Record the thank-you as an interaction
        const matches = await searchContacts(userId, giftFrom);
        if (matches.length === 0) {
          return `I don't have "${giftFrom}" in your contacts. I can still note this - would you like me to add them first?`;
        }

        const contact = matches[0];
        const { recordInteraction } =
          await import('../../../services/contacts/contact-relationship-service.js');

        await recordInteraction(userId, {
          contactId: contact.contactId,
          userId,
          date: new Date(),
          type: 'thank_you_sent',
          direction: 'outbound',
          summary: `Thank-you note sent for gift`,
        });

        return `✅ Thank-you marked as sent to ${contact.name}!\n\nGreat job keeping up with your thank-you notes!`;
      },
    }),

    // ========== GET GIFT HISTORY FOR A PERSON ==========
    getGiftHistoryForPerson: llm.tool({
      description:
        'See all gifts exchanged with a specific person - what you gave them and what they gave you.',
      parameters: z.object({
        personName: z.string().describe('The person to see gift history for'),
      }),
      execute: async ({ personName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        // Find contact
        const matches = await searchContacts(userId, personName);
        if (matches.length === 0) {
          return `I don't have "${personName}" in your contacts.`;
        }

        const contact = matches[0];
        const history = await getGiftHistory(userId, contact.contactId);

        if (history.given.length === 0 && history.received.length === 0) {
          return `No gift history recorded with ${contact.name} yet.`;
        }

        let response = `🎁 **Gift History with ${contact.name}**\n\n`;

        if (history.given.length > 0) {
          response += `**Gifts you've given (${history.given.length}):**\n`;
          history.given.slice(0, 5).forEach((gift) => {
            const date = new Date(gift.date).toLocaleDateString();
            const reaction = gift.reaction ? ` - they ${gift.reaction} it` : '';
            response += `• ${gift.item} (${gift.occasion}, ${date})${reaction}\n`;
          });
          response += '\n';
        }

        if (history.received.length > 0) {
          response += `**Gifts they've given you (${history.received.length}):**\n`;
          history.received.slice(0, 5).forEach((gift) => {
            const date = new Date(gift.date).toLocaleDateString();
            response += `• ${gift.item} (${gift.occasion}, ${date})\n`;
          });
        }

        return response;
      },
    }),

    // ========== AI GIFT SUGGESTIONS ==========
    suggestGiftIdeas: llm.tool({
      description:
        'Get AI-powered gift suggestions for someone based on their interests, past gifts, and your relationship.',
      parameters: z.object({
        personName: z.string().describe('Who you need a gift for'),
        occasion: z
          .string()
          .optional()
          .describe('The occasion (birthday, Christmas, anniversary, etc.)'),
        budget: z.number().optional().describe('Your budget in dollars'),
        mood: z
          .enum(['thoughtful', 'fun', 'practical', 'luxurious'])
          .optional()
          .describe('The vibe you want'),
      }),
      execute: async ({ personName, occasion, budget, mood }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        // Find contact
        const matches = await searchContacts(userId, personName);
        if (matches.length === 0) {
          return `I don't have "${personName}" in your contacts. Can you tell me more about them?`;
        }

        const contact = matches[0];

        try {
          const suggestions = await getAISuggestions(
            userId,
            contact.contactId,
            occasion || 'general',
            budget ? { min: budget * 0.5, max: budget * 1.5 } : { min: 20, max: 200 }
          );

          if (suggestions.length === 0) {
            return `I need to know more about ${contact.name} to suggest good gifts. Tell me about their interests!`;
          }

          let response = `🎁 **Gift Ideas for ${contact.name}**`;
          if (occasion) response += ` (${occasion})`;
          response += '\n\n';

          suggestions.forEach((suggestion, i) => {
            const confidence =
              suggestion.confidence === 'high'
                ? '⭐'
                : suggestion.confidence === 'medium'
                  ? '✓'
                  : '';
            response += `${i + 1}. ${confidence} **${suggestion.idea}** (${suggestion.priceRange})\n`;
            response += `   ${suggestion.reasoning}\n\n`;
          });

          // Add what to avoid if any
          const avoid = suggestions.filter((s) => s.avoidReason);
          if (avoid.length > 0) {
            response += `\n**Things to avoid:**\n`;
            avoid.forEach((s) => {
              response += `• ${s.avoidReason}\n`;
            });
          }

          return response;
        } catch (error) {
          return `I'd love to suggest gifts, but I need more context about ${contact.name}. What are their interests?`;
        }
      },
    }),

    // ========== UPCOMING GIFT OCCASIONS ==========
    getUpcomingGiftOccasions: llm.tool({
      description:
        'See upcoming occasions where you might want to give gifts - birthdays, anniversaries, holidays.',
      parameters: z.object({
        daysAhead: z.number().optional().describe('How many days ahead to look (default: 30)'),
      }),
      execute: async ({ daysAhead }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const occasions = await getUpcomingGiftOccasions(userId, daysAhead || 30);

        if (occasions.length === 0) {
          return `No upcoming gift occasions in the next ${daysAhead || 30} days.`;
        }

        let response = `📅 **Upcoming Gift Occasions**\n\n`;

        occasions.forEach((occasion) => {
          const daysUntil = Math.ceil(
            (new Date(occasion.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const urgency = daysUntil <= 3 ? '🔴' : daysUntil <= 7 ? '🟡' : '🟢';

          response += `${urgency} **${occasion.contactName}** - ${occasion.occasion}`;
          response += ` (${daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`})\n`;
        });

        return response;
      },
    }),

    // ========== GENERATE THANK YOU NOTE ==========
    generateThankYouNote: llm.tool({
      description: getToolDescription('generateThankYouNote'),
      parameters: z.object({
        giftFrom: z.string().describe('Who the gift was from'),
        giftDescription: z.string().describe('What the gift was'),
        eventType: z
          .enum(['wedding', 'baby-shower', 'housewarming', 'general'])
          .describe('Type of event'),
        senderNames: z.string().describe('Your name(s) to sign'),
      }),
      execute: async ({ giftFrom, giftDescription, eventType, senderNames }) => {
        const templates = THANK_YOU_TEMPLATES[eventType] || THANK_YOU_TEMPLATES.general;
        const template = templates[Math.floor(Math.random() * templates.length)];

        const note = template
          .replace('{name}', giftFrom)
          .replace('{gift}', giftDescription)
          .replace('{senders}', senderNames);

        return `✉️ **Thank-You Note Template:**\n\n${note}\n\n**Tip:** Personalize it with a specific memory or detail about the gift!`;
      },
    }),

    // ========== GET GIFT IDEAS ==========
    getGiftIdeas: llm.tool({
      description: getToolDescription('getGiftIdeas'),
      parameters: z.object({
        eventType: z.enum(['wedding', 'baby-shower', 'housewarming']).describe('Type of event'),
        category: z.string().optional().describe('Specific category'),
      }),
      execute: async ({ eventType, category }) => {
        const ideas = GIFT_IDEAS[eventType];
        if (!ideas) {
          return `No gift ideas found for ${eventType}.`;
        }

        let response = `🎁 **Gift Ideas for ${eventType.replace('-', ' ')}**\n\n`;

        let categories = ideas;
        if (category) {
          categories = ideas.filter((c) =>
            c.category.toLowerCase().includes(category.toLowerCase())
          );
        }

        categories.forEach((cat) => {
          response += `**${cat.category}:**\n`;
          cat.items.forEach((item) => {
            response += `• ${item.name} (${item.priceRange})\n`;
          });
          response += '\n';
        });

        return response;
      },
    }),

    // ========== CREATE REGISTRY ==========
    createRegistry: llm.tool({
      description: getToolDescription('createRegistry'),
      parameters: z.object({
        eventName: z.string().describe('Name of the event'),
        eventType: z
          .enum(['wedding', 'baby-shower', 'housewarming', 'birthday', 'other'])
          .describe('Type of event'),
      }),
      execute: async ({ eventName, eventType }) => {
        const registry: Registry = {
          id: generateId('gift'),
          eventName,
          eventType,
          items: [],
          createdAt: new Date(),
        };

        registries.set(registry.id, registry);

        return `🎀 **Registry Created: ${eventName}**\n\nReady to add items! What would you like on your registry?`;
      },
    }),

    // ========== ADD REGISTRY ITEM ==========
    addToRegistry: llm.tool({
      description: getToolDescription('addToRegistry'),
      parameters: z.object({
        registryName: z.string().describe('Name of the registry/event'),
        itemName: z.string().describe('Name of the item'),
        price: z.number().describe('Price of the item'),
        category: z.string().describe('Category (kitchen, bedroom, etc.)'),
        priority: z
          .enum(['must-have', 'nice-to-have', 'dream'])
          .describe('How important is this item'),
        url: z.string().optional().describe('Link to the item'),
      }),
      execute: async ({ registryName, itemName, price, category, priority, url }) => {
        const registry = Array.from(registries.values()).find((r) =>
          r.eventName.toLowerCase().includes(registryName.toLowerCase())
        );

        if (!registry) {
          return `Couldn't find a registry matching "${registryName}".`;
        }

        const item: RegistryItem = {
          id: generateId('gift'),
          name: itemName,
          price,
          category,
          priority,
          url,
          purchased: false,
        };

        registry.items.push(item);
        registries.set(registry.id, registry);

        const priorityEmoji =
          priority === 'must-have' ? '✅' : priority === 'nice-to-have' ? '☑️' : '⭐';
        return `${priorityEmoji} Added to registry: **${itemName}** ($${price}) - ${category}\n\nRegistry now has ${registry.items.length} items!`;
      },
    }),

    // ========== VIEW REGISTRY ==========
    viewRegistry: llm.tool({
      description: getToolDescription('viewRegistry'),
      parameters: z.object({
        registryName: z.string().describe('Name of the registry/event'),
      }),
      execute: async ({ registryName }) => {
        const registry = Array.from(registries.values()).find((r) =>
          r.eventName.toLowerCase().includes(registryName.toLowerCase())
        );

        if (!registry) {
          return `Couldn't find a registry matching "${registryName}".`;
        }

        if (registry.items.length === 0) {
          return `Registry "${registry.eventName}" is empty. Ready to add items?`;
        }

        let response = `🎁 **Registry: ${registry.eventName}**\n\n`;

        const byCategory = registry.items.reduce(
          (acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
          },
          {} as Record<string, RegistryItem[]>
        );

        let total = 0;
        for (const [category, items] of Object.entries(byCategory)) {
          response += `**${category}:**\n`;
          items.forEach((item) => {
            const status = item.purchased ? '✅' : '☐';
            const priorityIcon = item.priority === 'must-have' ? '⭐' : '';
            response += `${status} ${priorityIcon}${item.name} - $${item.price}\n`;
            if (!item.purchased) total += item.price;
          });
          response += '\n';
        }

        response += `**Total remaining:** $${total.toLocaleString()}`;

        return response;
      },
    }),
  };
}

export default createGiftRegistryTools;
