/**
 * Unit Tests for Meeting Memory Service
 *
 * Tests the "better than human" memory-enriched meeting intelligence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Import after mocking
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import {
  getMeetingAttendeeContext,
  enrichPreMeetingBriefing,
  recordMeetingInteraction,
  updateContactNotes,
} from '../meeting-memory-service.js';

const mockedGetFirestoreDb = vi.mocked(getFirestoreDb);

describe('Meeting Memory Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // getMeetingAttendeeContext
  // =========================================================================

  describe('getMeetingAttendeeContext', () => {
    it('should return empty context when Firestore is unavailable', async () => {
      mockedGetFirestoreDb.mockReturnValue(null);

      const context = await getMeetingAttendeeContext('user-123', 'john@example.com');

      expect(context).toBeDefined();
      expect(context?.attendeeEmail).toBe('john@example.com');
      expect(context?.displayName).toBe('John');
      expect(context?.relationship.type).toBe('unknown');
      expect(context?.relationship.interactionCount).toBe(0);
    });

    it('should return empty context when no interactions exist', async () => {
      const mockDb = createMockFirestore();
      mockDb.mockQueryEmpty();
      mockDb.mockDocNotExists();
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      const context = await getMeetingAttendeeContext('user-123', 'jane@example.com');

      expect(context?.relationship.interactionCount).toBe(0);
      expect(context?.displayName).toBe('Jane');
    });

    it('should extract name from email correctly', async () => {
      mockedGetFirestoreDb.mockReturnValue(null);

      const context1 = await getMeetingAttendeeContext('user-123', 'john.doe@company.com');
      expect(context1?.displayName).toBe('John Doe');

      const context2 = await getMeetingAttendeeContext('user-123', 'jane_smith@company.com');
      expect(context2?.displayName).toBe('Jane Smith');
    });

    it('should return interaction data when history exists', async () => {
      const mockDb = createMockFirestore();
      mockDb.mockQueryResults([
        {
          date: new Date().toISOString(),
          personEmail: 'client@example.com',
          personName: 'Important Client',
          topics: ['Q4 Review', 'Budget'],
          commitmentsMade: ['Send proposal by Friday'],
          commitmentsByThem: ['Review contract'],
          meetingTitle: 'Quarterly Check-in',
        },
      ]);
      mockDb.mockDocNotExists();
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      const context = await getMeetingAttendeeContext('user-123', 'client@example.com');

      expect(context?.lastInteraction).toBeDefined();
      expect(context?.lastInteraction?.topics).toContain('Q4 Review');
      expect(context?.lastInteraction?.commitmentsMade).toContain('Send proposal by Friday');
      expect(context?.relationship.interactionCount).toBe(1);
    });

    it('should calculate meeting frequency correctly', async () => {
      const mockDb = createMockFirestore();
      const now = Date.now();
      mockDb.mockQueryResults([
        {
          date: new Date(now).toISOString(),
          personEmail: 'weekly@example.com',
          topics: [],
          commitmentsMade: [],
          commitmentsByThem: [],
          meetingTitle: 'Weekly',
        },
        {
          date: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
          personEmail: 'weekly@example.com',
          topics: [],
          commitmentsMade: [],
          commitmentsByThem: [],
          meetingTitle: 'Weekly',
        },
        {
          date: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
          personEmail: 'weekly@example.com',
          topics: [],
          commitmentsMade: [],
          commitmentsByThem: [],
          meetingTitle: 'Weekly',
        },
      ]);
      mockDb.mockDocNotExists();
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      const context = await getMeetingAttendeeContext('user-123', 'weekly@example.com');

      expect(context?.patterns.meetingFrequency).toBe('weekly');
    });

    it('should include personal notes when available', async () => {
      const mockDb = createMockFirestore();
      mockDb.mockQueryEmpty();
      mockDb.mockDocExists({
        email: 'noted@example.com',
        notes: ['Prefers morning meetings', 'Has two kids'],
        relationshipType: 'client',
      });
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      const context = await getMeetingAttendeeContext('user-123', 'noted@example.com');

      expect(context?.personalNotes).toContain('Prefers morning meetings');
      expect(context?.relationship.type).toBe('client');
    });
  });

  // =========================================================================
  // enrichPreMeetingBriefing
  // =========================================================================

  describe('enrichPreMeetingBriefing', () => {
    it('should generate enriched briefing for upcoming meeting', async () => {
      mockedGetFirestoreDb.mockReturnValue(null);

      const meetingStart = new Date(Date.now() + 15 * 60 * 1000); // 15 min from now
      const briefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-1',
        title: 'Product Demo',
        startTime: meetingStart,
        endTime: new Date(meetingStart.getTime() + 60 * 60 * 1000),
        attendees: ['client@example.com'],
      });

      expect(briefing.eventTitle).toBe('Product Demo');
      expect(briefing.minutesUntil).toBeCloseTo(15, 0);
      expect(briefing.standardTips.length).toBeGreaterThan(0);
    });

    it('should include memory-enriched context for attendees', async () => {
      const mockDb = createMockFirestore();
      mockDb.mockQueryResults([
        {
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          personEmail: 'partner@example.com',
          topics: ['Partnership', 'Integration'],
          commitmentsMade: ['Send API docs'],
          commitmentsByThem: [],
          meetingTitle: 'Partnership Discussion',
        },
      ]);
      mockDb.mockDocNotExists();
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      const meetingStart = new Date(Date.now() + 60 * 60 * 1000);
      const briefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-2',
        title: 'Follow-up Meeting',
        startTime: meetingStart,
        endTime: new Date(meetingStart.getTime() + 30 * 60 * 1000),
        attendees: ['partner@example.com'],
      });

      expect(briefing.relationshipContext.length).toBe(1);
      expect(briefing.pastTopics).toContain('Partnership');
      expect(briefing.openCommitments).toContain('Send API docs');
    });

    it('should suggest catch-up when long time since last meeting', async () => {
      const mockDb = createMockFirestore();
      mockDb.mockQueryResults([
        {
          date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
          personEmail: 'old.contact@example.com',
          topics: ['Old project'],
          commitmentsMade: [],
          commitmentsByThem: [],
          meetingTitle: 'Last Meeting',
        },
      ]);
      mockDb.mockDocNotExists();
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      const meetingStart = new Date(Date.now() + 60 * 60 * 1000);
      const briefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-3',
        title: 'Reconnecting',
        startTime: meetingStart,
        endTime: new Date(meetingStart.getTime() + 30 * 60 * 1000),
        attendees: ['old.contact@example.com'],
      });

      const hasCatchUp = briefing.suggestedAgendaItems.some(
        (item) => item.includes('Catch up') || item.includes("haven't met")
      );
      expect(hasCatchUp).toBe(true);
    });

    it('should assess priority based on meeting type and attendees', async () => {
      mockedGetFirestoreDb.mockReturnValue(null);

      const meetingStart = new Date(Date.now() + 60 * 60 * 1000);

      // Interview = high priority
      const interviewBriefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-4',
        title: 'Engineering Interview',
        startTime: meetingStart,
        endTime: new Date(meetingStart.getTime() + 60 * 60 * 1000),
        attendees: ['candidate@example.com'],
      });
      expect(interviewBriefing.priority).toBe('high');
      expect(interviewBriefing.priorityReason).toContain('High-stakes');

      // Regular meeting = low priority
      const regularBriefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-5',
        title: 'Team Standup',
        startTime: meetingStart,
        endTime: new Date(meetingStart.getTime() + 15 * 60 * 1000),
        attendees: ['colleague@example.com'],
      });
      expect(regularBriefing.priority).toBe('low');
    });

    it('should generate time-appropriate tips', async () => {
      mockedGetFirestoreDb.mockReturnValue(null);

      // Meeting in 3 minutes
      const soonMeeting = new Date(Date.now() + 3 * 60 * 1000);
      const soonBriefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-6',
        title: 'Quick Call',
        startTime: soonMeeting,
        endTime: new Date(soonMeeting.getTime() + 15 * 60 * 1000),
        attendees: [],
      });
      expect(soonBriefing.standardTips.some((t) => t.includes('breath'))).toBe(true);

      // Meeting in 30 minutes
      const laterMeeting = new Date(Date.now() + 30 * 60 * 1000);
      const laterBriefing = await enrichPreMeetingBriefing('user-123', {
        id: 'event-7',
        title: 'Planning Session',
        startTime: laterMeeting,
        endTime: new Date(laterMeeting.getTime() + 60 * 60 * 1000),
        attendees: [],
      });
      expect(
        laterBriefing.standardTips.some((t) => t.includes('Review') || t.includes('Prepare'))
      ).toBe(true);
    });
  });

  // =========================================================================
  // recordMeetingInteraction
  // =========================================================================

  describe('recordMeetingInteraction', () => {
    it('should record interaction to Firestore', async () => {
      const mockDb = createMockFirestore();
      const mockSet = vi.fn().mockResolvedValue(undefined);
      mockDb.collection = vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({ set: mockSet }),
          }),
        }),
      });
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      await recordMeetingInteraction('user-123', {
        personEmail: 'partner@example.com',
        personName: 'Business Partner',
        topics: ['Contract renewal', 'Pricing'],
        commitmentsMade: ['Send updated proposal'],
        commitmentsByThem: ['Review by Friday'],
        meetingTitle: 'Contract Discussion',
      });

      expect(mockSet).toHaveBeenCalled();
      const [storedData] = mockSet.mock.calls[0];
      expect(storedData.personEmail).toBe('partner@example.com');
      expect(storedData.topics).toContain('Contract renewal');
    });

    it('should handle Firestore unavailability gracefully', async () => {
      mockedGetFirestoreDb.mockReturnValue(null);

      // Should not throw
      await expect(
        recordMeetingInteraction('user-123', {
          personEmail: 'test@example.com',
          topics: ['Test'],
          commitmentsMade: [],
          meetingTitle: 'Test Meeting',
        })
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // updateContactNotes
  // =========================================================================

  describe('updateContactNotes', () => {
    it('should update contact notes in Firestore', async () => {
      const mockDb = createMockFirestore();
      const mockSet = vi.fn().mockResolvedValue(undefined);
      mockDb.collection = vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({ set: mockSet }),
          }),
        }),
      });
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      await updateContactNotes(
        'user-123',
        'vip@example.com',
        ['Always runs late', 'Prefers email follow-ups'],
        'client'
      );

      expect(mockSet).toHaveBeenCalled();
      const [storedData] = mockSet.mock.calls[0];
      expect(storedData.email).toBe('vip@example.com');
      expect(storedData.notes).toContain('Always runs late');
      expect(storedData.relationshipType).toBe('client');
    });

    it('should normalize email for document ID', async () => {
      const mockDb = createMockFirestore();
      const mockDoc = vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
      mockDb.collection = vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: mockCollection,
        }),
      });
      mockedGetFirestoreDb.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestoreDb>);

      await updateContactNotes('user-123', 'John.Doe@Example.COM', ['Note'], 'colleague');

      // Should convert to lowercase and replace special chars
      expect(mockDoc).toHaveBeenCalledWith('john_doe_example_com');
    });
  });
});

// =========================================================================
// Helper: Mock Firestore
// =========================================================================

function createMockFirestore() {
  let queryResults: unknown[] = [];
  let docData: unknown = null;
  let docExists = false;

  const mockDoc = {
    get: vi.fn().mockImplementation(() =>
      Promise.resolve({
        exists: docExists,
        data: () => docData,
      })
    ),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: vi.fn().mockReturnValue(mockDoc),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockImplementation(() =>
      Promise.resolve({
        docs: queryResults.map((data) => ({
          data: () => data,
        })),
        empty: queryResults.length === 0,
      })
    ),
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue(mockCollection),
      }),
    }),
    mockQueryResults: (results: unknown[]) => {
      queryResults = results;
    },
    mockQueryEmpty: () => {
      queryResults = [];
    },
    mockDocExists: (data: unknown) => {
      docExists = true;
      docData = data;
    },
    mockDocNotExists: () => {
      docExists = false;
      docData = null;
    },
  };
}
