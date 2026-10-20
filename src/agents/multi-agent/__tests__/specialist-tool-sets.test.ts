/**
 * The SPECIALIST_TOOLS lists name real registry tools in the domains they say,
 * the finance lists hold no securities tools, and pickSpecialistSet keeps
 * safety and handoffs while it trims only specialty tools to the limit.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { toolRegistry } from '../../../tools/registry/index.js';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../../tools/registry/loader.js';
import type { ToolDomain } from '../../../tools/registry/types.js';
import {
  SPECIALIST_CORE_TOOLS,
  SPECIALIST_TOOL_SETS,
  specialistToolsEnabled,
} from '../specialist-tool-sets.js';
import { pickSpecialistSet, specialistToolLimit, specialtyFor } from '../specialist-tools.js';

beforeAll(() => autoRegisterAllDomains(), 60_000);
afterEach(() => vi.unstubAllEnvs());

const LISTS: Array<[string, Readonly<Record<string, ToolDomain>>]> = [
  ['core', SPECIALIST_CORE_TOOLS],
  ...Object.entries(SPECIALIST_TOOL_SETS),
];

/** Tools that quote, screen, analyse or track specific securities. */
const SECURITIES = [
  'analyzeStock',
  'findStocks',
  'marketData',
  'analyzeSECFiling',
  'technicalIndicators',
  'riskAnalysis',
  'analyzeOptionsFlow',
  'trackInsiderTrading',
  'addToPortfolio',
  'viewPortfolio',
  'addToWatchlist',
  'getMyWatchlist',
  'saveInvestmentThesis',
  'remindThesis',
  'getDailyFinancialBriefing',
  'predictBehavior',
  'bridgeMacroToPersonal',
];

describe('specialist tool lists', () => {
  it.each(LISTS)(
    '%s: every tool is registered, in the domain the list gives',
    async (_, set) => {
      await loadToolDomainsLazy([...new Set(Object.values(set))]);
      const wrong = Object.entries(set)
        .map(([name, domain]) => [name, domain, toolRegistry.get(name)?.domain] as const)
        .filter(([, domain, registered]) => registered !== domain);
      expect(wrong).toEqual([]);
    },
    60_000
  );

  // 22: the tool-choice eval (scripts/tool-retrieval/RESULTS.md) found Maya's and Alex's
  // misses were tools left off their lists; the 64 cap on the whole set still holds.
  it.each(Object.entries(SPECIALIST_TOOL_SETS))('%s: 10 to 22 tools', (_, set) => {
    expect(Object.keys(set).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(set).length).toBeLessThanOrEqual(22);
  });

  it('no list holds a tool about specific securities', () => {
    for (const [persona, set] of LISTS)
      expect(
        Object.keys(set).filter((n) => SECURITIES.includes(n)),
        persona
      ).toEqual([]);
  });

  it('Ferni has no list; the flag is off unless set', () => {
    expect(SPECIALIST_TOOL_SETS.ferni).toBeUndefined();
    expect(specialistToolsEnabled({})).toBe(false);
    expect(specialistToolsEnabled({ SPECIALIST_TOOLS: 'on' })).toBe(true);
    expect(specialtyFor('maya-santos')).toBeNull();
    vi.stubEnv('SPECIALIST_TOOLS', 'on');
    expect(specialtyFor('maya-santos')).toBe(SPECIALIST_TOOL_SETS['maya-santos']);
    expect(specialtyFor('ferni')).toBeNull();
  });
});

describe('pickSpecialistSet', () => {
  const core = Object.keys(SPECIALIST_CORE_TOOLS);
  const handoffs = ['handoffToFerni', 'handoffToAlex', 'askForTeammate'];
  const generic = ['getNews', 'tellJoke', 'quickSmartHome'];
  const tools = Object.fromEntries(
    [...generic, ...core, ...handoffs, 'endCall', 'a', 'b', 'c'].map((n) => [n, n])
  );

  it('keeps core, handoffs, endCall and specialty; drops the rest', () => {
    const out = Object.keys(pickSpecialistSet(tools, ['a', 'b', 'c'], 62));
    expect(out).toEqual([...core, 'endCall', ...handoffs, 'a', 'b', 'c']);
    for (const name of generic) expect(out).not.toContain(name);
  });

  it('trims only specialty tools, from the end, to the limit', () => {
    const limit = core.length + 1 + handoffs.length + 1;
    const out = Object.keys(pickSpecialistSet(tools, ['a', 'b', 'c'], limit));
    expect(out).toHaveLength(limit);
    expect(out).toEqual([...core, 'endCall', ...handoffs, 'a']);
  });

  it('never drops safety for room, even past the limit', () => {
    const out = Object.keys(pickSpecialistSet(tools, ['a'], 3));
    expect(out).toEqual(expect.arrayContaining([...core, ...handoffs]));
    expect(out).not.toContain('a');
  });

  it('the limit leaves room for findTools and endCall within 64', () => {
    expect(specialistToolLimit()).toBe(62);
  });
});
