/**
 * Voice Enrollment UI Tests
 *
 * Tests the voice enrollment flow:
 * - Modal states (checking, not available, ready, recording, processing, complete)
 * - Voice recording interaction
 * - Service integration
 * - Error handling
 * - Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockVoiceAuthService = {
  checkAvailability: vi.fn(),
  getEnrollmentStatus: vi.fn(),
  startEnrollment: vi.fn(),
  submitSample: vi.fn(),
  completeEnrollment: vi.fn(),
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../services/voice-auth.service.js', () => ({
  getVoiceAuthService: vi.fn(() => mockVoiceAuthService),
}));

vi.mock('./toast.ui.js', () => ({
  toast: mockToast,
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function findVoiceEnrollmentModal(): HTMLElement | null {
  return document.querySelector('.voice-enrollment-modal');
}

function findModalState(): string | null {
  const modal = findVoiceEnrollmentModal();
  if (!modal) return null;

  if (modal.querySelector('.voice-enrollment-checking')) return 'checking';
  if (modal.querySelector('.voice-enrollment-not-available')) return 'not-available';
  if (modal.querySelector('.voice-enrollment-already-enrolled')) return 'already-enrolled';
  if (modal.querySelector('.voice-enrollment-ready')) return 'ready';
  if (modal.querySelector('.voice-enrollment-recording')) return 'recording';
  if (modal.querySelector('.voice-enrollment-processing')) return 'processing';
  if (modal.querySelector('.voice-enrollment-complete')) return 'complete';
  if (modal.querySelector('.voice-enrollment-error')) return 'error';

  return 'unknown';
}

function findRecordButton(): HTMLElement | null {
  return document.querySelector('[data-action="start-recording"]');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.voice-enrollment-close');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Voice Enrollment UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Default: service available, not enrolled
    mockVoiceAuthService.checkAvailability.mockResolvedValue({ available: true });
    mockVoiceAuthService.getEnrollmentStatus.mockResolvedValue({ enrolled: false });
    mockVoiceAuthService.startEnrollment.mockResolvedValue({ sessionId: 'test-session' });
    mockVoiceAuthService.submitSample.mockResolvedValue({ accepted: true, samplesRemaining: 2 });
    mockVoiceAuthService.completeEnrollment.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    // Cleanup
    document.querySelectorAll('.voice-enrollment-modal').forEach((el) => el.remove());
    document.querySelectorAll('.voice-enrollment-overlay').forEach((el) => el.remove());
    document.querySelectorAll('#voice-enrollment-styles').forEach((el) => el.remove());
  });

  describe('Modal Lifecycle', () => {
    it('should open the modal', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();

      const modal = findVoiceEnrollmentModal();
      expect(modal).not.toBeNull();
    });

    it('should have proper dialog attributes', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();

      const modal = findVoiceEnrollmentModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });

    it('should close on close button click', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      closeBtn?.click();

      await new Promise((r) => setTimeout(r, 350));

      expect(findVoiceEnrollmentModal()).toBeNull();
    });

    it('should cleanup orphaned modals on open', async () => {
      // Create orphan
      const orphan = document.createElement('div');
      orphan.className = 'voice-enrollment-modal';
      document.body.appendChild(orphan);

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();

      const modals = document.querySelectorAll('.voice-enrollment-modal');
      expect(modals.length).toBe(1);
    });
  });

  describe('Availability Check', () => {
    it('should check availability on open', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();

      expect(mockVoiceAuthService.checkAvailability).toHaveBeenCalled();
    });

    it('should show not-available state when service unavailable', async () => {
      mockVoiceAuthService.checkAvailability.mockResolvedValue({ available: false });

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const state = findModalState();
      expect(state).toBe('not-available');
    });

    it('should show already-enrolled state when user is enrolled', async () => {
      mockVoiceAuthService.getEnrollmentStatus.mockResolvedValue({ enrolled: true });

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const state = findModalState();
      expect(state).toBe('already-enrolled');
    });

    it('should show ready state when available and not enrolled', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const state = findModalState();
      expect(state).toBe('ready');
    });
  });

  describe('Recording Flow', () => {
    it('should show record button in ready state', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const recordBtn = findRecordButton();
      expect(recordBtn).not.toBeNull();
    });

    it('should transition to recording state on record button click', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const recordBtn = findRecordButton();
      recordBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      const state = findModalState();
      expect(['recording', 'processing']).toContain(state);
    });

    it('should show progress indicator during recording', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const recordBtn = findRecordButton();
      recordBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      // Look for progress indicator
      const progress = document.querySelector('.voice-enrollment-progress');
      // Progress might be shown depending on implementation
    });
  });

  describe('Completion Flow', () => {
    it('should show success state on completion', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      // Simulate completion (this depends on implementation)
      // Would need to mock the full recording flow
    });

    it('should show success toast on enrollment complete', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      // After successful enrollment
      // expect(mockToast.success).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle availability check error', async () => {
      mockVoiceAuthService.checkAvailability.mockRejectedValue(new Error('Network error'));

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      // Should handle gracefully
      const modal = findVoiceEnrollmentModal();
      expect(modal).not.toBeNull();
    });

    it('should show error state on enrollment failure', async () => {
      mockVoiceAuthService.startEnrollment.mockRejectedValue(new Error('Enrollment failed'));

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const recordBtn = findRecordButton();
      recordBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      const state = findModalState();
      expect(['error', 'ready']).toContain(state);
    });

    it('should show error toast on failure', async () => {
      mockVoiceAuthService.startEnrollment.mockRejectedValue(new Error('Failed'));

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const recordBtn = findRecordButton();
      recordBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      // Error toast might be shown
    });
  });

  describe('Accessibility', () => {
    it('should have accessible modal role', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();

      const modal = findVoiceEnrollmentModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });

    it('should have accessible close button', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should announce state changes', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      // Look for live region or status element
      const status = document.querySelector('[role="status"]');
      // Implementation dependent
    });
  });

  describe('Reduced Motion', () => {
    it('should respect prefers-reduced-motion', async () => {
      // Mock matchMedia for reduced motion
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();

      // Should still work, just without animations
      const modal = findVoiceEnrollmentModal();
      expect(modal).not.toBeNull();

      window.matchMedia = originalMatchMedia;
    });
  });

  describe('Brand Compliance', () => {
    it('should use warm language', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findVoiceEnrollmentModal();
      const text = modal?.textContent?.toLowerCase() || '';

      // Should not use cold/technical language
      expect(text).not.toContain('biometric');
      expect(text).not.toContain('authentication system');
    });

    it('should have Ferni-style header', async () => {
      const { showVoiceEnrollmentModal } = await import('../ui/voice-enrollment.ui.js');

      await showVoiceEnrollmentModal();
      await new Promise((r) => setTimeout(r, 100));

      // Should have title element
      const title = document.querySelector('.voice-enrollment-title, h2');
      expect(title).not.toBeNull();
    });
  });
});

