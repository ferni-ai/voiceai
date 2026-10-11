import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFindToolsTool, FIND_TOOLS, setToolPinner } from '../find-tools-tool.js';
import { CORE_TOOLS, setTurnToolRetrieval, TurnToolRetrieval } from '../turn-tool-retrieval.js';

type Execute = (args: { need: string }, opts: { ctx: { session: object } }) => Promise<string>;
const run = (session: object, need: string) =>
  (createFindToolsTool() as unknown as { execute: Execute }).execute(
    { need },
    { ctx: { session } }
  );

describe('findTools', () => {
  it('is a core tool, so live retrieval always sends it', () => {
    expect(CORE_TOOLS).toContain(FIND_TOOLS);
  });

  it('tells the model which tools it can call now', async () => {
    const session = {};
    const retrieval = {
      find: vi.fn(async () => [{ name: 'setTimer', description: 'Start a countdown timer.' }]),
    };
    setTurnToolRetrieval(session, retrieval as unknown as TurnToolRetrieval);
    const reply = await run(session, 'a timer for the pasta');
    expect(retrieval.find).toHaveBeenCalledWith('a timer for the pasta');
    expect(reply).toContain('setTimer (Start a countdown timer.)');
  });

  it('says plainly when nothing matches or lookup is off', async () => {
    const session = {};
    setTurnToolRetrieval(session, { find: async () => [] } as unknown as TurnToolRetrieval);
    expect(await run(session, 'book a flight to mars')).toMatch(/can't do it yet/);
    expect(await run({}, 'anything')).toMatch(/unavailable/);
  });
});

describe('findTools with TOOL_CORE_STATIC', () => {
  afterEach(() => {
    delete process.env.TOOL_CORE_STATIC;
  });

  it('searches the whole catalog and pins what it found to the agent', async () => {
    process.env.TOOL_CORE_STATIC = 'on';
    const session = {};
    const retrieval = {
      find: vi.fn(async () => [
        { name: 'bookTable', description: '' },
        { name: 'noLongerExists', description: '' },
      ]),
    };
    const pin = vi.fn(async () => [{ name: 'bookTable', description: 'Book a restaurant table.' }]);
    setTurnToolRetrieval(session, retrieval as unknown as TurnToolRetrieval);
    setToolPinner(session, pin);

    const reply = await run(session, 'a table for two tonight');
    expect(retrieval.find).toHaveBeenCalledWith('a table for two tonight', 5, { anyTool: true });
    expect(pin).toHaveBeenCalledWith(['bookTable', 'noLongerExists']);
    expect(reply).toBe(
      'These tools are now available; call the one that fits: bookTable (Book a restaurant table.)'
    );
  });

  it('is unavailable without a pinner, and says so when nothing could be added', async () => {
    process.env.TOOL_CORE_STATIC = 'on';
    const session = {};
    const find = vi.fn(async () => [{ name: 'bookTable', description: '' }]);
    setTurnToolRetrieval(session, { find } as unknown as TurnToolRetrieval);
    expect(await run(session, 'a table')).toMatch(/unavailable/);
    expect(find).not.toHaveBeenCalled();
    setToolPinner(session, async () => []);
    expect(await run(session, 'a table')).toMatch(/can't do it yet/);
  });
});
