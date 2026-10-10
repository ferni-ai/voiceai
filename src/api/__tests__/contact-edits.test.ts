/**
 * Editing a contact changes only what a person may edit, and emptying a field removes it.
 */
import { describe, expect, it } from 'vitest';
import { contactEdits } from '../contact-edits.js';

describe('contactEdits', () => {
  it('keeps the editable fields', () => {
    expect(
      contactEdits({ name: 'Priya', phone: '+15555550123', interests: ['chess'], photo: 'data:x' })
    ).toEqual({ name: 'Priya', phone: '+15555550123', interests: ['chess'], photo: 'data:x' });
  });

  it("drops what isn't the person's to edit: owner, scores, history", () => {
    expect(
      contactEdits({
        notes: 'hi',
        userId: 'someone-else',
        id: 'other-doc',
        strengthScore: 100,
        interactionCount: 999,
        createdAt: '2000-01-01',
      })
    ).toEqual({ notes: 'hi' });
  });

  it('an emptied field is removed, not kept', () => {
    const edits = contactEdits({ phone: '', email: null, interests: [], notes: '' });
    expect(edits).toEqual({ phone: undefined, email: undefined, interests: undefined, notes: undefined });
    // Present as keys, so spreading them over the stored contact clears those fields
    expect(Object.keys(edits ?? {})).toEqual(['email', 'phone', 'notes', 'interests']);
  });

  it("a field that isn't sent is left alone", () => {
    expect(contactEdits({ notes: 'x' })).not.toHaveProperty('phone');
  });

  it('is not an edit without a real name, or without an object', () => {
    expect(contactEdits({ name: '   ' })).toBeNull();
    expect(contactEdits({ name: 42 })).toBeNull();
    expect(contactEdits(null)).toBeNull();
    expect(contactEdits(['name'])).toBeNull();
    expect(contactEdits('name')).toBeNull();
  });
});
