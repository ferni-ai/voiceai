import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  citedPrNumbers,
  deployReason,
  diffFlagReason,
  offFlags,
  textFlagReason,
} from '../live-check.js';

const root = path.resolve(__dirname, '../../..');
const off = offFlags(root);
const pr = (title: string, body = '', mergedAt = '2026-10-17T12:00:00Z') => ({
  number: 1,
  title,
  body,
  mergedAt,
});

describe('textFlagReason', () => {
  it('reads the flag manifest', () => {
    expect(off.has('COACH_MEDIA')).toBe(true);
    expect(off.has('MULTI_AGENT_SINGLE_SESSION')).toBe(false);
    // flag-manifest-blocks.ts used to be missed
    expect(off.has('EMOTION_LIFT')).toBe(true);
    expect(off.has('VOCAL_BURSTS')).toBe(true);
  });

  it('reads one-file-per-flag entries and every legacy manifest file', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'live-check-'));
    const config = path.join(tmp, 'src', 'config');
    mkdirSync(path.join(config, 'flags'), { recursive: true });
    const file = (d: string) =>
      `export const X = {\n  default: '${d}',\n  owner: 'voice',\n  kind: 'experiment',\n} as const;\n`;
    writeFileSync(path.join(config, 'flags', 'NEW_OFF.ts'), file('off'));
    writeFileSync(path.join(config, 'flags', 'NEW_SHADOW.ts'), file('shadow'));
    writeFileSync(path.join(config, 'flags', 'NEW_ON.ts'), file('on'));
    writeFileSync(path.join(config, 'flags', 'index.generated.ts'), "  default: 'off'\n");
    writeFileSync(
      path.join(config, 'flag-manifest-later.ts'),
      "  OLD_OFF: { default: 'off', owner: 'voice', kind: 'experiment' },\n" +
        "  OLD_ON: { default: 'on', owner: 'voice', kind: 'kill-switch' },\n"
    );
    expect([...offFlags(tmp)].sort()).toEqual(['NEW_OFF', 'NEW_SHADOW', 'OLD_OFF']);
  });

  it.each([
    ['feat(web): breath captions behind the captions-breath flag', ''],
    ['feat(voice): bursts', 'Off by default. Turn it on with VOCAL_BURSTS=on.'],
    ['feat(web): beats', 'With the flag off, nothing changes.'],
    ['feat(web): conductor core, not wired yet', ''],
    ['feat(web): dev-only overlay gallery', ''],
    ['feat(web): memory view', 'Set VITE_MEMORY_VIEW=true at build time.'],
    ['feat(coach-media): link each pick', 'Only when `COACH_MEDIA` is on.'],
    ['feat(x): y', 'Needs COACH_MEDIA on.'],
  ])('flags %s', (title, body) => {
    expect(textFlagReason(pr(title, body), off)).toBeDefined();
  });

  it.each([
    [
      'feat(handoff): single-session handoffs on by default',
      'MULTI_AGENT_SINGLE_SESSION is now on.',
    ],
    ['fix(website): fix contrast and heading order', 'CI passes.'],
    ['fix(web): candor in copy', 'We use candor and CI here.'],
  ])('keeps %s', (title, body) => {
    expect(textFlagReason(pr(title, body), off)).toBeUndefined();
  });
});

describe('diffFlagReason', () => {
  it('flags an off-by-default manifest entry and a web flag file', () => {
    const entry = "+  NEW_THING: { default: 'off', owner: 'voice', kind: 'experiment' },";
    expect(diffFlagReason([{ filename: 'src/config/flag-manifest.ts', patch: entry }])).toMatch(
      /off-by-default/
    );
    expect(
      diffFlagReason([{ filename: 'apps/web/src/ui/captions/captions-flag.ts', patch: '+x' }])
    ).toMatch(/web flag file/);
  });

  it('flags a new off-by-default flag file and a legacy block entry', () => {
    const file = "+export const NEW_THING = {\n+  default: 'off',\n+  owner: 'voice',";
    expect(diffFlagReason([{ filename: 'src/config/flags/NEW_THING.ts', patch: file }])).toMatch(
      /off-by-default flag to src\/config\/flags\/NEW_THING\.ts/
    );
    const entry = "+  NEW_THING: { default: 'shadow', owner: 'voice', kind: 'experiment' },";
    expect(
      diffFlagReason([{ filename: 'src/config/flag-manifest-blocks.ts', patch: entry }])
    ).toMatch(/off-by-default/);
    expect(
      diffFlagReason([{ filename: 'src/config/flags/index.generated.ts', patch: file }])
    ).toBeUndefined();
  });

  it('keeps an on-by-default entry and ordinary files', () => {
    const entry = "+  NEW_THING: { default: 'on', owner: 'voice', kind: 'kill-switch' },";
    expect(diffFlagReason([{ filename: 'src/config/flag-manifest.ts', patch: entry }])).toBe(
      undefined
    );
    expect(diffFlagReason([{ filename: 'apps/web/src/ui/a.ts', patch: '+x' }])).toBeUndefined();
  });
});

describe('deployReason', () => {
  const web = [{ filename: 'apps/web/src/a.ts' }, { filename: 'apps/website/ferni-website/b.js' }];
  const agent = [{ filename: 'apps/web/src/a.ts' }, { filename: 'src/agents/b.ts' }];

  it('counts a web-only PR as live the day it merges', () => {
    expect(deployReason(pr('x'), web, '2026-10-17')).toBeUndefined();
  });

  it('holds anything else for 7 days', () => {
    expect(deployReason(pr('x', '', '2026-10-11T00:00:01Z'), agent, '2026-10-18')).toMatch(
      /7 days/
    );
    expect(deployReason(pr('x', '', '2026-10-11T00:00:00Z'), agent, '2026-10-18')).toBe(undefined);
  });

  it('counts a developers-portal-only PR as live the day it merges', () => {
    const portal = [{ filename: 'apps/website/developers-portal/src/blog/a.md' }];
    expect(deployReason(pr('x'), portal, '2026-10-17')).toBeUndefined();
  });

  it('does not count another website folder as deployed on merge', () => {
    const other = [{ filename: 'apps/website/marketplace-portal/index.html' }];
    expect(deployReason(pr('x'), other, '2026-10-17')).toMatch(/7 days/);
  });

  it('does not count a PR with no files as web-only', () => {
    expect(deployReason(pr('x'), [], '2026-10-17')).toMatch(/7 days/);
  });
});

describe('citedPrNumbers', () => {
  it('finds linked PRs and PRs in the sources list, once each', () => {
    const md = `---
sources:
  - "PR #1176: fix(website): stop presenting (https://github.com/ferni-ai/voiceai/pull/1176)"
---
See [#1647](https://github.com/ferni-ai/voiceai/pull/1647) and [#1647](https://github.com/ferni-ai/voiceai/pull/1647).`;
    expect(citedPrNumbers(md)).toEqual([1176, 1647]);
  });
});
