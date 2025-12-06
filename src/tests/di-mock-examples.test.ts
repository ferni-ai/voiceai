/**
 * DI Mock Examples
 *
 * Demonstrates proper patterns for testing with DI:
 * 1. Registering mock services in the container
 * 2. Using mock factories
 * 3. Testing services that depend on other services
 * 4. Testing Result-based error handling
 *
 * This file serves as a reference for writing DI-based tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getContainer, resetContainer, Tokens, type Container } from '../services/di/index.js';
import { success, failure, isSuccess, isFailure, type Result } from '../types/result.js';

// ============================================================================
// MOCK SERVICE INTERFACES
// ============================================================================

/**
 * Example service interface for demonstration
 */
interface ExampleUserService {
  getUserById: (id: string) => Promise<Result<{ id: string; name: string }, Error>>;
  createUser: (name: string) => Promise<Result<{ id: string; name: string }, Error>>;
}

/**
 * Example service that depends on ExampleUserService
 */
interface ExampleNotificationService {
  notifyUser: (userId: string, message: string) => Promise<Result<boolean, Error>>;
}

// ============================================================================
// MOCK IMPLEMENTATIONS
// ============================================================================

/**
 * Create a mock user service with vi.fn() for each method
 */
function createMockUserService(): ExampleUserService {
  return {
    getUserById: vi.fn().mockResolvedValue(success({ id: '123', name: 'Test User' })),
    createUser: vi.fn().mockResolvedValue(success({ id: '456', name: 'New User' })),
  };
}

/**
 * Create a mock notification service
 */
function createMockNotificationService(): ExampleNotificationService {
  return {
    notifyUser: vi.fn().mockResolvedValue(success(true)),
  };
}

// ============================================================================
// TESTS: BASIC DI MOCK INJECTION
// ============================================================================

describe('DI Mock Examples', () => {
  let container: Container;

  beforeEach(() => {
    resetContainer();
    container = getContainer();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetContainer();
  });

  describe('Basic Mock Injection', () => {
    it('should inject mock service into container', () => {
      // Arrange: Register a mock service
      const mockUserService = createMockUserService();
      container.registerInstance('ExampleUserService', mockUserService);

      // Act: Resolve the service
      const service = container.resolve<ExampleUserService>('ExampleUserService');

      // Assert: Should be the mock
      expect(service).toBe(mockUserService);
    });

    it('should allow mock to return success results', async () => {
      // Arrange
      const mockUserService = createMockUserService();
      container.registerInstance('ExampleUserService', mockUserService);
      const service = container.resolve<ExampleUserService>('ExampleUserService');

      // Act
      const result = await service.getUserById('123');

      // Assert
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.id).toBe('123');
        expect(result.data.name).toBe('Test User');
      }
    });

    it('should allow mock to return failure results', async () => {
      // Arrange: Configure mock to return failure
      const mockUserService = createMockUserService();
      const mockError = new Error('User not found');
      vi.mocked(mockUserService.getUserById).mockResolvedValue(failure(mockError));
      container.registerInstance('ExampleUserService', mockUserService);
      const service = container.resolve<ExampleUserService>('ExampleUserService');

      // Act
      const result = await service.getUserById('nonexistent');

      // Assert
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('User not found');
      }
    });
  });

  describe('Mock Call Verification', () => {
    it('should track mock calls', async () => {
      // Arrange
      const mockUserService = createMockUserService();
      container.registerInstance('ExampleUserService', mockUserService);
      const service = container.resolve<ExampleUserService>('ExampleUserService');

      // Act
      await service.getUserById('123');
      await service.getUserById('456');
      await service.createUser('Alice');

      // Assert
      expect(mockUserService.getUserById).toHaveBeenCalledTimes(2);
      expect(mockUserService.getUserById).toHaveBeenCalledWith('123');
      expect(mockUserService.getUserById).toHaveBeenCalledWith('456');
      expect(mockUserService.createUser).toHaveBeenCalledTimes(1);
      expect(mockUserService.createUser).toHaveBeenCalledWith('Alice');
    });

    it('should allow different return values per call', async () => {
      // Arrange: Configure different responses per call
      const mockUserService = createMockUserService();
      vi.mocked(mockUserService.getUserById)
        .mockResolvedValueOnce(success({ id: '1', name: 'First' }))
        .mockResolvedValueOnce(success({ id: '2', name: 'Second' }))
        .mockResolvedValueOnce(failure(new Error('Not found')));
      container.registerInstance('ExampleUserService', mockUserService);
      const service = container.resolve<ExampleUserService>('ExampleUserService');

      // Act & Assert
      const first = await service.getUserById('any');
      expect(isSuccess(first) && first.data.name).toBe('First');

      const second = await service.getUserById('any');
      expect(isSuccess(second) && second.data.name).toBe('Second');

      const third = await service.getUserById('any');
      expect(isFailure(third)).toBe(true);
    });
  });

  describe('Service with Dependencies', () => {
    // Example: A service that uses another service
    class UserNotifier {
      constructor(
        private userService: ExampleUserService,
        private notificationService: ExampleNotificationService
      ) {}

      async notifyUserByName(userId: string, message: string): Promise<Result<string, Error>> {
        // Get user first
        const userResult = await this.userService.getUserById(userId);
        if (isFailure(userResult)) {
          return failure(new Error(`Cannot notify: ${userResult.error.message}`));
        }

        // Send notification
        const notifyResult = await this.notificationService.notifyUser(userId, message);
        if (isFailure(notifyResult)) {
          return failure(new Error(`Notification failed: ${notifyResult.error.message}`));
        }

        return success(`Notified ${userResult.data.name}: ${message}`);
      }
    }

    it('should inject all dependencies as mocks', async () => {
      // Arrange: Create mocks
      const mockUserService = createMockUserService();
      const mockNotificationService = createMockNotificationService();

      // Register mocks
      container.registerInstance('ExampleUserService', mockUserService);
      container.registerInstance('ExampleNotificationService', mockNotificationService);

      // Create service with resolved dependencies
      const notifier = new UserNotifier(
        container.resolve<ExampleUserService>('ExampleUserService'),
        container.resolve<ExampleNotificationService>('ExampleNotificationService')
      );

      // Act
      const result = await notifier.notifyUserByName('123', 'Hello!');

      // Assert
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data).toBe('Notified Test User: Hello!');
      }
      expect(mockUserService.getUserById).toHaveBeenCalledWith('123');
      expect(mockNotificationService.notifyUser).toHaveBeenCalledWith('123', 'Hello!');
    });

    it('should handle dependency failure gracefully', async () => {
      // Arrange: Configure user service to fail
      const mockUserService = createMockUserService();
      const mockNotificationService = createMockNotificationService();
      vi.mocked(mockUserService.getUserById).mockResolvedValue(
        failure(new Error('User suspended'))
      );

      container.registerInstance('ExampleUserService', mockUserService);
      container.registerInstance('ExampleNotificationService', mockNotificationService);

      const notifier = new UserNotifier(
        container.resolve<ExampleUserService>('ExampleUserService'),
        container.resolve<ExampleNotificationService>('ExampleNotificationService')
      );

      // Act
      const result = await notifier.notifyUserByName('123', 'Hello!');

      // Assert: Should propagate the error
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toContain('User suspended');
      }
      // Notification should NOT have been called
      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
    });
  });

  describe('Factory-based Mock Registration', () => {
    it('should use factory that creates mocks on demand', () => {
      // Arrange: Register factory that creates fresh mocks
      container.register('ExampleUserService', () => createMockUserService());

      // Act: Each resolution creates a new mock
      const service1 = container.resolve<ExampleUserService>('ExampleUserService');
      const service2 = container.resolve<ExampleUserService>('ExampleUserService');

      // Assert: Different instances
      expect(service1).not.toBe(service2);
    });

    it('should use singleton factory for shared mock', () => {
      // Arrange: Register singleton mock
      container.registerSingleton('ExampleUserService', () => createMockUserService());

      // Act
      const service1 = container.resolve<ExampleUserService>('ExampleUserService');
      const service2 = container.resolve<ExampleUserService>('ExampleUserService');

      // Assert: Same instance
      expect(service1).toBe(service2);
    });
  });
});

// ============================================================================
// TESTS: TESTING PATTERNS FOR RESULT TYPES
// ============================================================================

describe('Result Type Testing Patterns', () => {
  describe('Asserting Success Results', () => {
    it('should unwrap success values for testing', () => {
      const result: Result<number, Error> = success(42);

      // Pattern 1: Type guard
      if (isSuccess(result)) {
        expect(result.data).toBe(42);
      } else {
        throw new Error('Expected success');
      }
    });

    it('should use expect pattern for success', () => {
      const result: Result<number, Error> = success(42);

      // Pattern 2: Direct assertion
      expect(isSuccess(result)).toBe(true);
      expect((result as { data: number }).data).toBe(42);
    });
  });

  describe('Asserting Failure Results', () => {
    it('should unwrap failure errors for testing', () => {
      const result: Result<number, Error> = failure(new Error('Something went wrong'));

      // Pattern 1: Type guard
      if (isFailure(result)) {
        expect(result.error.message).toBe('Something went wrong');
      } else {
        throw new Error('Expected failure');
      }
    });

    it('should use expect pattern for failure', () => {
      const result: Result<number, Error> = failure(new Error('Something went wrong'));

      // Pattern 2: Direct assertion
      expect(isFailure(result)).toBe(true);
      expect((result as { error: Error }).error.message).toBe('Something went wrong');
    });
  });

  describe('Testing Async Operations', () => {
    it('should test async Result-returning functions', async () => {
      // Simulating an async service method
      async function asyncOperation(): Promise<Result<string, Error>> {
        // Simulating async work
        await new Promise((r) => {
          setTimeout(r, 1);
        });
        return success('done');
      }

      const result = await asyncOperation();
      expect(isSuccess(result)).toBe(true);
    });

    it('should test async failures', async () => {
      async function asyncOperationThatFails(): Promise<Result<string, Error>> {
        await new Promise((r) => {
          setTimeout(r, 1);
        });
        return failure(new Error('Async failure'));
      }

      const result = await asyncOperationThatFails();
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('Async failure');
      }
    });
  });
});
