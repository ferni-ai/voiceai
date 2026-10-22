/**
 * Site claims check: the marketing site must not promise what Ferni does not do.
 *
 * Each phrase below was on ferni.ai and was not true (#1445): no end-to-end
 * encryption exists, memory is not perfect (callers can see, correct and
 * forget facts), "free forever" sat next to a waitlist, micro-expressions and
 * breath sync were never built, and the latency and count figures were not
 * product measurements. The 2026-10-21 owner decision (fix the copy, don't build
 * the capability) added: clinical credentials and distress or burnout prediction
 * nobody measured (#1454), voice identification and voice copies, which are off in
 * prod (#1457), Google Calendar and bank data, which aren't configured (#1446),
 * and recall shown as a real interaction (#1455). A phrase may stay only on an
 * ALLOWED line, with a reason.
 *
 * Usage: pnpm tsx scripts/website/site-claims.ts   (exits 1 on a hit)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_SRC = 'apps/website/ferni-website/src';

export const BANNED: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'end-to-end encrypted', pattern: /\bend[- ]to[- ]end[- ]encrypt/i },
  { id: 'never forgets', pattern: /\bnever forgets?\b/i },
  { id: 'infinite memory', pattern: /\binfinite memory\b/i },
  { id: 'perfect memory', pattern: /\bperfect memory\b/i },
  { id: 'free forever', pattern: /\bfree forever\b/i },
  { id: 'micro-expressions', pattern: /\bmicro-?expressions?\b/i },
  { id: 'breath sync', pattern: /\bbreath(ing)? sync/i },
  { id: 'decades of clinical experience', pattern: /\bdecades of clinical\b/i },
  { id: 'under 500ms', pattern: /\b(responds|replies|answers) in under\b|\bunder 500 ?ms\b/i },
  { id: 'tool domain count', pattern: /\b\d+ tool domains\b/i },
  { id: 'capability count', pattern: /\b\d+\+ (superhuman )?capabilities\b/i },
  { id: 'gdpr compliant', pattern: /\bGDPR compliant\b/i },
  { id: 'sso saml', pattern: /\bSSO\/SAML\b/ },
  { id: 'data residency', pattern: /\bdata residency\b/i },
  { id: 'created by clinicians', pattern: /\bcreated by mental health professionals\b/i },
  { id: 'professionals and technologists', pattern: /\bprofessionals[.,]?\s+(?:and\s+)?technologists\b/i },
  { id: 'mental health wisdom', pattern: /\blifetime of mental health wisdom\b/i },
  { id: 'built by healers', pattern: /\bbuilt by a family of healers\b/i },
  { id: 'predicts distress', pattern: /\b(?:predicts|detects) distress\b|\bdistress signals from voice\b/i },
  {
    id: 'predicts burnout',
    pattern: /\bbefore you (?:crash|hit the wall)\b|\bwarns? (?:you )?before burnout\b|\bburnout prevention\b/i,
  },
  { id: 'voice identification', pattern: /\bspeaker identification\b|\bvoice recognition\b/i },
  { id: 'messages in your voice', pattern: /\byour words, your voice\b/i },
  { id: 'knows your calendar', pattern: /\b(?:I|we) know your calendar\b|\bmanages your calendar\b/i },
  { id: 'spending patterns', pattern: /\bspending patterns\b|\bacross your spending\b/i },
  { id: 'perfect recall', pattern: /\bperfect recall\b/i },
];

/** File (relative to SITE_SRC) and phrase id that may stay, with the reason. */
export const ALLOWED: ReadonlyArray<{ file: string; id: string; reason: string }> = [
  {
    file: 'blog/how-ferni-remembers-you.md',
    id: 'perfect memory',
    reason: 'The post argues against perfect memory; it does not claim it.',
  },
  {
    file: 'preview/pixar-polish.njk',
    id: 'micro-expressions',
    reason: 'Internal design preview of the web orb animation, not product copy.',
  },
  {
    file: 'blog/how-ai-helped-design-its-own-brain.md',
    id: 'perfect recall',
    reason: 'Names "perfect recall of irrelevant things" as a failure mode; it does not claim it.',
  },
];

const COPY_FILE = /\.(njk|md|json|html)$/;

export interface ClaimHit {
  file: string;
  line: number;
  id: string;
  text: string;
}

/** Banned phrases in one file's text that are not allowed for that file. */
export function findClaims(file: string, text: string): ClaimHit[] {
  const hits: ClaimHit[] = [];
  text.split('\n').forEach((line, i) => {
    for (const { id, pattern } of BANNED) {
      if (!pattern.test(line)) continue;
      if (ALLOWED.some((a) => a.file === file && a.id === id)) continue;
      hits.push({ file, line: i + 1, id, text: line.trim().slice(0, 120) });
    }
  });
  return hits;
}

function copyFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return copyFiles(full, base);
    return COPY_FILE.test(entry.name) ? [path.relative(base, full)] : [];
  });
}

/** Every banned phrase in the site's copy files under srcDir. */
export function scanSite(srcDir: string): ClaimHit[] {
  return copyFiles(srcDir).flatMap((file) =>
    findClaims(file.split(path.sep).join('/'), fs.readFileSync(path.join(srcDir, file), 'utf8'))
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hits = scanSite(path.resolve(SITE_SRC));
  for (const h of hits)
    process.stderr.write(`${SITE_SRC}/${h.file}:${h.line} "${h.id}": ${h.text}\n`);
  process.stdout.write(
    hits.length ? `${hits.length} banned site claim(s)\n` : 'Site claims check passed\n'
  );
  process.exit(hits.length ? 1 : 0);
}
