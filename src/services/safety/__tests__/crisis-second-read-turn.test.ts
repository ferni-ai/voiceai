/**
 * #2587's redesign: the gate decides once per turn whether prompt v3 may fill it; the pipeline
 * reads that decision, and a fill about the caller never stands over a read about someone else.
 * A turn is the call's turn count, never the caller's words (#2666 round 1).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  gateDecidedFill,
  noteSecondReadTurn,
  resetSecondReadTurns,
  secondReadOf,
  selfFillStands,
  turnOf,
} from '../crisis-second-read-turn.js';

const no = Promise.resolve(false);
const yes = Promise.resolve(true);

beforeEach(() => resetSecondReadTurns());

describe('gateDecidedFill: the pipeline reads the gate decision for its own turn', () => {
  it('no gate decision yet: no fill', () => {
    expect(gateDecidedFill('call', 4)).toBe(false);
    noteSecondReadTurn('call', 4, 'pipeline', true, no);
    expect(gateDecidedFill('call', 4)).toBe(false);
  });

  it("follows the gate's decision for the same turn, and any gate read that said no wins", () => {
    noteSecondReadTurn('call', 4, 'gate', true, no);
    expect(gateDecidedFill('call', 4)).toBe(true);
    noteSecondReadTurn('call', 4, 'gate', false, no);
    expect(gateDecidedFill('call', 4)).toBe(false);
  });

  it("never an earlier turn's decision, whatever its words (#2666 round 1)", () => {
    noteSecondReadTurn('call', 2, 'gate', true, no); // "yeah ok"
    expect(gateDecidedFill('call', 4)).toBe(false); // "...end his life." "ok"
    expect(gateDecidedFill('call', 3)).toBe(false);
  });

  it("a turn's notes expire when the call's next turn is noted, and a late note is dropped", () => {
    noteSecondReadTurn('call', 4, 'gate', true, no);
    noteSecondReadTurn('call', 5, 'pipeline', false, no);
    expect(gateDecidedFill('call', 4)).toBe(false);
    noteSecondReadTurn('call', 4, 'gate', true, no); // turn 4 is over
    expect(gateDecidedFill('call', 4)).toBe(false);
  });

  it("another call's decision never applies", () => {
    noteSecondReadTurn('call-a', 4, 'gate', true, no);
    expect(gateDecidedFill('call-b', 4)).toBe(false);
    expect(gateDecidedFill('call-a', 4)).toBe(true);
  });

  it('no call or no turn count: nothing noted, no fill', () => {
    noteSecondReadTurn(undefined, 4, 'gate', true, no);
    noteSecondReadTurn('call', undefined, 'gate', true, no);
    expect(gateDecidedFill(undefined, 4)).toBe(false);
    expect(gateDecidedFill('call', undefined)).toBe(false);
    for (const count of [undefined, 0, -1, 1.5, '4', Number.NaN]) {
      expect(turnOf(count), String(count)).toBeUndefined();
    }
    expect(turnOf(4)).toBe(4);
    expect(secondReadOf('gate', { turnCount: 4 }, 'third_party')).toEqual({
      path: 'gate',
      count: 4,
      thirdParty: true,
    });
    expect(secondReadOf('pipeline', undefined).count).toBeUndefined();
  });
});

describe('selfFillStands: never over a read about someone else', () => {
  it('stands once both paths noted the turn and neither read someone else', async () => {
    noteSecondReadTurn('call', 4, 'gate', true, no);
    noteSecondReadTurn('call', 4, 'pipeline', true, no);
    expect(await selfFillStands('call', 4, 'gate', 50)).toBe(true);
    expect(await selfFillStands('call', 4, 'pipeline', 50)).toBe(true);
  });

  for (const who of ['gate', 'pipeline'] as const) {
    it(`drops the fill on both paths when the ${who}'s read is about someone else`, async () => {
      noteSecondReadTurn('call', 4, 'gate', true, who === 'gate' ? yes : no);
      noteSecondReadTurn('call', 4, 'pipeline', true, who === 'pipeline' ? yes : no);
      expect(await selfFillStands('call', 4, 'gate', 50)).toBe(false);
      expect(await selfFillStands('call', 4, 'pipeline', 50)).toBe(false);
    });
  }

  it("never counts another call's or another turn's notes", async () => {
    noteSecondReadTurn('call-a', 4, 'gate', true, no);
    noteSecondReadTurn('call-b', 4, 'pipeline', true, no);
    expect(await selfFillStands('call-a', 4, 'gate', 20)).toBe(false);
    noteSecondReadTurn('call-a', 3, 'pipeline', true, no); // turn 3 is over
    expect(await selfFillStands('call-a', 4, 'gate', 20)).toBe(false);
  });

  it('waits for a read in flight; a read that rejects counts as someone else', async () => {
    let settle: (v: boolean) => void = () => {};
    const inFlight = new Promise<boolean>((r) => {
      settle = r;
    });
    noteSecondReadTurn('call', 4, 'gate', true, no);
    noteSecondReadTurn('call', 4, 'pipeline', true, inFlight);
    const stands = selfFillStands('call', 4, 'gate', 50);
    settle(true);
    expect(await stands).toBe(false);
    resetSecondReadTurns();
    noteSecondReadTurn('call', 4, 'gate', true, no);
    noteSecondReadTurn('call', 4, 'pipeline', true, Promise.reject(new Error('read')));
    expect(await selfFillStands('call', 4, 'gate', 50)).toBe(false);
  });

  it('counts a note that arrives while the turn’s reads settle', async () => {
    let settle: (v: boolean) => void = () => {};
    noteSecondReadTurn('call', 4, 'gate', true, no);
    noteSecondReadTurn(
      'call',
      4,
      'pipeline',
      true,
      new Promise<boolean>((r) => {
        settle = r;
      })
    );
    const stands = selfFillStands('call', 4, 'gate', 50);
    noteSecondReadTurn('call', 4, 'pipeline', true, yes); // the pipeline read the turn again
    settle(false);
    expect(await stands).toBe(false);
  });

  it('the gate waits for the pipeline to note the turn, up to waitMs', async () => {
    noteSecondReadTurn('call', 4, 'gate', true, no);
    const late = selfFillStands('call', 4, 'gate', 200);
    setTimeout(() => noteSecondReadTurn('call', 4, 'pipeline', true, no), 60);
    expect(await late).toBe(true);
    resetSecondReadTurns();
    noteSecondReadTurn('call', 4, 'gate', true, no);
    const startedAt = Date.now();
    expect(await selfFillStands('call', 4, 'gate', 40)).toBe(false);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(35);
  });

  it("the call's next turn ends the wait at once", async () => {
    noteSecondReadTurn('call', 4, 'gate', true, no);
    const startedAt = Date.now();
    const waiting = selfFillStands('call', 4, 'gate', 5_000);
    setTimeout(() => noteSecondReadTurn('call', 5, 'pipeline', true, no), 10);
    expect(await waiting).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('no call or no turn count: never stands', async () => {
    expect(await selfFillStands(undefined, 4, 'pipeline', 10)).toBe(false);
    expect(await selfFillStands('call', undefined, 'pipeline', 10)).toBe(false);
  });
});
