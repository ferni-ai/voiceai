/**
 * Site health: the freshness rules and the one-issue-per-kind decision. Pure functions
 * only; nothing touches the network. Dates are fixed strings, so the cases never age.
 */
import { describe, expect, it } from 'vitest';
import { issueAction } from '../site-health-issue.js';
import {
  MAX_LAG_DAYS,
  RUNS_CHECKED,
  SITES,
  report,
  scheduleFinding,
  siteFinding,
  type Run,
} from '../site-freshness.js';

const design = SITES.find((s) => s.name === 'design.ferni.ai')!;
const ok = (lastModified: string | null) => ({ status: 200, lastModified });
const run = (conclusion: string, createdAt: string, status = 'completed'): Run => ({
  status,
  conclusion,
  createdAt,
  url: `https://example.test/runs/${createdAt}`,
});

describe('siteFinding', () => {
  it('flags the real 2026-11-16 case: design.ferni.ai built in January, source changed in November', () => {
    const f = siteFinding(design, ok('Tue, 06 Jan 2026 00:50:12 GMT'), '2026-11-11T09:08:32Z');
    expect(f?.kind).toBe('stale-site');
    expect(f?.subject).toBe('design.ferni.ai');
    expect(f?.detail).toContain('309 days');
  });

  it('passes a site deployed after its newest source commit', () => {
    expect(
      siteFinding(design, ok('Wed, 11 Nov 2026 09:27:27 GMT'), '2026-11-11T09:08:32Z')
    ).toBeNull();
  });

  it('allows exactly MAX_LAG_DAYS of lag and flags anything past it', () => {
    const live = 'Mon, 02 Nov 2026 00:00:00 GMT';
    const atLimit = new Date(Date.parse(live) + MAX_LAG_DAYS * 86_400_000).toISOString();
    const pastLimit = new Date(Date.parse(atLimit) + 60_000).toISOString();
    expect(siteFinding(design, ok(live), atLimit)).toBeNull();
    expect(siteFinding(design, ok(live), pastLimit)?.kind).toBe('stale-site');
  });

  it('fails when the live page gives no evidence of when it was built', () => {
    expect(siteFinding(design, ok(null), '2026-11-11T09:08:32Z')?.detail).toContain(
      'last-modified'
    );
    expect(siteFinding(design, ok('not a date'), '2026-11-11T09:08:32Z')?.detail).toContain(
      'last-modified'
    );
  });

  it('fails when the site answers with an error, whatever its headers say', () => {
    const f = siteFinding(
      design,
      { status: 503, lastModified: 'Wed, 11 Nov 2026 09:27:27 GMT' },
      '2026-11-11T09:08:32Z'
    );
    expect(f?.detail).toContain('HTTP 503');
  });

  it('fails when no commit on main touches the source folder (a wrong site map)', () => {
    expect(siteFinding(design, ok('Wed, 11 Nov 2026 09:27:27 GMT'), null)?.detail).toContain(
      'fix SITES'
    );
  });
});

describe('scheduleFinding', () => {
  it('flags the real blog-drafts case: the last scheduled runs all failed', () => {
    const runs = [
      run('failure', '2026-11-09T15:01:44Z'),
      run('failure', '2026-11-02T15:01:44Z'),
      run('failure', '2026-10-26T15:25:30Z'),
      run('success', '2026-10-19T15:02:27Z'),
    ];
    const f = scheduleFinding('blog-drafts.yml', runs);
    expect(f?.kind).toBe('scheduled-run');
    expect(f?.detail).toContain('failure on 2026-11-09');
  });

  it('passes when one of the latest RUNS_CHECKED runs succeeded (a single flake is tolerated)', () => {
    expect(RUNS_CHECKED).toBe(2);
    const runs = [run('failure', '2026-11-16T04:30:00Z'), run('success', '2026-11-15T04:30:00Z')];
    expect(scheduleFinding('design-system.yml', runs)).toBeNull();
  });

  it('judges the newest runs whatever order gh returns them in, and skips runs still going', () => {
    const runs = [
      run('success', '2026-10-01T00:00:00Z'),
      run('', '2026-11-16T00:00:00Z', 'in_progress'),
      run('cancelled', '2026-11-15T00:00:00Z'),
      run('failure', '2026-11-14T00:00:00Z'),
    ];
    expect(scheduleFinding('blog-drafts.yml', runs)?.detail).toContain('cancelled on 2026-11-15');
  });

  it('fails a schedule that has not fired RUNS_CHECKED times (it may never fire)', () => {
    expect(scheduleFinding('blog-drafts.yml', [])?.detail).toContain('only 0');
    expect(
      scheduleFinding('blog-drafts.yml', [run('success', '2026-11-15T00:00:00Z')])?.detail
    ).toContain('only 1');
  });
});

describe('report', () => {
  it('is empty for a kind with no findings and lists each finding of its kind', () => {
    const stale = siteFinding(design, ok('Tue, 06 Jan 2026 00:50:12 GMT'), '2026-11-11T09:08:32Z')!;
    expect(report('scheduled-run', [stale])).toBe('');
    expect(report('stale-site', [stale])).toContain('**design.ferni.ai**');
  });
});

describe('issueAction', () => {
  it('never touches the issue when the check produced no report', () => {
    expect(issueAction(42, null, 'schedule')).toBe('unknown');
    expect(issueAction(null, null, 'schedule')).toBe('unknown');
  });

  it('closes the open issue on green and does nothing when there is none', () => {
    expect(issueAction(42, '', 'schedule')).toBe('close');
    expect(issueAction(42, ' \n', 'workflow_run')).toBe('close');
    expect(issueAction(null, '', 'schedule')).toBe('none');
  });

  it('opens one issue on red and comments on it instead of opening another', () => {
    expect(issueAction(null, '- **x**: broken\n', 'workflow_run')).toBe('open');
    expect(issueAction(42, '- **x**: broken\n', 'schedule')).toBe('comment');
    expect(issueAction(42, '- **x**: broken\n', 'workflow_dispatch')).toBe('comment');
  });

  it('does not comment on every deploy-triggered run while the issue stays open', () => {
    expect(issueAction(42, '- **x**: broken\n', 'workflow_run')).toBe('none');
  });
});
