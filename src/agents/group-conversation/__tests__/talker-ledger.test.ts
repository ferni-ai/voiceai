import { describe, expect, it } from 'vitest';
import { TalkerLedger } from '../talker-ledger.js';

/** The ledger's voiced level, frame length and retention, from the plan. */
const VOICED_RMS = 500;
const FRAME_MS = 10;
const LEDGER_RETENTION_MS = 60_000;

const OWNER = 'owner_web';
const GUEST = 'guest_call1';

/** Notes `frames` consecutive 10 ms frames for `identity`, starting at `fromMs`. */
function speak(
  ledger: TalkerLedger,
  identity: string,
  fromMs: number,
  frames: number,
  rms = 2000
): void {
  for (let i = 0; i < frames; i++) ledger.note(identity, fromMs + i * FRAME_MS, rms);
}

describe('TalkerLedger.dominant', () => {
  it('gives the person voiced longest in the window', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, OWNER, 1000, 3); // 30 ms
    speak(ledger, GUEST, 1000, 12); // 120 ms
    expect(ledger.dominant(1000, 2000)).toBe(GUEST);
  });

  it('gives null when nobody was voiced', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, OWNER, 1000, 10, 0);
    expect(ledger.dominant(1000, 2000)).toBeNull();
  });

  it('gives the owner on a tie', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, GUEST, 1000, 5);
    speak(ledger, OWNER, 1000, 5);
    expect(ledger.dominant(1000, 2000)).toBe(OWNER);
  });

  it('counts only frames inside [from, to)', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, GUEST, 500, 20); // 500..690, before the window
    speak(ledger, GUEST, 2000, 20); // 2000..2190, at and after `to`
    speak(ledger, OWNER, 1000, 2); // 1000, 1010
    expect(ledger.dominant(1000, 2000)).toBe(OWNER);
  });

  it('includes a frame at `from` and excludes one at `to`', () => {
    const ledger = new TalkerLedger(OWNER);
    ledger.note(GUEST, 1000, 2000);
    expect(ledger.dominant(1000, 1001)).toBe(GUEST);
    expect(ledger.dominant(990, 1000)).toBeNull();
  });

  it('does not count frames below VOICED_RMS', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, GUEST, 1000, 20, VOICED_RMS - 1);
    speak(ledger, OWNER, 1000, 1, VOICED_RMS);
    expect(ledger.dominant(1000, 2000)).toBe(OWNER);
  });

  it('forgets frames older than its retention, so a long call stays small', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, GUEST, 0, 5);
    expect(ledger.dominant(0, 100)).toBe(GUEST);
    ledger.note(OWNER, LEDGER_RETENTION_MS + 100, 2000);
    expect(ledger.dominant(0, 100)).toBeNull();
  });
});

describe('TalkerLedger.attribute', () => {
  it('is confident when one person has at least twice everyone else', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, OWNER, 1000, 30); // 300 ms
    speak(ledger, GUEST, 1000, 10); // 100 ms
    expect(ledger.attribute(1000, 2000)).toEqual({ identity: OWNER, confident: true });
    expect(ledger.attribute(1000, 2000).identity).toBe(ledger.dominant(1000, 2000));
  });

  it('is not confident when the two are close', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, OWNER, 1000, 15); // 150 ms
    speak(ledger, GUEST, 1000, 10); // 100 ms
    expect(ledger.attribute(1000, 2000)).toEqual({ identity: OWNER, confident: false });
  });

  it('is not confident on a tie, and exactly twice is enough', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, OWNER, 1000, 10);
    speak(ledger, GUEST, 1000, 10);
    expect(ledger.attribute(1000, 2000)).toEqual({ identity: OWNER, confident: false });
    speak(ledger, GUEST, 1100, 10);
    expect(ledger.attribute(1000, 2000)).toEqual({ identity: GUEST, confident: true });
  });

  it('gives nobody, not confident, when nobody was voiced', () => {
    const ledger = new TalkerLedger(OWNER);
    speak(ledger, OWNER, 1000, 10, 0);
    expect(ledger.attribute(1000, 2000)).toEqual({ identity: null, confident: false });
  });
});
