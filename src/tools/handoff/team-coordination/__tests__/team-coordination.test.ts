/**
 * Team Coordination Tests
 *
 * Tests for team coordination between Jordan, Maya, and Alex.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TEAM_CAPABILITIES,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_AMOUNT,
  type TeamMember,
} from '../types.js';
import {
  validateProjectName,
  validateAmountField,
  validateNotes,
  findBestTeamMember,
} from '../helpers.js';

// Mock external dependencies
vi.mock('../../../../services/stores/life-data-store.js', () => ({
  getLifeDataStore: vi.fn(() => ({
    getTeamContext: vi.fn(() => Promise.resolve(null)),
    setTeamContext: vi.fn(() => Promise.resolve()),
    getOrCreateTeamContext: vi.fn(() =>
      Promise.resolve({
        members: ['jordan', 'maya', 'alex'],
        projects: [],
        sharedGoals: [],
      })
    ),
  })),
}));

vi.mock('../../../validation.js', () => ({
  sanitizePlainText: vi.fn((text: string, maxLength: number) => text.slice(0, maxLength).trim()),
  parseAmount: vi.fn((val: unknown) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || null;
    return null;
  }),
  isValidAmount: vi.fn(
    (val: number, min: number, max: number) => typeof val === 'number' && val >= min && val <= max
  ),
}));

describe('Team Capabilities', () => {
  it('should define Jordan capabilities', () => {
    const jordan = TEAM_CAPABILITIES.jordan;

    expect(jordan.name).toBe('Jordan');
    expect(jordan.expertise).toContain('Life planning');
    expect(jordan.canHelpWith).toContain('Setting goals');
    expect(jordan.canHelpWith).toContain('Planning milestones');
  });

  it('should define Maya capabilities', () => {
    const maya = TEAM_CAPABILITIES.maya;

    expect(maya.name).toBe('Maya');
    expect(maya.expertise).toContain('Budgeting');
    expect(maya.canHelpWith).toContain('Finding savings');
    expect(maya.canHelpWith).toContain('Creating budgets');
  });

  it('should define Alex capabilities', () => {
    const alex = TEAM_CAPABILITIES.alex;

    expect(alex.name).toBe('Alex');
    expect(alex.expertise).toContain('Scheduling');
    expect(alex.canHelpWith).toContain('Setting reminders');
    expect(alex.canHelpWith).toContain('Scheduling events');
  });

  it('should cover all team members', () => {
    const members: TeamMember[] = ['jordan', 'maya', 'alex'];

    for (const member of members) {
      expect(TEAM_CAPABILITIES[member]).toBeDefined();
      expect(TEAM_CAPABILITIES[member].name).toBeDefined();
      expect(TEAM_CAPABILITIES[member].expertise.length).toBeGreaterThan(0);
      expect(TEAM_CAPABILITIES[member].canHelpWith.length).toBeGreaterThan(0);
    }
  });
});

describe('Validation Helpers', () => {
  describe('validateProjectName', () => {
    it('should accept valid project names', () => {
      const result = validateProjectName('Summer Vacation 2025');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Summer Vacation 2025');
    });

    it('should reject empty names', () => {
      const result = validateProjectName('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject non-string names', () => {
      const result = validateProjectName(123);

      expect(result.valid).toBe(false);
    });

    it('should truncate long names', () => {
      const longName = 'A'.repeat(MAX_NAME_LENGTH + 50);
      const result = validateProjectName(longName);

      expect(result.valid).toBe(true);
      expect(result.sanitized!.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    });
  });

  describe('validateAmountField', () => {
    it('should accept valid amounts', () => {
      const result = validateAmountField(100, 'budget');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(100);
    });

    it('should reject negative amounts', () => {
      const result = validateAmountField(-50, 'budget');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('budget');
    });

    it('should reject amounts over max', () => {
      const result = validateAmountField(MAX_AMOUNT + 1, 'budget');

      expect(result.valid).toBe(false);
    });

    it('should parse string amounts', () => {
      const result = validateAmountField('250.50', 'budget');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(250.5);
    });

    it('should accept undefined/null as optional', () => {
      const result = validateAmountField(undefined, 'budget');
      expect(result.valid).toBe(true);

      const result2 = validateAmountField(null, 'budget');
      expect(result2.valid).toBe(true);
    });
  });

  describe('validateNotes', () => {
    it('should accept valid notes', () => {
      const result = validateNotes('These are my notes');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('These are my notes');
    });

    it('should handle empty notes', () => {
      const result = validateNotes('');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('');
    });

    it('should truncate long notes', () => {
      const longNotes = 'A'.repeat(MAX_NOTES_LENGTH + 100);
      const result = validateNotes(longNotes);

      expect(result.valid).toBe(true);
      expect(result.sanitized!.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
    });
  });
});

describe('findBestTeamMember', () => {
  it('should match budget topics to Maya', () => {
    const result = findBestTeamMember('budget');
    expect(result).toBe('maya');
  });

  it('should match save/money topics to Maya', () => {
    // Note: "savings" doesn't match, but "save" does
    const result = findBestTeamMember('save money');
    expect(result).toBe('maya');
  });

  it('should match scheduling topics to Alex', () => {
    const result = findBestTeamMember('schedule');
    expect(result).toBe('alex');
  });

  it('should match remind topics to Alex', () => {
    // Note: Keywords match partial - "remind" matches "reminders"
    const result = findBestTeamMember('remind me');
    expect(result).toBe('alex');
  });

  it('should match goal topics to Jordan', () => {
    const result = findBestTeamMember('goal setting');
    expect(result).toBe('jordan');
  });

  it('should match event topics to Jordan', () => {
    const result = findBestTeamMember('event planning');
    expect(result).toBe('jordan');
  });

  it('should default to Jordan for unknown topics', () => {
    const result = findBestTeamMember('random topic xyz');
    expect(result).toBe('jordan');
  });
});

describe('Constants', () => {
  it('should have reasonable MAX_NAME_LENGTH', () => {
    expect(MAX_NAME_LENGTH).toBeGreaterThan(10);
    expect(MAX_NAME_LENGTH).toBeLessThanOrEqual(200);
  });

  it('should have reasonable MAX_NOTES_LENGTH', () => {
    expect(MAX_NOTES_LENGTH).toBeGreaterThan(100);
    // Allow up to 5000 for detailed notes
    expect(MAX_NOTES_LENGTH).toBeLessThanOrEqual(10000);
  });

  it('should have reasonable MAX_AMOUNT', () => {
    expect(MAX_AMOUNT).toBeGreaterThan(1000);
    expect(MAX_AMOUNT).toBeLessThanOrEqual(100000000);
  });
});
