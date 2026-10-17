import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findClaims, scanSite, SITE_SRC } from '../site-claims.js';

const root = path.resolve(__dirname, '../../..');

describe('site claims check', () => {
  it('finds no banned claim in the marketing site source', () => {
    expect(scanSite(path.join(root, SITE_SRC))).toEqual([]);
  });

  it.each([
    ['<span>End-to-End Encrypted</span>', 'end-to-end encrypted'],
    ['I never forget a single detail', 'never forgets'],
    ['Six specialists, one conversation, infinite memory.', 'infinite memory'],
    ['<h3>Perfect Memory</h3>', 'perfect memory'],
    ['<td>Free forever</td>', 'free forever'],
    ['<h4>Micro-Expressions</h4>', 'micro-expressions'],
    ['<strong>Breath Synchronization</strong>', 'breath sync'],
    ['Decades of clinical experience', 'decades of clinical experience'],
    ['Ferni responds in under 500ms', 'under 500ms'],
    ['146 Tool Domains', 'tool domain count'],
    ['45+ Superhuman Capabilities', 'capability count'],
  ])('flags %s', (line, id) => {
    expect(findClaims('index.njk', `<p>\n${line}\n</p>`)).toEqual([
      expect.objectContaining({ file: 'index.njk', line: 2, id }),
    ]);
  });

  it('lets an allowed phrase stay only in its own file', () => {
    const text = 'The Problem With Perfect Memory';
    expect(findClaims('blog/how-ferni-remembers-you.md', text)).toEqual([]);
    expect(findClaims('blog/other.md', text)).toHaveLength(1);
  });

  it('leaves true wording alone', () => {
    const ok =
      'Encrypted in transit and at rest. I remember what matters, and you can forget any of it. Free in early access.';
    expect(findClaims('index.njk', ok)).toEqual([]);
  });
});
