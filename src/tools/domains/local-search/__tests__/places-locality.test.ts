/**
 * The city lookup keeps only a locality. A street, a business or an unknown
 * name has no locality and gives null. A failed call throws, so the caller can
 * say the check failed rather than that the city is unknown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findCityByName } from '../places-locality.js';

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => body }) as Response);

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

describe('findCityByName', () => {
  it('returns only the place ID of a locality', async () => {
    const fetchMock = reply({
      places: [
        {
          id: 'ChIJ-philadelphia',
          types: ['locality', 'political'],
          displayName: { text: 'Philadelphia' },
          location: { latitude: 39.95, longitude: -75.16 },
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await findCityByName('Philly, PA')).toEqual({ placeId: 'ChIJ-philadelphia' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ textQuery: 'Philly, PA' });
  });

  it('asks Places for the place ID and types only, never the name, address or coordinates', async () => {
    const fetchMock = reply({ places: [] });
    vi.stubGlobal('fetch', fetchMock);

    await findCityByName('Philly, PA');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe('places.id,places.types');
  });

  it('returns null for a street, which is not a locality', async () => {
    vi.stubGlobal(
      'fetch',
      reply({
        places: [
          {
            types: ['route'],
            addressComponents: [
              { longText: 'Baker Street', shortText: 'Baker St', types: ['route'] },
            ],
          },
        ],
      })
    );
    expect(await findCityByName('Baker Street London')).toBeNull();
  });

  it('returns null when Places finds nothing', async () => {
    vi.stubGlobal('fetch', reply({}));
    expect(await findCityByName('Zzyzx Nowhere')).toBeNull();
  });

  it('throws when the lookup fails, so the failure is not read as an unknown city', async () => {
    vi.stubGlobal('fetch', reply({ error: 'quota' }, 503));
    await expect(findCityByName('Philadelphia')).rejects.toThrow(/unreachable \(503\)/);
  });

  it('does not pass on the body of a non-JSON reply', async () => {
    const secret = 'secret-google-body-0123';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError(
                `Unexpected token '<', "<html>${secret}</html>" is not valid JSON`
              );
            },
          }) as unknown as Response
      )
    );
    const error = await findCityByName('Philly, PA').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/unreadable reply/);
    expect(String(error)).not.toContain(secret);
  });

  it('throws without an API key', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    await expect(findCityByName('Philadelphia')).rejects.toThrow(/unconfigured/);
  });
});
