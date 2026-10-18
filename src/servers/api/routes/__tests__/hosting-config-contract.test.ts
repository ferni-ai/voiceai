/**
 * Firebase Hosting config contract.
 *
 * - The landing config deploys to ferni-landing only. It used to carry a
 *   second entry targeting ferni-prod, so `firebase deploy --only hosting`
 *   from the landing directory replaced the app at ferni-prod.web.app with
 *   the landing page.
 * - /share/** links (https://ferni.ai/share/<id>, and the app domains) reach
 *   the UI server, which serves the share pages; otherwise the catch-all
 *   rewrite answers them with the SPA shell or the landing 404 page.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

interface Rewrite {
  source: string;
  destination?: string;
  run?: { serviceId: string; region: string };
}

interface HostingEntry {
  site?: string;
  target?: string;
  rewrites?: Rewrite[];
}

function hosting(path: string): HostingEntry[] {
  const config = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as {
    hosting: HostingEntry | HostingEntry[];
  };
  return Array.isArray(config.hosting) ? config.hosting : [config.hosting];
}

/** The /share/** rewrite goes to the UI server and comes before any catch-all. */
function expectShareRoutedToBackend(entry: HostingEntry): void {
  const rewrites = entry.rewrites ?? [];
  const share = rewrites.findIndex((r) => r.source === '/share/**');
  expect(share).not.toBe(-1);
  expect(rewrites[share].run?.serviceId).toBe('john-bogle-ui');
  const catchAll = rewrites.findIndex((r) => r.source === '**' || r.source.startsWith('!'));
  if (catchAll >= 0) expect(share).toBeLessThan(catchAll);
}

describe('landing hosting config', () => {
  const entries = hosting('apps/website/ferni-website/firebase.json');

  it('deploys only to the ferni-landing site', () => {
    expect(entries.map((e) => e.site ?? e.target)).toEqual(['ferni-landing']);
    const firebaserc = readFileSync(resolve(ROOT, 'apps/website/ferni-website/.firebaserc'), 'utf8');
    expect(firebaserc).not.toContain('ferni-prod');
  });

  it('routes /share/** to the UI server', () => {
    expectShareRoutedToBackend(entries[0]);
  });

  // The ferni CLI's landing deploy was removed 2026-10-17: the workflow is the only path.
  it('is deployed by the Firebase workflow to the ferni-landing target only', () => {
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/deploy-firebase.yml'), 'utf8');
    const start = workflow.indexOf('- name: Deploy landing to Firebase');
    expect(start).toBeGreaterThan(-1);
    const step = workflow.slice(start, workflow.indexOf('\n      - name: ', start + 1));
    expect(step).toContain('target: ferni-landing');
    expect(step).toContain('entryPoint: ./apps/website/ferni-website');
    expect(step).not.toContain('ferni-prod');
  });
});

describe('app hosting config', () => {
  it.each(['ferni-prod', 'johnb-app'])('%s routes /share/** to the UI server', (target) => {
    const entry = hosting('apps/web/firebase.json').find((e) => e.target === target);
    expect(entry).toBeDefined();
    expectShareRoutedToBackend(entry!);
  });
});
