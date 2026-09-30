/**
 * Text ink contrast check (used by check-brand.js).
 *
 * Reads the committed native (Swift/Kotlin/Android XML) and promo/website CSS
 * outputs and verifies every text color they emit reaches WCAG AA (4.5:1) on
 * all opaque surfaces of its theme, and every on-fill / on-accent color on its
 * fill (persona on-fill colors: 3:1, see ON_FILL_TARGET). It parses the generated files rather than re-deriving the inks, so it
 * catches a generator that emits the wrong value, not just a bad derivation.
 *
 * Standalone: node design-system/checks/text-ink-contrast.js [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { contrastRatio } from '../utils/text-ink.js';
import { themeTextSurfaces, TEXT_INK_TARGET } from '../utils/theme-inks.js';

export const NATIVE_FILES = {
  swift: 'apps/shared/Sources/FerniShared/Design/FerniTokens.generated.swift',
  kotlin: 'apps/android-native/app/src/main/java/com/ferni/voice/ui/theme/FerniTokens.kt',
  xml: 'apps/android-native/app/src/main/res/values/ferni_tokens.xml',
};

/** Light-theme CSS (zen :root + midnight dark overrides) */
export const PROMO_LIGHT_FILES = [
  'apps/website/ferni-website/css/design-tokens.css',
  'apps/website/ferni-website/src/css/_tokens.css',
  'brand/ferni-design-tokens.css',
];
/** Dark-theme CSS (midnight only) */
export const PROMO_DARK_FILES = [
  'apps/website/developers-portal/src/css/tokens.css',
  'apps/website/design-system-portal/src/css/tokens.css',
];

const SEMANTIC_TEXT = ['success', 'error', 'warning', 'info'];

/**
 * Persona on-fill is white or #2a2420, whichever reads better (the same
 * `--persona-<id>-on` the web ships). Some mid-tone fills (Jack, Maya) can't
 * reach 4.5:1 with either, so on-fill is held to WCAG AA for large text and
 * UI components (3:1): use it for avatar initials and bold labels, not body text.
 */
export const ON_FILL_TARGET = 3;
const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);

/**
 * Collect every text color the generated files emit.
 * Returns [{ file, name, value, kind: 'text'|'on', theme?, fill? }].
 */
export function collectGeneratedTextColors(root, colorsJson) {
  const personaIds = Object.keys(colorsJson.personas).filter((id) => !id.startsWith('_'));
  const primaryOf = (id) => colorsJson.personas[id]?.primary;
  const accentOf = (theme) => colorsJson.themes[theme].accent.primary;
  const found = [];
  const read = (rel) => {
    const full = path.join(root, rel);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };
  const addPersona = (file, name, id, suffix, value) => {
    if (!primaryOf(id)) return;
    if (suffix === 'onfill') found.push({ file, name, value, kind: 'on', fill: primaryOf(id), target: ON_FILL_TARGET });
    else found.push({ file, name, value, kind: 'text', theme: suffix === 'inklight' ? 'zen' : 'midnight' });
  };
  const addTheme = (file, name, theme, key, value) => {
    if (key === 'onAccent') found.push({ file, name, value, kind: 'on', fill: accentOf(theme) });
    else found.push({ file, name, value, kind: 'text', theme });
  };
  const themeTextKeys = ['accentText', 'onAccent', ...SEMANTIC_TEXT.map((s) => `${s}Text`)];

  // Swift: FerniTokens.Persona.<id>{TextOnDark,InkDark,InkLight,OnFill}, FerniTokens.{Zen,Midnight}.<key>
  const swift = read(NATIVE_FILES.swift);
  if (swift) {
    for (const m of swift.matchAll(/static let (\w+?)(TextOnDark|InkDark|InkLight|OnFill): UInt = 0x([0-9a-f]{6})/g)) {
      addPersona(NATIVE_FILES.swift, `${m[1]}${m[2]}`, m[1], m[2] === 'TextOnDark' ? 'inkdark' : m[2].toLowerCase(), `#${m[3]}`);
    }
    for (const theme of ['zen', 'midnight']) {
      const T = theme[0].toUpperCase() + theme.slice(1);
      const body = swift.split(`enum ${T} {`)[1]?.split('}')[0] || '';
      for (const m of body.matchAll(/static let (\w+): UInt = 0x([0-9a-f]{6})/g)) {
        if (themeTextKeys.includes(m[1])) addTheme(NATIVE_FILES.swift, `${T}.${m[1]}`, theme, m[1], `#${m[2]}`);
      }
    }
  }

  // Kotlin: same shape, capitalized names
  const kotlin = read(NATIVE_FILES.kotlin);
  if (kotlin) {
    for (const m of kotlin.matchAll(/val (\w+?)(TextOnDark|InkDark|InkLight|OnFill) = Color\(0xFF([0-9a-f]{6})\)/g)) {
      addPersona(NATIVE_FILES.kotlin, `${m[1]}${m[2]}`, lowerFirst(m[1]), m[2] === 'TextOnDark' ? 'inkdark' : m[2].toLowerCase(), `#${m[3]}`);
    }
    for (const theme of ['zen', 'midnight']) {
      const T = theme[0].toUpperCase() + theme.slice(1);
      const body = kotlin.split(`object ${T} {`)[1]?.split('}')[0] || '';
      for (const m of body.matchAll(/val (\w+) = Color\(0xFF([0-9a-f]{6})\)/g)) {
        const key = lowerFirst(m[1]);
        if (themeTextKeys.includes(key)) addTheme(NATIVE_FILES.kotlin, `${T}.${m[1]}`, theme, key, `#${m[2]}`);
      }
    }
  }

  // Android XML: persona_<id>_{ink_dark,ink_light,on_fill}, <theme>_<snake key>
  const xml = read(NATIVE_FILES.xml);
  if (xml) {
    for (const m of xml.matchAll(/<color name="persona_(\w+?)_(ink_dark|ink_light|on_fill)">#([0-9a-f]{6})</g)) {
      addPersona(NATIVE_FILES.xml, `persona_${m[1]}_${m[2]}`, m[1], m[2].replace('_', ''), `#${m[3]}`);
    }
    for (const m of xml.matchAll(/<color name="(zen|midnight)_(\w+)">#([0-9a-f]{6})</g)) {
      const key = m[2].replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (themeTextKeys.includes(key)) addTheme(NATIVE_FILES.xml, `${m[1]}_${m[2]}`, m[1], key, `#${m[3]}`);
    }
  }

  // Promo CSS: --color-<persona>-text (zen in :root, midnight in dark overrides)
  const shortIds = new Set(personaIds.map((id) => id.split('-')[0]));
  const personaTextVars = (css, theme, file) => {
    for (const m of css.matchAll(/(--color-([a-z]+)-text):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      if (shortIds.has(m[2])) found.push({ file, name: m[1], value: m[3].toLowerCase(), kind: 'text', theme });
    }
  };
  for (const file of PROMO_LIGHT_FILES) {
    const css = read(file);
    if (!css) continue;
    const [light, dark = ''] = css.split('DARK THEME OVERRIDES');
    personaTextVars(light, 'zen', file);
    personaTextVars(dark, 'midnight', `${file} (dark)`);
    // Formerly the hand-picked Ferni textOnDark; a light green meant for dark surfaces
    const successLight = /--color-success-light:\s*(#[0-9a-fA-F]{6})/.exec(light);
    if (successLight) {
      found.push({ file, name: '--color-success-light', value: successLight[1].toLowerCase(), kind: 'text', theme: 'midnight' });
    }
  }
  for (const file of PROMO_DARK_FILES) {
    const css = read(file);
    if (!css) continue;
    personaTextVars(css, 'midnight', file);
    const accentText = /--accent-text:\s*(#[0-9a-fA-F]{6})/.exec(css);
    if (accentText) found.push({ file, name: '--accent-text', value: accentText[1].toLowerCase(), kind: 'text', theme: 'midnight' });
  }
  return found;
}

/** Minimum contrast of one collected color against where it is used. */
export function measure(entry, colorsJson) {
  if (entry.kind === 'on') return contrastRatio(entry.value, entry.fill);
  return Math.min(...themeTextSurfaces(colorsJson.themes[entry.theme]).map((s) => contrastRatio(entry.value, s)));
}

/** Issues (strings) for every emitted text color below WCAG AA, or missing outputs. */
export function checkGeneratedTextInks(root, colorsJson) {
  const issues = [];
  const entries = collectGeneratedTextColors(root, colorsJson);
  const perFile = new Map();
  for (const e of entries) perFile.set(e.file.replace(' (dark)', ''), (perFile.get(e.file.replace(' (dark)', '')) || 0) + 1);
  for (const file of [...Object.values(NATIVE_FILES), ...PROMO_LIGHT_FILES, ...PROMO_DARK_FILES]) {
    if (fs.existsSync(path.join(root, file)) && !perFile.get(file)) {
      issues.push(`${file}: no text inks found (generator output changed shape?)`);
    }
  }
  for (const e of entries) {
    const ratio = measure(e, colorsJson);
    const target = e.target ?? TEXT_INK_TARGET;
    if (ratio < target) {
      const where = e.kind === 'on' ? `on ${e.fill}` : `on ${e.theme} surfaces`;
      issues.push(`${e.file}: ${e.name} ${e.value} is ${ratio.toFixed(2)}:1 ${where} (needs ${target}:1)`);
    }
  }
  return issues;
}

// Standalone run
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const colorsJson = JSON.parse(fs.readFileSync(path.join(root, 'design-system/tokens/colors.json'), 'utf8'));
  if (process.argv.includes('--verbose')) {
    for (const e of collectGeneratedTextColors(root, colorsJson)) {
      const where = e.kind === 'on' ? `on ${e.fill}` : e.theme;
      console.log(`${measure(e, colorsJson).toFixed(2).padStart(6)}  ${e.value}  ${e.name}  [${where}]  ${e.file}`);
    }
  }
  const issues = checkGeneratedTextInks(root, colorsJson);
  issues.forEach((i) => console.log(`❌ ${i}`));
  console.log(issues.length ? `\n${issues.length} text ink(s) below AA` : '✅ All generated native/promo text inks reach WCAG AA (on-fill: 3:1)');
  process.exit(issues.length ? 1 : 0);
}
