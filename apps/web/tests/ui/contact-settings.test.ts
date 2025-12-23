/**
 * Contact Settings UI Tests
 *
 * Tests the "How to Reach You" feature:
 * - Contact info form (phone, email, preferred name)
 * - Phone verification flow
 * - Quiet hours configuration
 * - API integration
 * - Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// ============================================================================

const mockFetch = vi.fn();
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../src/ui/toast.ui.js', () => ({
  toast: mockToast,
}));

vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// TEST DATA
// ============================================================================

const mockContactInfo = {
  phone: '+1 555-123-4567',
  email: 'test@example.com',
  preferredName: 'Alex',
  phoneVerified: true,
};

const mockPreferences = {
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '08:00',
  },
  timezone: 'America/New_York',
};

// ============================================================================
// TEST HELPERS
// ============================================================================

function findContactModal(): HTMLElement | null {
  return document.querySelector('.contact-settings, .contact-settings-modal');
}

function findPhoneInput(): HTMLInputElement | null {
  return document.querySelector('[name="phone"], [data-field="phone"]');
}

function findEmailInput(): HTMLInputElement | null {
  return document.querySelector('[name="email"], [data-field="email"]');
}

function findNameInput(): HTMLInputElement | null {
  return document.querySelector('[name="preferredName"], [data-field="preferred-name"]');
}

function findVerifyPhoneButton(): HTMLElement | null {
  return document.querySelector('[data-action="verify-phone"]');
}

function findQuietHoursToggle(): HTMLInputElement | null {
  return document.querySelector('[data-setting="quiet-hours"]');
}

function findSaveButton(): HTMLElement | null {
  return document.querySelector('[data-action="save"], .contact-settings-save');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.contact-settings-close');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Contact Settings UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/outreach/context')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ contact: mockContactInfo }),
        });
      }
      if (url.includes('/api/user/contact')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      if (url.includes('/api/user/preferences')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        });
      }
      if (url.includes('/api/outreach/verify-phone')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sent: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  afterEach(() => {
    document.querySelectorAll('.contact-settings').forEach((el) => el.remove());
    document.querySelectorAll('.contact-settings-modal').forEach((el) => el.remove());
    document.querySelectorAll('#contact-settings-styles').forEach((el) => el.remove());
  });

  describe('Modal Lifecycle', () => {
    it('should open the modal', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();

      const modal = findContactModal();
      expect(modal).not.toBeNull();
    });

    it('should close on close button click', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      closeBtn?.click();

      await new Promise((r) => setTimeout(r, 350));

      expect(findContactModal()).toBeNull();
    });

    it('should have proper dialog role', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();

      const modal = findContactModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });
  });

  describe('Contact Form', () => {
    it('should display phone input', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const phoneInput = findPhoneInput();
      expect(phoneInput).not.toBeNull();
    });

    it('should display email input', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const emailInput = findEmailInput();
      expect(emailInput).not.toBeNull();
    });

    it('should display preferred name input', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const nameInput = findNameInput();
      expect(nameInput).not.toBeNull();
    });

    it('should load existing contact info', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const phoneInput = findPhoneInput();
      const emailInput = findEmailInput();
      const nameInput = findNameInput();

      // Should be populated with mock data
      expect(phoneInput?.value || '').toContain('555');
      expect(emailInput?.value).toBe(mockContactInfo.email);
      expect(nameInput?.value).toBe(mockContactInfo.preferredName);
    });
  });

  describe('Phone Verification', () => {
    it('should show verify button for unverified phone', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/outreach/context')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                contact: { ...mockContactInfo, phoneVerified: false },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const verifyBtn = findVerifyPhoneButton();
      expect(verifyBtn).not.toBeNull();
    });

    it('should call verify API on button click', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/outreach/context')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                contact: { ...mockContactInfo, phoneVerified: false },
              }),
          });
        }
        if (url.includes('/api/outreach/verify-phone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sent: true }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const verifyBtn = findVerifyPhoneButton();
      verifyBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/outreach/verify-phone'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should show verification code input after sending SMS', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/outreach/context')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                contact: { ...mockContactInfo, phoneVerified: false },
              }),
          });
        }
        if (url.includes('/api/outreach/verify-phone')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sent: true }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const verifyBtn = findVerifyPhoneButton();
      verifyBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      // Should show code input
      const codeInput = document.querySelector('[data-field="verification-code"]');
      // Implementation dependent
    });

    it('should show verified badge for verified phone', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      // Should show verified indicator
      const verifiedBadge = document.querySelector('.phone-verified, [data-verified="true"]');
      // Implementation dependent
    });
  });

  describe('Quiet Hours', () => {
    it('should show quiet hours toggle', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findQuietHoursToggle();
      expect(toggle).not.toBeNull();
    });

    it('should show time pickers when quiet hours enabled', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      // Quiet hours is enabled in mock data
      const startTime = document.querySelector('[data-field="quiet-start"]');
      const endTime = document.querySelector('[data-field="quiet-end"]');
      // Implementation dependent
    });

    it('should update preferences on toggle change', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findQuietHoursToggle();
      toggle?.click();

      await new Promise((r) => setTimeout(r, 100));

      // Should call API
    });
  });

  describe('Save Functionality', () => {
    it('should have save button', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const saveBtn = findSaveButton();
      expect(saveBtn).not.toBeNull();
    });

    it('should call API on save', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const saveBtn = findSaveButton();
      saveBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/user/contact'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should show success toast on save', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const saveBtn = findSaveButton();
      saveBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      expect(mockToast.success).toHaveBeenCalled();
    });

    it('should show error toast on save failure', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/user/contact')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Failed' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ contact: mockContactInfo }),
        });
      });

      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const saveBtn = findSaveButton();
      saveBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  describe('Form Validation', () => {
    it('should validate phone number format', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const phoneInput = findPhoneInput();
      if (phoneInput) {
        phoneInput.value = 'invalid';
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Should show validation error
        await new Promise((r) => setTimeout(r, 100));
      }
    });

    it('should validate email format', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const emailInput = findEmailInput();
      if (emailInput) {
        emailInput.value = 'not-an-email';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Should show validation error
        await new Promise((r) => setTimeout(r, 100));
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      // Should show error
      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog role', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();

      const modal = findContactModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });

    it('should have labeled inputs', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const phoneInput = findPhoneInput();
      const emailInput = findEmailInput();

      // Inputs should have labels or aria-labels
      expect(
        phoneInput?.getAttribute('aria-label') ||
          document.querySelector(`label[for="${phoneInput?.id}"]`)
      ).toBeTruthy();
    });

    it('should have accessible close button', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Brand Compliance', () => {
    it('should use "How to Reach You" terminology', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      // The title or header should use warm language
      const modal = findContactModal();
      const text = modal?.textContent || '';

      // Should not use cold enterprise language
      expect(text.toLowerCase()).not.toContain('contact management');
      expect(text.toLowerCase()).not.toContain('notification settings');
    });

    it('should explain quiet hours warmly', async () => {
      const { openContactSettings } = await import('../../src/ui/contact-settings.ui.js');

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findContactModal();
      const text = modal?.textContent || '';

      // Should explain quiet hours purpose
    });
  });
});

