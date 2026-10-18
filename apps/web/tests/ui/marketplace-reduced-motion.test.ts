/**
 * Every marketplace avatar loop (breathe / ring-pulse, base and hover) must be
 * paused under prefers-reduced-motion. The hover loops only started running
 * once --ease-spring-gentle got defined (motion-token-truth), so this pins them.
 */
import { describe, expect, it } from 'vitest';
import { getMarketplaceStyles } from '../../src/ui/marketplace/styles/index.js';

function loopingElements(css: string): Set<string> {
  const found = new Set<string>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/animation:\s*(avatar-breathe|ring-pulse)/.test(body)) continue;
    for (const part of selector.split(',')) {
      const classes = part.trim().match(/\.[\w-]+/g);
      if (classes) found.add(classes[classes.length - 1]);
    }
  }
  return found;
}

/** The reduced-motion @media block that pauses loops (from its @media to its closing brace). */
function reducedMotionBlock(css: string): string {
  const paused = css.indexOf('animation-play-state: paused');
  expect(paused).toBeGreaterThan(-1);
  const start = css.lastIndexOf('@media (prefers-reduced-motion: reduce)', paused);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', paused) + 1);
}

describe('marketplace avatar loops under reduced motion', () => {
  it('every looping avatar is paused', () => {
    const css = getMarketplaceStyles();
    const loops = loopingElements(css);
    expect(loops.size).toBeGreaterThan(3);
    const block = reducedMotionBlock(css);
    expect(block).toContain('animation-play-state: paused !important');
    for (const cls of loops) expect(block, `${cls} keeps looping`).toContain(cls);
  });
});
