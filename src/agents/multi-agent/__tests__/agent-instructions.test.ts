/**
 * The cascade's text LLM has no model-level instructions field, so honesty
 * rules, speech patterns, date/time and user awareness must ride in the agent
 * prompt. Realtime providers keep receiving them at the model level.
 */
import { describe, expect, it } from 'vitest';
import { CartesiaCascadeProvider } from '../../model-provider/cartesia-cascade.js';
import { composeAgentInstructions } from '../agent-instructions.js';

const BASE = '## Honesty Rules\nNever invent memories.\n\n## Current Date & Time\nToday is Sunday.';
const PERSONA = '# Ferni\nYou are Ferni.';

describe('composeAgentInstructions', () => {
  it('carries the model-level block in the agent prompt for the cascade', () => {
    const modules = new CartesiaCascadeProvider().getPromptModules();
    const out = composeAgentInstructions(PERSONA, BASE, modules);
    expect(out).toContain('Never invent memories.');
    expect(out).toContain('Today is Sunday.');
    expect(out.indexOf('Honesty Rules')).toBeLessThan(out.indexOf('You are Ferni.'));
  });

  it('leaves the persona prompt alone when the model takes its own instructions', () => {
    expect(composeAgentInstructions(PERSONA, BASE, {})).toBe(PERSONA);
  });

  it('does not duplicate the prompt when loading fell back to one text for both levels', () => {
    expect(
      composeAgentInstructions(PERSONA, PERSONA, { modelInstructionsInAgentPrompt: true })
    ).toBe(PERSONA);
  });

  describe('PROMPT_STABLE_PREFIX', () => {
    const STABLE = '## Honesty Rules\nNever invent memories.\n';
    const modules = { modelInstructionsInAgentPrompt: true };
    const on = { stableBase: STABLE, env: { PROMPT_STABLE_PREFIX: 'on' } };

    it('puts the call-specific date and caller after the persona prompt', () => {
      const out = composeAgentInstructions(PERSONA, BASE, modules, on);
      expect(out.startsWith(`${STABLE.trim()}\n\n---\n\n${PERSONA}`)).toBe(true);
      expect(out.endsWith('## Current Date & Time\nToday is Sunday.')).toBe(true);
    });

    it('keeps the old order when off, or when the base does not start with the stable text', () => {
      const old = composeAgentInstructions(PERSONA, BASE, modules);
      expect(
        composeAgentInstructions(PERSONA, BASE, modules, { stableBase: STABLE, env: {} })
      ).toBe(old);
      expect(
        composeAgentInstructions(PERSONA, BASE, modules, { ...on, stableBase: 'Other text' })
      ).toBe(old);
    });
  });
});
