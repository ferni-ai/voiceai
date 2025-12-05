/**
 * First-Time Planning Tools - Jordan's Specialized "Firsts" Support
 *
 * Detailed planning tools for life's major firsts:
 * - First Baby (nursery, baby shower, hospital prep)
 * - First Home (housewarming, moving, settling in)
 * - First Wedding (engagement to honeymoon)
 * - And more...
 *
 * These tools provide deep expertise for each specific "first"
 * with specialized checklists, tips, and guidance.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// FIRST BABY PLANNING
// ============================================================================

export const BABY_PLANNING = {
  nurseryShopping: {
    essentials: [
      { item: 'Crib (meets safety standards)', priority: 'must-have', priceRange: '$150-$500' },
      { item: 'Firm mattress', priority: 'must-have', priceRange: '$50-$200' },
      { item: 'Fitted crib sheets (3-4)', priority: 'must-have', priceRange: '$30-$60' },
      { item: 'Changing table or pad', priority: 'must-have', priceRange: '$50-$200' },
      { item: 'Dresser for storage', priority: 'nice-to-have', priceRange: '$100-$400' },
      { item: 'Rocking chair/glider', priority: 'nice-to-have', priceRange: '$150-$600' },
      { item: 'Baby monitor', priority: 'must-have', priceRange: '$30-$200' },
      { item: 'Blackout curtains', priority: 'nice-to-have', priceRange: '$30-$80' },
      { item: 'Nightlight', priority: 'nice-to-have', priceRange: '$10-$30' },
      { item: 'White noise machine', priority: 'nice-to-have', priceRange: '$20-$50' },
    ],
    supplies: [
      { item: 'Diapers (newborn & size 1)', priority: 'must-have', quantity: '200-300' },
      { item: 'Wipes', priority: 'must-have', quantity: '500+' },
      { item: 'Diaper cream', priority: 'must-have', quantity: '2-3 tubes' },
      { item: 'Onesies (newborn & 0-3mo)', priority: 'must-have', quantity: '8-10' },
      { item: 'Sleep sacks/swaddles', priority: 'must-have', quantity: '3-4' },
      { item: 'Burp cloths', priority: 'must-have', quantity: '8-10' },
      { item: 'Baby wash & shampoo', priority: 'must-have', quantity: '1-2' },
      { item: 'Baby towels', priority: 'must-have', quantity: '2-3' },
    ],
    gear: [
      { item: 'Car seat (infant)', priority: 'must-have', priceRange: '$100-$350' },
      { item: 'Stroller', priority: 'must-have', priceRange: '$100-$800' },
      { item: 'Baby carrier/wrap', priority: 'nice-to-have', priceRange: '$30-$180' },
      { item: 'Diaper bag', priority: 'must-have', priceRange: '$30-$150' },
      { item: 'Bottles & formula (if not EBF)', priority: 'depends', priceRange: '$20-$60' },
      {
        item: 'Breast pump (if nursing)',
        priority: 'depends',
        priceRange: 'Often covered by insurance',
      },
    ],
  },

  hospitalBag: {
    forMom: [
      'ID and insurance cards',
      'Birth plan (multiple copies)',
      'Comfortable robe',
      'Non-slip socks or slippers',
      'Toiletries',
      'Hair ties',
      'Nursing bras (2-3)',
      'Going-home outfit (loose and comfy)',
      'Phone charger (long cord)',
      'Snacks',
      'Pillow from home',
    ],
    forBaby: [
      'Going-home outfit',
      'Car seat (installed and checked)',
      'Blanket',
      'Newborn diapers',
      'Hat',
    ],
    forPartner: [
      'Change of clothes',
      'Toiletries',
      'Snacks',
      'Camera',
      'Entertainment for waiting',
      'Phone charger',
    ],
  },

  babyShowerThemes: [
    {
      theme: 'Classic Baby',
      colors: ['soft pink', 'baby blue', 'mint green', 'yellow'],
      style: 'traditional',
    },
    { theme: 'Woodland Creatures', colors: ['forest green', 'brown', 'cream'], style: 'nature' },
    { theme: 'Twinkle Twinkle Little Star', colors: ['navy', 'gold', 'white'], style: 'elegant' },
    { theme: 'Safari Adventure', colors: ['tan', 'green', 'orange'], style: 'playful' },
    { theme: 'Boho Baby', colors: ['terracotta', 'sage', 'cream'], style: 'modern' },
    { theme: 'Storybook', colors: ['various', 'book pages'], style: 'whimsical' },
    { theme: 'Oh Baby!', colors: ['black', 'white', 'gold'], style: 'modern' },
    { theme: 'Rainbow Baby', colors: ['rainbow spectrum'], style: 'meaningful' },
  ],
};

// ============================================================================
// FIRST HOME PLANNING
// ============================================================================

export const HOME_PLANNING = {
  movingChecklist: {
    twoMonthsBefore: [
      'Declutter and donate/sell items',
      'Get moving quotes (3 minimum)',
      'Create moving budget',
      'Start packing non-essentials',
      'Notify landlord if renting',
      'Research new area (schools, doctors, etc.)',
    ],
    oneMonthBefore: [
      'Book moving company',
      'Gather packing supplies',
      'Change address with USPS',
      'Transfer utilities',
      'Update address with banks, employers, subscriptions',
      'Pack room by room',
    ],
    oneWeekBefore: [
      'Confirm moving company',
      'Pack essentials box (separate)',
      'Clean current home',
      'Defrost freezer',
      'Take meter readings',
    ],
    movingDay: [
      'Keep valuables with you',
      'Do final walkthrough of old place',
      'Get keys to new place',
      'Check deliveries/boxes',
      'Set up beds first',
    ],
    firstWeek: [
      'Unpack essentials',
      'Check all utilities work',
      'Meet neighbors',
      'Locate circuit breaker, water shutoff',
      "Update driver's license",
      'Register to vote',
    ],
  },

  housewarmingParty: {
    timing: '2-4 weeks after moving in',
    checklist: [
      'Set a date',
      'Create guest list',
      'Send invitations',
      'Plan simple menu (keep it easy!)',
      'Stock bar basics',
      'Create a playlist',
      'Do a quick clean',
      'Have a house tour ready',
    ],
    tips: [
      "Don't wait until it's perfect - it never will be!",
      'Keep food simple - order pizza or do potluck',
      'Give tours to show off your favorite features',
      'Set up a guest book for housewarming wishes',
    ],
    registryIdeas: [
      'Gift cards (let them choose!)',
      'Plants',
      'Bar supplies',
      'Kitchen essentials',
      'Toolbox or tools',
    ],
  },

  firstYearHomeChecklist: [
    { task: 'Change locks', when: 'Immediately' },
    { task: 'Locate water shutoff', when: 'Day 1' },
    { task: 'Change HVAC filters', when: 'Monthly' },
    { task: 'Test smoke/CO detectors', when: 'Monthly' },
    { task: 'Clean gutters', when: 'Spring and Fall' },
    { task: 'Service HVAC', when: 'Before summer/winter' },
    { task: 'Check caulking and weather stripping', when: 'Fall' },
    { task: 'Flush water heater', when: 'Annually' },
    { task: 'Check roof for damage', when: 'After storms' },
  ],
};

// ============================================================================
// WEDDING PLANNING TIMELINE
// ============================================================================

export const WEDDING_PLANNING = {
  timeline: {
    '12-18 months before': [
      'Set budget',
      'Determine guest count',
      'Book venue',
      'Choose wedding party',
      'Start dress shopping',
      'Book photographer/videographer',
    ],
    '9-12 months before': [
      'Book caterer',
      'Book band/DJ',
      'Choose officiant',
      'Book florist',
      'Send save-the-dates',
      'Register for gifts',
    ],
    '6-9 months before': [
      'Book hair/makeup',
      'Order invitations',
      'Plan honeymoon',
      'Book rehearsal dinner venue',
      'Choose wedding cake',
      'Rent suits/tuxes',
    ],
    '3-6 months before': [
      'Send invitations',
      'Finalize menu',
      'Write vows (if personal)',
      'Apply for marriage license',
      'Plan seating chart',
      'Final dress fitting',
    ],
    '1 month before': [
      'Confirm all vendors',
      'Final guest count to caterer',
      'Break in wedding shoes',
      'Practice first dance',
      'Prepare day-of timeline',
      'Assign day-of tasks',
    ],
    'Week of': [
      'Rehearsal and rehearsal dinner',
      'Pack for honeymoon',
      'Prepare tips/payments for vendors',
      'Confirm transportation',
      'Relax and enjoy!',
    ],
  },

  budgetBreakdown: {
    venue: '40-50%',
    catering: 'Included in venue or 20-30%',
    photography: '10-15%',
    music: '5-8%',
    flowers: '5-8%',
    attire: '5-10%',
    invitations: '2-3%',
    cake: '2-3%',
    officiant: '1-2%',
    miscellaneous: '5-10%',
  },

  savingTips: [
    'Friday or Sunday weddings cost 20-40% less',
    'Off-season (Nov-Apr in most places) saves money',
    'Limit guest list - biggest impact on budget',
    'DIY where it makes sense (favors, decorations)',
    'Skip the full bar - beer and wine is fine',
    'Choose in-season flowers',
    'Ask vendors about payment plans',
  ],
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createFirstTimePlanningTools() {
  return {
    // ========== BABY PLANNING ==========
    getBabyShoppingList: llm.tool({
      description: `Get a detailed baby shopping list for new parents.
Use when someone is expecting or planning for a baby.`,
      parameters: z.object({
        category: z
          .enum(['nursery', 'supplies', 'gear', 'all'])
          .describe('What type of items to list'),
        budgetLevel: z
          .enum(['budget', 'mid-range', 'premium'])
          .optional()
          .describe('Budget preference'),
      }),
      execute: async ({ category, budgetLevel }) => {
        let response = `👶 **Baby Shopping List**\n\n`;

        const formatItems = (items: any[], title: string) => {
          response += `**${title}:**\n`;
          items.forEach((item) => {
            const price = item.priceRange || item.quantity;
            const priority = item.priority === 'must-have' ? '✅' : '☑️';
            response += `${priority} ${item.item} (${price})\n`;
          });
          response += '\n';
        };

        if (category === 'all' || category === 'nursery') {
          formatItems(BABY_PLANNING.nurseryShopping.essentials, '🛏️ Nursery Essentials');
        }
        if (category === 'all' || category === 'supplies') {
          formatItems(BABY_PLANNING.nurseryShopping.supplies, '🧴 Daily Supplies');
        }
        if (category === 'all' || category === 'gear') {
          formatItems(BABY_PLANNING.nurseryShopping.gear, '🚗 Gear');
        }

        response += `**Pro Tip:** Don't buy everything before baby arrives! You'll figure out what YOU actually need once baby is here. Start with must-haves (✅) and add as needed.`;

        return response;
      },
    }),

    getHospitalBagChecklist: llm.tool({
      description: `Get a hospital bag packing checklist for expecting parents.`,
      parameters: z.object({
        who: z.enum(['mom', 'baby', 'partner', 'all']).optional().describe('Whose items to list'),
      }),
      execute: async ({ who = 'all' }) => {
        let response = `🏥 **Hospital Bag Checklist**\n\n`;

        if (who === 'all' || who === 'mom') {
          response += `**For Mom:**\n`;
          BABY_PLANNING.hospitalBag.forMom.forEach((item) => {
            response += `☐ ${item}\n`;
          });
          response += '\n';
        }

        if (who === 'all' || who === 'baby') {
          response += `**For Baby:**\n`;
          BABY_PLANNING.hospitalBag.forBaby.forEach((item) => {
            response += `☐ ${item}\n`;
          });
          response += '\n';
        }

        if (who === 'all' || who === 'partner') {
          response += `**For Partner:**\n`;
          BABY_PLANNING.hospitalBag.forPartner.forEach((item) => {
            response += `☐ ${item}\n`;
          });
        }

        response += '\n**Tip:** Pack 3-4 weeks before due date. Babies have their own timeline!';

        return response;
      },
    }),

    getBabyShowerIdeas: llm.tool({
      description: `Get baby shower theme ideas and planning tips.`,
      parameters: z.object({
        style: z
          .enum(['traditional', 'modern', 'gender-neutral', 'all'])
          .optional()
          .describe('Preferred style'),
      }),
      execute: async ({ style = 'all' }) => {
        let response = `🎀 **Baby Shower Theme Ideas**\n\n`;

        let themes = BABY_PLANNING.babyShowerThemes;
        if (style === 'traditional') {
          themes = themes.filter((t) => t.style === 'traditional' || t.style === 'elegant');
        } else if (style === 'modern') {
          themes = themes.filter((t) => t.style === 'modern' || t.style === 'playful');
        }

        themes.forEach((theme) => {
          response += `**${theme.theme}**\n`;
          response += `🎨 Colors: ${theme.colors.join(', ')}\n`;
          response += `✨ Style: ${theme.style}\n\n`;
        });

        response += `**Planning Tips:**\n`;
        response += `• Plan 4-6 weeks before due date\n`;
        response += `• Ask about registry before buying decorations\n`;
        response += `• Keep games short and sweet\n`;
        response += `• Don't forget thank-you cards!\n`;

        return response;
      },
    }),

    // ========== HOME PLANNING ==========
    getMovingChecklist: llm.tool({
      description: `Get a detailed moving checklist for first-time homeowners.`,
      parameters: z.object({
        timeframe: z
          .enum(['2-months', '1-month', '1-week', 'moving-day', 'first-week', 'all'])
          .optional()
          .describe('Which phase of moving'),
      }),
      execute: async ({ timeframe = 'all' }) => {
        let response = `📦 **Moving Checklist**\n\n`;

        const timeframes: Record<string, string[]> = {
          '2-months': HOME_PLANNING.movingChecklist.twoMonthsBefore,
          '1-month': HOME_PLANNING.movingChecklist.oneMonthBefore,
          '1-week': HOME_PLANNING.movingChecklist.oneWeekBefore,
          'moving-day': HOME_PLANNING.movingChecklist.movingDay,
          'first-week': HOME_PLANNING.movingChecklist.firstWeek,
        };

        const titles: Record<string, string> = {
          '2-months': '📅 2 Months Before',
          '1-month': '📅 1 Month Before',
          '1-week': '📅 1 Week Before',
          'moving-day': '🚚 Moving Day',
          'first-week': '🏠 First Week',
        };

        if (timeframe === 'all') {
          for (const [key, tasks] of Object.entries(timeframes)) {
            response += `**${titles[key]}:**\n`;
            tasks.forEach((task) => {
              response += `☐ ${task}\n`;
            });
            response += '\n';
          }
        } else {
          const tasks = timeframes[timeframe];
          response += `**${titles[timeframe]}:**\n`;
          tasks.forEach((task) => {
            response += `☐ ${task}\n`;
          });
        }

        return response;
      },
    }),

    getHousewarmingTips: llm.tool({
      description: `Get tips for planning a housewarming party.`,
      parameters: z.object({}),
      execute: async () => {
        const hw = HOME_PLANNING.housewarmingParty;

        let response = `🏠 **Housewarming Party Planning**\n\n`;
        response += `**Best Timing:** ${hw.timing}\n\n`;

        response += `**Checklist:**\n`;
        hw.checklist.forEach((item) => {
          response += `☐ ${item}\n`;
        });

        response += `\n**Tips:**\n`;
        hw.tips.forEach((tip) => {
          response += `💡 ${tip}\n`;
        });

        response += `\n**If You Want a Registry:**\n`;
        hw.registryIdeas.forEach((idea) => {
          response += `• ${idea}\n`;
        });

        return response;
      },
    }),

    getFirstYearHomeTasks: llm.tool({
      description: `Get a list of home maintenance tasks for first-year homeowners.`,
      parameters: z.object({}),
      execute: async () => {
        let response = `🔧 **First-Year Home Maintenance**\n\n`;

        HOME_PLANNING.firstYearHomeChecklist.forEach((item) => {
          response += `☐ **${item.task}** - ${item.when}\n`;
        });

        response += `\n**Pro Tip:** Create a home maintenance calendar. A little prevention saves a LOT in repairs!`;

        return response;
      },
    }),

    // ========== WEDDING PLANNING ==========
    getWeddingTimeline: llm.tool({
      description: `Get a detailed wedding planning timeline.`,
      parameters: z.object({
        monthsOut: z.number().optional().describe('How many months until wedding'),
      }),
      execute: async ({ monthsOut }) => {
        let response = `💒 **Wedding Planning Timeline**\n\n`;

        for (const [period, tasks] of Object.entries(WEDDING_PLANNING.timeline)) {
          response += `**${period}:**\n`;
          tasks.forEach((task) => {
            response += `☐ ${task}\n`;
          });
          response += '\n';
        }

        response += `\n**Budget Breakdown:**\n`;
        for (const [category, percentage] of Object.entries(WEDDING_PLANNING.budgetBreakdown)) {
          response += `• ${category}: ${percentage}\n`;
        }

        return response;
      },
    }),

    getWeddingSavingTips: llm.tool({
      description: `Get tips for saving money on a wedding.`,
      parameters: z.object({}),
      execute: async () => {
        let response = `💰 **Wedding Budget Tips**\n\n`;

        WEDDING_PLANNING.savingTips.forEach((tip, index) => {
          response += `${index + 1}. ${tip}\n`;
        });

        response += `\n**Remember:** The best weddings aren't the most expensive ones. They're the ones that feel most like YOU.`;

        return response;
      },
    }),
  };
}

export default createFirstTimePlanningTools;
