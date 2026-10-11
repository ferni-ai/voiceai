/**
 * The developer domain (runBash, editFile, gitCommit, ...) builds nothing
 * unless FERNI_DEVELOPER_TOOLS=on outside production AND the caller is a
 * listed owner.
 *
 * Before: the domain registered unconditionally and create() had no check, so
 * any path that built tools by id handed the caller a shell on the host.
 *
 * Drives the real domain export and the real ToolRegistry.buildToolSet. Tools
 * are only built, never executed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolRegistry } from '../../../registry/index.js';
import type { ToolContext } from '../../../registry/types.js';
import { definitions, getToolDefinitions } from '../index.js';

const SHELL_TOOLS = ['runBash', 'editFile'];

function ctx(userId: string): ToolContext {
  return { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
}

function build(userId: string): { built: string[]; skipped: string[] } {
  const registry = new ToolRegistry();
  registry.registerAll(definitions);
  const result = registry.buildToolSet({ optional: SHELL_TOOLS }, ctx(userId));
  return {
    built: Object.keys(result.tools),
    skipped: result.skipped.map((s) => s.toolId),
  };
}

describe('developer tool gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('with the flag unset, the domain loads nothing and runBash/editFile do not build', async () => {
    vi.stubEnv('FERNI_DEVELOPER_TOOLS', '');
    vi.stubEnv('FERNI_DEVELOPER_TOOL_USERS', 'owner-1');

    expect(await getToolDefinitions()).toEqual([]);
    expect(build('owner-1')).toEqual({ built: [], skipped: SHELL_TOOLS });
  });

  it('with the flag on and an owner, the domain loads and the tools build', async () => {
    vi.stubEnv('FERNI_DEVELOPER_TOOLS', 'on');
    vi.stubEnv('FERNI_DEVELOPER_TOOL_USERS', 'someone, owner-1');

    expect((await getToolDefinitions()).map((d) => d.id)).toEqual(
      expect.arrayContaining(SHELL_TOOLS)
    );
    expect(build('owner-1')).toEqual({ built: SHELL_TOOLS, skipped: [] });
  });

  it('with the flag on and a non-owner, the tools do not build', () => {
    vi.stubEnv('FERNI_DEVELOPER_TOOLS', 'on');
    vi.stubEnv('FERNI_DEVELOPER_TOOL_USERS', 'owner-1');

    expect(build('not-an-owner')).toEqual({ built: [], skipped: SHELL_TOOLS });
  });

  it('with the flag on and no owner list, nobody builds them', () => {
    vi.stubEnv('FERNI_DEVELOPER_TOOLS', 'on');
    vi.stubEnv('FERNI_DEVELOPER_TOOL_USERS', '');

    expect(build('')).toEqual({ built: [], skipped: SHELL_TOOLS });
    expect(build('anonymous')).toEqual({ built: [], skipped: SHELL_TOOLS });
  });

  it('in production the flag is ignored: nothing loads and nothing builds', async () => {
    vi.stubEnv('FERNI_DEVELOPER_TOOLS', 'on');
    vi.stubEnv('FERNI_DEVELOPER_TOOL_USERS', 'owner-1');
    vi.stubEnv('NODE_ENV', 'production');

    expect(await getToolDefinitions()).toEqual([]);
    expect(build('owner-1')).toEqual({ built: [], skipped: SHELL_TOOLS });
  });
});
