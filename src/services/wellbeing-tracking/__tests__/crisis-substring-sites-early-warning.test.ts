/**
 * EARLY_WARNING_STT_FORMS names the one site it touches. The STT forms
 * themselves are tested in early-warning-stt-forms.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shadow and the flag split', () => {
  it('each flag file names every site it touches', () => {
    const stt = readFileSync('src/config/flags/EARLY_WARNING_STT_FORMS.ts', 'utf8');
    expect(stt).toContain('wellbeing-tracking/early-warning.ts');
  });
});
