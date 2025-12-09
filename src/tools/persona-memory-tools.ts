/**
 * Natural Memory Tools for Each Persona
 *
 * Each persona remembers things in their own natural way:
 *
 * Ferni: "Remember I like morning check-ins"
 * Jack: "I prefer Vanguard Total Stock Market"
 * Peter: "Add Apple to my watchlist - I use their products daily"
 * Maya: "I always overspend at Target when I'm stressed"
 * Jordan: "My anniversary is June 15th"
 *
 * Designed to feel like talking to a friend who remembers you.
 *
 * See also: tools/shared/persona-memory-factory.ts for utilities and registry
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import {
  getUserId,
  ordinal,
  formatCurrency,
  progressPercent,
} from './shared/persona-memory-factory.js';
import {
  // Core functions
  recall,
  remember,
  findMemory,
  updateMemory,
  forget,
  formatMemoryForSpeech,
  touchMemory,
  // Ferni helpers
  rememberPreference,
  rememberWin,
  getFerniMemories,
  // Bogle helpers
  rememberFund,
  rememberInvestingPhilosophy,
  getBogleMemories,
  // Peter helpers
  addToWatchlist,
  rememberCompany,
  getWatchlist,
  getPeterMemories,
  markAsTenBagger,
  // Maya helpers
  rememberMerchant,
  rememberBill,
  rememberSavingsGoal,
  rememberSpendingTrigger,
  getMayaMemories,
  // Jordan helpers
  rememberDate,
  rememberVenue,
  rememberDestination,
  getImportantDates,
  getJordanMemories,
  type PeterMemory,
  type MayaMemory,
  type JordanMemory,
} from '../services/persona-memories.js';

// ============================================================================
// JACKIE (COACH) MEMORY TOOLS
// ============================================================================

export function createFerniMemoryTools() {
  return {
    rememberAboutMe: llm.tool({
      description: `Remember something the user wants Ferni to know about them.
Use for preferences, styles, wins, topics they enjoy.
Examples: "Remember I like morning check-ins", "I had a win today!"`,
      parameters: z.object({
        type: z
          .enum(['preference', 'win', 'topic', 'style', 'music'])
          .describe('What kind of thing to remember'),
        what: z.string().describe('What to remember'),
        details: z.string().optional().describe('Additional context'),
      }),
      execute: async ({ type, what, details }, { ctx }) => {
        const userId = getUserId({ ctx });

        if (type === 'win') {
          await rememberWin(userId, what, details);
          return `🎉 That's awesome! I'll remember that win: "${what}". I love celebrating these moments with you!`;
        } else {
          await rememberPreference(userId, what, details);
          return `Got it! I'll remember that you ${what}. ${details ? `(${details})` : ''} Thanks for sharing that with me! 😊`;
        }
      },
    }),

    whatDoYouKnowAboutMe: llm.tool({
      description: `Recall what Ferni knows about the user.
Use when user asks what you remember about them.`,
      parameters: z.object({
        type: z.enum(['all', 'preferences', 'wins']).default('all'),
      }),
      execute: async ({ type }, { ctx }) => {
        const userId = getUserId({ ctx });

        const memories = await getFerniMemories(userId);

        if (memories.length === 0) {
          return `We're still getting to know each other! Tell me about yourself - what do you enjoy? Any recent wins to celebrate?`;
        }

        const filtered =
          type === 'all'
            ? memories
            : memories.filter((m) =>
                type === 'wins' ? m.type === 'win' : m.type === 'preference'
              );

        const list = filtered
          .slice(0, 10)
          .map((m) => `• ${formatMemoryForSpeech(m)}`)
          .join('\n');

        return `Here's what I remember about you:\n\n${list}\n\n${memories.length > 10 ? `...and ${memories.length - 10} more things!` : 'Want me to remember anything else?'}`;
      },
    }),
  };
}

// ============================================================================
// JACK BOGLE MEMORY TOOLS
// ============================================================================

export function createBogleMemoryTools() {
  return {
    rememberFund: llm.tool({
      description: `Remember a fund the user is interested in or owns.
Jack loves tracking low-cost index funds!`,
      parameters: z.object({
        name: z.string().describe('Fund name (e.g., "Vanguard Total Stock Market")'),
        ticker: z.string().optional().describe('Ticker symbol (e.g., VTI, VTSAX)'),
        category: z.enum(['index', 'bond', 'international', 'balanced', 'sector']).optional(),
        expenseRatio: z.number().optional().describe('Expense ratio as percentage'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).default('positive'),
      }),
      execute: async ({ name, ticker, category, expenseRatio, sentiment }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberFund(userId, name, { ticker, category, expenseRatio, sentiment });

        let response = `📊 Noted! I'll remember ${ticker ? `${ticker} (${name})` : name}`;

        if (expenseRatio !== undefined) {
          if (expenseRatio <= 0.1) {
            response += `. Excellent expense ratio - that's the way to invest!`;
          } else if (expenseRatio <= 0.5) {
            response += `. Reasonable costs.`;
          } else {
            response += `. Hmm, those fees might eat into your returns over time.`;
          }
        }

        if (sentiment === 'positive') {
          response += ` Stay the course! 📈`;
        }

        return response;
      },
    }),

    rememberMyPhilosophy: llm.tool({
      description: `Remember the user's investing philosophy or principles.`,
      parameters: z.object({
        philosophy: z.string().describe('The investing philosophy or principle'),
      }),
      execute: async ({ philosophy }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberInvestingPhilosophy(userId, philosophy);

        return `That's a sound principle: "${philosophy}". I'll keep that in mind as we discuss your investments. The key is to stay disciplined! 📚`;
      },
    }),

    whatFundsDoILike: llm.tool({
      description: `Recall funds and philosophies discussed with the user.`,
      parameters: z.object({
        type: z.enum(['all', 'funds', 'philosophy']).default('all'),
      }),
      execute: async ({ type }, { ctx }) => {
        const userId = getUserId({ ctx });

        const funds = type === 'philosophy' ? [] : await getBogleMemories(userId, 'fund');
        const philosophies = type === 'funds' ? [] : await getBogleMemories(userId, 'philosophy');

        if (funds.length === 0 && philosophies.length === 0) {
          return `We haven't discussed specific funds yet. Want to talk about building a simple, low-cost portfolio?`;
        }

        let response = '';

        if (funds.length > 0) {
          response += `**Your Funds:**\n${funds.map((f) => `• ${formatMemoryForSpeech(f)}`).join('\n')}\n\n`;
        }

        if (philosophies.length > 0) {
          response += `**Your Principles:**\n${philosophies.map((p) => `• ${p.name}`).join('\n')}`;
        }

        return response;
      },
    }),
  };
}

// ============================================================================
// PETER JOHN MEMORY TOOLS
// ============================================================================

export function createPeterMemoryTools() {
  return {
    addToWatchlist: llm.tool({
      description: `Add a stock to the user's watchlist.
Peter loves when people invest in what they know!`,
      parameters: z.object({
        name: z.string().describe('Company name'),
        ticker: z.string().optional().describe('Stock ticker'),
        reason: z.string().optional().describe('Why interested (e.g., "I use their products")'),
        sector: z.string().optional().describe('Industry sector'),
        currentPrice: z.number().optional().describe('Current stock price'),
      }),
      execute: async ({ name, ticker, reason, sector, currentPrice }, { ctx }) => {
        const userId = getUserId({ ctx });

        await addToWatchlist(userId, name, { ticker, reason, sector, price: currentPrice });

        let response = `👀 Added ${ticker ? `${ticker} (${name})` : name} to your watchlist!`;

        if (reason) {
          response += ` "${reason}" - that's exactly the kind of edge individual investors have!`;
        }

        response += `\n\nRemember: Watch this one closely. Know what you own and why you own it!`;

        return response;
      },
    }),

    rememberCompanyIKnow: llm.tool({
      description: `Remember a company the user knows well through personal experience.
Peter's "invest in what you know" philosophy!`,
      parameters: z.object({
        name: z.string().describe('Company name'),
        ticker: z.string().optional().describe('Stock ticker'),
        reason: z.string().describe('How user knows them (customer, employee, local business)'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).default('positive'),
      }),
      execute: async ({ name, ticker, reason, sentiment }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberCompany(userId, name, { ticker, reason, sentiment });

        if (sentiment === 'positive') {
          return `📝 Great insight! You know ${name} because: "${reason}". That personal knowledge is invaluable - it's exactly what Wall Street analysts miss! Keep your ear to the ground. 🎯`;
        } else if (sentiment === 'negative') {
          return `📝 Noted - you've seen issues at ${name}: "${reason}". Sometimes the best investment is the one you don't make! ⚠️`;
        } else {
          return `📝 Got it - you know ${name} through: "${reason}". Keep watching and let me know what you observe!`;
        }
      },
    }),

    showMyWatchlist: llm.tool({
      description: `Show the user's stock watchlist.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });

        const watchlist = await getWatchlist(userId);

        if (watchlist.length === 0) {
          return `Your watchlist is empty! Start by adding companies you know and use. Remember - invest in what you know! What companies do you interact with daily?`;
        }

        const list = watchlist
          .map((stock, i) => {
            const s = stock as PeterMemory;
            let line = `${i + 1}. ${s.ticker ? `**${s.ticker}** - ${s.name}` : s.name}`;
            if (s.reason) line += `\n   💡 ${s.reason}`;
            if (s.priceWhenAdded) line += `\n   📊 Added at $${s.priceWhenAdded}`;
            return line;
          })
          .join('\n\n');

        return `📋 **Your Watchlist** (${watchlist.length} stocks)\n\n${list}\n\n_Do your homework before buying any of these!_`;
      },
    }),

    markAsBigWinner: llm.tool({
      description: `Mark a stock as a big winner (ten-bagger potential!).`,
      parameters: z.object({
        name: z.string().describe('Company name or ticker'),
      }),
      execute: async ({ name }, { ctx }) => {
        const userId = getUserId({ ctx });

        const memory = await findMemory(userId, 'peter-john', name);
        if (!memory) {
          return `I don't have ${name} in your records. Add it to your watchlist first!`;
        }

        await markAsTenBagger(memory.id);

        return `🚀 ${name} marked as a potential TEN-BAGGER! Now that's exciting! Remember though - the key is patience. The best gains come to those who hold through the ups and downs! 💎`;
      },
    }),
  };
}

// ============================================================================
// MAYA (SPEND & SAVE) MEMORY TOOLS
// ============================================================================

export function createMayaMemoryTools() {
  return {
    rememberMerchant: llm.tool({
      description: `Remember a merchant and the user's relationship with it.
Good for tracking favorite stores, problem spots, etc.`,
      parameters: z.object({
        name: z.string().describe('Store/merchant name'),
        category: z.string().optional().describe('Category (grocery, clothing, etc.)'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).default('neutral'),
        averageSpend: z.number().optional().describe('Typical spend per visit'),
        notes: z.string().optional().describe('Notes about spending there'),
      }),
      execute: async ({ name, category, sentiment, averageSpend, notes }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberMerchant(userId, name, { category, sentiment, averageSpend, notes });

        if (sentiment === 'negative') {
          return `📝 Got it - ${name} is a tricky spot for you${notes ? ` (${notes})` : ''}. Awareness is the first step! Want to set up a spending limit or avoid alert? 🛡️`;
        } else if (sentiment === 'positive') {
          return `✨ ${name} is a good one${averageSpend ? ` - you usually spend around $${averageSpend}` : ''}. Nice to have stores that work for your budget!`;
        } else {
          return `📝 Noted ${name}${category ? ` (${category})` : ''}${averageSpend ? ` - typical spend $${averageSpend}` : ''}. I'll keep an eye on it!`;
        }
      },
    }),

    rememberMyTrigger: llm.tool({
      description: `Remember a spending trigger - emotional or situational.
This helps Maya understand patterns and support the user.`,
      parameters: z.object({
        trigger: z
          .string()
          .describe('The trigger (e.g., "stress shopping", "late night browsing")'),
        notes: z.string().optional().describe('More context'),
      }),
      execute: async ({ trigger, notes }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberSpendingTrigger(userId, trigger, notes);

        return `💙 Thank you for sharing that - "${trigger}" is now on my radar. Recognizing our triggers is huge! Next time you feel that pull, I'm here to help you pause and think it through. You've got this! 💪`;
      },
    }),

    rememberBill: llm.tool({
      description: `Remember a recurring bill.`,
      parameters: z.object({
        name: z.string().describe('Bill name (e.g., "Netflix", "Electric")'),
        amount: z.number().optional().describe('Monthly amount'),
        dueDate: z.number().optional().describe("Day of month it's due"),
        isAutoPay: z.boolean().optional().describe('Is it on autopay?'),
      }),
      execute: async ({ name, amount, dueDate, isAutoPay }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberBill(userId, name, { amount, dueDate, isAutoPay });

        let response = `📋 Got it - ${name}`;
        if (amount) response += ` ($${amount}/month)`;
        if (dueDate) response += ` due on the ${ordinal(dueDate)}`;
        if (isAutoPay) response += ` (autopay ✓)`;

        response += `. I'll help you keep track!`;

        return response;
      },
    }),

    rememberSavingsGoal: llm.tool({
      description: `Remember a savings goal.`,
      parameters: z.object({
        name: z.string().describe('Goal name (e.g., "Emergency Fund", "Vacation")'),
        targetAmount: z.number().optional().describe('Target amount'),
        currentAmount: z.number().optional().describe('Current progress'),
        targetDate: z.string().optional().describe('Target date'),
      }),
      execute: async ({ name, targetAmount, currentAmount, targetDate }, { ctx }) => {
        const userId = getUserId({ ctx });

        const target = targetDate ? new Date(targetDate) : undefined;
        await rememberSavingsGoal(userId, name, {
          targetAmount,
          currentAmount,
          targetDate: target,
        });

        let response = `🎯 Savings goal set: **${name}**`;
        if (targetAmount) {
          const progress = currentAmount ? Math.round((currentAmount / targetAmount) * 100) : 0;
          response += `\n💰 Target: $${targetAmount.toLocaleString()}`;
          if (currentAmount) response += ` (${progress}% there!)`;
        }
        if (targetDate) response += `\n📅 By: ${target?.toLocaleDateString()}`;

        response += `\n\nI'll cheer you on! Every dollar counts! 🌟`;

        return response;
      },
    }),

    whatDoYouKnowAboutMyMoney: llm.tool({
      description: `Recall what Maya knows about the user's spending patterns.`,
      parameters: z.object({
        type: z.enum(['all', 'merchants', 'bills', 'triggers', 'goals']).default('all'),
      }),
      execute: async ({ type }, { ctx }) => {
        const userId = getUserId({ ctx });

        const typeMap: Record<string, MayaMemory['type']> = {
          merchants: 'merchant',
          bills: 'bill',
          triggers: 'trigger',
          goals: 'savings_goal',
        };

        const memories =
          type === 'all'
            ? await getMayaMemories(userId)
            : await getMayaMemories(userId, typeMap[type]);

        if (memories.length === 0) {
          return `We're just getting started! Tell me about your spending - favorite stores, bills, savings goals, or any triggers you've noticed.`;
        }

        const grouped: Record<string, MayaMemory[]> = {};
        for (const m of memories) {
          if (!grouped[m.type]) grouped[m.type] = [];
          grouped[m.type].push(m as MayaMemory);
        }

        let response = `**What I Know About Your Money:**\n\n`;

        if (grouped.savings_goal?.length) {
          response += `🎯 **Goals:**\n${grouped.savings_goal.map((g) => `• ${formatMemoryForSpeech(g)}`).join('\n')}\n\n`;
        }
        if (grouped.bill?.length) {
          response += `📋 **Bills:**\n${grouped.bill.map((b) => `• ${formatMemoryForSpeech(b)}`).join('\n')}\n\n`;
        }
        if (grouped.merchant?.length) {
          response += `🏪 **Merchants:**\n${grouped.merchant.map((m) => `• ${formatMemoryForSpeech(m)}`).join('\n')}\n\n`;
        }
        if (grouped.trigger?.length) {
          response += `⚠️ **Triggers to Watch:**\n${grouped.trigger.map((t) => `• ${t.name}`).join('\n')}\n\n`;
        }

        return response;
      },
    }),
  };
}

// ============================================================================
// JORDAN (EVENT PLANNER) MEMORY TOOLS
// ============================================================================

export function createJordanMemoryTools() {
  return {
    rememberImportantDate: llm.tool({
      description: `Remember an important date (birthday, anniversary, etc.)`,
      parameters: z.object({
        name: z.string().describe('What is it? (e.g., "Mom\'s Birthday", "Our Anniversary")'),
        date: z.string().describe('The date (e.g., "June 15", "March 3rd")'),
        person: z.string().optional().describe('Who is it for?'),
        recurring: z.enum(['yearly', 'monthly', 'once']).default('yearly'),
      }),
      execute: async ({ name, date, person, recurring }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberDate(userId, name, { date, person, recurring });

        let response = `📅 Got it! I'll remember ${name} on ${date}`;
        if (recurring === 'yearly') response += ` every year`;
        response += `! I'll make sure we plan something special. 🎉`;

        return response;
      },
    }),

    rememberVenue: llm.tool({
      description: `Remember a venue the user likes or has used.`,
      parameters: z.object({
        name: z.string().describe('Venue name'),
        location: z.string().optional().describe('Location/address'),
        priceRange: z.string().optional().describe('Price range ($, $$, $$$, $$$$)'),
        rating: z.number().optional().describe('User rating 1-5'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).default('positive'),
        notes: z.string().optional().describe('Notes about the venue'),
      }),
      execute: async ({ name, location, priceRange, rating, sentiment, notes }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberVenue(userId, name, { location, priceRange, rating, sentiment, notes });

        if (sentiment === 'positive') {
          return `✨ ${name} - sounds like a winner! ${rating ? `(${rating}/5 stars)` : ''} I'll remember this for future events! ${notes ? `Note: ${notes}` : ''}`;
        } else if (sentiment === 'negative') {
          return `📝 Noted - ${name} is one to avoid${notes ? ` (${notes})` : ''}. Good to know for future planning!`;
        } else {
          return `📝 Got it - ${name}${location ? ` in ${location}` : ''}${priceRange ? ` (${priceRange})` : ''}. I'll keep it in mind!`;
        }
      },
    }),

    rememberDreamDestination: llm.tool({
      description: `Remember a dream destination or travel wish.`,
      parameters: z.object({
        destination: z.string().describe('Where they want to go'),
        notes: z.string().optional().describe('What they want to do/see there'),
      }),
      execute: async ({ destination, notes }, { ctx }) => {
        const userId = getUserId({ ctx });

        await rememberDestination(userId, destination, { notes });

        return `✈️ ${destination} is on the dream list! ${notes ? `(${notes})` : ''} When you're ready to start planning, I'm here to make it happen! 🌍✨`;
      },
    }),

    showImportantDates: llm.tool({
      description: `Show all important dates Jordan is tracking.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });

        const dates = await getImportantDates(userId);

        if (dates.length === 0) {
          return `I don't have any important dates saved yet! Tell me about birthdays, anniversaries, or other special days to remember. 🗓️`;
        }

        const list = dates
          .map((d) => {
            const jd = d as JordanMemory;
            let line = `• **${d.name}** - ${jd.date}`;
            if (jd.person) line += ` (${jd.person})`;
            if (jd.recurring === 'yearly') line += ' 🔄';
            return line;
          })
          .join('\n');

        return `📅 **Important Dates I'm Tracking:**\n\n${list}\n\n_I'll help you plan ahead for each one!_`;
      },
    }),

    whatDoYouKnowAboutMyEvents: llm.tool({
      description: `Recall what Jordan knows about user's event preferences.`,
      parameters: z.object({
        type: z.enum(['all', 'dates', 'venues', 'destinations']).default('all'),
      }),
      execute: async ({ type }, { ctx }) => {
        const userId = getUserId({ ctx });

        const typeMap: Record<string, JordanMemory['type']> = {
          dates: 'date',
          venues: 'venue',
          destinations: 'destination',
        };

        const memories =
          type === 'all'
            ? await getJordanMemories(userId)
            : await getJordanMemories(userId, typeMap[type]);

        if (memories.length === 0) {
          return `We haven't saved anything yet! Tell me about important dates, favorite venues, or dream destinations!`;
        }

        const grouped: Record<string, JordanMemory[]> = {};
        for (const m of memories) {
          if (!grouped[m.type]) grouped[m.type] = [];
          grouped[m.type].push(m as JordanMemory);
        }

        let response = `**What I Know For Planning:**\n\n`;

        if (grouped.date?.length) {
          response += `📅 **Important Dates:**\n${grouped.date.map((d) => `• ${formatMemoryForSpeech(d)}`).join('\n')}\n\n`;
        }
        if (grouped.venue?.length) {
          response += `🏛️ **Venues:**\n${grouped.venue.map((v) => `• ${formatMemoryForSpeech(v)}`).join('\n')}\n\n`;
        }
        if (grouped.destination?.length) {
          response += `✈️ **Dream Destinations:**\n${grouped.destination.map((d) => `• ${d.name}`).join('\n')}\n\n`;
        }

        return response;
      },
    }),
  };
}

// ============================================================================
// ALEX (COMMUNICATIONS SPECIALIST) MEMORY TOOLS
// ============================================================================

export function createAlexMemoryTools() {
  return {
    rememberCommunicationPreference: llm.tool({
      description: `Remember a user's communication preference.
Alex tracks how people like to be contacted and communicated with.`,
      parameters: z.object({
        preference: z
          .string()
          .describe(
            'The communication preference (e.g., "prefers text over calls", "likes brief updates")'
          ),
        context: z.string().optional().describe('When this applies'),
      }),
      execute: async ({ preference, context }, { ctx }) => {
        const userId = getUserId({ ctx });

        await recall(userId, 'comm-specialist'); // Load first
        await remember(userId, 'comm-specialist', {
          type: 'communication_preference',
          name: preference,
          details: context,
          sentiment: 'positive',
          tags: ['communication', 'preference'],
        });

        return `📱 Got it! I'll remember that you ${preference}${context ? ` (${context})` : ''}. I'll make sure to respect that going forward.`;
      },
    }),

    rememberSchedulingNote: llm.tool({
      description: `Remember a scheduling preference or note.
Alex tracks when people are available and their scheduling quirks.`,
      parameters: z.object({
        note: z
          .string()
          .describe('The scheduling note (e.g., "busy on Tuesdays", "prefers morning meetings")'),
        recurring: z.boolean().optional().describe('Is this recurring?'),
      }),
      execute: async ({ note, recurring }, { ctx }) => {
        const userId = getUserId({ ctx });

        await recall(userId, 'comm-specialist');
        await remember(userId, 'comm-specialist', {
          type: 'scheduling_note',
          name: note,
          details: recurring ? 'Recurring' : 'One-time',
          sentiment: 'neutral',
          tags: ['scheduling', recurring ? 'recurring' : 'one-time'],
        });

        return `📅 Noted! I'll remember: "${note}"${recurring ? ' (recurring)' : ''}. This will help with future scheduling.`;
      },
    }),

    whatDoYouKnowAboutMyCommunication: llm.tool({
      description: `Recall what Alex knows about user's communication preferences.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });

        const memories = await recall(userId, 'comm-specialist');

        if (memories.length === 0) {
          return `We haven't saved any communication preferences yet! Tell me how you like to be contacted, your scheduling preferences, or any notes about people you communicate with.`;
        }

        const list = memories
          .slice(0, 10)
          .map((m) => `• ${formatMemoryForSpeech(m)}`)
          .join('\n');

        return `**Your Communication Preferences:**\n\n${list}\n\n${memories.length > 10 ? `...and ${memories.length - 10} more!` : ''}`;
      },
    }),
  };
}

// ============================================================================
// SHARED MEMORY MANAGEMENT TOOLS
// ============================================================================

const logger = getLogger().child({ module: 'MemoryTools' });

/**
 * Create universal memory management tools available to all personas.
 * These allow users to update, delete, and manage their stored memories.
 */
export function createMemoryManagementTools() {
  return {
    forgetThisAboutMe: llm.tool({
      description: `Delete/forget a specific memory. Use when user wants to remove something you remember about them.
Examples: "Forget that I like Target", "Delete my savings goal", "Remove that from my watchlist"`,
      parameters: z.object({
        searchTerm: z.string().describe('What to search for and forget'),
        persona: z
          .enum(['jack-b', 'nayan-patel', 'peter-john', 'spend-save', 'event-planner', 'comm-specialist'])
          .describe('Which persona stored this memory (jack-b=Bogle, nayan-patel=Ferni, spend-save=Maya, event-planner=Jordan)'),
      }),
      execute: async ({ searchTerm, persona }, { ctx }) => {
        const userId = getUserId({ ctx });

        const memory = await findMemory(userId, persona, searchTerm);
        if (!memory) {
          return `I couldn't find anything matching "${searchTerm}" in my memory. Could you be more specific about what you'd like me to forget?`;
        }

        const success = await forget(memory.id);
        if (success) {
          logger.info({ userId, memoryId: memory.id, name: memory.name }, 'Memory deleted by user request');
          return `Done! I've forgotten about "${memory.name}". Your data, your choice. 🗑️`;
        } else {
          return `I had trouble forgetting that. Please try again or let me know if this keeps happening.`;
        }
      },
    }),

    updateWhatYouKnow: llm.tool({
      description: `Update an existing memory with new information.
Examples: "Update my savings goal to $10,000", "Change Netflix to $15.99/month"`,
      parameters: z.object({
        searchTerm: z.string().describe('What memory to update'),
        persona: z
          .enum(['jack-b', 'nayan-patel', 'peter-john', 'spend-save', 'event-planner', 'comm-specialist'])
          .describe('Which persona stored this memory (jack-b=Bogle, nayan-patel=Ferni, spend-save=Maya, event-planner=Jordan)'),
        updates: z.object({
          name: z.string().optional().describe('New name'),
          details: z.string().optional().describe('New details'),
          sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
        }),
      }),
      execute: async ({ searchTerm, persona, updates }, { ctx }) => {
        const userId = getUserId({ ctx });

        const memory = await findMemory(userId, persona, searchTerm);
        if (!memory) {
          return `I couldn't find anything matching "${searchTerm}". Would you like me to remember something new instead?`;
        }

        const updated = await updateMemory(memory.id, updates);
        if (updated) {
          // Touch the memory to update its timestamp
          await touchMemory(memory.id);
          logger.info({ userId, memoryId: memory.id, updates }, 'Memory updated by user request');
          return `Updated! "${memory.name}" ${updates.name ? `is now "${updates.name}"` : 'has been updated'}. ✨`;
        } else {
          return `I had trouble updating that. Please try again.`;
        }
      },
    }),

    showAllPeterKnowledge: llm.tool({
      description: `Show all Peter's knowledge about companies and stocks the user knows.
Use when user asks about their full stock/company knowledge base.`,
      parameters: z.object({
        type: z.enum(['all', 'watchlist', 'company', 'ten_bagger']).default('all'),
      }),
      execute: async ({ type }, { ctx }) => {
        const userId = getUserId({ ctx });

        const memories = await getPeterMemories(userId, type === 'all' ? undefined : type);

        if (memories.length === 0) {
          return `We haven't tracked any companies yet! Start by adding companies you know - remember, invest in what you know! 📊`;
        }

        const tenBaggers = memories.filter((m) => m.type === 'ten_bagger');
        const watchlist = memories.filter((m) => m.type === 'watchlist');
        const companies = memories.filter((m) => m.type === 'company');

        let response = `**Your Investment Knowledge Base:**\n\n`;

        if (tenBaggers.length > 0) {
          response += `🚀 **Potential Ten-Baggers:**\n${tenBaggers.map((m) => `• ${m.ticker || m.name} - ${m.reason || 'Big potential!'}`).join('\n')}\n\n`;
        }

        if (watchlist.length > 0) {
          response += `👀 **Watchlist (${watchlist.length}):**\n${watchlist.slice(0, 10).map((m) => `• ${m.ticker ? `${m.ticker}` : m.name}${m.reason ? ` - ${m.reason}` : ''}`).join('\n')}\n\n`;
        }

        if (companies.length > 0) {
          response += `🏢 **Companies You Know (${companies.length}):**\n${companies.slice(0, 10).map((m) => `• ${m.name}${m.reason ? ` - ${m.reason}` : ''}`).join('\n')}\n\n`;
        }

        return response + `_Remember: The best investments come from knowing what you own!_`;
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createFerniMemoryTools,
  createBogleMemoryTools,
  createPeterMemoryTools,
  createMayaMemoryTools,
  createJordanMemoryTools,
  createAlexMemoryTools,
  createMemoryManagementTools,
};
