/**
 * Events & Planning Tasks - Jordan Taylor Domain
 *
 * Domain-specific tasks for event planning, life milestones, and special occasions.
 * Jordan's specialty: making life's moments memorable and stress-free.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// EVENT PLANNING TASK
// ============================================================================

export interface EventPlanningResult {
  eventName: string;
  eventType: string;
  date?: string;
  venue?: string;
  guestCount: number;
  budget?: number;
  checklist: string[];
  nextSteps: string[];
  excitementLevel: 'low' | 'medium' | 'high';
}

/**
 * EventPlanningTask - Plan a special event
 *
 * From birthdays to weddings - make it special without the stress.
 */
export class EventPlanningTask extends IntelligentTask<EventPlanningResult> {
  constructor(eventType: string) {
    super({
      instructions: {
        base: `
          They're planning: "${eventType}"
          
          Help them plan something memorable!
          
          Key questions:
          1. VISION: What do you want people to feel/remember?
          2. WHEN: Date and time (flexibility?)
          3. WHERE: Venue options and logistics
          4. WHO: Guest list, VIPs, plus-ones?
          5. WHAT: Food, activities, entertainment
          6. HOW MUCH: Budget (be realistic!)
          
          Planning principles:
          - Start with the experience, not the logistics
          - Build in buffer time
          - Delegate where possible
          - Don't forget YOU should enjoy it too!
          
          Keep it fun! Events should be exciting, not overwhelming.
        `,
        ifAnxious: `
          Event planning can feel overwhelming. Break it into small pieces.
          Focus on one decision at a time. They don't need to figure it all out today.
        `,
        ifHappy: `
          They're excited! Channel that energy into creative planning.
          Dream big, then figure out the logistics.
        `,
      },
      tools: {
        captureVision: llm.tool({
          description: 'Capture their vision for the event.',
          parameters: z.object({
            eventName: z.string().describe('What to call this event'),
            vibe: z.string().describe('The feeling they want'),
            mustHaves: z.array(z.string()).describe('Non-negotiable elements'),
            niceToHaves: z.array(z.string()).describe('Would be great if possible'),
            avoid: z.array(z.string()).optional().describe('Things to avoid'),
          }),
          execute: async ({ eventName, vibe, mustHaves, niceToHaves, avoid }) => {
            let response = `${eventName} - ${vibe} vibe.\n\nMust have: ${mustHaves.join(', ')}\nNice to have: ${niceToHaves.join(', ')}`;
            if (avoid && avoid.length > 0) {
              response += `\nAvoiding: ${avoid.join(', ')}`;
            }
            return response + "\n\nLove it. Now let's make it happen.";
          },
        }),

        setDateVenue: llm.tool({
          description: 'Lock in date and venue.',
          parameters: z.object({
            date: z.string().describe('Event date'),
            dateFlexible: z.boolean(),
            venue: z.string().optional().describe('Venue choice'),
            venueOptions: z.array(z.string()).optional().describe('Venues being considered'),
            guestCount: z.number().describe('Expected guest count'),
          }),
          execute: async ({ date, dateFlexible, venue, venueOptions, guestCount }) => {
            let response = `Date: ${date}${dateFlexible ? ' (flexible)' : ' (locked in)'}. ~${guestCount} guests.`;
            if (venue) {
              response += `\nVenue: ${venue}`;
            } else if (venueOptions && venueOptions.length > 0) {
              response += `\nVenue options: ${venueOptions.join(', ')}`;
            }
            return response;
          },
        }),

        setBudget: llm.tool({
          description: 'Set and break down budget.',
          parameters: z.object({
            totalBudget: z.number(),
            breakdown: z.array(z.object({
              category: z.string(),
              amount: z.number(),
            })),
            bufferIncluded: z.boolean(),
          }),
          execute: async ({ totalBudget, breakdown, bufferIncluded }) => {
            let response = `Budget: $${totalBudget.toLocaleString()}\n`;
            response += breakdown.map(b => `- ${b.category}: $${b.amount.toLocaleString()}`).join('\n');
            if (!bufferIncluded) {
              response += "\n\n💡 Tip: Add 10-15% buffer for surprises.";
            }
            return response;
          },
        }),

        createChecklist: llm.tool({
          description: 'Create a planning checklist.',
          parameters: z.object({
            checklist: z.array(z.object({
              task: z.string(),
              deadline: z.string().optional(),
              priority: z.enum(['high', 'medium', 'low']),
            })),
            nextThreeActions: z.array(z.string()),
          }),
          execute: async ({ checklist, nextThreeActions }) => {
            const high = checklist.filter(c => c.priority === 'high');
            const medium = checklist.filter(c => c.priority === 'medium');
            
            let response = `📋 Checklist:\n\n🔴 High priority:\n${high.map(c => `- ${c.task}${c.deadline ? ` (by ${c.deadline})` : ''}`).join('\n')}`;
            if (medium.length > 0) {
              response += `\n\n🟡 Medium priority:\n${medium.map(c => `- ${c.task}`).join('\n')}`;
            }
            response += `\n\n👉 Next 3 actions:\n${nextThreeActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
            return response;
          },
        }),

        completeEventPlan: llm.tool({
          description: 'Complete the event planning session.',
          parameters: z.object({
            eventName: z.string(),
            eventType: z.string(),
            date: z.string().optional(),
            venue: z.string().optional(),
            guestCount: z.number(),
            budget: z.number().optional(),
            checklist: z.array(z.string()),
            nextSteps: z.array(z.string()),
            excitementLevel: z.enum(['low', 'medium', 'high']),
          }),
          execute: async ({ eventName, eventType, date, venue, guestCount, budget, checklist, nextSteps, excitementLevel }) => {
            this.complete({ eventName, eventType, date, venue, guestCount, budget, checklist, nextSteps, excitementLevel });
            return `${eventName} is taking shape! You've got a vision, a plan, and next steps. This is going to be great. 🎉`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// SPECIAL DATE REMINDER TASK
// ============================================================================

export interface SpecialDateResult {
  dateName: string;
  date: string;
  person?: string;
  giftIdeas: string[];
  celebrationIdeas: string[];
  reminderSet: boolean;
}

/**
 * SpecialDateTask - Remember and plan for important dates
 *
 * Birthdays, anniversaries, and the moments that matter.
 */
export class SpecialDateTask extends IntelligentTask<SpecialDateResult> {
  constructor(dateName: string, date: string) {
    super({
      instructions: {
        base: `
          Important date: "${dateName}" on ${date}
          
          Help them prepare for this special day:
          
          1. WHO is this for? What do they love?
          2. WHEN exactly? How much time do we have?
          3. GIFT ideas - thoughtful > expensive
          4. CELEBRATION ideas - what would make them feel special?
          5. REMINDER - make sure we don't forget!
          
          Thoughtful touch ideas:
          - Handwritten note
          - Photo memory book
          - Experience over stuff
          - Inside jokes/references
          - Something they mentioned wanting
          
          The best gifts show you KNOW them.
        `,
      },
      tools: {
        gatherContext: llm.tool({
          description: 'Gather context about the person and date.',
          parameters: z.object({
            person: z.string().describe('Who this is for'),
            relationship: z.string().describe('Their relationship'),
            interests: z.array(z.string()).describe('Their interests and loves'),
            lastYearCelebration: z.string().optional().describe('What they did last year'),
            budget: z.number().optional(),
          }),
          execute: async ({ person, relationship, interests, lastYearCelebration }) => {
            let response = `For ${person} (${relationship}). They love: ${interests.join(', ')}.`;
            if (lastYearCelebration) {
              response += ` Last year: ${lastYearCelebration}.`;
            }
            return response;
          },
        }),

        brainstormGifts: llm.tool({
          description: 'Brainstorm gift ideas.',
          parameters: z.object({
            giftIdeas: z.array(z.object({
              idea: z.string(),
              whyTheyLoveIt: z.string(),
              effort: z.enum(['low', 'medium', 'high']),
              cost: z.enum(['$', '$$', '$$$']),
            })),
          }),
          execute: async ({ giftIdeas }) => {
            return `Gift ideas:\n${giftIdeas.map((g, i) => `${i + 1}. ${g.idea} (${g.cost}, ${g.effort} effort) - ${g.whyTheyLoveIt}`).join('\n')}`;
          },
        }),

        brainstormCelebration: llm.tool({
          description: 'Brainstorm celebration ideas.',
          parameters: z.object({
            celebrationIdeas: z.array(z.object({
              idea: z.string(),
              whySpecial: z.string(),
            })),
            topPick: z.string(),
          }),
          execute: async ({ celebrationIdeas, topPick }) => {
            return `Celebration ideas:\n${celebrationIdeas.map((c, i) => `${i + 1}. ${c.idea} - ${c.whySpecial}`).join('\n')}\n\nTop pick: ${topPick}`;
          },
        }),

        completeSpecialDate: llm.tool({
          description: 'Complete the special date planning.',
          parameters: z.object({
            dateName: z.string(),
            date: z.string(),
            person: z.string().optional(),
            giftIdeas: z.array(z.string()),
            celebrationIdeas: z.array(z.string()),
            reminderSet: z.boolean(),
          }),
          execute: async ({ dateName, date, person, giftIdeas, celebrationIdeas, reminderSet }) => {
            this.complete({ dateName, date, person, giftIdeas, celebrationIdeas, reminderSet });
            
            if (reminderSet) {
              return `${dateName} is marked! I'll remind you when it's coming up. ${person ? `${person} is lucky to have someone who plans ahead.` : ''}`;
            }
            return `You've got ideas for ${dateName}. Don't forget to put a reminder in your calendar!`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// TRAVEL PLANNING TASK
// ============================================================================

export interface TravelPlanningResult {
  destination: string;
  dates: string;
  tripType: 'relaxation' | 'adventure' | 'cultural' | 'mixed';
  activities: string[];
  accommodationType: string;
  budget?: number;
  mustDo: string[];
  bookingStatus: 'not_started' | 'partial' | 'complete';
}

/**
 * TravelPlanningTask - Plan a trip
 *
 * Dream destinations and realistic logistics.
 */
export class TravelPlanningTask extends IntelligentTask<TravelPlanningResult> {
  constructor(destination: string) {
    super({
      instructions: {
        base: `
          They want to travel to: "${destination}"
          
          Help them plan an amazing trip:
          
          1. WHEN: Dates, duration, flexibility?
          2. WHY: What kind of trip? (Relaxation, adventure, culture?)
          3. WHO: Solo, couple, family, friends?
          4. STAY: Hotel, Airbnb, hostel, resort?
          5. DO: Must-do experiences vs. nice-to-have
          6. BUDGET: Total and breakdown
          
          Travel wisdom:
          - Leave room for spontaneity
          - One "big thing" per day max
          - Travel days aren't activity days
          - Local recommendations > TripAdvisor
          - The unexpected makes the best stories
          
          Help them dream AND plan practically.
        `,
        ifHappy: `
          They're excited about this trip! Feed the excitement.
          Help them imagine the experience, then figure out logistics.
        `,
      },
      tools: {
        captureVision: llm.tool({
          description: 'Capture their trip vision.',
          parameters: z.object({
            dates: z.string().describe('Travel dates'),
            duration: z.string().describe('Trip length'),
            tripType: z.enum(['relaxation', 'adventure', 'cultural', 'mixed']),
            travelCompanions: z.string().describe('Who they\'re traveling with'),
            vibe: z.string().describe('The feeling they want from this trip'),
          }),
          execute: async ({ dates, duration, tripType, travelCompanions, vibe }) => {
            return `${duration} trip (${dates}), ${tripType} style, with ${travelCompanions}. Looking for: ${vibe}. Sounds amazing!`;
          },
        }),

        planAccommodation: llm.tool({
          description: 'Discuss accommodation options.',
          parameters: z.object({
            accommodationType: z.string().describe('Type of accommodation'),
            location: z.string().describe('Where to stay'),
            priorities: z.array(z.string()).describe('What matters most'),
            budget: z.number().optional(),
          }),
          execute: async ({ accommodationType, location, priorities, budget }) => {
            let response = `Stay: ${accommodationType} in ${location}. Priorities: ${priorities.join(', ')}.`;
            if (budget) {
              response += ` Budget: ~$${budget}/night.`;
            }
            return response;
          },
        }),

        planActivities: llm.tool({
          description: 'Plan activities and experiences.',
          parameters: z.object({
            mustDo: z.array(z.string()).describe('Can\'t miss experiences'),
            maybeActivities: z.array(z.string()).describe('If there\'s time'),
            restDays: z.boolean().describe('Building in downtime?'),
          }),
          execute: async ({ mustDo, maybeActivities, restDays }) => {
            let response = `Must-do:\n${mustDo.map(a => `✓ ${a}`).join('\n')}`;
            if (maybeActivities.length > 0) {
              response += `\n\nMaybe:\n${maybeActivities.map(a => `○ ${a}`).join('\n')}`;
            }
            if (!restDays) {
              response += "\n\n💡 Remember to leave some unplanned time. The best travel moments are often unscripted.";
            }
            return response;
          },
        }),

        completeTravelPlan: llm.tool({
          description: 'Complete the travel planning session.',
          parameters: z.object({
            destination: z.string(),
            dates: z.string(),
            tripType: z.enum(['relaxation', 'adventure', 'cultural', 'mixed']),
            activities: z.array(z.string()),
            accommodationType: z.string(),
            budget: z.number().optional(),
            mustDo: z.array(z.string()),
            bookingStatus: z.enum(['not_started', 'partial', 'complete']),
          }),
          execute: async ({ destination, dates, tripType, activities, accommodationType, budget, mustDo, bookingStatus }) => {
            this.complete({ destination, dates, tripType, activities, accommodationType, budget, mustDo, bookingStatus });
            
            if (bookingStatus === 'complete') {
              return `${destination} is booked! Now the fun part - looking forward to it. Start a packing list a week before!`;
            }
            return `Your ${destination} trip is taking shape. ${bookingStatus === 'not_started' ? 'Time to start booking!' : 'A few more things to book.'} This is going to be great. ✈️`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// LIFE MILESTONE TASK
// ============================================================================

export interface LifeMilestoneResult {
  milestone: string;
  significance: string;
  celebrationPlan?: string;
  documentationPlan?: string;
  peopleToShare: string[];
  reflection: string;
  acknowledged: boolean;
}

/**
 * LifeMilestoneTask - Acknowledge and celebrate life milestones
 *
 * The big moments deserve recognition.
 */
export class LifeMilestoneTask extends IntelligentTask<LifeMilestoneResult> {
  constructor(milestone: string) {
    super({
      instructions: {
        base: `
          Life milestone: "${milestone}"
          
          This deserves acknowledgment!
          
          Help them:
          1. RECOGNIZE the significance - What does this mean to you?
          2. CELEBRATE appropriately - How do you want to mark it?
          3. DOCUMENT - Will you want to remember this moment?
          4. SHARE - Who should know about this?
          5. REFLECT - What did it take to get here?
          
          Milestones worth celebrating:
          - Graduations, promotions, retirements
          - Recovery milestones
          - Relationship anniversaries
          - Personal breakthroughs
          - First times and last times
          - Surviving hard things
          
          Sometimes the celebration is quiet. That's okay.
        `,
        ifHappy: `
          They're proud/excited! Celebrate with them fully.
          Help them savor this moment.
        `,
        ifDistressed: `
          Some milestones are bittersweet. Acknowledge both feelings.
          Endings can be both sad and worthy of honoring.
        `,
      },
      tools: {
        acknowledgeSignificance: llm.tool({
          description: 'Acknowledge the significance of the milestone.',
          parameters: z.object({
            milestone: z.string(),
            whatItMeans: z.string().describe('What this represents'),
            howTheyGotHere: z.string().describe('The journey to this point'),
            emotions: z.array(z.string()).describe('Emotions they\'re feeling'),
          }),
          execute: async ({ milestone, whatItMeans, howTheyGotHere, emotions }) => {
            return `${milestone}. This represents: ${whatItMeans}.\n\nHow you got here: ${howTheyGotHere}.\n\nYou're feeling: ${emotions.join(', ')}. All of that is valid.`;
          },
        }),

        planCelebration: llm.tool({
          description: 'Plan how to celebrate.',
          parameters: z.object({
            celebrationIdea: z.string(),
            solo: z.boolean().describe('Solo or with others'),
            timing: z.string(),
            scale: z.enum(['quiet', 'small', 'big']),
          }),
          execute: async ({ celebrationIdea, solo, timing, scale }) => {
            return `Celebration: ${celebrationIdea} (${scale}${solo ? ', just you' : ', with people'}) - ${timing}. Perfect.`;
          },
        }),

        planDocumentation: llm.tool({
          description: 'Plan how to document/remember this moment.',
          parameters: z.object({
            documentationIdea: z.string().describe('How to capture it'),
            whyMatters: z.string().describe('Why documenting matters'),
          }),
          execute: async ({ documentationIdea, whyMatters }) => {
            return `To remember this: ${documentationIdea}. ${whyMatters}`;
          },
        }),

        completeMilestone: llm.tool({
          description: 'Complete the milestone acknowledgment.',
          parameters: z.object({
            milestone: z.string(),
            significance: z.string(),
            celebrationPlan: z.string().optional(),
            documentationPlan: z.string().optional(),
            peopleToShare: z.array(z.string()),
            reflection: z.string(),
            acknowledged: z.boolean(),
          }),
          execute: async ({ milestone, significance, celebrationPlan, documentationPlan, peopleToShare, reflection, acknowledged }) => {
            this.complete({ milestone, significance, celebrationPlan, documentationPlan, peopleToShare, reflection, acknowledged });
            return `${milestone} - acknowledged and honored. These moments matter. You did something worth marking. 🌟`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EventPlanningTask,
  SpecialDateTask,
  TravelPlanningTask,
  LifeMilestoneTask,
};

