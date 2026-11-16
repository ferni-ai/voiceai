/**
 * The publish gate: a package whose entry points aren't all in its tarball, or whose
 * repository isn't this repo, must not publish (a version on npm can't be republished).
 */
import { describe, expect, it } from 'vitest';
import { exportTargets, packageProblems, REPOSITORY } from '../check-package-exports.js';

const repository = { url: `git+https://${REPOSITORY}.git` };

describe('exportTargets', () => {
  it('reads strings, nested conditions and arrays', () => {
    expect(
      exportTargets({
        '.': { types: './dist/index.d.ts', import: './dist/index.mjs', require: './dist/index.js' },
        './styles.css': './dist/styles.css',
        './alt': ['./dist/a.js', './dist/b.js'],
      })
    ).toEqual([
      './dist/index.d.ts',
      './dist/index.mjs',
      './dist/index.js',
      './dist/styles.css',
      './dist/a.js',
      './dist/b.js',
    ]);
  });
});

describe('packageProblems', () => {
  it('passes when every entry point is packed and the repository is this repo', () => {
    const pkg = { main: 'dist/tokens.css', exports: { '.': './dist/tokens.css' }, repository };
    expect(packageProblems(pkg, ['package.json', 'dist/tokens.css'])).toEqual([]);
  });

  it('names each export that is not in the tarball, once', () => {
    const pkg = {
      main: 'dist/tokens.css',
      exports: {
        '.': './dist/tokens.css',
        './i18n': './tokens/i18n.json',
        './content-utils': './dist/content-utils.ts',
      },
      repository,
    };
    expect(packageProblems(pkg, ['dist/tokens.css'])).toEqual([
      './tokens/i18n.json is an entry point but is not in the tarball',
      './dist/content-utils.ts is an entry point but is not in the tarball',
    ]);
  });

  it('checks main, module and types as well as exports', () => {
    const pkg = {
      main: 'dist/index.js',
      module: 'dist/index.mjs',
      types: 'dist/index.d.ts',
      repository,
    };
    expect(packageProblems(pkg, ['dist/index.js'])).toEqual([
      'dist/index.mjs is an entry point but is not in the tarball',
      'dist/index.d.ts is an entry point but is not in the tarball',
    ]);
  });

  it('skips pattern exports, which name no single file', () => {
    expect(packageProblems({ exports: { './*': './dist/*.js' }, repository }, [])).toEqual([]);
  });

  it('fails a repository that is missing or names another repo', () => {
    expect(packageProblems({}, [])).toEqual([
      `repository.url is missing; it must name ${REPOSITORY}`,
    ]);
    expect(
      packageProblems({ repository: { url: 'https://github.com/ferni/voiceai' } }, [])
    ).toEqual([`repository.url is "https://github.com/ferni/voiceai"; it must name ${REPOSITORY}`]);
  });
});
