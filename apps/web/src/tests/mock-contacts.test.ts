/**
 * Unit Tests for Mock Contact Data System
 * 
 * Tests the mock data helpers used in development mode
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOCK_CONTACTS,
  MOCK_NUDGES,
  getAllMockContacts,
  getMockContact,
  addMockContact,
  updateMockContact,
  deleteMockContact,
  getMockGiftSuggestions,
  getMockConversationStarters,
  getMockRelationshipInsights,
  resetMockContacts,
} from '../data/mock-contacts';

describe('Mock Contacts Data', () => {
  beforeEach(() => {
    // Reset mock data before each test
    resetMockContacts();
  });

  describe('MOCK_CONTACTS', () => {
    it('should have at least 5 mock contacts', () => {
      expect(MOCK_CONTACTS.length).toBeGreaterThanOrEqual(5);
    });

    it('should have required fields on each contact', () => {
      MOCK_CONTACTS.forEach(contact => {
        expect(contact).toHaveProperty('id');
        expect(contact).toHaveProperty('contactId');
        expect(contact).toHaveProperty('name');
        expect(contact).toHaveProperty('relationship');
        expect(contact).toHaveProperty('relationshipStrength');
      });
    });

    it('should have valid relationship types', () => {
      const validTypes = ['family', 'friend', 'colleague', 'mentor', 'acquaintance', 'other'];
      MOCK_CONTACTS.forEach(contact => {
        expect(validTypes).toContain(contact.relationship);
      });
    });

    it('should have relationship strength between 0 and 100', () => {
      MOCK_CONTACTS.forEach(contact => {
        expect(contact.relationshipStrength).toBeGreaterThanOrEqual(0);
        expect(contact.relationshipStrength).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('MOCK_NUDGES', () => {
    it('should have at least 3 nudges', () => {
      expect(MOCK_NUDGES.length).toBeGreaterThanOrEqual(3);
    });

    it('should have required fields on each nudge', () => {
      MOCK_NUDGES.forEach(nudge => {
        expect(nudge).toHaveProperty('contactId');
        expect(nudge).toHaveProperty('contactName');
        expect(nudge).toHaveProperty('reason');
        expect(nudge).toHaveProperty('priority');
        expect(nudge).toHaveProperty('action');
      });
    });

    it('should have valid priority levels', () => {
      const validPriorities = ['high', 'medium', 'low'];
      MOCK_NUDGES.forEach(nudge => {
        expect(validPriorities).toContain(nudge.priority);
      });
    });
  });

  describe('getAllMockContacts', () => {
    it('should return all mock contacts', () => {
      const contacts = getAllMockContacts();
      expect(contacts.length).toBe(MOCK_CONTACTS.length);
    });

    it('should return a copy, not the original array', () => {
      const contacts = getAllMockContacts();
      contacts.push({ id: 'test', contactId: 'test', name: 'Test', relationship: 'friend', relationshipStrength: 50 });
      expect(getAllMockContacts().length).toBe(MOCK_CONTACTS.length);
    });
  });

  describe('getMockContact', () => {
    it('should return a contact by id', () => {
      const contact = getMockContact('mom-001');
      expect(contact).toBeDefined();
      expect(contact?.name).toBe('Mom');
    });

    it('should return undefined for non-existent id', () => {
      const contact = getMockContact('non-existent-id');
      expect(contact).toBeUndefined();
    });
  });

  describe('addMockContact', () => {
    it('should add a new contact', () => {
      const newContact = {
        name: 'Test Person',
        relationship: 'friend' as const,
        email: 'test@example.com',
      };
      
      const added = addMockContact(newContact);
      
      expect(added.id).toBeDefined();
      expect(added.contactId).toBeDefined();
      expect(added.name).toBe('Test Person');
      expect(added.relationship).toBe('friend');
      expect(added.relationshipStrength).toBeDefined();
    });

    it('should be retrievable after adding', () => {
      const added = addMockContact({ name: 'New Friend', relationship: 'friend' });
      const retrieved = getMockContact(added.contactId);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('New Friend');
    });
  });

  describe('updateMockContact', () => {
    it('should update an existing contact', () => {
      const updated = updateMockContact('mom-001', { notes: 'Updated notes' });
      
      expect(updated).toBeDefined();
      expect(updated?.notes).toBe('Updated notes');
      expect(updated?.name).toBe('Mom'); // Original field preserved
    });

    it('should return undefined for non-existent contact', () => {
      const updated = updateMockContact('non-existent', { notes: 'Test' });
      expect(updated).toBeUndefined();
    });
  });

  describe('deleteMockContact', () => {
    it('should delete an existing contact', () => {
      // Add a contact first
      const added = addMockContact({ name: 'To Delete', relationship: 'acquaintance' });
      
      const deleted = deleteMockContact(added.contactId);
      expect(deleted).toBe(true);
      
      const retrieved = getMockContact(added.contactId);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existent contact', () => {
      const deleted = deleteMockContact('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getMockGiftSuggestions', () => {
    it('should return gift suggestions for a contact', () => {
      const suggestions = getMockGiftSuggestions('mom-001');
      
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should have required fields on each suggestion', () => {
      const suggestions = getMockGiftSuggestions('mom-001');
      
      suggestions.forEach(suggestion => {
        expect(suggestion).toHaveProperty('id');
        expect(suggestion).toHaveProperty('item');
        expect(suggestion).toHaveProperty('reason');
        expect(suggestion).toHaveProperty('priceRange');
      });
    });

    it('should return generic suggestions for unknown contact', () => {
      const suggestions = getMockGiftSuggestions('unknown-id');
      
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('getMockConversationStarters', () => {
    it('should return conversation starters for a contact', () => {
      const starters = getMockConversationStarters('sarah-001');
      
      expect(Array.isArray(starters)).toBe(true);
      expect(starters.length).toBeGreaterThan(0);
    });

    it('should have required fields on each starter', () => {
      const starters = getMockConversationStarters('sarah-001');
      
      starters.forEach(starter => {
        expect(starter).toHaveProperty('id');
        expect(starter).toHaveProperty('topic');
        expect(starter).toHaveProperty('opener');
      });
    });
  });

  describe('getMockRelationshipInsights', () => {
    it('should return relationship insights', () => {
      const insights = getMockRelationshipInsights();
      
      expect(insights).toHaveProperty('totalContacts');
      expect(insights).toHaveProperty('needsAttention');
      expect(insights).toHaveProperty('averageStrength');
      expect(insights).toHaveProperty('topRelationship');
      expect(insights).toHaveProperty('weeklyStats');
    });

    it('should have valid numeric values', () => {
      const insights = getMockRelationshipInsights();
      
      expect(typeof insights.totalContacts).toBe('number');
      expect(typeof insights.needsAttention).toBe('number');
      expect(insights.averageStrength).toBeGreaterThanOrEqual(0);
      expect(insights.averageStrength).toBeLessThanOrEqual(100);
    });

    it('should have weekly stats array', () => {
      const insights = getMockRelationshipInsights();
      
      expect(Array.isArray(insights.weeklyStats)).toBe(true);
      expect(insights.weeklyStats.length).toBeGreaterThan(0);
    });
  });

  describe('resetMockContacts', () => {
    it('should reset contacts to original state', () => {
      // Add some contacts
      addMockContact({ name: 'Test 1', relationship: 'friend' });
      addMockContact({ name: 'Test 2', relationship: 'colleague' });
      
      // Reset
      resetMockContacts();
      
      // Should be back to original count
      expect(getAllMockContacts().length).toBe(MOCK_CONTACTS.length);
    });
  });
});

describe('Contact Data Validation', () => {
  describe('Contact shape validation', () => {
    it('should match the expected interface', () => {
      const contact = MOCK_CONTACTS[0];
      
      // Required string fields
      expect(typeof contact.id).toBe('string');
      expect(typeof contact.contactId).toBe('string');
      expect(typeof contact.name).toBe('string');
      expect(typeof contact.relationship).toBe('string');
      
      // Required number field
      expect(typeof contact.relationshipStrength).toBe('number');
      
      // Optional fields should be undefined or correct type
      if (contact.email !== undefined) {
        expect(typeof contact.email).toBe('string');
      }
      if (contact.phone !== undefined) {
        expect(typeof contact.phone).toBe('string');
      }
      if (contact.birthday !== undefined) {
        expect(typeof contact.birthday).toBe('string');
      }
      if (contact.interests !== undefined) {
        expect(Array.isArray(contact.interests)).toBe(true);
      }
    });
  });

  describe('Important dates validation', () => {
    it('should have valid important dates format', () => {
      MOCK_CONTACTS.forEach(contact => {
        if (contact.importantDates) {
          contact.importantDates.forEach(date => {
            expect(date).toHaveProperty('type');
            expect(date).toHaveProperty('date');
            expect(date).toHaveProperty('recurring');
            expect(['birthday', 'anniversary', 'custom']).toContain(date.type);
            expect(typeof date.recurring).toBe('boolean');
          });
        }
      });
    });
  });
});

