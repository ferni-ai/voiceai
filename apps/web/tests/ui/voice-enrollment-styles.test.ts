/**
 * Regression: showVoiceEnrollmentModal() removed the stylesheet that
 * initVoiceEnrollmentUI() injected (its orphan cleanup deletes
 * #voice-enrollment-styles) and never put it back, so the "Let me learn your
 * voice" modal rendered unstyled, in the page flow.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/voice-auth.service.js', () => ({
  getVoiceAuthService: () => ({
    getStatus: () => Promise.resolve({ available: true, features: { enrollment: true } }),
    getProfile: () => Promise.resolve({ enrolled: false }),
    cancelEnrollment: () => Promise.resolve(),
  }),
}));

import {
  hideVoiceEnrollmentModal,
  initVoiceEnrollmentUI,
  showVoiceEnrollmentModal,
} from '@/ui/voice-enrollment.ui.js';

describe('voice enrollment modal styles', () => {
  it('keeps its stylesheet after show(), so the overlay is fixed over the page', async () => {
    initVoiceEnrollmentUI();
    expect(document.getElementById('voice-enrollment-styles')).not.toBeNull();

    await showVoiceEnrollmentModal();
    expect(document.getElementById('voice-enrollment-styles')).not.toBeNull();
    const overlay = document.querySelector('.voice-enrollment-modal');
    expect(overlay).not.toBeNull();
    expect(getComputedStyle(overlay as Element).position).toBe('fixed');

    hideVoiceEnrollmentModal();
  });
});
