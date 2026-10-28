/**
 * MENU_TOOLS_PINNED: the menu's voice tools are kept by every cap and take no
 * slot in any of them (menu-tools-pinned.ts), so pinning them pushes no other
 * tool out. Off, every cap is exactly as before.
 */
import { llm, voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { getAgentToolNames, updateAgentTools } from '../../agents/shared/tool-updater.js';
import {
  MENU_PINNED_TOOLS,
  activeMenuPinnedTools,
  countMenuPinned,
  isMenuPinnedTool,
} from '../menu-tools-pinned.js';
import { APPEND_ONLY_TOOL_CAP, capToolsToLimit, isEssentialTool } from '../tool-config.js';

afterEach(() => vi.unstubAllEnvs());
/** The flag, plus what the two conditional tools need (prod has the first). */
const pinOn = () => {
  vi.stubEnv('MENU_TOOLS_PINNED', 'on');
  vi.stubEnv('PERSIST_AGENT_PROFILES', 'true');
  vi.stubEnv('UI_EVENTS_OVER_CALL', 'on');
};

const PINNED = [...MENU_PINNED_TOOLS];
const named = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const record = (names: string[]) => Object.fromEntries(names.map((n) => [n, { n }]));
const tool = (label: string) =>
  llm.tool({ description: label, parameters: z.object({}), execute: async () => label });
type UpdaterAgent = Parameters<typeof updateAgentTools>[0];
const tools = (names: string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));
const agentWith = (names: string[]) =>
  new voice.Agent({ instructions: 'test', tools: tools(names) }) as unknown as UpdaterAgent &
    voice.Agent<unknown>;

describe('MENU_TOOLS_PINNED off (default)', () => {
  it('pins nothing: no tool is must-keep or uncounted because of it', () => {
    for (const name of PINNED) expect(isMenuPinnedTool(name), name).toBe(false);
    expect(countMenuPinned(PINNED)).toBe(0);
    expect(isEssentialTool('logEnergy')).toBe(false);
  });

  it('the cap counts the menu tools like any other and drops them first', () => {
    const capped = Object.keys(capToolsToLimit(record([...named('other', 70), ...PINNED]), 64));
    expect(capped).toEqual(named('other', 64));
  });
});

describe('MENU_TOOLS_PINNED on', () => {
  it('pins a tool whose write needs a store or delivery only while that is on', () => {
    vi.stubEnv('MENU_TOOLS_PINNED', 'on');
    const active = activeMenuPinnedTools();
    expect(active).not.toContain('saveContactInfo'); // profile writes in memory
    expect(active).not.toContain('setTheme'); // the event never reaches the app
    expect(isMenuPinnedTool('setTheme')).toBe(false);
    expect(active).toEqual(expect.arrayContaining(['recordCommitment', 'setQuietHours']));
    vi.stubEnv('PERSIST_AGENT_PROFILES', 'true');
    vi.stubEnv('UI_EVENTS_OVER_CALL', 'on');
    expect(activeMenuPinnedTools()).toEqual(PINNED);
  });

  it('the cap keeps every pinned tool and they take no slot', () => {
    pinOn();
    // Pinned last, so a cap that counted them would cut them or the others.
    const others = named('other', 70);
    const capped = Object.keys(capToolsToLimit(record([...others, ...PINNED]), 64));
    expect(capped.filter((n) => !PINNED.includes(n as never))).toEqual(others.slice(0, 64));
    expect(capped).toEqual(expect.arrayContaining(PINNED));
    expect(capped).toHaveLength(64 + PINNED.length);
  });

  it('a set under the limit but for the pinned tools is left as it is', () => {
    pinOn();
    const set = record([...named('other', 64), ...PINNED]);
    expect(capToolsToLimit(set, 64)).toBe(set);
  });

  it('a topic load evicts nothing more than it would without them, and never a pinned tool', async () => {
    vi.stubEnv('CASCADE_APPEND_ONLY_TOOLS', 'on');
    const start = named('standing', APPEND_ONLY_TOOL_CAP - 10);
    const topic = tools(named('topic', 20));
    const after = async (names: string[]) => {
      const agent = agentWith(names);
      expect(await updateAgentTools(agent, topic)).toBe(true);
      return getAgentToolNames(agent);
    };
    const without = await after(start); // 138 > 128: one block goes
    expect(without.length).toBeLessThan(start.length);
    pinOn();
    const withPinned = await after([...start, ...PINNED]);
    expect(withPinned).toEqual(expect.arrayContaining(PINNED));
    expect(withPinned.filter((n) => !PINNED.includes(n as never))).toEqual(without);
  });

  it('the mid-call cap (64 + 24) keeps pinned tools and the same others', async () => {
    const start = named('standing', 88);
    const topic = tools(named('topic', 24));
    const after = async (names: string[]) => {
      const agent = agentWith(names);
      expect(await updateAgentTools(agent, topic)).toBe(true);
      return getAgentToolNames(agent);
    };
    const without = await after(start);
    expect(without).toHaveLength(88); // 24 standing tools made room
    pinOn();
    const withPinned = await after([...start, ...PINNED]);
    expect(withPinned).toEqual(expect.arrayContaining(PINNED));
    expect(withPinned.filter((n) => !PINNED.includes(n as never)).sort()).toEqual(without.sort());
  });
});
