import { describe, expect, it } from 'vitest';
import { devPanelMayEnable } from '../src/ui/dev-panel-gate';

describe('devPanelMayEnable', () => {
  it('skips the panel for an ordinary production visitor', () => {
    expect(devPanelMayEnable({ DEV: false }, '')).toBe(false);
    expect(devPanelMayEnable({ DEV: false }, '?persona=ferni')).toBe(false);
  });

  it('loads it wherever the panel could turn on', () => {
    expect(devPanelMayEnable({ DEV: true }, '')).toBe(true);
    expect(devPanelMayEnable({ DEV: false, VITE_DEV_PANEL_AUTO: 'true' }, '')).toBe(true);
    expect(devPanelMayEnable({ DEV: false }, '?dev=some-key')).toBe(true);
    expect(devPanelMayEnable({ DEV: false }, '?dev')).toBe(true);
  });
});
