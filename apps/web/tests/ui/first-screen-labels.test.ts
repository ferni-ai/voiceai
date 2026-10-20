/**
 * The first screen after sign-in: its one button says what it does ("Talk to
 * Ferni", not "Connect"), and the blocked-microphone help matches the device.
 * New-person hunt, 2026-10-18.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/index.js';
import { micHelpText } from '../../src/ui/call-status.ui.js';

const LOCALES = join(__dirname, '..', '..', 'src', 'i18n', 'locales');
const locale = (code: string): { entrance: { connectToTalk: string } } =>
  JSON.parse(readFileSync(join(LOCALES, `${code}.json`), 'utf8'));

describe('the talk button', () => {
  it('says "Talk to Ferni" in English, before and after translations load', () => {
    expect(t('entrance.connectToTalk')).toBe('Talk to Ferni');
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).toContain('data-i18n="entrance.connectToTalk">Talk to Ferni</span>');
  });

  it('names Ferni in every locale instead of "connect"', () => {
    for (const code of [
      'en-US',
      'en-GB',
      'es',
      'fr',
      'de',
      'ja',
      'ko',
      'zh-Hans',
      'zh-Hant',
      'ar',
      'he',
    ]) {
      const label = locale(code).entrance.connectToTalk;
      expect(label, code).toContain('Ferni');
      expect(label, code).not.toMatch(/^connect$/i);
    }
  });
});

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('blocked-microphone help', () => {
  it('points iPhone Safari at the aA menu', () => {
    const help = micHelpText(UA.iphoneSafari, 5);
    expect(help).toMatch(/aA/);
    expect(help).toMatch(/Website Settings/);
    expect(help).not.toMatch(/left of the address bar/);
  });

  it('treats an iPad (which reports a Mac) as iOS when it has touch', () => {
    expect(micHelpText(UA.ipadSafari, 5)).toBe(t('entrance.micHelpIosSafari'));
    expect(micHelpText(UA.ipadSafari, 0)).toBe(t('entrance.micHelpDesktop'));
  });

  it('points other iPhone browsers at iOS Settings', () => {
    expect(micHelpText(UA.iphoneChrome, 5)).toBe(t('entrance.micHelpIos'));
    expect(t('entrance.micHelpIos')).toMatch(/Settings/);
  });

  it('points Android at the address-bar icon and Permissions', () => {
    const help = micHelpText(UA.androidChrome, 5);
    expect(help).toMatch(/Permissions/);
    expect(help).not.toMatch(/aA/);
  });

  it('keeps the desktop steps on a computer', () => {
    expect(micHelpText(UA.macChrome, 0)).toMatch(/site settings/);
  });

  it('gives each platform its own steps', () => {
    const all = [
      micHelpText(UA.iphoneSafari, 5),
      micHelpText(UA.iphoneChrome, 5),
      micHelpText(UA.androidChrome, 5),
      micHelpText(UA.macChrome, 0),
    ];
    expect(new Set(all).size).toBe(4);
  });
});
