/**
 * Event Planning & Life Milestone Tools
 *
 * Tools for life planning:
 * - Major life events and milestones
 * - Major purchases and big decisions
 * - Vacations and travel planning
 * - Annual and life-stage planning
 * - Celebrations and transitions
 *
 * NOTE: This is the agent-agnostic version. The original jordan-tools.ts
 * re-exports from this file for backward compatibility.
 *
 * Related tools in separate files:
 * - life-firsts-tracker.ts - Life milestone tracking
 * - goal-management.ts - Life goals and portfolio
 * - retirement-planning.ts - Retirement vision and planning
 * - cultural-celebrations.ts - Cultural milestone events
 * - first-time-planning.ts - First-time experience guidance
 * - milestone-proactive.ts - Proactive milestone suggestions
 *
 * PERSISTENCE: Events, purchases, vacations, and plans are persisted to Firestore.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// Import types from extracted module
import type {
  Event,
  EventType,
  MajorPurchase,
  Vacation,
  AnnualPlan,
  ChecklistItem,
  Guest,
  Vendor,
  VenueOption,
  ItineraryDay,
  Booking,
  LifeGoal,
  QuarterlyMilestone,
  PlannedExperience,
} from '../../../tools/event-planning/types.js';

// Import storage and helpers from extracted module
import {
  events,
  majorPurchases,
  vacations,
  annualPlans,
  ensureUserLoaded,
  persistEventPlanningData,
  BEST_TIMES_TO_BUY,
  DESTINATION_DATABASE,
  venueDatabase,
} from '../../../tools/event-planning/storage.js';

// Re-export types for backward compatibility
export type {
  Event,
  EventType,
  MajorPurchase,
  Vacation,
  AnnualPlan,
  ChecklistItem,
  Guest,
  Vendor,
  VenueOption,
  ItineraryDay,
  Booking,
  LifeGoal,
  QuarterlyMilestone,
  PlannedExperience,
} from '../../event-planning/types.js';

// Re-export storage/persistence for backward compatibility
export { flushEventPlanningPersistence } from '../../event-planning/storage.js';

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

async function createEventWithPersistence(
  userId: string,
  name: string,
  type: EventType,
  date: Date,
  guestCount: number,
  budget: number,
  theme?: string
): Promise<Event> {
  await ensureUserLoaded(userId);

  const id = `event_${Date.now()}`;

  const event: Event = {
    id,
    name,
    type,
    date,
    guestCount,
    budget,
    spent: 0,
    theme,
    status: 'planning',
    checklist: generateDefaultChecklist(type),
    guests: [],
    vendors: [],
    notes: '',
    createdAt: new Date(),
  };

  events.set(id, event);
  persistEventPlanningData(userId);
  getLogger().info({ eventId: id, name, type, date }, '🎉 Event created');

  return event;
}

function generateDefaultChecklist(type: EventType): ChecklistItem[] {
  const baseItems: ChecklistItem[] = [
    { id: 'cl_1', task: 'Book venue', category: 'venue', completed: false },
    { id: 'cl_2', task: 'Send invitations', category: 'logistics', completed: false },
    { id: 'cl_3', task: 'Arrange catering', category: 'catering', completed: false },
    { id: 'cl_4', task: 'Plan decorations', category: 'decor', completed: false },
    { id: 'cl_5', task: 'Organize entertainment', category: 'entertainment', completed: false },
    { id: 'cl_6', task: 'Confirm guest count', category: 'logistics', completed: false },
  ];

  // Add type-specific items
  switch (type) {
    case 'birthday':
      baseItems.push(
        { id: 'cl_b1', task: 'Order birthday cake', category: 'catering', completed: false },
        { id: 'cl_b2', task: 'Plan games/activities', category: 'entertainment', completed: false },
        { id: 'cl_b3', task: 'Arrange gift table', category: 'decor', completed: false }
      );
      break;
    case 'wedding':
      baseItems.push(
        { id: 'cl_w1', task: 'Book photographer', category: 'other', completed: false },
        { id: 'cl_w2', task: 'Arrange flowers', category: 'decor', completed: false },
        { id: 'cl_w3', task: 'Plan ceremony timeline', category: 'logistics', completed: false },
        { id: 'cl_w4', task: 'Arrange transportation', category: 'logistics', completed: false }
      );
      break;
    case 'corporate':
      baseItems.push(
        { id: 'cl_c1', task: 'Set up AV equipment', category: 'logistics', completed: false },
        {
          id: 'cl_c2',
          task: 'Prepare presentation materials',
          category: 'other',
          completed: false,
        },
        { id: 'cl_c3', task: 'Arrange name badges', category: 'logistics', completed: false }
      );
      break;
    case 'dinner-party':
      baseItems.push(
        { id: 'cl_d1', task: 'Plan menu', category: 'catering', completed: false },
        { id: 'cl_d2', task: 'Select wine pairings', category: 'catering', completed: false },
        { id: 'cl_d3', task: 'Set table arrangement', category: 'decor', completed: false }
      );
      break;
    default:
      break;
  }

  return baseItems;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createEventPlanningTools() {
  return {
    // ========== EVENT CREATION ==========

    createEvent: llm.tool({
      description: getToolDescription('createEvent'),
      parameters: z.object({
        name: z.string().describe('Event name (e.g., "Sarah\'s 30th Birthday")'),
        type: z
          .enum([
            'birthday',
            'anniversary',
            'wedding',
            'graduation',
            'baby-shower',
            'retirement',
            'holiday',
            'corporate',
            'dinner-party',
            'other',
          ])
          .describe('Type of event'),
        date: z.string().describe('Event date (e.g., "December 15, 2024")'),
        guestCount: z.number().positive().describe('Expected number of guests'),
        budget: z.number().positive().describe('Total budget for the event'),
        theme: z
          .string()
          .optional()
          .describe('Optional theme (e.g., "Tropical", "80s", "Elegant Black Tie")'),
      }),
      execute: async ({ name, type, date, guestCount, budget, theme }, context) => {
        const eventDate = new Date(date);
        if (isNaN(eventDate.getTime())) {
          return `I couldn't understand that date. Can you try something like "March 15, 2025"?`;
        }

        // Get userId from context or use default
        const userId = (context as { userId?: string })?.userId || 'default';
        const event = await createEventWithPersistence(
          userId,
          name,
          type,
          eventDate,
          guestCount,
          budget,
          theme
        );

        const dateStr = eventDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        const daysUntil = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        let response = `🎉 **Event Created: ${name}**\n\n`;
        response += `📅 **Date:** ${dateStr} (${daysUntil} days away)\n`;
        response += `👥 **Guests:** ${guestCount}\n`;
        response += `💰 **Budget:** $${budget.toLocaleString()}\n`;
        if (theme) {
          response += `🎨 **Theme:** ${theme}\n`;
        }
        response += `\n**Next Steps:**\n`;
        response += `1. Find a venue\n`;
        response += `2. Start your guest list\n`;
        response += `3. Book key vendors\n\n`;
        response += `Ready to make this amazing! What should we tackle first?`;

        return response;
      },
    }),

    // ========== VENUE SEARCH ==========

    searchVenues: llm.tool({
      description: getToolDescription('searchVenues'),
      parameters: z.object({
        guestCount: z.number().positive().describe('Number of guests'),
        eventType: z.string().optional().describe('Type of event'),
        budgetLevel: z.enum(['$', '$$', '$$$']).optional().describe('Budget level'),
        venueType: z
          .enum(['indoor', 'outdoor', 'both'])
          .optional()
          .default('both')
          .describe('Venue preference'),
      }),
      execute: async ({ guestCount, eventType, budgetLevel, venueType }) => {
        let matches = venueDatabase.filter((v) => v.capacity >= guestCount);

        if (budgetLevel) {
          matches = matches.filter((v) => v.priceRange === budgetLevel);
        }

        if (venueType !== 'both') {
          matches = matches.filter((v) =>
            venueType === 'outdoor' ? v.type === 'outdoor' : v.type !== 'outdoor'
          );
        }

        if (matches.length === 0) {
          return `Hmm, I couldn't find venues matching all your criteria. Want me to expand the search?`;
        }

        let response = `🏛️ **Venue Options for ${guestCount} guests:**\n\n`;

        for (const venue of matches.slice(0, 5)) {
          const stars = '⭐'.repeat(Math.round(venue.rating));
          response += `**${venue.name}** ${stars}\n`;
          response += `📍 ${venue.location} | 👥 Up to ${venue.capacity} | ${venue.priceRange}\n`;
          response += `✨ ${venue.amenities.join(', ')}\n\n`;
        }

        response += `Want more details on any of these? Or should I search with different criteria?`;

        return response;
      },
    }),

    // ========== GUEST MANAGEMENT ==========

    addGuests: llm.tool({
      description: getToolDescription('addGuests'),
      parameters: z.object({
        eventId: z.string().optional().describe('Event ID (uses most recent if not specified)'),
        guests: z
          .array(
            z.object({
              name: z.string().describe('Guest name'),
              email: z.string().optional().describe('Guest email'),
              plusOne: z.boolean().default(false).describe('Bringing a plus one?'),
            })
          )
          .describe('List of guests to add'),
      }),
      execute: async ({ eventId, guests }, context) => {
        const userId = (context as { userId?: string })?.userId || 'default';
        await ensureUserLoaded(userId);

        // Get event (use most recent if not specified)
        let event: Event | undefined;
        if (eventId) {
          event = events.get(eventId);
        } else {
          const allEvents = Array.from(events.values());
          event = allEvents[allEvents.length - 1];
        }

        if (!event) {
          return `I don't have an event to add guests to. Want to create one first?`;
        }

        let added = 0;
        for (const guest of guests) {
          const guestEntry: Guest = {
            id: `guest_${Date.now()}_${added}`,
            name: guest.name,
            email: guest.email,
            rsvpStatus: 'pending',
            plusOne: guest.plusOne,
          };
          event.guests.push(guestEntry);
          added++;
        }

        event.guestCount = event.guests.length + event.guests.filter((g) => g.plusOne).length;
        events.set(event.id, event);
        persistEventPlanningData(userId);

        const plusOnes = guests.filter((g) => g.plusOne).length;
        let response = `✅ Added ${added} guest${added > 1 ? 's' : ''} to "${event.name}"`;
        if (plusOnes > 0) {
          response += ` (+ ${plusOnes} plus ones)`;
        }
        response += `\n\n**Current guest count:** ${event.guestCount}`;
        response += `\n**RSVPs pending:** ${event.guests.filter((g) => g.rsvpStatus === 'pending').length}`;

        return response;
      },
    }),

    getGuestList: llm.tool({
      description: getToolDescription('getGuestList'),
      parameters: z.object({
        eventId: z.string().optional().describe('Event ID'),
      }),
      execute: async ({ eventId }) => {
        let event: Event | undefined;
        if (eventId) {
          event = events.get(eventId);
        } else {
          const allEvents = Array.from(events.values());
          event = allEvents[allEvents.length - 1];
        }

        if (!event) {
          return `No event found. Create one first?`;
        }

        if (event.guests.length === 0) {
          return `No guests added yet for "${event.name}". Ready to build the guest list?`;
        }

        const confirmed = event.guests.filter((g) => g.rsvpStatus === 'confirmed');
        const declined = event.guests.filter((g) => g.rsvpStatus === 'declined');
        const pending = event.guests.filter((g) => g.rsvpStatus === 'pending');
        const maybe = event.guests.filter((g) => g.rsvpStatus === 'maybe');

        let response = `📋 **Guest List for "${event.name}"**\n\n`;
        response += `**Total invited:** ${event.guests.length}\n\n`;

        response += `✅ **Confirmed (${confirmed.length}):**\n`;
        if (confirmed.length > 0) {
          response += confirmed.map((g) => `• ${g.name}${g.plusOne ? ' +1' : ''}`).join('\n');
        } else {
          response += `None yet`;
        }
        response += '\n\n';

        response += `⏳ **Pending (${pending.length}):**\n`;
        if (pending.length > 0) {
          response += pending.map((g) => `• ${g.name}`).join('\n');
        } else {
          response += `All responded!`;
        }
        response += '\n\n';

        if (maybe.length > 0) {
          response += `🤔 **Maybe (${maybe.length}):**\n`;
          response += maybe.map((g) => `• ${g.name}`).join('\n');
          response += '\n\n';
        }

        if (declined.length > 0) {
          response += `❌ **Declined (${declined.length}):**\n`;
          response += declined.map((g) => `• ${g.name}`).join('\n');
        }

        return response;
      },
    }),

    // ========== CHECKLIST ==========

    getChecklist: llm.tool({
      description: getToolDescription('getChecklist'),
      parameters: z.object({
        eventId: z.string().optional().describe('Event ID'),
      }),
      execute: async ({ eventId }) => {
        let event: Event | undefined;
        if (eventId) {
          event = events.get(eventId);
        } else {
          const allEvents = Array.from(events.values());
          event = allEvents[allEvents.length - 1];
        }

        if (!event) {
          return `No event found. Create one first?`;
        }

        const completed = event.checklist.filter((c) => c.completed);
        const pending = event.checklist.filter((c) => !c.completed);
        const progress = Math.round((completed.length / event.checklist.length) * 100);

        let response = `📝 **Planning Checklist for "${event.name}"**\n\n`;
        response += `**Progress:** ${progress}% complete (${completed.length}/${event.checklist.length})\n\n`;

        if (pending.length > 0) {
          response += `**To Do:**\n`;
          for (const item of pending) {
            const categoryIcon = {
              venue: '🏛️',
              catering: '🍽️',
              decor: '🎨',
              entertainment: '🎵',
              logistics: '📋',
              other: '📌',
            }[item.category];
            response += `☐ ${categoryIcon} ${item.task}\n`;
          }
          response += '\n';
        }

        if (completed.length > 0) {
          response += `**Completed:**\n`;
          for (const item of completed) {
            response += `☑️ ${item.task}\n`;
          }
        }

        return response;
      },
    }),

    completeTask: llm.tool({
      description: getToolDescription('completeTask'),
      parameters: z.object({
        taskName: z.string().describe('Name or description of the task'),
        eventId: z.string().optional().describe('Event ID'),
        notes: z.string().optional().describe('Any notes about completion'),
      }),
      execute: async ({ taskName, eventId, notes }, context) => {
        const userId = (context as { userId?: string })?.userId || 'default';
        await ensureUserLoaded(userId);

        let event: Event | undefined;
        if (eventId) {
          event = events.get(eventId);
        } else {
          const allEvents = Array.from(events.values());
          event = allEvents[allEvents.length - 1];
        }

        if (!event) {
          return `No event found.`;
        }

        const task = event.checklist.find(
          (c) => c.task.toLowerCase().includes(taskName.toLowerCase()) && !c.completed
        );

        if (!task) {
          return `Couldn't find that task. Here are the pending items:\n${event.checklist
            .filter((c) => !c.completed)
            .map((c) => `• ${c.task}`)
            .join('\n')}`;
        }

        task.completed = true;
        if (notes) task.notes = notes;
        events.set(event.id, event);
        persistEventPlanningData(userId);

        const remaining = event.checklist.filter((c) => !c.completed).length;

        return `✅ Done: "${task.task}"\n\n${remaining} tasks remaining. You're making great progress!`;
      },
    }),

    // ========== BUDGET TRACKING ==========

    trackExpense: llm.tool({
      description: getToolDescription('trackExpense'),
      parameters: z.object({
        description: z.string().describe('What the expense is for'),
        amount: z.number().positive().describe('Amount spent'),
        category: z
          .enum(['venue', 'catering', 'decor', 'entertainment', 'attire', 'gifts', 'other'])
          .describe('Expense category'),
        eventId: z.string().optional().describe('Event ID'),
      }),
      execute: async ({ description, amount, category, eventId }, context) => {
        const userId = (context as { userId?: string })?.userId || 'default';
        await ensureUserLoaded(userId);

        let event: Event | undefined;
        if (eventId) {
          event = events.get(eventId);
        } else {
          const allEvents = Array.from(events.values());
          event = allEvents[allEvents.length - 1];
        }

        if (!event) {
          return `No event found.`;
        }

        event.spent += amount;
        events.set(event.id, event);
        persistEventPlanningData(userId);

        const remaining = event.budget - event.spent;
        const percentUsed = Math.round((event.spent / event.budget) * 100);

        let response = `💰 **Expense Tracked**\n\n`;
        response += `${description}: $${amount.toLocaleString()}\n`;
        response += `Category: ${category}\n\n`;
        response += `**Budget Status:**\n`;
        response += `Spent: $${event.spent.toLocaleString()} (${percentUsed}%)\n`;
        response += `Remaining: $${remaining.toLocaleString()}\n`;

        if (remaining < 0) {
          response += `\n⚠️ You're $${Math.abs(remaining).toLocaleString()} over budget!`;
        } else if (remaining < event.budget * 0.1) {
          response += `\n⚠️ Budget is getting tight! Only 10% remaining.`;
        }

        return response;
      },
    }),

    // ========== EVENT SUMMARY ==========

    getEventSummary: llm.tool({
      description: getToolDescription('getEventSummary'),
      parameters: z.object({
        eventId: z.string().optional().describe('Event ID'),
      }),
      execute: async ({ eventId }) => {
        let event: Event | undefined;
        if (eventId) {
          event = events.get(eventId);
        } else {
          const allEvents = Array.from(events.values());
          event = allEvents[allEvents.length - 1];
        }

        if (!event) {
          return `No events found. Ready to start planning something amazing?`;
        }

        const dateStr = event.date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const completedTasks = event.checklist.filter((c) => c.completed).length;
        const confirmedGuests = event.guests.filter((g) => g.rsvpStatus === 'confirmed').length;

        let response = `🎉 **${event.name}**\n`;
        response += `${'═'.repeat(30)}\n\n`;

        response += `📅 **Date:** ${dateStr}\n`;
        response += `⏰ **Countdown:** ${daysUntil} days\n`;
        if (event.theme) {
          response += `🎨 **Theme:** ${event.theme}\n`;
        }
        if (event.location) {
          response += `📍 **Venue:** ${event.location}\n`;
        }
        response += `\n`;

        response += `👥 **Guests:** ${confirmedGuests} confirmed / ${event.guests.length} invited\n`;
        response += `💰 **Budget:** $${event.spent.toLocaleString()} spent / $${event.budget.toLocaleString()}\n`;
        response += `📝 **Tasks:** ${completedTasks}/${event.checklist.length} complete\n\n`;

        // Urgent items
        const urgentTasks = event.checklist.filter((c) => !c.completed);
        if (urgentTasks.length > 0 && daysUntil < 30) {
          response += `⚡ **Priority Items:**\n`;
          for (const task of urgentTasks.slice(0, 3)) {
            response += `• ${task.task}\n`;
          }
        }

        return response;
      },
    }),

    // ========== MAJOR PURCHASE PLANNING ==========

    planMajorPurchase: llm.tool({
      description: getToolDescription('planMajorPurchase'),
      parameters: z.object({
        type: z
          .enum(['car', 'appliance', 'electronics', 'furniture', 'other'])
          .describe('Type of purchase'),
        name: z.string().describe('What they want to buy (e.g., "SUV", "refrigerator")'),
        budget: z.number().positive().describe('Maximum budget'),
        priorities: z.array(z.string()).optional().describe('Key priorities'),
      }),
      execute: async ({ type, name, budget, priorities }, context) => {
        const userId = (context as { userId?: string })?.userId || 'default';
        await ensureUserLoaded(userId);

        const id = `purchase_${Date.now()}`;

        const purchase: MajorPurchase = {
          id,
          type,
          name,
          budget,
          status: 'researching',
          options: [],
          criteria: priorities || [],
          notes: '',
          createdAt: new Date(),
        };

        majorPurchases.set(id, purchase);
        persistEventPlanningData(userId);
        getLogger().info({ purchaseId: id, type, name, budget }, '🛒 Major purchase plan created');

        const bestTimes = BEST_TIMES_TO_BUY[type] || BEST_TIMES_TO_BUY.appliances;

        let response = `🛒 **Major Purchase Plan: ${name}**\n\n`;
        response += `**Budget:** $${budget.toLocaleString()}\n\n`;

        response += `**Best Times to Buy ${type}:**\n`;
        for (const time of bestTimes) {
          response += `• ${time}\n`;
        }
        response += `\n`;

        response += `**Next Steps:**\n`;
        response += `1. Research top options in your budget\n`;
        response += `2. Read reviews (Consumer Reports, Reddit)\n`;
        response += `3. Compare 3-5 finalists\n`;
        response += `4. Test/inspect before buying\n\n`;

        if (priorities && priorities.length > 0) {
          response += `**Your Priorities:** ${priorities.join(', ')}\n\n`;
        }

        return response;
      },
    }),

    getBestTimeToBuy: llm.tool({
      description: getToolDescription('getBestTimeToBuy'),
      parameters: z.object({
        item: z.string().describe('What they want to buy'),
      }),
      execute: async ({ item }) => {
        const itemLower = item.toLowerCase();

        let category = 'appliances';
        if (itemLower.includes('car') || itemLower.includes('vehicle')) {
          category = 'car';
        } else if (
          itemLower.includes('tv') ||
          itemLower.includes('phone') ||
          itemLower.includes('laptop')
        ) {
          category = 'electronics';
        } else if (itemLower.includes('furniture') || itemLower.includes('couch')) {
          category = 'furniture';
        } else if (itemLower.includes('flight')) {
          category = 'flights';
        }

        const times = BEST_TIMES_TO_BUY[category];

        let response = `🗓️ **Best Times to Buy ${item}:**\n\n`;
        for (const time of times) {
          response += `• ${time}\n`;
        }

        return response;
      },
    }),

    // ========== VACATION PLANNING ==========

    planVacation: llm.tool({
      description: getToolDescription('planVacation'),
      parameters: z.object({
        name: z.string().describe('Trip name'),
        destination: z.string().optional().describe('Where to go'),
        travelers: z.number().default(1).describe('Number of travelers'),
        budget: z.number().describe('Total budget'),
        tripType: z.enum(['relaxation', 'adventure', 'cultural', 'family', 'romantic', 'other']),
      }),
      execute: async ({ name, destination, travelers, budget, tripType }, context) => {
        const userId = (context as { userId?: string })?.userId || 'default';
        await ensureUserLoaded(userId);

        const id = `vacation_${Date.now()}`;

        const vacation: Vacation = {
          id,
          name,
          destination: destination || 'TBD',
          travelers,
          budget,
          type: tripType,
          status: destination ? 'planning' : 'dreaming',
          itinerary: [],
          bookings: [],
          packingList: [],
          createdAt: new Date(),
        };

        vacations.set(id, vacation);
        persistEventPlanningData(userId);
        getLogger().info({ vacationId: id, name, destination, budget }, '✈️ Vacation plan created');

        let response = `✈️ **Vacation Plan: ${name}**\n\n`;
        response += `**Destination:** ${destination || "Let's figure it out!"}\n`;
        response += `**Travelers:** ${travelers}\n`;
        response += `**Budget:** $${budget.toLocaleString()}\n`;
        response += `**Style:** ${tripType}\n\n`;

        if (!destination) {
          const matches = DESTINATION_DATABASE.filter((d) => d.type.includes(tripType));
          response += `**Destination Ideas:**\n`;
          for (const dest of matches.slice(0, 3)) {
            response += `🌍 **${dest.name}** - ${dest.highlights.join(', ')}\n`;
          }
        }

        response += `\n**Planning Timeline:**\n`;
        response += `• 3-6 months out: Book flights & hotels\n`;
        response += `• 2-3 months out: Research activities\n`;
        response += `• 1 week out: Pack & confirm\n`;

        return response;
      },
    }),

    suggestDestinations: llm.tool({
      description: getToolDescription('suggestDestinations'),
      parameters: z.object({
        tripType: z.enum(['relaxation', 'adventure', 'cultural', 'family', 'romantic', 'other']),
        budget: z.enum(['$', '$$', '$$$']),
      }),
      execute: async ({ tripType, budget }) => {
        const matches = DESTINATION_DATABASE.filter(
          (d) => d.type.includes(tripType) && d.budget === budget
        );

        let response = `🌍 **Destination Ideas (${tripType}, ${budget}):**\n\n`;

        for (const dest of matches.slice(0, 5)) {
          response += `**${dest.name}**\n`;
          response += `🗓️ Best time: ${dest.bestTime}\n`;
          response += `✨ ${dest.highlights.join(', ')}\n\n`;
        }

        return response;
      },
    }),

    // ========== ANNUAL PLANNING ==========

    createAnnualPlan: llm.tool({
      description: getToolDescription('createAnnualPlan'),
      parameters: z.object({
        year: z.number().describe('Year to plan'),
        goals: z
          .array(
            z.object({
              category: z.enum([
                'health',
                'career',
                'financial',
                'relationships',
                'personal',
                'travel',
                'learning',
                'other',
              ]),
              description: z.string(),
            })
          )
          .optional(),
        experiences: z.array(z.string()).optional().describe('Experiences to have'),
      }),
      execute: async ({ year, goals, experiences }, context) => {
        const userId = (context as { userId?: string })?.userId || 'default';
        await ensureUserLoaded(userId);

        const id = `plan_${year}`;

        const plan: AnnualPlan = {
          id,
          year,
          goals: (goals || []).map((g, i) => ({
            id: `goal_${i}`,
            category: g.category,
            description: g.description,
            progress: 0,
            status: 'not-started',
          })),
          quarterlyMilestones: [
            { quarter: 1, milestones: [], completed: [] },
            { quarter: 2, milestones: [], completed: [] },
            { quarter: 3, milestones: [], completed: [] },
            { quarter: 4, milestones: [], completed: [] },
          ],
          experiences: (experiences || []).map((e, i) => ({
            id: `exp_${i}`,
            name: e,
            category: 'experience',
            completed: false,
          })),
          createdAt: new Date(),
        };

        annualPlans.set(id, plan);
        persistEventPlanningData(userId);
        getLogger().info({ year, goalsCount: plan.goals.length }, '📆 Annual plan created');

        let response = `📆 **${year} Annual Plan**\n\n`;

        if (plan.goals.length > 0) {
          response += `**Goals:**\n`;
          for (const goal of plan.goals) {
            const icon = {
              health: '💪',
              career: '💼',
              financial: '💰',
              relationships: '❤️',
              personal: '🌱',
              travel: '✈️',
              learning: '📚',
              other: '🎯',
            }[goal.category];
            response += `${icon} ${goal.description}\n`;
          }
          response += `\n`;
        }

        if (plan.experiences.length > 0) {
          response += `**Experiences:**\n`;
          for (const exp of plan.experiences) {
            response += `☐ ${exp.name}\n`;
          }
        }

        return response;
      },
    }),

    getAnnualPlanStatus: llm.tool({
      description: getToolDescription('getAnnualPlanStatus'),
      parameters: z.object({
        year: z.number().optional(),
      }),
      execute: async ({ year }) => {
        const targetYear = year || new Date().getFullYear();
        const plan = annualPlans.get(`plan_${targetYear}`);

        if (!plan) {
          return `No plan found for ${targetYear}. Want to create one?`;
        }

        const completedGoals = plan.goals.filter((g) => g.status === 'completed').length;
        const completedExp = plan.experiences.filter((e) => e.completed).length;

        let response = `📆 **${targetYear} Status**\n\n`;
        response += `**Goals:** ${completedGoals}/${plan.goals.length}\n`;
        for (const goal of plan.goals) {
          const icon =
            goal.status === 'completed' ? '✅' : goal.status === 'in-progress' ? '🔄' : '☐';
          response += `${icon} ${goal.description}\n`;
        }

        if (plan.experiences.length > 0) {
          response += `\n**Experiences:** ${completedExp}/${plan.experiences.length}\n`;
          for (const exp of plan.experiences) {
            response += `${exp.completed ? '✅' : '☐'} ${exp.name}\n`;
          }
        }

        return response;
      },
    }),
  };
}

export default createEventPlanningTools;
