/**
 * A Firestore write must not run its document reference through cleanForFirestore.
 *
 * A bulk edit (bc8ca5f52) wrapped the *reference* instead of the data in eight
 * transaction.set(...) calls. cleanForFirestore walks objects recursively and a
 * real DocumentReference points back into its client, so in the server every one
 * of those writes died with "Maximum call stack size exceeded", caught and only logged:
 * a person's first roadmap vote, feature suggestions, streak rewards, seed
 * balances, returning visitors, and the first crisis signal for a user (so
 * crisis-pattern tracking never started).
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import admin from 'firebase-admin';
import { describe, expect, it } from 'vitest';
import { cleanForFirestore } from '../firestore-utils.js';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('document references and cleanForFirestore', () => {
  it('cleanForFirestore does not hand back a reference: it rebuilds it as a plain object', () => {
    // So wrapping a reference is always wrong. In the running server it went further and
    // overflowed the stack (a used client is full of cycles); a fresh one here only loses its type.
    const app = admin.apps.find((a) => a?.name === 'ref-wrapping-test') ?? admin.initializeApp({ projectId: 'demo-ref-test' }, 'ref-wrapping-test');
    const ref = app.firestore().collection('feature_votes').doc('someone_some-feature');
    let cleaned: unknown;
    try {
      cleaned = cleanForFirestore(ref);
    } catch (error) {
      cleaned = error; // the server's stack overflow is the other way this goes wrong
    }
    expect(cleaned).not.toBeInstanceOf(admin.firestore.DocumentReference);
  });

  it('no transaction or batch write wraps its reference in cleanForFirestore', () => {
    const wrapped = /\b(transaction|tx|batch)\.(set|update|create)\(\s*cleanForFirestore\(/;
    const offenders = sourceFiles(join(__dirname, '../..')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (wrapped.test(line) ? [`${file.split('/src/')[1]}:${i + 1}`] : []))
    );
    expect(offenders).toEqual([]);
  });
});
