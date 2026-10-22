/**
 * The privacy policy's provider list and its "Your data at a glance" table both
 * render from apps/website/ferni-website/src/_data/privacyData.json. These tests
 * keep the policy's prose and that file from drifting apart: every provider the
 * policy names must be in the file, and every provider in the file must handle
 * at least one kind of data in the table.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE = join(__dirname, '..', '..', 'apps', 'website', 'ferni-website', 'src');

interface Processor {
  name: string;
  does: string;
  data: string;
}
interface DataType {
  type: string;
  why: string;
  kept: string;
  processors: string[];
}
interface PrivacyData {
  processors: Processor[];
  dataTypes: DataType[];
}

function load(): { data: PrivacyData; policy: string } {
  return {
    data: JSON.parse(readFileSync(join(SITE, '_data', 'privacyData.json'), 'utf8')) as PrivacyData,
    policy: readFileSync(join(SITE, 'privacy.njk'), 'utf8'),
  };
}

/**
 * Companies Ferni's code can send personal data to, by the name prose would use,
 * mapped to the provider-table entry that must list them. A name with no entry
 * (null) is a company Ferni doesn't use today: if the policy ever names one, it
 * has to be added to the data file first. Venmo is left out on purpose: the
 * policy names it as a place people give on their own, and Ferni sends it nothing.
 */
const KNOWN_PROVIDERS: Record<string, string | null> = {
  'Google Cloud': 'Google Cloud',
  Gemini: 'Google (Gemini)',
  'Vertex AI': 'Google (Gemini)',
  Anthropic: 'Anthropic (Claude)',
  Claude: 'Anthropic (Claude)',
  OpenAI: 'OpenAI',
  LiveKit: 'LiveKit',
  Cartesia: 'Cartesia',
  Twilio: 'Twilio',
  SendGrid: 'SendGrid',
  'Google Analytics': 'Google Analytics',
  Sentry: 'Sentry',
  Stripe: null,
  ElevenLabs: null,
  Deepgram: null,
  Plaid: null,
  Spotify: null,
  Redis: null,
  Spanner: null,
  Mixpanel: null,
  PostHog: null,
};

/** Visible text of the policy: front matter, tags and Nunjucks blocks removed. */
function prose(policy: string): string {
  return policy
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/{%[\s\S]*?%}|{{[\s\S]*?}}/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** Names from KNOWN_PROVIDERS that the text mentions. */
function providersNamedIn(text: string): string[] {
  return Object.keys(KNOWN_PROVIDERS).filter((p) => new RegExp(`\\b${p}\\b`).test(text));
}

describe('privacy data file', () => {
  it('every provider handles at least one kind of data, and every row names known providers', () => {
    const { data } = load();
    const listed = data.processors.map((p) => p.name);
    const used = new Set(data.dataTypes.flatMap((d) => d.processors));

    expect(listed.filter((p) => !used.has(p))).toEqual([]);
    expect([...used].filter((p) => !listed.includes(p))).toEqual([]);
  });

  // The home page says the policy names every provider. The prod web server sends
  // error reports to Sentry once SENTRY_DSN is mounted (deploy/ui-server/secrets.txt).
  it('lists Sentry while the web server mounts SENTRY_DSN', () => {
    const { data } = load();
    const secrets = readFileSync(join(__dirname, '..', '..', 'deploy', 'ui-server', 'secrets.txt'), 'utf8'); // prettier-ignore
    if (!/^SENTRY_DSN=/m.test(secrets)) return;
    expect(data.processors.map((p) => p.name)).toContain('Sentry');
    expect(data.dataTypes.filter((d) => d.processors.includes('Sentry')).length).toBeGreaterThan(0);
  });

  it('every row says why and for how long', () => {
    const { data } = load();
    for (const row of data.dataTypes) {
      expect(row.why.trim(), row.type).not.toBe('');
      expect(row.kept.trim(), row.type).not.toBe('');
      expect(row.processors.length, row.type).toBeGreaterThan(0);
    }
  });

  it('the policy renders both tables from the data file', () => {
    const { policy } = load();
    expect(policy).toMatch(/{%\s*for \w+ in privacyData\.dataTypes\s*%}/);
    expect(policy).toMatch(/{%\s*for \w+ in privacyData\.processors\s*%}/);
  });

  it('every provider the policy names is in the data file', () => {
    const { data, policy } = load();
    const listed = new Set(data.processors.map((p) => p.name));
    const missing = providersNamedIn(prose(policy)).filter((p) => {
      const entry = KNOWN_PROVIDERS[p];
      return entry === null || entry === undefined || !listed.has(entry);
    });
    expect(missing).toEqual([]);
  });

  it('catches a provider named in prose but missing from the data file', () => {
    expect(providersNamedIn(prose('<p>Errors go to Sentry.</p>'))).toEqual(['Sentry']);
    expect(providersNamedIn(prose('{{ "Sentry" }} <!-- --> <p>nothing</p>'))).toEqual([]);
  });
});
