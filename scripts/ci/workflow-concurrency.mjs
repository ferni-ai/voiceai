#!/usr/bin/env node
/**
 * Every workflow that runs on pull_request cancels a PR's superseded runs, and
 * only those.
 *
 * Runners are the merge queue's bottleneck. A workflow with no concurrency group
 * leaves every older run of a PR going after each push (14 workflows did, until
 * #816). A workflow whose cancel-in-progress is true for every event cancels
 * merge-queue runs and pushes to main as well, which drops a queue entry or main's
 * only verdict (see ci.yml's header). So each pull_request workflow needs a
 * top-level block whose group is keyed on the PR number and whose cancel is:
 *
 *   cancel-in-progress: ${{ github.event_name == 'pull_request' }}
 *
 * Exceptions live in ALLOWED, each with its reason.
 *
 *   node scripts/ci/workflow-concurrency.mjs [workflows-dir]
 *
 * It reads the YAML by line, not with a parser: `on:` and `concurrency:` are
 * top-level keys, and the repo has no YAML library at its root.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PR_ONLY_CANCEL = "${{ github.event_name == 'pull_request' }}";

/** Workflows allowed a different block, and why. */
export const ALLOWED = {
  'pr-flow.yml': 'runs only on pull_request, so cancel-in-progress: true is already PR-only',
  'staging-cleanup.yml':
    'never cancels: a cleanup cut short leaves a PR preview running; grouped per PR',
  'deploy-worker.yml':
    'deploy group keyed on the ref (worker-<ref>), shared with manual deploys; PR builds are path-filtered',
  'android-twa.yml':
    'group keyed on the ref with the PR-only cancel, so main pushes and Play-signing dispatches queue instead of running side by side; no merge_group trigger',
};

const TRIGGERS = /^(pull_request|pull_request_target)$/;

/** The lines of a top-level key's block, or the inline value as one line. */
function topLevelBlock(lines, key) {
  const re = new RegExp(`^["']?${key}["']?\\s*:(.*)$`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return null;
  const inline = lines[start]
    .match(re)[1]
    .replace(/\s+#.*$/, '')
    .trim();
  if (inline) return [inline];
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.startsWith('#')) break;
    if (line.trim() && !line.trim().startsWith('#')) body.push(line);
  }
  return body;
}

/** Event names under `on:` (block keys, a flow list or a single name). */
export function triggers(text) {
  const lines = text.split('\n');
  const block = topLevelBlock(lines, 'on') ?? topLevelBlock(lines, 'true');
  if (!block) return [];
  if (block.length === 1 && !/^\s/.test(block[0])) {
    return block[0]
      .replace(/[[\]]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const indent = Math.min(...block.map((l) => l.match(/^\s*/)[0].length));
  return block
    .filter((l) => l.match(/^\s*/)[0].length === indent)
    .map((l) => l.trim().replace(/^-\s*/, '').replace(/:.*$/, ''));
}

/** The concurrency block's group and cancel-in-progress, or null if absent. */
export function concurrency(text) {
  const block = topLevelBlock(text.split('\n'), 'concurrency');
  if (!block) return null;
  if (block.length === 1 && !/^\s/.test(block[0])) return { group: block[0], cancel: 'false' };
  const field = (name) => {
    const line = block.find((l) => l.trim().startsWith(`${name}:`));
    return line
      ? line
          .trim()
          .slice(name.length + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, '$2')
      : '';
  };
  return { group: field('group'), cancel: field('cancel-in-progress') || 'false' };
}

/** Problems for one workflow file; empty when it complies or isn't PR-triggered. */
export function problems(file, text) {
  if (!triggers(text).some((t) => TRIGGERS.test(t))) return [];
  if (ALLOWED[file]) return [];
  const c = concurrency(text);
  if (!c) return [`${file}: runs on pull_request but has no top-level concurrency group`];
  const out = [];
  if (!c.group.includes('github.event.pull_request.number')) {
    out.push(
      `${file}: concurrency group is not keyed on github.event.pull_request.number (${c.group})`
    );
  }
  if (c.cancel !== PR_ONLY_CANCEL) {
    out.push(`${file}: cancel-in-progress must be ${PR_ONLY_CANCEL} (is ${c.cancel})`);
  }
  return out;
}

export function scan(dir) {
  const files = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
  const found = files.flatMap((f) => problems(f, readFileSync(join(dir, f), 'utf8')));
  const stale = Object.keys(ALLOWED)
    .filter((f) => !files.includes(f))
    .map((f) => `${f}: allowlisted but no longer exists; drop it from ALLOWED`);
  return [...found, ...stale];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const found = scan(process.argv[2] ?? '.github/workflows');
  for (const p of found) console.error(p);
  if (found.length) process.exit(1);
  console.log('every pull_request workflow cancels superseded PR runs only');
}
