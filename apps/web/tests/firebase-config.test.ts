import { describe, expect, it, vi } from 'vitest';

// The production build has no VITE_FIREBASE_* values (vitest gives none either).
const { loadFirebaseConfig, isFirebaseConfigured, firebaseConfig } = await import(
  '../src/config/firebase'
);

const hosted = {
  apiKey: 'AIzaTestKey',
  authDomain: 'johnb-2025.firebaseapp.com',
  projectId: 'johnb-2025',
  storageBucket: 'johnb-2025.firebasestorage.app',
  messagingSenderId: '1031920444452',
  appId: '1:1031920444452:web:test',
  databaseURL: '',
};

describe('loadFirebaseConfig', () => {
  it('keeps Firebase off when hosting has no config, without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));
    await expect(loadFirebaseConfig(fetchImpl as never, 'app.ferni.ai')).resolves.toBe(false);
    expect(isFirebaseConfigured()).toBe(false);
  });

  it('turns sign-in on from the config Firebase Hosting serves', async () => {
    const fetchImpl = vi.fn(async () => Response.json(hosted));
    await expect(loadFirebaseConfig(fetchImpl as never, 'app.ferni.ai')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('/__/firebase/init.json');
    expect(isFirebaseConfigured()).toBe(true);
    expect(firebaseConfig.authDomain).toBe('johnb-2025.firebaseapp.com');
    expect(firebaseConfig).not.toHaveProperty('databaseURL');
  });

  it('never asks a local dev server, which does not serve init.json', async () => {
    const fetchImpl = vi.fn();
    await loadFirebaseConfig(fetchImpl as never, 'localhost');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not fetch again once configured', async () => {
    const fetchImpl = vi.fn();
    await expect(loadFirebaseConfig(fetchImpl as never, 'app.ferni.ai')).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
