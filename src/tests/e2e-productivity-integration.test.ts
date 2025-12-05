/**
 * E2E Integration Tests for Productivity System
 *
 * Tests the full flow from services startup through tool usage
 * to persistence and shutdown, simulating real production usage.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeServices,
  shutdownServices,
  createSessionServices,
  getGlobalServices,
} from '../services/index.js';
import { getProductivityStore } from '../services/productivity-store.js';
import {
  authenticateNaturally,
  getNaturalGreeting,
  generateContextForLLM,
} from '../services/natural-auth.js';
import { identifyFromMetadata, identifyWithNaturalAuth } from '../services/user-identification.js';

// Import tools
import { createTask, completeTask, getUserTasks } from '../tools/tasks.js';
import { createHabit, logHabit, getUserHabits } from '../tools/habits.js';
import { addBill, recordPayment, getUserBills } from '../tools/bills.js';
import { addMedication, logDose, getUserMedications } from '../tools/medications.js';
import { createNote, createJournalEntry, getTodayJournal } from '../tools/notes.js';

describe('E2E Productivity Integration', () => {
  const testUserId = `e2e-test-${Date.now()}`;

  beforeAll(async () => {
    // Initialize all services (same as agent startup)
    await initializeServices(false); // Skip persona indexing for speed
  });

  afterAll(async () => {
    // Shutdown all services (same as agent shutdown)
    await shutdownServices();
  });

  describe('Full Service Initialization', () => {
    it('should initialize global services', async () => {
      const services = await getGlobalServices();

      expect(services).toBeDefined();
      expect(services.store).toBeDefined();
      expect(services.vectorStore).toBeDefined();
      expect(services.productivityStore).toBeDefined();
      expect(services.initialized).toBe(true);
    });

    it('should initialize productivity store correctly', () => {
      const store = getProductivityStore();
      expect(store).toBeDefined();
    });
  });

  describe('User Identification Flow', () => {
    it('should identify user from phone number', async () => {
      const result = await identifyFromMetadata({
        caller_id: '+18005551234',
      });

      expect(result.userId).toContain('phone');
      expect(result.source.type).toBe('phone');
    });

    it('should identify user from device ID', async () => {
      const result = await identifyFromMetadata({
        device_id: 'test-device-e2e',
      });

      expect(result.userId).toContain('device');
      expect(result.source.type).toBe('device');
    });

    it('should provide natural authentication context', async () => {
      const { identification, authContext } = await identifyWithNaturalAuth({
        device_id: 'e2e-test-device',
      });

      expect(identification).toBeDefined();
      expect(authContext).toBeDefined();
      expect(authContext.confidence).toBeDefined();
      expect(authContext.action).toBeDefined();
    });

    it('should generate natural greeting', async () => {
      const authContext = await authenticateNaturally({
        metadata: { device_id: 'greeting-test-device' },
      });

      const greeting = getNaturalGreeting(authContext);
      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should generate LLM context', async () => {
      const authContext = await authenticateNaturally({
        metadata: { device_id: 'context-test-device' },
      });

      const context = generateContextForLLM(authContext);
      expect(context).toBeDefined();
      expect(context).toContain('Confidence');
    });
  });

  describe('Productivity Tools - Full Flow', () => {
    it('should create task and persist it', async () => {
      // Create a task
      const task = createTask({
        userId: testUserId,
        title: 'E2E Test Task',
        category: 'work',
        priority: 'high',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('E2E Test Task');

      // Verify it's in the user's tasks
      const tasks = getUserTasks(testUserId);
      expect(tasks.some((t) => t.id === task.id)).toBe(true);
    });

    it('should complete task and track completion', () => {
      const task = createTask({
        userId: testUserId,
        title: 'Completable E2E Task',
      });

      const result = completeTask(task.id, 'Completed in E2E test');

      expect(result).not.toBeNull();
      expect(result!.task.status).toBe('completed');
      expect(result!.task.completionNotes).toBe('Completed in E2E test');
    });

    it('should create habit and log progress', () => {
      const habit = createHabit({
        userId: testUserId,
        name: 'E2E Test Habit',
        category: 'health',
        frequency: 'daily',
        targetPerDay: 3,
      });

      expect(habit.id).toBeDefined();

      // Log the habit
      const log = logHabit({
        habitId: habit.id,
        userId: testUserId,
        count: 1,
      });

      expect(log.count).toBe(1);
      expect(log.completed).toBe(false); // Need 3 for completion

      // Log again
      logHabit({
        habitId: habit.id,
        userId: testUserId,
        count: 2,
      });

      // Verify habit tracking
      const habits = getUserHabits(testUserId);
      expect(habits.some((h) => h.id === habit.id)).toBe(true);
    });

    it('should create bill and record payment', () => {
      const bill = addBill({
        userId: testUserId,
        name: 'E2E Test Bill',
        payee: 'Test Company',
        amount: 99.99,
        dueDay: 15,
        frequency: 'monthly',
      });

      expect(bill.id).toBeDefined();
      expect(bill.amount).toBe(99.99);

      // Record payment
      const result = recordPayment({
        billId: bill.id,
        userId: testUserId,
        amount: 99.99,
      });

      expect(result).not.toBeNull();
      expect(result!.payment.status).toBe('paid');
    });

    it('should create medication and log dose', () => {
      const med = addMedication({
        userId: testUserId,
        name: 'E2E Test Med',
        dosage: '500mg',
        frequency: 'twice_daily',
        pillsRemaining: 60,
      });

      expect(med.id).toBeDefined();

      // Log a dose
      const log = logDose({
        medicationId: med.id,
        userId: testUserId,
        scheduledTime: '08:00',
        taken: true,
      });

      expect(log.takenAt).toBeDefined();
      expect(log.skipped).toBe(false);

      // Check pill count decreased
      const meds = getUserMedications(testUserId);
      const updatedMed = meds.find((m) => m.id === med.id);
      expect(updatedMed?.pillsRemaining).toBe(59);
    });

    it('should create note and journal entry', () => {
      const note = createNote({
        userId: testUserId,
        content: 'E2E test note content',
        type: 'quick',
        tags: ['e2e', 'test'],
      });

      expect(note.id).toBeDefined();
      expect(note.content).toBe('E2E test note content');

      // Create journal
      const journal = createJournalEntry({
        userId: testUserId,
        gratitudes: ['E2E tests pass', 'Code works', 'Life is good'],
        mood: 5,
        highlight: 'Successfully integrated productivity tools',
      });

      expect(journal.id).toBeDefined();
      expect(journal.mood).toBe(5);
      expect(journal.gratitudes).toHaveLength(3);

      // Verify today's journal exists
      const today = getTodayJournal(testUserId);
      expect(today).not.toBeNull();
    });
  });

  describe('Data Persistence', () => {
    it('should store data in productivity store', () => {
      const store = getProductivityStore();

      // Add data directly to store
      store.setTask(`${testUserId}-persist`, {
        id: 'persist-test-task',
        title: 'Persistence Test',
        category: 'personal',
        priority: 'medium',
        status: 'pending',
        isRecurring: false,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Retrieve it
      const tasks = store.getUserTasks(`${testUserId}-persist`);
      expect(tasks.some((t) => t.id === 'persist-test-task')).toBe(true);
    });

    it('should get full user data', () => {
      const store = getProductivityStore();

      const fullData = store.getFullUserData(testUserId);

      expect(fullData.userId).toBe(testUserId);
      expect(Array.isArray(fullData.tasks)).toBe(true);
      expect(Array.isArray(fullData.habits)).toBe(true);
      expect(Array.isArray(fullData.bills)).toBe(true);
    });
  });

  describe('Session Services Integration', () => {
    it('should create session services', async () => {
      const sessionId = `e2e-session-${Date.now()}`;
      const services = await createSessionServices(sessionId, testUserId, false);

      expect(services).toBeDefined();
      expect(services.sessionId).toBe(sessionId);

      // End session
      await services.endSession();
    });
  });

  describe('Cross-Tool Integration', () => {
    it('should handle multiple tools for same user', () => {
      const userId = `${testUserId}-multi`;

      // Create items across multiple tools
      createTask({ userId, title: 'Multi-tool task' });
      createHabit({ userId, name: 'Multi-tool habit' });
      addBill({ userId, name: 'Multi-tool bill', payee: 'Test', amount: 50, dueDay: 1 });
      addMedication({ userId, name: 'Multi-tool med', dosage: '10mg', frequency: 'once_daily' });
      createNote({ userId, content: 'Multi-tool note', type: 'quick' });

      // Verify all exist
      expect(getUserTasks(userId).length).toBeGreaterThanOrEqual(1);
      expect(getUserHabits(userId).length).toBeGreaterThanOrEqual(1);
      expect(getUserBills(userId).length).toBeGreaterThanOrEqual(1);
      expect(getUserMedications(userId).length).toBeGreaterThanOrEqual(1);
    });
  });
});
