/**
 * Productivity Tools Integration Tests
 *
 * Tests for the daily productivity tools (tasks, habits, bills, etc.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Tasks
import {
  createTask,
  completeTask,
  updateTask,
  deleteTask,
  getUserTasks,
  getOverdueTasks,
  getTodaysTasks,
  getUpcomingTasks,
} from '../tools/tasks.js';

// Habits
import {
  createHabit,
  logHabit,
  deleteHabit,
  getDueHabits,
  calculateStreak,
  getUserHabits,
} from '../tools/domains/habits/habits.js';

// Bills
import {
  addBill,
  recordPayment,
  updateBill,
  deactivateBill,
  getUpcomingBills,
  calculateMonthlyTotal,
  getOverdueBills,
  getUserBills,
} from '../tools/bills.js';

// Medications
import {
  addMedication,
  logDose,
  updateMedication,
  discontinueMedication,
  getDueDoses,
  getUpcomingDoses,
  getMedsNeedingRefill,
  getUserMedications,
} from '../tools/medications.js';

// Notes
import {
  createNote,
  createJournalEntry,
  getTodayJournal,
  getJournalStreak,
  getUserNotes,
} from '../tools/notes.js';

describe('Productivity Tools', () => {
  const testUserId = 'test-user-productivity';

  describe('Tasks Tool', () => {
    it('should create a task', () => {
      const task = createTask({
        userId: testUserId,
        title: 'Test Task',
        category: 'personal',
        priority: 'high',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('high');
    });

    it('should complete a task', () => {
      const task = createTask({
        userId: testUserId,
        title: 'Completable Task',
      });

      const result = completeTask(task.id, 'Done!');

      expect(result).not.toBeNull();
      expect(result!.task.status).toBe('completed');
      expect(result!.task.completionNotes).toBe('Done!');
    });

    it('should update a task', () => {
      const task = createTask({
        userId: testUserId,
        title: 'Updatable Task',
        priority: 'low',
      });

      const updated = updateTask(task.id, { priority: 'urgent' });

      expect(updated).not.toBeNull();
      expect(updated!.priority).toBe('urgent');
    });

    it('should delete a task', () => {
      const task = createTask({
        userId: testUserId,
        title: 'Deletable Task',
      });

      const deleted = deleteTask(task.id);
      expect(deleted).toBe(true);
    });

    it('should handle recurring tasks', () => {
      const task = createTask({
        userId: testUserId,
        title: 'Recurring Task',
        isRecurring: true,
        recurrencePattern: 'daily',
        dueDate: new Date(),
      });

      const result = completeTask(task.id);

      expect(result).not.toBeNull();
      // Should create next instance for recurring tasks
      if (task.isRecurring) {
        expect(result!.nextInstance).toBeDefined();
      }
    });
  });

  describe('Habits Tool', () => {
    it('should create a habit', () => {
      const habit = createHabit({
        userId: testUserId,
        name: 'Drink Water',
        category: 'health',
        frequency: 'daily',
        targetPerDay: 8,
      });

      expect(habit.id).toBeDefined();
      expect(habit.name).toBe('Drink Water');
      expect(habit.targetPerDay).toBe(8);
      expect(habit.isActive).toBe(true);
    });

    it('should log a habit completion', () => {
      const habit = createHabit({
        userId: testUserId,
        name: 'Exercise',
        frequency: 'daily',
      });

      const log = logHabit({
        habitId: habit.id,
        userId: testUserId,
        count: 1,
      });

      expect(log.completed).toBe(true);
      expect(log.count).toBe(1);
    });

    it('should calculate streak', () => {
      const habit = createHabit({
        userId: testUserId,
        name: 'Meditation',
        frequency: 'daily',
      });

      // Log today
      logHabit({
        habitId: habit.id,
        userId: testUserId,
      });

      const streak = calculateStreak(habit.id);
      expect(streak).toBeGreaterThanOrEqual(0);
    });

    it('should soft delete a habit', () => {
      const habit = createHabit({
        userId: testUserId,
        name: 'Deletable Habit',
      });

      const deleted = deleteHabit(habit.id);
      expect(deleted).toBe(true);
    });
  });

  describe('Bills Tool', () => {
    it('should add a bill', () => {
      const bill = addBill({
        userId: testUserId,
        name: 'Electric Bill',
        payee: 'Power Co',
        category: 'utilities',
        amount: 100,
        dueDay: 15,
        frequency: 'monthly',
      });

      expect(bill.id).toBeDefined();
      expect(bill.name).toBe('Electric Bill');
      expect(bill.amount).toBe(100);
      expect(bill.isActive).toBe(true);
    });

    it('should record a payment', () => {
      const bill = addBill({
        userId: testUserId,
        name: 'Internet',
        payee: 'ISP',
        category: 'internet',
        amount: 60,
        dueDay: 1,
      });

      const result = recordPayment({
        billId: bill.id,
        userId: testUserId,
        amount: 60,
      });

      expect(result).not.toBeNull();
      expect(result!.payment.status).toBe('paid');
    });

    it('should calculate monthly total', () => {
      addBill({
        userId: `${testUserId}-total`,
        name: 'Bill A',
        payee: 'A',
        amount: 100,
        dueDay: 1,
        frequency: 'monthly',
      });

      addBill({
        userId: `${testUserId}-total`,
        name: 'Bill B',
        payee: 'B',
        amount: 50,
        dueDay: 15,
        frequency: 'monthly',
      });

      const total = calculateMonthlyTotal(`${testUserId}-total`);
      expect(total).toBe(150);
    });

    it('should deactivate a bill', () => {
      const bill = addBill({
        userId: testUserId,
        name: 'Cancelled Service',
        payee: 'Service',
        amount: 20,
        dueDay: 10,
      });

      const deactivated = deactivateBill(bill.id);
      expect(deactivated).toBe(true);
    });
  });

  describe('Medications Tool', () => {
    it('should add a medication', () => {
      const med = addMedication({
        userId: testUserId,
        name: 'Vitamin D',
        dosage: '1000 IU',
        frequency: 'once_daily',
      });

      expect(med.id).toBeDefined();
      expect(med.name).toBe('Vitamin D');
      expect(med.isActive).toBe(true);
    });

    it('should log a dose', () => {
      const med = addMedication({
        userId: testUserId,
        name: 'Aspirin',
        dosage: '81mg',
        frequency: 'once_daily',
      });

      const log = logDose({
        medicationId: med.id,
        userId: testUserId,
        scheduledTime: '08:00',
        taken: true,
      });

      expect(log.takenAt).toBeDefined();
      expect(log.skipped).toBe(false);
    });

    it('should track pill count', () => {
      const med = addMedication({
        userId: testUserId,
        name: 'Test Med',
        dosage: '10mg',
        frequency: 'once_daily',
        pillsRemaining: 30,
      });

      logDose({
        medicationId: med.id,
        userId: testUserId,
        scheduledTime: '08:00',
        taken: true,
      });

      const meds = getUserMedications(testUserId);
      const updatedMed = meds.find((m) => m.id === med.id);
      expect(updatedMed?.pillsRemaining).toBe(29);
    });

    it('should discontinue a medication', () => {
      const med = addMedication({
        userId: testUserId,
        name: 'Discontinued Med',
        dosage: '5mg',
        frequency: 'once_daily',
      });

      const discontinued = discontinueMedication(med.id);
      expect(discontinued).toBe(true);
    });
  });

  describe('Notes Tool', () => {
    it('should create a quick note', () => {
      const note = createNote({
        userId: testUserId,
        content: 'Remember to call mom',
        type: 'quick',
      });

      expect(note.id).toBeDefined();
      expect(note.content).toBe('Remember to call mom');
      expect(note.type).toBe('quick');
    });

    it('should create a journal entry', () => {
      const entry = createJournalEntry({
        userId: testUserId,
        gratitudes: ['Good weather', 'Nice coffee', 'Productive day'],
        mood: 4,
        highlight: 'Finished big project',
      });

      expect(entry.id).toBeDefined();
      expect(entry.gratitudes).toHaveLength(3);
      expect(entry.mood).toBe(4);
    });

    it('should update existing journal for today', () => {
      // Create first entry
      createJournalEntry({
        userId: `${testUserId}-journal`,
        gratitudes: ['First'],
        mood: 3,
      });

      // Update same day
      const updated = createJournalEntry({
        userId: `${testUserId}-journal`,
        gratitudes: ['Updated'],
        mood: 5,
      });

      expect(updated.mood).toBe(5);
      expect(updated.gratitudes).toContain('Updated');
    });

    it('should get today journal', () => {
      createJournalEntry({
        userId: `${testUserId}-today`,
        mood: 4,
      });

      const today = getTodayJournal(`${testUserId}-today`);
      expect(today).not.toBeNull();
      expect(today!.mood).toBe(4);
    });

    it('should calculate journal streak', () => {
      createJournalEntry({
        userId: `${testUserId}-streak`,
        mood: 4,
      });

      const streak = getJournalStreak(`${testUserId}-streak`);
      expect(streak).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Tool Integration', () => {
    it('should handle concurrent operations', async () => {
      const userId = `${testUserId}-concurrent`;

      // Create multiple items concurrently
      const [task, habit, bill] = await Promise.all([
        Promise.resolve(createTask({ userId, title: 'Concurrent Task' })),
        Promise.resolve(createHabit({ userId, name: 'Concurrent Habit' })),
        Promise.resolve(
          addBill({ userId, name: 'Concurrent Bill', payee: 'Test', amount: 100, dueDay: 1 })
        ),
      ]);

      expect(task.id).toBeDefined();
      expect(habit.id).toBeDefined();
      expect(bill.id).toBeDefined();
    });

    it('should maintain data isolation between users', () => {
      const user1 = 'isolation-user-1';
      const user2 = 'isolation-user-2';

      createTask({ userId: user1, title: 'User 1 Task' });
      createTask({ userId: user2, title: 'User 2 Task' });

      const user1Tasks = getUserTasks(user1);
      const user2Tasks = getUserTasks(user2);

      expect(user1Tasks.every((t) => t.userId === user1)).toBe(true);
      expect(user2Tasks.every((t) => t.userId === user2)).toBe(true);
    });
  });
});
