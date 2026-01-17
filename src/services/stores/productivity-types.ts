/**
 * Productivity Data Types
 *
 * Type definitions for all productivity tools:
 * - Tasks, Bills, Routines, Notes, Habits
 * - Shopping, Medications, Packages, Travel
 * - Habit Coaching (Maya's enhanced system)
 */

// ============================================================================
// MAIN DATA CONTAINER
// ============================================================================

export interface ProductivityData {
  userId: string;
  lastUpdated: Date;

  // Tasks / To-Do
  tasks: TaskData[];

  // Bills
  bills: BillData[];
  billPayments: BillPaymentData[];

  // Routines
  routines: RoutineData[];
  routineCompletions: RoutineCompletionData[];

  // Notes & Journaling
  notes: NoteData[];
  journalEntries: JournalEntryData[];

  // Habits
  habits: HabitData[];
  habitLogs: HabitLogData[];

  // Shopping
  shoppingLists: ShoppingListData[];

  // Medications
  medications: MedicationData[];
  doseLogs: DoseLogData[];

  // Packages
  packages: PackageData[];

  // Travel
  savedTrips: TripData[];
  flightSearches: FlightSearchData[];
  hotelSearches: HotelSearchData[];

  // Habit Coaching (Maya's enhanced habits)
  enhancedHabits: EnhancedHabitData[];
  habitStacks: HabitStackData[];
  habitCoachProfile: HabitCoachProfileData | null;
  weeklyReflections: WeeklyReflectionData[];

  // Generic user preferences (for flexible tool storage)
  userPreferences?: Record<string, unknown>;
}

// ============================================================================
// TASK TYPES
// ============================================================================

export interface TaskData {
  id: string;
  title: string;
  description?: string;
  category: string;
  priority: string;
  status: string;
  dueDate?: string; // ISO string
  dueTime?: string;
  reminderMinutesBefore?: number;
  isRecurring: boolean;
  recurrencePattern?: string;
  recurrenceEndDate?: string;
  parentTaskId?: string;
  tags: string[];
  notes?: string;
  linkedGoalId?: string;
  completedAt?: string;
  completionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BILL TYPES
// ============================================================================

export interface BillData {
  id: string;
  name: string;
  payee: string;
  category: string;
  amount: number;
  frequency: string;
  dueDay: number;
  nextDueDate: string;
  reminderDaysBefore: number;
  isAutoPay: boolean;
  autopaySource?: string;
  accountNumber?: string;
  website?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillPaymentData {
  id: string;
  billId: string;
  amount: number;
  paidDate: string;
  dueDate: string;
  status: string;
  confirmationNumber?: string;
  notes?: string;
}

// ============================================================================
// ROUTINE TYPES
// ============================================================================

export interface RoutineData {
  id: string;
  name: string;
  type: string;
  steps: RoutineStepData[];
  totalDuration: number;
  targetTime?: string;
  reminderEnabled: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineStepData {
  id: string;
  title: string;
  duration: number;
  description?: string;
  isOptional: boolean;
  order: number;
}

export interface RoutineCompletionData {
  id: string;
  routineId: string;
  date: string;
  completedSteps: string[];
  totalSteps: number;
  completionPercent: number;
  duration: number;
  notes?: string;
}

// ============================================================================
// NOTE TYPES
// ============================================================================

export interface NoteData {
  id: string;
  type: string;
  content: string;
  title?: string;
  tags: string[];
  mood?: number;
  linkedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryData {
  id: string;
  date: string;
  gratitudes: string[];
  highlight?: string;
  challenge?: string;
  learnings?: string;
  tomorrowIntention?: string;
  mood: number;
  notes?: string;
  createdAt: string;
}

// ============================================================================
// HABIT TYPES
// ============================================================================

export interface HabitData {
  id: string;
  name: string;
  description?: string;
  category: string;
  frequency: string;
  customDays?: number[];
  targetPerDay: number;
  reminderTime?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLogData {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  count: number;
  notes?: string;
}

// ============================================================================
// SHOPPING TYPES
// ============================================================================

export interface ShoppingListData {
  id: string;
  name: string;
  type: string;
  items: ShoppingItemData[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItemData {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category?: string;
  notes?: string;
  isChecked: boolean;
  addedAt: string;
}

// ============================================================================
// MEDICATION TYPES
// ============================================================================

export interface MedicationData {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  scheduledTimes: string[];
  doseLabels: string[];
  instructions?: string;
  purpose?: string;
  prescriber?: string;
  pharmacy?: string;
  pillsRemaining?: number;
  refillAt?: number;
  lastRefillDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoseLogData {
  id: string;
  medicationId: string;
  scheduledTime: string;
  takenAt?: string;
  skipped: boolean;
  notes?: string;
  date: string;
}

// ============================================================================
// PACKAGE TYPES
// ============================================================================

export interface PackageData {
  id: string;
  trackingNumber: string;
  carrier: string;
  description: string;
  sender?: string;
  status: string;
  expectedDelivery?: string;
  deliveredAt?: string;
  events: PackageEventData[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PackageEventData {
  timestamp: string;
  status: string;
  location?: string;
  description: string;
}

// ============================================================================
// TRAVEL TYPES
// ============================================================================

export interface TripData {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget?: number;
  notes?: string;
  createdAt: string;
}

export interface FlightSearchData {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  tripType: string;
  passengers: number;
  cabinClass: string;
  createdAt: string;
}

export interface HotelSearchData {
  id: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
  createdAt: string;
}

// ============================================================================
// HABIT COACHING TYPES (Maya's enhanced system)
// ============================================================================

export interface EnhancedHabitData {
  id: string;
  name: string;
  description?: string;
  domain: string;
  subdomain?: string;

  // Glidepath
  currentLevel: number;
  targetLevel: number;
  levelStartDate: string;
  levelHistory: Array<{ level: number; achievedAt: string }>;

  // Habit loop
  habitLoop: {
    cue: { type: string; description: string; specificity: string };
    routine: { behavior: string; duration: number; difficulty: string };
    reward: { intrinsic: string; extrinsic?: string; celebration: string };
  };

  // Stacking
  stackedOnto?: string;
  isAnchorFor?: string[];

  // Keystone
  isKeystone: boolean;
  keystoneScore?: number;
  cascadeEffects?: string[];

  // Tracking
  frequency: string;
  customDays?: number[];
  targetPerDay: number;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  successRate: number;

  // Timing
  reminderTime?: string;
  bestPerformanceTime?: string;

  // Status
  isActive: boolean;
  isPaused: boolean;
  pauseReason?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notes?: string;
}

export interface HabitStackData {
  id: string;
  name: string;
  description: string;
  anchorHabit: string;
  newHabits: string[];
  totalDuration: number;
  bestTimeOfDay: string;
}

export interface HabitCoachProfileData {
  lifeStage: string;
  domainPriorities: string[];
  keystoneHabits: string[];
  currentFocus: {
    domain: string;
    goal: string;
    startDate: string;
    habits: string[];
  } | null;
  assessmentHistory: Array<{
    date: string;
    domains: Record<string, number>;
    notes: string;
  }>;
}

export interface WeeklyReflectionData {
  id: string;
  date: string;
  wins: string[];
  challenges: string[];
  insights: string[];
  adjustments: string[];
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Entity with userId for filtering
 */
export type WithUserId<T> = T & { userId: string };

/**
 * Create empty productivity data for a new user
 */
export function createEmptyProductivityData(userId: string): ProductivityData {
  return {
    userId,
    lastUpdated: new Date(),
    tasks: [],
    bills: [],
    billPayments: [],
    routines: [],
    routineCompletions: [],
    notes: [],
    journalEntries: [],
    habits: [],
    habitLogs: [],
    shoppingLists: [],
    medications: [],
    doseLogs: [],
    packages: [],
    savedTrips: [],
    flightSearches: [],
    hotelSearches: [],
    enhancedHabits: [],
    habitStacks: [],
    habitCoachProfile: null,
    weeklyReflections: [],
  };
}
