/**
 * Reads computed CSS colours as sRGB bytes in the page, whatever format the
 * browser serialises them in. Chromium returns rgb()/rgba() for legacy
 * colours but color(srgb ...), oklch(), lab() and friends for modern ones
 * (color-mix() computes to one of those), so a regex over rgb() misreads
 * color(srgb 1 1 1) as black and skips the rest. Drawing the colour as a
 * 1px canvas fill and reading the pixel back converts any format the
 * browser understands. A value it can't read throws, so a spec fails
 * rather than skipping the element.
 */

import type { Page } from '@playwright/test';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 to 1 */
  a: number;
}

export interface ColourReader {
  /** One colour value, as sRGB bytes and alpha. Throws when unreadable. */
  read(value: string): Rgba;
  /** Every colour in a value such as a computed background-image. */
  stops(value: string): Rgba[];
}

declare global {
  interface Window {
    ferniColour?: ColourReader;
  }
}

/** Runs in the page; it can't close over anything outside itself. */
function install(): void {
  let ctx: CanvasRenderingContext2D | null = null;
  const context = (): CanvasRenderingContext2D => {
    if (ctx) return ctx;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!ctx) throw new Error('computed-colour: no 2d canvas context');
    return ctx;
  };

  const read = (value: string): Rgba => {
    const c = context();
    // The canvas ignores a colour it can't parse and keeps the old fill, so
    // a value is unreadable only if it changes neither starting fill.
    let accepted = false;
    for (const start of ['#000000', '#ffffff']) {
      c.fillStyle = start;
      c.fillStyle = value;
      if (c.fillStyle !== start) accepted = true;
    }
    if (!accepted) throw new Error(`computed-colour: unreadable colour "${value}"`);
    c.clearRect(0, 0, 1, 1);
    c.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };

  // Colour functions can nest (color-mix), so take each one whole by
  // matching its parentheses, then skip past it.
  const start = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi;
  const stops = (value: string): Rgba[] => {
    const found: Rgba[] = [];
    start.lastIndex = 0;
    for (let m = start.exec(value); m; m = start.exec(value)) {
      let end = m.index + m[0].length;
      if (m[0].endsWith('(')) {
        let depth = 1;
        while (end < value.length && depth > 0) {
          if (value[end] === '(') depth++;
          else if (value[end] === ')') depth--;
          end++;
        }
        if (depth > 0) throw new Error(`computed-colour: unbalanced "${value}"`);
      }
      found.push(read(value.slice(m.index, end)));
      start.lastIndex = end;
    }
    return found;
  };

  window.ferniColour = { read, stops };
}

/** Defines window.ferniColour in the current document. Call after each navigation. */
export async function installColourReader(page: Page): Promise<void> {
  await page.evaluate(install);
}
