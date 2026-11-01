/**
 * The subcollection names the code writes under bogle_users/{uid} and users/{uid}, read
 * from the source (src/ and apps/*\/src, tests left out), so copy-user.test.ts can hold
 * every one to a decision: copied or not. Best effort, by pattern, not a type checker:
 *
 * - chains: .collection(<root>).doc(..).collection(<name>)[.doc(..).collection(<name>)]..
 *   and .doc(`bogle_users/${uid}`).collection(<name>), where <root> is a literal or a
 *   constant holding 'bogle_users' / 'users', and <name> a literal or a constant;
 * - the same chains from a variable, property or method that holds such a doc ref;
 * - template paths: `bogle_users/${uid}/name/${id}/name2` (collection positions only);
 * - createPersistenceStore / createUserOAuthStore({ collection }) without
 *   useRootCollection: true, which write bogle_users/{uid}/{collection};
 * - helpers taking the name: fn(db, uid, 'name') -> <root>.doc(uid).collection(name).
 *
 * A name it misses is not copied (COPIED_SUBCOLLECTIONS is an allowlist); it is only
 * not reported. Names built at runtime (wearable_${provider}_tokens) are caught by the
 * credential-word check instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ARG = String.raw`[^()]*(?:\([^()]*\)[^()]*)*`; // one level of nested parentheses
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'dist', 'build', 'tests', 'e2e']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) sourceFiles(path, out);
    } else if (/\.ts$/.test(e.name) && !/\.(test|spec|d)\.ts$/.test(e.name)) {
      out.push(path);
    }
  }
  return out;
}

export function userRecordSubcollections(repo: string): Map<string, string> {
  const apps = readdirSync(join(repo, 'apps'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(repo, 'apps', e.name, 'src'))
    .filter((dir) => readdirSync(join(dir, '..')).includes('src'));
  const files = [join(repo, 'src'), ...apps].flatMap((dir) => sourceFiles(dir));
  const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

  // exported string constants, resolvable from any file (unique values only)
  const exported = new Map<string, string | null>();
  for (const src of sources.values()) {
    for (const m of src.matchAll(/export const (\w+)\s*=\s*['"]([A-Za-z_]+)['"]/g)) {
      const [, id = '', value = ''] = m;
      exported.set(id, exported.has(id) && exported.get(id) !== value ? null : value);
    }
  }

  const found = new Map<string, string>(); // name -> first file that writes it
  const add = (name: string | undefined, file: string): void => {
    if (name && !found.has(name)) found.set(name, relative(repo, file));
  };

  for (const [file, src] of sources) {
    if (
      !/['"`](bogle_users|users)\b|USER_RECORDS_COLLECTION|create(Persistence|UserOAuth)Store/.test(
        src
      )
    ) {
      continue;
    }
    const strings = new Map<string, string>();
    for (const [id, value] of exported) if (value) strings.set(id, value);
    for (const m of src.matchAll(/(\w+)\s*(?::\s*[\w<>]+)?\s*[=:]\s*['"]([A-Za-z_]+)['"]/g)) {
      const [, id = '', value = ''] = m;
      if (!strings.has(id) || exported.has(id)) strings.set(id, value);
    }
    const rootIds = [...strings]
      .filter(([, v]) => v === 'bogle_users' || v === 'users')
      .map(([k]) => k);
    const ids = rootIds.length ? `(?:this\\.|\\w+\\.)?(?:${rootIds.join('|')})` : '';
    const ROOT = String.raw`\.collection\(\s*(?:['"](?:bogle_users|users)['"]${ids ? `|${ids}` : ''})\s*\)\s*\.doc\(${ARG}\)`;
    const TPL_HEAD = `(?:bogle_users|users${ids ? `|\\$\\{${ids}\\}` : ''})`;
    const TPL_ROOT = String.raw`\.doc\(\s*\`${TPL_HEAD}/\$\{[^}]+\}\`\s*\)`;
    const SUB = String.raw`\.collection\(\s*((?:['"][A-Za-z_]+['"])|[\w.]+)\s*\)`;
    const resolve = (token: string): string | undefined =>
      /^['"]([A-Za-z_]+)['"]$/.exec(token)?.[1] ??
      strings.get(
        token
          .replace(/^this\./, '')
          .split('.')
          .pop() ?? ''
      );
    const chain = (start: string): void => {
      const re = new RegExp(`(?:${start})((?:\\s*${SUB}(?:\\s*\\.doc\\(${ARG}\\))?)+)`, 'g');
      for (const m of src.matchAll(re)) {
        for (const s of (m[1] ?? '').matchAll(new RegExp(SUB, 'g'))) add(resolve(s[1] ?? ''), file);
      }
    };
    chain(ROOT);
    chain(TPL_ROOT);

    const ref = `(?:${ROOT}|${TPL_ROOT})`;
    const holders = new Set<string>();
    for (const re of [
      String.raw`(\w+)\s*(?::[^=;\n]+)?=\s*[^;]*?${ref}\s*[;,)]`,
      String.raw`(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{\s*return\s+[^;]*?${ref}\s*;`,
      String.raw`(\w+)\s*=\s*\([^)]*\)\s*(?::[^=]+)?=>\s*[^;]*?${ref}`,
    ]) {
      for (const m of src.matchAll(new RegExp(re, 'g'))) holders.add(m[1] ?? '');
    }
    for (const h of holders) chain(String.raw`\b${h}(?:\(${ARG}\))?`);

    const tpl = new RegExp(
      String.raw`\`${TPL_HEAD}/\$\{[^}]+\}((?:/(?:[A-Za-z_]+|\$\{[^}]+\}))+)`,
      'g'
    );
    for (const m of src.matchAll(tpl)) {
      // segments alternate collection / document id: keep the literal collections
      (m[1] ?? '')
        .slice(1)
        .split('/')
        .forEach((seg, i) => i % 2 === 0 && /^[A-Za-z_]+$/.test(seg) && add(seg, file));
    }

    for (const m of src.matchAll(
      /create(?:Persistence|UserOAuth)Store(?:<[^(]*>)?\(\s*\{([^}]*)\}/g
    )) {
      const body = m[1] ?? '';
      if (/useRootCollection:\s*true/.test(body)) continue;
      add(resolve(/collection:\s*([^,\n]+)/.exec(body)?.[1]?.trim() ?? ''), file);
    }

    const helper = String.raw`(\w+)\s*(?:=\s*)?\([^)]*\)\s*(?::[^{=]+)?(?:=>)?\s*\{?\s*(?:return\s+)?[^;{}]*?${ROOT}\s*\.collection\(\s*\w+\s*\)`;
    for (const m of src.matchAll(new RegExp(helper, 'g'))) {
      const call = new RegExp(String.raw`\b${m[1]}\([^()]*?['"]([A-Za-z_]+)['"]\s*\)`, 'g');
      for (const c of src.matchAll(call)) add(c[1], file);
    }
  }
  return found;
}
