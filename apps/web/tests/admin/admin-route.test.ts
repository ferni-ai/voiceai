/**
 * /admin opens the unified Admin Portal whatever the query string says. The old
 * `/admin?legacy` dashboard, with its hand-drawn "Avatar Soul Lab" preview, was
 * removed (#4069): an old bookmark must land on the real portal, and nothing in
 * the web app may load the legacy module again.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openAdminPortal = vi.fn(async () => {});
vi.mock('../../src/admin/index.js', () => ({ openAdminPortal }));

const { openAdminRoute } = await import('../../src/app/admin-route.js');

const SRC = join(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|js)$/.test(name) ? [path] : [];
  });
}

describe('the /admin route', () => {
  beforeEach(() => {
    openAdminPortal.mockClear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it.each(['/admin?legacy', '/admin?legacy=1', '/admin'])(
    '%s opens the unified Admin Portal',
    async (url) => {
      window.history.replaceState(null, '', url);

      await openAdminRoute();

      expect(openAdminPortal).toHaveBeenCalledTimes(1);
      expect(document.getElementById('adminDashboard')).toBeNull();
    }
  );

  it('has no legacy dashboard module left to import', () => {
    expect(existsSync(join(SRC, 'ui/admin.ui.ts'))).toBe(false);
    const importers = sourceFiles(SRC)
      .filter((file) => /['"][./]*(?:ui\/)?admin\.ui(?:\.js)?['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(importers).toEqual([]);
  });
});
