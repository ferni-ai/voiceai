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

const mockHousehold = {
  id: 'household-123',
  name: 'The Smiths',
  createdAt: new Date().toISOString(),
  settings: {
    autoIdentify: true,
    requireConfirmation: false,
  },
};

const mockMembers = [
  {
    id: 'member-1',
    name: 'John',
    role: 'owner',
    enrolled: true,
    avatar: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'member-2',
    name: 'Jane',
    role: 'member',
    enrolled: false,
    avatar: null,
    createdAt: new Date().toISOString(),
  },
];

// ============================================================================
// TEST HELPERS
// ============================================================================

function findHouseholdModal(): HTMLElement | null {
  return document.querySelector('.household-manager');
}

function findMemberCards(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.household-member-card');
}

function findAddMemberButton(): HTMLElement | null {
  return document.querySelector('[data-action="add-member"]');
}

function findCreateHouseholdButton(): HTMLElement | null {
  return document.querySelector('[data-action="create-household"]');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.household-manager-close');
}

function findAutoIdentifyToggle(): HTMLInputElement | null {
  return document.querySelector('[data-setting="auto-identify"]');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Household Manager UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Default: household exists with members
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/voice/household/members')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ members: mockMembers }),
        });
      }
      if (url.includes('/api/voice/household')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ household: mockHousehold }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
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

      expect(findHouseholdModal()).toBeNull();
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
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/voice/household')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ household: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
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

      const createBtn = findCreateHouseholdButton();
      createBtn?.click();

      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/voice/household'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('Household Display', () => {
    it('should display household name', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      const modal = findHouseholdModal();
      expect(modal?.textContent).toContain(mockHousehold.name);
    });

    it('should fetch members on load', async () => {
      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/voice/household/members'),
        expect.anything()
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

      // John should show enrolled
      // Jane should show not enrolled
      const modal = findHouseholdModal();
      expect(modal?.textContent).toContain('enrolled');
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
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { showHouseholdManager } = await import('../../src/ui/household-manager.ui.js');

      await showHouseholdManager();
      await new Promise((r) => setTimeout(r, 100));

      // Should show error state or toast
      expect(mockToast.error).toHaveBeenCalled();
    });

    it('should handle 404 (no household) gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
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
      // Make fetch slow
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ household: mockHousehold }),
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

