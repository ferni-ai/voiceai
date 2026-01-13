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
import { getDefaultStore } from '../../memory/index.js';
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// PRODUCTIVITY STORE CLASS
// ============================================================================
class ProductivityStore {
    store = null;
    cache = new Map();
    dirtyUsers = new Set();
    saveDebounceTimers = new Map();
    // In-memory stores for tools (bridge to persistence)
    taskMemory = new Map();
    billMemory = new Map();
    billPaymentMemory = new Map();
    routineMemory = new Map();
    routineCompletionMemory = new Map();
    noteMemory = new Map();
    journalMemory = new Map();
    habitMemory = new Map();
    habitLogMemory = new Map();
    shoppingListMemory = new Map();
    medicationMemory = new Map();
    doseLogMemory = new Map();
    packageMemory = new Map();
    tripMemory = new Map();
    // Habit coaching memory (Maya)
    enhancedHabitMemory = new Map();
    habitStackMemory = new Map();
    habitCoachProfileMemory = new Map();
    weeklyReflectionMemory = new Map();
    // Generic user preferences (for flexible tool storage)
    // Key format: "userId:preferenceName"
    userPreferencesMemory = new Map();
    async initialize() {
        try {
            this.store = getDefaultStore();
            await this.store.initialize();
            getLogger().info('📦 Productivity store initialized');
        }
        catch (error) {
            getLogger().warn({ error }, 'Productivity store initialization failed - using memory only');
        }
    }
    // ============================================================================
    // LOAD / SAVE USER DATA
    // ============================================================================
    async loadUserData(userId) {
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
                    const { productivityData } = profile;
                    if (productivityData) {
                        // Hydrate into memory maps
                        this.hydrateMemoryMaps(userId, productivityData);
                        this.cache.set(userId, productivityData);
                        getLogger().debug({ userId, tasks: productivityData.tasks?.length || 0 }, 'Loaded productivity data');
                        return productivityData;
                    }
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to load productivity data');
            }
        }
        // Return empty data
        const emptyData = this.createEmptyData(userId);
        this.cache.set(userId, emptyData);
        return emptyData;
    }
    async saveUserData(userId) {
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
                    profile.productivityData =
                        data;
                    await this.store.saveProfile(profile);
                    getLogger().debug({ userId }, 'Saved productivity data');
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to save productivity data');
            }
        }
        this.dirtyUsers.delete(userId);
    }
    // Debounced save - batches rapid updates
    markDirty(userId) {
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
    async flushAll() {
        // Clear all timers
        for (const timer of this.saveDebounceTimers.values()) {
            clearTimeout(timer);
        }
        this.saveDebounceTimers.clear();
        // Save all dirty users
        const savePromises = Array.from(this.dirtyUsers).map(async (userId) => this.saveUserData(userId));
        await Promise.all(savePromises);
        getLogger().info({ count: this.dirtyUsers.size }, 'Flushed all productivity data');
    }
    // ============================================================================
    // TASK OPERATIONS
    // ============================================================================
    setTask(userId, task) {
        this.taskMemory.set(task.id, { ...task, userId });
        this.markDirty(userId);
    }
    getTask(taskId) {
        return this.taskMemory.get(taskId);
    }
    getUserTasks(userId) {
        return Array.from(this.taskMemory.values()).filter((t) => t.userId === userId);
    }
    deleteTask(taskId) {
        const task = this.taskMemory.get(taskId);
        if (task) {
            const { userId } = task;
            this.taskMemory.delete(taskId);
            if (userId)
                this.markDirty(userId);
        }
    }
    // ============================================================================
    // BILL OPERATIONS
    // ============================================================================
    setBill(userId, bill) {
        this.billMemory.set(bill.id, { ...bill, userId });
        this.markDirty(userId);
    }
    getBill(billId) {
        return this.billMemory.get(billId);
    }
    getUserBills(userId) {
        return Array.from(this.billMemory.values()).filter((b) => b.userId === userId);
    }
    setBillPayment(userId, payment) {
        this.billPaymentMemory.set(payment.id, { ...payment, userId });
        this.markDirty(userId);
    }
    getUserBillPayments(userId) {
        return Array.from(this.billPaymentMemory.values()).filter((p) => p.userId === userId);
    }
    // ============================================================================
    // HABIT OPERATIONS
    // ============================================================================
    setHabit(userId, habit) {
        this.habitMemory.set(habit.id, { ...habit, userId });
        this.markDirty(userId);
    }
    getHabit(habitId) {
        return this.habitMemory.get(habitId);
    }
    getUserHabits(userId) {
        return Array.from(this.habitMemory.values()).filter((h) => h.userId === userId);
    }
    setHabitLog(userId, logEntry) {
        this.habitLogMemory.set(logEntry.id, { ...logEntry, userId });
        this.markDirty(userId);
    }
    getUserHabitLogs(userId) {
        return Array.from(this.habitLogMemory.values()).filter((l) => l.userId === userId);
    }
    // ============================================================================
    // MEDICATION OPERATIONS
    // ============================================================================
    setMedication(userId, med) {
        this.medicationMemory.set(med.id, { ...med, userId });
        this.markDirty(userId);
    }
    getMedication(medId) {
        return this.medicationMemory.get(medId);
    }
    getUserMedications(userId) {
        return Array.from(this.medicationMemory.values()).filter((m) => m.userId === userId);
    }
    setDoseLog(userId, logEntry) {
        this.doseLogMemory.set(logEntry.id, { ...logEntry, userId });
        this.markDirty(userId);
    }
    getUserDoseLogs(userId) {
        return Array.from(this.doseLogMemory.values()).filter((l) => l.userId === userId);
    }
    // ============================================================================
    // NOTE OPERATIONS
    // ============================================================================
    setNote(userId, note) {
        this.noteMemory.set(note.id, { ...note, userId });
        this.markDirty(userId);
    }
    getUserNotes(userId) {
        return Array.from(this.noteMemory.values()).filter((n) => n.userId === userId);
    }
    setJournalEntry(userId, entry) {
        this.journalMemory.set(entry.id, { ...entry, userId });
        this.markDirty(userId);
    }
    getUserJournalEntries(userId) {
        return Array.from(this.journalMemory.values()).filter((j) => j.userId === userId);
    }
    // Aliases for easier usage
    getUserJournals(userId) {
        return this.getUserJournalEntries(userId);
    }
    setJournal(userId, entry) {
        this.setJournalEntry(userId, entry);
    }
    // ============================================================================
    // ROUTINE OPERATIONS
    // ============================================================================
    setRoutine(userId, routine) {
        this.routineMemory.set(routine.id, { ...routine, userId });
        this.markDirty(userId);
    }
    getUserRoutines(userId) {
        return Array.from(this.routineMemory.values()).filter((r) => r.userId === userId);
    }
    setRoutineCompletion(userId, completion) {
        this.routineCompletionMemory.set(completion.id, {
            ...completion,
            userId,
        });
        this.markDirty(userId);
    }
    // ============================================================================
    // SHOPPING OPERATIONS
    // ============================================================================
    setShoppingList(userId, list) {
        this.shoppingListMemory.set(list.id, { ...list, userId });
        this.markDirty(userId);
    }
    getUserShoppingLists(userId) {
        return Array.from(this.shoppingListMemory.values()).filter((l) => l.userId === userId);
    }
    // ============================================================================
    // PACKAGE OPERATIONS
    // ============================================================================
    setPackage(userId, pkg) {
        this.packageMemory.set(pkg.id, { ...pkg, userId });
        this.markDirty(userId);
    }
    getUserPackages(userId) {
        return Array.from(this.packageMemory.values()).filter((p) => p.userId === userId);
    }
    // ============================================================================
    // TRIP OPERATIONS
    // ============================================================================
    setTrip(userId, trip) {
        this.tripMemory.set(trip.id, { ...trip, userId });
        this.markDirty(userId);
    }
    getUserTrips(userId) {
        return Array.from(this.tripMemory.values()).filter((t) => t.userId === userId);
    }
    // ============================================================================
    // FULL DATA ACCESS
    // ============================================================================
    /**
     * Get all productivity data for a user
     */
    getFullUserData(userId) {
        return this.collectUserData(userId);
    }
    /**
     * Clear all productivity data for a user (GDPR deletion)
     */
    async clearUserData(userId) {
        // Clear from memory maps (filtering by userId)
        for (const [id, task] of this.taskMemory.entries()) {
            if (task.userId === userId) {
                this.taskMemory.delete(id);
            }
        }
        for (const [id, bill] of this.billMemory.entries()) {
            if (bill.userId === userId) {
                this.billMemory.delete(id);
            }
        }
        for (const [id, payment] of this.billPaymentMemory.entries()) {
            if (payment.userId === userId) {
                this.billPaymentMemory.delete(id);
            }
        }
        for (const [id, routine] of this.routineMemory.entries()) {
            if (routine.userId === userId) {
                this.routineMemory.delete(id);
            }
        }
        for (const [id, note] of this.noteMemory.entries()) {
            if (note.userId === userId) {
                this.noteMemory.delete(id);
            }
        }
        for (const [id, journal] of this.journalMemory.entries()) {
            if (journal.userId === userId) {
                this.journalMemory.delete(id);
            }
        }
        for (const [id, habit] of this.habitMemory.entries()) {
            if (habit.userId === userId) {
                this.habitMemory.delete(id);
            }
        }
        for (const [id, habitLog] of this.habitLogMemory.entries()) {
            if (habitLog.userId === userId) {
                this.habitLogMemory.delete(id);
            }
        }
        for (const [id, list] of this.shoppingListMemory.entries()) {
            if (list.userId === userId) {
                this.shoppingListMemory.delete(id);
            }
        }
        for (const [id, med] of this.medicationMemory.entries()) {
            if (med.userId === userId) {
                this.medicationMemory.delete(id);
            }
        }
        for (const [id, dose] of this.doseLogMemory.entries()) {
            if (dose.userId === userId) {
                this.doseLogMemory.delete(id);
            }
        }
        for (const [id, pkg] of this.packageMemory.entries()) {
            if (pkg.userId === userId) {
                this.packageMemory.delete(id);
            }
        }
        for (const [id, trip] of this.tripMemory.entries()) {
            if (trip.userId === userId) {
                this.tripMemory.delete(id);
            }
        }
        for (const [id, eHabit] of this.enhancedHabitMemory.entries()) {
            if (eHabit.userId === userId) {
                this.enhancedHabitMemory.delete(id);
            }
        }
        for (const [id, stack] of this.habitStackMemory.entries()) {
            if (stack.userId === userId) {
                this.habitStackMemory.delete(id);
            }
        }
        for (const [id, profile] of this.habitCoachProfileMemory.entries()) {
            if (profile.userId === userId) {
                this.habitCoachProfileMemory.delete(id);
            }
        }
        for (const [id, reflection] of this.weeklyReflectionMemory.entries()) {
            if (reflection.userId === userId) {
                this.weeklyReflectionMemory.delete(id);
            }
        }
        for (const [key] of this.userPreferencesMemory.entries()) {
            if (key.startsWith(`${userId}:`)) {
                this.userPreferencesMemory.delete(key);
            }
        }
        // Clear from cache
        this.cache.delete(userId);
        // Clear from persistence
        if (this.store) {
            try {
                const profile = await this.store.getProfile(userId);
                if (profile) {
                    profile.productivityData = undefined;
                    await this.store.saveProfile(profile);
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to clear productivity data from persistence');
            }
        }
        getLogger().info({ userId }, '🗑️ Cleared all productivity data for user');
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    createEmptyData(userId) {
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
    collectUserData(userId) {
        return {
            userId,
            lastUpdated: new Date(),
            tasks: this.getUserTasks(userId),
            bills: this.getUserBills(userId),
            billPayments: Array.from(this.billPaymentMemory.values()).filter((p) => p.userId === userId),
            routines: this.getUserRoutines(userId),
            routineCompletions: Array.from(this.routineCompletionMemory.values()).filter((c) => c.userId === userId),
            notes: this.getUserNotes(userId),
            journalEntries: this.getUserJournalEntries(userId),
            habits: this.getUserHabits(userId),
            habitLogs: this.getUserHabitLogs(userId),
            shoppingLists: this.getUserShoppingLists(userId),
            medications: this.getUserMedications(userId),
            doseLogs: Array.from(this.doseLogMemory.values()).filter((l) => l.userId === userId),
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
    hydrateMemoryMaps(userId, data) {
        // Tasks
        for (const task of data.tasks || []) {
            this.taskMemory.set(task.id, { ...task, userId });
        }
        // Bills
        for (const bill of data.bills || []) {
            this.billMemory.set(bill.id, { ...bill, userId });
        }
        for (const payment of data.billPayments || []) {
            this.billPaymentMemory.set(payment.id, { ...payment, userId });
        }
        // Routines
        for (const routine of data.routines || []) {
            this.routineMemory.set(routine.id, { ...routine, userId });
        }
        for (const completion of data.routineCompletions || []) {
            this.routineCompletionMemory.set(completion.id, {
                ...completion,
                userId,
            });
        }
        // Notes & Journal
        for (const note of data.notes || []) {
            this.noteMemory.set(note.id, { ...note, userId });
        }
        for (const entry of data.journalEntries || []) {
            this.journalMemory.set(entry.id, { ...entry, userId });
        }
        // Habits
        for (const habit of data.habits || []) {
            this.habitMemory.set(habit.id, { ...habit, userId });
        }
        for (const log of data.habitLogs || []) {
            this.habitLogMemory.set(log.id, { ...log, userId });
        }
        // Shopping
        for (const list of data.shoppingLists || []) {
            this.shoppingListMemory.set(list.id, { ...list, userId });
        }
        // Medications
        for (const med of data.medications || []) {
            this.medicationMemory.set(med.id, { ...med, userId });
        }
        for (const log of data.doseLogs || []) {
            this.doseLogMemory.set(log.id, { ...log, userId });
        }
        // Packages
        for (const pkg of data.packages || []) {
            this.packageMemory.set(pkg.id, { ...pkg, userId });
        }
        // Trips
        for (const trip of data.savedTrips || []) {
            this.tripMemory.set(trip.id, { ...trip, userId });
        }
        // Habit coaching (Maya)
        for (const habit of data.enhancedHabits || []) {
            this.enhancedHabitMemory.set(habit.id, { ...habit, userId });
        }
        for (const stack of data.habitStacks || []) {
            this.habitStackMemory.set(stack.id, { ...stack, userId });
        }
        if (data.habitCoachProfile) {
            this.habitCoachProfileMemory.set(userId, data.habitCoachProfile);
        }
        for (const reflection of data.weeklyReflections || []) {
            this.weeklyReflectionMemory.set(reflection.id, {
                ...reflection,
                userId,
            });
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
    setEnhancedHabit(userId, habit) {
        this.enhancedHabitMemory.set(habit.id, { ...habit, userId });
        this.markDirty(userId);
    }
    getEnhancedHabit(habitId) {
        return this.enhancedHabitMemory.get(habitId);
    }
    getUserEnhancedHabits(userId) {
        return Array.from(this.enhancedHabitMemory.values()).filter((h) => h.userId === userId);
    }
    deleteEnhancedHabit(habitId) {
        const habit = this.enhancedHabitMemory.get(habitId);
        if (habit) {
            const { userId } = habit;
            this.enhancedHabitMemory.delete(habitId);
            if (userId)
                this.markDirty(userId);
            return true;
        }
        return false;
    }
    setHabitStack(userId, stack) {
        this.habitStackMemory.set(stack.id, { ...stack, userId });
        this.markDirty(userId);
    }
    getHabitStack(stackId) {
        return this.habitStackMemory.get(stackId);
    }
    getUserHabitStacks(userId) {
        return Array.from(this.habitStackMemory.values()).filter((s) => s.userId === userId);
    }
    setHabitCoachProfile(userId, profile) {
        this.habitCoachProfileMemory.set(userId, profile);
        this.markDirty(userId);
    }
    getHabitCoachProfile(userId) {
        return this.habitCoachProfileMemory.get(userId) || null;
    }
    addWeeklyReflection(userId, reflection) {
        this.weeklyReflectionMemory.set(reflection.id, {
            ...reflection,
            userId,
        });
        this.markDirty(userId);
    }
    getUserWeeklyReflections(userId) {
        return Array.from(this.weeklyReflectionMemory.values())
            .filter((r) => r.userId === userId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    // ============================================================================
    // GENERIC USER PREFERENCES (for flexible tool data storage)
    // ============================================================================
    /**
     * Set a generic user preference/data value
     * Useful for tools that need flexible storage without creating dedicated types
     */
    setUserPreference(userId, key, value) {
        const prefKey = `${userId}:${key}`;
        this.userPreferencesMemory.set(prefKey, value);
        this.markDirty(userId);
    }
    /**
     * Get a generic user preference/data value
     */
    getUserPreference(userId, key) {
        const prefKey = `${userId}:${key}`;
        return this.userPreferencesMemory.get(prefKey);
    }
    /**
     * Get all preferences for a user
     */
    getAllUserPreferences(userId) {
        const prefix = `${userId}:`;
        const prefs = {};
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
let productivityStoreInstance = null;
export function getProductivityStore() {
    if (!productivityStoreInstance) {
        productivityStoreInstance = new ProductivityStore();
    }
    return productivityStoreInstance;
}
export async function initializeProductivityStore() {
    const store = getProductivityStore();
    await store.initialize();
    return store;
}
export async function shutdownProductivityStore() {
    if (productivityStoreInstance) {
        await productivityStoreInstance.flushAll();
        productivityStoreInstance = null;
    }
}
export default ProductivityStore;
//# sourceMappingURL=productivity-store.js.map