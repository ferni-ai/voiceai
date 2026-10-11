/**
 * Runtime gate for the developer tool domain.
 *
 * These tools run shell commands (runBash, runFerniCommand), write files
 * (editFile), read files and commit to git on the host that builds them. Their
 * only guard used to be a regex denylist inside runBash, so any path that
 * builds tools by id (a meta-tool, FTIS direct execution, a wider tool cap, a
 * future route) would hand a caller a shell on the agent or API host.
 *
 * The domain now exists only for an explicit local opt-in:
 * - FERNI_DEVELOPER_TOOLS=on, and NODE_ENV is not production. Otherwise the
 *   domain loads no tools, so the registry never holds them.
 * - Each create() also requires ctx.userId to be listed in
 *   FERNI_DEVELOPER_TOOL_USERS (comma-separated). A refused create() throws,
 *   which buildToolSet records as skipped.
 *
 * @module tools/domains/developer/access
 */

import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

type Env = Record<string, string | undefined>;

/** Whether the developer domain may load at all in this process. */
export function developerToolsEnabled(env: Env = process.env): boolean {
  return env.FERNI_DEVELOPER_TOOLS === 'on' && env.NODE_ENV !== 'production';
}

/** Whether this user may build developer tools. */
export function mayUseDeveloperTools(userId: string | undefined, env: Env = process.env): boolean {
  if (!developerToolsEnabled(env) || !userId) return false;
  const owners = (env.FERNI_DEVELOPER_TOOL_USERS ?? '').split(',').map((id) => id.trim());
  return owners.includes(userId);
}

function gate(def: ToolDefinition): ToolDefinition {
  return {
    ...def,
    create: (ctx: ToolContext): Tool => {
      if (!mayUseDeveloperTools(ctx.userId)) {
        throw new Error(`Developer tool ${def.id} is not enabled for this caller`);
      }
      return def.create(ctx);
    },
  };
}

/** The developer domain's export, with every create() gated and no tools when disabled. */
export function gatedDeveloperDomain(
  definitions: ToolDefinition[]
): ReturnType<typeof createDomainExport> {
  const gated = createDomainExport('developer', definitions.map(gate));
  return {
    ...gated,
    getToolDefinitions: async () => (developerToolsEnabled() ? gated.definitions : []),
  };
}
