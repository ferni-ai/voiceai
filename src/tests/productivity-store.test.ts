/**
 * Productivity Store Tests
 *
 * Tests for the unified storage system for daily productivity tools.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProductivityStore,
  initializeProductivityStore,
  shutdownProductivityStore,
  type TaskData,
  type BillData,
  type HabitData,
  type MedicationData,
  type NoteData,
  type RoutineData,
} from '../services/productivity-store.js';

describe('ProductivityStore', () => {
  let store: ReturnType<typeof getProductivityStore>;
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // Initialize a fresh store for each test
    store = await initializeProductivityStore();
  });

  afterEach(async () => {
    // Clean up after each test
    await shutdownProductivityStore();
  });

  describe('Initialization', () => {
    it('should initialize without errors', async () => {
      const newStore = await initializeProductivityStore();
      expect(newStore).toBeDefined();
    });

    it('should return singleton instance', () => {
      const store1 = getProductivityStore();
      const store2 = getProductivityStore();
      expect(store1).toBe(store2);
    });
  });

  describe('Task Operations', () => {
    const testTask: TaskData = {
      id: 'task-1',
      title: 'Buy groceries',
      description: 'Get milk, eggs, bread',
      category: 'errands',
      priority: 'medium',
      status: 'pending',
      dueDate: new Date().toISOString(),
      isRecurring: false,
      tags: ['shopping'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should save and retrieve a task', () => {
      store.setTask(testUserId, testTask);
      const tasks = store.getUserTasks(testUserId);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(testTask.id);
      expect(tasks[0].title).toBe(testTask.title);
    });

    it('should update an existing task', () => {
      store.setTask(testUserId, testTask);
      
      const updatedTask = { ...testTask, status: 'completed' as const };
      store.setTask(testUserId, updatedTask);

      const tasks = store.getUserTasks(testUserId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('completed');
    });

    it('should delete a task', () => {
      store.setTask(testUserId, testTask);
      store.deleteTask(testTask.id);

      const tasks = store.getUserTasks(testUserId);
      expect(tasks).toHaveLength(0);
    });

    it('should isolate tasks by user', () => {
      store.setTask('user-a', testTask);
      store.setTask('user-b', { ...testTask, id: 'task-2' });

      expect(store.getUserTasks('user-a')).toHaveLength(1);
      expect(store.getUserTasks('user-b')).toHaveLength(1);
      expect(store.getUserTasks('user-c')).toHaveLength(0);
    });
  });

  describe('Bill Operations', () => {
    const testBill: BillData = {
      id: 'bill-1',
      name: 'Electric Bill',
      payee: 'Power Company',
      category: 'utilities',
      amount: 150,
      frequency: 'monthly',
      dueDay: 15,
      nextDueDate: new Date().toISOString(),
      reminderDaysBefore: 3,
      isAutoPay: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should save and retrieve a bill', () => {
      store.setBill(testUserId, testBill);
      const bills = store.getUserBills(testUserId);

      expect(bills).toHaveLength(1);
      expect(bills[0].name).toBe('Electric Bill');
      expect(bills[0].amount).toBe(150);
    });

    it('should track bill payments', () => {
      store.setBill(testUserId, testBill);
      store.setBillPayment(testUserId, {
        id: 'payment-1',
        billId: testBill.id,
        amount: 150,
        paidDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        status: 'paid',
      });

      const payments = store.getUserBillPayments(testUserId);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(150);
    });
  });

  describe('Habit Operations', () => {
    const testHabit: HabitData = {
      id: 'habit-1',
      name: 'Drink Water',
      description: '8 glasses a day',
      category: 'health',
      frequency: 'daily',
      targetPerDay: 8,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should save and retrieve a habit', () => {
      store.setHabit(testUserId, testHabit);
      const habits = store.getUserHabits(testUserId);

      expect(habits).toHaveLength(1);
      expect(habits[0].name).toBe('Drink Water');
      expect(habits[0].targetPerDay).toBe(8);
    });

    it('should track habit logs', () => {
      store.setHabit(testUserId, testHabit);
      store.setHabitLog(testUserId, {
        id: 'log-1',
        habitId: testHabit.id,
        date: new Date().toISOString(),
        completed: true,
        count: 8,
      });

      const logs = store.getUserHabitLogs(testUserId);
      expect(logs).toHaveLength(1);
      expect(logs[0].completed).toBe(true);
    });
  });

  describe('Medication Operations', () => {
    const testMed: MedicationData = {
      id: 'med-1',
      name: 'Vitamin D',
      dosage: '1000 IU',
      frequency: 'once_daily',
      scheduledTimes: ['08:00'],
      doseLabels: ['morning'],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should save and retrieve a medication', () => {
      store.setMedication(testUserId, testMed);
      const meds = store.getUserMedications(testUserId);

      expect(meds).toHaveLength(1);
      expect(meds[0].name).toBe('Vitamin D');
      expect(meds[0].dosage).toBe('1000 IU');
    });

    it('should track dose logs', () => {
      store.setMedication(testUserId, testMed);
      store.setDoseLog(testUserId, {
        id: 'dose-1',
        medicationId: testMed.id,
        scheduledTime: '08:00',
        takenAt: new Date().toISOString(),
        skipped: false,
        date: new Date().toISOString(),
      });

      const logs = store.getUserDoseLogs(testUserId);
      expect(logs).toHaveLength(1);
      expect(logs[0].skipped).toBe(false);
    });
  });

  describe('Note Operations', () => {
    const testNote: NoteData = {
      id: 'note-1',
      type: 'quick',
      content: 'Remember to call mom',
      tags: ['family'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should save and retrieve a note', () => {
      store.setNote(testUserId, testNote);
      const notes = store.getUserNotes(testUserId);

      expect(notes).toHaveLength(1);
      expect(notes[0].content).toBe('Remember to call mom');
    });

    it('should save and retrieve journal entries', () => {
      store.setJournal(testUserId, {
        id: 'journal-1',
        date: new Date().toISOString(),
        gratitudes: ['Good weather', 'Nice coffee'],
        mood: 4,
        createdAt: new Date().toISOString(),
      });

      const journals = store.getUserJournals(testUserId);
      expect(journals).toHaveLength(1);
      expect(journals[0].mood).toBe(4);
      expect(journals[0].gratitudes).toHaveLength(2);
    });
  });

  describe('Routine Operations', () => {
    const testRoutine: RoutineData = {
      id: 'routine-1',
      name: 'Morning Routine',
      type: 'morning',
      steps: [
        { id: 'step-1', title: 'Wake up', duration: 1, isOptional: false, order: 1 },
        { id: 'step-2', title: 'Stretch', duration: 5, isOptional: false, order: 2 },
      ],
      totalDuration: 6,
      reminderEnabled: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should save and retrieve a routine', () => {
      store.setRoutine(testUserId, testRoutine);
      const routines = store.getUserRoutines(testUserId);

      expect(routines).toHaveLength(1);
      expect(routines[0].name).toBe('Morning Routine');
      expect(routines[0].steps).toHaveLength(2);
    });
  });

  describe('Shopping List Operations', () => {
    it('should save and retrieve shopping lists', () => {
      store.setShoppingList(testUserId, {
        id: 'list-1',
        name: 'Grocery List',
        type: 'groceries',
        items: [
          { id: 'item-1', name: 'Milk', quantity: 1, isChecked: false, addedAt: new Date().toISOString() },
          { id: 'item-2', name: 'Bread', quantity: 2, isChecked: false, addedAt: new Date().toISOString() },
        ],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const lists = store.getUserShoppingLists(testUserId);
      expect(lists).toHaveLength(1);
      expect(lists[0].items).toHaveLength(2);
    });
  });

  describe('Data Loading', () => {
    it('should load user data without error', async () => {
      await expect(store.loadUserData(testUserId)).resolves.not.toThrow();
    });

    it('should mark loaded users', async () => {
      // First load should query the store
      await store.loadUserData(testUserId);
      
      // Add a task
      store.setTask(testUserId, {
        id: 'task-load-test',
        title: 'Test Task',
        category: 'personal',
        priority: 'medium',
        status: 'pending',
        isRecurring: false,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Second load should be a no-op (already loaded)
      await store.loadUserData(testUserId);
      
      // Task should still be there
      const tasks = store.getUserTasks(testUserId);
      expect(tasks).toHaveLength(1);
    });
  });

  describe('Full User Data', () => {
    it('should return all user productivity data', async () => {
      // Add various data types
      store.setTask(testUserId, {
        id: 'task-full',
        title: 'Full Test',
        category: 'personal',
        priority: 'high',
        status: 'pending',
        isRecurring: false,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      store.setHabit(testUserId, {
        id: 'habit-full',
        name: 'Exercise',
        category: 'health',
        frequency: 'daily',
        targetPerDay: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const fullData = store.getFullUserData(testUserId);

      expect(fullData.userId).toBe(testUserId);
      expect(fullData.tasks).toHaveLength(1);
      expect(fullData.habits).toHaveLength(1);
    });
  });
});

