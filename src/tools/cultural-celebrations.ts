/**
 * Cultural Celebrations Database - Jordan's Diversity Awareness
 *
 * Supports planning for diverse cultural celebrations and traditions.
 * Jordan respects and honors different cultures' ways of celebrating
 * life's milestones.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// CULTURAL CELEBRATION DETAILS
// ============================================================================

export interface CulturalCelebrationDetails {
  name: string;
  culture: string;
  description: string;
  typicalAge?: number | string;
  traditions: string[];
  typicalElements: string[];
  attire: string[];
  food: string[];
  guestCount: { small: number; medium: number; large: number };
  planningTimeline: string;
  budgetRange: { low: number; mid: number; high: number };
  tips: string[];
  modernTwists: string[];
}

export const CULTURAL_CELEBRATIONS: Record<string, CulturalCelebrationDetails> = {
  quinceanera: {
    name: 'Quinceañera',
    culture: 'Latin American',
    description:
      "A celebration of a girl's 15th birthday marking her transition from childhood to young womanhood",
    typicalAge: 15,
    traditions: [
      'Changing from flat shoes to heels (symbolizing maturity)',
      'The last doll (última muñeca) ceremony',
      'Father-daughter waltz',
      'Crowning ceremony (tiara)',
      'Candle lighting ceremony',
      "Toast with the quinceañera's court",
    ],
    typicalElements: [
      'Catholic mass or blessing',
      'Court of honor (chambelanes and damas)',
      'Choreographed waltz',
      'Professional photography',
      'DJ and/or live band',
      'Decorated cake',
    ],
    attire: [
      'Traditional ball gown (often pink, but any color)',
      'Tiara and scepter',
      'Court members in matching colors',
      'Father in formal suit',
    ],
    food: [
      'Traditional Mexican cuisine',
      'Multi-tier decorated cake',
      'Champurrado or hot chocolate',
      'Pan dulce (sweet bread)',
    ],
    guestCount: { small: 75, medium: 150, large: 300 },
    planningTimeline: '9-12 months',
    budgetRange: { low: 5000, mid: 15000, high: 40000 },
    tips: [
      'Book venue and choreographer first - they fill up fast',
      'Start dress shopping 6 months early for alterations',
      'Rehearse the waltz multiple times',
      'The mass is optional but meaningful for religious families',
    ],
    modernTwists: [
      'Gender-neutral celebrations (Quinceañeros)',
      'Destination quinceañeras',
      'Theme-based parties',
      'Combined with a charity element',
    ],
  },

  'bar-mitzvah': {
    name: 'Bar Mitzvah',
    culture: 'Jewish',
    description:
      'A coming-of-age ceremony for Jewish boys at age 13, marking their responsibility for their actions under Jewish law',
    typicalAge: 13,
    traditions: [
      'Reading from the Torah (aliyah)',
      "D'var Torah (speech interpreting the Torah portion)",
      'Being called to the Torah for the first time',
      'Receiving blessings from family',
      'Candle lighting ceremony at party',
    ],
    typicalElements: [
      'Synagogue service (Saturday morning most traditional)',
      'Kiddush luncheon',
      'Evening party or celebration',
      'Hora dance',
      'Montage video',
      'Sign-in boards or creative alternatives',
    ],
    attire: ['Suit or dress clothes', 'Tallit (prayer shawl) - often a gift', 'Kippah (yarmulke)'],
    food: [
      'Kosher catering (if observant)',
      'Challah bread',
      'Traditional Jewish foods',
      'Themed cake or dessert',
    ],
    guestCount: { small: 50, medium: 125, large: 250 },
    planningTimeline: '12-18 months',
    budgetRange: { low: 8000, mid: 25000, high: 75000 },
    tips: [
      'Book the date with the synagogue first - popular dates go quickly',
      'Start tutoring 1-2 years before',
      'Consider a meaningful mitzvah project (community service)',
      'The service is the heart of it - party is secondary',
    ],
    modernTwists: [
      'Destination bar mitzvahs (Israel is popular)',
      'Eco-friendly celebrations',
      'Adventure themes',
      'Incorporating social justice projects',
    ],
  },

  'bat-mitzvah': {
    name: 'Bat Mitzvah',
    culture: 'Jewish',
    description:
      'A coming-of-age ceremony for Jewish girls at age 12 or 13, marking their responsibility under Jewish law',
    typicalAge: '12 or 13',
    traditions: [
      'Reading from the Torah (in egalitarian congregations)',
      "D'var Torah (speech)",
      'Receiving blessings from family',
      'Candle lighting ceremony',
    ],
    typicalElements: [
      'Synagogue service',
      'Kiddush luncheon',
      'Evening celebration',
      'Hora dance',
      'Photo montage',
      'Creative sign-in options',
    ],
    attire: [
      'Dress or dressy outfit',
      'Tallit (in egalitarian congregations)',
      'Kippah (in some congregations)',
    ],
    food: ['Kosher catering (if observant)', 'Traditional Jewish foods', 'Themed desserts'],
    guestCount: { small: 50, medium: 125, large: 250 },
    planningTimeline: '12-18 months',
    budgetRange: { low: 8000, mid: 25000, high: 75000 },
    tips: [
      'Practices vary by denomination - discuss with rabbi',
      "The bat mitzvah girl should help plan what's meaningful to her",
      'A mitzvah project adds depth to the celebration',
    ],
    modernTwists: [
      'Empowerment themes',
      'Social action focus',
      'Creative venues',
      'Personal passion incorporated',
    ],
  },

  'sweet-sixteen': {
    name: 'Sweet Sixteen',
    culture: 'American',
    description:
      "A celebration of a teenager's 16th birthday, particularly significant in American culture",
    typicalAge: 16,
    traditions: [
      'Candle lighting ceremony (16 candles)',
      'Father-daughter dance',
      'Speech or toast',
      'Crown or tiara for the birthday person',
    ],
    typicalElements: [
      'Themed party',
      'DJ or live entertainment',
      'Professional photography',
      'Elaborate cake',
      'Party favors',
      'Photo booth',
    ],
    attire: ['Semi-formal to formal dress', 'Theme-appropriate outfits for guests'],
    food: ['Buffet or plated dinner', 'Multi-tier cake', 'Dessert bar', 'Signature mocktails'],
    guestCount: { small: 30, medium: 75, large: 150 },
    planningTimeline: '3-6 months',
    budgetRange: { low: 2000, mid: 8000, high: 25000 },
    tips: [
      'Let the birthday teen have major input',
      'Consider a meaningful theme',
      'Start planning 4-6 months out for venues',
      'Don\'t forget the "getting ready" experience',
    ],
    modernTwists: [
      'Experience-based (concert, trip)',
      'Volunteer component',
      'Gender-neutral celebrations',
      'Intimate dinner party style',
    ],
  },

  debutante: {
    name: 'Debutante Ball',
    culture: 'American/European',
    description:
      'A formal presentation of young women to society, traditionally marking their eligibility for adulthood',
    typicalAge: '16-21',
    traditions: [
      'Formal presentation/curtsy',
      'Escort by father or chosen partner',
      'White gown (traditional)',
      'Waltz with escort',
      'Formal receiving line',
    ],
    typicalElements: [
      'White-tie dress code',
      'Formal dinner',
      'Orchestral music',
      'Professional photography',
      'Cotillion training',
    ],
    attire: ['White ball gown (traditional)', 'Long white gloves', 'Escort in white tie or tuxedo'],
    food: ['Formal multi-course dinner', 'Champagne toast', 'Elegant desserts'],
    guestCount: { small: 100, medium: 200, large: 400 },
    planningTimeline: '6-12 months',
    budgetRange: { low: 5000, mid: 15000, high: 50000 },
    tips: [
      "Usually part of an organization's annual ball",
      'Cotillion classes teach etiquette and dance',
      'Often includes community service component',
      'Families typically bear individual costs',
    ],
    modernTwists: [
      'Diverse and inclusive presentations',
      'Focus on achievement over eligibility',
      'Charity fundraising component',
      'Non-traditional dress colors',
    ],
  },

  'first-communion': {
    name: 'First Holy Communion',
    culture: 'Catholic',
    description:
      "A religious ceremony marking a child's first reception of the Eucharist in the Catholic Church",
    typicalAge: '7-8',
    traditions: [
      'Church mass with communion',
      'Blessing by priest',
      'Walking in procession',
      'Receiving the host for the first time',
    ],
    typicalElements: [
      'Special mass at church',
      'Family gathering or party',
      'Photography',
      'Religious gifts',
      'Guest book or prayer cards',
    ],
    attire: [
      'Girls: white dress, veil, and gloves',
      'Boys: suit or traditional outfit',
      'Both: may carry rosary or prayer book',
    ],
    food: ['Family meal or brunch', 'Cake with religious decoration', 'Traditional family foods'],
    guestCount: { small: 15, medium: 35, large: 75 },
    planningTimeline: '2-3 months',
    budgetRange: { low: 500, mid: 2000, high: 8000 },
    tips: [
      'Church requirements come first',
      'Keep focus on the religious significance',
      'Simple celebrations are traditional',
      'Photo before church - kids get messy!',
    ],
    modernTwists: [
      'Combined with other children at parish',
      'Smaller, more intimate gatherings',
      'Charity donation in lieu of gifts',
    ],
  },

  confirmation: {
    name: 'Confirmation',
    culture: 'Christian (Catholic/Protestant)',
    description: 'A rite of passage confirming baptismal vows and commitment to faith',
    typicalAge: '12-17',
    traditions: [
      'Confirmation mass or service',
      'Choosing a confirmation name (Catholic)',
      'Sponsor presents candidate',
      'Bishop or clergy confirmation',
    ],
    typicalElements: [
      'Church ceremony',
      'Family celebration',
      'Religious gifts',
      'Photo with bishop/pastor',
    ],
    attire: [
      'Formal church attire',
      'Red often worn (symbol of Holy Spirit)',
      'Modest and respectful',
    ],
    food: ['Family meal', 'Celebratory cake'],
    guestCount: { small: 10, medium: 25, large: 50 },
    planningTimeline: '1-2 months',
    budgetRange: { low: 200, mid: 800, high: 3000 },
    tips: [
      'The ceremony is scheduled by the church',
      'Focus on the spiritual milestone',
      'Party can be simple but meaningful',
    ],
    modernTwists: [
      'Service project component',
      'Retreat with confirmation class',
      'Personal faith statement',
    ],
  },
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createCulturalCelebrationTools() {
  return {
    // ========== CULTURAL CELEBRATION INFO ==========
    getCulturalCelebrationInfo: llm.tool({
      description: `Get detailed information about a specific cultural celebration.
Use when someone mentions planning a Quinceañera, Bar/Bat Mitzvah, Sweet Sixteen, or other cultural coming-of-age celebration.`,
      parameters: z.object({
        celebrationType: z
          .enum([
            'quinceanera',
            'bar-mitzvah',
            'bat-mitzvah',
            'sweet-sixteen',
            'debutante',
            'first-communion',
            'confirmation',
          ])
          .describe('Type of cultural celebration'),
      }),
      execute: async ({ celebrationType }) => {
        const celebration = CULTURAL_CELEBRATIONS[celebrationType];
        if (!celebration) {
          return `I don't have detailed information about that celebration type. What would you like to know?`;
        }

        let response = `🎊 **${celebration.name}** (${celebration.culture})\n\n`;
        response += `${celebration.description}\n\n`;

        if (celebration.typicalAge) {
          response += `**Typical Age:** ${celebration.typicalAge}\n`;
        }
        response += `**Planning Timeline:** ${celebration.planningTimeline}\n`;
        response += `**Guest Count Range:** ${celebration.guestCount.small}-${celebration.guestCount.large}\n`;
        response += `**Budget Range:** $${celebration.budgetRange.low.toLocaleString()}-$${celebration.budgetRange.high.toLocaleString()}\n\n`;

        response += `**Key Traditions:**\n`;
        celebration.traditions.slice(0, 5).forEach((t) => {
          response += `• ${t}\n`;
        });

        response += `\n**Typical Elements:**\n`;
        celebration.typicalElements.slice(0, 5).forEach((e) => {
          response += `• ${e}\n`;
        });

        response += `\n**Pro Tips:**\n`;
        celebration.tips.forEach((tip) => {
          response += `💡 ${tip}\n`;
        });

        return response;
      },
    }),

    // ========== CULTURAL TRADITIONS ==========
    getCulturalTraditions: llm.tool({
      description: `Get specific traditions for a cultural celebration.
Use when someone asks about traditions, customs, or what's expected.`,
      parameters: z.object({
        celebrationType: z
          .enum([
            'quinceanera',
            'bar-mitzvah',
            'bat-mitzvah',
            'sweet-sixteen',
            'debutante',
            'first-communion',
            'confirmation',
          ])
          .describe('Type of cultural celebration'),
        aspect: z
          .enum(['traditions', 'attire', 'food', 'modern-twists'])
          .describe('Which aspect to focus on'),
      }),
      execute: async ({ celebrationType, aspect }) => {
        const celebration = CULTURAL_CELEBRATIONS[celebrationType];
        if (!celebration) {
          return `I don't have information about that celebration type.`;
        }

        let response = `**${celebration.name} - `;
        let items: string[] = [];

        switch (aspect) {
          case 'traditions':
            response += `Traditions**\n\n`;
            items = celebration.traditions;
            break;
          case 'attire':
            response += `Traditional Attire**\n\n`;
            items = celebration.attire;
            break;
          case 'food':
            response += `Food & Drinks**\n\n`;
            items = celebration.food;
            break;
          case 'modern-twists':
            response += `Modern Twists**\n\n`;
            items = celebration.modernTwists;
            break;
        }

        items.forEach((item) => {
          response += `• ${item}\n`;
        });

        return response;
      },
    }),

    // ========== SUGGEST CELEBRATION TYPE ==========
    suggestCelebration: llm.tool({
      description: `Suggest cultural celebration types based on criteria.
Use when someone isn't sure what type of celebration or wants ideas.`,
      parameters: z.object({
        age: z.number().describe('Age of the person being celebrated'),
        culture: z.string().optional().describe('Cultural background if mentioned'),
        budget: z.enum(['low', 'medium', 'high']).optional().describe('Budget level'),
      }),
      execute: async ({ age, culture, budget }) => {
        const suggestions: string[] = [];

        // Match by age
        for (const [key, celebration] of Object.entries(CULTURAL_CELEBRATIONS)) {
          const { typicalAge } = celebration;
          if (typeof typicalAge === 'number' && Math.abs(typicalAge - age) <= 2) {
            suggestions.push(
              `**${celebration.name}** (${celebration.culture}) - typically age ${typicalAge}`
            );
          } else if (typeof typicalAge === 'string' && typicalAge.includes(String(age))) {
            suggestions.push(`**${celebration.name}** (${celebration.culture})`);
          }
        }

        if (suggestions.length === 0) {
          return `For age ${age}, you might consider a milestone birthday party or a custom celebration. What matters most to you about this milestone?`;
        }

        let response = `🎉 **Celebration Ideas for Age ${age}:**\n\n`;
        suggestions.forEach((s) => {
          response += `${s}\n`;
        });
        response += `\nWant more details about any of these?`;

        return response;
      },
    }),
  };
}

export default createCulturalCelebrationTools;
