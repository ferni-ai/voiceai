import { describe, expect, it, vi } from 'vitest';
import { createFindToolsTool, FIND_TOOLS } from '../find-tools-tool.js';
import { CORE_TOOLS, setTurnToolRetrieval, TurnToolRetrieval } from '../turn-tool-retrieval.js';

type Execute = (args: { need: string }, opts: { ctx: { session: object } }) => Promise<string>;
const run = (session: object, need: string) =>
  (createFindToolsTool() as unknown as { execute: Execute }).execute({ need }, { ctx: { session } });

describe('findTools', () => {
  it('is a core tool, so live retrieval always sends it', () => {
    expect(CORE_TOOLS).toContain(FIND_TOOLS);
  });

  it("tells the model which tools it can call now", async () => {
    const session = {};
    const retrieval = { find: vi.fn(async () => [{ name: 'setTimer', description: 'Start a countdown timer.' }]) };
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
