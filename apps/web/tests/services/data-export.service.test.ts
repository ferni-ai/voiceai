/**
 * Data rights (export / delete data / delete account) must use the verified
 * Firebase session, only report success when the server confirms it, and leave
 * the device untouched when the server refuses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeleteAllDataSchema, ExportDataSchema } from '../../../../src/api/validators.js';

const auth = vi.hoisted(() => ({
  token: 'id-token-abc' as string | null,
  signOut: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => ({})),
  getAuthToken: vi.fn(async () => auth.token),
  getFirebaseUid: vi.fn(() => (auth.token ? 'uid-1' : null)),
  signOut: auth.signOut,
}));

vi.mock('../../src/services/push-preference.js', () => ({
  signOutReleasingPush: auth.signOut,
}));

vi.mock('../../src/services/rituals.service.js', () => ({
  ritualsService: { clearAll: vi.fn() },
}));

import {
  dataExportService,
  DataRightsError,
  dataRightsErrorMessage,
} from '../../src/services/data-export.service.js';

type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];

function mockServer(status: number, body: unknown): void {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

function headerOf(call: FetchCall, name: string): string | undefined {
  return (call.init.headers as Record<string, string>)[name];
}

describe('dataExportService', () => {
  beforeEach(() => {
    calls = [];
    auth.token = 'id-token-abc';
    auth.signOut.mockClear();
    localStorage.clear();
    localStorage.setItem('voiceai_userName', 'Sam');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteAllData', () => {
    it('calls the authenticated server delete, then clears the device', async () => {
      mockServer(200, { success: true });

      await dataExportService.deleteAllData();

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('/api/export/all');
      expect(calls[0].init.method).toBe('DELETE');
      expect(headerOf(calls[0], 'Authorization')).toBe('Bearer id-token-abc');
      // The server takes identity from the token; the body names nobody.
      const sent = JSON.parse(String(calls[0].init.body));
      expect(sent).toEqual({ confirmDelete: true });
      expect(DeleteAllDataSchema.safeParse(sent).success).toBe(true);
      expect(localStorage.getItem('voiceai_userName')).toBeNull();
    });

    it('does not claim success or wipe the device when the server refuses', async () => {
      mockServer(500, { error: 'Failed to delete data' });

      await expect(dataExportService.deleteAllData()).rejects.toBeInstanceOf(DataRightsError);
      expect(localStorage.getItem('voiceai_userName')).toBe('Sam');
    });

    it('asks the user to sign in instead of deleting nothing and saying "removed"', async () => {
      auth.token = null;
      mockServer(200, { success: true });

      const err = await dataExportService.deleteAllData().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DataRightsError);
      expect((err as DataRightsError).reason).toBe('not_signed_in');
      expect(dataRightsErrorMessage(err, 'fallback')).toBe('Sign in to delete your data.');
      expect(calls).toHaveLength(0);
      expect(localStorage.getItem('voiceai_userName')).toBe('Sam');
    });
  });

  describe('exportData', () => {
    it('exports for a signed-in user over the authenticated route', async () => {
      mockServer(200, { exportedAt: '2026-10-03', version: '1', categories: {} });
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();

      await dataExportService.exportData('json', ['Profile']);

      expect(calls[0].url).toBe('/api/export');
      expect(headerOf(calls[0], 'Authorization')).toBe('Bearer id-token-abc');
      const sent = JSON.parse(String(calls[0].init.body));
      expect(sent.userId).toBeUndefined();
      expect(ExportDataSchema.safeParse(sent).success).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('sends the confirmation the server requires, then signs out releasing push', async () => {
      mockServer(200, { success: true, details: { failures: [] } });

      expect(await dataExportService.deleteAccount()).toBeNull();

      expect(calls[0].url).toBe('/api/account');
      expect(calls[0].init.method).toBe('DELETE');
      expect(JSON.parse(String(calls[0].init.body))).toEqual({ confirmation: 'DELETE_MY_ACCOUNT' });
      expect(auth.signOut).toHaveBeenCalled();
      expect(localStorage.getItem('voiceai_userName')).toBeNull();
    });

    it('keeps the user signed in and their device intact when the server fails', async () => {
      mockServer(500, { error: "Couldn't delete your account. Nothing was closed. Try again?" });

      await expect(dataExportService.deleteAccount()).rejects.toBeInstanceOf(DataRightsError);
      expect(auth.signOut).not.toHaveBeenCalled();
      expect(localStorage.getItem('voiceai_userName')).toBe('Sam');
    });
  });
});
