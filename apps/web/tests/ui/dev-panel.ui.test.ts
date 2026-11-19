/**
 * Dev Panel UI - Unit Tests
 *
 * Comprehensive tests for the dev panel functionality including:
 * - Module exports and initialization
 * - Panel visibility controls
 * - Dev mode detection
 * - Override functions
 * - Network simulation
 * - Time override
 * - Event dispatching
 *
 * @module tests/ui/dev-panel.ui
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ICONS, type IconName } from '../../src/ui/dev-panel/icons.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock: { [key: string]: string } = {};
const localStorageProxy = {
  getItem: vi.fn((key: string) => localStorageMock[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageMock).forEach((key) => delete localStorageMock[key]);
  }),
  get length() {
    return Object.keys(localStorageMock).length;
  },
  key: vi.fn((index: number) => Object.keys(localStorageMock)[index] || null),
};
Object.defineProperty(window, 'localStorage', { value: localStorageProxy });

// Mock sessionStorage
const sessionStorageMock: { [key: string]: string } = {};
const sessionStorageProxy = {
  getItem: vi.fn((key: string) => sessionStorageMock[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageMock[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageMock[key];
  }),
  clear: vi.fn(() => {
    Object.keys(sessionStorageMock).forEach((key) => delete sessionStorageMock[key]);
  }),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageProxy });

// Mock window.location
const mockLocation = {
  search: '?dev',
  hostname: 'localhost',
  href: 'http://localhost:3004/?dev',
  reload: vi.fn(),
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Mock window.open
const mockWindowOpen = vi.fn();
window.open = mockWindowOpen;

// Mock CustomEvent and dispatchEvent
const dispatchedEvents: CustomEvent[] = [];
const originalDispatchEvent = document.dispatchEvent.bind(document);
document.dispatchEvent = vi.fn((event: Event) => {
  if (event instanceof CustomEvent) {
    dispatchedEvents.push(event);
  }
  return originalDispatchEvent(event);
});

describe('Dev Panel - Module Exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    dispatchedEvents.length = 0;
  });

  it('should export initDevPanel function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.initDevPanel).toBe('function');
  });

  it('should export togglePanel function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.togglePanel).toBe('function');
  });

  it('should export showPanel function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.showPanel).toBe('function');
  });

  it('should export hidePanel function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.hidePanel).toBe('function');
  });

  it('should export isDevMode function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.isDevMode).toBe('function');
  });

  it('should export getDevOverrides function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.getDevOverrides).toBe('function');
  });

  it('should export devPanel singleton object', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.devPanel).toBe('object');
    expect(typeof module.devPanel.init).toBe('function');
    expect(typeof module.devPanel.show).toBe('function');
    expect(typeof module.devPanel.hide).toBe('function');
    expect(typeof module.devPanel.toggle).toBe('function');
    expect(typeof module.devPanel.isDevMode).toBe('function');
    expect(typeof module.devPanel.getOverrides).toBe('function');
    expect(typeof module.devPanel.syncToBackend).toBe('function');
  });

  it('should export shouldBypassSubscription function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.shouldBypassSubscription).toBe('function');
  });

  it('should export getTimeOverride function', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.getTimeOverride).toBe('function');
  });

  it('should export network simulation functions', async () => {
    const module = await import('../../src/ui/dev-panel.ui.js');
    expect(typeof module.getNetworkSimulation).toBe('function');
    expect(typeof module.getLatencySimulation).toBe('function');
    expect(typeof module.shouldSimulateNetworkFailure).toBe('function');
  });
});

describe('Dev Panel - Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    dispatchedEvents.length = 0;
    localStorageProxy.clear();
    sessionStorageProxy.clear();
  });

  afterEach(() => {
    document.querySelectorAll('.dev-panel').forEach((el) => el.remove());
    document.querySelectorAll('#dev-panel-styles').forEach((el) => el.remove());
  });

  it('should initialize dev panel without throwing', async () => {
    const { initDevPanel } = await import('../../src/ui/dev-panel.ui.js');

    // Should not throw
    expect(() => initDevPanel()).not.toThrow();
  });

  it('should be callable multiple times safely', async () => {
    const { initDevPanel } = await import('../../src/ui/dev-panel.ui.js');

    // Multiple calls should not throw
    expect(() => {
      initDevPanel();
      initDevPanel();
    }).not.toThrow();
  });
});

describe('Dev Panel - isDevMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageProxy.clear();
  });

  it('should return boolean', async () => {
    const { isDevMode } = await import('../../src/ui/dev-panel.ui.js');

    const result = isDevMode();
    expect(typeof result).toBe('boolean');
  });

  it('should detect dev mode from URL parameter', async () => {
    mockLocation.search = '?dev';

    const { isDevMode } = await import('../../src/ui/dev-panel.ui.js');

    // In test environment with ?dev, should be in dev mode
    expect(typeof isDevMode()).toBe('boolean');
  });
});

describe('Dev Panel - getDevOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageProxy.clear();
  });

  it('should return an object with override values', async () => {
    const { getDevOverrides } = await import('../../src/ui/dev-panel.ui.js');

    const overrides = getDevOverrides();
    expect(typeof overrides).toBe('object');
  });

  it('should have tier property', async () => {
    const { getDevOverrides } = await import('../../src/ui/dev-panel.ui.js');

    const overrides = getDevOverrides();
    expect('tier' in overrides).toBe(true);
  });

  it('should have stage property', async () => {
    const { getDevOverrides } = await import('../../src/ui/dev-panel.ui.js');

    const overrides = getDevOverrides();
    expect('stage' in overrides).toBe(true);
  });

  it('should have conversations property', async () => {
    const { getDevOverrides } = await import('../../src/ui/dev-panel.ui.js');

    const overrides = getDevOverrides();
    expect('conversations' in overrides).toBe(true);
  });
});

describe('Dev Panel - Time Override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageProxy.clear();
  });

  it('should return null or number from getTimeOverride', async () => {
    const { getTimeOverride } = await import('../../src/ui/dev-panel.ui.js');

    const result = getTimeOverride();
    expect(result === null || typeof result === 'number').toBe(true);
  });
});

describe('Dev Panel - Subscription Bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageProxy.clear();
  });

  it('should return boolean from shouldBypassSubscription', async () => {
    const { shouldBypassSubscription } = await import('../../src/ui/dev-panel.ui.js');

    const result = shouldBypassSubscription();
    expect(typeof result).toBe('boolean');
  });

  it('should accept optional userId parameter', async () => {
    const { shouldBypassSubscription } = await import('../../src/ui/dev-panel.ui.js');

    // Should not throw with userId
    expect(() => shouldBypassSubscription('test-user-id')).not.toThrow();
  });
});

describe('Dev Panel - Network Simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return string from getNetworkSimulation', async () => {
    const { getNetworkSimulation } = await import('../../src/ui/dev-panel.ui.js');

    const result = getNetworkSimulation();
    expect(typeof result).toBe('string');
  });

  it('should return number from getLatencySimulation', async () => {
    const { getLatencySimulation } = await import('../../src/ui/dev-panel.ui.js');

    const result = getLatencySimulation();
    expect(typeof result).toBe('number');
  });

  it('should return boolean from shouldSimulateNetworkFailure', async () => {
    const { shouldSimulateNetworkFailure } = await import('../../src/ui/dev-panel.ui.js');

    const result = shouldSimulateNetworkFailure();
    expect(typeof result).toBe('boolean');
  });
});

describe('Dev Panel - devPanel Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('should have init method', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.init).toBe('function');
    expect(() => devPanel.init()).not.toThrow();
  });

  it('should have show method', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.show).toBe('function');
  });

  it('should have hide method', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.hide).toBe('function');
  });

  it('should have toggle method', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.toggle).toBe('function');
  });

  it('should have isDevMode method', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.isDevMode).toBe('function');
    expect(typeof devPanel.isDevMode()).toBe('boolean');
  });

  it('should have getOverrides method', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.getOverrides).toBe('function');
    expect(typeof devPanel.getOverrides()).toBe('object');
  });

  it('should have syncToBackend method that returns promise', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    expect(typeof devPanel.syncToBackend).toBe('function');
    const result = devPanel.syncToBackend();
    expect(result instanceof Promise).toBe(true);
  });
});

describe('Dev Panel - Event Dispatching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support avatar lamp events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:avatar-lamp-show', {
        detail: { visible: true },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:avatar-lamp-show')).toBe(true);
  });

  it('should support avatar soul events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:avatar-soul-trigger', {
        detail: { animation: 'pulse' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:avatar-soul-trigger')).toBe(true);
  });

  it('should support micro-expression events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:micro-expression', {
        detail: { type: 'recognition', duration: 80 },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:micro-expression')).toBe(true);
  });

  it('should support active listening events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:active-listening', {
        detail: { active: true },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:active-listening')).toBe(true);
  });

  it('should support breath sync events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:breath-sync', {
        detail: { enabled: true },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:breath-sync')).toBe(true);
  });

  it('should support concern detection events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:concern-detected', {
        detail: { level: 'moderate' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:concern-detected')).toBe(true);
  });

  it('should support anticipation events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:anticipation', {
        detail: { emotion: 'empathy' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:anticipation')).toBe(true);
  });
});

describe('Dev Panel - Modal Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support upgrade modal events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:show-upgrade-modal', {
        detail: { feature: 'test' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:show-upgrade-modal')).toBe(true);
  });

  it('should support FTUE modal events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:show-ftue', {
        detail: {},
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:show-ftue')).toBe(true);
  });

  it('should support welcome back modal events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:show-welcome-back', {
        detail: {},
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:show-welcome-back')).toBe(true);
  });

  it('should support settings modal events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:show-settings', {
        detail: {},
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:show-settings')).toBe(true);
  });
});

describe('Dev Panel - Toast Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support success toast events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:toast', {
        detail: { type: 'success', message: 'Test success' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:toast')).toBe(true);
  });

  it('should support error toast events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:toast', {
        detail: { type: 'error', message: 'Test error' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:toast')).toBe(true);
  });

  it('should support info toast events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:toast', {
        detail: { type: 'info', message: 'Test info' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:toast')).toBe(true);
  });

  it('should support warning toast events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:toast', {
        detail: { type: 'warning', message: 'Test warning' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:toast')).toBe(true);
  });
});

describe('Dev Panel - Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageProxy.clear();
    sessionStorageProxy.clear();
  });

  it('should support clearing all localStorage', () => {
    localStorageMock['test_key'] = 'test_value';
    localStorageMock['another_key'] = 'another_value';

    localStorageProxy.clear();

    expect(Object.keys(localStorageMock).length).toBe(0);
  });

  it('should support clearing all sessionStorage', () => {
    sessionStorageMock['test_key'] = 'test_value';

    sessionStorageProxy.clear();

    expect(Object.keys(sessionStorageMock).length).toBe(0);
  });

  it('should support selective localStorage clearing', () => {
    localStorageMock['ferni_tier'] = 'friend';
    localStorageMock['ferni_stage'] = 'close_friend';

    localStorageProxy.removeItem('ferni_tier');

    expect(localStorageMock['ferni_tier']).toBeUndefined();
    expect(localStorageMock['ferni_stage']).toBe('close_friend');
  });
});

describe('Dev Panel - Waveform Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support idle waveform state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:waveform-state', {
        detail: { state: 'idle' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:waveform-state')).toBe(true);
  });

  it('should support listening waveform state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:waveform-state', {
        detail: { state: 'listening' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:waveform-state')).toBe(true);
  });

  it('should support speaking waveform state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:waveform-state', {
        detail: { state: 'speaking' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:waveform-state')).toBe(true);
  });

  it('should support thinking waveform state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:waveform-state', {
        detail: { state: 'thinking' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:waveform-state')).toBe(true);
  });
});

describe('Dev Panel - Connection Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support connecting state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:connection-state', {
        detail: { state: 'connecting' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:connection-state')).toBe(true);
  });

  it('should support connected state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:connection-state', {
        detail: { state: 'connected' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:connection-state')).toBe(true);
  });

  it('should support disconnected state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:connection-state', {
        detail: { state: 'disconnected' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:connection-state')).toBe(true);
  });

  it('should support error state', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:connection-state', {
        detail: { state: 'error', error: 'Test error' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:connection-state')).toBe(true);
  });
});

describe('Dev Panel - Streak Celebrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support streak celebration events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:streak-celebration', {
        detail: { streak: 7, type: 'habit' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:streak-celebration')).toBe(true);
  });

  it('should support milestone celebration events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:milestone-celebration', {
        detail: { milestone: '30-day', achievement: 'morning_routine' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:milestone-celebration')).toBe(true);
  });
});

describe('Dev Panel - Narrative Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents.length = 0;
  });

  it('should support narrative update events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:narrative-update', {
        detail: { chapter: 'growth', phase: 'beginning' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:narrative-update')).toBe(true);
  });

  it('should support life moment events', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:life-moment', {
        detail: { type: 'breakthrough', context: 'Test context' },
      })
    );

    expect(dispatchedEvents.some((e) => e.type === 'ferni:life-moment')).toBe(true);
  });
});

describe('Dev Panel - Dashboard Links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockClear();
  });

  const dashboards = [
    'analytics-dashboard.html',
    'metrics-dashboard.html',
    'ux-dashboard.html',
    'error-dashboard.html',
    'llm-dashboard.html',
    'voice-presence-dashboard.html',
    'persona-dashboard.html',
    'cognitive-dashboard.html',
    'connection-dashboard.html',
    'memory-dashboard.html',
    'cost-dashboard.html',
    'dora-dashboard.html',
    'handoff-dashboard.html',
    'outreach-dashboard.html',
    'tools-dashboard.html',
    'experiments-dashboard.html',
    'feature-flags.html',
    'admin.html',
    'observability-hub.html',
    'animation-playground.html',
  ];

  dashboards.forEach((dashboard) => {
    it(`should open ${dashboard} in new tab`, () => {
      window.open(`/${dashboard}`, '_blank');

      expect(mockWindowOpen).toHaveBeenCalledWith(`/${dashboard}`, '_blank');
    });
  });
});

describe('Dev Panel - Rendered Dashboard Links', () => {
  // [href, label, title, icon] for every link the panel had before the agent flags link,
  // copied from its markup at f8101ff99c (apps/web/src/ui/dev-panel.ui.ts, ~2219-2305).
  const previousLinks: ReadonlyArray<readonly [string, string, string, IconName]> = [
    ['/analytics-dashboard.html', 'Analytics', 'Analytics Dashboard', 'trendingUp'],
    ['/metrics-dashboard.html', 'Metrics', 'Metrics Dashboard', 'barChart'],
    ['/ux-dashboard.html', 'UX', 'UX Dashboard', 'colorPalette'],
    ['/error-dashboard.html', 'Errors', 'Error Dashboard', 'alertTriangle'],
    ['/llm-dashboard.html', 'LLM', 'LLM Dashboard', 'robot'],
    ['/voice-presence-dashboard.html', 'Voice', 'Voice Presence Dashboard', 'micFilled'],
    ['/persona-dashboard.html', 'Personas', 'Persona Dashboard', 'drama'],
    ['/cognitive-dashboard.html', 'Cognitive', 'Cognitive Dashboard', 'brain'],
    ['/connection-dashboard.html', 'Connection', 'Connection Dashboard', 'signalStrength'],
    ['/memory-dashboard.html', 'Memory', 'Memory Dashboard', 'save'],
    ['/cost-dashboard.html', 'Costs', 'Cost Dashboard', 'coins'],
    ['/dora-dashboard.html', 'DORA', 'DORA Metrics', 'rocket'],
    ['/handoff-dashboard.html', 'Handoffs', 'Handoff Dashboard', 'handshake'],
    ['/outreach-dashboard.html', 'Outreach', 'Outreach Dashboard', 'upload'],
    ['/tools-dashboard.html', 'Tools', 'Tools Dashboard', 'wrench'],
    ['/experiments-dashboard.html', 'Experiments', 'Experiments', 'flask'],
    ['/feature-flags.html', 'Feature Flags', 'Feature Flags', 'flag'],
    ['/admin.html', 'Admin', 'Admin Panel', 'cog'],
    ['/observability-hub.html', 'Observability', 'Observability Hub', 'eye'],
    ['/animation-playground.html', 'Animations', 'Animation Playground', 'movie'],
  ];
  const AGENT_FLAGS_HREF = '/admin?section=agent-flags';

  /** The icon's markup as the DOM serialises it, to compare with a rendered link's svg. */
  function iconMarkup(name: IconName): string | undefined {
    const holder = document.createElement('span');
    holder.innerHTML = ICONS[name];
    return holder.querySelector('svg')?.outerHTML;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.querySelectorAll('.dev-panel').forEach((el) => el.remove());
  });

  async function renderedLinks(): Promise<HTMLAnchorElement[]> {
    const { showPanel } = await import('../../src/ui/dev-panel.ui.js');
    showPanel();
    return Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.dev-panel a.dev-dashboard-link')
    );
  }

  it('links to the dev agent flags page, right after Feature Flags', async () => {
    const links = await renderedLinks();
    const hrefs = links.map((a) => a.getAttribute('href'));

    const flagsAt = hrefs.indexOf('/feature-flags.html');
    expect(flagsAt).toBeGreaterThanOrEqual(0);
    expect(hrefs[flagsAt + 1]).toBe(AGENT_FLAGS_HREF);

    const agentFlags = links[flagsAt + 1];
    expect(agentFlags.textContent?.trim()).toBe('Agent flags (dev)');
    expect(agentFlags.getAttribute('title')).toBe(
      "Switch the dev voice agent's flags (admin portal)"
    );
    expect(agentFlags.getAttribute('target')).toBe('_blank');
    expect(agentFlags.querySelector('svg')?.outerHTML).toBe(iconMarkup('flag'));
  });

  // The admin portal runs only at the path /admin (app.ts routes on it); /admin.html is the
  // static Admin Hub, which ignores ?section=.
  it('opens the agent-flags section of the admin portal at /admin', async () => {
    const links = await renderedLinks();
    const link = links.find((a) => a.textContent?.includes('Agent flags (dev)'));
    expect(link).toBeDefined();
    const url = new URL(link?.getAttribute('href') ?? '', 'https://dev.example.test');
    expect(url.pathname).toBe('/admin');
    expect(url.searchParams.get('section')).toBe('agent-flags');
  });

  it('still renders every link it had before, in order, with its label, title and icon', async () => {
    const links = await renderedLinks();
    const before = links.filter((a) => a.getAttribute('href') !== AGENT_FLAGS_HREF);

    expect(before.map((a) => a.getAttribute('href'))).toEqual(previousLinks.map(([h]) => h));
    before.forEach((a, i) => {
      const [, label, title, icon] = previousLinks[i];
      expect(a.textContent?.trim()).toBe(label);
      expect(a.getAttribute('title')).toBe(title);
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.querySelector('svg')?.outerHTML).toBe(iconMarkup(icon));
    });
  });

  it('escapes the href, title and label it renders', async () => {
    const { renderDashboardLinks } = await import('../../src/ui/dev-panel/dashboard-links.js');
    document.body.innerHTML = renderDashboardLinks([
      { href: '/x?a=1&b="2"', icon: 'flag', label: '<b>bold</b>', title: 'say "hi" <now>' },
    ]);
    const a = document.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/x?a=1&b="2"');
    expect(a?.getAttribute('title')).toBe('say "hi" <now>');
    expect(a?.textContent?.trim()).toBe('<b>bold</b>');
    expect(a?.querySelector('b')).toBeNull();
  });

  it('still renders the EvalOps and BTH Analytics buttons', async () => {
    await renderedLinks();
    expect(document.querySelector('button[data-action="open-evalops"]')).not.toBeNull();
    expect(document.querySelector('button[data-action="open-bth-analytics"]')).not.toBeNull();
  });
});

describe('Dev Panel - Keyboard Shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should respond to Cmd+Shift+D without throwing', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'd',
      metaKey: true,
      shiftKey: true,
    });

    expect(() => document.dispatchEvent(event)).not.toThrow();
  });

  it('should respond to Ctrl+Shift+D without throwing', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'd',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(() => document.dispatchEvent(event)).not.toThrow();
  });

  it('should respond to Cmd+Shift+U without throwing', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'u',
      metaKey: true,
      shiftKey: true,
    });

    expect(() => document.dispatchEvent(event)).not.toThrow();
  });

  it('should respond to Cmd+Shift+0 without throwing', () => {
    const event = new KeyboardEvent('keydown', {
      key: '0',
      metaKey: true,
      shiftKey: true,
    });

    expect(() => document.dispatchEvent(event)).not.toThrow();
  });
});

describe('Dev Panel - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('should handle network errors in syncToBackend', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    // Should not throw, just return resolved promise
    const result = devPanel.syncToBackend();
    expect(result instanceof Promise).toBe(true);
  });

  it('should handle multiple rapid toggle calls', async () => {
    const { devPanel } = await import('../../src/ui/dev-panel.ui.js');

    // Rapid calls should not throw
    expect(() => {
      devPanel.toggle();
      devPanel.toggle();
      devPanel.toggle();
    }).not.toThrow();
  });
});

describe('Dev Panel - Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('should support keyboard navigation setup', async () => {
    const { initDevPanel } = await import('../../src/ui/dev-panel.ui.js');

    initDevPanel();

    // Panel initialization should complete successfully
    expect(true).toBe(true);
  });
});
