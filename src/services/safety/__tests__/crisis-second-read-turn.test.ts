/**
 * #2587's redesign: the gate decides once per turn whether prompt v3 may fill it; the pipeline
 * reads that decision, and a fill about the caller never stands over a read about someone else.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  gateDecidedFill,
  noteSecondReadTurn,
  resetSecondReadTurns,
  selfFillStands,
  type SecondReadView,
} from '../crisis-second-read-turn.js';

const FERNI = 'That sounds really scary. How are you holding up?';
const FRIEND = 'my friend keeps saying she wants to kill herself';
const OLDER = ['I am okay I guess.', 'We had pizza earlier.', 'The game was on.', 'The home team.'];

/** The gate reads the turn's two lines joined; the pipeline reads the last, the first in earlier. */
const gateView: SecondReadView = {
  latest: 'anyway. should i drive over tonight',
  earlier: [FRIEND, ...OLDER],
  companion: FERNI,
};
const pipeView: SecondReadView = {
  latest: 'should i drive over tonight',
  earlier: [...OLDER, 'anyway.'],
  companion: FERNI,
};
const no = Promise.resolve(false);
const yes = Promise.resolve(true);

beforeEach(() => resetSecondReadTurns());

describe('gateDecidedFill: the pipeline reads the gate decision', () => {
  it('no gate decision yet: no fill', () => {
    expect(gateDecidedFill('call', pipeView)).toBe(false);
    noteSecondReadTurn('call', 'pipeline', pipeView, true, no);
    expect(gateDecidedFill('call', pipeView)).toBe(false);
  });

  it("follows the gate's decision for the turn its joined lines end with", () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    expect(gateDecidedFill('call', pipeView)).toBe(true);
    resetSecondReadTurns();
    noteSecondReadTurn('call', 'gate', gateView, false, no);
    expect(gateDecidedFill('call', pipeView)).toBe(false);
  });

  it('any gate read of the turn that said no wins', () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    noteSecondReadTurn('call', 'gate', gateView, false, no);
    expect(gateDecidedFill('call', pipeView)).toBe(false);
  });

  it('a line the pipeline reads that the gate never read: no fill', () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    const wider = { ...pipeView, earlier: ['my brother says he wants to end his life', 'anyway.'] };
    expect(gateDecidedFill('call', wider)).toBe(false);
  });

  it('another turn, call or Ferni line is not this turn', () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    expect(gateDecidedFill('other', pipeView)).toBe(false);
    expect(gateDecidedFill('call', { ...pipeView, companion: 'Who won?' })).toBe(false);
    // The burst's first line is not the turn the gate's joined lines end with.
    expect(gateDecidedFill('call', { ...pipeView, latest: 'anyway.', earlier: OLDER })).toBe(false);
    expect(gateDecidedFill('call', { ...pipeView, latest: 'over' })).toBe(false);
  });

  it('no call: no fill', () => {
    noteSecondReadTurn(undefined, 'gate', gateView, true, no);
    expect(gateDecidedFill(undefined, pipeView)).toBe(false);
  });
});

describe('selfFillStands: never over a read about someone else', () => {
  it('stands once both paths noted the turn and neither read someone else', async () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    noteSecondReadTurn('call', 'pipeline', pipeView, true, no);
    expect(await selfFillStands('call', 'gate', gateView, 50)).toBe(true);
    expect(await selfFillStands('call', 'pipeline', pipeView, 50)).toBe(true);
  });

  for (const who of ['gate', 'pipeline'] as const) {
    it(`drops the fill on both paths when the ${who}'s read is about someone else`, async () => {
      noteSecondReadTurn('call', 'gate', gateView, true, who === 'gate' ? yes : no);
      noteSecondReadTurn('call', 'pipeline', pipeView, true, who === 'pipeline' ? yes : no);
      expect(await selfFillStands('call', 'gate', gateView, 50)).toBe(false);
      expect(await selfFillStands('call', 'pipeline', pipeView, 50)).toBe(false);
    });
  }

  it('waits for a read still in flight, and a read that fails counts as someone else', async () => {
    let settle: (v: boolean) => void = () => {};
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    const inFlight = new Promise<boolean>((r) => {
      settle = r;
    });
    noteSecondReadTurn('call', 'pipeline', pipeView, true, inFlight);
    const stands = selfFillStands('call', 'gate', gateView, 50);
    settle(true);
    expect(await stands).toBe(false);
    resetSecondReadTurns();
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    noteSecondReadTurn('call', 'pipeline', pipeView, true, Promise.reject(new Error('read')));
    expect(await selfFillStands('call', 'gate', gateView, 50)).toBe(false);
  });

  it('the gate waits for the pipeline to note the turn, bounded', async () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    const late = selfFillStands('call', 'gate', gateView, 200);
    setTimeout(() => noteSecondReadTurn('call', 'pipeline', pipeView, true, yes), 20);
    expect(await late).toBe(false); // the pipeline came, about someone else
    resetSecondReadTurns();
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    const fine = selfFillStands('call', 'gate', gateView, 200);
    setTimeout(() => noteSecondReadTurn('call', 'pipeline', pipeView, true, no), 20);
    expect(await fine).toBe(true);
  });

  it("no pipeline within the bound: the gate's fill is dropped", async () => {
    noteSecondReadTurn('call', 'gate', gateView, true, no);
    const startedAt = Date.now();
    expect(await selfFillStands('call', 'gate', gateView, 40)).toBe(false);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(35);
    // A pipeline note for the burst's first line is not this turn's.
    noteSecondReadTurn('call', 'pipeline', { ...pipeView, latest: 'anyway.' }, true, no);
    expect(await selfFillStands('call', 'gate', gateView, 20)).toBe(false);
  });

  it('no call: never stands', async () => {
    expect(await selfFillStands(undefined, 'pipeline', pipeView, 10)).toBe(false);
  });
});
