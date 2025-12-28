/**
 * Returning Visitor Personalization Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted for mock that needs to be referenced
const { mockGetFirestore, mockGenerateJSON } = vi.hoisted(() => ({
  mockGetFirestore: vi.fn(),
  mockGenerateJSON: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../utils/firestore-utils.js', () => ({
  removeUndefined: (obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: mockGetFirestore,
}));

vi.mock('../gemini-client.js', () => ({
  generateJSON: mockGenerateJSON,
}));

import {
  recordVisitorSession,
  getReturningVisitorContext,
  getReturningVisitorExperience,
  generateVisitorId,
  type VisitorSession,
  type ReturningVisitorContext,
} from '../returning-visitor.js';

describe('ReturningVisitor', () => {
  const mockDoc = {
    exists: true,
    data: vi.fn(),
  };

  const mockDocRef = {
    get: vi.fn().mockResolvedValue(mockDoc),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: vi.fn().mockReturnValue(mockDocRef),
  };

  const mockTx = {
    get: vi.fn().mockResolvedValue(mockDoc),
    set: vi.fn(),
    update: vi.fn(),
  };

  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollection),
    runTransaction: vi.fn((fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFirestore.mockReturnValue(mockDb);
    mockGenerateJSON.mockResolvedValue(null);
    mockDoc.data.mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateVisitorId', () => {
    it('should generate unique visitor IDs', () => {
      const id1 = generateVisitorId();
      const id2 = generateVisitorId();

      expect(id1).not.toBe(id2);
    });

    it('should start with fv_ prefix', () => {
      const id = generateVisitorId();

      expect(id).toMatch(/^fv_/);
    });

    it('should contain timestamp and random parts', () => {
      const id = generateVisitorId();
      const parts = id.split('_');

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('fv');
    });
  });

  describe('recordVisitorSession', () => {
    it('should record session to active sessions', () => {
      const session: VisitorSession = {
        visitorId: 'visitor-123',
        sessionId: 'session-456',
        startTime: new Date(),
        sectionsViewed: ['hero', 'pricing'],
        timePerSection: { hero: 10, pricing: 20 },
        scrollDepth: 50,
        ctaClicks: 1,
        variantsSeen: ['variant-a'],
        converted: false,
      };

      // Should not throw
      expect(() => recordVisitorSession(session)).not.toThrow();
    });

    it('should persist session to Firestore', async () => {
      const session: VisitorSession = {
        visitorId: 'visitor-123',
        sessionId: 'session-789',
        startTime: new Date(),
        endTime: new Date(),
        sectionsViewed: ['hero'],
        timePerSection: {},
        scrollDepth: 25,
        ctaClicks: 0,
        variantsSeen: [],
        converted: false,
      };

      recordVisitorSession(session);

      // Give async operation time to complete
      await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

      expect(mockDb.runTransaction).toHaveBeenCalled();
    });
  });

  describe('getReturningVisitorContext', () => {
    it('should return null for new visitor', async () => {
      mockDoc.exists = false;

      const context = await getReturningVisitorContext('new-visitor');

      expect(context).toBeNull();
    });

    it('should return context for existing visitor', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue({
        firstVisit: { toDate: () => new Date('2024-01-01') },
        lastVisit: { toDate: () => new Date('2024-12-01') },
        visitCount: 5,
        topSections: ['pricing', 'faq'],
        totalTimeSpent: 300,
        conversionAttempts: 2,
        abandonmentPoints: ['signup'],
        seenVariants: ['v1', 'v2'],
        hasStartedSignup: true,
        preferredTimeOfDay: 'evening',
      });

      const context = await getReturningVisitorContext('visitor-123');

      expect(context).not.toBeNull();
      expect(context?.visitCount).toBe(5);
      expect(context?.topSections).toContain('pricing');
      expect(context?.hasStartedSignup).toBe(true);
    });

    it('should handle Firestore errors gracefully', async () => {
      mockCollection.doc.mockImplementationOnce(() => {
        throw new Error('Firestore error');
      });

      const context = await getReturningVisitorContext('error-visitor');

      expect(context).toBeNull();
    });
  });

  describe('getReturningVisitorExperience', () => {
    const createVisitorContext = (overrides: Partial<ReturningVisitorContext> = {}): ReturningVisitorContext => ({
      visitorId: 'visitor-123',
      firstVisit: new Date('2024-01-01'),
      lastVisit: new Date('2024-12-01'),
      visitCount: 2,
      topSections: ['hero'],
      totalTimeSpent: 60,
      conversionAttempts: 0,
      abandonmentPoints: [],
      seenVariants: [],
      hasStartedSignup: false,
      ...overrides,
    });

    it('should return welcome back for second visit', async () => {
      const experience = await getReturningVisitorExperience(
        createVisitorContext({ visitCount: 2 })
      );

      expect(experience.welcomeMessage).toBe('Welcome back.');
      expect(experience.chatBehavior).toBe('passive');
    });

    it('should address hesitation on third visit with CTA attempts', async () => {
      const experience = await getReturningVisitorExperience(
        createVisitorContext({
          visitCount: 3,
          conversionAttempts: 2,
        })
      );

      expect(experience.welcomeMessage).toBe('Ready when you are.');
      expect(experience.heroOverride).toBeDefined();
      expect(experience.surfaceFirst).toBe('faq');
      expect(experience.chatBehavior).toBe('proactive');
    });

    it('should offer trial for frequent pricing viewers', async () => {
      const experience = await getReturningVisitorExperience(
        createVisitorContext({
          visitCount: 5,
          topSections: ['pricing', 'faq'],
        })
      );

      expect(experience.surfaceFirst).toBe('pricing');
      expect(experience.specialOffer).toBeDefined();
      expect(experience.specialOffer?.type).toBe('trial_extension');
    });

    it('should use AI for complex cases', async () => {
      mockGenerateJSON.mockResolvedValue({
        welcomeMessage: 'Custom AI message',
        chatBehavior: 'proactive',
        reasoning: 'AI reasoning',
      });

      const experience = await getReturningVisitorExperience(
        createVisitorContext({
          visitCount: 10,
          conversionAttempts: 5,
          topSections: ['team', 'showcase'],
        })
      );

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(experience.welcomeMessage).toBe('Custom AI message');
    });

    it('should fallback to default when AI fails', async () => {
      mockGenerateJSON.mockResolvedValue(null);

      const experience = await getReturningVisitorExperience(
        createVisitorContext({
          visitCount: 10,
        })
      );

      expect(experience.welcomeMessage).toBeDefined();
      expect(experience.chatBehavior).toBeDefined();
    });

    it('should adjust welcome for long absence', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

      const experience = await getReturningVisitorExperience(
        createVisitorContext({
          visitCount: 5,
          lastVisit: oldDate,
        })
      );

      expect(experience.welcomeMessage).toBe('Good to see you again.');
    });

    it('should adjust welcome for week-long absence', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const experience = await getReturningVisitorExperience(
        createVisitorContext({
          visitCount: 5,
          lastVisit: oldDate,
        })
      );

      expect(experience.welcomeMessage).toBe("It's been a while.");
    });
  });

  describe('Experience Heuristics', () => {
    const createContext = (overrides: Partial<ReturningVisitorContext> = {}): ReturningVisitorContext => ({
      visitorId: 'visitor-123',
      firstVisit: new Date('2024-01-01'),
      lastVisit: new Date(),
      visitCount: 2,
      topSections: ['hero'],
      totalTimeSpent: 60,
      conversionAttempts: 0,
      abandonmentPoints: [],
      seenVariants: [],
      hasStartedSignup: false,
      ...overrides,
    });

    it('should be passive for second visit', async () => {
      const experience = await getReturningVisitorExperience(
        createContext({ visitCount: 2 })
      );

      expect(experience.chatBehavior).toBe('passive');
    });

    it('should be proactive after many visits', async () => {
      const experience = await getReturningVisitorExperience(
        createContext({ visitCount: 5 })
      );

      expect(experience.chatBehavior).toBe('proactive');
    });

    it('should include chat greeting for CTA hesitation', async () => {
      const experience = await getReturningVisitorExperience(
        createContext({
          visitCount: 3,
          conversionAttempts: 3,
        })
      );

      expect(experience.chatGreeting).toBeDefined();
      expect(experience.chatGreeting).toContain('?');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      // Reset doc mock to return docRef (fix after error test)
      mockCollection.doc.mockReturnValue(mockDocRef);
      mockDoc.exists = true;
    });

    it('should handle missing dates gracefully', async () => {
      mockDoc.data.mockReturnValue({
        visitCount: 3,
        // Missing dates - implementation uses fallbacks
      });

      const context = await getReturningVisitorContext('visitor-no-dates');

      expect(context).not.toBeNull();
      expect(context?.firstVisit).toBeDefined();
      expect(context?.lastVisit).toBeDefined();
    });

    it('should handle missing arrays gracefully', async () => {
      mockDoc.data.mockReturnValue({
        visitCount: 2,
        firstVisit: { toDate: () => new Date() },
        lastVisit: { toDate: () => new Date() },
        // Missing arrays - implementation uses fallbacks
      });

      const context = await getReturningVisitorContext('visitor-no-arrays');

      expect(context).not.toBeNull();
      expect(context?.topSections).toEqual([]);
      expect(context?.seenVariants).toEqual([]);
    });
  });
});
