import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '../src/i18n/index.js';
import { bindStaticDom, translateStaticDom } from '../src/i18n/static-dom.js';

afterEach(async () => {
  document.body.innerHTML = '';
  await setLocale('en-US', { reload: false });
});

function markup(): HTMLElement {
  document.body.innerHTML = `
    <span id="text" data-i18n="common.connect">Connect</span>
    <button id="attrs" aria-label="Mute microphone" title="Mute (M)"
      data-i18n-aria-label="accessibility.muteMicrophone" data-i18n-title="accessibility.muteShortcut"></button>`;
  return document.body;
}

describe('static index.html translation', () => {
  it('replaces marked text and attributes with the current locale', async () => {
    markup();
    await setLocale('de', { reload: false });
    translateStaticDom();
    const text = document.getElementById('text')!.textContent;
    expect(text).toBe(t('common.connect'));
    expect(text).not.toBe('Connect');
    const button = document.getElementById('attrs')!;
    expect(button.getAttribute('aria-label')).toBe(t('accessibility.muteMicrophone'));
    expect(button.getAttribute('title')).toBe(t('accessibility.muteShortcut'));
  });

  it('follows later locale changes once bound', async () => {
    markup();
    const unbind = bindStaticDom();
    await setLocale('fr', { reload: false });
    expect(document.getElementById('text')!.textContent).toBe(t('common.connect'));
    unbind();
  });
});
