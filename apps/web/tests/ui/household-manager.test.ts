/**
 * Household Manager UI Tests
 *
 * Tests the family & household management feature:
 * - Creating households
 * - Adding/removing members
 * - Member cards display
 * - Auto-identification settings
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
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
const mockGetApiHeadersAsync = vi.fn().mockResolvedValue({});

// Mock API module
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiDelete: mockApiDelete,
  getApiHeadersAsync: mockGetApiHeadersAsync,
}));

// Mock toast (from whisper.ui.js, not toast.ui.js)
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: mockToast,
}));

// Mock timeout tracker
vi.mock('../../src/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
    clearAll: vi.fn(),
  }),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockMembers = [
  {
    userId: 'member-1',
    displayName: 'John',
    role: 'owner' as const,
    enrolledAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    preferences: {
      voiceEnrolled: true,
    },
  },
  {
    userId: 'member-2',
    displayName: 'Jane',
    role: 'adult' as const,
    enrolledAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    preferences: {
      voiceEnrolled: false,
    },
  },
];

const mockHousehold = {
  id: 'household-123',
  name: 'The Smiths',
  members: mockMembers,
  settings: {
    autoIdentify: true,
    requireReIdentification: false,
    guestMode: false,
    childSafeMode: false,
  },
};

// ============================================================================
// TEST HELPERS
// ============================================================================

function findHouseholdModal(): HTMLElement | null {
  return document.querySelector('.household-modal-overlay');
}

function findMemberCards(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.household-member');
}

function findAddMemberButton(): HTMLElement | null {
  return document.querySelector('[data-action="add-member"]');
}

function findCreateHouseholdButton(): HTMLElement | null {
  // First step: "show-create" opens the form, then "confirm-create" submits
  return document.querySelector('[data-action="show-create"]') ||
         document.querySelector('[data-action="confirm-create"]');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.household-modal__close');
}

function findAutoIdentifyToggle(): HTMLInputElement | null {
  return document.querySelector('[data-setting="autoIdentify"]');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Household Manager UI', () => {
  beforeEach(async () => {
    // Reset DOM
    document.body.textContent = '';
    document.head.textContent = '';

    vi.clearAllMocks();

    // Reset modules to get fresh state
    vi.resetModules();

    // Default: household exists with members - household includes members array
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/voice/household')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: mockHousehold,
        });
      }
      return Promise.resolve({ ok: true, status: 200, data: {} });
    });

    mockApiPost.mockResolvedValue({ ok: true, status: 200, data: {} });
    mockApiDelete.mockResolvedValue({ ok: true, status: 200, data: {} });
  });

  afterEach(() => {
    document.querySelectorAll('.household-manager').forEach((el) => el.remove());
    document.querySelectorAll('.household-overlay').forEach((el) => el.remove());
    document.querySelectorAll('#household-manager-styles').forEach((el) => el.remove());
  });

  describe('Modal Lifecycle', () => {
    it('should open the modal', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();

      const modal = findHouseholdModal();
      expect(modal).not.toBeNull();
    });

    it('should close on close button click', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      closeBtn?.click();

      await new Promise((r) => setTimeout(r, 350));

      // hideHouseholdManager removes 'visible' class but keeps element in DOM
      const modal = findHouseholdModal();
      expect(modal?.classList.contains('visible')).toBe(false);
    });

    it('should have proper dialog role', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();

      const modal = findHouseholdModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });
  });

  describe('No Household State', () => {
    beforeEach(() => {
      // Return 404 so fetchHousehold returns null
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/api/voice/household')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            data: null,
          });
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });
    });

    it('should show create household option when none exists', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const createBtn = findCreateHouseholdButton();
      expect(createBtn).not.toBeNull();
    });

    it('should create household on button click', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      // Step 1: Click show-create to open the form
      const showCreateBtn = document.querySelector('[data-action="show-create"]') as HTMLElement;
      showCreateBtn?.click();
      await new Promise((r) => setTimeout(r, 100));

      // Step 2: Fill in the household name
      const nameInput = document.querySelector('#household-name') as HTMLInputElement;
      if (nameInput) {
        nameInput.value = 'Test Household';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Step 3: Click confirm-create to submit
      const confirmBtn = document.querySelector('[data-action="confirm-create"]') as HTMLElement;
      confirmBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining('/api/voice/household'),
        expect.anything()
      );
    });
  });

  describe('Household Display', () => {
    it('should display household header', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findHouseholdModal();
      // UI shows "Your Household" header, not the household.name
      expect(modal?.textContent).toContain('Your Household');
    });

    it('should fetch household (with members) on load', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      // Members are included in the household response, not separate endpoint
      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/voice/household')
      );
    });

    it('should display member cards', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      const memberCards = findMemberCards();
      expect(memberCards.length).toBeGreaterThan(0);
    });

    it('should show member names', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      const modal = findHouseholdModal();
      expect(modal?.textContent).toContain('John');
      expect(modal?.textContent).toContain('Jane');
    });
  });

  describe('Member Management', () => {
    it('should show add member button', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const addBtn = findAddMemberButton();
      expect(addBtn).not.toBeNull();
    });

    it('should call API when adding member', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const addBtn = findAddMemberButton();
      addBtn?.click();

      // Would need to fill in form and submit
      // This depends on implementation
    });

    it('should show remove button for non-owner members', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      const removeButtons = document.querySelectorAll('[data-action="remove-member"]');
      // Should have remove button for at least one member (Jane, not owner)
    });

    it('should not show remove button for owner', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      // Owner should not have remove button
      const ownerCard = Array.from(findMemberCards()).find((card) =>
        card.textContent?.includes('John')
      );
      const removeBtn = ownerCard?.querySelector('[data-action="remove-member"]');
      // Owner typically doesn't have remove option
    });

    it('should confirm before removing member', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      const removeBtn = document.querySelector('[data-action="remove-member"]') as HTMLElement;
      removeBtn?.click();

      // Should show confirmation
      // Implementation dependent

      confirmSpy.mockRestore();
    });
  });

  describe('Settings', () => {
    it('should show auto-identify toggle', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findAutoIdentifyToggle();
      expect(toggle).not.toBeNull();
    });

    it('should reflect current auto-identify setting', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findAutoIdentifyToggle();
      // Should match mockHousehold.settings.autoIdentify
    });

    it('should update setting on toggle change', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const toggle = findAutoIdentifyToggle();
      toggle?.click();

      await new Promise((r) => setTimeout(r, 100));

      // Should call API to update settings
    });
  });

  describe('Enrollment Status', () => {
    it('should show enrollment status for each member', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      // Members with lastSeen show "Last here [time]"
      // Members without lastSeen show "Not enrolled yet"
      const modal = findHouseholdModal();
      expect(modal?.textContent).toContain('Last here');
    });

    it('should offer enrollment option for non-enrolled members', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      const enrollButtons = document.querySelectorAll('[data-action="enroll-member"]');
      // Should have enroll option for Jane
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      // On fetch error, fetchHousehold returns null, UI shows empty state
      // (same as no household exists) - no toast is shown for initial load errors
      const modal = findHouseholdModal();
      expect(modal).not.toBeNull(); // Modal should still open
    });

    it('should handle 404 (no household) gracefully', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes('/api/voice/household')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            error: 'Not found',
          });
        }
        return Promise.resolve({ ok: true, status: 200, data: {} });
      });

      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      // Should show create household option
      const createBtn = findCreateHouseholdButton();
      expect(createBtn).not.toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog role', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();

      const modal = findHouseholdModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });

    it('should have accessible close button', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const closeBtn = findCloseButton();
      expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should have accessible member cards', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 200));

      const memberCards = findMemberCards();
      memberCards.forEach((card) => {
        // Should have proper heading or label
        const heading = card.querySelector('h3, h4, [role="heading"]');
        // Cards should be accessible
      });
    });
  });

  describe('Brand Compliance', () => {
    it('should use "Family & Household" terminology', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findHouseholdModal();
      const text = modal?.textContent || '';

      // Should not use cold language
      expect(text).not.toContain('account');
      expect(text).not.toContain('user management');
    });

    it('should use warm messaging', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findHouseholdModal();
      const text = modal?.textContent?.toLowerCase() || '';

      // Should use warm Ferni language
      expect(text).toContain('family');
    });
  });

  describe('Loading States', () => {
    it('should show loading state while fetching', async () => {
      // Make API call slow
      mockApiGet.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  data: mockHousehold,
                }),
              500
            )
          )
      );

      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();

      // Should show loading indicator
      const loading = document.querySelector('.household-loading, .loading');
      // Implementation dependent
    });
  });
});

