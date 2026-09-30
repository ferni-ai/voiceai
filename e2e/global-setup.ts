/**
 * Global setup for the root E2E suite: refuse to start when any configured
 * target points off this machine and the run hasn't opted in with
 * E2E_ALLOW_REMOTE=1. Importing ./support/env already validates each URL;
 * this re-checks them all so the failure is reported once, up front.
 */

import { REMOTE_ALLOWED, assertAllowedTarget, configuredTargets } from './support/env';

export default function globalSetup(): void {
  const targets = configuredTargets();
  for (const [label, url] of Object.entries(targets)) {
    assertAllowedTarget(url, label);
  }
  const summary = Object.entries(targets)
    .map(([label, url]) => `${label}=${url}`)
    .join('  ');
  process.stdout.write(
    `[e2e] targets: ${summary}${REMOTE_ALLOWED ? '  (E2E_ALLOW_REMOTE=1: remote hosts permitted)' : ''}\n`
  );
}
