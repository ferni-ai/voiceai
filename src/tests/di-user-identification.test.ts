/**
 * User Identification Service - DI Tests
 *
 * Demonstrates how DI enables clean, isolated testing:
 * 1. No need to mock module imports
 * 2. Easy to inject mock dependencies
 * 3. Tests are isolated and fast
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Container,
  Tokens,
  UserIdentificationService,
  UserIdentificationToken,
  registerUserIdentificationService,
  type UserIdentificationDeps,
  type IdentificationResult,
} from '../services/di/index.js';
import { isSuccess, isFailure } from '../types/index.js';
import type { MemoryStore } from '../memory/index.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// MOCK HELPERS
// ============================================================================

/**
 * Create a mock MemoryStore for testing
 */
function createMockStore(overrides: Partial<MemoryStore> = {}): MemoryStore {
  return {
    getProfile: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    getProfileByPhone: vi.fn().mockResolvedValue(null),
    getProfileByLinkedId: vi.fn().mockResolvedValue(null),
    saveSummary: vi.fn().mockResolvedValue(undefined),
    getSummaries: vi.fn().mockResolvedValue([]),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    listProfiles: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MemoryStore;
}

/**
 * Create a mock UserProfile
 */
function createMockProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'test-user-123',
    name: 'Test User',
    linkedIdentifiers: [],
    totalConversations: 5,
    firstContact: new Date(),
    lastContact: new Date(),
    communicationStyle: 'casual',
    speakingPace: 'moderate',
    relationshipStage: 'getting_to_know',
    preferredTopics: [],
    avoidTopics: [],
    financialAnxietyTriggers: [],
    riskProfile: { tolerance: 'moderate', confidence: 0.5, assessedAt: new Date(), factors: [] },
    goals: [],
    primaryConcerns: [],
    investmentEvents: [],
    keyMoments: [],
    emotionalPatterns: [],
    totalMinutesTalked: 30,
    conversationSummaries: [],
    familyMembers: [],
    sharedStories: [],
    openQuestions: [],
    pendingFollowUps: [],
    hasInvestments: false,
    investmentExperience: 'beginner',
    humorAppreciation: 'medium',
    verbosity: 'balanced',
    wantsProactiveAdvice: true,
    financialPrivacyLevel: 'moderate',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserProfile;
}

// ============================================================================
// TESTS: Direct Service Instantiation
// ============================================================================

describe('UserIdentificationService (Direct)', () => {
  describe('Phone Number Utilities', () => {
    let service: UserIdentificationService;

    beforeEach(() => {
      service = new UserIdentificationService({
        store: createMockStore(),
      });
    });

    it('should normalize US phone numbers', () => {
      expect(service.normalizePhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('+1 555 123 4567')).toBe('+15551234567');
      expect(service.normalizePhoneNumber('15551234567')).toBe('+15551234567');
    });

    it('should preserve international numbers', () => {
      expect(service.normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
      expect(service.normalizePhoneNumber('+33 1 42 68 53 00')).toBe('+33142685300');
    });

    it('should validate phone numbers', () => {
      expect(service.isValidPhoneNumber('+15551234567')).toBe(true);
      expect(service.isValidPhoneNumber('555-123-4567')).toBe(true);
      expect(service.isValidPhoneNumber('123')).toBe(false);
      expect(service.isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('Phone Identification', () => {
    it('should identify existing user by phone', async () => {
      const existingProfile = createMockProfile({
        id: 'user-abc',
        contactInfo: { phone: '+15551234567' },
      });

      const mockStore = createMockStore({
        getProfileByPhone: vi.fn().mockResolvedValue(existingProfile),
      });

      const service = new UserIdentificationService({ store: mockStore });
      const result = await service.identifyByPhone('+15551234567');

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.userId).toBe('user-abc');
        expect(result.data.isNew).toBe(false);
        expect(result.data.source).toBe('phone');
        expect(result.data.confidence).toBe(1.0);
      }
    });

    it('should create new user ID for unknown phone', async () => {
      const mockStore = createMockStore({
        getProfileByPhone: vi.fn().mockResolvedValue(null),
      });

      const service = new UserIdentificationService({ store: mockStore });
      const result = await service.identifyByPhone('+15559876543');

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.userId).toBe('phone:+15559876543');
        expect(result.data.isNew).toBe(true);
        expect(result.data.profile).toBeNull();
      }
    });

    it('should fail on invalid phone number', async () => {
      const service = new UserIdentificationService({ store: createMockStore() });
      const result = await service.identifyByPhone('123');

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.name).toBe('ValidationError');
      }
    });
  });

  describe('Device Identification', () => {
    it('should identify existing user by device', async () => {
      const existingProfile = createMockProfile({
        id: 'user-xyz',
        linkedIdentifiers: ['device-abc-123'],
      });

      const mockStore = createMockStore({
        getProfileByLinkedId: vi.fn().mockResolvedValue(existingProfile),
      });

      const service = new UserIdentificationService({ store: mockStore });
      const result = await service.identifyByDevice('device-abc-123');

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.userId).toBe('user-xyz');
        expect(result.data.isNew).toBe(false);
        expect(result.data.source).toBe('device');
      }
    });

    it('should create new user ID for unknown device', async () => {
      const mockStore = createMockStore({
        getProfileByLinkedId: vi.fn().mockResolvedValue(null),
      });

      const service = new UserIdentificationService({ store: mockStore });
      const result = await service.identifyByDevice('new-device-456');

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.userId).toBe('device:new-device-456');
        expect(result.data.isNew).toBe(true);
      }
    });
  });

  describe('Link Identifier', () => {
    it('should link phone to existing profile', async () => {
      const profile = createMockProfile({
        id: 'user-123',
        linkedIdentifiers: [],
        contactInfo: {},
      });

      const mockStore = createMockStore({
        getProfile: vi.fn().mockResolvedValue(profile),
        saveProfile: vi.fn().mockResolvedValue(undefined),
      });

      const service = new UserIdentificationService({ store: mockStore });
      const result = await service.linkIdentifier('user-123', '+15551234567', 'phone');

      expect(isSuccess(result)).toBe(true);
      expect(mockStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedIdentifiers: ['+15551234567'],
        })
      );
    });

    it('should fail if profile not found', async () => {
      const mockStore = createMockStore({
        getProfile: vi.fn().mockResolvedValue(null),
      });

      const service = new UserIdentificationService({ store: mockStore });
      const result = await service.linkIdentifier('nonexistent', '+15551234567', 'phone');

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.name).toBe('NotFoundError');
      }
    });
  });
});

// ============================================================================
// TESTS: DI Container Integration
// ============================================================================

describe('UserIdentificationService (DI Container)', () => {
  let container: Container;

  beforeEach(() => {
    // Create fresh container for each test
    container = new Container();
  });

  it('should resolve service from container', () => {
    const mockStore = createMockStore();

    // Register dependencies
    container.registerInstance(Tokens.MemoryStore, mockStore);
    registerUserIdentificationService(container);

    // Resolve service
    const service = container.resolve<UserIdentificationService>(UserIdentificationToken);

    expect(service).toBeInstanceOf(UserIdentificationService);
  });

  it('should use singleton pattern', () => {
    const mockStore = createMockStore();

    container.registerInstance(Tokens.MemoryStore, mockStore);
    registerUserIdentificationService(container);

    // Resolve twice
    const service1 = container.resolve<UserIdentificationService>(UserIdentificationToken);
    const service2 = container.resolve<UserIdentificationService>(UserIdentificationToken);

    // Should be same instance
    expect(service1).toBe(service2);
  });

  it('should allow scoped overrides for testing', async () => {
    // Set up parent container with real-ish mock
    const productionStore = createMockStore({
      getProfileByPhone: vi.fn().mockResolvedValue(createMockProfile({ id: 'prod-user' })),
    });
    container.registerInstance(Tokens.MemoryStore, productionStore);
    registerUserIdentificationService(container);

    // Create scoped container for this test
    const testContainer = container.createScope();
    const testStore = createMockStore({
      getProfileByPhone: vi.fn().mockResolvedValue(createMockProfile({ id: 'test-user' })),
    });
    testContainer.registerInstance(Tokens.MemoryStore, testStore);
    // Re-register in scope to use test store
    testContainer.registerSingleton(
      UserIdentificationToken,
      (c) => new UserIdentificationService({ store: c.resolve(Tokens.MemoryStore) })
    );

    // Test uses scoped service with test store
    const testService = testContainer.resolve<UserIdentificationService>(UserIdentificationToken);
    const result = await testService.identifyByPhone('+15551234567');

    expect(isSuccess(result)).toBe(true);
    if (isSuccess(result)) {
      expect(result.data.userId).toBe('test-user');
    }
  });
});

// ============================================================================
// TESTS: Error Handling with Result Types
// ============================================================================

describe('UserIdentificationService (Result Types)', () => {
  it('should return Success for valid operations', async () => {
    const service = new UserIdentificationService({
      store: createMockStore({
        getProfileByPhone: vi.fn().mockResolvedValue(null),
      }),
    });

    const result = await service.identifyByPhone('+15551234567');

    // Type guard narrows the type
    if (isSuccess(result)) {
      // TypeScript knows result.data exists here
      expect(result.data.userId).toBeTruthy();
      expect(result.data.source).toBe('phone');
    } else {
      // This branch won't execute
      expect.fail('Expected success');
    }
  });

  it('should return Failure for invalid operations', async () => {
    const service = new UserIdentificationService({
      store: createMockStore(),
    });

    const result = await service.identifyByPhone('invalid');

    // Type guard narrows the type
    if (isFailure(result)) {
      // TypeScript knows result.error exists here
      expect(result.error.name).toBe('ValidationError');
      expect(result.error.message).toContain('Invalid phone');
    } else {
      expect.fail('Expected failure');
    }
  });

  it('should return Failure on store errors', async () => {
    const service = new UserIdentificationService({
      store: createMockStore({
        getProfileByPhone: vi.fn().mockRejectedValue(new Error('Database unavailable')),
      }),
    });

    const result = await service.identifyByPhone('+15551234567');

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error.message).toBe('Database unavailable');
    }
  });
});
