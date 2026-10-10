import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ferni's persona taught a "Classic ___" frame ("Classic coach move", "Classic
 * you", "classic Maya") in nine files, and the model generalised it to people
 * and pets the caller had only just mentioned: "Classic Biscuit" for a dog
 * heard seconds before, which reads as faked familiarity (6 of 45 dev and
 * prod calls, 2026-10-10, still present after #553 fixed the director's
 * notes). The jokes stay; the frame goes.
 */
const BUNDLE = join(__dirname, '../../../personas/bundles/ferni');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(md|json)$/.test(name) ? [p] : [];
  });
}

describe("Ferni's persona has no 'Classic ___' frame", () => {
  it('no persona file says "classic" followed by a person, a pet or a habit', () => {
    const hits = files(BUNDLE).flatMap((f) =>
      (readFileSync(f, 'utf8').match(/\b[Cc]lassic (you|me|him|her|them|coach|[A-Z][a-z]+)\b/g) ?? []).map(
        (m) => `${f.replace(BUNDLE, '')}: ${m}`
      )
    );
    expect(hits).toEqual([]);
  });
});
