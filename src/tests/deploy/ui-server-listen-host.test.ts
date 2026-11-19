/**
 * The deployed UI server keeps listening on every interface (#3862). Development now
 * defaults to loopback, so the image states its host instead of relying on NODE_ENV:
 * Cloud Run must still reach the container whatever NODE_ENV a deploy passes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const dockerfile = readFileSync(join(ROOT, 'docker/Dockerfile.ui'), 'utf8');
const prodEnv = readFileSync(join(ROOT, 'deploy/ui-server/env.yaml'), 'utf8');

describe('UI server listen host in deploys', () => {
  it('the UI image listens on every interface', () => {
    expect(dockerfile).toMatch(/^ENV UI_SERVER_HOST=0\.0\.0\.0$/m);
  });

  it('no deploy env overrides the image host', () => {
    expect(prodEnv).not.toMatch(/^UI_SERVER_HOST:/m);
  });
});
