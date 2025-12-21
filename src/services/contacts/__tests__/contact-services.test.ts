/**
 * Contact Services Test Suite
 *
 * Comprehensive tests for the "Better Than Human" contact management system.
 * Tests contact CRUD, groups, important dates, outreach nudges, and personalized messaging.
 *
 * @module tests/contact-services
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ContactRelationship } from '../contact-relationship-service.js';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  })),
}));

// Mock LLM utils
vi.mock('../../llm-utils.js', () => ({
  callLLM: vi.fn().mockResolvedValue('Happy birthday! Hope your day is filled with joy and laughter. Thinking of you!'),
}));

// ============================================================================
// CONTACT RELATIONSHIP SERVICE TESTS
// ============================================================================

describe('ContactRelationshipService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertContact', () => {
    it('should create a new contact with all required fields', async () => {
      const { upsertContact, getContact, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      const contact = await upsertContact('user123', {
        name: 'Mom',
        contactId: 'mom@family.com',
        email: 'mom@family.com',
        phone: '+15551234567',
        relationship: 'family',
        notes: 'Always calls on Sundays',
        importantDates: [
          { date: '03-15', type: 'birthday', label: "Mom's Birthday" },
          { date: '05-10', type: 'anniversary', label: 'Wedding Anniversary' },
        ],
      });

      expect(contact.id).toBeDefined();
      expect(contact.name).toBe('Mom');
      expect(contact.email).toBe('mom@family.com');
      expect(contact.relationship).toBe('family');
      expect(contact.importantDates).toHaveLength(2);
      expect(contact.strengthScore).toBe(50); // Default
    });

    it('should update existing contact preserving important dates', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      // Create initial contact
      const initial = await upsertContact('user123', {
        name: 'Dad',
        contactId: 'dad@family.com',
        importantDates: [{ date: '06-20', type: 'birthday', label: "Dad's Birthday" }],
      });

      // Update with new info
      const updated = await upsertContact('user123', {
        ...initial,
        phone: '+15559876543',
        notes: 'Loves fishing',
      });

      expect(updated.id).toBe(initial.id);
      expect(updated.phone).toBe('+15559876543');
      expect(updated.importantDates).toHaveLength(1);
    });
  });

  describe('recordInteraction', () => {
    it('should boost strength score on interaction', async () => {
      const { upsertContact, recordInteraction, getContact, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      const contact = await upsertContact('user123', {
        name: 'Friend',
        contactId: 'friend@email.com',
      });

      const initialScore = contact.strengthScore;

      await recordInteraction('user123', {
        contactId: contact.contactId,
        userId: 'user123',
        date: new Date(),
        type: 'call',
        direction: 'outbound',
        summary: 'Caught up about life',
      });

      const updated = await getContact('user123', contact.contactId);
      expect(updated?.strengthScore).toBeGreaterThan(initialScore);
      expect(updated?.interactionCount).toBe(1);
    });
  });

  describe('getContactsNeedingAttention', () => {
    it('should return contacts with low strength or old last interaction', async () => {
      const { upsertContact, getContactsNeedingAttention, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      // Create contacts with varying recency
      await upsertContact('user123', {
        name: 'Recent Contact',
        contactId: 'recent@email.com',
        lastInteraction: new Date(),
        strengthScore: 80,
      });

      await upsertContact('user123', {
        name: 'Neglected Contact',
        contactId: 'neglected@email.com',
        lastInteraction: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        strengthScore: 30,
      });

      const needsAttention = await getContactsNeedingAttention('user123', 5);
      
      expect(needsAttention.length).toBeGreaterThan(0);
      expect(needsAttention[0].name).toBe('Neglected Contact');
    });
  });

  describe('searchContacts', () => {
    it('should find contacts by partial name match', async () => {
      const { upsertContact, searchContacts, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      await upsertContact('user123', { name: 'Sarah Johnson', contactId: 'sarah@email.com' });
      await upsertContact('user123', { name: 'John Smith', contactId: 'john@email.com' });
      await upsertContact('user123', { name: 'Sarah Williams', contactId: 'sarahw@email.com' });

      const results = await searchContacts('user123', 'Sarah');
      
      expect(results).toHaveLength(2);
      expect(results.every(c => c.name.includes('Sarah'))).toBe(true);
    });
  });
});

// ============================================================================
// CONTACT GROUPS TESTS
// ============================================================================

describe('ContactGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should create a group with members', async () => {
      const { createGroup, clearCache } = await import('../contact-groups.js');
      clearCache();

      const group = await createGroup('user123', {
        name: 'Family',
        description: 'Immediate family members',
        members: ['mom@email.com', 'dad@email.com', 'sister@email.com'],
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Family');
      expect(group.members).toHaveLength(3);
    });
  });

  describe('addToGroup', () => {
    it('should add contacts to existing group', async () => {
      const { createGroup, addToGroup, getGroup, clearCache } = await import('../contact-groups.js');
      clearCache();

      const group = await createGroup('user123', {
        name: 'Friends',
        members: ['friend1@email.com'],
      });

      await addToGroup('user123', group.id, ['friend2@email.com', 'friend3@email.com']);

      const updated = await getGroup('user123', group.id);
      expect(updated?.members).toHaveLength(3);
    });
  });

  describe('getGroupsForOccasion', () => {
    it('should return groups appropriate for holidays', async () => {
      const { createGroup, getGroupsForOccasion, clearCache } = await import('../contact-groups.js');
      clearCache();

      await createGroup('user123', {
        name: 'Family',
        members: ['family@email.com'],
        occasionPreferences: {
          christmas: true,
          thanksgiving: true,
          birthdays: false,
        },
      });

      await createGroup('user123', {
        name: 'Colleagues',
        members: ['work@email.com'],
        occasionPreferences: {
          christmas: false,
          thanksgiving: false,
          birthdays: true,
        },
      });

      const christmasGroups = await getGroupsForOccasion('user123', 'christmas');
      expect(christmasGroups).toHaveLength(1);
      expect(christmasGroups[0].name).toBe('Family');
    });
  });
});

// ============================================================================
// OUTREACH NUDGES TESTS
// ============================================================================

describe('OutreachNudges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildNudgeContext', () => {
    it('should generate nudges for upcoming birthdays', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      const { buildNudgeContext } = await import('../outreach-nudges.js');
      clearCache();

      // Create contact with birthday in next 7 days
      const today = new Date();
      const upcomingBirthday = new Date(today);
      upcomingBirthday.setDate(today.getDate() + 3);
      const monthDay = `${String(upcomingBirthday.getMonth() + 1).padStart(2, '0')}-${String(upcomingBirthday.getDate()).padStart(2, '0')}`;

      await upsertContact('user123', {
        name: 'Birthday Person',
        contactId: 'birthday@email.com',
        importantDates: [{ date: monthDay, type: 'birthday', label: 'Birthday' }],
      });

      const context = await buildNudgeContext('user123');

      expect(context.upcomingDates.length).toBeGreaterThan(0);
      expect(context.nudges.some(n => n.contactName === 'Birthday Person')).toBe(true);
    });

    it('should include holiday nudges for appropriate contacts', async () => {
      const { buildNudgeContext } = await import('../outreach-nudges.js');

      const context = await buildNudgeContext('user123');

      // Should include upcoming holidays in context
      expect(context.upcomingHolidays).toBeDefined();
    });
  });

  describe('getOverdueFrequentContacts', () => {
    it('should flag frequently contacted people who are overdue', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      const { getOverdueFrequentContacts } = await import('../outreach-nudges.js');
      clearCache();

      // High interaction count but old last interaction
      await upsertContact('user123', {
        name: 'Frequent but Overdue',
        contactId: 'frequent@email.com',
        interactionCount: 50,
        lastInteraction: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        strengthScore: 85,
      });

      const overdue = await getOverdueFrequentContacts('user123');

      expect(overdue.some(c => c.contactName === 'Frequent but Overdue')).toBe(true);
    });
  });
});

// ============================================================================
// PERSONALIZED OUTREACH TESTS
// ============================================================================

describe('PersonalizedOutreach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildOutreachContext', () => {
    it('should build rich context from contact data', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      const { buildOutreachContext } = await import('../personalized-outreach.js');
      clearCache();

      const contact = await upsertContact('user123', {
        name: 'Best Friend',
        contactId: 'bestfriend@email.com',
        relationship: 'friend',
        recentContext: ['wedding planning', 'new puppy'],
      });

      const context = await buildOutreachContext(
        'user123',
        contact.contactId,
        'check_in',
        'warm'
      );

      expect(context).toBeDefined();
      expect(context?.contact.name).toBe('Best Friend');
    });
  });
});

// ============================================================================
// "BETTER THAN HUMAN" CAPABILITIES TESTS
// ============================================================================

describe('Better Than Human Capabilities', () => {
  describe('Perfect Memory', () => {
    it('should remember all important dates without reminders', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      const { buildNudgeContext } = await import('../outreach-nudges.js');
      clearCache();

      // Add contact with multiple important dates
      await upsertContact('user123', {
        name: 'Sister',
        contactId: 'sister@email.com',
        importantDates: [
          { date: '01-15', type: 'birthday', label: 'Birthday' },
          { date: '06-22', type: 'anniversary', label: 'Wedding Anniversary' },
          { date: '09-01', type: 'custom', label: 'Started new job' },
        ],
      });

      const context = await buildNudgeContext('user123');

      // Should track all dates
      expect(context.summary).toBeDefined();
    });
  });

  describe('Proactive Outreach', () => {
    it('should suggest outreach BEFORE important dates', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      const { buildNudgeContext } = await import('../outreach-nudges.js');
      clearCache();

      // Create contact with birthday in 5 days
      const today = new Date();
      const upcoming = new Date(today);
      upcoming.setDate(today.getDate() + 5);
      const monthDay = `${String(upcoming.getMonth() + 1).padStart(2, '0')}-${String(upcoming.getDate()).padStart(2, '0')}`;

      await upsertContact('user123', {
        name: 'Upcoming Birthday',
        contactId: 'upcoming@email.com',
        importantDates: [{ date: monthDay, type: 'birthday', label: 'Birthday' }],
      });

      const context = await buildNudgeContext('user123');

      // Should proactively nudge before the date
      const birthdayNudge = context.nudges.find(n => 
        n.contactName === 'Upcoming Birthday' && 
        n.type === 'upcoming_birthday'
      );
      expect(birthdayNudge).toBeDefined();
    });
  });

  describe('Relationship Health Awareness', () => {
    it('should detect declining relationship health', async () => {
      const { upsertContact, getRelationshipInsights, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      // Contact with declining metrics
      await upsertContact('user123', {
        name: 'Drifting Friend',
        contactId: 'drifting@email.com',
        strengthScore: 25, // Low
        interactionCount: 100, // High history
        lastInteraction: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      });

      const insights = await getRelationshipInsights('user123');

      // Should flag relationship at risk
      const weakening = insights.find(i => 
        i.insightType === 'weakening' && 
        i.contactName === 'Drifting Friend'
      );
      expect(weakening).toBeDefined();
    });
  });
});


