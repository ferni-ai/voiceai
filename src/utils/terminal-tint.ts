/**
 * Terminal text colouring on Node's built-in `util.styleText`.
 *
 * A dependency-free stand-in for the few chalk styles our terminal reports
 * use. `styleText` drops the escape codes when the output stream is not a
 * colour-capable TTY (and honours NO_COLOR / FORCE_COLOR), as chalk did.
 *
 * @module utils/terminal-tint
 */

import { styleText } from 'node:util';

type TintColor = 'gray' | 'green' | 'red' | 'white' | 'yellow' | 'cyan' | 'magenta' | 'blue';

/** Colours a string; `.bold` applies the same colour in bold. */
export type Tint = ((text: string) => string) & { bold: (text: string) => string };

function makeTint(color: TintColor): Tint {
  const colour = (text: string): string => styleText(color, text);
  return Object.assign(colour, {
    bold: (text: string): string => styleText([color, 'bold'], text),
  });
}

export const tint = {
  bold: (text: string): string => styleText('bold', text),
  gray: makeTint('gray'),
  green: makeTint('green'),
  red: makeTint('red'),
  white: makeTint('white'),
  yellow: makeTint('yellow'),
  cyan: makeTint('cyan'),
  magenta: makeTint('magenta'),
  blue: makeTint('blue'),
};
