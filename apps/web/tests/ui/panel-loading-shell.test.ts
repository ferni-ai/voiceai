/**
 * Panels that fetch before they draw answer the tap at once.
 *
 * 2026-10-18 UI audit: The Sanctuary, Everything Connected, Your Contribution,
 * Bring a Friend and This Year Together looked dead for 3 to 8 seconds after the
 * tap, then opened. Each now opens through openWithLoadingShell: a named, busy
 * dialog shows immediately and leaves the moment the real panel is on the page.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const enUS = JSON.parse(
  readFileSync(resolve(__dirname, '../../src/i18n/locales/en-US.json'), 'utf8')
) as Record<string, unknown>;
const lookup = (key: string): string | undefined => {
  const value = key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, enUS);
  return typeof value === 'string' ? value : undefined;
};

vi.mock('../../src/i18n/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/i18n/index.js')>()),
  t: (key: string) => lookup(key) ?? key,
}));

/** A promise the test resolves by hand, standing in for a slow fetch */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolveFn!: () => void;
  let rejectFn!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const shell = () => document.querySelector<HTMLElement>('.panel-loading-shell');

// The slow panels, stubbed: each open() waits on a fetch the test controls,
// then mounts the panel's real root class, as the real module does.
const slow = vi.hoisted(() => ({
  gates: new Map<string, { resolve: () => void }>(),
}));
function slowOpen(key: string, rootClass: string): () => Promise<void> {
  return () =>
    new Promise<void>((res) => {
      slow.gates.set(key, {
        resolve: () => {
          const root = document.createElement('div');
          root.className = rootClass;
          document.body.appendChild(root);
          res();
        },
      });
    });
}
const closes = vi.hoisted(() => ({ sanctuary: vi.fn(), yourYear: vi.fn(), referral: vi.fn(), sub: vi.fn() }));

vi.mock('../../src/ui/sanctuary.ui.js', () => ({
  getSanctuaryUI: () => ({ open: slowOpen('sanctuary', 'sanctuary-overlay'), close: closes.sanctuary }),
}));
vi.mock('../../src/ui/your-year-with-ferni.ui.js', () => ({
  openYourYearWithFerni: slowOpen('your-year', 'your-year-overlay'),
  closeYourYearWithFerni: closes.yourYear,
}));
vi.mock('../../src/ui/referral.ui.js', () => ({
  referralUI: { open: slowOpen('referral', 'referral-modal'), close: closes.referral },
}));
vi.mock('../../src/ui/manage-subscription.ui.js', () => ({
  manageSubscriptionUI: { open: slowOpen('sub', 'manage-sub'), close: closes.sub },
}));
vi.mock('../../src/ui/connected-life.ui.js', () => ({
  showConnectedLife: slowOpen('connected', 'connected-life-overlay'),
}));

const { openWithLoadingShell } = await import('../../src/ui/components/panel-loading-shell.js');
const screens = await import('../../src/ui/lazy-screens.js');
const { openEverythingConnected } = await import('../../src/ui/everything-connected.js');

afterEach(() => {
  document.body.innerHTML = '';
  slow.gates.clear();
  vi.clearAllMocks();
});

describe('openWithLoadingShell', () => {
  it('shows a named, busy modal dialog before the data arrives', async () => {
    const fetch = deferred();
    const done = openWithLoadingShell({ label: 'The Sanctuary', readySelector: '.real', open: () => fetch.promise });
    const el = shell();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('dialog');
    expect(el?.getAttribute('aria-modal')).toBe('true');
    expect(el?.getAttribute('aria-label')).toBe('The Sanctuary');
    expect(el?.getAttribute('aria-busy')).toBe('true');
    expect(el?.textContent).toContain('The Sanctuary');
    expect(el?.textContent).toContain(lookup('panelShell.gettingReady'));
    fetch.resolve();
    await done;
    expect(shell()).toBeNull();
  });

  it('leaves the moment the real panel mounts, before open() settles', async () => {
    const fetch = deferred();
    const done = openWithLoadingShell({ label: 'X', readySelector: '.real', open: () => fetch.promise });
    expect(shell()).not.toBeNull();
    const real = document.createElement('div');
    real.className = 'real';
    document.body.appendChild(real);
    await flush(); // MutationObserver callbacks run as a microtask
    expect(shell()).toBeNull();
    fetch.resolve();
    await done;
  });

  it('goes away when opening fails, so the tap never strands them on a spinner', async () => {
    const fetch = deferred();
    const done = openWithLoadingShell({ label: 'X', readySelector: '.real', open: () => fetch.promise });
    fetch.reject(new Error('offline'));
    await expect(done).rejects.toThrow('offline');
    expect(shell()).toBeNull();
  });

  it('closes the panel again if they dismissed the shell while it loaded', async () => {
    const close = vi.fn();
    let mount!: () => void;
    const done = openWithLoadingShell({
      label: 'X',
      readySelector: '.real',
      open: () =>
        new Promise<void>((res) => {
          mount = () => {
            const real = document.createElement('div');
            real.className = 'real';
            document.body.appendChild(real);
            res();
          };
        }),
      close,
    });
    shell()?.querySelector<HTMLButtonElement>('.panel-loading-shell__close')?.click();
    expect(shell()).toBeNull();
    mount();
    await done;
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not close a panel they are still waiting for', async () => {
    const close = vi.fn();
    const fetch = deferred();
    const done = openWithLoadingShell({ label: 'X', readySelector: '.real', open: () => fetch.promise, close });
    fetch.resolve();
    await done;
    expect(close).not.toHaveBeenCalled();
  });

  it('skips the shell when the panel is already open', async () => {
    document.body.innerHTML = '<div class="real"></div>';
    const open = vi.fn();
    await openWithLoadingShell({ label: 'X', readySelector: '.real', open });
    expect(open).toHaveBeenCalledOnce();
    expect(shell()).toBeNull();
  });
});

describe('the five slow menu panels open behind the shell', () => {
  const cases: Array<[string, string, string, () => Promise<void>]> = [
    ['The Sanctuary', 'menu.items.guidedPractices', 'sanctuary', () => screens.openSanctuary()],
    ['This Year Together', 'menu.items.yourYear', 'your-year', () => screens.openYourYear()],
    ['Bring a Friend', 'menu.items.shareFerni', 'referral', () => screens.openReferral()],
    ['Your Contribution', 'menu.items.accountBilling', 'sub', () => screens.openManageSubscription('device-1', {})],
    ['Everything Connected', 'menu.items.allConnections', 'connected', () => openEverythingConnected()],
  ];

  it.each(cases)('%s: shell named for the menu row, then the panel', async (_name, key, gate, open) => {
    const done = open();
    expect(shell()?.getAttribute('aria-label')).toBe(lookup(key));
    // the module import resolves on a later tick; then the fetch is pending
    await vi.waitFor(() => expect(slow.gates.has(gate)).toBe(true));
    expect(shell()).not.toBeNull();
    slow.gates.get(gate)!.resolve();
    await done;
    expect(shell()).toBeNull();
  });
});
