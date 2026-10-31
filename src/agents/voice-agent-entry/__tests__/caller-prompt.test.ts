/**
 * The persona prompt is built with this caller's cohort flags, not the last
 * caller's. Cohort flags reach process.env at STEP 4 (identifyUser ->
 * applyCallerFlags); until then the env still holds the previous caller's.
 * buildSessionPersona runs at STEP 2 and used to load the prompt there, so a
 * single-agent session got FERNI_PERSONA_SLIP_GUARD as the previous caller had it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFlags, forgetAgentValues } from '../../../services/platform/cohort-flags.js';
import { loadCallerPrompt } from '../persona-builder.js';

const OWN_LIFE = "You're fifty-seven.";
const here = dirname(fileURLToPath(import.meta.url));
const src = (file: string): string => readFileSync(join(here, '..', file), 'utf8');

describe("the persona prompt and the caller's flags", () => {
  afterEach(() => {
    applyFlags({}); // the agent's own values back
    forgetAgentValues();
    delete process.env['PROMPT_MODE'];
  });

  it("is loaded with this caller's flags, after the last caller's are put back", async () => {
    process.env['PROMPT_MODE'] = 'character';
    applyFlags({ FERNI_PERSONA_SLIP_GUARD: 'on' }); // the cohort's caller
    expect(await loadCallerPrompt({ id: 'ferni' })).toContain(OWN_LIFE);
    applyFlags({}); // the next caller, in no cohort (STEP 4)
    expect(await loadCallerPrompt({ id: 'ferni' })).not.toContain(OWN_LIFE);
  });

  it('is not loaded at STEP 2: buildSessionPersona never loads it', () => {
    const builder = src('persona-builder.ts');
    const build = builder.slice(
      builder.indexOf('export async function buildSessionPersona'),
      builder.indexOf('export async function loadCallerPrompt')
    );
    expect(build).toContain('loadModelBaseInstructions');
    expect(build).not.toContain('loadSystemPrompt');
  });

  it('the single-agent session gets the prompt loaded after identifyUser (STEP 4)', () => {
    const entry = src('index.ts');
    const identified = entry.indexOf('identifyUser({ jobMetadata');
    const loaded = entry.indexOf('systemPrompt: await loadCallerPrompt(sessionPersona)');
    expect(identified).toBeGreaterThan(0);
    expect(loaded).toBeGreaterThan(identified);
    // identifyUser is where the caller's flags are applied.
    expect(src('../voice-agent/user-identification-handler.ts')).toContain(
      'await applyCallerFlags(userId);'
    );
  });
});
