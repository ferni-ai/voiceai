/**
 * What the Android app (a Trusted Web Activity over app.ferni.ai) needs from the
 * web app: a manifest it can install from, and Digital Asset Links built from
 * configuration (scripts/asset-links.ts).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ASSET_LINKS_PATH,
  assetLinksPlugin,
  buildAssetLinks,
  parseFingerprints,
} from '../scripts/asset-links';

const WEB = resolve(__dirname, '..');
const FP_A = Array.from({ length: 32 }, (_, i) =>
  (i * 7).toString(16).padStart(2, '0').slice(-2)
).join(':');
const FP_B = Array.from({ length: 32 }, () => 'AB').join(':');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(readFileSync(resolve(WEB, 'public/manifest.json'), 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  id: string;
  display: string;
  background_color: string;
  theme_color: string;
  prefer_related_applications?: boolean;
  icons: ManifestIcon[];
};

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('asset links', () => {
  it('is [] when no fingerprint is configured (what Hosting served before)', () => {
    expect(buildAssetLinks({})).toEqual([]);
    expect(buildAssetLinks({ ANDROID_CERT_SHA256: '  ' })).toEqual([]);
  });

  it('lists every configured fingerprint, upper-cased and de-duplicated, for ai.ferni.app', () => {
    const links = buildAssetLinks({
      ANDROID_CERT_SHA256: `${FP_A.toLowerCase()}, ${FP_B},${FP_A}`,
    });
    expect(links).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'ai.ferni.app',
          sha256_cert_fingerprints: [FP_A.toUpperCase(), FP_B],
        },
      },
    ]);
  });

  it('takes the package name from ANDROID_PACKAGE_NAME', () => {
    const [link] = buildAssetLinks({
      ANDROID_CERT_SHA256: FP_B,
      ANDROID_PACKAGE_NAME: 'ai.ferni.beta',
    });
    expect(link?.target.package_name).toBe('ai.ferni.beta');
  });

  it('fails the build on a malformed fingerprint or package instead of shipping a file Android rejects', () => {
    expect(() => parseFingerprints('AB:CD')).toThrow(/ANDROID_CERT_SHA256/);
    expect(() => parseFingerprints(FP_B.replace('AB', 'ZZ'))).toThrow(/ANDROID_CERT_SHA256/);
    expect(() =>
      buildAssetLinks({ ANDROID_CERT_SHA256: FP_B, ANDROID_PACKAGE_NAME: 'ferni' })
    ).toThrow(/ANDROID_PACKAGE_NAME/);
  });

  it('the Vite plugin emits the file at /.well-known/assetlinks.json', () => {
    const emitted: { fileName: string; source: string }[] = [];
    const plugin = assetLinksPlugin({ ANDROID_CERT_SHA256: FP_B });
    const hook = plugin.generateBundle as unknown as (this: unknown) => void;
    hook.call({ emitFile: (f: { fileName: string; source: string }) => emitted.push(f) });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.fileName).toBe(ASSET_LINKS_PATH);
    expect(JSON.parse(emitted[0]?.source ?? '')[0].target.sha256_cert_fingerprints).toEqual([FP_B]);
  });

  it('is wired into the production build and the hosting deploy', () => {
    expect(readFileSync(resolve(WEB, 'vite.config.ts'), 'utf8')).toMatch(
      /plugins:\s*\[assetLinksPlugin\(\)[,\]]/
    );
    const deploy = readFileSync(
      resolve(WEB, '../../.github/workflows/deploy-firebase.yml'),
      'utf8'
    );
    expect(deploy).toMatch(/ANDROID_CERT_SHA256: \$\{\{ vars\.ANDROID_CERT_SHA256 \}\}/);
  });

  it('signs a universal APK and refuses one whose key assetlinks would not list', () => {
    const workflow = readFileSync(
      resolve(WEB, '../../.github/workflows/android-twa.yml'),
      'utf8'
    );
    const step = workflow.slice(workflow.indexOf('- name: Universal APK'));
    expect(step).toMatch(/ANDROID_CERT_SHA256: \$\{\{ vars\.ANDROID_CERT_SHA256 \}\}/);
    expect(step).toMatch(/BUNDLETOOL_SHA256: [0-9a-f]{64}\n/);
    expect(step).toMatch(/sha256sum -c -/);
    expect(step).toMatch(/grep -qx "\$signed"/);
    // The 64 hex digits, whatever newer apksigner puts before them on the line.
    expect(step).toContain('SHA-256 digest: *\\([0-9a-fA-F]\\{64\\}\\)');
    expect(step).not.toContain("awk -F': '");
    expect(step).toMatch(/exit 1/);
    expect(workflow).toMatch(/bundle\/ferni-universal\.apk\n\s+if-no-files-found: error/);
  });
});

describe('web manifest (what the Android app installs from)', () => {
  it('is named Ferni, with no "AI" in any name', () => {
    expect(manifest.name).toBe('Ferni');
    expect(manifest.short_name).toBe('Ferni');
    expect(`${manifest.name} ${manifest.short_name}`).not.toMatch(/\bAI\b/i);
  });

  it('installs standalone at the root with a stable id', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    // Changing the id would make existing installs a different app; it is never shown.
    expect(manifest.id).toBe('ferni-ai-coach');
    expect(manifest.prefer_related_applications).not.toBe(true);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each([
    ['any', 192],
    ['any', 512],
    ['maskable', 192],
    ['maskable', 512],
  ])('has a %s %ipx PNG icon whose file really is that size', (purpose, px) => {
    const icon = manifest.icons.find(
      (i) => i.type === 'image/png' && i.sizes === `${px}x${px}` && (i.purpose ?? 'any') === purpose
    );
    expect(icon).toBeDefined();
    const file = resolve(WEB, 'public', icon!.src.replace(/^\//, ''));
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual([px, px]);
  });

  it('every listed icon exists', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(WEB, 'public', icon.src.replace(/^\//, ''))), icon.src).toBe(true);
    }
  });

  it('the home-screen title is Ferni', () => {
    const html = readFileSync(resolve(WEB, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Ferni" />');
    expect(html).toContain('<meta name="application-name" content="Ferni" />');
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />');
  });
});
