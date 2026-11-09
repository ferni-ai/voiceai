/**
 * Sign-out deletes the service worker's API cache by name. public/sw.js is
 * plain script and can't import the app's constant, so this pins the two names
 * together: if the worker's cache version moves, sign-out must move with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_CACHE_NAME } from '../src/services/forget-this-person';

describe('the API cache sign-out deletes', () => {
  it('is the one public/sw.js caches API responses in', () => {
    const worker = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8');
    const version = /const CACHE_VERSION = '([^']+)';/.exec(worker)?.[1];
    expect(worker).toContain('const API_CACHE = `ferni-api-${CACHE_VERSION}`;');
    expect(`ferni-api-${version}`).toBe(API_CACHE_NAME);
  });
});
