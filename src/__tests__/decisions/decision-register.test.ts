/**
 * The decision register (docs/decisions/register.md) in CI: one rule per
 * mechanically checkable decision, each reading the real source files. A rule
 * fails when any platform breaks the decision it guards.
 *
 * The register and this file must agree: every `rule <id>` the register names is
 * a rule here, every rule here is named there, and the same for `pending <id>`.
 *
 * Each rule's matcher is pure (text in, finding out) and is also run on a
 * synthetic bad input, so a matcher that can never fail is caught.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLAG_MANIFEST } from '../../config/flag-manifest.js';

const REPO = join(__dirname, '..', '..', '..');
const REGISTER = join(REPO, 'docs', 'decisions', 'register.md');
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');

function files(dir: string, keep: (path: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(join(REPO, dir))) return out;
  for (const entry of readdirSync(join(REPO, dir))) {
    const path = join(dir, entry);
    if (statSync(join(REPO, path)).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'Tests' && entry !== '.build')
        files(path, keep, out);
    } else if (keep(path)) {
      out.push(path);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// D2. No "AI" in user-facing strings.

/**
 * "AI", "A.I.", "KI", "IA" as whole upper-case words (not "J'AI", not "ferni.ai"),
 * or "artificial intelligence" in any case.
 */
const AI_WORD = /(?<![\p{L}\p{N}'’./])(?:AI|A\.I\.|KI|IA)(?![\p{L}\p{N}])/u;
const saysAI = (text: string): boolean =>
  AI_WORD.test(text) || /artificial intelligence/i.test(text);

/**
 * Every string in a parsed JSON tree with its path: values, and object keys too
 * (a string catalogue's keys are its source-language strings).
 */
function jsonStrings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => jsonStrings(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]): Array<[string, string]> => [
      [`${path}.${k} (key)`, k],
      ...jsonStrings(v, `${path}.${k}`),
    ]);
  }
  return [];
}

const LOG_CALL = /\b(?:log|logger|Logger|print|debugPrint|NSLog|os_log)\b/;
const SWIFT_LITERAL = /"((?:[^"\\\n]|\\.)*)"/g;

/** String literals in Swift source that say "AI", skipping comments and log calls. */
function swiftLiteralsSayingAI(swift: string): string[] {
  return swift.split('\n').flatMap((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/^\s*(?:\/\/\/?|\*)/.test(line) || LOG_CALL.test(code)) return [];
    return [...code.matchAll(SWIFT_LITERAL)]
      .filter((m) => saysAI(m[1]))
      .map((m) => `${i + 1}: ${m[0]}`);
  });
}

/** Info.plist usage descriptions (shown in permission prompts) that say "AI". */
function plistUsageSayingAI(plist: string): string[] {
  return [...plist.matchAll(/<key>(\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)]
    .filter((m) => saysAI(m[2]))
    .map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// D5. At most 4 earcons a call.

const SOUND_DIRECTOR = 'apps/web/src/services/sound-director.ts';
const EARCON_DIRECTOR =
  'apps/ios-native/Packages/FerniVoice/Sources/FerniVoice/EarconDirector.swift';
const webEarconCap = (ts: string): number | null =>
  Number(/export const MAX_EARCONS_PER_CALL = (\d+);/.exec(ts)?.[1] ?? NaN) || null;
const iosEarconCap = (swift: string): number | null =>
  Number(/\bplayedThisCall < (\d+)\b/.exec(swift)?.[1] ?? NaN) || null;

// ---------------------------------------------------------------------------
// D6. Experiment flags default off.

interface Spec {
  default: string;
  kind: string;
}
const ACTS_BY_DEFAULT = (spec: Spec): boolean =>
  spec.kind === 'experiment' && spec.default !== 'off' && spec.default !== 'shadow';
const experimentsOnByDefault = (manifest: Record<string, Spec>): string[] =>
  Object.entries(manifest)
    .filter(([, spec]) => ACTS_BY_DEFAULT(spec))
    .map(([name, spec]) => `${name}=${spec.default}`);

// ---------------------------------------------------------------------------

const RULES = [
  'no-ai-web-locales',
  'no-ai-ios-strings',
  'earcon-cap-web',
  'earcon-cap-ios',
  'experiment-flags-default-off',
];
const PENDING = ['lid-caps-ios-alive'];

describe('decision register', () => {
  it('names exactly the rules and pending rules this file has', () => {
    const register = readFileSync(REGISTER, 'utf8');
    const named = (word: string) =>
      [
        ...new Set(
          [...register.matchAll(new RegExp(`\\b${word} \`([a-z0-9-]+)\``, 'g'))].map((m) => m[1])
        ),
      ].sort();
    expect(named('rule'), 'rule ids in register.md').toEqual([...RULES].sort());
    expect(named('pending'), 'pending ids in register.md').toEqual([...PENDING].sort());
  });
});

describe('D1. eyelid caps are white (ivory in dark mode)', () => {
  // The web side is lid-colour.test.ts. On iOS the canvas avatar clips its lids
  // and draws no caps; the white/ivory domes ride the landing train in the Alive
  // renderer. Make this a rule then: light caps #FFFFFF, dark caps #E6DFD4,
  // never derived from the page, room or face colour.
  it.todo('lid-caps-ios-alive: the Alive shader draws white caps (ivory in dark mode)');
});

describe('D2. no "AI" in user-facing strings', () => {
  it('saysAI: catches the word and the phrase, not look-alikes', () => {
    for (const bad of [
      'Your AI friend',
      'AI-powered',
      'A.I. coach',
      'Dein KI-Coach',
      'Ton IA',
      'Artificial intelligence',
    ])
      expect(saysAI(bad), bad).toBe(true);
    for (const ok of [
      "CE QUE J'AI TROUVÉ",
      'ferni.ai/privacy',
      'FERNI.AI',
      'Said',
      'AIR',
      'Kiwi',
      'paid',
    ])
      expect(saysAI(ok), ok).toBe(false);
  });

  it('no-ai-web-locales: no web locale string says "AI"', () => {
    const locales = files('apps/web/src/i18n/locales', (p) => p.endsWith('.json'));
    expect(locales.length).toBeGreaterThanOrEqual(10);
    const hits = locales.flatMap((file) =>
      jsonStrings(JSON.parse(read(file)))
        .filter(([, text]) => saysAI(text))
        .map(([path, text]) => `${relative(REPO, join(REPO, file))}${path}: ${text}`)
    );
    expect(hits).toEqual([]);
  });

  it('no-ai-web-locales: catches a label that says "AI"', () => {
    const bad = { aiLabel: { role: { ferni: 'Your AI life coach' } } };
    expect(jsonStrings(bad).filter(([, t]) => saysAI(t))).toEqual([
      ['.aiLabel.role.ferni', 'Your AI life coach'],
    ]);
  });

  it('no-ai-ios-strings: no iOS string literal, usage description or string catalogue says "AI"', () => {
    const swift = [
      ...files('apps/ios-native/App', (p) => p.endsWith('.swift')),
      ...files('apps/ios-native/Packages', (p) => p.endsWith('.swift') && p.includes('/Sources/')),
    ];
    expect(swift.length).toBeGreaterThan(20);
    const hits = swift.flatMap((file) =>
      swiftLiteralsSayingAI(read(file)).map((h) => `${file}:${h}`)
    );
    hits.push(
      ...plistUsageSayingAI(read('apps/ios-native/App/Info.plist')).map((k) => `Info.plist ${k}`)
    );
    for (const catalogue of files('apps/ios-native', (p) => p.endsWith('.xcstrings'))) {
      for (const [path, text] of jsonStrings(JSON.parse(read(catalogue))))
        if (saysAI(text)) hits.push(`${catalogue}${path}: ${text}`);
    }
    expect(hits).toEqual([]);
  });

  it('no-ai-ios-strings: catches a label, a permission prompt and a catalogue entry', () => {
    expect(swiftLiteralsSayingAI('        Text("Meet your AI friend")')).toHaveLength(1);
    expect(swiftLiteralsSayingAI('        log.info("AI turn ended") // developer text')).toEqual(
      []
    );
    expect(swiftLiteralsSayingAI('    /// The "AI" label was removed')).toEqual([]);
    expect(
      plistUsageSayingAI(
        '<key>NSMicrophoneUsageDescription</key>\n\t<string>So the AI can hear you.</string>'
      )
    ).toEqual(['NSMicrophoneUsageDescription']);
    const catalogue = {
      strings: { Coach: { localizations: { en: { stringUnit: { value: 'AI coach' } } } } },
    };
    expect(jsonStrings(catalogue).filter(([, t]) => saysAI(t))).toHaveLength(1);
  });
});

describe('D5. at most 4 earcons a call', () => {
  it('earcon-cap-web: the web sound director caps a call at 4 earcons', () => {
    expect(webEarconCap(read(SOUND_DIRECTOR))).toBe(4);
  });

  it('earcon-cap-web: catches a raised cap', () => {
    expect(webEarconCap('export const MAX_EARCONS_PER_CALL = 6;')).toBe(6);
  });

  // EarconDirector.swift is on the iOS landing train; this enforces from the day it lands.
  it.skipIf(!existsSync(join(REPO, EARCON_DIRECTOR)))(
    'earcon-cap-ios: the iOS earcon director caps a call at 4 earcons',
    () => {
      expect(iosEarconCap(read(EARCON_DIRECTOR))).toBe(4);
    }
  );

  it('earcon-cap-ios: reads the guard, and catches a raised cap', () => {
    const guard =
      '        guard !agentSpeaking, !userSpeaking, playedThisCall < 4 else { return false }';
    expect(iosEarconCap(guard)).toBe(4);
    expect(iosEarconCap(guard.replace('< 4', '< 8'))).toBe(8);
  });
});

describe('D6. new behaviour ships behind a flag that is off by default', () => {
  it('experiment-flags-default-off: every experiment flag defaults to off or shadow', () => {
    const manifest = FLAG_MANIFEST as Record<string, Spec>;
    expect(Object.values(manifest).filter((s) => s.kind === 'experiment').length).toBeGreaterThan(
      100
    );
    expect(experimentsOnByDefault(manifest)).toEqual([]);
  });

  it('experiment-flags-default-off: catches an experiment that is on by default', () => {
    const manifest = {
      A: { default: 'off', kind: 'experiment' },
      B: { default: 'shadow', kind: 'experiment' },
      C: { default: 'on', kind: 'kill-switch' },
      D: { default: 'on', kind: 'experiment' },
    };
    expect(experimentsOnByDefault(manifest)).toEqual(['D=on']);
  });
});
