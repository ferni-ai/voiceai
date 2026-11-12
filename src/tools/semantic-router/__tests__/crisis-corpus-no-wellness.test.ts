/**
 * No crisis line may get a grounding_exercise or wellness_checkin pattern hit (#3733).
 *
 * The wellness tools carry triggers for mild distress ("I'm stressed", "feeling down"), each
 * behind a risk guard. This runs every risk row of the public crisis fixtures through the
 * router's own input normalization (sanitizeInput: NFKC, homoglyphs, invisible characters)
 * and the real matcher, in four forms each: as written, full-width letters, zero-width
 * spaces between characters, and curly apostrophes. A failure names set, row index, form
 * and tool only, never the row's words.
 *
 * A risk row after a mild lead-in line is covered by mild-lead-in-never-lower.test.ts.
 * Rows come from crisis-risk-rows.ts (public fixtures only, no held-out or sealed sets).
 */
import { describe, expect, it } from 'vitest';
import { sanitizeInput } from '../defense/index.js';
import { runCombinedMatching } from '../matcher.js';
import { SemanticToolRegistry } from '../registry.js';
import {
  groundingExerciseTool,
  wellnessCheckinTool,
} from '../tool-definitions/wellness.semantic.js';
import { DEFAULT_ROUTER_CONFIG } from '../types.js';
import { crisisRiskRows } from './crisis-risk-rows.js';

const FORMS: Record<string, (text: string) => string> = {
  asWritten: (t) => t,
  fullWidth: (t) => t.replace(/[A-Za-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
  zeroWidth: (t) => [...t].join('​'),
  curly: (t) => t.replace(/'/g, '’'),
};

describe('crisis corpus gets no wellness pattern hit', () => {
  const registry = new SemanticToolRegistry();
  registry.registerMany([groundingExerciseTool, wellnessCheckinTool]);
  const cfg = { ...DEFAULT_ROUTER_CONFIG, maxMatches: 10 };
  const sets = crisisRiskRows();

  it('loads every set with rows', () => {
    const counts = Object.fromEntries(
      Object.entries(sets).map(([name, rows]) => [name, rows.length])
    );
    for (const [name, count] of Object.entries(counts)) {
      expect(count, name).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(sets))(
    '%s: zero wellness pattern hits in every form',
    (name) => {
      const hits: string[] = [];
      sets[name].forEach((row, index) => {
        for (const [form, transform] of Object.entries(FORMS)) {
          const text = sanitizeInput(transform(row)).sanitized;
          for (const match of runCombinedMatching(text, registry, cfg).matches) {
            if (match.layerScores.pattern > 0)
              hits.push(`${name}#${index}:${form}:${match.toolId}`);
          }
        }
      });
      expect(hits.length, `${hits.length} hits: ${hits.slice(0, 20).join(', ')}`).toBe(0);
    },
    600_000
  );
});
