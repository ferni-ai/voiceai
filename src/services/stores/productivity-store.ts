/**
 * Productivity Data Store
 *
 * Persistent storage for all daily productivity tools:
 * - Tasks, Bills, Routines, Notes, Habits
 * - Shopping, Medications, Packages, Travel
 *
 * Integrates with existing Firestore infrastructure and user profiles.
 * All data is user-scoped and persists across sessions.
 */

import { getDefaultStore, type MemoryStore } from '../../memory/index.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// TYPES - Productivity Data
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

// Task Types
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

// Bill Types
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

// Routine Types
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

// Note Types
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

// Habit Types
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

// Shopping Types
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

// Medication Types
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

// Package Types
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

// Travel Types
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

// Habit Coaching Types (Maya's enhanced system)
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
// PRODUCTIVITY STORE CLASS
// ============================================================================

class ProductivityStore {
  private store: MemoryStore | null = null;
  private cache = new Map<string, ProductivityData>();
  private dirtyUsers = new Set<string>();
  private saveDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // In-memory stores for tools (bridge to persistence)
  private taskMemory = new Map<string, TaskData>();
  private billMemory = new Map<string, BillData>();
  private billPaymentMemory = new Map<string, BillPaymentData>();
  private routineMemory = new Map<string, RoutineData>();
  private routineCompletionMemory = new Map<string, RoutineCompletionData>();
  private noteMemory = new Map<string, NoteData>();
  private journalMemory = new Map<string, JournalEntryData>();
  private habitMemory = new Map<string, HabitData>();
  private habitLogMemory = new Map<string, HabitLogData>();
  private shoppingListMemory = new Map<string, ShoppingListData>();
  private medicationMemory = new Map<string, MedicationData>();
  private doseLogMemory = new Map<string, DoseLogData>();
  private packageMemory = new Map<string, PackageData>();
  private tripMemory = new Map<string, TripData>();

  // Habit coaching memory (Maya)
  private enhancedHabitMemory = new Map<string, EnhancedHabitData>();
  private habitStackMemory = new Map<string, HabitStackData>();
  private habitCoachProfileMemory = new Map<string, HabitCoachProfileData>();
  private weeklyReflectionMemory = new Map<string, WeeklyReflectionData>();

  // Generic user preferences (for flexible tool storage)
  // Key format: "userId:preferenceName"
  private userPreferencesMemory = new Map<string, unknown>();

  async initialize(): Promise<void> {
    try {
      this.store = getDefaultStore();
      await this.store.initialize();
      getLogger().info('📦 Productivity store initialized');
    } catch (error) {
      getLogger().warn({ error }, 'Productivity store initialization failed - using memory only');
    }
  }

  // ============================================================================
  // LOAD / SAVE USER DATA
  // ============================================================================

  async loadUserData(userId: string): Promise<ProductivityData> {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached) {
      return cached;
    }

    // Try to load from profile
    if (this.store) {
      try {
        const profile = await this.store.getProfile(userId);
        if (profile) {
          const { productivityData } = profile as UserProfile & {
            productivityData?: ProductivityData;
          };

          if (productivityData) {
            // Hydrate into memory maps
            this.hydrateMemoryMaps(userId, productivityData);
            this.cache.set(userId, productivityData);
            getLogger().debug(
              { userId, tasks: productivityData.tasks?.length || 0 },
              'Loaded productivity data'
            );
            return productivityData;
          }
        }
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load productivity data');
      }
    }

    // Return empty data
    const emptyData = this.createEmptyData(userId);
    this.cache.set(userId, emptyData);
    return emptyData;
  }

  async saveUserData(userId: string): Promise<void> {
    // Collect all data from memory maps
    const data = this.collectUserData(userId);

    // Update cache
    data.lastUpdated = new Date();
    this.cache.set(userId, data);

    // Persist to profile
    if (this.store) {
      try {
        const profile = await this.store.getProfile(userId);
        if (profile) {
          (profile as UserProfile & { productivityData?: ProductivityData }).productivityData =
            data;
          await this.store.saveProfile(profile);
          getLogger().debug({ userId }, 'Saved productivity data');
        }
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to save productivity data');
      }
    }

    this.dirtyUsers.delete(userId);
  }

  // Debounced save - batches rapid updates
  markDirty(userId: string): void {
    this.dirtyUsers.add(userId);

    // Clear existing timer
    const existingTimer = this.saveDebounceTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer - save after 5 seconds of no activity
    const timer = setTimeout(() => {
      void this.saveUserData(userId);
      this.saveDebounceTimers.delete(userId);
    }, 5000);

    this.saveDebounceTimers.set(userId, timer);
  }

  // Force save all dirty users (call on shutdown)
  async flushAll(): Promise<void> {
    // Clear all timers
    for (const timer of this.saveDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.saveDebounceTimers.clear();

    // Save all dirty users
    const savePromises = Array.from(this.dirtyUsers).map(async (userId) =>
      this.saveUserData(userId)
    );
    await Promise.all(savePromises);

    getLogger().info({ count: this.dirtyUsers.size }, 'Flushed all productivity data');
  }

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  setTask(userId: string, task: TaskData): void {
    this.taskMemory.set(task.id, { ...task, userId } as TaskData & { userId: string });
    this.markDirty(userId);
  }

  getTask(taskId: string): TaskData | undefined {
    return this.taskMemory.get(taskId);
  }

  getUserTasks(userId: string): TaskData[] {
    return Array.from(this.taskMemory.values()).filter(
      (t) => (t as TaskData & { userId?: string }).userId === userId
    );
  }

  deleteTask(taskId: string): void {
    const task = this.taskMemory.get(taskId);
    if (task) {
      const { userId } = task as TaskData & { userId?: string };
      this.taskMemory.delete(taskId);
      if (userId) this.markDirty(userId);
    }
  }

  // ============================================================================
  // BILL OPERATIONS
  // ============================================================================

  setBill(userId: string, bill: BillData): void {
    this.billMemory.set(bill.id, { ...bill, userId } as BillData & { userId: string });
    this.markDirty(userId);
  }

  getBill(billId: string): BillData | undefined {
    return this.billMemory.get(billId);
  }

  getUserBills(userId: string): BillData[] {
    return Array.from(this.billMemory.values()).filter(
      (b) => (b as BillData & { userId?: string }).userId === userId
    );
  }

  setBillPayment(userId: string, payment: BillPaymentData): void {
    this.billPaymentMemory.set(payment.id, { ...payment, userId } as BillPaymentData & {
      userId: string;
    });
    this.markDirty(userId);
  }

  getUserBillPayments(userId: string): BillPaymentData[] {
    return Array.from(this.billPaymentMemory.values()).filter(
      (p) => (p as BillPaymentData & { userId?: string }).userId === userId
    );
  }

  // ============================================================================
  // HABIT OPERATIONS
  // ============================================================================

  setHabit(userId: string, habit: HabitData): void {
    this.habitMemory.set(habit.id, { ...habit, userId } as HabitData & { userId: string });
    this.markDirty(userId);
  }

  getHabit(habitId: string): HabitData | undefined {
    return this.habitMemory.get(habitId);
  }

  getUserHabits(userId: string): HabitData[] {
    return Array.from(this.habitMemory.values()).filter(
      (h) => (h as HabitData & { userId?: string }).userId === userId
    );
  }

  setHabitLog(userId: string, logEntry: HabitLogData): void {
    this.habitLogMemory.set(logEntry.id, { ...logEntry, userId } as HabitLogData & {
      userId: string;
    });
    this.markDirty(userId);
  }

  getUserHabitLogs(userId: string): HabitLogData[] {
    return Array.from(this.habitLogMemory.values()).filter(
      (l) => (l as HabitLogData & { userId?: string }).userId === userId
    );
  }

  // ============================================================================
  // MEDICATION OPERATIONS
  // ============================================================================

  setMedication(userId: string, med: MedicationData): void {
    this.medicationMemory.set(med.id, { ...med, userId } as MedicationData & { userId: string });
    this.markDirty(userId);
  }

  getMedication(medId: string): MedicationData | undefined {
    return this.medicationMemory.get(medId);
  }

  getUserMedications(userId: string): MedicationData[] {
    return Array.from(this.medicationMemory.values()).filter(
      (m) => (m as MedicationData & { userId?: string }).userId === userId
    );
  }

  setDoseLog(userId: string, logEntry: DoseLogData): void {
    this.doseLogMemory.set(logEntry.id, { ...logEntry, userId } as DoseLogData & {
      userId: string;
    });
    this.markDirty(userId);
  }

  getUserDoseLogs(userId: string): DoseLogData[] {
    return Array.from(this.doseLogMemory.values()).filter(
      (l) => (l as DoseLogData & { userId?: string }).userId === userId
    );
  }

  // ============================================================================
  // NOTE OPERATIONS
  // ============================================================================

  setNote(userId: string, note: NoteData): void {
    this.noteMemory.set(note.id, { ...note, userId } as NoteData & { userId: string });
    this.markDirty(userId);
  }

  getUserNotes(userId: string): NoteData[] {
    return Array.from(this.noteMemory.values()).filter(
      (n) => (n as NoteData & { userId?: string }).userId === userId
    );
  }

  setJournalEntry(userId: string, entry: JournalEntryData): void {
    this.journalMemory.set(entry.id, { ...entry, userId } as JournalEntryData & { userId: string });
    this.markDirty(userId);
  }

  getUserJournalEntries(userId: string): JournalEntryData[] {
    return Array.from(this.journalMemory.values()).filter(
      (j) => (j as JournalEntryData & { userId?: string }).userId === userId
    );
  }

  // Aliases for easier usage
  getUserJournals(userId: string): JournalEntryData[] {
    return this.getUserJournalEntries(userId);
  }

  setJournal(userId: string, entry: JournalEntryData): void {
    this.setJournalEntry(userId, entry);
  }

  // ============================================================================
  // ROUTINE OPERATIONS
  // ============================================================================

  setRoutine(userId: string, routine: RoutineData): void {
    this.routineMemory.set(routine.id, { ...routine, userId } as RoutineData & { userId: string });
    this.markDirty(userId);
  }

  getUserRoutines(userId: string): RoutineData[] {
    return Array.from(this.routineMemory.values()).filter(
      (r) => (r as RoutineData & { userId?: string }).userId === userId
    );
  }

  setRoutineCompletion(userId: string, completion: RoutineCompletionData): void {
    this.routineCompletionMemory.set(completion.id, {
      ...completion,
      userId,
    } as RoutineCompletionData & { userId: string });
    this.markDirty(userId);
  }

  // ============================================================================
  // SHOPPING OPERATIONS
  // ============================================================================

  setShoppingList(userId: string, list: ShoppingListData): void {
    this.shoppingListMemory.set(list.id, { ...list, userId } as ShoppingListData & {
      userId: string;
    });
    this.markDirty(userId);
  }

  getUserShoppingLists(userId: string): ShoppingListData[] {
    return Array.from(this.shoppingListMemory.values()).filter(
      (l) => (l as ShoppingListData & { userId?: string }).userId === userId
    );
  }

  // ============================================================================
  // PACKAGE OPERATIONS
  // ============================================================================

  setPackage(userId: string, pkg: PackageData): void {
    this.packageMemory.set(pkg.id, { ...pkg, userId } as PackageData & { userId: string });
    this.markDirty(userId);
  }

  getUserPackages(userId: string): PackageData[] {
    return Array.from(this.packageMemory.values()).filter(
      (p) => (p as PackageData & { userId?: string }).userId === userId
    );
  }

  // ============================================================================
  // TRIP OPERATIONS
  // ============================================================================

  setTrip(userId: string, trip: TripData): void {
    this.tripMemory.set(trip.id, { ...trip, userId } as TripData & { userId: string });
    this.markDirty(userId);
  }

  getUserTrips(userId: string): TripData[] {
    return Array.from(this.tripMemory.values()).filter(
      (t) => (t as TripData & { userId?: string }).userId === userId
    );
  }

  // ============================================================================
  // FULL DATA ACCESS
  // ============================================================================

  /**
   * Get all productivity data for a user
   */
  getFullUserData(userId: string): ProductivityData {
    return this.collectUserData(userId);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createEmptyData(userId: string): ProductivityData {
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
      // Habit coaching (Maya)
      enhancedHabits: [],
      habitStacks: [],
      habitCoachProfile: null,
      weeklyReflections: [],
    };
  }

  private collectUserData(userId: string): ProductivityData {
    return {
      userId,
      lastUpdated: new Date(),
      tasks: this.getUserTasks(userId),
      bills: this.getUserBills(userId),
      billPayments: Array.from(this.billPaymentMemory.values()).filter(
        (p) => (p as BillPaymentData & { userId?: string }).userId === userId
      ),
      routines: this.getUserRoutines(userId),
      routineCompletions: Array.from(this.routineCompletionMemory.values()).filter(
        (c) => (c as RoutineCompletionData & { userId?: string }).userId === userId
      ),
      notes: this.getUserNotes(userId),
      journalEntries: this.getUserJournalEntries(userId),
      habits: this.getUserHabits(userId),
      habitLogs: this.getUserHabitLogs(userId),
      shoppingLists: this.getUserShoppingLists(userId),
      medications: this.getUserMedications(userId),
      doseLogs: Array.from(this.doseLogMemory.values()).filter(
        (l) => (l as DoseLogData & { userId?: string }).userId === userId
      ),
      packages: this.getUserPackages(userId),
      savedTrips: this.getUserTrips(userId),
      flightSearches: [],
      hotelSearches: [],
      // Habit coaching (Maya)
      enhancedHabits: this.getUserEnhancedHabits(userId),
      habitStacks: this.getUserHabitStacks(userId),
      habitCoachProfile: this.getHabitCoachProfile(userId),
      weeklyReflections: this.getUserWeeklyReflections(userId),
      // Generic user preferences
      userPreferences: this.getAllUserPreferences(userId),
    };
  }

  private hydrateMemoryMaps(userId: string, data: ProductivityData): void {
    // Tasks
    for (const task of data.tasks || []) {
      this.taskMemory.set(task.id, { ...task, userId } as TaskData & { userId: string });
    }

    // Bills
    for (const bill of data.bills || []) {
      this.billMemory.set(bill.id, { ...bill, userId } as BillData & { userId: string });
    }
    for (const payment of data.billPayments || []) {
      this.billPaymentMemory.set(payment.id, { ...payment, userId } as BillPaymentData & {
        userId: string;
      });
    }

    // Routines
    for (const routine of data.routines || []) {
      this.routineMemory.set(routine.id, { ...routine, userId } as RoutineData & {
        userId: string;
      });
    }
    for (const completion of data.routineCompletions || []) {
      this.routineCompletionMemory.set(completion.id, {
        ...completion,
        userId,
      } as RoutineCompletionData & { userId: string });
    }

    // Notes & Journal
    for (const note of data.notes || []) {
      this.noteMemory.set(note.id, { ...note, userId } as NoteData & { userId: string });
    }
    for (const entry of data.journalEntries || []) {
      this.journalMemory.set(entry.id, { ...entry, userId } as JournalEntryData & {
        userId: string;
      });
    }

    // Habits
    for (const habit of data.habits || []) {
      this.habitMemory.set(habit.id, { ...habit, userId } as HabitData & { userId: string });
    }
    for (const log of data.habitLogs || []) {
      this.habitLogMemory.set(log.id, { ...log, userId } as HabitLogData & { userId: string });
    }

    // Shopping
    for (const list of data.shoppingLists || []) {
      this.shoppingListMemory.set(list.id, { ...list, userId } as ShoppingListData & {
        userId: string;
      });
    }

    // Medications
    for (const med of data.medications || []) {
      this.medicationMemory.set(med.id, { ...med, userId } as MedicationData & { userId: string });
    }
    for (const log of data.doseLogs || []) {
      this.doseLogMemory.set(log.id, { ...log, userId } as DoseLogData & { userId: string });
    }

    // Packages
    for (const pkg of data.packages || []) {
      this.packageMemory.set(pkg.id, { ...pkg, userId } as PackageData & { userId: string });
    }

    // Trips
    for (const trip of data.savedTrips || []) {
      this.tripMemory.set(trip.id, { ...trip, userId } as TripData & { userId: string });
    }

    // Habit coaching (Maya)
    for (const habit of data.enhancedHabits || []) {
      this.enhancedHabitMemory.set(habit.id, { ...habit, userId } as EnhancedHabitData & {
        userId: string;
      });
    }
    for (const stack of data.habitStacks || []) {
      this.habitStackMemory.set(stack.id, { ...stack, userId } as HabitStackData & {
        userId: string;
      });
    }
    if (data.habitCoachProfile) {
      this.habitCoachProfileMemory.set(userId, data.habitCoachProfile);
    }
    for (const reflection of data.weeklyReflections || []) {
      this.weeklyReflectionMemory.set(reflection.id, {
        ...reflection,
        userId,
      } as WeeklyReflectionData & { userId: string });
    }

    // User preferences
    if (data.userPreferences) {
      for (const [key, value] of Object.entries(data.userPreferences)) {
        this.userPreferencesMemory.set(`${userId}:${key}`, value);
      }
    }
  }

  // ============================================================================
  // HABIT COACHING OPERATIONS (Maya)
  // ============================================================================

  setEnhancedHabit(userId: string, habit: EnhancedHabitData): void {
    this.enhancedHabitMemory.set(habit.id, { ...habit, userId } as EnhancedHabitData & {
      userId: string;
    });
    this.markDirty(userId);
  }

  getEnhancedHabit(habitId: string): EnhancedHabitData | undefined {
    return this.enhancedHabitMemory.get(habitId);
  }

  getUserEnhancedHabits(userId: string): EnhancedHabitData[] {
    return Array.from(this.enhancedHabitMemory.values()).filter(
      (h) => (h as EnhancedHabitData & { userId?: string }).userId === userId
    );
  }

  deleteEnhancedHabit(habitId: string): boolean {
    const habit = this.enhancedHabitMemory.get(habitId);
    if (habit) {
      const { userId } = habit as EnhancedHabitData & { userId?: string };
      this.enhancedHabitMemory.delete(habitId);
      if (userId) this.markDirty(userId);
      return true;
    }
    return false;
  }

  setHabitStack(userId: string, stack: HabitStackData): void {
    this.habitStackMemory.set(stack.id, { ...stack, userId } as HabitStackData & {
      userId: string;
    });
    this.markDirty(userId);
  }

  getHabitStack(stackId: string): HabitStackData | undefined {
    return this.habitStackMemory.get(stackId);
  }

  getUserHabitStacks(userId: string): HabitStackData[] {
    return Array.from(this.habitStackMemory.values()).filter(
      (s) => (s as HabitStackData & { userId?: string }).userId === userId
    );
  }

  setHabitCoachProfile(userId: string, profile: HabitCoachProfileData): void {
    this.habitCoachProfileMemory.set(userId, profile);
    this.markDirty(userId);
  }

  getHabitCoachProfile(userId: string): HabitCoachProfileData | null {
    return this.habitCoachProfileMemory.get(userId) || null;
  }

  addWeeklyReflection(userId: string, reflection: WeeklyReflectionData): void {
    this.weeklyReflectionMemory.set(reflection.id, {
      ...reflection,
      userId,
    } as WeeklyReflectionData & { userId: string });
    this.markDirty(userId);
  }

  getUserWeeklyReflections(userId: string): WeeklyReflectionData[] {
    return Array.from(this.weeklyReflectionMemory.values())
      .filter((r) => (r as WeeklyReflectionData & { userId?: string }).userId === userId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ============================================================================
  // GENERIC USER PREFERENCES (for flexible tool data storage)
  // ============================================================================

  /**
   * Set a generic user preference/data value
   * Useful for tools that need flexible storage without creating dedicated types
   */
  setUserPreference(userId: string, key: string, value: unknown): void {
    const prefKey = `${userId}:${key}`;
    this.userPreferencesMemory.set(prefKey, value);
    this.markDirty(userId);
  }

  /**
   * Get a generic user preference/data value
   */
  getUserPreference(userId: string, key: string): unknown {
    const prefKey = `${userId}:${key}`;
    return this.userPreferencesMemory.get(prefKey);
  }

  /**
   * Get all preferences for a user
   */
  getAllUserPreferences(userId: string): Record<string, unknown> {
    const prefix = `${userId}:`;
    const prefs: Record<string, unknown> = {};

    for (const [key, value] of this.userPreferencesMemory.entries()) {
      if (key.startsWith(prefix)) {
        const prefName = key.substring(prefix.length);
        prefs[prefName] = value;
      }
    }

    return prefs;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let productivityStoreInstance: ProductivityStore | null = null;

export function getProductivityStore(): ProductivityStore {
  if (!productivityStoreInstance) {
    productivityStoreInstance = new ProductivityStore();
  }
  return productivityStoreInstance;
}

export async function initializeProductivityStore(): Promise<ProductivityStore> {
  const store = getProductivityStore();
  await store.initialize();
  return store;
}

export async function shutdownProductivityStore(): Promise<void> {
  if (productivityStoreInstance) {
    await productivityStoreInstance.flushAll();
    productivityStoreInstance = null;
  }
}

export default ProductivityStore;
