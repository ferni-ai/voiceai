/**
 * The twin panel only offers "Yes, remember what matters" when auto-capture can
 * actually remember (VITE_JOURNAL_CAPTURE, off by default). Captured moments have
 * no sender yet, so with the flag off the promise would be false.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
vi.mock('../../src/services/custom-agent.service.js', () => ({
  listCustomAgents: vi.fn().mockResolvedValue([
    { id: 'twin-1', type: 'twin', name: 'Sam', displayName: 'Sam', memories: {} },
  ]),
}));

const { openDigitalTwinUI, closeDigitalTwinUI } = await import('../../src/ui/digital-twin.ui.js');

// The modal is a module singleton and setup.ts empties the body before each
// test, so keep the element from the first open and query inside it.
let panel: Element | null = null;

async function openPanel(): Promise<Element> {
  await openDigitalTwinUI();
  panel ??= document.querySelector('.digital-twin-modal');
  if (!panel) throw new Error('twin panel did not open');
  return panel;
}

const captureOffer = (root: Element): Element | null =>
  root.querySelector('[data-action="enable-capture"], [data-action="toggle-capture"]');

afterEach(() => {
  closeDigitalTwinUI();
  vi.unstubAllEnvs();
});

describe('twin panel capture offer', () => {
  it('is hidden while VITE_JOURNAL_CAPTURE is off', async () => {
    const root = await openPanel();
    expect(root.querySelector('.digital-twin-list')).not.toBeNull();
    expect(captureOffer(root)).toBeNull();
    expect(root.textContent).not.toMatch(/adding them to your journal|remember what matters|meaningful moments/i);
  });

  it('is shown when VITE_JOURNAL_CAPTURE=true', async () => {
    vi.stubEnv('VITE_JOURNAL_CAPTURE', 'true');
    const root = await openPanel();
    expect(root.querySelector('.digital-twin-list')).not.toBeNull();
    expect(captureOffer(root)).not.toBeNull();
  });
});
