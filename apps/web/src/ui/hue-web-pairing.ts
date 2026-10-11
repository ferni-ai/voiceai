/**
 * Philips Hue pairing guard for the web app.
 *
 * Local Hue pairing talks to the bridge at `http://<bridge-ip>/api`. From an
 * HTTPS page the browser blocks that request as mixed content, so pairing can
 * never succeed there. The server has no Hue cloud (remote API) pairing path
 * yet, so on HTTPS we show an honest notice instead of starting a doomed flow.
 */

import { t } from '../i18n/index.js';

/** True when this page can reach a Hue bridge over plain HTTP on the LAN. */
export function canPairHueLocally(protocol: string = globalThis.location?.protocol ?? ''): boolean {
  return protocol !== 'https:';
}

/** Renders the "Hue can't be connected from the web yet" notice into `container`. */
export function renderHueWebUnavailable(container: HTMLElement): void {
  const content = document.createElement('div');
  content.className = 'smart-home-settings__step-content';
  content.setAttribute('data-hue-web-unavailable', '');

  const title = document.createElement('h4');
  title.className = 'smart-home-settings__step-title';
  title.textContent = t('smarthome.hueSetup.webUnavailableTitle');
  content.appendChild(title);

  const text = document.createElement('p');
  text.className = 'smart-home-settings__step-description';
  text.textContent = t('smarthome.hueSetup.webUnavailableText');
  content.appendChild(text);

  container.appendChild(content);
}
