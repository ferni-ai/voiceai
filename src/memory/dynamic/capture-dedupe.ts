/**
 * Per-turn idempotency for memory capture.
 *
 * Several paths can capture the same user utterance: the transcript handler
 * always does, and the turn handler does too when TURN_INTELLIGENCE=on. Their
 * turn numbers do not agree (the transcript handler passes 0), so the key is
 * the session plus the normalised utterance, within a short window; fastCapture
 * treats two captures as one turn unless both carry different positive turn
 * numbers. The first capture wins; later ones get its result back and queue
 * nothing, and recordTurn() is skipped for them.
 *
 * Saying the exact same sentence again after the window counts as a new turn.
 *
 * @module memory/dynamic/capture-dedupe
 */

import { createHash } from 'node:crypto';

/** Two captures of one utterance land well within this (they race the same event). */
export const CAPTURE_DEDUPE_WINDOW_MS = 30_000;
const MAX_ENTRIES = 5_000;

interface Entry<T> {
  at: number;
  value: T;
}

export function captureKey(scopeId: string, transcript: string): string {
  const normalized = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return `${scopeId}:${createHash('sha1').update(normalized).digest('hex').slice(0, 20)}`;
}

/** A small TTL map: first writer wins within the window. */
export class CaptureDedupe<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly windowMs = CAPTURE_DEDUPE_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {}

  /** The value recorded for `key` within the window, if any. */
  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > this.windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  /**
   * Record `value` for `key` unless one is already recorded in the window.
   * Returns true when this call recorded it (i.e. it is the first).
   */
  claim(key: string, value: T): boolean {
    if (this.get(key) !== undefined) return false;
    if (this.entries.size >= MAX_ENTRIES) this.prune();
    this.entries.set(key, { at: this.now(), value });
    return true;
  }

  private prune(): void {
    const t = this.now();
    for (const [k, e] of this.entries) {
      if (t - e.at > this.windowMs) this.entries.delete(k);
    }
    // Still full: drop the oldest half (Map iterates in insertion order).
    if (this.entries.size >= MAX_ENTRIES) {
      let drop = Math.floor(this.entries.size / 2);
      for (const k of this.entries.keys()) {
        if (drop-- <= 0) break;
        this.entries.delete(k);
      }
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
