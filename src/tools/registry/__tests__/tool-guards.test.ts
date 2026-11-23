/**
 * #4251: a tool built straight from a domain's exported definitions (createDomainExport) gets the
 * guards register() adds, from one shared composition (tool-guards.ts). The user-id guard on that
 * path is behind DOMAIN_EXPORT_USER_ID_GUARD; off, the exported definition is the object main
 * exports. Tools are built by the real createDomainExport and ToolRegistry.register(). Every name
 * here is made up.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolContext, ToolDefinition } from '../types.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { createDomainExport } = await import('../loader.js');
const { gateOutboundTool } = await import('../outbound-gate.js');
const { ToolRegistry } = await import('../index.js');

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const ctx: ToolContext = { userId: 'riley-test', agentId: 'ferni', agentDisplayName: 'Ferni' };

/** A made-up tool that reports the userId it ran as, and counts its runs. */
function defWith(id = 'lookupGoals') {
  const runs = { count: 0 };
  const tool = llm.tool({
    description: 'Look up goals.',
    parameters: z.object({ userId: z.string() }),
    execute: async ({ userId }: { userId: string }) => {
      runs.count += 1;
      return { ranAs: userId };
    },
  });
  const def: ToolDefinition = {
    id,
    name: id,
    description: 'Look up goals.',
    domain: 'life-planning',
    create: (_ctx: ToolContext) => tool,
  };
  return { def, tool, runs };
}

/** The domain-exported definition, as code that builds tools straight from a domain gets it. */
function exported(def: ToolDefinition): ToolDefinition {
  const [out] = createDomainExport('life-planning', [def]).definitions;
  if (!out) throw new Error('createDomainExport returned no definition');
  return out;
}

const runAs = async (def: ToolDefinition, model: string): Promise<unknown> =>
  def.create(ctx).execute({ userId: model }, {});

describe('a tool built from createDomainExport', () => {
  it('DOMAIN_EXPORT_USER_ID_GUARD on: the session user id wins over the model one', async () => {
    process.env.DOMAIN_EXPORT_USER_ID_GUARD = 'on';
    await expect(runAs(exported(defWith().def), 'someone-else')).resolves.toEqual({
      ranAs: 'riley-test',
    });
  });

  it('off: the model user id reaches the tool, and the tool is the very one main builds', async () => {
    const { def, tool } = defWith();
    const out = exported(def);
    expect(out.create(ctx)).toBe(tool);
    await expect(runAs(out, 'someone-else')).resolves.toEqual({ ranAs: 'someone-else' });
  });

  it('off: the exported list holds the very objects main exports, so identity filters still match', () => {
    const plain = defWith().def;
    const outbound = defWith('sendTextMessage').def;
    const out = createDomainExport('life-planning', [plain, outbound]).definitions;
    expect(out[0]).toBe(plain); // main exports a non-outbound definition as itself
    expect(out.filter((d) => d !== plain).map((d) => d.id)).toEqual(['sendTextMessage']);
    // the outbound one is the gate's own result, as on main: gating it again returns it unchanged
    expect(out[1] && gateOutboundTool(out[1])).toBe(out[1]);
    expect(out[1]?.create).not.toBe(outbound.create);
  });

  it('on: each exported definition is a new, guarded object', () => {
    process.env.DOMAIN_EXPORT_USER_ID_GUARD = 'on';
    const plain = defWith().def;
    const [out] = createDomainExport('life-planning', [plain]).definitions;
    expect(out).not.toBe(plain);
    expect(out?.id).toBe(plain.id);
  });

  it('reads the flag when the domain is exported, not each time a tool is built', async () => {
    const out = exported(defWith().def);
    process.env.DOMAIN_EXPORT_USER_ID_GUARD = 'on';
    await expect(runAs(out, 'someone-else')).resolves.toEqual({ ranAs: 'someone-else' });
  });

  it('gets the outbound gate with the flag off and on: with no live call, nothing is sent', async () => {
    const { def, runs } = defWith('sendTextMessage');
    await runAs(exported(def), 'riley-test');
    process.env.DOMAIN_EXPORT_USER_ID_GUARD = 'on';
    await runAs(exported(def), 'riley-test');
    expect(runs.count).toBe(0);
    const plain = defWith(); // not an outbound tool: it runs
    await runAs(exported(plain.def), 'riley-test');
    expect(plain.runs.count).toBe(1);
  });
});

describe('register()', () => {
  it('still applies the user-id guard, with the flag off', async () => {
    const registry = new ToolRegistry();
    registry.register(defWith().def);
    const stored = registry.get('lookupGoals');
    if (!stored) throw new Error('lookupGoals was not registered');
    await expect(runAs(stored, 'someone-else')).resolves.toEqual({ ranAs: 'riley-test' });
  });

  it('still applies the outbound gate: with no live call, nothing is sent', async () => {
    const { def, runs } = defWith('sendTextMessage');
    const registry = new ToolRegistry();
    registry.register(def);
    const stored = registry.get('sendTextMessage');
    if (!stored) throw new Error('sendTextMessage was not registered');
    await runAs(stored, 'riley-test');
    expect(runs.count).toBe(0);
  });

  it('re-registering a domain-exported definition adds no second layer', async () => {
    process.env.DOMAIN_EXPORT_USER_ID_GUARD = 'on';
    const registry = new ToolRegistry();
    const ex = exported(defWith().def);
    registry.register(ex);
    const once = registry.get('lookupGoals');
    if (!once) throw new Error('lookupGoals was not registered');
    expect(once.create).toBe(ex.create); // the export's guard is marked: register() keeps it
    registry.register(once);
    const twice = registry.get('lookupGoals');
    expect(twice?.create).toBe(once.create);
    await expect(runAs(once, 'someone-else')).resolves.toEqual({ ranAs: 'riley-test' });
  });
});
