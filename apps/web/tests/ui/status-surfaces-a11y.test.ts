/**
 * Accessibility of the status surfaces around the avatar.
 *
 * - The viewport must allow pinch zoom (WCAG 1.4.4 Resize Text).
 * - The status whisper's text must use the persona's on-primary token, not the
 *   theme text colour (dark #2c2520 on persona green was ~2.4:1 in light theme).
 * - Status surfaces that are faded out (opacity 0) are hidden from assistive
 *   tech until shown.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';

const indexHtml = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

describe('index.html viewport', () => {
  const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(indexHtml)?.[1] ?? '';

  it('allows pinch zoom', () => {
    expect(viewport).toContain('width=device-width');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
    expect(viewport).not.toMatch(/maximum-scale/);
  });

  it('starts the thinking float hidden from assistive tech', () => {
    expect(indexHtml).toMatch(/id="thinkingFloat" aria-hidden="true"/);
  });
});

describe('status whisper', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="coach"><div id="coachAvatar"></div></div>';
  });

  it('uses the persona on-primary token at 13px or larger', async () => {
    const feedback = await import('../../src/ui/avatar-feedback.ui.js');
    feedback.initAvatarFeedback();
    const whisper = document.getElementById('statusWhisper');
    expect(whisper).not.toBeNull();
    const css = whisper?.getAttribute('style') ?? '';
    expect(css).toContain('color: var(--persona-on-primary');
    expect(css).toContain('font-size: var(--text-sm');
    expect(css).not.toContain('font-size: 11px');

    feedback.whisperStatus('Connected', 'info', 0);
    expect(whisper?.style.color).toContain('--persona-on-primary');
    feedback.whisperStatus('Something broke', 'error', 0);
    expect(whisper?.style.color).toContain('--color-text-inverse');
  });
});

describe('thinking float', () => {
  it('is aria-hidden while hidden and exposed while shown', async () => {
    document.body.innerHTML =
      '<div id="coach"><div class="thinking-float" id="thinkingFloat" aria-hidden="true">' +
      '<span class="thinking-text"></span></div></div>';
    const thinking = await import('../../src/ui/thinking.ui.js');
    thinking.initThinkingUI();
    const float = document.getElementById('thinkingFloat');

    thinking.show('Thinking');
    expect(float?.hasAttribute('aria-hidden')).toBe(false);
    thinking.hide();
    expect(float?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('connection quality indicator', () => {
  it('is aria-hidden while hidden and exposed while shown', async () => {
    document.body.innerHTML = '';
    const cq = await import('../../src/ui/connection-quality.ui.js');
    cq.initConnectionQuality();
    const el = document.querySelector('.connection-quality');
    expect(el?.getAttribute('aria-hidden')).toBe('true');

    cq.show();
    expect(el?.hasAttribute('aria-hidden')).toBe(false);
    expect(el?.classList.contains('connection-quality--visible')).toBe(true);

    cq.hide();
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.classList.contains('connection-quality--visible')).toBe(false);
    cq.disposeConnectionQuality();
  });
});
