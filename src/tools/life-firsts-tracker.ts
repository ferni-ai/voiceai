/**
 * Life's Firsts Tracker - Jordan's Core Milestone System
 *
 * Tracks and celebrates all of life's major firsts:
 * - First home, first baby, first wedding
 * - Milestone birthdays, graduations, retirements
 * - Cultural celebrations and coming-of-age moments
 *
 * Jordan is the coordinator of "life's firsts" - making sure
 * every major milestone is planned, celebrated, and remembered.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  getLifeDataStore,
  type LifeMilestone as StoredMilestone,
} from '../services/life-data-store.js';
import { sanitizePlainText, parseAmount, isValidAmount } from './validation.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_NOTES_LENGTH = 5000;
const MAX_BUDGET = 10_000_000;

function validateMilestoneName(name: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Milestone name is required' };
  }
  const sanitized = sanitizePlainText(name, MAX_NAME_LENGTH);
  if (sanitized.length < 2) {
    return { valid: false, error: 'Milestone name must be at least 2 characters' };
  }
  return { valid: true, sanitized };
}

function validateDescription(desc: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (!desc) {
    return { valid: true, sanitized: '' };
  }
  if (typeof desc !== 'string') {
    return { valid: false, error: 'Description must be a string' };
  }
  return { valid: true, sanitized: sanitizePlainText(desc, MAX_DESCRIPTION_LENGTH) };
}

function validateBudget(budget: unknown): { valid: boolean; sanitized?: number; error?: string } {
  if (budget === undefined || budget === null) {
    return { valid: true }; // Optional
  }
  const parsed = parseAmount(budget as string | number);
  if (parsed === null || !isValidAmount(parsed, 0, MAX_BUDGET)) {
    return {
      valid: false,
      error: `Invalid budget: must be between $0 and $${MAX_BUDGET.toLocaleString()}`,
    };
  }
  return { valid: true, sanitized: parsed };
}

function validateTargetDate(date: unknown): { valid: boolean; sanitized?: Date; error?: string } {
  if (!date) {
    return { valid: true }; // Optional
  }
  try {
    const parsed = new Date(date as string);
    if (isNaN(parsed.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }
    return { valid: true, sanitized: parsed };
  } catch {
    return { valid: false, error: 'Invalid date format' };
  }
}

// ============================================================================
// MILESTONE TYPES
// ============================================================================

export type MilestoneCategory =
  | 'first-home'
  | 'first-baby'
  | 'wedding'
  | 'engagement'
  | 'graduation'
  | 'milestone-birthday'
  | 'retirement'
  | 'first-job'
  | 'first-car'
  | 'first-pet'
  | 'first-solo-trip'
  | 'college-sendoff'
  | 'coming-of-age'
  | 'anniversary'
  | 'memorial'
  | 'other';

export type CulturalCelebration =
  | 'quinceanera'
  | 'bar-mitzvah'
  | 'bat-mitzvah'
  | 'sweet-sixteen'
  | 'debutante'
  | 'first-communion'
  | 'confirmation'
  | 'graduation-party'
  | 'housewarming'
  | 'baby-shower'
  | 'bridal-shower'
  | 'bachelor-party'
  | 'bachelorette-party'
  | 'engagement-party'
  | 'rehearsal-dinner'
  | 'retirement-party'
  | 'other';

export interface LifeMilestone {
  id: string;
  userId: string;
  category: MilestoneCategory;
  culturalType?: CulturalCelebration;
  name: string;
  description: string;
  targetDate?: Date;
  completedDate?: Date;
  status: 'planning' | 'upcoming' | 'in-progress' | 'completed' | 'celebrated';

  // Planning details
  budget?: number;
  spent?: number;
  guestCount?: number;
  location?: string;

  // Checklist and progress
  checklist: MilestoneChecklistItem[];
  notes: string[];
  memories: MilestoneMemory[];

  // Related events
  relatedEvents: string[]; // Event IDs from jordan-tools

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface MilestoneChecklistItem {
  id: string;
  task: string;
  category: string;
  dueDate?: Date;
  completed: boolean;
  notes?: string;
}

export interface MilestoneMemory {
  id: string;
  type: 'note' | 'highlight' | 'lesson-learned' | 'thank-you';
  content: string;
  createdAt: Date;
}

// ============================================================================
// MILESTONE TEMPLATES - Predefined checklists for each "first"
// ============================================================================

export const MILESTONE_TEMPLATES: Record<
  MilestoneCategory,
  {
    name: string;
    description: string;
    defaultChecklist: Array<Omit<MilestoneChecklistItem, 'id'>>;
    tips: string[];
    typicalTimeline: string;
    budgetRange: { low: number; mid: number; high: number };
  }
> = {
  'first-home': {
    name: 'First Home',
    description: 'The journey to your first home - from house hunting to housewarming',
    defaultChecklist: [
      { task: 'Get pre-approved for mortgage', category: 'finance', completed: false },
      { task: 'Define must-haves vs nice-to-haves', category: 'planning', completed: false },
      { task: 'Research neighborhoods', category: 'research', completed: false },
      { task: 'Find a real estate agent', category: 'team', completed: false },
      { task: 'Start house hunting', category: 'search', completed: false },
      { task: 'Make an offer', category: 'purchase', completed: false },
      { task: 'Home inspection', category: 'purchase', completed: false },
      { task: 'Final walkthrough', category: 'purchase', completed: false },
      { task: 'Close on the house', category: 'purchase', completed: false },
      { task: 'Plan the move', category: 'moving', completed: false },
      { task: 'Change address everywhere', category: 'admin', completed: false },
      { task: 'Set up utilities', category: 'admin', completed: false },
      { task: 'Plan housewarming party', category: 'celebration', completed: false },
    ],
    tips: [
      'Keep housing costs below 28% of gross income',
      'Have 6 months expenses saved BEYOND your down payment',
      'Get pre-approved before you fall in love with a house',
      "Don't skip the home inspection - ever",
    ],
    typicalTimeline: '3-6 months',
    budgetRange: { low: 5000, mid: 15000, high: 50000 }, // Moving/closing costs
  },

  'first-baby': {
    name: 'First Baby',
    description: 'Preparing for your newest family member',
    defaultChecklist: [
      { task: 'Choose a healthcare provider/OB', category: 'health', completed: false },
      { task: 'Start prenatal vitamins', category: 'health', completed: false },
      { task: 'Plan the baby shower', category: 'celebration', completed: false },
      { task: 'Create baby registry', category: 'planning', completed: false },
      { task: 'Set up nursery', category: 'preparation', completed: false },
      { task: 'Choose a pediatrician', category: 'health', completed: false },
      { task: 'Take childbirth class', category: 'education', completed: false },
      { task: 'Pack hospital bag', category: 'preparation', completed: false },
      { task: 'Install car seat', category: 'safety', completed: false },
      { task: 'Childproof the home', category: 'safety', completed: false },
      { task: 'Set up parental leave', category: 'work', completed: false },
      { task: 'Stock up on essentials', category: 'supplies', completed: false },
      { task: 'Plan meal prep/help schedule', category: 'support', completed: false },
    ],
    tips: [
      "You don't need everything on day one - babies need very little at first",
      'Accept help when offered',
      'Sleep when the baby sleeps (really!)',
      'Second-hand items are perfectly fine for most things',
    ],
    typicalTimeline: '9 months',
    budgetRange: { low: 2000, mid: 8000, high: 20000 },
  },

  wedding: {
    name: 'Wedding',
    description: 'Planning your big day from engagement to "I do"',
    defaultChecklist: [
      { task: 'Set the budget', category: 'finance', completed: false },
      { task: 'Choose a date', category: 'planning', completed: false },
      { task: 'Book the venue', category: 'venue', completed: false },
      { task: 'Send save-the-dates', category: 'guests', completed: false },
      { task: 'Choose wedding party', category: 'people', completed: false },
      { task: 'Book photographer/videographer', category: 'vendors', completed: false },
      { task: 'Book caterer', category: 'vendors', completed: false },
      { task: 'Choose officiant', category: 'ceremony', completed: false },
      { task: 'Find attire (dress/suit)', category: 'attire', completed: false },
      { task: 'Plan ceremony details', category: 'ceremony', completed: false },
      { task: 'Create registry', category: 'gifts', completed: false },
      { task: 'Send invitations', category: 'guests', completed: false },
      { task: 'Book honeymoon', category: 'travel', completed: false },
      { task: 'Final fittings', category: 'attire', completed: false },
      { task: 'Rehearsal dinner', category: 'events', completed: false },
      { task: 'Marriage license', category: 'legal', completed: false },
    ],
    tips: [
      'Book venue and photographer first - they fill up fastest',
      'Fridays and Sundays are often cheaper than Saturdays',
      'Have a rain/backup plan for outdoor weddings',
      'The best weddings are about the couple, not the Pinterest board',
    ],
    typicalTimeline: '12-18 months',
    budgetRange: { low: 5000, mid: 30000, high: 100000 },
  },

  engagement: {
    name: 'Engagement',
    description: 'Planning the perfect proposal',
    defaultChecklist: [
      { task: 'Determine ring style preferences', category: 'ring', completed: false },
      { task: 'Set ring budget', category: 'finance', completed: false },
      { task: 'Shop for ring', category: 'ring', completed: false },
      { task: 'Plan the proposal location', category: 'planning', completed: false },
      { task: 'Arrange proposal logistics', category: 'logistics', completed: false },
      { task: 'Consider photographer for moment', category: 'memory', completed: false },
      { task: 'Plan post-proposal celebration', category: 'celebration', completed: false },
      { task: 'Think about who to tell first', category: 'announcement', completed: false },
    ],
    tips: [
      'Pay attention to hints about ring preferences',
      'The proposal should reflect your relationship, not social media trends',
      'Have the ring insured immediately',
      'The element of surprise matters less than the sincerity',
    ],
    typicalTimeline: '1-3 months planning',
    budgetRange: { low: 1000, mid: 5000, high: 20000 },
  },

  graduation: {
    name: 'Graduation',
    description: 'Celebrating academic achievement',
    defaultChecklist: [
      { task: 'Order cap and gown', category: 'attire', completed: false },
      { task: 'Send graduation announcements', category: 'announcements', completed: false },
      { task: 'Plan graduation party', category: 'celebration', completed: false },
      { task: 'Create guest list', category: 'guests', completed: false },
      { task: 'Book venue/reserve backyard', category: 'venue', completed: false },
      { task: 'Order party supplies', category: 'supplies', completed: false },
      { task: 'Plan catering/food', category: 'food', completed: false },
      { task: 'Create photo slideshow', category: 'memories', completed: false },
      { task: 'Thank-you cards', category: 'etiquette', completed: false },
    ],
    tips: [
      'Order announcements early - they take time to print and mail',
      'A simple party with good food beats an elaborate one with stress',
      'Capture the moments - hire a photographer or designate someone',
      'Write thank-you notes promptly',
    ],
    typicalTimeline: '2-3 months',
    budgetRange: { low: 500, mid: 2000, high: 10000 },
  },

  'milestone-birthday': {
    name: 'Milestone Birthday',
    description: 'Celebrating the big ones - 1, 16, 18, 21, 30, 40, 50, 60+',
    defaultChecklist: [
      { task: 'Choose party style/theme', category: 'planning', completed: false },
      { task: 'Create guest list', category: 'guests', completed: false },
      { task: 'Book venue', category: 'venue', completed: false },
      { task: 'Send invitations', category: 'invites', completed: false },
      { task: 'Plan menu/catering', category: 'food', completed: false },
      { task: 'Order cake', category: 'food', completed: false },
      { task: 'Plan decorations', category: 'decor', completed: false },
      { task: 'Arrange entertainment', category: 'entertainment', completed: false },
      { task: 'Plan speeches/toasts', category: 'program', completed: false },
      { task: 'Create memory book/slideshow', category: 'memories', completed: false },
    ],
    tips: [
      'Milestone birthdays deserve recognition - make them feel special',
      'Collect memories and messages from friends and family',
      "Consider a surprise element if they'd enjoy it",
      "It's not about age - it's about celebrating the person",
    ],
    typicalTimeline: '1-2 months',
    budgetRange: { low: 300, mid: 1500, high: 10000 },
  },

  retirement: {
    name: 'Retirement',
    description: 'Celebrating a career and launching the next chapter',
    defaultChecklist: [
      { task: 'Plan retirement party', category: 'celebration', completed: false },
      {
        task: 'Create guest list (colleagues, friends, family)',
        category: 'guests',
        completed: false,
      },
      { task: 'Gather career highlights/stories', category: 'memories', completed: false },
      { task: 'Plan speeches and recognition', category: 'program', completed: false },
      { task: 'Create memory book from coworkers', category: 'gifts', completed: false },
      { task: 'Plan gift or group contribution', category: 'gifts', completed: false },
      { task: 'Book venue', category: 'venue', completed: false },
      { task: 'Plan "next chapter" celebration element', category: 'future', completed: false },
    ],
    tips: [
      'Focus on celebrating achievements, not "getting old"',
      "Include plans for what's next - retirement is a beginning",
      'Collect written memories from colleagues',
      'Make it personal - generic retirement parties are forgettable',
    ],
    typicalTimeline: '1-2 months',
    budgetRange: { low: 500, mid: 2000, high: 8000 },
  },

  'first-job': {
    name: 'First Job',
    description: 'Celebrating the start of a career',
    defaultChecklist: [
      { task: 'Plan celebration dinner', category: 'celebration', completed: false },
      { task: 'Set up professional wardrobe', category: 'preparation', completed: false },
      { task: 'Prepare first day logistics', category: 'logistics', completed: false },
      { task: 'Set up 401k/benefits', category: 'finance', completed: false },
      { task: 'Create budget with new income', category: 'finance', completed: false },
    ],
    tips: [
      'This is a big deal - celebrate it!',
      'Start retirement savings from day one, even small amounts',
      'First impressions matter - be prepared and professional',
    ],
    typicalTimeline: '1-2 weeks',
    budgetRange: { low: 100, mid: 500, high: 2000 },
  },

  'first-car': {
    name: 'First Car',
    description: 'The freedom of your first wheels',
    defaultChecklist: [
      { task: 'Set budget', category: 'finance', completed: false },
      { task: 'Research options', category: 'research', completed: false },
      { task: 'Check insurance costs', category: 'finance', completed: false },
      { task: 'Get pre-approved for loan (if needed)', category: 'finance', completed: false },
      { task: 'Test drive at least 3 cars', category: 'shopping', completed: false },
      { task: 'Get vehicle history report (used)', category: 'research', completed: false },
      { task: 'Negotiate price', category: 'purchase', completed: false },
      { task: 'Complete purchase', category: 'purchase', completed: false },
      { task: 'Get insurance', category: 'admin', completed: false },
      { task: 'Register vehicle', category: 'admin', completed: false },
    ],
    tips: [
      'Best times to buy: end of month, end of quarter, end of model year',
      'Never pay sticker price',
      'Total cost of ownership matters more than purchase price',
      "Test drive in conditions you'll actually drive in",
    ],
    typicalTimeline: '2-4 weeks',
    budgetRange: { low: 5000, mid: 20000, high: 50000 },
  },

  'first-pet': {
    name: 'First Pet',
    description: 'Welcoming a furry (or scaly) family member',
    defaultChecklist: [
      { task: 'Research pet types and breeds', category: 'research', completed: false },
      { task: 'Evaluate lifestyle compatibility', category: 'planning', completed: false },
      { task: 'Budget for ongoing costs', category: 'finance', completed: false },
      { task: 'Pet-proof your home', category: 'preparation', completed: false },
      { task: 'Buy essential supplies', category: 'supplies', completed: false },
      { task: 'Find a veterinarian', category: 'health', completed: false },
      { task: 'Schedule first vet visit', category: 'health', completed: false },
      { task: 'Plan training approach', category: 'training', completed: false },
    ],
    tips: [
      "Adopt, don't shop - shelters have amazing pets",
      'Budget for unexpected vet bills',
      'Pets are 10-15 year commitments',
      'The first week is an adjustment - be patient',
    ],
    typicalTimeline: '1-4 weeks',
    budgetRange: { low: 300, mid: 1000, high: 3000 },
  },

  'first-solo-trip': {
    name: 'First Solo Trip',
    description: 'Your first adventure on your own',
    defaultChecklist: [
      { task: 'Choose destination', category: 'planning', completed: false },
      { task: 'Research safety considerations', category: 'safety', completed: false },
      { task: 'Book flights', category: 'travel', completed: false },
      { task: 'Book accommodations', category: 'travel', completed: false },
      { task: 'Plan itinerary (but stay flexible)', category: 'planning', completed: false },
      { task: 'Share itinerary with someone at home', category: 'safety', completed: false },
      { task: 'Get travel insurance', category: 'admin', completed: false },
      { task: 'Download offline maps', category: 'preparation', completed: false },
      { task: 'Pack light', category: 'packing', completed: false },
    ],
    tips: [
      'Start with somewhere relatively easy for your first solo trip',
      'Stay in social accommodations (hostels, Airbnb) if you want to meet people',
      'Trust your instincts about safety',
      'Solo travel is the best way to learn about yourself',
    ],
    typicalTimeline: '2-3 months',
    budgetRange: { low: 1000, mid: 3000, high: 10000 },
  },

  'college-sendoff': {
    name: 'College Send-off',
    description: 'Launching your child into their college adventure',
    defaultChecklist: [
      { task: 'Plan going-away party', category: 'celebration', completed: false },
      { task: 'Create dorm shopping list', category: 'supplies', completed: false },
      { task: 'Shop for dorm essentials', category: 'shopping', completed: false },
      { task: 'Set up banking/finances', category: 'finance', completed: false },
      { task: 'Plan move-in day', category: 'logistics', completed: false },
      { task: 'Create first care package', category: 'support', completed: false },
      { task: 'Establish communication expectations', category: 'family', completed: false },
      {
        task: 'Have "the talks" (health, safety, finances)',
        category: 'preparation',
        completed: false,
      },
    ],
    tips: [
      'Let them make decisions - this is their space',
      'Move-in day is emotional - bring tissues',
      'Set up regular check-in times',
      'Care packages are always appreciated',
    ],
    typicalTimeline: '2-3 months',
    budgetRange: { low: 500, mid: 2000, high: 5000 },
  },

  'coming-of-age': {
    name: 'Coming of Age Celebration',
    description: 'Cultural celebrations marking the transition to adulthood',
    defaultChecklist: [
      { task: 'Set date and reserve venue', category: 'venue', completed: false },
      { task: 'Book officiant/religious leader', category: 'ceremony', completed: false },
      { task: 'Plan ceremony details', category: 'ceremony', completed: false },
      { task: 'Send invitations', category: 'guests', completed: false },
      { task: 'Arrange attire', category: 'attire', completed: false },
      { task: 'Book catering', category: 'food', completed: false },
      { task: 'Plan entertainment', category: 'entertainment', completed: false },
      { task: 'Arrange photography/videography', category: 'memories', completed: false },
      { task: 'Plan party favors', category: 'details', completed: false },
    ],
    tips: [
      'Honor traditions while making it personal',
      'This is about the young person - involve them in decisions',
      'Start planning early - popular venues book quickly',
      'Balance religious/cultural elements with celebration',
    ],
    typicalTimeline: '6-12 months',
    budgetRange: { low: 3000, mid: 15000, high: 50000 },
  },

  anniversary: {
    name: 'Anniversary',
    description: 'Celebrating years together',
    defaultChecklist: [
      { task: 'Choose celebration style', category: 'planning', completed: false },
      { task: 'Make reservations', category: 'booking', completed: false },
      { task: 'Plan surprise element (if applicable)', category: 'surprise', completed: false },
      { task: 'Choose meaningful gift', category: 'gifts', completed: false },
      { task: 'Arrange childcare (if needed)', category: 'logistics', completed: false },
      { task: 'Create/gather memory items', category: 'memories', completed: false },
    ],
    tips: [
      'Big milestones (10, 25, 50) deserve big celebrations',
      'Recreating first date elements is always romantic',
      'Sometimes the best gift is dedicated time together',
    ],
    typicalTimeline: '2-4 weeks',
    budgetRange: { low: 100, mid: 500, high: 5000 },
  },

  memorial: {
    name: 'Memorial/Celebration of Life',
    description: 'Honoring and remembering someone special',
    defaultChecklist: [
      { task: 'Gather photos and memories', category: 'memories', completed: false },
      { task: 'Choose venue', category: 'venue', completed: false },
      { task: 'Plan order of service', category: 'ceremony', completed: false },
      { task: 'Invite speakers', category: 'program', completed: false },
      { task: 'Arrange catering', category: 'food', completed: false },
      { task: 'Create memory display', category: 'memories', completed: false },
      { task: 'Plan music/readings', category: 'ceremony', completed: false },
      { task: 'Arrange flowers', category: 'decor', completed: false },
    ],
    tips: [
      'Focus on celebrating their life, not just mourning',
      'Include their personality - humor if they were funny',
      "Delegate tasks - you don't have to do everything",
      "It's okay to not be okay",
    ],
    typicalTimeline: '1-2 weeks',
    budgetRange: { low: 500, mid: 3000, high: 15000 },
  },

  other: {
    name: 'Custom Milestone',
    description: 'Your unique life moment',
    defaultChecklist: [
      { task: 'Define what makes this special', category: 'planning', completed: false },
      { task: 'Set a celebration date', category: 'planning', completed: false },
      { task: 'Plan how to mark the occasion', category: 'celebration', completed: false },
    ],
    tips: [
      'Every milestone deserves recognition',
      'Make it personal to you',
      'Document the moment',
    ],
    typicalTimeline: 'Varies',
    budgetRange: { low: 0, mid: 500, high: 5000 },
  },
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const milestones = new Map<string, LifeMilestone>();
const userMilestones = new Map<string, string[]>(); // userId -> milestone IDs

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getDaysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export async function createMilestone(
  userId: string,
  category: MilestoneCategory,
  name: string,
  targetDate?: Date,
  budget?: number,
  culturalType?: CulturalCelebration
): Promise<LifeMilestone> {
  // Validate inputs
  const nameValidation = validateMilestoneName(name);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error);
  }

  const budgetValidation = validateBudget(budget);
  if (!budgetValidation.valid) {
    throw new Error(budgetValidation.error);
  }

  const sanitizedName = nameValidation.sanitized!;
  const sanitizedBudget = budgetValidation.sanitized;

  const template = MILESTONE_TEMPLATES[category];
  const id = generateId('milestone');

  const milestone: LifeMilestone = {
    id,
    userId,
    category,
    culturalType,
    name: sanitizedName,
    description: template.description,
    targetDate,
    status: 'planning',
    budget: sanitizedBudget,
    checklist: template.defaultChecklist.map((item, index) => ({
      ...item,
      id: `check_${index}`,
    })),
    notes: [],
    memories: [],
    relatedEvents: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to in-memory cache
  milestones.set(id, milestone);
  const userMilestoneList = userMilestones.get(userId) || [];
  userMilestoneList.push(id);
  userMilestones.set(userId, userMilestoneList);

  // Persist to LifeDataStore
  try {
    const store = getLifeDataStore();
    await store.saveMilestone(userId, milestone as unknown as StoredMilestone);
  } catch (error) {
    getLogger().warn({ error, milestoneId: id }, 'Failed to persist milestone to store');
  }

  getLogger().info({ milestoneId: id, category, name }, '🎯 Life milestone created');

  return milestone;
}

export function getMilestone(id: string): LifeMilestone | undefined {
  return milestones.get(id);
}

export async function getUserMilestones(userId: string): Promise<LifeMilestone[]> {
  // Check cache first
  const cachedIds = userMilestones.get(userId) || [];
  if (cachedIds.length > 0) {
    return cachedIds.map((id) => milestones.get(id)).filter(Boolean) as LifeMilestone[];
  }

  // Try to load from persistent store
  try {
    const store = getLifeDataStore();
    const stored = await store.getMilestones(userId);
    if (stored.length > 0) {
      // Populate cache
      const ids: string[] = [];
      for (const m of stored) {
        milestones.set(m.id, m as unknown as LifeMilestone);
        ids.push(m.id);
      }
      userMilestones.set(userId, ids);
      return stored as unknown as LifeMilestone[];
    }
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load milestones from store');
  }

  const ids = userMilestones.get(userId) || [];
  return ids.map((id) => milestones.get(id)).filter(Boolean) as LifeMilestone[];
}

export function updateMilestoneChecklist(
  milestoneId: string,
  taskId: string,
  completed: boolean
): LifeMilestone | undefined {
  const milestone = milestones.get(milestoneId);
  if (!milestone) return undefined;

  const task = milestone.checklist.find((t) => t.id === taskId);
  if (task) {
    task.completed = completed;
    milestone.updatedAt = new Date();
    milestones.set(milestoneId, milestone);
  }

  return milestone;
}

export function addMilestoneMemory(
  milestoneId: string,
  type: MilestoneMemory['type'],
  content: string
): LifeMilestone | undefined {
  const milestone = milestones.get(milestoneId);
  if (!milestone) return undefined;

  milestone.memories.push({
    id: `memory_${Date.now()}`,
    type,
    content,
    createdAt: new Date(),
  });
  milestone.updatedAt = new Date();
  milestones.set(milestoneId, milestone);

  return milestone;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createLifeFirstsTools() {
  return {
    // ========== CREATE MILESTONE ==========
    createLifeMilestone: llm.tool({
      description: `Create a new life milestone to track and celebrate.
Use when someone mentions a major "first" or life event:
- First home, first baby, wedding, engagement
- Graduation, milestone birthday, retirement
- First car, first pet, first solo trip
- Coming-of-age celebrations`,
      parameters: z.object({
        category: z
          .enum([
            'first-home',
            'first-baby',
            'wedding',
            'engagement',
            'graduation',
            'milestone-birthday',
            'retirement',
            'first-job',
            'first-car',
            'first-pet',
            'first-solo-trip',
            'college-sendoff',
            'coming-of-age',
            'anniversary',
            'memorial',
            'other',
          ])
          .describe('Type of milestone'),
        name: z
          .string()
          .describe('Personalized name (e.g., "Our Wedding", "Emma\'s First Birthday")'),
        targetDate: z
          .string()
          .optional()
          .describe('When is this happening? (e.g., "June 15, 2025")'),
        budget: z.number().optional().describe('Total budget for this milestone'),
        culturalType: z
          .enum([
            'quinceanera',
            'bar-mitzvah',
            'bat-mitzvah',
            'sweet-sixteen',
            'debutante',
            'first-communion',
            'confirmation',
            'graduation-party',
            'housewarming',
            'baby-shower',
            'bridal-shower',
            'bachelor-party',
            'bachelorette-party',
            'engagement-party',
            'rehearsal-dinner',
            'retirement-party',
            'other',
          ])
          .optional()
          .describe('Cultural celebration type if applicable'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ category, name, targetDate, budget, culturalType, userId }) => {
        const parsedDate = targetDate ? new Date(targetDate) : undefined;

        const milestone = await createMilestone(
          userId,
          category,
          name,
          parsedDate,
          budget,
          culturalType
        );
        const template = MILESTONE_TEMPLATES[category];

        let response = `🎉 **Life Milestone Created: ${name}**\n\n`;

        if (parsedDate) {
          const daysUntil = getDaysUntil(parsedDate);
          response += `📅 **Target Date:** ${formatDate(parsedDate)} (${daysUntil} days away)\n`;
        }

        if (budget) {
          response += `💰 **Budget:** $${budget.toLocaleString()}\n`;
        }

        response += `\n**What This Involves:**\n`;
        response += `${template.description}\n\n`;

        response += `**Typical Timeline:** ${template.typicalTimeline}\n\n`;

        response += `**Your Checklist (${milestone.checklist.length} items):**\n`;
        const topTasks = milestone.checklist.slice(0, 5);
        topTasks.forEach((task) => {
          response += `☐ ${task.task}\n`;
        });
        if (milestone.checklist.length > 5) {
          response += `... and ${milestone.checklist.length - 5} more items\n`;
        }

        response += `\n**Pro Tips:**\n`;
        template.tips.slice(0, 3).forEach((tip) => {
          response += `💡 ${tip}\n`;
        });

        response += `\nThis is going to be amazing! What should we tackle first?`;

        return response;
      },
    }),

    // ========== VIEW MILESTONES ==========
    viewLifeMilestones: llm.tool({
      description: `View all life milestones being tracked.
Use when someone asks about their upcoming milestones, life events, or wants an overview.`,
      parameters: z.object({
        status: z
          .enum(['all', 'planning', 'upcoming', 'completed'])
          .optional()
          .describe('Filter by status'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ status = 'all', userId }) => {
        let allMilestones = await getUserMilestones(userId);

        if (status !== 'all') {
          allMilestones = allMilestones.filter((m) => m.status === status);
        }

        if (allMilestones.length === 0) {
          return `No milestones found! Ready to start tracking life's firsts? What's coming up?`;
        }

        let response = `🎯 **Your Life Milestones**\n\n`;

        for (const milestone of allMilestones) {
          const completedTasks = milestone.checklist.filter((t) => t.completed).length;
          const totalTasks = milestone.checklist.length;
          const progress = Math.round((completedTasks / totalTasks) * 100);

          response += `**${milestone.name}**\n`;
          if (milestone.targetDate) {
            const daysUntil = getDaysUntil(milestone.targetDate);
            response += `📅 ${formatDate(milestone.targetDate)} (${daysUntil} days)\n`;
          }
          response += `📊 Progress: ${progress}% (${completedTasks}/${totalTasks} tasks)\n`;
          response += `Status: ${milestone.status}\n\n`;
        }

        return response;
      },
    }),

    // ========== UPDATE CHECKLIST ==========
    updateMilestoneTask: llm.tool({
      description: `Mark a milestone checklist task as complete or incomplete.
Use when someone has finished a planning task.`,
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone'),
        taskDescription: z.string().describe('Description of the task to update'),
        completed: z.boolean().describe('Mark as complete (true) or incomplete (false)'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, taskDescription, completed, userId }) => {
        const userMilestoneList = await getUserMilestones(userId);

        const milestone = userMilestoneList.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find a milestone matching "${milestoneName}". Your milestones: ${userMilestoneList.map((m) => m.name).join(', ')}`;
        }

        const task = milestone.checklist.find((t) =>
          t.task.toLowerCase().includes(taskDescription.toLowerCase())
        );

        if (!task) {
          return `Couldn't find that task. Available tasks:\n${milestone.checklist
            .filter((t) => !t.completed)
            .map((t) => `• ${t.task}`)
            .join('\n')}`;
        }

        task.completed = completed;
        milestone.updatedAt = new Date();
        milestones.set(milestone.id, milestone);

        const completedTasks = milestone.checklist.filter((t) => t.completed).length;
        const totalTasks = milestone.checklist.length;
        const progress = Math.round((completedTasks / totalTasks) * 100);

        if (completed) {
          return `✅ Done: "${task.task}"\n\n**Progress:** ${progress}% complete (${completedTasks}/${totalTasks} tasks)\n\nGreat progress! What's next?`;
        } else {
          return `Unmarked: "${task.task}"\n\n**Progress:** ${progress}% complete`;
        }
      },
    }),

    // ========== ADD MEMORY ==========
    addMilestoneNote: llm.tool({
      description: `Add a note, memory, or lesson learned to a milestone.
Use when someone shares something they want to remember about their milestone.`,
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone'),
        noteType: z
          .enum(['note', 'highlight', 'lesson-learned', 'thank-you'])
          .describe('Type of note'),
        content: z.string().describe('The note content'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, noteType, content, userId }) => {
        // Validate and sanitize inputs
        const sanitizedContent = sanitizePlainText(content, MAX_NOTES_LENGTH);
        if (sanitizedContent.length < 2) {
          return 'Note content must be at least 2 characters.';
        }

        const userMilestoneList = await getUserMilestones(userId);

        const milestone = userMilestoneList.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find a milestone matching "${milestoneName}".`;
        }

        addMilestoneMemory(milestone.id, noteType, sanitizedContent);

        const typeEmoji = {
          note: '📝',
          highlight: '✨',
          'lesson-learned': '💡',
          'thank-you': '💝',
        }[noteType];

        return `${typeEmoji} Memory saved for "${milestone.name}"!\n\nThese moments matter. I'll keep track of them for you.`;
      },
    }),

    // ========== GET MILESTONE TIPS ==========
    getMilestoneTips: llm.tool({
      description: `Get expert tips and advice for a type of life milestone.
Use when someone asks for advice about planning a specific type of event.`,
      parameters: z.object({
        category: z
          .enum([
            'first-home',
            'first-baby',
            'wedding',
            'engagement',
            'graduation',
            'milestone-birthday',
            'retirement',
            'first-job',
            'first-car',
            'first-pet',
            'first-solo-trip',
            'college-sendoff',
            'coming-of-age',
            'anniversary',
            'memorial',
            'other',
          ])
          .describe('Type of milestone'),
      }),
      execute: async ({ category }) => {
        const template = MILESTONE_TEMPLATES[category];

        let response = `💡 **${template.name} Planning Tips**\n\n`;

        response += `**Timeline:** Typically ${template.typicalTimeline}\n`;
        response += `**Budget Range:** $${template.budgetRange.low.toLocaleString()} - $${template.budgetRange.high.toLocaleString()}\n\n`;

        response += `**Expert Tips:**\n`;
        template.tips.forEach((tip, index) => {
          response += `${index + 1}. ${tip}\n`;
        });

        response += `\n**Key Steps:**\n`;
        template.defaultChecklist.slice(0, 5).forEach((item) => {
          response += `• ${item.task}\n`;
        });

        return response;
      },
    }),

    // ========== MILESTONE COUNTDOWN ==========
    getMilestoneCountdown: llm.tool({
      description: `Get countdown information for upcoming milestones.
Use when someone asks how long until their event or wants urgency context.`,
      parameters: z.object({
        milestoneName: z
          .string()
          .optional()
          .describe('Specific milestone name, or leave empty for all'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, userId }) => {
        let userMilestoneList = await getUserMilestones(userId);

        if (milestoneName) {
          userMilestoneList = userMilestoneList.filter((m) =>
            m.name.toLowerCase().includes(milestoneName.toLowerCase())
          );
        }

        const upcoming = userMilestoneList
          .filter((m) => m.targetDate && m.status !== 'completed')
          .sort((a, b) => (a.targetDate?.getTime() || 0) - (b.targetDate?.getTime() || 0));

        if (upcoming.length === 0) {
          return `No upcoming milestones with dates set. Want to set a target date for something?`;
        }

        let response = `⏰ **Milestone Countdown**\n\n`;

        for (const milestone of upcoming) {
          const daysUntil = getDaysUntil(milestone.targetDate!);
          const completedTasks = milestone.checklist.filter((t) => t.completed).length;
          const totalTasks = milestone.checklist.length;

          let urgencyEmoji = '🟢';
          if (daysUntil < 30) urgencyEmoji = '🟡';
          if (daysUntil < 14) urgencyEmoji = '🟠';
          if (daysUntil < 7) urgencyEmoji = '🔴';

          response += `${urgencyEmoji} **${milestone.name}**\n`;
          response += `📅 ${formatDate(milestone.targetDate!)} — **${daysUntil} days**\n`;
          response += `📊 ${completedTasks}/${totalTasks} tasks complete\n`;

          // Priority tasks
          const incompleteTasks = milestone.checklist.filter((t) => !t.completed);
          if (incompleteTasks.length > 0 && daysUntil < 30) {
            response += `⚡ Priority: ${incompleteTasks[0].task}\n`;
          }
          response += `\n`;
        }

        return response;
      },
    }),
  };
}

export default createLifeFirstsTools;
