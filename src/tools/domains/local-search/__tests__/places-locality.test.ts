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
  it('returns the locality and state Places gives back', async () => {
    const fetchMock = reply({
      places: [
        {
          types: ['locality', 'political'],
          addressComponents: [
            { longText: 'Philadelphia', shortText: 'Philadelphia', types: ['locality'] },
            { longText: 'Pennsylvania', shortText: 'PA', types: ['administrative_area_level_1'] },
          ],
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await findCityByName('Philly, PA')).toEqual({ city: 'Philadelphia', regionCode: 'PA' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ textQuery: 'Philly, PA' });
  });

  it('returns null for a street, which is not a locality', async () => {
    vi.stubGlobal(
      'fetch',
      reply({
        places: [
          {
            types: ['route'],
            addressComponents: [{ longText: 'Baker Street', shortText: 'Baker St', types: ['route'] }],
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
    await expect(findCityByName('Philadelphia')).rejects.toThrow(/status 503/);
  });

  it('throws without an API key', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    await expect(findCityByName('Philadelphia')).rejects.toThrow(/not configured/);
  });
});
