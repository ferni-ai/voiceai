/**
 * Snapshot the effective settings of a deployed voice agent into config/settings/<env>.json,
 * then print how dev and prod differ.
 *
 *   pnpm tsx scripts/settings/snapshot.ts dev|prod [--from-file <log.txt>]
 *
 * Reads the latest complete EFFECTIVE_SETTINGS set from `lk agent logs` for the environment's
 * project and config. Secret values never reach the logged line (src/config/effective-settings.ts),
 * so the file holds `<set>` and `<unset>` markers only. --from-file reads a saved log instead.
 *
 * @module scripts/settings/snapshot
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSettings, latestSettings, secretLeaks, type Settings } from './reassemble.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARGETS = {
  dev: { project: 'ferni-dev', config: 'livekit.toml' },
  prod: { project: 'ferni-prod', config: 'livekit.prod-cloud.toml' },
} as const;
type Env = keyof typeof TARGETS;

/** `lk agent logs` streams until stopped, so read for a fixed time, then stop. */
const LOG_WINDOW_MS = 30_000;

function readLogs(env: Env): Promise<string> {
  const { project, config } = TARGETS[env];
  const child = spawn(
    'lk',
    ['agent', 'logs', '--project', project, '--config', config, '--quiet'],
    {
      cwd: ROOT,
    }
  );
  let out = '';
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
  return new Promise((resolve) => {
    const stop = setTimeout(() => child.kill('SIGTERM'), LOG_WINDOW_MS);
    child.on('close', () => {
      clearTimeout(stop);
      resolve(out);
    });
  });
}

function settingsPath(env: Env): string {
  return join(ROOT, 'config', 'settings', `${env}.json`);
}

function sortedJson(settings: Settings): string {
  const sortKeys = (map: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.keys(map)
        .sort()
        .map((k) => [k, map[k]])
    );
  return `${JSON.stringify({ commit: settings.commit, hash: settings.hash, flags: sortKeys(settings.flags), env: sortKeys(settings.env) }, null, 2)}\n`;
}

function readSettingsFile(env: Env): Settings | null {
  const path = settingsPath(env);
  if (!existsSync(path)) return null;
  const settings = JSON.parse(readFileSync(path, 'utf8')) as Settings;
  const leaks = secretLeaks(settings);
  if (leaks.length)
    throw new Error(
      `refusing to diff config/settings/${env}.json: secret names carry values: ${leaks.join(', ')}`
    );
  return settings;
}

async function main(): Promise<void> {
  const env = process.argv[2] as Env;
  if (!(env in TARGETS)) throw new Error('usage: snapshot.ts dev|prod [--from-file <log.txt>]');
  const fromFile = process.argv.indexOf('--from-file');
  if (fromFile > -1 && !process.argv[fromFile + 1]) throw new Error('--from-file needs a log path');
  const logText =
    fromFile > -1 ? readFileSync(process.argv[fromFile + 1], 'utf8') : await readLogs(env);

  const settings = latestSettings(logText);
  if (!settings) throw new Error(`no complete EFFECTIVE_SETTINGS set in the ${env} logs`);
  const leaks = secretLeaks(settings);
  if (leaks.length)
    throw new Error(`refusing to write: secret names carry values: ${leaks.join(', ')}`);
  mkdirSync(join(ROOT, 'config', 'settings'), { recursive: true });
  writeFileSync(settingsPath(env), sortedJson(settings));
  console.log(
    `wrote config/settings/${env}.json (commit ${settings.commit}, hash ${settings.hash})`
  );

  const dev = env === 'dev' ? settings : readSettingsFile('dev');
  const prod = env === 'prod' ? settings : readSettingsFile('prod');
  if (dev && prod) {
    const diff = diffSettings(dev, prod);
    console.log(`dev vs prod: ${diff.length} differing settings`);
    for (const [name, a, b] of diff)
      console.log(`  ${name}: dev=${a ?? '<absent>'} prod=${b ?? '<absent>'}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
