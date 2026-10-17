/**
 * Editing a contact changes only what a person may edit, and emptying a field removes it.
 */
import type { ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';
import { MAX_CONTACT_PHOTO_CHARS, acceptedContactEdits, contactEdits } from '../contact-edits.js';

function response(): { res: ServerResponse; status: () => number | undefined } {
  let status: number | undefined;
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  return { res, status: () => status };
}

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

describe('acceptedContactEdits', () => {
  it('refuses a photo too big for the contact document with a 413, before anything is saved', () => {
    const { res, status } = response();
    const photo = `data:image/jpeg;base64,${'A'.repeat(MAX_CONTACT_PHOTO_CHARS)}`;
    expect(acceptedContactEdits(res, contactEdits({ photo }))).toBe(false);
    expect(status()).toBe(413);
  });

  it('accepts a photo under the cap, and edits with no photo', () => {
    const { res, status } = response();
    const photo = `data:image/jpeg;base64,${'A'.repeat(200 * 1024)}`;
    expect(acceptedContactEdits(res, contactEdits({ photo }))).toBe(true);
    expect(acceptedContactEdits(res, contactEdits({ notes: 'x' }))).toBe(true);
    expect(status()).toBeUndefined();
  });

  it('answers 400 for a body that is not an edit', () => {
    const { res, status } = response();
    expect(acceptedContactEdits(res, contactEdits('name'))).toBe(false);
    expect(status()).toBe(400);
  });
});
