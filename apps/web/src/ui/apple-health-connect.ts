/**
 * Apple Health lives on the iPhone: the server's connect URL is the
 * ferniapp://healthkit/authorize deep link into the Ferni iOS app. Following it
 * from a desktop or Android browser goes nowhere, so off iOS we say where to
 * set it up instead of navigating.
 */

import { t } from '../i18n/index.js';
import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';

const log = createLogger('AppleHealthConnect');

/** iPhone, iPad or iPod, including iPadOS which reports itself as a Mac with touch. */
export function isIOSDevice(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

export async function connectAppleHealth(): Promise<void> {
  if (!isIOSDevice()) {
    toast.info(t('wearableSettings.appleHealthOnIphone'));
    return;
  }
  try {
    const response = await apiPost<{ success: boolean; authUrl?: string }>('/api/wearable/connect', {
      provider: 'apple_health',
    });
    if (response.data?.success && response.data.authUrl) window.location.href = response.data.authUrl;
  } catch (error) {
    log.error('Failed to connect Apple Health:', error);
  }
}
