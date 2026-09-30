/**
 * Text ink: a brand color made readable as text on a theme's surfaces.
 *
 * Persona and accent colors are tuned as fills. Used as text they often fail
 * WCAG contrast (Ferni's #4a6741 is ~1:1 on the Midnight surfaces). An ink
 * keeps the color's hue and moves only its OKLCH lightness, reducing chroma
 * when needed to stay in sRGB gamut, until it reaches the target contrast on
 * every given surface. The result is deterministic, so the build can derive
 * inks instead of relying on hand-picked "text" variants.
 */

// ---------------------------------------------------------------------------
// sRGB <-> OKLab <-> OKLCH
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

function rgbToHex(rgb) {
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH -> linear sRGB (may fall outside [0, 1]). */
function oklchToLinear([L, C, H]) {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin) => lin.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** OKLCH -> sRGB hex, lowering chroma until the color fits the gamut. */
function oklchToHex([L, C, H]) {
  let lo = 0;
  let hi = C;
  if (!inGamut(oklchToLinear([L, C, H]))) {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear([L, mid, H]))) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  return rgbToHex(oklchToLinear([L, C, H]).map(fromLinear));
}

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const minContrast = (hex, surfaces) => Math.min(...surfaces.map((s) => contrastRatio(hex, s)));

// ---------------------------------------------------------------------------
// Ink
// ---------------------------------------------------------------------------

/**
 * The closest color to `base` (same hue) that reaches `target` contrast on all
 * `surfaces`. Returns `base` unchanged when it already does.
 *
 * @param {string} base - brand color (#rrggbb)
 * @param {string[]} surfaces - opaque surface colors the text sits on
 * @param {{ target?: number }} [options] - contrast target (default 4.5, WCAG AA)
 */
export function textInk(base, surfaces, { target = 4.5 } = {}) {
  if (minContrast(base, surfaces) >= target) return base.toLowerCase();

  const [L, C, H] = rgbToOklch(hexToRgb(base));
  const surfaceLum = Math.max(...surfaces.map(relativeLuminance));
  // Dark surfaces need lighter text, light surfaces darker text.
  const goLighter = surfaceLum < 0.18;

  // Bisect lightness between the base and the extreme in that direction.
  let near = L;
  let far = goLighter ? 1 : 0;
  if (minContrast(oklchToHex([far, C, H]), surfaces) < target) {
    // Even pure white/black of this hue can't reach the target; use the extreme.
    return oklchToHex([far, C, H]);
  }
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (minContrast(oklchToHex([mid, C, H]), surfaces) >= target) far = mid;
    else near = mid;
  }
  return oklchToHex([far, C, H]);
}

export { minContrast };
