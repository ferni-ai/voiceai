/**
 * Editing a contact group changes only what a person may edit.
 */
import { describe, expect, it } from 'vitest';
import { EDITABLE_GROUP_FIELDS, groupEdits } from '../contact-group-edits.js';

describe('groupEdits', () => {
  it('keeps the editable fields', () => {
    expect(
      groupEdits({
        name: 'Climbing crew',
        description: 'Tuesday nights',
        members: ['c1', 'c2'],
        defaultChannel: 'sms',
        occasionPreferences: { birthdays: true, christmas: false },
      })
    ).toEqual({
      name: 'Climbing crew',
      description: 'Tuesday nights',
      members: ['c1', 'c2'],
      defaultChannel: 'sms',
      occasionPreferences: { birthdays: true, christmas: false },
    });
  });

  it("drops what isn't the person's to edit: id, owner, timestamps", () => {
    expect(
      groupEdits({
        name: 'x',
        userId: 'other',
        id: 'other-group',
        createdAt: '2000-01-01',
        updatedAt: '2000-01-01',
      })
    ).toEqual({ name: 'x' });
    expect(EDITABLE_GROUP_FIELDS).not.toContain('id');
    expect(EDITABLE_GROUP_FIELDS).not.toContain('userId');
    expect(EDITABLE_GROUP_FIELDS).not.toContain('createdAt');
  });

  it("a field that isn't sent is left alone", () => {
    expect(groupEdits({ members: ['c1'] })).toEqual({ members: ['c1'] });
    expect(groupEdits({})).toEqual({});
  });

  it('an emptied description or channel is removed', () => {
    const edits = groupEdits({ description: '', defaultChannel: null });
    expect(edits).toEqual({ description: undefined, defaultChannel: undefined });
    expect(Object.keys(edits ?? {})).toEqual(['description', 'defaultChannel']);
  });

  it('dedupes members and keeps only known occasions', () => {
    expect(
      groupEdits({ members: ['c1', 'c1'], occasionPreferences: { birthdays: true, other: true } })
    ).toEqual({ members: ['c1'], occasionPreferences: { birthdays: true } });
  });

  it('is not an edit without a real name, or without an object', () => {
    expect(groupEdits({ name: '   ' })).toBeNull();
    expect(groupEdits({ name: 42 })).toBeNull();
    expect(groupEdits(null)).toBeNull();
    expect(groupEdits(['name'])).toBeNull();
    expect(groupEdits('name')).toBeNull();
  });

  it('is not an edit when an editable field has the wrong type', () => {
    expect(groupEdits({ members: 'c1' })).toBeNull();
    expect(groupEdits({ members: ['c1', 7] })).toBeNull();
    expect(groupEdits({ members: null })).toBeNull();
    expect(groupEdits({ defaultChannel: 'carrier-pigeon' })).toBeNull();
    expect(groupEdits({ description: 5 })).toBeNull();
    expect(groupEdits({ occasionPreferences: { birthdays: 'yes' } })).toBeNull();
    expect(groupEdits({ occasionPreferences: [] })).toBeNull();
  });
});
