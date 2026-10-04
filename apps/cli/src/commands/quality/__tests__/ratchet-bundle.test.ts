/**
 * The bundle ratchet's initialKB: what index.html loads, not what files are named.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { initialFiles, measureBundle } from '../ratchet.js';

// Shaped like apps/web/dist/index.html after a Vite build.
const HTML = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="/design-system/tokens.css" />
  <link rel="icon" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter&display=swap"
    rel="stylesheet"
  />
  <!-- <script src="/commented-out.js"></script> -->
  <script src="/voice-engine.js?v=3"></script>
  <script>window.inline = true;</script>
  <script src="https://sdk.scdn.co/spotify-player.js"></script>
  <script src="//cdn.example.com/lib.js"></script>
  <script type="module" crossorigin src="/assets/index-abc.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/vendor-def.js">
  <link rel="modulepreload" crossorigin href="/assets/admin-ghi.js">
  <link rel="prefetch" href="/assets/later-jkl.js">
  <link rel="stylesheet" crossorigin href="/assets/index-mno.css">
</head></html>`;

describe('initialFiles', () => {
  it('lists the same-origin js/css index.html loads at startup, in order', () => {
    expect(initialFiles(HTML)).toEqual([
      'design-system/tokens.css',
      'voice-engine.js',
      'assets/index-abc.js',
      'assets/vendor-def.js',
      'assets/admin-ghi.js',
      'assets/index-mno.css',
    ]);
  });

  it('counts a preloaded chunk whatever it is named', () => {
    // The pre-#221 blind spot: admin-* was preloaded but not index*/vendor*.
    expect(initialFiles(HTML)).toContain('assets/admin-ghi.js');
  });

  it('skips cross-origin, commented-out, prefetched and non-code links', () => {
    const files = initialFiles(HTML).join(' ');
    for (const skipped of ['spotify', 'cdn.example', 'googleapis', 'commented-out', 'later-jkl', 'favicon', 'manifest']) {
      expect(files).not.toContain(skipped);
    }
  });

  it('accepts relative paths and drops the query string', () => {
    expect(initialFiles('<script src="./assets/a.js?x=1#h"></script><script src="assets/b.mjs"></script>')).toEqual([
      'assets/a.js',
      'assets/b.mjs',
    ]);
  });
});

describe('measureBundle', () => {
  let dist = '';
  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  function build(files: Record<string, number>, html: string): string {
    dist = mkdtempSync(join(tmpdir(), 'ratchet-bundle-'));
    mkdirSync(join(dist, 'assets'));
    for (const [path, kb] of Object.entries(files)) writeFileSync(join(dist, path), 'x'.repeat(kb * 1024));
    writeFileSync(join(dist, 'index.html'), html);
    return dist;
  }

  it('sums initialKB from index.html, totalKB and maxChunkKB from assets', () => {
    const d = build(
      { 'engine.js': 5, 'assets/index-a.js': 10, 'assets/admin-b.js': 20, 'assets/lazy-c.js': 40 },
      '<script src="/engine.js"></script><script type="module" src="/assets/index-a.js"></script>' +
        '<link rel="modulepreload" href="/assets/admin-b.js">'
    );
    // engine.js is outside assets: counted as initial, not in total.
    expect(measureBundle(d)).toEqual({ totalKB: 70, initialKB: 35, maxChunkKB: 40 });
  });

  it('throws when index.html loads a file the build did not emit', () => {
    const d = build({ 'assets/index-a.js': 1 }, '<script src="/assets/gone.js"></script>');
    expect(() => measureBundle(d)).toThrow(/assets\/gone\.js/);
  });
});
