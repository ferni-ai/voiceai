/**
 * Journal Capture Service Tests
 *
 * Tests for the auto-capture moment detection and storage.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  mightContainMoment,
  estimateMomentType,
  loadCaptureSettings,
  saveCaptureSettings,
  enableJournalCapture,
  disableJournalCapture,
  isCaptureEnabled,
  queueMoment,
  getPendingMoments,
  clearPendingMoments,
  loadPendingMoments,
  getMomentTypeLabel,
  getMomentTypeIcon,
  initJournalCapture,
  DEFAULT_CAPTURE_SETTINGS,
  type CapturedMoment,
  type JournalCaptureSettings,
  type MomentType,
} from '../../src/services/journal-capture.service.js';

// ============================================================================
// MOCK localStorage
// ============================================================================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ============================================================================
// MOMENT DETECTION TESTS
// ============================================================================

describe('Moment Detection', () => {
  describe('mightContainMoment', () => {
    it('should detect breakthrough moments', () => {
      expect(mightContainMoment('I finally understand why this was happening')).toBe(true);
      expect(mightContainMoment('It hit me that I was being too hard on myself')).toBe(true);
      expect(mightContainMoment('I realized I need to change')).toBe(true);
      expect(mightContainMoment('Everything makes sense now')).toBe(true);
    });

    it('should detect decision moments', () => {
      expect(mightContainMoment("I'm going to start exercising regularly")).toBe(true);
      expect(mightContainMoment("I've decided to leave my job")).toBe(true);
      expect(mightContainMoment('From now on I will prioritize sleep')).toBe(true);
      expect(mightContainMoment("I'm committed to making this work")).toBe(true);
    });

    it('should detect gratitude moments', () => {
      expect(mightContainMoment("I'm grateful for my family")).toBe(true);
      expect(mightContainMoment('I appreciate your help')).toBe(true);
      expect(mightContainMoment('This means so much to me')).toBe(true);
      expect(mightContainMoment('I am so thankful')).toBe(true);
    });

    it('should detect struggle moments', () => {
      expect(mightContainMoment("I've been struggling with anxiety")).toBe(true);
      expect(mightContainMoment("It's hard to keep going sometimes")).toBe(true);
      expect(mightContainMoment('I feel overwhelmed by everything')).toBe(true);
    });

    it('should detect joy moments', () => {
      expect(mightContainMoment("I'm so happy today!")).toBe(true);
      expect(mightContainMoment('This is amazing news')).toBe(true);
      expect(mightContainMoment('I love this feeling')).toBe(true);
    });

    it('should detect reflection moments', () => {
      expect(mightContainMoment("I've been thinking about my career")).toBe(true);
      expect(mightContainMoment('Looking back on last year')).toBe(true);
      expect(mightContainMoment('I notice that I tend to procrastinate')).toBe(true);
    });

    it('should detect goal moments', () => {
      expect(mightContainMoment('I want to learn a new language')).toBe(true);
      expect(mightContainMoment('My goal is to run a marathon')).toBe(true);
      expect(mightContainMoment("One day I'll write a book")).toBe(true);
    });

    it('should detect connection moments', () => {
      expect(mightContainMoment('My partner has been so supportive')).toBe(true);
      expect(mightContainMoment('Our relationship has grown stronger')).toBe(true);
      expect(mightContainMoment('My family means everything to me')).toBe(true);
    });

    it('should detect lesson moments', () => {
      expect(mightContainMoment('I learned that patience is key')).toBe(true);
      expect(mightContainMoment('This experience taught me so much')).toBe(true);
      expect(mightContainMoment('It opened my eyes to new possibilities')).toBe(true);
    });

    it('should detect vulnerability moments', () => {
      expect(mightContainMoment("I've never told anyone this before")).toBe(true);
      expect(mightContainMoment("It's hard to admit but I was wrong")).toBe(true);
      expect(mightContainMoment("I'm scared to try again")).toBe(true);
    });

    it('should return false for ordinary text', () => {
      expect(mightContainMoment('The weather is nice today')).toBe(false);
      expect(mightContainMoment('I had lunch at noon')).toBe(false);
      expect(mightContainMoment('Hello, how are you?')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(mightContainMoment('I FINALLY UNDERSTAND!')).toBe(true);
      expect(mightContainMoment("I'm GRATEFUL for everything")).toBe(true);
    });
  });

  describe('estimateMomentType', () => {
    it('should estimate breakthrough type', () => {
      expect(estimateMomentType('I finally get it now')).toBe('breakthrough');
      expect(estimateMomentType('It clicked for me yesterday')).toBe('breakthrough');
    });

    it('should estimate decision type', () => {
      expect(estimateMomentType("I've decided to move forward")).toBe('decision');
      expect(estimateMomentType('From now on things will be different')).toBe('decision');
    });

    it('should estimate gratitude type', () => {
      expect(estimateMomentType('So grateful for this opportunity')).toBe('gratitude');
    });

    it('should estimate struggle type', () => {
      expect(estimateMomentType("I'm struggling with depression")).toBe('struggle');
    });

    it('should estimate joy type', () => {
      expect(estimateMomentType("I'm so happy with the results")).toBe('joy');
    });

    it('should estimate reflection type', () => {
      expect(estimateMomentType("I've been thinking about life")).toBe('reflection');
    });

    it('should estimate goal type', () => {
      expect(estimateMomentType('I want to become a better person')).toBe('goal');
    });

    it('should estimate connection type', () => {
      expect(estimateMomentType('My partner understands me')).toBe('connection');
    });

    it('should estimate lesson type', () => {
      expect(estimateMomentType('I learned something important')).toBe('lesson');
    });

    it('should estimate vulnerability type', () => {
      expect(estimateMomentType('I never told anyone this')).toBe('vulnerability');
    });

    it('should return null for unrecognized text', () => {
      expect(estimateMomentType('Just a regular sentence')).toBeNull();
      expect(estimateMomentType('')).toBeNull();
    });

    it('should return first matching type when multiple indicators present', () => {
      // Note: The order depends on object iteration, which is typically insertion order
      const result = estimateMomentType('I finally realized I want to change');
      expect(['breakthrough', 'goal']).toContain(result);
    });
  });
});

// ============================================================================
// SETTINGS TESTS
// ============================================================================

describe('Capture Settings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('loadCaptureSettings', () => {
    it('should return default settings when nothing stored', () => {
      const settings = loadCaptureSettings();
      expect(settings).toEqual(DEFAULT_CAPTURE_SETTINGS);
    });

    it('should load stored settings', () => {
      const customSettings: JournalCaptureSettings = {
        ...DEFAULT_CAPTURE_SETTINGS,
        enabled: true,
        minIntensity: 0.8,
      };
      localStorageMock.setItem('ferni_journal_capture_settings', JSON.stringify(customSettings));

      const settings = loadCaptureSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.minIntensity).toBe(0.8);
    });

    it('should merge partial stored settings with defaults', () => {
      localStorageMock.setItem('ferni_journal_capture_settings', JSON.stringify({ enabled: true }));

      const settings = loadCaptureSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.captureTypes).toEqual(DEFAULT_CAPTURE_SETTINGS.captureTypes);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorageMock.setItem('ferni_journal_capture_settings', 'not valid json');

      const settings = loadCaptureSettings();
      expect(settings).toEqual(DEFAULT_CAPTURE_SETTINGS);
    });
  });

  describe('saveCaptureSettings', () => {
    it('should save settings to localStorage', () => {
      const settings: JournalCaptureSettings = {
        ...DEFAULT_CAPTURE_SETTINGS,
        enabled: true,
      };

      saveCaptureSettings(settings);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ferni_journal_capture_settings',
        expect.any(String)
      );
      const saved = JSON.parse(
        localStorageMock.getItem('ferni_journal_capture_settings') || '{}'
      );
      expect(saved.enabled).toBe(true);
    });
  });

  describe('enableJournalCapture', () => {
    it('should enable capture and set consent date', () => {
      enableJournalCapture();

      const settings = loadCaptureSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.consentDate).toBeDefined();
      expect(new Date(settings.consentDate!).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('disableJournalCapture', () => {
    it('should disable capture', () => {
      enableJournalCapture();
      disableJournalCapture();

      const settings = loadCaptureSettings();
      expect(settings.enabled).toBe(false);
    });
  });

  describe('isCaptureEnabled', () => {
    it('should return false by default', () => {
      expect(isCaptureEnabled()).toBe(false);
    });

    it('should return true after enabling', () => {
      enableJournalCapture();
      expect(isCaptureEnabled()).toBe(true);
    });
  });
});

// ============================================================================
// MOMENT QUEUE TESTS
// ============================================================================

describe('Moment Queue', () => {
  beforeEach(() => {
    localStorageMock.clear();
    clearPendingMoments();
    vi.clearAllMocks();
  });

  const createMockMoment = (overrides: Partial<CapturedMoment> = {}): CapturedMoment => ({
    id: `moment-${Date.now()}`,
    type: 'breakthrough',
    content: 'I finally understand!',
    themes: ['growth', 'insight'],
    intensity: 0.8,
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  describe('queueMoment', () => {
    it('should add moment to queue', () => {
      const moment = createMockMoment();
      queueMoment(moment);

      const pending = getPendingMoments();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toEqual(moment);
    });

    it('should persist to localStorage', () => {
      const moment = createMockMoment();
      queueMoment(moment);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ferni_pending_moments',
        expect.any(String)
      );
    });

    it('should allow multiple moments', () => {
      queueMoment(createMockMoment({ type: 'breakthrough' }));
      queueMoment(createMockMoment({ type: 'decision' }));
      queueMoment(createMockMoment({ type: 'gratitude' }));

      expect(getPendingMoments()).toHaveLength(3);
    });
  });

  describe('getPendingMoments', () => {
    it('should return empty array when no moments', () => {
      expect(getPendingMoments()).toEqual([]);
    });

    it('should return copy of moments (not reference)', () => {
      queueMoment(createMockMoment());
      const moments1 = getPendingMoments();
      const moments2 = getPendingMoments();

      expect(moments1).toEqual(moments2);
      expect(moments1).not.toBe(moments2);
    });
  });

  describe('clearPendingMoments', () => {
    it('should clear all pending moments', () => {
      queueMoment(createMockMoment());
      queueMoment(createMockMoment());
      clearPendingMoments();

      expect(getPendingMoments()).toHaveLength(0);
    });

    it('should remove from localStorage', () => {
      queueMoment(createMockMoment());
      clearPendingMoments();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('ferni_pending_moments');
    });
  });

  describe('loadPendingMoments', () => {
    it('should load moments from localStorage', () => {
      const moments = [createMockMoment(), createMockMoment()];
      
      // Set up localStorage with moments AFTER clearing state
      // (clearPendingMoments removes from localStorage too)
      localStorageMock.clear();
      vi.clearAllMocks();
      localStorageMock.setItem('ferni_pending_moments', JSON.stringify(moments));

      loadPendingMoments();

      expect(getPendingMoments()).toHaveLength(2);
    });

    it('should handle missing localStorage gracefully', () => {
      loadPendingMoments();
      expect(getPendingMoments()).toEqual([]);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorageMock.setItem('ferni_pending_moments', 'not valid json');
      loadPendingMoments();
      // Should not throw, moments remain unchanged
    });
  });
});

// ============================================================================
// LABEL & ICON TESTS
// ============================================================================

describe('Labels and Icons', () => {
  describe('getMomentTypeLabel', () => {
    const allTypes: MomentType[] = [
      'breakthrough',
      'decision',
      'gratitude',
      'struggle',
      'joy',
      'reflection',
      'goal',
      'connection',
      'lesson',
      'vulnerability',
    ];

    it('should return human-readable labels for all types', () => {
      allTypes.forEach((type) => {
        const label = getMomentTypeLabel(type);
        expect(label).toBeDefined();
        expect(label.length).toBeGreaterThan(0);
        // Labels should be title case
        expect(label[0]).toBe(label[0].toUpperCase());
      });
    });

    it('should return specific labels', () => {
      expect(getMomentTypeLabel('breakthrough')).toBe('Breakthrough');
      expect(getMomentTypeLabel('lesson')).toBe('Lesson Learned');
      expect(getMomentTypeLabel('vulnerability')).toBe('Vulnerability');
    });
  });

  describe('getMomentTypeIcon', () => {
    const allTypes: MomentType[] = [
      'breakthrough',
      'decision',
      'gratitude',
      'struggle',
      'joy',
      'reflection',
      'goal',
      'connection',
      'lesson',
      'vulnerability',
    ];

    it('should return icon names for all types', () => {
      allTypes.forEach((type) => {
        const icon = getMomentTypeIcon(type);
        expect(icon).toBeDefined();
        expect(icon.length).toBeGreaterThan(0);
        // Icons should be lowercase kebab-case (Lucide convention)
        expect(icon).toMatch(/^[a-z-]+$/);
      });
    });

    it('should return specific icons', () => {
      expect(getMomentTypeIcon('breakthrough')).toBe('lightbulb');
      expect(getMomentTypeIcon('gratitude')).toBe('heart');
      expect(getMomentTypeIcon('goal')).toBe('target');
      expect(getMomentTypeIcon('connection')).toBe('users');
    });
  });
});

// ============================================================================
// INITIALIZATION TEST
// ============================================================================

describe('Initialization', () => {
  beforeEach(() => {
    localStorageMock.clear();
    clearPendingMoments();
    vi.clearAllMocks();
  });

  it('should load pending moments on init', () => {
    const moments = [
      {
        id: 'test-1',
        type: 'breakthrough' as MomentType,
        content: 'Test',
        themes: [],
        intensity: 0.7,
        timestamp: new Date().toISOString(),
      },
    ];
    localStorageMock.setItem('ferni_pending_moments', JSON.stringify(moments));

    initJournalCapture();

    expect(getPendingMoments()).toHaveLength(1);
  });

  it('should not throw when localStorage is empty', () => {
    expect(() => initJournalCapture()).not.toThrow();
  });
});

// ============================================================================
// DEFAULT SETTINGS TESTS
// ============================================================================

describe('Default Settings', () => {
  it('should have capture disabled by default', () => {
    expect(DEFAULT_CAPTURE_SETTINGS.enabled).toBe(false);
  });

  it('should include key moment types', () => {
    expect(DEFAULT_CAPTURE_SETTINGS.captureTypes).toContain('breakthrough');
    expect(DEFAULT_CAPTURE_SETTINGS.captureTypes).toContain('decision');
    expect(DEFAULT_CAPTURE_SETTINGS.captureTypes).toContain('gratitude');
    expect(DEFAULT_CAPTURE_SETTINGS.captureTypes).toContain('vulnerability');
  });

  it('should have reasonable intensity threshold', () => {
    expect(DEFAULT_CAPTURE_SETTINGS.minIntensity).toBeGreaterThan(0);
    expect(DEFAULT_CAPTURE_SETTINGS.minIntensity).toBeLessThan(1);
  });

  it('should show notifications by default', () => {
    expect(DEFAULT_CAPTURE_SETTINGS.showCaptureNotification).toBe(true);
  });

  it('should not require review by default (frictionless)', () => {
    expect(DEFAULT_CAPTURE_SETTINGS.reviewBeforeSave).toBe(false);
  });
});

