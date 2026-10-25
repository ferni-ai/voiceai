/**
 * PERSONA_TOOL_POLICY: which tools no manifest may remove, and that this holds
 * whatever the tool registry has loaded.
 *
 * Before (round-1 verify of #2592): protection read a tool's registry domain,
 * and the forbidden list is worked out once, when the manifest is read. At call
 * start the registry has not loaded the crisis domain (464 of ~1,165 tools after
 * initializeToolOrchestrator), so a manifest forbidding crisis tools kept them
 * on its list, and the orchestrator's forceExclude deleted them on a trauma
 * message. Also: nothing pinned exact-name matching, and wellbeing tools outside
 * the five protected domains could be forbidden.
 *
 * Real registry, real orchestrator, real manifests (a fixture bundle under a
 * temp PERSONA_PATHS). Nothing in the tool path is mocked.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Every tool whose primary registry domain is crisis, trauma-support, human-transfer, presence or sobriety. */
const DOMAIN_TOOLS = [
  'breatheWithMe',
  'connectToHumanExpert',
  'cravingSupport',
  'createSafetyPlan',
  'deEscalateAnxiety',
  'evaluateHumanTransfer',
  'findFinancialAssistance',
  'findSafeResources',
  'groundingExercise',
  'groundingForTrauma',
  'guideGroundingExercise',
  'naturePrescription',
  'noticeThisMoment',
  'postTraumaticGrowth',
  'protectPresence',
  'provideCrisisResources',
  'quickCrisisResources',
  'selfCompassionTrauma',
  'soberSocializing',
  'sobrietyCheckin',
  'sobrietyGrief',
  'somaticSupport',
  'supportRecoveryJourney',
  'trackSobrietyMilestone',
  'traumaResponses',
  'triggerAwareness',
  'windowOfTolerance',
];
/** Wellbeing support outside those domains: grief, betrayal and anxiety support among them. */
const WELLBEING_TOOLS = [
  'anniversarySupport',
  'betrayalTrauma',
  'createSafeSpace',
  'emotionalSupport',
  'medicationCheckIn',
  'navigateSocialAnxiety',
  'postpartumCheckin',
  'wellnessCheckin',
];
/** Deliberately not protected: a habit-streak report and a money-feelings survey. */
const NOT_PROTECTED = ['habitCheckIn', 'checkInOnWellbeing'];
/** The eight the round-1 verifier saw removed on a trauma message. */
const ROUND_1_DROPPED = [
  'findFinancialAssistance',
  'findSafeResources',
  'guideGroundingExercise',
  'naturePrescription',
  'noticeThisMoment',
  'protectPresence',
  'supportRecoveryJourney',
  'trackSobrietyMilestone',
];
const PROTECTED_DOMAINS = ['crisis', 'trauma-support', 'human-transfer', 'presence', 'sobriety'];
const TRAUMA =
  "I keep having flashbacks to the assault and I'm panicking, I can't breathe and I want a drink";

let personaPaths = '';

/** A persona bundle `id` that forbids `forbidden` (Joel's manifest, renamed). */
function writeFixture(id: string, forbidden: string[]): string {
  if (!personaPaths) personaPaths = mkdtempSync(join(tmpdir(), 'persona-protect-'));
  const src = join(process.cwd(), 'src/personas/bundles/joel-dickson/persona.manifest.json');
  const manifest = JSON.parse(readFileSync(src, 'utf-8')) as {
    identity: { id: string };
    tools: { forbidden: string[] };
  };
  manifest.identity.id = id;
  manifest.tools.forbidden = forbidden;
  mkdirSync(join(personaPaths, id), { recursive: true });
  writeFileSync(join(personaPaths, id, 'persona.manifest.json'), JSON.stringify(manifest));
  return id;
}

async function fresh(flag: string) {
  vi.resetModules();
  // The orchestrator's init state is process-wide; a fresh registry needs a fresh init
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('ferni.toolOrchestrator.state')];
  writeFixture('fixture-none', []); // sets personaPaths before the env is read
  vi.stubEnv('PERSONA_PATHS', personaPaths);
  vi.stubEnv('PERSONA_TOOL_POLICY', flag);
  const policy = await import('../persona-tool-policy.js');
  const { toolRegistry } = await import('../../registry/index.js');
  return { ...policy, toolRegistry };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the protected set is known without the registry', () => {
  it('pins exactly which tools are protected by name', async () => {
    const { PROTECTED_TOOL_NAMES } = await fresh('on');
    expect([...PROTECTED_TOOL_NAMES].sort()).toEqual([...DOMAIN_TOOLS, ...WELLBEING_TOOLS].sort());
  });

  it('an empty registry still protects every one, and not the two left out', async () => {
    const { isProtectedTool, toolRegistry } = await fresh('on');
    expect(toolRegistry.getAll()).toHaveLength(0); // cold: nothing loaded
    for (const name of [...DOMAIN_TOOLS, ...WELLBEING_TOOLS])
      expect(isProtectedTool(name)).toBe(true);
    for (const name of [...NOT_PROTECTED, 'dayTrade', 'getWeather']) {
      expect(isProtectedTool(name)).toBe(false);
    }
  });

  it('the manifest read on a cold registry leaves every protected tool off the forbidden list', async () => {
    const { personaToolPolicy, forbiddenToolsNow, toolRegistry } = await fresh('on');
    const id = writeFixture('fixture-cold', [
      ...DOMAIN_TOOLS,
      ...WELLBEING_TOOLS,
      ...NOT_PROTECTED,
      'dayTrade',
    ]);
    expect(toolRegistry.get('findSafeResources')).toBeUndefined();
    const expected = [...NOT_PROTECTED, 'dayTrade'];
    expect((await personaToolPolicy(id))?.forbidden).toEqual(expected);
    expect(forbiddenToolsNow(id)).toEqual(expected); // what the mid-call paths read
  });

  it('matches the registry: every protected-domain tool is named, and every name is in its domain', async () => {
    const { PROTECTED_TOOL_NAMES, toolRegistry } = await fresh('on');
    const { autoRegisterAllDomains, loadToolDomainsLazy } =
      await import('../../registry/loader.js');
    await autoRegisterAllDomains();
    await loadToolDomainsLazy(PROTECTED_DOMAINS as never);
    const inDomains = PROTECTED_DOMAINS.flatMap((d) =>
      toolRegistry
        .getByDomain(d as never)
        .filter((t) => t.domain === d)
        .map((t) => t.id)
    );
    expect(inDomains.sort()).toEqual(DOMAIN_TOOLS);
    for (const name of DOMAIN_TOOLS) expect(PROTECTED_TOOL_NAMES.has(name)).toBe(true);
  });

  it('a tool not named yet is protected once registered in a protected domain, and only there', async () => {
    const { isProtectedTool, toolRegistry } = await fresh('on');
    for (const domain of [...PROTECTED_DOMAINS, 'wellness', 'habits']) {
      const id = `brandNew${domain.replace(/-/g, '')}`;
      expect(isProtectedTool(id)).toBe(false);
      toolRegistry.register({
        id,
        name: id,
        description: 'test only',
        domain,
        create: () => ({}),
      } as never);
      expect(isProtectedTool(id)).toBe(PROTECTED_DOMAINS.includes(domain));
    }
  });
});

describe('names match exactly, never by prefix or substring', () => {
  it('protection: a prefix or an extension of a protected name is not protected', async () => {
    const { isProtectedTool } = await fresh('on');
    for (const name of ['findSafe', 'findSafeResourcesV2', 'emotional', 'emotionalSupportPlus']) {
      expect(isProtectedTool(name)).toBe(false);
    }
  });

  it('forbidding a tool removes that tool only', async () => {
    const { withoutForbiddenTools } = await fresh('on');
    const tools = { getWeather: 1, getWeatherForecast: 2, musicControl: 3 };
    expect(Object.keys(withoutForbiddenTools(tools, ['getWeather']))).toEqual([
      'getWeatherForecast',
      'musicControl',
    ]);
    expect(Object.keys(withoutForbiddenTools(tools, ['getWeatherForecast']))).toEqual([
      'getWeather',
      'musicControl',
    ]);
    expect(withoutForbiddenTools(tools, ['Weather', 'musicCon', 'getweather'])).toBe(tools);
  });
});

describe('the orchestrator path on a cold registry (call start)', () => {
  it('keeps every protected tool a manifest forbids; still drops the ordinary ones, by exact name', async () => {
    const { toolRegistry } = await fresh('on');
    const forbidden = [
      ...DOMAIN_TOOLS,
      ...WELLBEING_TOOLS,
      'getWeather',
      'musicCon',
      'createHabit',
    ];
    const id = writeFixture('fixture-orchestrator', forbidden);
    const { initializeToolOrchestrator, getToolsForAgent } =
      await import('../voice-agent-integration.js');
    await initializeToolOrchestrator();
    expect(toolRegistry.get('findSafeResources')).toBeUndefined(); // crisis not loaded yet
    // A user per run: the orchestrator caches a selection per agent, user and transcript
    const request = (userId: string) => ({
      persona: { id, displayName: id },
      userId,
      initialTranscript: TRAUMA,
    });

    const on = Object.keys((await getToolsForAgent(request('u-on'))).tools);
    vi.stubEnv('PERSONA_TOOL_POLICY', 'off');
    const { tools, meta } = await getToolsForAgent(request('u-off'));
    const off = Object.keys(tools);

    expect(meta.mode).toBe('orchestrator');
    expect(off).toEqual(expect.arrayContaining([...ROUND_1_DROPPED, 'emotionalSupport']));
    const protectedOffered = off.filter(
      (n) => forbidden.includes(n) && !['getWeather', 'createHabit'].includes(n)
    );
    expect(protectedOffered.length).toBeGreaterThanOrEqual(ROUND_1_DROPPED.length + 1);
    expect(protectedOffered.filter((n) => !on.includes(n))).toEqual([]); // none dropped
    expect(off).toEqual(
      expect.arrayContaining(['getWeather', 'getWeatherForecast', 'musicControl', 'createHabit'])
    );
    expect(on).not.toContain('getWeather');
    expect(on).not.toContain('createHabit');
    expect(on).toEqual(expect.arrayContaining(['getWeatherForecast', 'musicControl']));
  }, 120_000);

  it('forceExclude itself never removes a protected tool with the flag on, and does with it off', async () => {
    await fresh('on');
    const { initializeToolOrchestrator, getToolsForAgent } =
      await import('../voice-agent-integration.js');
    await initializeToolOrchestrator();
    const forceExclude = ['findSafeResources', 'guideGroundingExercise', 'getWeather'];
    const request = (userId: string) => ({
      persona: { id: 'fixture-none', displayName: 'x' },
      userId,
      initialTranscript: TRAUMA,
      forceExclude,
    });

    const on = Object.keys((await getToolsForAgent(request('u-on'))).tools);
    vi.stubEnv('PERSONA_TOOL_POLICY', 'off');
    const off = Object.keys((await getToolsForAgent(request('u-off'))).tools);

    expect(on).toEqual(expect.arrayContaining(['findSafeResources', 'guideGroundingExercise']));
    expect(on).not.toContain('getWeather');
    for (const n of forceExclude) expect(off).not.toContain(n); // off: as on main
  }, 120_000);
});

describe('flag off: the manifest changes nothing', () => {
  it('a persona forbidding every protected and ordinary tool gets the same tools as one forbidding none', async () => {
    await fresh('off');
    writeFixture('fixture-all', [...DOMAIN_TOOLS, ...WELLBEING_TOOLS, 'getWeather', 'createHabit']);
    const { initializeToolOrchestrator, getToolsForAgent } =
      await import('../voice-agent-integration.js');
    await initializeToolOrchestrator();
    const names = async (id: string, path: object) => {
      const request = {
        persona: { id, displayName: 'x' },
        userId: `u-${id}`,
        initialTranscript: TRAUMA,
      };
      return Object.keys((await getToolsForAgent({ ...request, ...path })).tools);
    };
    expect(await names('fixture-all', {})).toEqual(
      expect.arrayContaining(['getWeather', 'createHabit', 'findSafeResources', 'emotionalSupport'])
    );
    for (const path of [{}, { fastPath: true }, { useLegacy: true }]) {
      // eslint-disable-next-line no-await-in-loop -- one orchestrator, one path at a time
      expect(await names('fixture-all', path)).toEqual(await names('fixture-none', path));
    }
  }, 120_000);
});

describe("the orchestrator's selection cache (5 min) never serves a selection made under other rules", () => {
  it('flag off: the key is as on main', async () => {
    await fresh('off');
    const { buildCacheKey } = await import('../orchestrator-helpers.js');
    const request = {
      transcript: 'Hi, Ferni!',
      userId: 'u1',
      agentId: 'ferni',
      forceExclude: ['x'],
    };
    expect(buildCacheKey(request as never)).toBe('ferni:u1:hi ferni');
  });

  it('a flag flip within the cache lifetime gives the fresh selection, both ways', async () => {
    await fresh('on');
    const id = writeFixture('fixture-cache-flip', ['getWeather']);
    const { initializeToolOrchestrator, getToolsForAgent } =
      await import('../voice-agent-integration.js');
    await initializeToolOrchestrator();
    // One agent, user and transcript throughout: the same cache entry on main
    const names = async (flag: string) => {
      vi.stubEnv('PERSONA_TOOL_POLICY', flag);
      const request = {
        persona: { id, displayName: id },
        userId: 'u-flip',
        initialTranscript: TRAUMA,
      };
      return Object.keys((await getToolsForAgent(request)).tools);
    };

    expect(await names('on')).not.toContain('getWeather');
    expect(await names('off')).toContain('getWeather'); // not the policy's selection
    expect(await names('on')).not.toContain('getWeather');
  }, 120_000);

  it('flag on: a different forceExclude within the cache lifetime gives the fresh selection', async () => {
    await fresh('on');
    const { initializeToolOrchestrator, getToolsForAgent } =
      await import('../voice-agent-integration.js');
    await initializeToolOrchestrator();
    const names = async (forceExclude: string[]) => {
      const request = {
        persona: { id: 'fixture-none', displayName: 'x' },
        userId: 'u-exclude',
        initialTranscript: TRAUMA,
        forceExclude,
      };
      return Object.keys((await getToolsForAgent(request)).tools);
    };

    expect(await names(['getWeather'])).not.toContain('getWeather');
    expect(await names([])).toContain('getWeather');
    expect(await names(['getWeather'])).not.toContain('getWeather');
  }, 120_000);
});
