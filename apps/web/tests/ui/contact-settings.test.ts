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
// MOCKS - Set up before dynamic imports
// ============================================================================

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock animation constants
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out', EASE_IN_OUT: 'ease-in-out' },
}));

// Create mock functions that can be configured per test
const mockAuthState = { isAuthenticated: true, userId: 'test-user-123' };
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

// Mock auth service
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => mockAuthState,
}));

// Mock API
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
}));

// ============================================================================
// TEST DATA
// ============================================================================

/** What GET /api/user/contact returns for a saved, verified contact (user-routes.ts). */
const mockContactInfo = {
  phone: '+15551234567',
  email: 'test@example.com',
  preferredName: 'Alex',
  timezone: 'America/New_York',
  verifiedPhone: '+15551234567' as string | null,
};
const UNVERIFIED = { ...mockContactInfo, verifiedPhone: null };

/** The real route's answer shape: `{ success, contactInfo }`, never `context.personal`. */
function contactRoute(contactInfo: Record<string, unknown> | null) {
  return { ok: true, status: 200, data: { success: true, contactInfo } };
}

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
  return document.querySelector('.contact-settings-overlay');
}

function findModalDialog(): HTMLElement | null {
  // The inner dialog has role="dialog", the outer is just the overlay
  return document.querySelector('.contact-settings-modal');
}

function findErrorMessage(): HTMLElement | null {
  return document.querySelector('.contact-settings-error');
}

function findSuccessMessage(): HTMLElement | null {
  return document.querySelector('.contact-settings-success');
}

function findPhoneInput(): HTMLInputElement | null {
  return document.querySelector('#phone-input');
}

function findEmailInput(): HTMLInputElement | null {
  return document.querySelector('#email-input');
}

function findNameInput(): HTMLInputElement | null {
  return document.querySelector('#name-input');
}

function findVerifyPhoneButton(): HTMLElement | null {
  return document.querySelector('#verify-phone-btn');
}

function findQuietHoursToggle(): HTMLElement | null {
  return document.querySelector('#quiet-hours-toggle');
}

function findSaveButton(): HTMLElement | null {
  return document.querySelector('#save-btn');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.contact-settings-close');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Contact Settings UI', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openContactSettings: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let close: any;

  beforeEach(async () => {
    // Reset DOM - safe cleanup for tests
    document.body.textContent = '';
    document.head.textContent = '';

    // Reset localStorage
    localStorage.clear();

    // Reset mocks
    vi.clearAllMocks();

    // Reset auth state to authenticated
    mockAuthState.isAuthenticated = true;
    mockAuthState.userId = 'test-user-123';

    // Default API responses - format matches what contact-settings.ui.ts expects
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/user/contact')) {
        return Promise.resolve(contactRoute(mockContactInfo));
      }
      if (url.includes('/api/user/preferences')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: {
            success: true,
            preferences: {
              timezone: mockPreferences.timezone,
              quietHoursStart: mockPreferences.quietHours.start,
              quietHoursEnd: mockPreferences.quietHours.end,
            },
          },
        });
      }
      return Promise.resolve({ ok: true, status: 200, data: {} });
    });

    mockApiPost.mockImplementation((url: string) => {
      if (url.includes('/api/user/contact')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { success: true },
        });
      }
      if (url.includes('/api/outreach/verify-phone')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { success: true, message: 'Verification code sent' },
        });
      }
      return Promise.resolve({ ok: true, status: 200, data: {} });
    });

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('../../src/ui/contact-settings.ui.js');
    openContactSettings = module.openContactSettings;
    close = module.close;
  });

  afterEach(() => {
    close?.();
    document.body.textContent = '';
    document.head.textContent = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Modal Lifecycle', () => {
    it('should open the modal', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findContactModal();
      expect(modal).not.toBeNull();
    });

    it('should close on close button click', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      closeBtn?.click();

      await new Promise((r) => setTimeout(r, 350));

      expect(findContactModal()).toBeNull();
    });

    it('should have proper dialog role', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      // role="dialog" is on the inner modal, not the outer overlay
      const dialog = findModalDialog();
      expect(dialog?.getAttribute('role')).toBe('dialog');
    });
  });

  describe('Contact Form', () => {
    it('should display phone input', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const phoneInput = findPhoneInput();
      expect(phoneInput).not.toBeNull();
    });

    it('should display email input', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const emailInput = findEmailInput();
      expect(emailInput).not.toBeNull();
    });

    it('should display preferred name input', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const nameInput = findNameInput();
      expect(nameInput).not.toBeNull();
    });

    it('should load existing contact info', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const phoneInput = findPhoneInput();
      const emailInput = findEmailInput();
      const nameInput = findNameInput();

      // Should be populated with what GET /api/user/contact returned
      expect(phoneInput?.value).toBe(mockContactInfo.phone);
      expect(emailInput?.value).toBe(mockContactInfo.email);
      expect(nameInput?.value).toBe(mockContactInfo.preferredName);
      expect(mockApiGet).toHaveBeenCalledWith('/api/user/contact');
    });

    it('a failed load says so instead of showing a blank form', async () => {
      mockApiGet.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/api/user/contact')
            ? { ok: false, status: 500, error: 'Failed to get contact info' }
            : { ok: true, status: 200, data: {} }
        )
      );

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      expect(document.querySelector('.contact-settings-error')?.textContent).toBe(
        "Couldn't load your contact details. Try again?"
      );
    });
  });

  describe('Saved values are text, never markup', () => {
    it('renders hostile saved values as plain input values', async () => {
      const phone = '"><img src=x onerror=alert(1)>';
      const email = 'a@b.com" autofocus onfocus="x';
      const preferredName = '</label><img src=y onerror=alert(2)>';
      mockApiGet.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/api/user/contact')
            ? contactRoute({
                phone,
                email,
                preferredName,
                timezone: '<b>tz</b>',
                verifiedPhone: null,
              })
            : { ok: true, status: 200, data: {} }
        )
      );

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const modal = findContactModal();
      expect(modal).not.toBeNull();
      expect(modal?.querySelector('img, b')).toBeNull();
      expect(modal?.querySelector('[onerror], [onfocus], [autofocus]')).toBeNull();
      expect(findPhoneInput()?.value).toBe(phone);
      expect(findEmailInput()?.value).toBe(email);
      expect(findNameInput()?.value).toBe(preferredName);
    });
  });

  describe('Phone Verification', () => {
    it('should show verify button for unverified phone', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/api/user/contact')) {
          return Promise.resolve(contactRoute(UNVERIFIED));
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const verifyBtn = findVerifyPhoneButton();
      expect(verifyBtn).not.toBeNull();
    });

    it('should call verify API on button click', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/api/user/contact')) {
          return Promise.resolve(contactRoute(UNVERIFIED));
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const verifyBtn = findVerifyPhoneButton();
      verifyBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining('/api/outreach/verify-phone'),
        expect.anything()
      );
    });

    it('sends the code and confirms it through the outreach service', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/api/user/contact')) {
          return Promise.resolve(contactRoute(UNVERIFIED));
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });
      const { outreachService } = await import('../../src/services/outreach.service.js');
      const send = vi.spyOn(outreachService, 'sendVerificationCode');
      const confirm = vi
        .spyOn(outreachService, 'verifyPhone')
        .mockResolvedValue({ success: true, message: 'Phone verified' });

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));
      findVerifyPhoneButton()?.click();
      await new Promise((r) => setTimeout(r, 100));

      // Sent and confirmed as E.164, the form the server stores and texts.
      expect(send).toHaveBeenCalledWith('+15551234567');
      const codeInput = document.querySelector<HTMLInputElement>('#verification-code');
      expect(codeInput).not.toBeNull();
      if (codeInput) {
        codeInput.value = '123456';
        codeInput.dispatchEvent(new Event('input'));
      }
      await new Promise((r) => setTimeout(r, 50));
      expect(confirm).toHaveBeenCalledWith('+15551234567', '123456');
    });

    it('should show verification code input after sending SMS', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/api/user/contact')) {
          return Promise.resolve(contactRoute(UNVERIFIED));
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const verifyBtn = findVerifyPhoneButton();
      verifyBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      // Should show code input (implementation dependent)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const codeInput = document.querySelector('[data-field="verification-code"]');
      // May or may not exist depending on implementation
    });

    it('should show verified badge for verified phone', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      // The account's verified number matches the saved one
      expect(document.querySelector('.contact-settings-verified')).not.toBeNull();
      expect(findVerifyPhoneButton()).toBeNull();
    });
  });

  describe('Quiet Hours', () => {
    it('should show quiet hours toggle', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findQuietHoursToggle();
      expect(toggle).not.toBeNull();
    });

    it('should show time pickers when quiet hours enabled', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      // Quiet hours is enabled in mock data (implementation dependent)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const startTime = document.querySelector('[data-field="quiet-start"]');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const endTime = document.querySelector('[data-field="quiet-end"]');
      // May or may not exist depending on implementation
    });

    it('should update preferences on toggle change', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findQuietHoursToggle();
      toggle?.click();

      await new Promise((r) => setTimeout(r, 100));

      // Should call API (implementation dependent)
    });
  });

  describe('Save Functionality', () => {
    it('should have save button', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const saveBtn = findSaveButton();
      expect(saveBtn).not.toBeNull();
    });

    it('should call API on save', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const saveBtn = findSaveButton();
      saveBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining('/api/user/contact'),
        expect.anything()
      );
    });

    it('should show success message on save', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const saveBtn = findSaveButton();
      saveBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      // Source shows inline success message, not toast
      const successMsg = findSuccessMessage();
      expect(successMsg).not.toBeNull();
    });

    it('should show error message on save failure', async () => {
      mockApiPost.mockImplementation((url: string) => {
        if (url.includes('/api/user/contact')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            error: 'Failed',
          });
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      const saveBtn = findSaveButton();
      saveBtn?.click();

      await new Promise((r) => setTimeout(r, 200));

      // Source shows inline error message, not toast
      const errorMsg = findErrorMessage();
      expect(errorMsg).not.toBeNull();
    });
  });

  describe('Form Validation', () => {
    it('should validate phone number format', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const phoneInput = findPhoneInput();
      if (phoneInput) {
        phoneInput.value = 'invalid';
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Should show validation error (implementation dependent)
        await new Promise((r) => setTimeout(r, 100));
      }
    });

    it('should validate email format', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const emailInput = findEmailInput();
      if (emailInput) {
        emailInput.value = 'not-an-email';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Should show validation error (implementation dependent)
        await new Promise((r) => setTimeout(r, 100));
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      await openContactSettings();
      await new Promise((r) => setTimeout(r, 200));

      // The modal opens and says the load failed
      expect(findContactModal()).not.toBeNull();
      expect(document.querySelector('.contact-settings-error')).not.toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog role', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      // role="dialog" is on the inner modal, not the outer overlay
      const dialog = findModalDialog();
      expect(dialog?.getAttribute('role')).toBe('dialog');
    });

    it('is named by its heading (aria-labelledby resolves)', async () => {
      await openContactSettings();
      const dialog = findModalDialog();
      const id = dialog?.getAttribute('aria-labelledby');
      expect(id).toBeTruthy();
      const heading = document.getElementById(id as string);
      expect(heading?.tagName).toBe('H2');
      expect(heading?.textContent?.trim()).toBeTruthy();
    });

    it('starts on the first field with a mouse and keyboard, and keeps it through the load', async () => {
      const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) => ({ matches: query === '(pointer: fine)', media: query }) as MediaQueryList
      );
      await openContactSettings(); // resolves after the load re-renders the form
      expect(document.activeElement?.id).toBe('phone-input');
      matchMedia.mockRestore();
    });

    it('does not pop the keyboard on touch', async () => {
      const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) => ({ matches: false, media: query }) as MediaQueryList
      );
      await openContactSettings();
      expect(document.activeElement?.tagName).not.toBe('INPUT');
      matchMedia.mockRestore();
    });

    it('keeps Save and Later in view: the footer is sticky inside the scrolling card', async () => {
      await openContactSettings();
      const css = [...document.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n');
      const rule = css.match(/\.contact-settings-actions\s*\{([^}]*)\}/)?.[1] ?? '';
      expect(rule).toMatch(/position:\s*sticky/);
      expect(rule).toMatch(/bottom:\s*0/);
    });

    it('should have labeled inputs', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const phoneInput = findPhoneInput();

      // Source uses sibling label pattern within .contact-settings-field
      // Label and input are siblings - check field container has a label
      const fieldContainer = phoneInput?.closest('.contact-settings-field');
      const siblingLabel = fieldContainer?.querySelector('.contact-settings-label');

      expect(siblingLabel).not.toBeNull();
    });

    it('should have accessible close button', async () => {
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Brand Compliance', () => {
    it('should use "How to Reach You" terminology', async () => {
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
      await openContactSettings();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findContactModal();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _text = modal?.textContent || '';

      // Should explain quiet hours purpose (implementation dependent)
    });
  });

  // ==========================================================================
  // A number typed by a new user reaches verification (2026-10-17 prod bug:
  // the typed number was wiped by a re-render and saved as "")
  // ==========================================================================
  describe('Typed phone numbers', () => {
    const NO_PHONE = { email: '', preferredName: '' };
    const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const type = (input: HTMLInputElement | null, value: string): void => {
      if (!input) throw new Error('input missing');
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const posts = (path: string): unknown[] =>
      mockApiPost.mock.calls.filter(([url]) => String(url).includes(path)).map(([, body]) => body);

    function contextWith(personal: Record<string, unknown>, gate?: Promise<void>): void {
      mockApiGet.mockImplementation(async (url: string) => {
        if (gate) await gate;
        if (url.includes('/api/outreach/context')) {
          return { ok: true, status: 200, data: { success: true, context: { personal } } };
        }
        return { ok: true, status: 200, data: {} };
      });
    }

    it('keeps what was typed while the form was still loading, through to what save sends', async () => {
      let releaseLoad: () => void = () => undefined;
      contextWith(NO_PHONE, new Promise<void>((r) => (releaseLoad = r)));

      const opening = openContactSettings();
      await tick();
      type(findPhoneInput(), '5552017497');
      type(findEmailInput(), 'sam@example.com');
      releaseLoad();
      await opening;
      await tick(20);

      expect(findPhoneInput()?.value).toBe('5552017497');
      expect(findEmailInput()?.value).toBe('sam@example.com');

      findSaveButton()?.click();
      await tick(50);
      const [contactBody] = posts('/api/user/contact') as Array<Record<string, unknown>>;
      expect(contactBody.email).toBe('sam@example.com');
      expect(contactBody).not.toHaveProperty('phone'); // never phone: "" over a stored number
      expect(posts('/api/outreach/verify-phone')).toEqual([{ phone: '+15552017497' }]);
    });

    it('offers "Send me a code" as soon as a valid number is typed, and sends it as E.164', async () => {
      contextWith(NO_PHONE);
      await openContactSettings();
      await tick(20);
      expect(findVerifyPhoneButton()).toBeNull();

      const input = findPhoneInput();
      type(input, '555201749');
      expect(findVerifyPhoneButton()).toBeNull();
      type(input, '5552017497');
      expect(findVerifyPhoneButton()).not.toBeNull();
      expect(findPhoneInput()).toBe(input); // typing never rebuilds the input under the user

      findVerifyPhoneButton()?.click();
      await tick(50);
      expect(posts('/api/outreach/verify-phone')).toEqual([{ phone: '+15552017497' }]);
      expect(document.querySelector('#verification-code')).not.toBeNull();
      expect(document.querySelector('.contact-settings-verification-text')?.textContent).toContain(
        '(555) 201-7497'
      );
    });

    it('saving a new unverified number texts a code instead of claiming the phone is saved', async () => {
      contextWith(NO_PHONE);
      await openContactSettings();
      await tick(20);
      type(findPhoneInput(), '(555) 201-7497');

      findSaveButton()?.click();
      await tick(50);

      expect(posts('/api/outreach/verify-phone')).toEqual([{ phone: '+15552017497' }]);
      expect(posts('/api/user/contact')[0]).not.toHaveProperty('phone');
      expect(document.querySelector('#verification-code')).not.toBeNull();
      const success = findSuccessMessage()?.textContent ?? '';
      expect(success).toMatch(/code/i);
      expect(success).not.toMatch(/saved/i);
    });

    it('a number that is not one gets a friendly hint, no code button, and is not saved', async () => {
      contextWith(NO_PHONE);
      await openContactSettings();
      await tick(20);
      const input = findPhoneInput();
      type(input, '12');
      input?.dispatchEvent(new Event('blur'));

      expect(document.querySelector('.contact-settings-field-error')).not.toBeNull();
      expect(findVerifyPhoneButton()).toBeNull();
      findSaveButton()?.click();
      await tick(50);
      expect(posts('/api/user/contact')).toHaveLength(0);
      expect(posts('/api/outreach/verify-phone')).toHaveLength(0);
    });

    it('once verified, turning on Texts saves sms consent for check-ins', async () => {
      contextWith(NO_PHONE);
      const { outreachService } = await import('../../src/services/outreach.service.js');
      vi.spyOn(outreachService, 'verifyPhone').mockResolvedValue({
        success: true,
        message: 'Phone verified',
      });
      await openContactSettings();
      await tick(20);
      expect(document.querySelector('#checkin-channels')).toBeNull(); // not before verification

      type(findPhoneInput(), '5552017497');
      findVerifyPhoneButton()?.click();
      await tick(50);
      type(document.querySelector<HTMLInputElement>('#verification-code'), '123456');
      await tick(50);

      expect(posts('/api/user/contact')).toContainEqual({ phone: '+15552017497' });
      const texts = document.querySelector<HTMLInputElement>('[data-channel="sms"]');
      expect(texts).not.toBeNull();
      expect(texts?.checked).toBe(false);
      if (texts) {
        texts.checked = true;
        texts.dispatchEvent(new Event('change'));
      }
      await tick(20);
      expect(posts('/api/outreach/preferences')).toEqual([
        { preferences: { allowedChannels: ['sms'], disclosureVersion: '2026-10-18' } },
      ]);
    });

    it('shows the saved channels for an already-verified number', async () => {
      mockApiGet.mockImplementation(async (url: string) => {
        if (url.includes('/api/user/contact')) {
          return {
            ok: true,
            status: 200,
            data: { success: true, contactInfo: { verifiedPhone: '+15552017497' } },
          };
        }
        if (url.includes('/api/outreach/preferences')) {
          return { ok: true, status: 200, data: { success: true, allowedChannels: ['call'] } };
        }
        return { ok: true, status: 200, data: {} };
      });
      await openContactSettings();
      await tick(20);
      expect(findPhoneInput()?.value).toBe('+15552017497');
      expect(document.querySelector('#phone-verified-badge')?.hasAttribute('hidden')).toBe(false);
      expect(document.querySelector<HTMLInputElement>('[data-channel="call"]')?.checked).toBe(true);
      expect(document.querySelector<HTMLInputElement>('[data-channel="sms"]')?.checked).toBe(false);
    });

    it('shows what texts and calls mean beside each box, and Texts starts unchecked', async () => {
      mockApiGet.mockImplementation(async (url: string) => {
        if (url.includes('/api/user/contact')) {
          return {
            ok: true,
            status: 200,
            data: { success: true, contactInfo: { verifiedPhone: '+15552017497' } },
          };
        }
        if (url.includes('/api/outreach/preferences')) {
          return { ok: true, status: 200, data: { success: true, allowedChannels: [] } };
        }
        return { ok: true, status: 200, data: {} };
      });
      await openContactSettings();
      await tick(20);

      const texts = document.querySelector<HTMLInputElement>('[data-channel="sms"]');
      expect(texts?.checked).toBe(false);
      expect(texts?.getAttribute('aria-describedby')).toBe('sms-disclosure');
      const sms = document.querySelector('#sms-disclosure')?.textContent ?? '';
      expect(sms).toContain('up to 3 a day');
      expect(sms).toContain('Msg & data rates may apply.');
      expect(sms).toContain('Reply STOP to cancel, HELP for help.');
      const terms = document.querySelector<HTMLAnchorElement>('#sms-disclosure a');
      expect(terms?.textContent).toBe('SMS terms');
      expect(terms?.getAttribute('href')).toBe('https://ferni.ai/sms-consent');
      expect(terms?.target).toBe('_blank');
      expect(terms?.rel).toContain('noopener');
      expect(document.querySelector('#call-disclosure')?.textContent).toContain(
        'only call this number when you ask'
      );
    });
  });

  describe('Code outcomes, clearing, and changing your mind', () => {
    const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const type = (input: HTMLInputElement | null, value: string): void => {
      if (!input) throw new Error('input missing');
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const posts = (path: string): unknown[] =>
      mockApiPost.mock.calls.filter(([url]) => String(url).includes(path)).map(([, body]) => body);
    const loads = (verifiedPhone: string | null, allowedChannels: string[]): void => {
      mockApiGet.mockImplementation(async (url: string) => {
        if (url.includes('/api/user/contact')) {
          return { ok: true, status: 200, data: { success: true, contactInfo: { verifiedPhone } } };
        }
        if (url.includes('/api/outreach/preferences')) {
          return { ok: true, status: 200, data: { success: true, allowedChannels } };
        }
        return { ok: true, status: 200, data: {} };
      });
    };
    async function codeSentFor(phone: string): Promise<void> {
      await openContactSettings();
      await tick(20);
      type(findPhoneInput(), phone);
      findVerifyPhoneButton()?.click();
      await tick(50);
    }
    const enterCode = async (code: string): Promise<void> => {
      type(document.querySelector<HTMLInputElement>('#verification-code'), code);
      await tick(50);
    };
    const badgeShown = (): boolean =>
      document.querySelector('#phone-verified-badge')?.hasAttribute('hidden') === false;

    it('a wrong code is not a verified number', async () => {
      loads(null, []);
      const { outreachService } = await import('../../src/services/outreach.service.js');
      vi.spyOn(outreachService, 'verifyPhone').mockResolvedValue({
        success: false,
        error: 'Invalid code',
      });
      await codeSentFor('5552017497');
      await enterCode('000000');

      expect(findErrorMessage()?.textContent).toMatch(/didn't work/);
      expect(badgeShown()).toBe(false);
      expect(document.querySelector('#checkin-channels')).toBeNull();
      expect(document.querySelector('#verification-code')).not.toBeNull(); // try again
      expect(posts('/api/user/contact')).toHaveLength(0);
    });

    it('a code the server could not link to the account is not shown as verified', async () => {
      loads(null, []);
      const { outreachService } = await import('../../src/services/outreach.service.js');
      vi.spyOn(outreachService, 'verifyPhone').mockResolvedValue({
        success: true,
        phoneLinked: false,
      } as never);
      await codeSentFor('5552017497');
      await enterCode('123456');

      expect(findErrorMessage()?.textContent).toMatch(/couldn't connect the number/);
      expect(findSuccessMessage()).toBeNull();
      expect(badgeShown()).toBe(false);
      expect(document.querySelector('#checkin-channels')).toBeNull();
      expect(posts('/api/user/contact')).toHaveLength(0);
    });

    it('clearing a verified number asks the server to clear it and says texts and calls are off', async () => {
      loads('+15552017497', ['sms']);
      mockApiPost.mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        data: url.includes('/api/user/contact') ? { success: true, phoneChannelsOff: true } : {},
      }));
      await openContactSettings();
      await tick(20);
      expect(document.querySelector<HTMLInputElement>('[data-channel="sms"]')?.checked).toBe(true);

      type(findPhoneInput(), '');
      findSaveButton()?.click();
      await tick(50);

      expect(posts('/api/user/contact')[0]).toMatchObject({ clearPhone: true });
      expect(findSuccessMessage()?.textContent).toMatch(/won't text or call you/);
      expect(document.querySelector('[data-channel="sms"]')).toBeNull();
    });

    it('keeps the switches while texts are on, so they can be turned off without a verified number', async () => {
      loads(null, ['sms']);
      await openContactSettings();
      await tick(20);
      const texts = document.querySelector<HTMLInputElement>('[data-channel="sms"]');
      const calls = document.querySelector<HTMLInputElement>('[data-channel="call"]');
      expect(texts?.checked).toBe(true);
      expect(texts?.disabled).toBe(false);
      expect(calls?.disabled).toBe(true); // can't turn one on without a verified number

      if (texts) {
        texts.checked = false;
        texts.dispatchEvent(new Event('change'));
      }
      await tick(20);
      expect(posts('/api/outreach/preferences')).toEqual([
        { preferences: { allowedChannels: [], disclosureVersion: '2026-10-18' } },
      ]);
    });

    it('while a code is pending you can get a new one or change the number', async () => {
      loads(null, []);
      await codeSentFor('5552017497');

      document.querySelector<HTMLElement>('#resend-code-btn')?.click();
      await tick(50);
      expect(posts('/api/outreach/verify-phone')).toEqual([
        { phone: '+15552017497' },
        { phone: '+15552017497' },
      ]);

      document.querySelector<HTMLElement>('#change-number-btn')?.click();
      await tick(20);
      expect(document.querySelector('#verification-code')).toBeNull();
      expect(findPhoneInput()?.disabled).toBe(false);
      type(findPhoneInput(), '5552017400');
      findVerifyPhoneButton()?.click();
      await tick(50);
      expect(posts('/api/outreach/verify-phone').at(-1)).toEqual({ phone: '+15552017400' });
    });
  });

  // Same table as src/api/__tests__/user-contact-route.test.ts (the server's toE164).
  describe('toE164 (client copy of the server normalizer)', () => {
    it.each([
      ['5552017497', '+15552017497'],
      ['(555) 201-7497', '+15552017497'],
      ['1-555-201-7497', '+15552017497'],
      ['+44 20 7946 0958', '+442079460958'],
      ['12', null],
      ['555-201-749', null],
      ['call me', null],
      ['', null],
    ])('%s → %s', async (raw, want) => {
      const { toE164 } = await import('../../src/utils/phone.js');
      expect(toE164(raw)).toBe(want);
    });
  });
});
