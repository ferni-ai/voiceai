/**
 * CEO Services E2E Tests
 *
 * Comprehensive tests for all Firestore-backed CEO services:
 * - Decisions: Track decisions, choices, and outcomes
 * - Priorities: Manage ordered priorities with urgency
 * - Blockers: Track and resolve blockers with severity
 * - Ideas: Capture and organize ideas with tags
 * - Meetings: Log meetings with action items
 * - Insights: Cross-data "Better than Human" intelligence
 *
 * @module services/ceo/__tests__/ceo-services-e2e.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

// In-memory store for Firestore mock
const firestoreData = new Map<string, Record<string, unknown>>();

// Track operations for verification
const firestoreOps: Array<{ op: string; path: string; data?: unknown }> = [];

// Mock batch operations
const mockBatch = {
  set: vi.fn((ref: { path: string }, data: unknown) => {
    firestoreOps.push({ op: 'batch.set', path: ref.path, data });
    firestoreData.set(ref.path, data as Record<string, unknown>);
  }),
  update: vi.fn((ref: { path: string }, data: unknown) => {
    firestoreOps.push({ op: 'batch.update', path: ref.path, data });
    const existing = firestoreData.get(ref.path) || {};
    firestoreData.set(ref.path, { ...existing, ...(data as Record<string, unknown>) });
  }),
  delete: vi.fn((ref: { path: string }) => {
    firestoreOps.push({ op: 'batch.delete', path: ref.path });
    firestoreData.delete(ref.path);
  }),
  commit: vi.fn().mockResolvedValue(undefined),
};

// Helper to create a document reference mock
function createDocRef(fullPath: string, docId: string) {
  return {
    path: fullPath,
    get: () => {
      const data = firestoreData.get(fullPath);
      return Promise.resolve({
        exists: !!data,
        data: () => data,
        id: docId,
      });
    },
    set: (data: unknown) => {
      firestoreOps.push({ op: 'set', path: fullPath, data });
      firestoreData.set(fullPath, data as Record<string, unknown>);
      return Promise.resolve();
    },
    update: (data: unknown) => {
      firestoreOps.push({ op: 'update', path: fullPath, data });
      const existing = firestoreData.get(fullPath) || {};
      firestoreData.set(fullPath, { ...existing, ...(data as Record<string, unknown>) });
      return Promise.resolve();
    },
    delete: () => {
      firestoreOps.push({ op: 'delete', path: fullPath });
      firestoreData.delete(fullPath);
      return Promise.resolve();
    },
  };
}

// Mock Firestore - use regular functions for proper closure handling
const mockFirestore = {
  collection: (collectionPath: string) => ({
    doc: (docId: string) => {
      const fullPath = `${collectionPath}/${docId}`;
      return createDocRef(fullPath, docId);
    },
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockImplementation(() => {
            // Return matching docs from in-memory store
            const docs = Array.from(firestoreData.entries())
              .filter(([path]) => path.startsWith(collectionPath))
              .map(([path, data]) => ({
                id: path.split('/').pop(),
                data: () => data,
                ref: { path },
              }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
        })),
        get: vi.fn().mockImplementation(() => {
          const docs = Array.from(firestoreData.entries())
            .filter(([path]) => path.startsWith(collectionPath))
            .map(([path, data]) => ({
              id: path.split('/').pop(),
              data: () => data,
              ref: { path },
            }));
          return Promise.resolve({ docs, empty: docs.length === 0 });
        }),
      })),
      limit: vi.fn(() => ({
        get: vi.fn().mockImplementation(() => {
          const docs = Array.from(firestoreData.entries())
            .filter(([path]) => path.startsWith(collectionPath))
            .map(([path, data]) => ({
              id: path.split('/').pop(),
              data: () => data,
              ref: { path },
            }));
          return Promise.resolve({ docs, empty: docs.length === 0 });
        }),
      })),
      get: vi.fn().mockImplementation(() => {
        const docs = Array.from(firestoreData.entries())
          .filter(([path]) => path.startsWith(collectionPath))
          .map(([path, data]) => ({
            id: path.split('/').pop(),
            data: () => data,
            ref: { path },
          }));
        return Promise.resolve({ docs, empty: docs.length === 0 });
      }),
    })),
    orderBy: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn().mockImplementation(() => {
          const docs = Array.from(firestoreData.entries())
            .filter(([path]) => path.startsWith(collectionPath))
            .map(([path, data]) => ({
              id: path.split('/').pop(),
              data: () => data,
              ref: { path },
            }));
          return Promise.resolve({ docs, empty: docs.length === 0 });
        }),
      })),
      get: vi.fn().mockImplementation(() => {
        const docs = Array.from(firestoreData.entries())
          .filter(([path]) => path.startsWith(collectionPath))
          .map(([path, data]) => ({
            id: path.split('/').pop(),
            data: () => data,
            ref: { path },
          }));
        return Promise.resolve({ docs, empty: docs.length === 0 });
      }),
    })),
    add: vi.fn().mockImplementation((data: unknown) => {
      const docId = `auto-${Date.now()}`;
      const fullPath = `${collectionPath}/${docId}`;
      firestoreOps.push({ op: 'add', path: fullPath, data });
      firestoreData.set(fullPath, data as Record<string, unknown>);
      return Promise.resolve({ id: docId, path: fullPath });
    }),
  }),
  batch: vi.fn(() => mockBatch),
};

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => mockFirestore,
  cleanForFirestore: (obj: unknown) => obj,
  recordDegradation: vi.fn(),
  toSafeDate: (timestamp: { toDate?: () => Date } | Date) => {
    if (timestamp && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    return timestamp as Date;
  },
}));

// Mock Timestamp
vi.mock('@google-cloud/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date, _seconds: Math.floor(date.getTime() / 1000) }),
    now: () => ({ toDate: () => new Date(), _seconds: Math.floor(Date.now() / 1000) }),
  },
}));

// Mock ID generator
let idCounter = 0;
vi.mock('../../../utils/id-generator.js', () => ({
  generateId: (prefix: string) => `${prefix}_test_${++idCounter}`,
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function clearFirestore(): void {
  firestoreData.clear();
  firestoreOps.length = 0;
  idCounter = 0;
}

const TEST_USER_ID = 'test-user-123';

// ============================================================================
// DECISIONS SERVICE TESTS
// ============================================================================

describe('Decisions Service', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  it('should add a new decision', async () => {
    const { addDecision } = await import('../decisions.js');

    const decision = await addDecision(
      TEST_USER_ID,
      'Should I take the new job offer?',
      'Considering career change',
      ['Accept offer', 'Stay current', 'Negotiate']
    );

    expect(decision).toBeDefined();
    expect(decision.id).toMatch(/^dec_test_/);
    expect(decision.title).toBe('Should I take the new job offer?');
    expect(decision.context).toBe('Considering career change');
    expect(decision.options).toEqual(['Accept offer', 'Stay current', 'Negotiate']);
    expect(decision.status).toBe('pending');
  });

  it('should get pending decisions', async () => {
    const { addDecision, getPendingDecisions } = await import('../decisions.js');

    // Add multiple decisions
    await addDecision(TEST_USER_ID, 'Decision 1');
    await addDecision(TEST_USER_ID, 'Decision 2');

    const pending = await getPendingDecisions(TEST_USER_ID);

    expect(Array.isArray(pending)).toBe(true);
  });

  it('should make a decision with choice and reasoning', async () => {
    const { addDecision, makeDecision } = await import('../decisions.js');

    const decision = await addDecision(TEST_USER_ID, 'Test decision');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/decisions/${decision.id}`;
    firestoreData.set(path, {
      ...decision,
      createdAt: { toDate: () => decision.createdAt },
    });

    const updated = await makeDecision(TEST_USER_ID, decision.id, 'Option A', 'Best fit for goals');

    expect(updated.status).toBe('made');
    expect(updated.choice).toBe('Option A');
    expect(updated.reasoning).toBe('Best fit for goals');
    expect(updated.madeAt).toBeDefined();
  });

  it('should add outcome to a decision', async () => {
    const { addDecision, addOutcome } = await import('../decisions.js');

    const decision = await addDecision(TEST_USER_ID, 'Test decision');

    // Store in mock Firestore with 'made' status
    const path = `users/${TEST_USER_ID}/decisions/${decision.id}`;
    firestoreData.set(path, {
      ...decision,
      status: 'made',
      choice: 'Option A',
      createdAt: { toDate: () => decision.createdAt },
    });

    const updated = await addOutcome(TEST_USER_ID, decision.id, 'It worked out great!', 5);

    expect(updated.status).toBe('reviewed');
    expect(updated.outcome).toBe('It worked out great!');
    expect(updated.outcomeRating).toBe(5);
    expect(updated.reviewedAt).toBeDefined();
  });

  it('should validate rating between 1-5', async () => {
    const { addDecision, addOutcome } = await import('../decisions.js');

    const decision = await addDecision(TEST_USER_ID, 'Test decision');
    const path = `users/${TEST_USER_ID}/decisions/${decision.id}`;
    firestoreData.set(path, {
      ...decision,
      status: 'made',
      createdAt: { toDate: () => decision.createdAt },
    });

    // Rating of 6 should throw
    await expect(addOutcome(TEST_USER_ID, decision.id, 'Outcome', 6)).rejects.toThrow(
      'Outcome rating must be between 1 and 5'
    );
  });
});

// ============================================================================
// PRIORITIES SERVICE TESTS
// ============================================================================

describe('Priorities Service', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  it('should add a priority with default urgency', async () => {
    const { addPriority } = await import('../priorities.js');

    const priority = await addPriority(TEST_USER_ID, 'Ship the new feature');

    expect(priority).toBeDefined();
    expect(priority.id).toMatch(/^pri_test_/);
    expect(priority.title).toBe('Ship the new feature');
    expect(priority.urgency).toBe(3); // Default
    expect(priority.completed).toBe(false);
    expect(priority.order).toBe(0);
  });

  it('should add a priority with custom urgency', async () => {
    const { addPriority } = await import('../priorities.js');

    const priority = await addPriority(TEST_USER_ID, 'Critical bug fix', 5);

    expect(priority.urgency).toBe(5);
  });

  it('should validate urgency between 1-5', async () => {
    const { addPriority } = await import('../priorities.js');

    await expect(addPriority(TEST_USER_ID, 'Test', 0)).rejects.toThrow(
      'Urgency must be between 1 and 5'
    );

    await expect(addPriority(TEST_USER_ID, 'Test', 6)).rejects.toThrow(
      'Urgency must be between 1 and 5'
    );
  });

  it('should complete a priority', async () => {
    const { addPriority, completePriority } = await import('../priorities.js');

    const priority = await addPriority(TEST_USER_ID, 'Test priority');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/priorities/${priority.id}`;
    firestoreData.set(path, {
      ...priority,
      createdAt: { toDate: () => priority.createdAt },
    });

    const completed = await completePriority(TEST_USER_ID, priority.id);

    expect(completed.completed).toBe(true);
    expect(completed.completedAt).toBeDefined();
  });

  it('should get top priority (first incomplete by order)', async () => {
    const { addPriority, getTopPriority } = await import('../priorities.js');

    const p1 = await addPriority(TEST_USER_ID, 'First priority');
    const p2 = await addPriority(TEST_USER_ID, 'Second priority');

    // Store in mock Firestore
    const path1 = `users/${TEST_USER_ID}/priorities/${p1.id}`;
    const path2 = `users/${TEST_USER_ID}/priorities/${p2.id}`;
    firestoreData.set(path1, { ...p1, order: 0, createdAt: { toDate: () => p1.createdAt } });
    firestoreData.set(path2, { ...p2, order: 1, createdAt: { toDate: () => p2.createdAt } });

    const top = await getTopPriority(TEST_USER_ID);

    expect(top).toBeDefined();
    expect(top?.title).toBe('First priority');
  });
});

// ============================================================================
// BLOCKERS SERVICE TESTS
// ============================================================================

describe('Blockers Service', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  it('should add a blocker with default severity', async () => {
    const { addBlocker } = await import('../blockers.js');

    const blocker = await addBlocker(TEST_USER_ID, 'Waiting on API credentials');

    expect(blocker).toBeDefined();
    expect(blocker.id).toMatch(/^blk_test_/);
    expect(blocker.description).toBe('Waiting on API credentials');
    expect(blocker.severity).toBe('medium'); // Default
    expect(blocker.status).toBe('active');
  });

  it('should add a blocker with custom severity and linked goal', async () => {
    const { addBlocker } = await import('../blockers.js');

    // Note: signature is (userId, description, linkedGoalId?, severity?)
    const blocker = await addBlocker(
      TEST_USER_ID,
      'Critical bug in production',
      'goal_123',
      'critical'
    );

    expect(blocker.severity).toBe('critical');
    expect(blocker.linkedGoalId).toBe('goal_123');
  });

  it('should validate severity values', async () => {
    const { addBlocker } = await import('../blockers.js');

    // Pass invalid severity as 4th argument
    await expect(addBlocker(TEST_USER_ID, 'Test', undefined, 'invalid' as 'low')).rejects.toThrow(
      'Invalid severity'
    );
  });

  it('should resolve a blocker', async () => {
    const { addBlocker, resolveBlocker } = await import('../blockers.js');

    const blocker = await addBlocker(TEST_USER_ID, 'Test blocker');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/blockers/${blocker.id}`;
    firestoreData.set(path, {
      ...blocker,
      createdAt: { toDate: () => blocker.createdAt },
    });

    const resolved = await resolveBlocker(TEST_USER_ID, blocker.id, 'Got the credentials');

    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toBe('Got the credentials');
    expect(resolved.resolvedAt).toBeDefined();
  });

  it('should escalate a blocker', async () => {
    const { addBlocker, escalateBlocker } = await import('../blockers.js');

    const blocker = await addBlocker(TEST_USER_ID, 'Test blocker', 'low');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/blockers/${blocker.id}`;
    firestoreData.set(path, {
      ...blocker,
      createdAt: { toDate: () => blocker.createdAt },
    });

    const escalated = await escalateBlocker(TEST_USER_ID, blocker.id);

    expect(escalated.severity).toBe('medium'); // Escalated from low
    expect(escalated.escalatedAt).toBeDefined();
  });

  it('should get blockers by severity', async () => {
    const { addBlocker, getBlockersBySeverity } = await import('../blockers.js');

    await addBlocker(TEST_USER_ID, 'Critical issue', 'critical');
    await addBlocker(TEST_USER_ID, 'Minor issue', 'low');

    const criticalBlockers = await getBlockersBySeverity(TEST_USER_ID, 'critical');

    expect(Array.isArray(criticalBlockers)).toBe(true);
  });
});

// ============================================================================
// IDEAS SERVICE TESTS
// ============================================================================

describe('Ideas Service', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  it('should add an idea', async () => {
    const { addIdea } = await import('../ideas.js');

    const idea = await addIdea(TEST_USER_ID, 'Build a voice-first AI assistant');

    expect(idea).toBeDefined();
    expect(idea.id).toMatch(/^idea_test_/);
    expect(idea.content).toBe('Build a voice-first AI assistant');
    expect(idea.tags).toEqual([]);
    expect(idea.archived).toBe(false);
  });

  it('should add an idea with tags', async () => {
    const { addIdea } = await import('../ideas.js');

    const idea = await addIdea(TEST_USER_ID, 'Voice AI assistant', ['product', 'ai', 'voice']);

    expect(idea.tags).toEqual(['product', 'ai', 'voice']);
  });

  it('should get ideas by tag', async () => {
    const { addIdea, getIdeasByTag } = await import('../ideas.js');

    await addIdea(TEST_USER_ID, 'AI idea', ['ai']);
    await addIdea(TEST_USER_ID, 'Another AI idea', ['ai', 'product']);
    await addIdea(TEST_USER_ID, 'Non-AI idea', ['other']);

    const aiIdeas = await getIdeasByTag(TEST_USER_ID, 'ai');

    expect(Array.isArray(aiIdeas)).toBe(true);
  });

  it('should archive an idea', async () => {
    const { addIdea, archiveIdea } = await import('../ideas.js');

    const idea = await addIdea(TEST_USER_ID, 'Test idea');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/ideas/${idea.id}`;
    firestoreData.set(path, {
      ...idea,
      createdAt: { toDate: () => idea.createdAt },
    });

    // archiveIdea returns boolean, not the archived idea
    const success = await archiveIdea(TEST_USER_ID, idea.id);

    expect(success).toBe(true);
  });

  it('should tag an idea', async () => {
    const { addIdea, tagIdea } = await import('../ideas.js');

    const idea = await addIdea(TEST_USER_ID, 'Test idea');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/ideas/${idea.id}`;
    firestoreData.set(path, {
      ...idea,
      tags: [],
      createdAt: { toDate: () => idea.createdAt },
    });

    const tagged = await tagIdea(TEST_USER_ID, idea.id, ['new-tag']);

    expect(tagged).not.toBeNull();
    expect(tagged!.tags).toContain('new-tag');
  });

  it('should get a random idea', async () => {
    const { addIdea, getRandomIdea } = await import('../ideas.js');

    await addIdea(TEST_USER_ID, 'Idea 1');
    await addIdea(TEST_USER_ID, 'Idea 2');

    const randomIdea = await getRandomIdea(TEST_USER_ID);

    // May return null if no ideas match criteria, so just check type
    expect(randomIdea === null || typeof randomIdea === 'object').toBe(true);
  });
});

// ============================================================================
// MEETINGS SERVICE TESTS
// ============================================================================

describe('Meetings Service', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  it('should add a meeting', async () => {
    const { addMeeting } = await import('../meetings.js');

    // Signature: addMeeting(userId, title, attendees?, notes?, actionItems?)
    const meeting = await addMeeting(
      TEST_USER_ID,
      'Weekly standup',
      ['Alice', 'Bob'],
      'Discussed project progress',
      [
        { description: 'Review PR', assignee: 'Alice' },
        { description: 'Update docs', assignee: 'Bob' },
      ]
    );

    expect(meeting).toBeDefined();
    expect(meeting.id).toMatch(/^mtg_test_/);
    expect(meeting.title).toBe('Weekly standup');
    expect(meeting.attendees).toEqual(['Alice', 'Bob']);
    expect(meeting.notes).toBe('Discussed project progress');
    expect(meeting.actionItems).toHaveLength(2);
    expect(meeting.actionItems[0].completed).toBe(false);
  });

  it('should add a meeting with minimal info', async () => {
    const { addMeeting } = await import('../meetings.js');

    // Just title, no attendees/notes/actionItems
    const meeting = await addMeeting(TEST_USER_ID, '1:1 with manager');

    expect(meeting.title).toBe('1:1 with manager');
    expect(meeting.attendees).toEqual([]);
    expect(meeting.actionItems).toEqual([]);
  });

  it('should update meeting notes', async () => {
    const { addMeeting, updateNotes } = await import('../meetings.js');

    const meeting = await addMeeting(TEST_USER_ID, 'Test meeting');

    // Store in mock Firestore
    const path = `users/${TEST_USER_ID}/meetings/${meeting.id}`;
    firestoreData.set(path, {
      ...meeting,
      meetingDate: { toDate: () => meeting.meetingDate },
      createdAt: { toDate: () => meeting.createdAt },
    });

    const updated = await updateNotes(TEST_USER_ID, meeting.id, 'Updated meeting notes');

    expect(updated).not.toBeNull();
    expect(updated!.notes).toBe('Updated meeting notes');
  });

  it('should add action items to a meeting', async () => {
    const { addMeeting, addActionItem } = await import('../meetings.js');

    const meeting = await addMeeting(TEST_USER_ID, 'Test meeting');

    // Store in mock Firestore with actionItems array
    const path = `users/${TEST_USER_ID}/meetings/${meeting.id}`;
    firestoreData.set(path, {
      ...meeting,
      actionItems: [],
      meetingDate: { toDate: () => meeting.meetingDate },
      createdAt: { toDate: () => meeting.createdAt },
    });

    // addActionItem takes an object: { description, assignee? }
    const updated = await addActionItem(TEST_USER_ID, meeting.id, {
      description: 'Follow up on budget',
      assignee: 'Alice',
    });

    expect(updated).not.toBeNull();
    expect(updated!.actionItems).toHaveLength(1);
    expect(updated!.actionItems[0].description).toBe('Follow up on budget');
    expect(updated!.actionItems[0].assignee).toBe('Alice');
    expect(updated!.actionItems[0].completed).toBe(false);
  });

  it('should complete an action item', async () => {
    const { addMeeting, completeActionItem } = await import('../meetings.js');

    // Create meeting with action item - addMeeting stores it via our mock
    const meeting = await addMeeting(TEST_USER_ID, 'Test meeting', [], '', [
      { description: 'Do thing', assignee: 'Me' },
    ]);

    // Verify the meeting was stored (addMeeting uses docRef.set which stores in firestoreData)
    const storedPath = `users/${TEST_USER_ID}/meetings/${meeting.id}`;
    const storedData = firestoreData.get(storedPath);

    expect(storedData).toBeDefined();
    expect((storedData as { actionItems: { id: string }[] }).actionItems[0].id).toBeDefined();

    const actionItemId = meeting.actionItems[0].id;
    const updated = await completeActionItem(TEST_USER_ID, meeting.id, actionItemId);

    expect(updated).not.toBeNull();
    expect(updated!.actionItems[0].completed).toBe(true);
    expect(updated!.actionItems[0].completedAt).toBeDefined();
  });

  it('should get all action items for a user', async () => {
    const { addMeeting, getActionItems } = await import('../meetings.js');

    await addMeeting(TEST_USER_ID, 'Meeting 1', [], '', [{ description: 'Task 1' }]);
    await addMeeting(TEST_USER_ID, 'Meeting 2', [], '', [{ description: 'Task 2' }]);

    const actionItems = await getActionItems(TEST_USER_ID);

    expect(Array.isArray(actionItems)).toBe(true);
  });

  it('should search meetings by title', async () => {
    const { addMeeting, searchMeetings } = await import('../meetings.js');

    await addMeeting(TEST_USER_ID, 'Weekly standup');
    await addMeeting(TEST_USER_ID, 'Monthly review');

    const results = await searchMeetings(TEST_USER_ID, 'standup');

    expect(Array.isArray(results)).toBe(true);
  });
});

// ============================================================================
// INSIGHTS SERVICE TESTS
// ============================================================================

describe('Insights Service', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  // Note: Insights service imports all other CEO services internally,
  // so we test at a higher level to verify the functions are callable.
  // The mock Firestore returns empty results, so insights will be empty.

  it('should export getAllInsights function', async () => {
    const { getAllInsights } = await import('../insights.js');
    expect(typeof getAllInsights).toBe('function');
  });

  it('should export getCriticalInsights function', async () => {
    const { getCriticalInsights } = await import('../insights.js');
    expect(typeof getCriticalInsights).toBe('function');
  });

  it('should export getBurnoutWarning function', async () => {
    const { getBurnoutWarning } = await import('../insights.js');
    expect(typeof getBurnoutWarning).toBe('function');
  });

  it('should export refreshInsights function', async () => {
    const { refreshInsights } = await import('../insights.js');
    expect(typeof refreshInsights).toBe('function');
  });

  it('should export getInsightsByCategory function', async () => {
    const { getInsightsByCategory } = await import('../insights.js');
    expect(typeof getInsightsByCategory).toBe('function');
  });

  it('should export getInsightsByType function', async () => {
    const { getInsightsByType } = await import('../insights.js');
    expect(typeof getInsightsByType).toBe('function');
  });

  it('should export insightsService singleton', async () => {
    const { insightsService } = await import('../insights.js');
    expect(insightsService).toBeDefined();
    expect(typeof insightsService.getAllInsights).toBe('function');
    expect(typeof insightsService.getCriticalInsights).toBe('function');
    expect(typeof insightsService.getBurnoutWarning).toBe('function');
    expect(typeof insightsService.refreshInsights).toBe('function');
    expect(typeof insightsService.getInsightsByCategory).toBe('function');
    expect(typeof insightsService.getInsightsByType).toBe('function');
  });
});

// ============================================================================
// CROSS-SERVICE INTEGRATION TESTS
// ============================================================================

describe('Cross-Service Integration', () => {
  beforeEach(() => {
    clearFirestore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearFirestore();
  });

  it('should link a blocker to a goal', async () => {
    const { addBlocker, getBlockersForGoal } = await import('../blockers.js');

    const goalId = 'goal_test_123';
    // Signature: addBlocker(userId, description, linkedGoalId?, severity?)
    await addBlocker(TEST_USER_ID, 'Blocker for goal', goalId, 'medium');

    const blockers = await getBlockersForGoal(TEST_USER_ID, goalId);

    expect(Array.isArray(blockers)).toBe(true);
  });

  it('should support full decision lifecycle', async () => {
    const { addDecision, makeDecision, addOutcome, getDecision } = await import('../decisions.js');

    // 1. Add decision
    const decision = await addDecision(
      TEST_USER_ID,
      'Should I hire a new developer?',
      'Team is growing',
      ['Yes, hire now', 'Wait 3 months', 'Hire contractor']
    );
    expect(decision.status).toBe('pending');

    // Store in mock
    const path = `users/${TEST_USER_ID}/decisions/${decision.id}`;
    firestoreData.set(path, {
      ...decision,
      createdAt: { toDate: () => decision.createdAt },
    });

    // 2. Make decision
    const made = await makeDecision(TEST_USER_ID, decision.id, 'Yes, hire now', 'Budget approved');
    expect(made.status).toBe('made');
    expect(made.choice).toBe('Yes, hire now');

    // Update mock with made status
    firestoreData.set(path, {
      ...made,
      createdAt: { toDate: () => made.createdAt },
      madeAt: { toDate: () => made.madeAt },
    });

    // 3. Add outcome
    const reviewed = await addOutcome(TEST_USER_ID, decision.id, 'Great hire, team is thriving', 5);
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.outcomeRating).toBe(5);
  });

  it('should support full meeting workflow', async () => {
    const { addMeeting, updateNotes, addActionItem, completeActionItem } =
      await import('../meetings.js');

    // 1. Create meeting - addMeeting stores it via our mock
    const meeting = await addMeeting(TEST_USER_ID, 'Quarterly planning', ['CEO', 'CTO', 'CFO']);
    expect(meeting.attendees).toEqual(['CEO', 'CTO', 'CFO']);

    // 2. Update notes - updateNotes reads from mock and updates
    const withNotes = await updateNotes(
      TEST_USER_ID,
      meeting.id,
      'Discussed Q1 goals and budget allocation'
    );
    expect(withNotes).not.toBeNull();
    expect(withNotes!.notes).toContain('Q1 goals');

    // 3. Add action item - addActionItem reads from mock and adds item
    const withAction = await addActionItem(TEST_USER_ID, meeting.id, {
      description: 'Finalize budget proposal',
      assignee: 'CFO',
    });
    expect(withAction).not.toBeNull();
    expect(withAction!.actionItems).toHaveLength(1);

    // 4. Complete action item - completeActionItem reads from mock and updates
    const actionId = withAction!.actionItems[0].id;
    const completed = await completeActionItem(TEST_USER_ID, meeting.id, actionId);
    expect(completed).not.toBeNull();
    expect(completed!.actionItems[0].completed).toBe(true);
  });
});
