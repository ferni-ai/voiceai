/**
 * POST /api/twin/profile over real HTTP (#3868): a profile missing a scored list is a bad
 * request (400 naming the fields, nothing written), not a server error; a full profile
 * still saves and scores as before. Identity and Firestore are faked; the route is real.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      set: async (data: Record<string, unknown>) => {
        docs.set(`${name}/${id}`, { ...docs.get(`${name}/${id}`), ...structuredClone(data) });
      },
      get: async () => {
        const data = docs.get(`${name}/${id}`);
        return { exists: data !== undefined, data: () => data };
      },
    }),
  }),
};

vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fakeDb }));
vi.mock('../../request-identity.js', () => ({ getVerifiedUserId: () => 'riley-test' }));

const { handleTwinProfileRoutes } = await import('../twin-profile.js');
const { calculateCompletionPercentage } = await import('../twin-profile-completion.js');

const SCORED_LISTS = [
  'lifeChapters',
  'keyRelationships',
  'formativeExperiences',
  'signaturePhrases',
  'expressionsWhenHappy',
  'expressionsWhenSad',
  'expressionsWhenExcited',
  'expressionsWhenFrustrated',
  'coreValues',
  'whatMatters',
];

/** A full profile for the fictional test user, every list empty unless overridden. */
function fullProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...Object.fromEntries(SCORED_LISTS.map((field) => [field, []])),
    greetingStyle: '',
    farewellStyle: '',
    lifePhilosophy: '',
    beliefs: [],
    passions: [],
    hobbies: [],
    favoriteTopics: [],
    thingsToAvoid: [],
    communicationStyle: {
      formality: 'casual',
      pace: 'moderate',
      verbosity: 'moderate',
      storytelling: true,
      usesMetaphors: false,
      askingQuestions: true,
      givingAdvice: false,
    },
    ...overrides,
  };
}

let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url || '/', 'http://local');
    if (!(await handleTwinProfileRoutes(req, res, pathname))) res.writeHead(418).end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

beforeEach(() => docs.clear());

async function post(profile: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/twin/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/twin/profile body check', () => {
  it('answers 400 naming the missing lists for a partial profile, and writes nothing', async () => {
    const { status, body } = await post({ lifeChapters: [], coreValues: ['honesty'] });
    expect(status).toBe(400);
    expect(body.invalidFields).toEqual(
      SCORED_LISTS.filter((field) => field !== 'lifeChapters' && field !== 'coreValues')
    );
    expect(docs.size).toBe(0);
  });

  it('answers 400 naming a scored list that is not a list', async () => {
    const { status, body } = await post(fullProfile({ keyRelationships: 'Sam' }));
    expect(status).toBe(400);
    expect(body.invalidFields).toEqual(['keyRelationships']);
    expect(docs.size).toBe(0);
  });

  it('a 400 holds only the error and the field names, never a value from the profile', async () => {
    const values = ['Riley Test kept bees', 'lake-walk-7Q', 'grew up on Maple Row'];
    const { status, body } = await post({
      coreValues: [values[0]],
      keyRelationships: values[1],
      lifePhilosophy: values[2],
    });
    expect(status).toBe(400);
    expect(Object.keys(body).sort()).toEqual(['error', 'invalidFields']);
    expect(body.invalidFields).toContain('keyRelationships');
    const sent = JSON.stringify(body);
    for (const value of values) expect(sent).not.toContain(value);
  });

  it('answers 400 for a profile that is not an object', async () => {
    const { status, body } = await post(['lifeChapters']);
    expect(status).toBe(400);
    expect(body.invalidFields).toEqual(SCORED_LISTS);
    expect(docs.size).toBe(0);
  });

  it('saves a full profile and scores it as before', async () => {
    const { status, body } = await post(
      fullProfile({ lifeChapters: [{ id: '1' }], coreValues: ['honesty'], greetingStyle: 'Hey' })
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(docs.get('twin_profiles/riley-test')?.completionPercentage).toBe(30);
  });

  it('still saves a profile without the unscored and text fields, as today', async () => {
    const profile = fullProfile();
    for (const field of ['greetingStyle', 'beliefs', 'passions', 'communicationStyle']) {
      delete profile[field];
    }
    const { status } = await post(profile);
    expect(status).toBe(200);
    expect(docs.get('twin_profiles/riley-test')?.completionPercentage).toBe(0);
  });
});

describe('calculateCompletionPercentage', () => {
  it('keeps the original weights', () => {
    const filled = (field: string) => ({ ...fullProfile(), [field]: ['x'] });
    const weight = (field: string) => calculateCompletionPercentage(filled(field) as never);
    expect(SCORED_LISTS.map(weight)).toEqual([15, 10, 10, 15, 5, 5, 5, 5, 10, 5]);
    const text = (field: string) =>
      calculateCompletionPercentage({ ...fullProfile(), [field]: 'x' } as never);
    expect(['greetingStyle', 'farewellStyle', 'lifePhilosophy'].map(text)).toEqual([5, 5, 5]);
  });

  it('scores a fully filled profile 100', () => {
    const all = fullProfile({
      ...Object.fromEntries(SCORED_LISTS.map((field) => [field, ['x']])),
      greetingStyle: 'Hey',
      farewellStyle: 'Bye',
      lifePhilosophy: 'Keep going',
    });
    expect(calculateCompletionPercentage(all as never)).toBe(100);
  });
});
