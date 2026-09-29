/**
 * The UI service's deploy secrets come from infra/secrets/ui-service.json via
 * scripts/deploy/resolve-secrets.mjs. These tests pin the contract.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain ESM deploy script without type declarations
import { loadCatalog, resolve, toFlags, toSecretName } from '../../../scripts/deploy/resolve-secrets.mjs';

type Result = {
  envVars: Record<string, string>;
  secrets: Record<string, string>;
  missing: { required: Array<{ env: string }>; optional: Array<{ env: string }> };
};

describe('deploy secret catalog', () => {
  const catalog = loadCatalog('ui-service');

  it('maps env names to kebab-case secret names with overrides', () => {
    expect(toSecretName('STRIPE_SECRET_KEY')).toBe('stripe-secret-key');
    const r = resolve(catalog, new Set(['admin-api-key'])) as Result;
    expect(r.secrets.ADMIN_KEY).toBe('admin-api-key:latest');
    expect(r.secrets.ADMIN_API_KEYS).toBe('admin-api-key:latest');
  });

  it('mounts only secrets that exist and reports the rest', () => {
    const r = resolve(catalog, new Set(['livekit-url', 'stripe-secret-key'])) as Result;
    expect(Object.keys(r.secrets)).toEqual(expect.arrayContaining(['LIVEKIT_URL', 'STRIPE_SECRET_KEY']));
    expect(r.secrets.SPOTIFY_CLIENT_ID).toBeUndefined();
    expect(r.missing.required.map((m) => m.env)).toContain('LIVEKIT_API_KEY');
    expect(r.missing.optional.map((m) => m.env)).toContain('SPOTIFY_CLIENT_ID');
  });

  it('covers the integrations that were missing in production', () => {
    const all = [...catalog.required, ...Object.values(catalog.optional as Record<string, string[]>).flat()];
    for (const env of [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SPOTIFY_CLIENT_ID',
      'MICROSOFT_CLIENT_ID',
      'OURA_CLIENT_ID',
      'VAPID_PUBLIC_KEY',
      'SIP_TRUNK_ID',
      'SIP_INBOUND_TRUNK_ID',
      'TWILIO_AUTH_TOKEN',
      'GOOGLE_MAPS_API_KEY',
    ]) {
      expect(all).toContain(env);
    }
    expect(catalog.env.PUBLIC_URL).toBe('https://app.ferni.ai');
  });

  it('renders gcloud flags with a comma-safe env delimiter', () => {
    const flags = toFlags(resolve(catalog, new Set(['livekit-url'])));
    expect(flags).toMatch(/^--set-env-vars "\^@\^NODE_ENV=production@/);
    expect(flags).toContain('ALLOWED_ORIGINS=https://app.ferni.ai,https://ferni.ai');
    expect(flags).toContain('--set-secrets "LIVEKIT_URL=livekit-url:latest"');
  });
});
