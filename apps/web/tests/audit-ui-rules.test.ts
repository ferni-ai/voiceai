/**
 * Every UI audit rule flags its true positive and passes a near miss.
 *
 * Three rules used a negative lookahead after `[^>]*` (`<img[^>]*(?!alt=)[^>]*>`), which can
 * never block a match, so they flagged every <img>, <button> and onClick. With the audit
 * gating CI, missingAltText would have failed correct images. A rule that matches everything,
 * or nothing, fails one side of its pair here.
 */
import { describe, expect, it } from 'vitest';
import { AUDIT_RULES, auditContent, readTag } from '../scripts/audit-ui.js';

interface Finding {
  rule: string;
}

function count(rule: string, content: string, file = 'example.tsx'): number {
  return (auditContent(content, file) as Finding[]).filter((f) => f.rule === rule).length;
}

// Test titles show the case, cut short (the long-file cases are 5000+ characters).
function label(content: string): string {
  const one = JSON.stringify(content);
  return one.length > 90 ? `${one.slice(0, 87)}...` : one;
}

// Large enough for missingMediaQuery, which only looks at files over 5000 characters.
const LONG_FILE_PADDING = `\nconst note = '${'x'.repeat(5000)}';\n`;

const CASES: Record<string, { flagged: string[]; passed: string[] }> = {
  missingAltText: {
    flagged: [
      '<img src="cat.png">',
      '<img src="cat.png" />',
      '<IMG SRC="cat.png">',
      '<img\n  src="cat.png"\n  className="hero"\n/>',
      '<img onLoad={() => setReady(true)} src="cat.png" />',
      '<img data-alt="A cat" src="cat.png" />',
      'const html = `<img src="${url}">`;',
    ],
    passed: [
      '<img src="cat.png" alt="A cat">',
      '<img alt="" src="divider.png" />',
      '<img src="cat.png" alt={caption} />',
      '<img onLoad={() => setReady(true)} alt="A cat" src="cat.png" />',
      '<img\n  src="cat.png"\n  className="hero"\n  alt="A cat"\n/>',
      '<img {...imageProps} />',
      '<Image src="cat.png" />',
      'const html = `<img src="${url}" alt="${caption}">`;',
      'const html = \'<img src="\' + url + \'" alt="Logo">\';',
    ],
  },
  missingAriaLabel: {
    flagged: ['<button><svg viewBox="0 0 8 8"></svg></button>', '<button class="close"></button>'],
    passed: [
      '<button>Save</button>',
      '<button aria-label="Close"><svg viewBox="0 0 8 8"></svg></button>',
      '<button aria-labelledby="dialog-title"></button>',
      '<button>{label}</button>',
      '<button><img src="x.png" alt="Close"></button>',
    ],
  },
  clickableWithoutRole: {
    flagged: ['<div onClick={open}>Open</div>', '<span onclick="open()">Open</span>'],
    passed: [
      '<button onClick={open}>Open</button>',
      '<div role="button" onClick={open}>Open</div>',
      '<Card onClick={open} />',
      '<div className="panel">Open</div>',
    ],
  },
  missingFocusStyles: {
    flagged: ['.link:hover { color: red; }'],
    passed: ['.link:hover { color: red; }\n.link:focus-visible { outline: 2px solid; }'],
  },
  missingLoadingState: {
    flagged: ['await loadProfile();'],
    passed: ['let isLoading = true;\nawait loadProfile();'],
  },
  missingErrorHandling: {
    flagged: ['save().catch(() => {});', 'save().catch(() => { });'],
    passed: ['save().catch((err) => { showError(err); });', 'save().then(() => {});'],
  },
  hardcodedPixelWidth: {
    flagged: ['.card { width: 480px; }'],
    passed: ['.card { width: 48px; }', '.card { width: 50%; }'],
  },
  missingMediaQuery: {
    flagged: [`el.style = 'color: red';${LONG_FILE_PADDING}`],
    passed: [
      `el.style = 'color: red';\nconst css = '@media (max-width: 600px) {}';${LONG_FILE_PADDING}`,
      "el.style = 'color: red';",
    ],
  },
  hardcodedZIndex: {
    flagged: ['.modal { z-index: 10; }'],
    passed: ['.modal { z-index: var(--z-modal); }'],
  },
  animatingExpensiveProperties: {
    flagged: ['.bar { animation: grow 1s; width: 10px; }'],
    passed: ['.bar { animation: fade 1s ease; }'],
  },
  missingWillChange: {
    flagged: ['.icon { transform: scale(1.1); }'],
    passed: ['.icon { opacity: 0.8; }'],
  },
  missingReducedMotion: {
    flagged: ['@keyframes spin { to { rotate: 1turn; } }'],
    passed: [
      '@keyframes spin { to { rotate: 1turn; } }\n@media (prefers-reduced-motion: reduce) { * { animation: none; } }',
    ],
  },
  inlineStyles: {
    flagged: ["<div style={{ color: 'red' }} />"],
    passed: ['<div style={styles.box} />'],
  },
  magicNumbers: {
    flagged: ['.card { margin: 8px; }'],
    passed: ['.card { margin: var(--space-2); }'],
  },
};

describe('UI audit rules', () => {
  for (const [rule, { flagged, passed }] of Object.entries(CASES)) {
    describe(rule, () => {
      it.each(flagged.map((c) => [label(c), c]))('flags %s', (_label, content) => {
        expect(count(rule, content)).toBeGreaterThan(0);
      });
      it.each(passed.map((c) => [label(c), c]))('passes %s', (_label, content) => {
        expect(count(rule, content)).toBe(0);
      });
    });
  }

  it('covers every rule the audit runs', () => {
    expect(Object.keys(AUDIT_RULES).sort()).toEqual(Object.keys(CASES).sort());
  });

  it('a comment line is not a finding', () => {
    expect(count('missingAltText', '// <img src="cat.png">')).toBe(0);
  });
});

describe('readTag', () => {
  it('reads past a ">" inside an expression or a string', () => {
    const tag = readTag('<img onLoad={() => a > b} title="x > y" alt="A" />', 0);
    expect(tag?.name).toBe('img');
    expect(tag?.attrs).toContain('alt=');
    expect(tag?.dynamic).toBe(false);
  });

  it('marks spread and interpolated attributes as dynamic', () => {
    expect(readTag('<img {...props} />', 0)?.dynamic).toBe(true);
    expect(readTag('<img ${attrs}>', 0)?.dynamic).toBe(true);
  });

  it('returns null for a tag that never closes', () => {
    expect(readTag('<img src="cat.png"', 0)).toBeNull();
  });
});
