#!/usr/bin/env node
/**
 * Emotional Token Generator
 *
 * Generates apps/web/src/config/emotional-tokens.generated.ts from
 * tokens/color-emotional.json, tokens/typography-emotional.json and the
 * persona colors in tokens/colors.json: mood color adjustments, persona mood
 * palettes, time fading, mood typography, and semantic/holiday palettes.
 *
 * Usage: node design-system/generate-emotional-tokens.js  (part of pnpm tokens:sync)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStamp } from './build/build-stamp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);
const OUTPUT = path.join(ROOT, 'apps/web/src/config/emotional-tokens.generated.ts');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens', f), 'utf-8'));
const colorEmotional = read('color-emotional.json');
const typographyEmotional = read('typography-emotional.json');
const personas = read('colors.json').personas;

/** Drop _-prefixed documentation keys (recursively). */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

const personaMoodBase = clean(colorEmotional.personaMoodBase);
const personaBasePalettes = Object.fromEntries(
  Object.entries(personaMoodBase).map(([id, base]) => {
    if (!personas[id]) throw new Error(`personaMoodBase.${id} has no persona in colors.json`);
    return [id, { primary: personas[id].primary, accent: base.accent, background: base.background }];
  })
);

const exportsList = [
  ['MOOD_COLOR_ADJUSTMENTS', 'Mood color adjustments (color-emotional.json → moodPalettes.states)', clean(colorEmotional.moodPalettes.states)],
  ['PERSONA_MOOD_BASE_PALETTES', 'Persona palettes for mood adjustment (colors.json primary + color-emotional.json → personaMoodBase)', personaBasePalettes],
  ['TIME_FADING', 'Time-fading parameters by period (color-emotional.json → timeFading.periods)', clean(colorEmotional.timeFading.periods)],
  ['MOOD_TYPOGRAPHY_TOKENS', 'Typography per mood (typography-emotional.json → moodTypography)', clean(typographyEmotional.moodTypography)],
  ['SEMANTIC_PALETTES', 'Semantic state palettes (color-emotional.json → semanticPalettes)', clean(colorEmotional.semanticPalettes)],
  ['HOLIDAY_PALETTES', 'Holiday/seasonal palettes (color-emotional.json → holidayPalettes)', clean(colorEmotional.holidayPalettes)],
];

const out = [
  '/**',
  ' * GENERATED FILE - DO NOT EDIT.',
  ' * Source: design-system/tokens/color-emotional.json, typography-emotional.json, colors.json',
  ' * Regenerate: pnpm tokens:sync (design-system/generate-emotional-tokens.js)',
  ` * ${buildStamp()}`,
  ' */',
  '',
];
for (const [name, doc, value] of exportsList) {
  out.push(`/** ${doc} */`);
  out.push(`export const ${name} = ${JSON.stringify(value, null, 2)} as const;`);
  out.push('');
}

fs.writeFileSync(OUTPUT, out.join('\n'));
console.log(`✅ ${path.relative(ROOT, OUTPUT)}`);
