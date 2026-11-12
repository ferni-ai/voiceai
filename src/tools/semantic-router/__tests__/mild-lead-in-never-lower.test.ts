/**
 * A mild lead-in line never costs a crisis line its crisis-tool head (#3733, never-lower).
 *
 * Each risk row of the public crisis fixtures is routed after a mild lead-in ("I'm feeling a
 * bit stressed." + newline + row) through the router's input normalization and the real
 * matcher over every tool. Most rows carry no risk word a list could catch (contextual,
 * joined, elongated forms), so a wellness pattern that matches the lead-in takes the head from
 * crisis_support. The lead-ins avoid "today", which main's info_stock pattern took. Per set, the number of rows a crisis tool heads may not drop below main's.
 * Reports counts only, never a row.
 *
 * MAIN_CRISIS_HEADS was measured on origin/main 5e6427d0f2 with this file's lead-ins; the
 * adversarial set is sampled (every ADVERSARIAL_STEP-th line) to keep the run short.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../defense/index.js';
import { runCombinedMatching } from '../matcher.js';
import { SemanticToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { DEFAULT_ROUTER_CONFIG } from '../types.js';
import { crisisRiskRows } from './crisis-risk-rows.js';

const LEAD_INS = ["I'm feeling a bit stressed.", "I've been anxious all day.", 'Rough day.'];
const ADVERSARIAL_STEP = 20;

/** Rows a crisis tool heads after each lead-in, summed over the lead-ins, on origin/main. */
const MAIN_CRISIS_HEADS: Record<string, number> = {
  relay: 116,
  contextual: 10,
  'redteam-2026-10-05': 12,
  'gloomy-ferni-2026-10-11': 90,
  'crisis-adjudicator-2026-10-17': 59,
  'crisis-everyday-call-2026-10-17': 19,
  riskForms: 117,
  joined: 656,
  phrases: 224,
  adversarial: 2626,
  es: 17,
};

describe('mild lead-in keeps the crisis head', () => {
  const registry = new SemanticToolRegistry();
  registry.registerMany(allToolDefinitions);
  const cfg = { ...DEFAULT_ROUTER_CONFIG, maxMatches: 5 };
  const sets = crisisRiskRows(ADVERSARIAL_STEP);
  const isCrisisTool = (toolId: string | undefined): boolean =>
    toolId !== undefined && registry.get(toolId)?.category === 'crisis';

  it('has a main baseline for every set', () => {
    expect(Object.keys(MAIN_CRISIS_HEADS).sort()).toEqual(Object.keys(sets).sort());
  });

  it.each(Object.keys(sets))(
    '%s: crisis heads after a mild lead-in are at least main',
    (name) => {
      let crisisHeads = 0;
      for (const row of sets[name]) {
        for (const leadIn of LEAD_INS) {
          const text = sanitizeInput(`${leadIn}\n${row}`).sanitized;
          if (isCrisisTool(runCombinedMatching(text, registry, cfg).matches[0]?.toolId))
            crisisHeads++;
        }
      }
      expect(
        crisisHeads,
        `${name}: ${crisisHeads} vs main ${MAIN_CRISIS_HEADS[name]}`
      ).toBeGreaterThanOrEqual(MAIN_CRISIS_HEADS[name]);
    },
    600_000
  );
});
