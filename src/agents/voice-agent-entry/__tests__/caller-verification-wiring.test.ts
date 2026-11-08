/**
 * voice-agent-entry records who the server verified with callerVerification
 * (verified-caller.ts), which adds the placedCall marker beside verifiedCaller.
 * The entry itself can't be unit-tested, so this pins the one line: if it goes
 * back to setting verifiedCaller alone, a call Ferni placed to the owner's
 * number would again count as the verified owner for ownerMessagePolicy.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const entry = readFileSync(join(__dirname, '../index.ts'), 'utf8');

describe("the call's verification is recorded through callerVerification", () => {
  it('sets verifiedCaller and placedCall together from the parsed call type', () => {
    expect(entry).toMatch(/Object\.assign\(userData, callerVerification\(verified, callType\)\)/);
  });

  it('never sets verifiedCaller on its own', () => {
    expect(entry).not.toMatch(/userData\.verifiedCaller\s*=/);
  });
});
