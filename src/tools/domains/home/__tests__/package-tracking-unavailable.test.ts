/**
 * Package tracking without a live provider.
 *
 * With no AfterShip key, or when AfterShip errors, the tools must say live
 * tracking is unavailable and report no status, ETA or events. The real
 * module is loaded fresh per test so the env read at import time is exercised.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    safeLog: () => mockLogger,
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncTravelToCalendar: vi.fn(),
}));

import type { ToolContext } from '../../../registry/types.js';

type Packages = typeof import('../packages.js');
type ExecTool = { execute: (args: object, opts: unknown) => Promise<unknown> };

const TOOL_IDS = ['trackPackage', 'getPackages', 'checkPackageStatus'] as const;
const UPS_NUMBER = '1Z999AA10123456784';
const toolCtx = { userId: 'u-pkg', agentId: 'ferni', sessionId: 's1' } as ToolContext;
const opts = { toolCallId: 't', ctx: { userData: { userId: 'u-pkg' } } };

// Words and dates that would only appear if a status or ETA had been made up.
const INVENTED =
  /in transit|out for delivery|arriv|expected|label created|picked up|distribution center|\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b/i;

// Loads the production tool definitions the registry serves, via create(ctx).
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ['AFTERSHIP_API_KEY', 'UPS_ACCESS_KEY', 'FEDEX_API_KEY']) {
    vi.stubEnv(key, env[key] ?? '');
  }
  const packages: Packages = await import('../packages.js');
  const { getPackageToolDefinitions } = await import('../../productivity/index.js');
  const defs = getPackageToolDefinitions();
  const tools = Object.fromEntries(
    TOOL_IDS.map((id) => {
      const def = defs.find((d) => d.id === id);
      if (!def) throw new Error(`${id} not registered`);
      return [id, def.create(toolCtx) as ExecTool];
    })
  ) as Record<(typeof TOOL_IDS)[number], ExecTool>;
  const run = async (id: (typeof TOOL_IDS)[number], args: object) =>
    String(await tools[id].execute(args, opts));
  return { packages, run };
}

function aftershipResponse(tracking: object, status = 200): Response {
  return new Response(JSON.stringify({ data: { tracking } }), { status });
}

// The productivity domain pulls in a lot; transform it once up front so the
// per-test fresh imports stay inside the default timeout.
beforeAll(async () => {
  await import('../../productivity/index.js');
}, 180_000);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('package tracking with no tracking key', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error('no network call expected');
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('the lookup is unavailable and carries no status, with no network call', async () => {
    const { packages } = await load({});
    expect(packages.isTrackingApiConfigured()).toBe(false);
    const outcome = await packages.fetchTrackingInfo(UPS_NUMBER, 'ups');
    expect(outcome).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('trackPackage saves the package and says plainly it cannot look up tracking', async () => {
    const { run } = await load({});
    const text = await run('trackPackage', {
      trackingNumber: UPS_NUMBER,
      description: 'headphones',
    });
    expect(text).toContain("I can't look up live tracking right now");
    expect(text).toContain('headphones');
    expect(text).toContain('UPS');
    expect(text).toContain(UPS_NUMBER);
    expect(text).toContain('ups.com/track');
    expect(text).not.toMatch(INVENTED);
  });

  it('getPackages lists the saved package with no made-up status or ETA', async () => {
    const { run } = await load({});
    await run('trackPackage', { trackingNumber: UPS_NUMBER, description: 'headphones' });
    const text = await run('getPackages', {});
    expect(text).toContain('headphones');
    expect(text).toContain('no tracking update yet');
    expect(text).not.toMatch(INVENTED);
  });

  it('checkPackageStatus says it cannot look up tracking and invents nothing', async () => {
    const { run } = await load({});
    await run('trackPackage', { trackingNumber: UPS_NUMBER, description: 'headphones' });
    const text = await run('checkPackageStatus', { packageDescription: 'headphones' });
    expect(text).toContain("I can't look up live tracking right now");
    expect(text).not.toMatch(INVENTED);
  });
});

describe('package tracking when the provider errors', () => {
  it('is unavailable, not mock data, when AfterShip answers with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const { packages, run } = await load({ AFTERSHIP_API_KEY: 'k' });
    expect(await packages.fetchTrackingInfo(UPS_NUMBER, 'ups')).toEqual({
      status: 'unavailable',
      reason: 'provider-error',
    });
    const text = await run('trackPackage', {
      trackingNumber: UPS_NUMBER,
      description: 'headphones',
    });
    expect(text).toContain("I can't look up live tracking right now");
    expect(text).not.toMatch(INVENTED);
    const status = await run('checkPackageStatus', { packageDescription: 'headphones' });
    expect(status).toContain("I can't look up live tracking right now");
    expect(status).not.toMatch(INVENTED);
  });

  it('is unavailable when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { packages } = await load({ AFTERSHIP_API_KEY: 'k' });
    expect(await packages.fetchTrackingInfo(UPS_NUMBER, 'ups')).toEqual({
      status: 'unavailable',
      reason: 'provider-error',
    });
  });
});

describe('package tracking with a live provider', () => {
  const checkpoints = [
    { checkpoint_time: '2026-10-14T09:00:00Z', tag: 'InfoReceived', message: 'Label created' },
    {
      checkpoint_time: '2026-10-15T09:00:00Z',
      tag: 'InTransit',
      city: 'Louisville',
      message: 'Departed UPS facility',
    },
  ];

  it("reports the provider's status, ETA and events", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        aftershipResponse({ expected_delivery: '2026-10-20T12:00:00Z', checkpoints })
      )
    );
    const { run } = await load({ AFTERSHIP_API_KEY: 'k' });
    const added = await run('trackPackage', {
      trackingNumber: UPS_NUMBER,
      description: 'headphones',
    });
    expect(added).toContain('Status: in transit');
    expect(added).toMatch(/Expected: \w+day, October 20/);
    const status = await run('checkPackageStatus', { packageDescription: 'headphones' });
    expect(status).toContain('**Status:** in transit');
    expect(status).toContain('Departed UPS facility');
  });

  it('gives no ETA when the provider gives none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => aftershipResponse({ checkpoints }))
    );
    const { run } = await load({ AFTERSHIP_API_KEY: 'k' });
    const added = await run('trackPackage', {
      trackingNumber: UPS_NUMBER,
      description: 'headphones',
    });
    expect(added).toContain('Status: in transit');
    expect(added).not.toMatch(/Expected/);
  });

  it('keeps the last live status but says it is not fresh when a refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(aftershipResponse({ checkpoints }))
        .mockResolvedValueOnce(new Response('nope', { status: 503 }))
    );
    const { run } = await load({ AFTERSHIP_API_KEY: 'k' });
    await run('trackPackage', { trackingNumber: UPS_NUMBER, description: 'headphones' });
    const status = await run('checkPackageStatus', { packageDescription: 'headphones' });
    expect(status).toContain(
      "The last status I had was in transit, but I couldn't get a fresh update"
    );
    expect(status).toContain("I can't look up live tracking right now");
  });
});
