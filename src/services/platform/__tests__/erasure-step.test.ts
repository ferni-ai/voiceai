import { describe, expect, it, vi } from 'vitest';
import { erasureErrorCode, erasureSteps } from '../erasure-step.js';

const log = { warn: vi.fn() };

const withCode = (message: string, code: unknown): Error =>
  Object.assign(new Error(message), { code });

describe('erasureSteps', () => {
  it('records a step that worked as true', async () => {
    const results: Record<string, boolean> = {};
    await erasureSteps(results, 'user-1', log)(
      'trust',
      'Failed to delete trust data',
      async () => {}
    );
    expect(results).toEqual({ trust: true });
  });

  it('records a failed step as false and lets the next step run', async () => {
    const results: Record<string, boolean> = {};
    const step = erasureSteps(results, 'user-1', log);
    await step('trust', 'Failed to delete trust data', async () => {
      throw new Error('firestore down');
    });
    await step('contacts', 'Failed to delete contacts', async () => {});
    expect(results).toEqual({ trust: false, contacts: true });
    expect(log.warn).toHaveBeenCalledWith(
      { error: 'Error', userId: 'user-1' },
      'Failed to delete trust data'
    );
  });

  it("logs the failure's code, never a message naming the person", async () => {
    log.warn.mockClear();
    await erasureSteps({}, 'user-1', log)('contacts', 'Failed to delete contacts', async () => {
      throw withCode('No document to update: contacts/someone@example.com/+15550000000', 5);
    });
    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).toContain('"error":"Error:5"');
    expect(logged).not.toContain('example.com');
    expect(logged).not.toContain('5550000000');
  });
});

describe('erasureErrorCode', () => {
  it.each([
    [withCode('14 UNAVAILABLE: bogle_users/phone:+15550000000', 14), 'Error:14'],
    [withCode('unreachable', 'unavailable'), 'Error:unavailable'],
    [withCode('no user someone@example.com', 'auth/user-not-found'), 'Error:auth/user-not-found'],
    [withCode('socket hang up', 'ECONNRESET'), 'Error:ECONNRESET'],
    [new TypeError('cannot read someone@example.com'), 'TypeError'],
  ])('keeps the class and SDK code of %s', (error, expected) => {
    expect(erasureErrorCode(error)).toBe(expected);
  });

  it.each([
    // a code that is really a document id: the base64 of an email, a phone profile
    Buffer.from('someone@example.com').toString('base64').replace(/[/+=]/g, '_'),
    'phone:+15550000000',
    'someone@example.com',
  ])('drops a code shaped like an id (%s)', (code) => {
    expect(erasureErrorCode(withCode('failed', code))).toBe('Error');
  });

  it('names only the type of a thrown non-error', () => {
    expect(erasureErrorCode('someone@example.com')).toBe('string');
    expect(erasureErrorCode(undefined)).toBe('undefined');
  });
});
