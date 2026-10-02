import { describe, expect, it } from 'vitest';
import {
  isEmojiInLoggingCall,
  shouldCheckFile,
  lintFile,
  INCLUDE_PATTERNS,
  EXCLUDE_PATTERNS,
} from '../lint-brand.js';
import path from 'path';

describe('lint-brand scope changes', () => {
  describe('no-console-log exclusions', () => {
    const consoleLogRule = {
      id: 'no-console-log',
      exclude: [
        '**/logger.ts',
        '**/logger.js',
        'src/cli/**',
        'src/scripts/**',
        'scripts/**',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/tests/**',
      ],
      fileTypes: ['.ts', '.js'],
    };

    it('should NOT flag console.log in src/cli/', () => {
      expect(shouldCheckFile('/repo/src/cli/foo.ts', consoleLogRule as any)).toBe(false);
    });

    it('should NOT flag console.log in src/scripts/', () => {
      expect(shouldCheckFile('/repo/src/scripts/deploy.ts', consoleLogRule as any)).toBe(false);
    });

    it('should NOT flag console.log in scripts/', () => {
      expect(shouldCheckFile('/repo/scripts/foo.ts', consoleLogRule as any)).toBe(false);
    });

    it('should NOT flag console.log in src/services/__tests__/', () => {
      expect(shouldCheckFile('/repo/src/services/__tests__/x.test.ts', consoleLogRule as any)).toBe(false);
    });

    it('should FLAG console.log in src/services/', () => {
      expect(shouldCheckFile('/repo/src/services/foo.ts', consoleLogRule as any)).toBe(true);
    });

    it('should FLAG console.log in apps/web/src/ui/', () => {
      expect(shouldCheckFile('/repo/apps/web/src/ui/foo.ts', consoleLogRule as any)).toBe(true);
    });
  });

  describe('no-hardcoded-hex-colors exclusions', () => {
    const hexRule = {
      id: 'no-hardcoded-hex-colors',
      exclude: [
        '**/tokens.ts',
        '**/tokens.css',
        '**/design-tokens.css',
        'design-system/tokens/**',
        'design-system/dist/**',
        '**/*.generated.*',
      ],
      fileTypes: ['.ts', '.js'],
    };

    it('should NOT flag hex in design-system/tokens/', () => {
      expect(shouldCheckFile('/repo/design-system/tokens/colors.json', hexRule as any)).toBe(false);
    });

    it('should NOT flag hex in design-system/dist/', () => {
      expect(shouldCheckFile('/repo/design-system/dist/tokens.css', hexRule as any)).toBe(false);
    });

    it('should NOT flag hex in *.generated.* files', () => {
      expect(shouldCheckFile('/repo/apps/web/src/config/x.generated.ts', hexRule as any)).toBe(false);
    });

    it('should FLAG hex in apps/web/src/ui/', () => {
      expect(shouldCheckFile('/repo/apps/web/src/ui/foo.ts', hexRule as any)).toBe(true);
    });
  });

  describe('no-emoji-in-ui with logging detection', () => {
    it('should skip emoji in log.info()', () => {
      const line = "log.info('🎯 done')";
      expect(isEmojiInLoggingCall(line, line.indexOf('🎯'))).toBe(true);
    });

    it('should skip emoji in logger.warn() with template string', () => {
      const line = 'logger.warn(`⚠️ ${x}`)';
      expect(isEmojiInLoggingCall(line, line.indexOf('⚠️'))).toBe(true);
    });

    it('should skip emoji in console.error()', () => {
      const line = "console.error('❌', e)";
      expect(isEmojiInLoggingCall(line, line.indexOf('❌'))).toBe(true);
    });

    it('should skip emoji in process.stderr.write()', () => {
      const line = "process.stderr.write('✅ ok')";
      expect(isEmojiInLoggingCall(line, line.indexOf('✅'))).toBe(true);
    });

    it('should skip emoji on 2nd line inside multi-line call parens', () => {
      // Simulate multi-line by checking behavior - emoji at position is still within open paren
      const line = "log.info('start";
      const secondLineWithEmoji = " 🚀 end')";
      const combinedLine = line + secondLineWithEmoji;
      expect(isEmojiInLoggingCall(combinedLine, combinedLine.indexOf('🚀'))).toBe(true);
    });

    it('should FLAG emoji in button text content', () => {
      const line = "button.textContent = '🎯 Start'";
      expect(isEmojiInLoggingCall(line, line.indexOf('🎯'))).toBe(false);
    });

    it('should FLAG emoji in const assignment', () => {
      const line = "const label = '✨ New'";
      expect(isEmojiInLoggingCall(line, line.indexOf('✨'))).toBe(false);
    });

    it('should FLAG emoji after closed log call on same line', () => {
      const line = "log.info('a'); el.title = '🎉'";
      expect(isEmojiInLoggingCall(line, line.indexOf('🎉'))).toBe(false);
    });
  });

  describe('include/exclude patterns', () => {
    it('should include apps/website/ferni-website files', () => {
      expect(INCLUDE_PATTERNS.join('|')).toContain('apps/website/ferni-website');
    });

    it('should exclude node_modules', () => {
      expect(EXCLUDE_PATTERNS.join('|')).toContain('node_modules');
    });

    it('should exclude dist', () => {
      expect(EXCLUDE_PATTERNS.join('|')).toContain('dist');
    });

    it('should exclude __tests__ directories', () => {
      expect(EXCLUDE_PATTERNS.join('|')).toContain('__tests__');
    });

    it('should not match node_modules files', () => {
      const testPath = '/repo/node_modules/some-lib/index.ts';
      // Check if any exclude pattern matches
      const isExcluded = EXCLUDE_PATTERNS.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(testPath);
      });
      expect(isExcluded).toBe(true);
    });

    it('should not match _site files', () => {
      const testPath = '/repo/_site/index.html';
      // _site is not in exclude patterns (it's a different check), but dist is similar
      expect(EXCLUDE_PATTERNS.join('|')).not.toContain('_site');
    });
  });

  describe('lintFile integration with scope changes', () => {
    it('should not flag console.log in CLI code', () => {
      const content = 'console.log("test");';
      const errors = lintFile('/repo/src/cli/index.ts', content);
      const consoleErrors = errors.filter(e => e.rule === 'no-console-log');
      expect(consoleErrors.length).toBe(0);
    });

    it('should flag console.log in app code', () => {
      const content = 'console.log("test");';
      const errors = lintFile('/repo/src/services/app.ts', content);
      const consoleErrors = errors.filter(e => e.rule === 'no-console-log');
      expect(consoleErrors.length).toBeGreaterThan(0);
    });

    it('should not flag emoji in logging calls', () => {
      const content = 'log.info("Ready 🚀");';
      const errors = lintFile('/repo/src/services/app.ts', content);
      const emojiErrors = errors.filter(e => e.rule === 'no-emoji-in-ui');
      expect(emojiErrors.length).toBe(0);
    });

    it('should flag emoji in user-facing strings', () => {
      const content = 'return "Click here 👆";';
      const errors = lintFile('/repo/src/services/app.ts', content);
      const emojiErrors = errors.filter(e => e.rule === 'no-emoji-in-ui');
      expect(emojiErrors.length).toBeGreaterThan(0);
    });

    it('should not flag hex in design-system tokens', () => {
      const content = 'export const colors = { primary: "#3d5a45" };';
      const errors = lintFile('/repo/design-system/tokens/colors.json', content);
      const hexErrors = errors.filter(e => e.rule === 'no-hardcoded-hex-colors');
      expect(hexErrors.length).toBe(0);
    });

    it('should flag hex in UI code', () => {
      const content = 'const color = "#ff0000";';
      const errors = lintFile('/repo/apps/web/src/ui/Button.ts', content);
      const hexErrors = errors.filter(e => e.rule === 'no-hardcoded-hex-colors');
      expect(hexErrors.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle emoji in logger.debug with multiple parens', () => {
      const line = 'logger.debug({ data: transform("input") }, "Status: ✅")';
      expect(isEmojiInLoggingCall(line, line.indexOf('✅'))).toBe(true);
    });

    it('should handle emoji outside call that looks similar', () => {
      const line = 'const emoji = "🎯"; process.log(emoji)';
      // The emoji at index of "🎯" is NOT in a logging call
      expect(isEmojiInLoggingCall(line, line.indexOf('🎯'))).toBe(false);
    });

    it('should handle console.log with nested calls', () => {
      const line = 'console.log(format("Value: 🔧"))';
      expect(isEmojiInLoggingCall(line, line.indexOf('🔧'))).toBe(true);
    });
  });
});
