/**
 * User Identification Service - DI-Enabled Version
 *
 * This demonstrates how to convert a service from global state to dependency injection.
 *
 * Key changes from the original:
 * 1. Dependencies are injected via constructor, not fetched from globals
 * 2. Service is registered with the DI container
 * 3. Testing is simplified - just inject mocks
 *
 * Migration path:
 * - New code should use this DI version
 * - Existing code continues to work via the legacy wrapper
 * - Gradual migration as files are touched
 */

import { log } from '@livekit/agents';
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';
import { Container, Tokens, type Factory } from './container.js';
import { Result, success, failure, NotFoundError, ValidationError } from '../../types/index.js';

/**
 * Extended MemoryStore interface with user lookup methods
 * These methods may not exist on all store implementations
 */
interface ExtendedMemoryStore {
  getProfile(userId: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  // Optional lookup methods - not all stores support these
  getProfileByPhone?(phone: string): Promise<UserProfile | null>;
  getProfileByLinkedId?(linkedId: string): Promise<UserProfile | null>;
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Dependencies for UserIdentificationService
 */
export interface UserIdentificationDeps {
  store: ExtendedMemoryStore;
  logger?: typeof log;
}

/**
 * User identification result
 */
export interface IdentificationResult {
  userId: string;
  profile: UserProfile | null;
  source: 'phone' | 'device' | 'voice' | 'web_session' | 'anonymous';
  isNew: boolean;
  confidence: number;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * User Identification Service
 *
 * Resolves user identity across platforms:
 * - Phone number (telephony)
 * - Device ID (web app)
 * - Voice recognition (future)
 * - Web session (authenticated)
 */
export class UserIdentificationService {
  private readonly store: ExtendedMemoryStore;
  private readonly getLogger: () => ReturnType<typeof log>;

  constructor(deps: UserIdentificationDeps) {
    this.store = deps.store;
    this.getLogger = deps.logger ?? (() => log());
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phone: string, defaultCountry = 'US'): string {
    let normalized = phone.replace(/[^\d+]/g, '');

    if (normalized.startsWith('+')) {
      return normalized;
    }

    if (defaultCountry === 'US') {
      if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = normalized.substring(1);
      }
      if (normalized.length === 10) {
        return `+1${normalized}`;
      }
    }

    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(phone: string): boolean {
    const normalized = this.normalizePhoneNumber(phone);
    return /^\+\d{7,15}$/.test(normalized);
  }

  /**
   * Identify user by phone number
   */
  async identifyByPhone(
    phone: string
  ): Promise<Result<IdentificationResult, ValidationError | Error>> {
    const normalized = this.normalizePhoneNumber(phone);

    if (!this.isValidPhoneNumber(normalized)) {
      return failure(new ValidationError(`Invalid phone number format: ${phone}`, 'phone'));
    }

    this.getLogger().info({ phone: normalized }, 'Identifying user by phone number');

    try {
      // Look up profile by phone
      const profile = await this.store.getProfileByPhone?.(normalized);

      if (profile) {
        return success({
          userId: profile.id,
          profile,
          source: 'phone',
          isNew: false,
          confidence: 1.0,
        });
      }

      // New phone number - create user ID
      const newUserId = `phone:${normalized}`;

      return success({
        userId: newUserId,
        profile: null,
        source: 'phone',
        isNew: true,
        confidence: 1.0,
      });
    } catch (error) {
      this.getLogger().error({ error, phone: normalized }, 'Failed to identify by phone');
      return failure(error as Error);
    }
  }

  /**
   * Identify user by device ID
   */
  async identifyByDevice(
    deviceId: string
  ): Promise<Result<IdentificationResult, Error>> {
    if (!deviceId) {
      return failure(new ValidationError('Device ID is required', 'deviceId'));
    }

    this.getLogger().debug({ deviceId }, 'Identifying user by device');

    try {
      // Look up profile by linked identifier
      const profile = await this.store.getProfileByLinkedId?.(deviceId);

      if (profile) {
        return success({
          userId: profile.id,
          profile,
          source: 'device',
          isNew: false,
          confidence: 0.8,
        });
      }

      // New device
      const newUserId = `device:${deviceId}`;

      return success({
        userId: newUserId,
        profile: null,
        source: 'device',
        isNew: true,
        confidence: 0.8,
      });
    } catch (error) {
      this.getLogger().error({ error, deviceId }, 'Failed to identify by device');
      return failure(error as Error);
    }
  }

  /**
   * Identify user by web session token
   */
  async identifyByWebSession(
    sessionToken: string
  ): Promise<Result<IdentificationResult, Error>> {
    if (!sessionToken) {
      return failure(new ValidationError('Session token is required', 'sessionToken'));
    }

    this.getLogger().debug('Identifying user by web session');

    try {
      // Validate session and get user ID
      // This would typically verify with your auth provider
      const userId = await this.validateWebSession(sessionToken);

      if (!userId) {
        return success({
          userId: `anon:${Date.now()}`,
          profile: null,
          source: 'anonymous',
          isNew: true,
          confidence: 0,
        });
      }

      const profile = await this.store.getProfile(userId);

      return success({
        userId,
        profile,
        source: 'web_session',
        isNew: !profile,
        confidence: 1.0,
      });
    } catch (error) {
      this.getLogger().error({ error }, 'Failed to identify by web session');
      return failure(error as Error);
    }
  }

  /**
   * Link a new identifier to an existing profile
   */
  async linkIdentifier(
    userId: string,
    identifier: string,
    type: 'phone' | 'device' | 'email'
  ): Promise<Result<void, NotFoundError | Error>> {
    try {
      const profile = await this.store.getProfile(userId);

      if (!profile) {
        return failure(new NotFoundError('UserProfile', userId));
      }

      // Add to linked identifiers
      const linkedIdentifiers = profile.linkedIdentifiers ?? [];
      const normalized = type === 'phone' ? this.normalizePhoneNumber(identifier) : identifier;

      if (!linkedIdentifiers.includes(normalized)) {
        linkedIdentifiers.push(normalized);
        profile.linkedIdentifiers = linkedIdentifiers;

        // Update phone specifically if that's the type
        if (type === 'phone' && profile.contactInfo) {
          profile.contactInfo.phone = normalized;
        }

        await this.store.saveProfile(profile);
        this.getLogger().info({ userId, identifier: normalized, type }, 'Linked identifier to profile');
      }

      return success(undefined);
    } catch (error) {
      this.getLogger().error({ error, userId, identifier, type }, 'Failed to link identifier');
      return failure(error as Error);
    }
  }

  /**
   * Validate a web session token
   * Override this method to integrate with your auth provider
   */
  protected async validateWebSession(_token: string): Promise<string | null> {
    // Default implementation - no validation
    // In production, this would verify the token with Firebase, Auth0, etc.
    return null;
  }
}

// ============================================================================
// DI REGISTRATION
// ============================================================================

/**
 * Token for resolving UserIdentificationService from the container
 */
export const UserIdentificationToken = Symbol('UserIdentificationService');

/**
 * Factory for creating UserIdentificationService with DI
 */
export const createUserIdentificationService: Factory<UserIdentificationService> = (container) => {
  return new UserIdentificationService({
    store: container.resolve<ExtendedMemoryStore>(Tokens.MemoryStore),
  });
};

/**
 * Register UserIdentificationService with the container
 */
export function registerUserIdentificationService(container: Container): void {
  container.registerSingleton(UserIdentificationToken, createUserIdentificationService);
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Get the UserIdentificationService from the global container
 * This is a convenience function for gradual migration
 */
export function getUserIdentificationService(container: Container): UserIdentificationService {
  // Ensure it's registered
  if (!container.has(UserIdentificationToken)) {
    registerUserIdentificationService(container);
  }
  return container.resolve<UserIdentificationService>(UserIdentificationToken);
}

