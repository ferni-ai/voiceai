/**
 * Gift Registry & Thank-You Tracking - Jordan's Celebration Support
 *
 * Helps track gifts received, thank-you notes sent, and registry management
 * for any life milestone celebration.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger, generateId } from './utils/tool-helpers.js';

// ============================================================================
// TYPES
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
// STORAGE
// ============================================================================

const gifts: Map<string, Gift> = new Map();
const registries: Map<string, Registry> = new Map();

// ============================================================================
// GIFT IDEAS DATABASE
// ============================================================================

export const GIFT_IDEAS: Record<
  string,
  { category: string; items: { name: string; priceRange: string }[] }[]
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
    // ========== LOG A GIFT ==========
    logGiftReceived: llm.tool({
      description: `Log a gift that was received at an event.
Use when someone mentions receiving a gift and wants to track it for thank-you notes.`,
      parameters: z.object({
        from: z.string().describe('Who gave the gift'),
        description: z.string().describe('What the gift was'),
        eventName: z.string().optional().describe('What event it was for'),
        estimatedValue: z.number().optional().describe('Approximate value'),
        notes: z.string().optional().describe('Any notes about the gift'),
      }),
      execute: async ({ from, description, eventName, estimatedValue, notes }) => {
        const gift: Gift = {
          id: generateId('gift'),
          from,
          description,
          estimatedValue,
          receivedDate: new Date(),
          thankYouSent: false,
          notes,
        };

        gifts.set(gift.id, gift);

        return `🎁 Gift logged!\n\n**From:** ${from}\n**Gift:** ${description}${estimatedValue ? `\n**Value:** ~$${estimatedValue}` : ''}\n\n📝 Don't forget to send a thank-you note! I'll remind you.`;
      },
    }),

    // ========== MARK THANK YOU SENT ==========
    markThankYouSent: llm.tool({
      description: `Mark that a thank-you note was sent for a gift.`,
      parameters: z.object({
        giftFrom: z.string().describe('Who the gift was from'),
      }),
      execute: async ({ giftFrom }) => {
        const gift = Array.from(gifts.values()).find(
          (g) => g.from.toLowerCase().includes(giftFrom.toLowerCase()) && !g.thankYouSent
        );

        if (!gift) {
          return `Couldn't find an unsent thank-you for a gift from "${giftFrom}".`;
        }

        gift.thankYouSent = true;
        gift.thankYouSentDate = new Date();
        gifts.set(gift.id, gift);

        return `✅ Thank-you marked as sent to ${gift.from} for the ${gift.description}!\n\nGreat job keeping up with your thank-you notes!`;
      },
    }),

    // ========== GET PENDING THANK YOUS ==========
    getPendingThankYous: llm.tool({
      description: `Get a list of thank-you notes that still need to be sent.`,
      parameters: z.object({}),
      execute: async () => {
        const pending = Array.from(gifts.values()).filter((g) => !g.thankYouSent);

        if (pending.length === 0) {
          return `🎉 All thank-you notes sent! You're on top of it!`;
        }

        let response = `📝 **Pending Thank-You Notes (${pending.length})**\n\n`;

        pending.forEach((gift) => {
          const daysSince = Math.floor(
            (Date.now() - gift.receivedDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          const urgency = daysSince > 14 ? '🔴' : daysSince > 7 ? '🟡' : '🟢';
          response += `${urgency} **${gift.from}** - ${gift.description} (${daysSince} days ago)\n`;
        });

        response += `\n**Tip:** Try to send thank-you notes within 2 weeks!`;

        return response;
      },
    }),

    // ========== GENERATE THANK YOU NOTE ==========
    generateThankYouNote: llm.tool({
      description: `Generate a thank-you note template for a gift.`,
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
      description: `Get gift ideas for creating a registry or suggesting gifts.`,
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
      description: `Create a new gift registry for an event.`,
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
      description: `Add an item to a gift registry.`,
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
      description: `View items in a gift registry.`,
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
