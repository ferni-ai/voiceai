/**
 * API Validators Tests
 *
 * Tests for Zod schemas used to validate API request bodies.
 * Ensures proper validation and helpful error messages.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  UserIdSchema,
  LimitSchema,
  ISODateSchema,
  PositiveNumberSchema,
  WeatherSchema,
  CreateRitualSchema,
  CompleteRitualSchema,
  UpdatePredictionActualsSchema,
  ExportDataSchema,
  DeleteAllDataSchema,
  DeleteMemoryParamsSchema,
  CreateCheckoutSchema,
  CreatePortalSchema,
  RecordConversationSchema,
  RecordDeploymentSchema,
  RecordIncidentSchema,
  ResolveIncidentSchema,
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
  UpdateVoicePresenceConfigSchema,
  validateQuery,
} from '../api/validators.js';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

describe('Common Schemas', () => {
  describe('UserIdSchema', () => {
    it('should accept valid user IDs', () => {
      expect(UserIdSchema.parse('user-123')).toBe('user-123');
      expect(UserIdSchema.parse('a')).toBe('a');
    });

    it('should reject empty strings', () => {
      expect(() => UserIdSchema.parse('')).toThrow();
    });
  });

  describe('LimitSchema', () => {
    it('should accept valid limits', () => {
      expect(LimitSchema.parse(10)).toBe(10);
      expect(LimitSchema.parse(100)).toBe(100);
      expect(LimitSchema.parse(500)).toBe(500);
    });

    it('should coerce string to number', () => {
      expect(LimitSchema.parse('25')).toBe(25);
    });

    it('should use default of 50', () => {
      expect(LimitSchema.parse(undefined)).toBe(50);
    });

    it('should reject values outside range', () => {
      expect(() => LimitSchema.parse(0)).toThrow();
      expect(() => LimitSchema.parse(501)).toThrow();
      expect(() => LimitSchema.parse(-1)).toThrow();
    });
  });

  describe('ISODateSchema', () => {
    it('should accept ISO datetime strings', () => {
      expect(ISODateSchema.parse('2024-03-15T10:30:00Z')).toBeDefined();
      expect(ISODateSchema.parse('2024-03-15T10:30:00+05:00')).toBeDefined();
    });

    it('should accept date-only strings', () => {
      expect(ISODateSchema.parse('2024-03-15')).toBe('2024-03-15');
    });

    it('should reject invalid formats', () => {
      expect(() => ISODateSchema.parse('March 15, 2024')).toThrow();
      expect(() => ISODateSchema.parse('15/03/2024')).toThrow();
    });
  });

  describe('PositiveNumberSchema', () => {
    it('should accept positive numbers', () => {
      expect(PositiveNumberSchema.parse(1)).toBe(1);
      expect(PositiveNumberSchema.parse(0.5)).toBe(0.5);
      expect(PositiveNumberSchema.parse(1000000)).toBe(1000000);
    });

    it('should reject zero and negative numbers', () => {
      expect(() => PositiveNumberSchema.parse(0)).toThrow();
      expect(() => PositiveNumberSchema.parse(-1)).toThrow();
    });
  });
});

// ============================================================================
// RITUAL SCHEMAS
// ============================================================================

describe('Ritual Schemas', () => {
  describe('WeatherSchema', () => {
    it('should accept valid weather data', () => {
      const result = WeatherSchema.parse({
        primary: 'sunny',
        energy: 'high',
        note: 'Feeling great today!',
      });
      expect(result.primary).toBe('sunny');
      expect(result.energy).toBe('high');
    });

    it('should accept all weather types', () => {
      const types = ['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy', 'foggy', 'rainbow'];
      types.forEach((type) => {
        expect(WeatherSchema.parse({ primary: type }).primary).toBe(type);
      });
    });

    it('should make energy and note optional', () => {
      const result = WeatherSchema.parse({ primary: 'cloudy' });
      expect(result.primary).toBe('cloudy');
      expect(result.energy).toBeUndefined();
    });

    it('should reject invalid weather types', () => {
      expect(() => WeatherSchema.parse({ primary: 'hurricane' })).toThrow();
    });

    it('should enforce note max length', () => {
      expect(() => WeatherSchema.parse({ primary: 'sunny', note: 'x'.repeat(501) })).toThrow();
    });
  });

  describe('CreateRitualSchema', () => {
    it('should accept minimal ritual', () => {
      const result = CreateRitualSchema.parse({});
      expect(result).toBeDefined();
    });

    it('should accept full ritual data', () => {
      const result = CreateRitualSchema.parse({
        userId: 'user-123',
        ritual: {
          personaId: 'ferni',
          name: 'Morning Routine',
          frequency: 'daily',
        },
      });
      expect(result.userId).toBe('user-123');
      expect(result.ritual?.name).toBe('Morning Routine');
    });

    it('should accept valid frequencies', () => {
      const frequencies = ['daily', 'weekday', 'weekend', 'weekly'];
      frequencies.forEach((freq) => {
        expect(CreateRitualSchema.parse({ ritual: { frequency: freq } })).toBeDefined();
      });
    });
  });

  describe('CompleteRitualSchema', () => {
    it('should accept completion with weather', () => {
      const result = CompleteRitualSchema.parse({
        userId: 'user-123',
        weather: { primary: 'sunny' },
      });
      expect(result.weather?.primary).toBe('sunny');
    });

    it('should accept completion without weather', () => {
      const result = CompleteRitualSchema.parse({ userId: 'user-123' });
      expect(result.userId).toBe('user-123');
    });
  });
});

// ============================================================================
// PREDICTION SCHEMAS
// ============================================================================

describe('Prediction Schemas', () => {
  describe('UpdatePredictionActualsSchema', () => {
    it('should accept valid actuals', () => {
      const result = UpdatePredictionActualsSchema.parse({
        userId: 'user-123',
        actuals: { sleep: 7.5, exercise: 1, mood: 8 },
      });
      expect(result.actuals.sleep).toBe(7.5);
    });

    it('should require actuals to be numbers', () => {
      expect(() =>
        UpdatePredictionActualsSchema.parse({
          actuals: { sleep: 'good' },
        })
      ).toThrow();
    });
  });
});

// ============================================================================
// EXPORT SCHEMAS
// ============================================================================

describe('Export Schemas', () => {
  describe('ExportDataSchema', () => {
    it('should default format to json', () => {
      const result = ExportDataSchema.parse({});
      expect(result.format).toBe('json');
    });

    it('should accept csv format', () => {
      const result = ExportDataSchema.parse({ format: 'csv' });
      expect(result.format).toBe('csv');
    });

    it('should accept categories array', () => {
      const result = ExportDataSchema.parse({
        categories: ['conversations', 'rituals', 'predictions'],
      });
      expect(result.categories).toHaveLength(3);
    });
  });

  describe('DeleteAllDataSchema', () => {
    it('should require confirmDelete to be true', () => {
      const result = DeleteAllDataSchema.parse({
        userId: 'user-123',
        confirmDelete: true,
      });
      expect(result.confirmDelete).toBe(true);
    });

    it('should reject without confirmation', () => {
      expect(() =>
        DeleteAllDataSchema.parse({ userId: 'user-123', confirmDelete: false })
      ).toThrow();
    });

    it('should reject missing confirmation', () => {
      expect(() => DeleteAllDataSchema.parse({ userId: 'user-123' })).toThrow();
    });
  });
});

// ============================================================================
// MEMORY SCHEMAS
// ============================================================================

describe('Memory Schemas', () => {
  describe('DeleteMemoryParamsSchema', () => {
    it('should accept valid memory ID', () => {
      const result = DeleteMemoryParamsSchema.parse({ memoryId: 'mem-123' });
      expect(result.memoryId).toBe('mem-123');
    });

    it('should reject empty memory ID', () => {
      expect(() => DeleteMemoryParamsSchema.parse({ memoryId: '' })).toThrow();
    });
  });
});

// ============================================================================
// SUBSCRIPTION SCHEMAS
// ============================================================================

describe('Subscription Schemas', () => {
  describe('CreateCheckoutSchema', () => {
    it('should accept valid checkout request', () => {
      const result = CreateCheckoutSchema.parse({
        userId: 'user-123',
        tier: 'friend',
      });
      expect(result.tier).toBe('friend');
    });

    it('should accept partner tier', () => {
      const result = CreateCheckoutSchema.parse({
        userId: 'user-123',
        tier: 'partner',
      });
      expect(result.tier).toBe('partner');
    });

    it('should validate URLs', () => {
      const result = CreateCheckoutSchema.parse({
        userId: 'user-123',
        tier: 'friend',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      });
      expect(result.successUrl).toBe('https://example.com/success');
    });

    it('should reject invalid URLs', () => {
      expect(() =>
        CreateCheckoutSchema.parse({
          userId: 'user-123',
          tier: 'friend',
          successUrl: 'not-a-url',
        })
      ).toThrow();
    });

    it('should validate email format', () => {
      expect(() =>
        CreateCheckoutSchema.parse({
          userId: 'user-123',
          tier: 'friend',
          email: 'not-an-email',
        })
      ).toThrow();
    });

    it('should reject invalid tiers', () => {
      expect(() =>
        CreateCheckoutSchema.parse({
          userId: 'user-123',
          tier: 'premium',
        })
      ).toThrow();
    });
  });

  describe('CreatePortalSchema', () => {
    it('should accept valid portal request', () => {
      const result = CreatePortalSchema.parse({ userId: 'user-123' });
      expect(result.userId).toBe('user-123');
    });

    it('should accept return URL', () => {
      const result = CreatePortalSchema.parse({
        userId: 'user-123',
        returnUrl: 'https://example.com/settings',
      });
      expect(result.returnUrl).toBe('https://example.com/settings');
    });
  });

  describe('RecordConversationSchema', () => {
    it('should accept valid conversation record', () => {
      const result = RecordConversationSchema.parse({
        userId: 'user-123',
        durationMinutes: 15,
      });
      expect(result.durationMinutes).toBe(15);
    });

    it('should reject negative duration', () => {
      expect(() =>
        RecordConversationSchema.parse({
          userId: 'user-123',
          durationMinutes: -5,
        })
      ).toThrow();
    });
  });
});

// ============================================================================
// DORA METRICS SCHEMAS
// ============================================================================

describe('DORA Metrics Schemas', () => {
  describe('RecordDeploymentSchema', () => {
    it('should accept valid deployment', () => {
      const result = RecordDeploymentSchema.parse({
        timestamp: '2024-03-15T10:30:00Z',
        commitSha: 'abc123def',
        branch: 'main',
        environment: 'production',
      });
      expect(result.environment).toBe('production');
      expect(result.success).toBe(true); // default
    });

    it('should accept all environments', () => {
      const envs = ['production', 'staging', 'development'];
      envs.forEach((env) => {
        expect(
          RecordDeploymentSchema.parse({
            timestamp: '2024-03-15T10:30:00Z',
            commitSha: 'abc',
            branch: 'main',
            environment: env,
          }).environment
        ).toBe(env);
      });
    });

    it('should require commitSha and branch', () => {
      expect(() =>
        RecordDeploymentSchema.parse({
          timestamp: '2024-03-15T10:30:00Z',
          environment: 'production',
        })
      ).toThrow();
    });
  });

  describe('RecordIncidentSchema', () => {
    it('should accept valid incident', () => {
      const result = RecordIncidentSchema.parse({
        title: 'Database connection failure',
        severity: 'critical',
        startedAt: '2024-03-15T10:30:00Z',
      });
      expect(result.severity).toBe('critical');
    });

    it('should accept all severity levels', () => {
      const severities = ['critical', 'major', 'minor'];
      severities.forEach((sev) => {
        expect(
          RecordIncidentSchema.parse({
            title: 'Test',
            severity: sev,
            startedAt: '2024-03-15',
          }).severity
        ).toBe(sev);
      });
    });

    it('should enforce title max length', () => {
      expect(() =>
        RecordIncidentSchema.parse({
          title: 'x'.repeat(201),
          severity: 'minor',
          startedAt: '2024-03-15',
        })
      ).toThrow();
    });
  });

  describe('ResolveIncidentSchema', () => {
    it('should accept resolution details', () => {
      const result = ResolveIncidentSchema.parse({
        resolvedAt: '2024-03-15T12:00:00Z',
        resolution: 'Restarted database service',
        rootCause: 'Memory leak in connection pool',
      });
      expect(result.resolution).toContain('Restarted');
    });

    it('should make all fields optional', () => {
      const result = ResolveIncidentSchema.parse({});
      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// FEATURE FLAG SCHEMAS
// ============================================================================

describe('Feature Flag Schemas', () => {
  describe('CreateFeatureFlagSchema', () => {
    it('should accept valid feature flag', () => {
      const result = CreateFeatureFlagSchema.parse({
        id: 'dark-mode',
        name: 'Dark Mode',
        type: 'boolean',
        category: 'ui',
      });
      expect(result.enabled).toBe(false); // default
    });

    it('should accept all flag types', () => {
      const types = ['boolean', 'percentage', 'user_list', 'value'];
      types.forEach((type) => {
        expect(
          CreateFeatureFlagSchema.parse({
            id: 'test',
            name: 'Test',
            type,
            category: 'test',
          }).type
        ).toBe(type);
      });
    });

    it('should enforce id format', () => {
      expect(() =>
        CreateFeatureFlagSchema.parse({
          id: 'Invalid ID!',
          name: 'Test',
          type: 'boolean',
          category: 'test',
        })
      ).toThrow();
    });

    it('should accept percentage for rollout', () => {
      const result = CreateFeatureFlagSchema.parse({
        id: 'new-feature',
        name: 'New Feature',
        type: 'percentage',
        category: 'features',
        percentage: 25,
      });
      expect(result.percentage).toBe(25);
    });

    it('should reject percentage outside range', () => {
      expect(() =>
        CreateFeatureFlagSchema.parse({
          id: 'test',
          name: 'Test',
          type: 'percentage',
          category: 'test',
          percentage: 101,
        })
      ).toThrow();
    });
  });

  describe('UpdateFeatureFlagSchema', () => {
    it('should make all fields optional', () => {
      const result = UpdateFeatureFlagSchema.parse({ enabled: true });
      expect(result.enabled).toBe(true);
    });
  });
});

// ============================================================================
// VOICE PRESENCE SCHEMAS
// ============================================================================

describe('Voice Presence Schemas', () => {
  describe('UpdateVoicePresenceConfigSchema', () => {
    it('should accept valid config', () => {
      const result = UpdateVoicePresenceConfigSchema.parse({
        fillerWordsEnabled: true,
        fillerWordsFrequency: 0.3,
        breathingEnabled: true,
        emotionalMirroringEnabled: false,
      });
      expect(result.fillerWordsFrequency).toBe(0.3);
    });

    it('should enforce frequency range 0-1', () => {
      expect(() =>
        UpdateVoicePresenceConfigSchema.parse({
          fillerWordsFrequency: 1.5,
        })
      ).toThrow();

      expect(() =>
        UpdateVoicePresenceConfigSchema.parse({
          fillerWordsFrequency: -0.1,
        })
      ).toThrow();
    });

    it('should make all fields optional', () => {
      const result = UpdateVoicePresenceConfigSchema.parse({});
      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

describe('Validation Helpers', () => {
  describe('validateQuery', () => {
    it('should validate query parameters', () => {
      const url = new URL('http://localhost/api/test?limit=25&format=json');
      const schema = ExportDataSchema;
      const result = validateQuery(url, schema);
      expect(result?.format).toBe('json');
    });

    it('should return null for invalid params', () => {
      const url = new URL('http://localhost/api/test?format=invalid');
      const schema = ExportDataSchema;
      const result = validateQuery(url, schema);
      expect(result).toBeNull();
    });
  });
});
