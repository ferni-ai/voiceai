/**
 * Digital Asset Links for the Android app (a Trusted Web Activity).
 *
 * app.ferni.ai is Firebase Hosting. When a site has no file at
 * /.well-known/assetlinks.json, Hosting answers with its own generated `[]`
 * (private, no-store), and that answer wins over the "**" rewrite. A file in the
 * deployed directory overrides it, so the build writes one. Firebase's
 * `**\/.*` ignore entry does not drop it: glob only matches the last segment.
 *
 * The signing fingerprints are configuration, not code: ANDROID_CERT_SHA256
 * holds one or more SHA-256 fingerprints, comma separated (the Play App Signing
 * key, plus the upload key if you want sideloaded CI builds verified too).
 * Unset means `[]`, which is what the site served before this file existed.
 */
import type { Plugin } from 'vite';

export const ASSET_LINKS_PATH = '.well-known/assetlinks.json';
export const DEFAULT_ANDROID_PACKAGE = 'ai.ferni.app';

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export interface AssetLinksEnv {
  ANDROID_CERT_SHA256?: string;
  ANDROID_PACKAGE_NAME?: string;
}

export interface AssetLinkStatement {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/** Parse and validate the fingerprints. Throws on a malformed value so a typo fails the build instead of shipping a file Android rejects. */
export function parseFingerprints(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const fp = part.trim().toUpperCase();
    if (!fp) continue;
    if (!FINGERPRINT.test(fp)) {
      throw new Error(
        `ANDROID_CERT_SHA256: "${part.trim()}" is not a SHA-256 fingerprint (32 hex pairs separated by colons)`
      );
    }
    if (!out.includes(fp)) out.push(fp);
  }
  return out;
}

export function buildAssetLinks(env: AssetLinksEnv): AssetLinkStatement[] {
  const fingerprints = parseFingerprints(env.ANDROID_CERT_SHA256);
  if (fingerprints.length === 0) return [];
  const packageName = (env.ANDROID_PACKAGE_NAME || DEFAULT_ANDROID_PACKAGE).trim();
  if (!PACKAGE.test(packageName)) {
    throw new Error(`ANDROID_PACKAGE_NAME: "${packageName}" is not an Android package name`);
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/** Vite plugin: emits dist/.well-known/assetlinks.json at build time from the environment. */
export function assetLinksPlugin(env: AssetLinksEnv = process.env): Plugin {
  return {
    name: 'ferni-asset-links',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: ASSET_LINKS_PATH,
        source: `${JSON.stringify(buildAssetLinks(env), null, 2)}\n`,
      });
    },
  };
}
