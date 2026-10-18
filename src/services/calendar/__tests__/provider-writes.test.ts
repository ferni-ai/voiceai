/**
 * Writes to the connected calendar (#1749): which provider a write goes to, and
 * an honest result when the provider refuses or throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  google: false,
  connections: {} as Record<string, { connected: boolean } | undefined>,
  adapters: {} as Record<string, unknown>,
}));

vi.mock('../../identity/google-calendar-oauth.js', () => ({
  isCalendarConfigured: vi.fn(async () => state.google),
}));
vi.mock('../unified-calendar-store.js', () => ({
  getProviderConnection: vi.fn(
    async (_userId: string, provider: string) => state.connections[provider] ?? null
  ),
}));
vi.mock('../providers/provider-registry.js', () => ({
  getProvider: vi.fn((name: string) => state.adapters[name] ?? null),
}));

import {
  connectedWriteProvider,
  createOnProvider,
  deleteOnProvider,
  updateOnProvider,
} from '../provider-writes.js';
import type { CalendarEvent } from '../types.js';

const event = { id: 'e1', userId: 'u1', title: 'Lunch with Sam' } as unknown as CalendarEvent;
const adapter = () => ({
  createEvent: vi.fn(async () => 'ext-1'),
  updateEvent: vi.fn(async () => true),
  deleteEvent: vi.fn(async () => true),
});

beforeEach(() => {
  state.google = false;
  state.connections = {};
  state.adapters = {};
});

describe('connectedWriteProvider', () => {
  it('prefers Google when its tokens are there, even with no provider record', async () => {
    state.google = true;
    expect(await connectedWriteProvider('u1')).toBe('google');
  });

  it('falls back to Outlook, then Apple, from their provider records', async () => {
    state.connections = { apple: { connected: true } };
    expect(await connectedWriteProvider('u1')).toBe('apple');
    state.connections = { outlook: { connected: true }, apple: { connected: true } };
    expect(await connectedWriteProvider('u1')).toBe('outlook');
  });

  it('is null when nothing is connected', async () => {
    expect(await connectedWriteProvider('u1')).toBeNull();
  });
});

describe('writes to a provider', () => {
  it('a create returns the provider id when the provider took it', async () => {
    const google = adapter();
    state.adapters = { google };
    expect(await createOnProvider('u1', 'google', event)).toEqual({
      ok: true,
      externalId: 'ext-1',
    });
    expect(google.createEvent).toHaveBeenCalledWith('u1', event);
  });

  it('a create the provider refuses is not ok, never claimed as added', async () => {
    state.adapters = { google: { ...adapter(), createEvent: vi.fn(async () => null) } };
    expect(await createOnProvider('u1', 'google', event)).toEqual({ ok: false });
  });

  it('a create that throws is not ok, and does not escape', async () => {
    state.adapters = {
      outlook: { ...adapter(), createEvent: vi.fn(async () => Promise.reject(new Error('503'))) },
    };
    expect(await createOnProvider('u1', 'outlook', event)).toEqual({ ok: false });
  });

  it('an update and a delete report the provider result', async () => {
    const apple = adapter();
    state.adapters = { apple };
    expect(await updateOnProvider('u1', 'apple', event)).toBe(true);
    expect(await deleteOnProvider('u1', 'apple', 'ext-1', 'cal-9')).toBe(true);
    expect(apple.deleteEvent).toHaveBeenCalledWith('u1', 'ext-1', 'cal-9');
  });

  it('a provider with no adapter reports nothing done', async () => {
    expect(await updateOnProvider('u1', 'google', event)).toBe(false);
    expect(await deleteOnProvider('u1', 'google', 'ext-1')).toBe(false);
  });
});
