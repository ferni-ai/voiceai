/**
 * Event Planning Types
 *
 * Type definitions for event planning and life milestone tools.
 * Extracted from event-planning.ts for clean architecture.
 */

// ============================================================================
// LIFE PLANNING TYPES
// ============================================================================

export interface MajorPurchase {
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

export interface PurchaseOption {
  name: string;
  price: number;
  pros: string[];
  cons: string[];
  rating?: number;
  source?: string;
}

export interface Vacation {
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

export interface ItineraryDay {
  day: number;
  date?: Date;
  activities: string[];
  meals: string[];
  accommodation?: string;
  notes: string;
}

export interface Booking {
  type: 'flight' | 'hotel' | 'car' | 'activity' | 'restaurant' | 'other';
  name: string;
  confirmationNumber?: string;
  cost: number;
  date?: Date;
  booked: boolean;
}

export interface AnnualPlan {
  id: string;
  year: number;
  goals: LifeGoal[];
  quarterlyMilestones: QuarterlyMilestone[];
  experiences: PlannedExperience[];
  createdAt: Date;
}

export interface LifeGoal {
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

export interface QuarterlyMilestone {
  quarter: 1 | 2 | 3 | 4;
  milestones: string[];
  completed: string[];
}

export interface PlannedExperience {
  id: string;
  name: string;
  month?: number;
  category: string;
  estimated_cost?: number;
  completed: boolean;
  notes?: string;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export interface Event {
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

export type EventType =
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

export interface ChecklistItem {
  id: string;
  task: string;
  category: 'venue' | 'catering' | 'decor' | 'entertainment' | 'logistics' | 'other';
  dueDate?: Date;
  completed: boolean;
  assignedTo?: string;
  notes?: string;
}

export interface Guest {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  rsvpStatus: 'pending' | 'confirmed' | 'declined' | 'maybe';
  dietaryRestrictions?: string[];
  plusOne: boolean;
  tableAssignment?: number;
}

export interface Vendor {
  id: string;
  name: string;
  type: 'venue' | 'catering' | 'photography' | 'music' | 'decor' | 'cake' | 'other';
  contact: string;
  cost: number;
  depositPaid: boolean;
  confirmed: boolean;
  notes: string;
}

export interface VenueOption {
  name: string;
  type: string;
  capacity: number;
  priceRange: string;
  amenities: string[];
  rating: number;
  location: string;
}

// ============================================================================
// PERSISTENCE TYPES (serialized for Firestore)
// ============================================================================

export interface PersistedEvent extends Omit<Event, 'date' | 'createdAt' | 'checklist'> {
  date: string;
  createdAt: string;
  checklist: Array<Omit<ChecklistItem, 'dueDate'> & { dueDate?: string }>;
}

export interface PersistedMajorPurchase extends Omit<MajorPurchase, 'targetDate' | 'createdAt'> {
  targetDate?: string;
  createdAt: string;
}

export interface PersistedVacation extends Omit<
  Vacation,
  'startDate' | 'endDate' | 'createdAt' | 'itinerary' | 'bookings'
> {
  startDate?: string;
  endDate?: string;
  createdAt: string;
  itinerary: Array<Omit<ItineraryDay, 'date'> & { date?: string }>;
  bookings: Array<Omit<Booking, 'date'> & { date?: string }>;
}

export interface PersistedAnnualPlan extends Omit<AnnualPlan, 'createdAt' | 'goals'> {
  createdAt: string;
  goals: Array<Omit<LifeGoal, 'deadline'> & { deadline?: string }>;
}

export interface UserEventPlanningData {
  events: PersistedEvent[];
  majorPurchases: PersistedMajorPurchase[];
  vacations: PersistedVacation[];
  annualPlans: PersistedAnnualPlan[];
}
