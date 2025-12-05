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
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// TYPES - LIFE PLANNING
// ============================================================================

interface MajorPurchase {
  id: string;
  type: 'car' | 'appliance' | 'electronics' | 'furniture' | 'other';
  name: string;
  budget: number;
  targetDate?: Date;
  status: 'researching' | 'comparing' | 'ready-to-buy' | 'purchased';
  options: PurchaseOption[];
  criteria: string[];
  notes: string;
  createdAt: Date;
}

interface PurchaseOption {
  name: string;
  price: number;
  pros: string[];
  cons: string[];
  rating?: number;
  source?: string;
}

interface Vacation {
  id: string;
  name: string;
  destination: string;
  startDate?: Date;
  endDate?: Date;
  budget: number;
  travelers: number;
  type: 'relaxation' | 'adventure' | 'cultural' | 'family' | 'romantic' | 'other';
  status: 'dreaming' | 'planning' | 'booked' | 'completed';
  itinerary: ItineraryDay[];
  bookings: Booking[];
  packingList: string[];
  createdAt: Date;
}

interface ItineraryDay {
  day: number;
  date?: Date;
  activities: string[];
  meals: string[];
  accommodation?: string;
  notes: string;
}

interface Booking {
  type: 'flight' | 'hotel' | 'car' | 'activity' | 'restaurant' | 'other';
  name: string;
  confirmationNumber?: string;
  cost: number;
  date?: Date;
  booked: boolean;
}

interface AnnualPlan {
  id: string;
  year: number;
  goals: LifeGoal[];
  quarterlyMilestones: QuarterlyMilestone[];
  experiences: PlannedExperience[];
  createdAt: Date;
}

interface LifeGoal {
  id: string;
  category:
    | 'health'
    | 'career'
    | 'financial'
    | 'relationships'
    | 'personal'
    | 'travel'
    | 'learning'
    | 'other';
  description: string;
  specificTarget?: string;
  deadline?: Date;
  progress: number; // 0-100
  status: 'not-started' | 'in-progress' | 'completed' | 'paused';
}

interface QuarterlyMilestone {
  quarter: 1 | 2 | 3 | 4;
  milestones: string[];
  completed: string[];
}

interface PlannedExperience {
  id: string;
  name: string;
  month?: number;
  category: string;
  estimated_cost?: number;
  completed: boolean;
  notes?: string;
}

// ============================================================================
// TYPES - EVENTS (existing)
// ============================================================================

interface Event {
  id: string;
  name: string;
  type: EventType;
  date: Date;
  location?: string;
  guestCount: number;
  budget: number;
  spent: number;
  theme?: string;
  status: 'planning' | 'confirmed' | 'completed' | 'cancelled';
  checklist: ChecklistItem[];
  guests: Guest[];
  vendors: Vendor[];
  notes: string;
  createdAt: Date;
}

type EventType =
  | 'birthday'
  | 'anniversary'
  | 'wedding'
  | 'graduation'
  | 'baby-shower'
  | 'retirement'
  | 'holiday'
  | 'corporate'
  | 'dinner-party'
  | 'other';

interface ChecklistItem {
  id: string;
  task: string;
  category: 'venue' | 'catering' | 'decor' | 'entertainment' | 'logistics' | 'other';
  dueDate?: Date;
  completed: boolean;
  assignedTo?: string;
  notes?: string;
}

interface Guest {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  rsvpStatus: 'pending' | 'confirmed' | 'declined' | 'maybe';
  dietaryRestrictions?: string[];
  plusOne: boolean;
  tableAssignment?: number;
}

interface Vendor {
  id: string;
  name: string;
  type: 'venue' | 'catering' | 'photography' | 'music' | 'decor' | 'cake' | 'other';
  contact: string;
  cost: number;
  depositPaid: boolean;
  confirmed: boolean;
  notes: string;
}

interface VenueOption {
  name: string;
  type: string;
  capacity: number;
  priceRange: string;
  amenities: string[];
  rating: number;
  location: string;
}

// In-memory storage
const events = new Map<string, Event>();
const majorPurchases = new Map<string, MajorPurchase>();
const vacations = new Map<string, Vacation>();
const annualPlans = new Map<string, AnnualPlan>();

// Best times to buy database
const BEST_TIMES_TO_BUY: Record<string, string[]> = {
  car: [
    'End of month',
    'End of quarter (Mar, Jun, Sep, Dec)',
    'End of model year (Sep-Nov)',
    'Holiday weekends',
  ],
  appliances: ['Memorial Day', 'Labor Day', 'Black Friday', 'Presidents Day'],
  electronics: ['Black Friday', 'Prime Day', 'Back to school (Aug)', 'After CES (Jan-Feb)'],
  furniture: ['Presidents Day', 'Memorial Day', 'July 4th', 'Labor Day'],
  mattress: ['Presidents Day', 'Memorial Day', 'July 4th', 'Labor Day'],
  flights: [
    'Tuesdays',
    '6-8 weeks before domestic',
    '2-3 months before international',
    'Off-peak seasons',
  ],
  hotels: ['Last minute for business hotels', '2-4 weeks out for vacation', 'Off-season'],
};

// Vacation destination database
const DESTINATION_DATABASE = [
  {
    name: 'Costa Rica',
    type: ['adventure', 'relaxation'],
    budget: '$$',
    bestTime: 'Dec-Apr',
    highlights: ['Beaches', 'Rainforests', 'Wildlife'],
  },
  {
    name: 'Italy',
    type: ['cultural', 'romantic'],
    budget: '$$$',
    bestTime: 'Apr-Jun, Sep-Oct',
    highlights: ['History', 'Food', 'Art'],
  },
  {
    name: 'Japan',
    type: ['cultural', 'adventure'],
    budget: '$$$',
    bestTime: 'Mar-May, Sep-Nov',
    highlights: ['Cherry blossoms', 'Temples', 'Food'],
  },
  {
    name: 'Mexico',
    type: ['relaxation', 'cultural'],
    budget: '$',
    bestTime: 'Dec-Apr',
    highlights: ['Beaches', 'Ruins', 'Food'],
  },
  {
    name: 'Iceland',
    type: ['adventure'],
    budget: '$$$',
    bestTime: 'Jun-Aug (midnight sun), Sep-Mar (aurora)',
    highlights: ['Landscapes', 'Northern Lights', 'Hot springs'],
  },
  {
    name: 'Portugal',
    type: ['cultural', 'relaxation'],
    budget: '$$',
    bestTime: 'Mar-May, Sep-Oct',
    highlights: ['History', 'Wine', 'Beaches'],
  },
  {
    name: 'Thailand',
    type: ['adventure', 'relaxation'],
    budget: '$',
    bestTime: 'Nov-Feb',
    highlights: ['Beaches', 'Temples', 'Food'],
  },
  {
    name: 'National Parks (US)',
    type: ['adventure', 'family'],
    budget: '$',
    bestTime: 'Varies by park',
    highlights: ['Nature', 'Hiking', 'Wildlife'],
  },
];

const venueDatabase: VenueOption[] = [
  {
    name: 'The Grand Ballroom',
    type: 'ballroom',
    capacity: 200,
    priceRange: '$$$',
    amenities: ['catering', 'bar', 'dance floor', 'AV equipment'],
    rating: 4.8,
    location: 'Downtown',
  },
  {
    name: 'Riverside Gardens',
    type: 'outdoor',
    capacity: 150,
    priceRange: '$$',
    amenities: ['scenic views', 'tent rental', 'parking'],
    rating: 4.6,
    location: 'Riverside',
  },
  {
    name: 'The Loft',
    type: 'industrial',
    capacity: 80,
    priceRange: '$$',
    amenities: ['exposed brick', 'flexible space', 'rooftop access'],
    rating: 4.7,
    location: 'Arts District',
  },
  {
    name: 'Sunny Side Restaurant',
    type: 'restaurant',
    capacity: 50,
    priceRange: '$',
    amenities: ['private room', 'in-house catering', 'bar'],
    rating: 4.5,
    location: 'Midtown',
  },
  {
    name: 'Community Center',
    type: 'community',
    capacity: 100,
    priceRange: '$',
    amenities: ['kitchen access', 'tables/chairs', 'parking'],
    rating: 4.2,
    location: 'Suburban',
  },
  {
    name: 'Beachfront Pavilion',
    type: 'outdoor',
    capacity: 120,
    priceRange: '$$$',
    amenities: ['ocean views', 'sunset ceremony', 'catering options'],
    rating: 4.9,
    location: 'Coastal',
  },
];

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

function createEvent(
  name: string,
  type: EventType,
  date: Date,
  guestCount: number,
  budget: number,
  theme?: string
): Event {
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
      description: `Create a new event to plan.
Use when the user wants to:
- Plan a party
- Organize a celebration
- Start event planning`,
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
      execute: async ({ name, type, date, guestCount, budget, theme }) => {
        const eventDate = new Date(date);
        if (isNaN(eventDate.getTime())) {
          return `I couldn't understand that date. Can you try something like "March 15, 2025"?`;
        }

        const event = createEvent(name, type, eventDate, guestCount, budget, theme);

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
      description: `Search for venue options based on requirements.
Use when the user needs to:
- Find a venue
- Compare locations
- Get venue recommendations`,
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
      description: `Add guests to the event guest list.
Use when the user wants to:
- Add people to the guest list
- Track RSVPs
- Manage invitations`,
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
      execute: async ({ eventId, guests }) => {
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
      description: `Get the current guest list and RSVP status.
Use when the user asks about:
- Who's coming
- RSVP status
- Guest count`,
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
      description: `Get the event planning checklist.
Use when the user asks about:
- What needs to be done
- Planning tasks
- To-do list`,
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
      description: `Mark a checklist task as complete.
Use when the user has:
- Finished a task
- Booked something
- Completed a planning step`,
      parameters: z.object({
        taskName: z.string().describe('Name or description of the task'),
        eventId: z.string().optional().describe('Event ID'),
        notes: z.string().optional().describe('Any notes about completion'),
      }),
      execute: async ({ taskName, eventId, notes }) => {
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

        const remaining = event.checklist.filter((c) => !c.completed).length;

        return `✅ Done: "${task.task}"\n\n${remaining} tasks remaining. You're making great progress!`;
      },
    }),

    // ========== BUDGET TRACKING ==========

    trackExpense: llm.tool({
      description: `Track an expense for the event.
Use when the user:
- Pays for something
- Books a vendor
- Makes a purchase`,
      parameters: z.object({
        description: z.string().describe('What the expense is for'),
        amount: z.number().positive().describe('Amount spent'),
        category: z
          .enum(['venue', 'catering', 'decor', 'entertainment', 'attire', 'gifts', 'other'])
          .describe('Expense category'),
        eventId: z.string().optional().describe('Event ID'),
      }),
      execute: async ({ description, amount, category, eventId }) => {
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
      description: `Get a complete summary of the event.
Use when the user wants:
- An overview
- Event status
- Planning summary`,
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
      description: `Start planning a major purchase like a car, appliance, or electronics.
Use when the user wants to:
- Buy a car
- Purchase appliances
- Make a big purchase decision`,
      parameters: z.object({
        type: z
          .enum(['car', 'appliance', 'electronics', 'furniture', 'other'])
          .describe('Type of purchase'),
        name: z.string().describe('What they want to buy (e.g., "SUV", "refrigerator")'),
        budget: z.number().positive().describe('Maximum budget'),
        priorities: z.array(z.string()).optional().describe('Key priorities'),
      }),
      execute: async ({ type, name, budget, priorities }) => {
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
      description: `Get the best times to buy something.
Use when the user asks when to buy something.`,
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
      description: `Start planning a vacation or trip.
Use when the user wants to plan a vacation or travel.`,
      parameters: z.object({
        name: z.string().describe('Trip name'),
        destination: z.string().optional().describe('Where to go'),
        travelers: z.number().default(1).describe('Number of travelers'),
        budget: z.number().describe('Total budget'),
        tripType: z.enum(['relaxation', 'adventure', 'cultural', 'family', 'romantic', 'other']),
      }),
      execute: async ({ name, destination, travelers, budget, tripType }) => {
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
      description: `Suggest vacation destinations based on preferences.`,
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
      description: `Create an annual plan with goals and experiences.
Use when the user wants to plan their year.`,
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
      execute: async ({ year, goals, experiences }) => {
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
      description: `Get the status of the annual plan.`,
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

// Legacy alias for backward compatibility
export const createJordanTools = createEventPlanningTools;

export default createEventPlanningTools;
