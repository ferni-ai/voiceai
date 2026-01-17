/**
 * Data Export UI Tests
 *
 * Tests the "Download Your Story" feature:
 * - Modal display
 * - Category selection
 * - Export format selection (JSON/CSV)
 * - Export execution
 * - Data deletion flow
 * - Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS - Set up before dynamic imports
// ============================================================================

// Mock i18n
vi.mock('../../src/i18n/index.js', () => ({
  t: (key: string, fallback?: string) => fallback || key,
}));

// Mock animation constants
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out' },
}));

// ============================================================================
// CALLBACK MOCKS
// ============================================================================

const mockCallbacks = {
  onClose: vi.fn(),
  onExport: vi.fn(),
  onDeleteData: vi.fn(),
};

// ============================================================================
// TEST DATA
// ============================================================================

const mockExportableData = [
  {
    category: 'Conversations',
    description: 'All your conversations with Ferni',
    itemCount: 42,
    exportable: true,
  },
  {
    category: 'Insights',
    description: 'Things Ferni has learned about you',
    itemCount: 15,
    exportable: true,
  },
  {
    category: 'Rituals',
    description: 'Your daily practices and habits',
    itemCount: 8,
    exportable: true,
  },
  {
    category: 'Predictions',
    description: 'Predictions and tracking',
    itemCount: 5,
    exportable: true,
  },
  {
    category: 'Mood History',
    description: 'Your emotional weather over time',
    itemCount: 30,
    exportable: true,
  },
];

// ============================================================================
// TEST HELPERS
// ============================================================================

function findDataExportModal(): HTMLElement | null {
  return document.querySelector('.data-export');
}

function findCategoryCheckboxes(): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll('.data-export__category-checkbox');
}

function findFormatButtons(): NodeListOf<HTMLElement> {
  return document.querySelectorAll('.data-export__format-btn');
}

function findExportButton(): HTMLElement | null {
  return document.querySelector('.data-export__btn--primary');
}

function findDeleteButton(): HTMLElement | null {
  return document.querySelector('.data-export__btn--danger');
}

function findCloseButton(): HTMLElement | null {
  return document.querySelector('.data-export__close');
}

// ============================================================================
// TESTS
// ============================================================================

describe('Data Export UI', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getDataExportUI: any;

  beforeEach(async () => {
    // Reset DOM
    document.body.textContent = '';
    document.head.textContent = '';

    vi.clearAllMocks();

    // Reset module to get fresh singleton each time
    vi.resetModules();
    const module = await import('../../src/ui/data-export.ui.js');
    getDataExportUI = module.getDataExportUI;
  });

  afterEach(() => {
    document.querySelectorAll('.data-export').forEach((el) => el.remove());
    document.querySelectorAll('#data-export-styles').forEach((el) => el.remove());
  });

  describe('Modal Lifecycle', () => {
    it('should show the modal', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal).not.toBeNull();
    });

    it('should have visible class when shown', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal?.classList.contains('data-export--visible')).toBe(true);
    });

    it('should hide on close button click', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const closeBtn = findCloseButton();
      closeBtn?.click();

      const modal = findDataExportModal();
      expect(modal?.classList.contains('data-export--visible')).toBe(false);
    });

    it('should hide on backdrop click', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      modal?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(modal?.classList.contains('data-export--visible')).toBe(false);
    });

    it('should call onClose callback when hidden', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      ui.hide();

      expect(mockCallbacks.onClose).toHaveBeenCalled();
    });

    it('should have proper dialog role', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });
  });

  describe('Category Display', () => {
    it('should display all categories', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const checkboxes = findCategoryCheckboxes();
      expect(checkboxes.length).toBe(mockExportableData.length);
    });

    it('should show category names', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();

      mockExportableData.forEach((data) => {
        expect(modal?.textContent).toContain(data.category);
      });
    });

    it('should show item counts', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal?.textContent).toContain('42');
      expect(modal?.textContent).toContain('15');
    });

    it('should show descriptions', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal?.textContent).toContain('All your conversations');
    });

    it('should have all exportable categories checked by default', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const checkboxes = findCategoryCheckboxes();
      checkboxes.forEach((checkbox) => {
        if (!checkbox.disabled) {
          expect(checkbox.checked).toBe(true);
        }
      });
    });

    it('should show total items count', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      const totalItems = mockExportableData.reduce((sum, d) => sum + d.itemCount, 0);
      expect(modal?.textContent).toContain(String(totalItems));
    });
  });

  describe('Category Selection', () => {
    it('should toggle category on checkbox click', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const checkboxes = findCategoryCheckboxes();
      const firstCheckbox = checkboxes[0];

      expect(firstCheckbox.checked).toBe(true);

      firstCheckbox.click();
      expect(firstCheckbox.checked).toBe(false);

      firstCheckbox.click();
      expect(firstCheckbox.checked).toBe(true);
    });

    it('should disable non-exportable categories', async () => {
      const dataWithNonExportable = [
        ...mockExportableData,
        {
          category: 'System Data',
          description: 'Internal system data',
          itemCount: 100,
          exportable: false,
        },
      ];

      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(dataWithNonExportable);

      const checkboxes = findCategoryCheckboxes();
      const disabledCheckbox = Array.from(checkboxes).find(
        (cb) => cb.dataset.category === 'System Data'
      );

      expect(disabledCheckbox?.disabled).toBe(true);
    });
  });

  describe('Format Selection', () => {
    it('should show format options', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const formatButtons = findFormatButtons();
      expect(formatButtons.length).toBe(2); // JSON and CSV
    });

    it('should have JSON selected by default', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const jsonBtn = document.querySelector('[data-format="json"]');
      expect(jsonBtn?.classList.contains('data-export__format-btn--active')).toBe(true);
    });

    it('should switch format on button click', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const csvBtn = document.querySelector('[data-format="csv"]') as HTMLElement;
      csvBtn?.click();

      expect(csvBtn?.classList.contains('data-export__format-btn--active')).toBe(true);

      const jsonBtn = document.querySelector('[data-format="json"]');
      expect(jsonBtn?.classList.contains('data-export__format-btn--active')).toBe(false);
    });
  });

  describe('Export Action', () => {
    it('should have export button', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const exportBtn = findExportButton();
      expect(exportBtn).not.toBeNull();
    });

    it('should call onExport with selected format and categories', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const exportBtn = findExportButton();
      exportBtn?.click();

      expect(mockCallbacks.onExport).toHaveBeenCalledWith(
        'json',
        expect.arrayContaining(['Conversations', 'Insights'])
      );
    });

    it('should export CSV when CSV selected', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      // Select CSV
      const csvBtn = document.querySelector('[data-format="csv"]') as HTMLElement;
      csvBtn?.click();

      const exportBtn = findExportButton();
      exportBtn?.click();

      expect(mockCallbacks.onExport).toHaveBeenCalledWith('csv', expect.any(Array));
    });

    it('should only include selected categories', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      // Uncheck first category
      const checkboxes = findCategoryCheckboxes();
      checkboxes[0].click(); // Uncheck Conversations

      const exportBtn = findExportButton();
      exportBtn?.click();

      expect(mockCallbacks.onExport).toHaveBeenCalledWith(
        'json',
        expect.not.arrayContaining(['Conversations'])
      );
    });
  });

  describe('Delete Data', () => {
    it('should have delete button', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const deleteBtn = findDeleteButton();
      expect(deleteBtn).not.toBeNull();
    });

    it('should confirm before deleting', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const deleteBtn = findDeleteButton();
      deleteBtn?.click();

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockCallbacks.onDeleteData).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('should call onDeleteData when confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const deleteBtn = findDeleteButton();
      deleteBtn?.click();

      expect(mockCallbacks.onDeleteData).toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('should hide modal after delete', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.setCallbacks(mockCallbacks);
      ui.show(mockExportableData);

      const deleteBtn = findDeleteButton();
      deleteBtn?.click();

      const modal = findDataExportModal();
      expect(modal?.classList.contains('data-export--visible')).toBe(false);

      confirmSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog role', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-label on modal', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      expect(modal?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should have accessible close button', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const closeBtn = findCloseButton();
      expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should have accessible format buttons', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const formatButtons = findFormatButtons();
      formatButtons.forEach((btn) => {
        expect(btn.getAttribute('aria-label')).toBeTruthy();
      });
    });
  });

  describe('Brand Compliance', () => {
    it('should use "Your Data" or similar warm heading', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const heading = document.querySelector('.data-export__header h2');
      expect(heading?.textContent).toContain('Your');
    });

    it('should have privacy-focused footer message', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const footer = document.querySelector('.data-export__footer');
      expect(footer?.textContent?.toLowerCase()).toContain('privacy');
    });

    it('should not use cold enterprise language', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      const modal = findDataExportModal();
      const text = modal?.textContent?.toLowerCase() || '';

      expect(text).not.toContain('gdpr compliance');
      expect(text).not.toContain('data subject');
      expect(text).not.toContain('pursuant to');
    });
  });

  describe('Visibility State', () => {
    it('should report visibility correctly', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();

      expect(ui.getIsVisible()).toBe(false);

      ui.show(mockExportableData);
      expect(ui.getIsVisible()).toBe(true);

      ui.hide();
      expect(ui.getIsVisible()).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should destroy properly', async () => {
      const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

      const ui = getDataExportUI();
      ui.show(mockExportableData);

      ui.destroy();

      expect(findDataExportModal()).toBeNull();
    });
  });
});

