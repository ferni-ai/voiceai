/**
 * Brand linter scope: what each rule flags and where. Every case runs the real
 * rules through lintFile, so reverting a scope change fails a test here.
 */
import { describe, expect, it } from 'vitest';
import {
  globToRegExp,
  INCLUDE_PATTERNS,
  isEmojiInLoggingCall,
  lintFile,
} from '../lint-brand.js';

function ruleHits(file: string, content: string, rule: string): number {
  return lintFile(file, content).filter((e) => e.rule === rule).length;
}

const CONSOLE = 'console.log("hi");';

describe('no-console-log scope', () => {
  it.each(['/repo/src/cli/foo.ts', '/repo/src/scripts/deploy.ts', '/repo/scripts/build.ts'])(
    'ignores console in tooling: %s',
    (file) => {
      expect(ruleHits(file, CONSOLE, 'no-console-log')).toBe(0);
    }
  );

  it.each(['/repo/src/services/foo.ts', '/repo/apps/web/src/ui/foo.ts'])(
    'flags console in app and server code: %s',
    (file) => {
      expect(ruleHits(file, CONSOLE, 'no-console-log')).toBe(1);
    }
  );

  it('anchors excludes to a path segment, so transcripts/ is not scripts/', () => {
    expect(ruleHits('/repo/src/memory/transcripts/store.ts', CONSOLE, 'no-console-log')).toBe(1);
  });

  it('skips doc-comment lines', () => {
    const content = '/**\n * Example:\n *   console.log(result);\n */\nexport const x = 1;';
    expect(ruleHits('/repo/src/services/foo.ts', content, 'no-console-log')).toBe(0);
  });

  it('honors eslint-disable-next-line no-console on the line above only', () => {
    const content = [
      '// eslint-disable-next-line no-console',
      'console.table(rows); console.log("shown");',
      'console.log("not covered");',
    ].join('\n');
    expect(ruleHits('/repo/apps/web/src/services/dev.ts', content, 'no-console-log')).toBe(1);
  });

  it('honors eslint-disable-line no-console and a file-level disable', () => {
    const sameLine = 'console.log("x"); // eslint-disable-line no-console';
    const fileLevel = '/* eslint-disable no-console */\nconsole.log("a");\nconsole.warn("b");';
    expect(ruleHits('/repo/apps/web/src/a.ts', sameLine, 'no-console-log')).toBe(0);
    expect(ruleHits('/repo/apps/web/src/b.ts', fileLevel, 'no-console-log')).toBe(0);
  });

  it('does not treat other eslint disables as console opt-outs', () => {
    const content = '// eslint-disable-next-line no-unused-vars\nconsole.log("x");';
    expect(ruleHits('/repo/apps/web/src/a.ts', content, 'no-console-log')).toBe(1);
  });

  it('reads the rule list like ESLint: exact names, reason after -- ignored', () => {
    const file = '/repo/apps/web/src/a.ts';
    const reasonMentions = '// eslint-disable-next-line some-rule -- avoids no-console noise\nconsole.log("x");';
    const listed = '// eslint-disable-next-line no-alert, no-console -- dev tool\nconsole.log("x");';
    const allRules = '// eslint-disable-next-line\nconsole.log("x");';
    expect(ruleHits(file, reasonMentions, 'no-console-log')).toBe(1);
    expect(ruleHits(file, listed, 'no-console-log')).toBe(0);
    expect(ruleHits(file, allRules, 'no-console-log')).toBe(0);
  });

  it('ends a block disable at eslint-enable, and ignores directives inside strings', () => {
    const file = '/repo/apps/web/src/a.ts';
    const block = '/* eslint-disable no-console */\nconsole.log("a");\n/* eslint-enable no-console */\nconsole.log("b");';
    const inString = 'const s = "/* eslint-disable no-console */";\nconsole.log("x");';
    expect(ruleHits(file, block, 'no-console-log')).toBe(1);
    expect(ruleHits(file, inString, 'no-console-log')).toBe(1);
  });

  it('flags console reached through window, globalThis or self', () => {
    const content = 'window.console.log("a");\nglobalThis.console.error("b");\nself.console.warn("c");';
    expect(ruleHits('/repo/apps/web/src/a.ts', content, 'no-console-log')).toBe(3);
  });
});

describe('no-hardcoded-hex-colors scope', () => {
  const HEX = 'export const accent = "#3d5a45";';

  it.each([
    '/repo/design-system/tokens/colors.ts',
    '/repo/design-system/dist/tokens.ts',
    '/repo/apps/web/src/config/persona-colors.generated.ts',
  ])('ignores token sources and generated files: %s', (file) => {
    expect(ruleHits(file, HEX, 'no-hardcoded-hex-colors')).toBe(0);
  });

  it.each(['/repo/apps/web/src/ui/button.ts', '/repo/design-system/components/card.ts'])(
    'flags hex in UI code: %s',
    (file) => {
      expect(ruleHits(file, HEX, 'no-hardcoded-hex-colors')).toBe(1);
    }
  );
});

describe('no-purple-colors scope', () => {
  it('ignores generated files but flags UI code', () => {
    const content = 'const c = "#8b5cf6";';
    expect(ruleHits('/repo/apps/web/src/config/x.generated.ts', content, 'no-purple-colors')).toBe(0);
    expect(ruleHits('/repo/apps/web/src/ui/x.ts', content, 'no-purple-colors')).toBeGreaterThan(0);
  });
});

describe('no-emoji-in-ui and logging calls', () => {
  const FILE = '/repo/src/services/app.ts';
  const emoji = (content: string): number => ruleHits(FILE, content, 'no-emoji-in-ui');

  it.each([
    "log.info('🎯 done');",
    'logger.warn(`⚠️ ${x}`);',
    "console.error('❌', e);",
    "process.stderr.write('✅ ok');",
    "this.log.warn('⚠️ careful');",
    "getLogger().info('🧠 loaded');",
    "log.info('(🎯');",
    'logger.debug({ data: transform("input") }, "✅ ok");',
  ])('skips emoji inside a log call: %s', (line) => {
    expect(emoji(line)).toBe(0);
  });

  it('skips emoji on a continuation line of a multi-line log call', () => {
    const content = "log.info(\n  { userId },\n  '🚀 session started'\n);";
    expect(emoji(content)).toBe(0);
  });

  it.each([
    "button.textContent = '🎯 Start';",
    "toast.success('🎉 Saved');",
    "dialog.show('🎉 Hi');",
    "blog.post('🎉 Hi');",
    "catalog.info('🎉');",
    "const msg = '🎉 Saved'; log.info(msg);",
    "log.info('a'); el.title = '🎉';",
  ])('flags emoji outside a log call: %s', (line) => {
    expect(emoji(line)).toBe(1);
  });

  it.each(["ui.log.show('🎉 Done');", 'renderer.log.append(`<span>🎉</span>`);'])(
    'flags emoji passed to a non-logging method on a log-named receiver: %s',
    (line) => {
      expect(emoji(line)).toBe(1);
    }
  );

  it('does not let an unclosed log call hide the rest of the file', () => {
    const content = "console.log(x.replace(/'/g, ''));\nel.title = '🎉';\nbtn.textContent = '✨ New';";
    expect(emoji(content)).toBe(2);
  });

  it('checks Nunjucks templates for emoji', () => {
    expect(ruleHits('/repo/apps/website/ferni-website/src/index.njk', '<h2>🎉 Hello</h2>', 'no-emoji-in-ui')).toBe(1);
  });

  it('flags emoji after a multi-line log call has closed', () => {
    const content = "log.info(\n  'ready'\n);\nreturn '👆 Click here';";
    expect(emoji(content)).toBe(1);
  });

  it('keeps the single-line helper in step with the rule', () => {
    const line = "log.info('a'); el.title = '🎉'";
    expect(isEmojiInLoggingCall(line, line.indexOf('🎉'))).toBe(false);
    expect(isEmojiInLoggingCall("log.info('🎯')", 10)).toBe(true);
  });
});

describe('button-needs-aria-label', () => {
  const FILE = '/repo/apps/website/ferni-website/src/index.njk';
  const hits = (content: string): number => ruleHits(FILE, content, 'button-needs-aria-label');

  it.each([
    '<button class="cta">Join the waitlist</button>',
    '<button class="cta">\n  <svg viewBox="0 0 24 24"><path d="M0 0"/></svg>\n  Retake Quiz\n</button>',
    '<button aria-label="Close"><svg><path d="M0 0"/></svg></button>',
    '<button aria-labelledby="t1"><svg></svg></button>',
    '<button><span class="sr-only">Play sample</span><svg></svg></button>',
    '<button>{{ cta.label }}</button>',
    'html += `<button class="opt">${option.text}</button>`;',
  ])('treats a named button as fine: %s', (content) => {
    expect(hits(content)).toBe(0);
  });

  it('flags an icon-only button with no name, at the line it starts', () => {
    const content = '<div>\n<button class="close">\n  <svg viewBox="0 0 24 24"><path d="M0 0"/></svg>\n</button>\n</div>';
    const errors = lintFile(FILE, content).filter((e) => e.rule === 'button-needs-aria-label');
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });
});

describe('file globs', () => {
  it('lints the public website', () => {
    expect(INCLUDE_PATTERNS.some((p) => p.startsWith('apps/website/ferni-website/src/'))).toBe(true);
  });

  it('anchors exclude globs at path segments', () => {
    expect(globToRegExp('scripts/**').test('apps/web/scripts/x.ts')).toBe(true);
    expect(globToRegExp('scripts/**').test('src/memory/transcripts/x.ts')).toBe(false);
    expect(globToRegExp('**/logger.ts').test('apps/web/src/utils/logger.ts')).toBe(true);
    expect(globToRegExp('**/logger.ts').test('apps/web/src/utils/mylogger.ts')).toBe(false);
    expect(globToRegExp('**/*.generated.*').test('a/b/colors.generated.ts')).toBe(true);
  });
});
