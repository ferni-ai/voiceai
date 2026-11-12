/**
 * POST /api/jobs/person-model and MINOR_CARE: the route loads the real background hold reader
 * (services/outreach/minor-care-background-read), so the job asks the stored hold record before
 * it reads anyone's memory. Only the hold doc read is faked. Ids are invented.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handlePersonModel,
  runPersonModelJob,
  type PersonModelJobDeps,
} from '../person-model-job.js';

const holdDocs = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../../services/outreach/minor-care-shared-hold.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readHoldDocStrict: vi.fn(async (uid: string) => {
    const doc = holdDocs.get(uid);
    if (doc instanceof Error) throw doc;
    return doc ?? null;
  }),
}));

const RILEY = 'rileyUid000000000000000000a';

/** One candidate whose record is missing: a read shows up as load, and as 'no-record'. */
function deps(): PersonModelJobDeps {
  return {
    holders: async () => [RILEY],
    ownFlag: async () => 'on',
    read: async () => null,
    load: vi.fn(async () => null),
    save: vi.fn(async () => 'written' as const),
  };
}

async function viaRoute(d: PersonModelJobDeps): Promise<Record<string, unknown>> {
  const end = vi.fn();
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end } as unknown as ServerResponse;
  await handlePersonModel({ url: '/api/jobs/person-model' } as IncomingMessage, res, async () => d);
  return JSON.parse(String(end.mock.calls[0]?.[0])) as Record<string, unknown>;
}

afterEach(() => {
  holdDocs.clear();
  vi.unstubAllEnvs();
});

describe('person-model job: the MINOR_CARE hold through the route', () => {
  it('without the hold reader loaded, everyone is skipped (fails closed)', async () => {
    const d = deps();
    const result = await runPersonModelJob(async () => d, { env: { PERSON_MODEL: 'on' } });
    expect(result.skipped).toEqual({ 'minor-care': 1 });
    expect(d.load).not.toHaveBeenCalled();
  });

  it('the route loads the reader: unheld is read, held or unreadable is skipped first', async () => {
    vi.stubEnv('PERSON_MODEL', 'on');
    const open = deps();
    expect(await viaRoute(open)).toMatchObject({ skipped: { 'no-record': 1 } });
    expect(open.load).toHaveBeenCalledTimes(1);

    for (const doc of [{ heldUntil: Date.now() + 3_600_000 }, new Error('unavailable')]) {
      holdDocs.set(RILEY, doc);
      const d = deps();
      // eslint-disable-next-line no-await-in-loop -- one hold state at a time
      expect(await viaRoute(d)).toMatchObject({ skipped: { 'minor-care': 1 } });
      expect(d.load).not.toHaveBeenCalled();
      expect(d.save).not.toHaveBeenCalled();
    }
  });
});
