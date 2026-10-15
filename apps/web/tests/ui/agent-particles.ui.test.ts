/**
 * Agent particles on tsParticles 4.
 *
 * tsParticles 4 reads particle colour from `particles.paint` and draws the glow
 * through the shadow effect plugin. The old v3 keys (`particles.color`,
 * `particles.shadow`) still typecheck but are ignored at runtime, which renders
 * every particle white with no glow. These tests load the real options into a
 * real tsParticles container and fail if either regresses.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tsParticles } from '@tsparticles/engine';
import { start, stop } from '../../src/ui/agent-particles.ui.js';

/** jsdom has no canvas; tsParticles 4 needs an OffscreenCanvas to get through setup. */
function stubOffscreenCanvas(): void {
  const noop: unknown = new Proxy(function noopFn() {}, {
    get: (_target, prop) => {
      if (prop === 'canvas') return { width: 300, height: 200 };
      if (prop === 'measureText') return () => ({ width: 1 });
      return noop;
    },
    apply: () => noop,
    set: () => true,
  });
  class FakeOffscreenCanvas {
    width = 300;
    height = 200;
    getContext(): unknown {
      return noop;
    }
  }
  const canvasProto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
  canvasProto.transferControlToOffscreen = () => new FakeOffscreenCanvas();
  canvasProto.getContext = () => noop;
}

describe('agent particles (tsParticles 4)', () => {
  beforeAll(() => {
    stubOffscreenCanvas();
  });

  afterEach(() => {
    stop();
  });

  it('paints particles with the persona colours, not the default white', async () => {
    document.body.innerHTML = '<div class="main"><div id="waveformContainer"></div></div>';
    document.body.style.setProperty('--persona-primary', '#123456');
    document.body.style.setProperty('--persona-secondary', '#654321');

    await start('ferni');

    const container = tsParticles.items[0];
    expect(container).toBeDefined();
    const paint = container!.actualOptions.particles.paint;
    const firstPaint = Array.isArray(paint) ? paint[0] : paint;
    expect(firstPaint?.color?.value).toEqual(['#123456', '#654321']);
  });

  it('draws the persona glow through the shadow effect', async () => {
    document.body.innerHTML = '<div class="main"><div id="waveformContainer"></div></div>';
    document.body.style.setProperty('--persona-primary', '#123456');

    await start('ferni');

    const particles = tsParticles.items[0]!.actualOptions.particles;
    expect(particles.effect.type).toBe('shadow');
    expect(particles.effect.options.shadow).toMatchObject({ blur: 8, color: { value: '#123456' } });
  });
});
