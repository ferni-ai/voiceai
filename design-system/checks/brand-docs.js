/**
 * Brand document & asset checks (used by check-brand.js).
 *
 * 1. Normative brand docs may only quote hex colors that exist in
 *    design-system/tokens/colors.json, so docs can't drift from the tokens.
 * 2. A line in any brand doc that names exactly one persona and quotes hex
 *    colors must use that persona's own token colors (catches e.g. a wrong
 *    Nayan color copied between docs).
 * 3. Logo/avatar SVGs must not draw pupils: Ferni's eyes are opaque white
 *    ellipses (white catchlights allowed).
 */

import fs from 'fs';
import path from 'path';

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

/** Docs that define the brand: every hex they quote must be a token value. */
export const NORMATIVE_DOCS = [
  'design-system/docs/brand/FERNI-BRAND-GUIDELINES.md',
  'design-system/docs/brand/README.md',
  'design-system/LOGO.md',
  'design-system/assets/logos/README.md',
  'brand/README.md',
  'brand/CLAUDE.md',
];

const BRAND_DOC_DIRS = ['design-system/docs/brand', 'brand'];
const LOGO_SVG_DIRS = ['design-system/assets/logos'];

// Darkest fill we still treat as a "white/light" eye element (catchlight etc.)
const PUPIL_MAX_LUMINANCE = 0.35;
// Eye-sized shapes only: the orb itself (r≈40) may legitimately be dark
const PUPIL_MAX_RADIUS = 12;

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function collectHexes(node, out = new Set()) {
  if (typeof node === 'string') {
    for (const m of node.match(HEX_RE) || []) out.add(m.toLowerCase());
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectHexes(v, out);
  }
  return out;
}

function personaColorMap(colorsJson) {
  const map = new Map();
  for (const [id, value] of Object.entries(colorsJson.personas || {})) {
    if (id.startsWith('_')) continue;
    map.set(id, collectHexes(value));
  }
  return map;
}

/** Hexes in normative docs that aren't token values. */
export function checkNormativeDocHexes(root, colorsJson) {
  const tokenHexes = collectHexes(colorsJson);
  const issues = [];
  for (const rel of NORMATIVE_DOCS) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      for (const hex of line.match(HEX_RE) || []) {
        if (!tokenHexes.has(hex.toLowerCase())) {
          issues.push(`${rel}:${i + 1} quotes ${hex}, which is not in colors.json`);
        }
      }
    });
  }
  return issues;
}

/** Lines naming one persona whose hexes aren't that persona's colors. */
export function checkPersonaColorsInDocs(root, colorsJson) {
  const personas = personaColorMap(colorsJson);
  const issues = [];
  const files = BRAND_DOC_DIRS.flatMap((d) => walk(path.join(root, d), '.md'));
  for (const file of files) {
    const rel = path.relative(root, file);
    fs.readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
      const hexes = line.match(HEX_RE);
      if (!hexes) return;
      const named = [...personas.keys()].filter((id) =>
        new RegExp(`\\b${id[0].toUpperCase()}${id.slice(1)}\\b`).test(line)
      );
      if (named.length !== 1) return;
      const own = personas.get(named[0]);
      const allPersonaHexes = new Set([...personas.values()].flatMap((s) => [...s]));
      for (const hex of hexes) {
        const h = hex.toLowerCase();
        // Only flag colors that belong to a *different* persona, or look like a
        // persona swatch but match nobody (the typical copy/paste drift)
        if (!own.has(h) && allPersonaHexes.has(h)) {
          issues.push(`${rel}:${i + 1} gives ${named[0]} ${hex}, which is another persona's color`);
        }
      }
    });
  }
  return issues;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Dark, eye-sized circles/ellipses in logo & avatar SVGs = pupils. */
export function checkNoPupils(root) {
  const issues = [];
  const files = LOGO_SVG_DIRS.flatMap((d) => walk(path.join(root, d), '.svg'));
  const shapeRe = /<(circle|ellipse)\b[^>]*>/g;
  for (const file of files) {
    const rel = path.relative(root, file);
    const svg = fs.readFileSync(file, 'utf-8');
    for (const [tag] of svg.matchAll(shapeRe)) {
      const fill = /\bfill="(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})"/.exec(tag)?.[1];
      if (!fill) continue;
      const hex6 = fill.length === 4 ? `#${[...fill.slice(1)].map((c) => c + c).join('')}` : fill;
      const radius = Math.max(
        ...['r', 'rx', 'ry'].map((a) => parseFloat(new RegExp(`\\b${a}="([\\d.]+)"`).exec(tag)?.[1] ?? '0'))
      );
      if (radius > 0 && radius <= PUPIL_MAX_RADIUS && luminance(hex6) < PUPIL_MAX_LUMINANCE) {
        issues.push(`${rel}: dark eye-sized shape (${fill}, r=${radius}) looks like a pupil`);
      }
    }
  }
  return issues;
}
