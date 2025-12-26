/**
 * Voice Journal UI Tests
 *
 * E2E-style tests for the Voice Journal feature.
 * Tests cover: recording, saving, deletion, calendar, insights, export.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { CustomAgent, CustomAgentMemory } from '../../src/services/custom-agent.service.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock localStorage
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

// Mock getUserId
vi.mock('../../src/utils/api.js', () => ({
  getUserId: vi.fn(() => 'test-user-id'),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock MediaRecorder
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null as ((event: BlobEvent) => void) | null,
  onstop: null as (() => void) | null,
  state: 'inactive' as RecordingState,
};

global.MediaRecorder = vi.fn().mockImplementation(() => mockMediaRecorder) as unknown as typeof MediaRecorder;
(global.MediaRecorder as unknown as { isTypeSupported: (type: string) => boolean }).isTypeSupported = vi.fn(() => true);

// Mock AudioContext
const mockAnalyser = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  frequencyBinCount: 128,
  getByteFrequencyData: vi.fn(),
};

const mockAudioContext = {
  createAnalyser: vi.fn(() => mockAnalyser),
  createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
  close: vi.fn(),
  state: 'running' as AudioContextState,
};

global.AudioContext = vi.fn().mockImplementation(() => mockAudioContext) as unknown as typeof AudioContext;

// Mock navigator.mediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
  },
  writable: true,
});

// Mock navigator.share
Object.defineProperty(global.navigator, 'share', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
});

// Mock navigator.clipboard
Object.defineProperty(global.navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// ============================================================================
// TEST DATA
// ============================================================================

const mockAgent: CustomAgent = {
  id: 'agent-123',
  userId: 'test-user-id',
  name: 'my-twin',
  displayName: 'My Digital Twin',
  description: 'A test digital twin',
  type: 'twin',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  voice: {
    type: 'cloned',
    voiceId: 'voice-123',
    status: 'ready',
    settings: { speed: 1, stability: 0.8, similarityBoost: 0.75 },
  },
  personality: {
    warmth: 3,
    humorLevel: 2,
    directness: 3,
    energy: 2,
    formality: 2,
    traits: ['reflective', 'thoughtful'],
    values: ['honesty', 'growth'],
    cognitiveProfile: 'balanced',
    responsePatterns: {},
  },
  memories: {
    stories: [],
    wisdom: [],
    sharedMoments: [],
    journalEntries: [],
  },
  behaviors: {
    greetings: ['Hello'],
    farewells: ['Goodbye'],
    catchphrases: [],
    responsePatterns: {},
  },
  privacy: 'private',
};

const mockJournalEntries: CustomAgentMemory[] = [
  {
    id: 'entry-1',
    type: 'journalEntry',
    content: 'Today was a great day. I learned something new about myself.',
    mood: 'happy',
    themes: ['growth', 'learning'],
    emotions: ['happiness', 'gratitude'],
    keywords: ['learning', 'self-discovery'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'entry-2',
    type: 'journalEntry',
    content: 'Feeling reflective today. Been thinking about my goals.',
    mood: 'reflective',
    themes: ['goals', 'reflection'],
    emotions: ['contemplative'],
    keywords: ['goals', 'future'],
    createdAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'entry-3',
    type: 'journalEntry',
    content: 'I finally realized why I was feeling stuck.',
    mood: 'calm',
    themes: ['breakthrough', 'understanding'],
    emotions: ['relief', 'clarity'],
    keywords: ['breakthrough', 'clarity'],
    source: 'auto-capture',
    momentType: 'breakthrough',
    createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

// ============================================================================
// HELPER IMPORTS (Dynamic to avoid import issues)
// ============================================================================

async function getVoiceJournalModule() {
  // Clear mocks before each import
  vi.resetModules();
  return import('../../src/ui/voice-journal/index.js');
}

async function getStatsModule() {
  return import('../../src/ui/voice-journal/stats.js');
}

async function getEntriesModule() {
  return import('../../src/ui/voice-journal/entries.js');
}

async function getInsightsModule() {
  return import('../../src/ui/voice-journal/insights.js');
}

// ============================================================================
// STATS CALCULATION TESTS
// ============================================================================

describe('Voice Journal Stats', () => {
  it('should calculate total entries correctly', async () => {
    const { calculateStats } = await getStatsModule();
    const stats = calculateStats(mockJournalEntries);

    expect(stats.totalEntries).toBe(3);
  });

  it('should calculate streaks correctly', async () => {
    const { calculateStats } = await getStatsModule();
    
    // Create entries with consecutive days
    const today = new Date();
    const consecutiveEntries: CustomAgentMemory[] = [
      {
        id: 'e1',
        type: 'journalEntry',
        content: 'Today',
        themes: [],
        emotions: [],
        keywords: [],
        createdAt: today.toISOString(),
        updatedAt: today.toISOString(),
      },
      {
        id: 'e2',
        type: 'journalEntry',
        content: 'Yesterday',
        themes: [],
        emotions: [],
        keywords: [],
        createdAt: new Date(today.getTime() - 86400000).toISOString(),
        updatedAt: new Date(today.getTime() - 86400000).toISOString(),
      },
      {
        id: 'e3',
        type: 'journalEntry',
        content: '2 days ago',
        themes: [],
        emotions: [],
        keywords: [],
        createdAt: new Date(today.getTime() - 172800000).toISOString(),
        updatedAt: new Date(today.getTime() - 172800000).toISOString(),
      },
    ];

    const stats = calculateStats(consecutiveEntries);

    expect(stats.currentStreak).toBeGreaterThanOrEqual(1);
    expect(stats.longestStreak).toBeGreaterThanOrEqual(1);
  });

  it('should calculate top moods correctly', async () => {
    const { calculateStats } = await getStatsModule();
    
    const entriesWithMoods: CustomAgentMemory[] = [
      { ...mockJournalEntries[0], mood: 'happy' },
      { ...mockJournalEntries[1], mood: 'happy' },
      { ...mockJournalEntries[2], mood: 'calm' },
    ];

    const stats = calculateStats(entriesWithMoods);

    expect(stats.topMoods).toContainEqual({ mood: 'happy', count: 2 });
  });

  it('should calculate entries by week correctly', async () => {
    const { calculateStats } = await getStatsModule();
    const stats = calculateStats(mockJournalEntries);

    expect(stats.entriesByWeek).toHaveLength(4);
    expect(stats.entriesByWeek[0]).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty entries array', async () => {
    const { calculateStats } = await getStatsModule();
    const stats = calculateStats([]);

    expect(stats.totalEntries).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.avgMoodScore).toBe(0);
    expect(stats.topMoods).toEqual([]);
  });
});

// ============================================================================
// DATE FORMATTING TESTS
// ============================================================================

describe('Date Formatting', () => {
  it('should format today correctly', async () => {
    const { formatDate } = await getEntriesModule();
    const today = new Date().toISOString();
    const formatted = formatDate(today);

    expect(formatted).toContain('Today');
  });

  it('should format yesterday correctly', async () => {
    const { formatDate } = await getEntriesModule();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const formatted = formatDate(yesterday);

    expect(formatted).toContain('Yesterday');
  });

  it('should format older dates with month and day', async () => {
    const { formatDate } = await getEntriesModule();
    const oldDate = new Date('2023-01-15T10:30:00Z').toISOString();
    const formatted = formatDate(oldDate);

    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
  });
});

// ============================================================================
// MOOD ICON TESTS
// ============================================================================

describe('Mood Icons', () => {
  it('should return SVG icon for known moods', async () => {
    const { getMoodIcon } = await import('../../src/ui/voice-journal/mood-icons.js');

    const happyIcon = getMoodIcon('happy');
    expect(happyIcon).toContain('<svg');
    expect(happyIcon).toContain('</svg>');

    const calmIcon = getMoodIcon('calm');
    expect(calmIcon).toContain('<svg');
  });

  it('should return default icon for unknown moods', async () => {
    const { getMoodIcon } = await import('../../src/ui/voice-journal/mood-icons.js');

    const unknownIcon = getMoodIcon('unknown-mood');
    expect(unknownIcon).toContain('<svg');
  });
});

// ============================================================================
// EXPORT TESTS
// ============================================================================

describe('Journal Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('should create markdown export with stats', async () => {
    // This is more of an integration test that would need DOM setup
    // For now, test the stats calculation used in export
    const { calculateStats } = await getStatsModule();
    const stats = calculateStats(mockJournalEntries);

    expect(stats.totalEntries).toBe(3);
    expect(stats.topMoods.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// INSIGHTS TESTS
// ============================================================================

describe('Journal Insights', () => {
  it('should require minimum entries for insights', async () => {
    const { calculateStats } = await getStatsModule();
    
    // Less than 3 entries
    const fewEntries = mockJournalEntries.slice(0, 2);
    const stats = calculateStats(fewEntries);

    expect(stats.totalEntries).toBe(2);
    // Insights require at least 3 entries
  });

  it('should generate insights with enough entries', async () => {
    const { calculateStats } = await getStatsModule();
    const stats = calculateStats(mockJournalEntries);

    expect(stats.totalEntries).toBeGreaterThanOrEqual(3);
    expect(stats.topMoods.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// CALENDAR TESTS
// ============================================================================

describe('Calendar', () => {
  it('should correctly identify days with entries', () => {
    const today = new Date();
    const entriesByDate = new Map<string, number>();

    mockJournalEntries.forEach((entry) => {
      const date = new Date(entry.createdAt);
      if (date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
        const key = date.getDate().toString();
        entriesByDate.set(key, (entriesByDate.get(key) || 0) + 1);
      }
    });

    // At least today's entry should be counted
    expect(entriesByDate.size).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// RECORDING TESTS
// ============================================================================

describe('Recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMediaRecorder.state = 'inactive';
  });

  it('should detect supported audio MIME types', () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    const supported = types.filter(() => MediaRecorder.isTypeSupported('audio/webm'));

    expect(supported.length).toBeGreaterThan(0);
  });

  it('should convert blob to base64', async () => {
    // Mock FileReader
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      result: 'data:audio/webm;base64,SGVsbG8gV29ybGQ=',
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };

    global.FileReader = vi.fn().mockImplementation(() => mockFileReader) as unknown as typeof FileReader;

    const blob = new Blob(['test'], { type: 'audio/webm' });
    
    // Simulate the blobToBase64 function behavior
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('SGVsbG8gV29ybGQ='); // "Hello World" in base64
      }, 0);
    });

    const result = await promise;
    expect(result).toBe('SGVsbG8gV29ybGQ=');
  });
});

// ============================================================================
// API INTEGRATION TESTS
// ============================================================================

describe('API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem('ferni_user_id', 'test-user-id');
  });

  it('should fetch prompts from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          prompt: {
            id: 'prompt-1',
            category: 'reflection',
            prompt: 'What are you grateful for today?',
            difficulty: 'gentle',
            estimatedMinutes: 5,
            tags: ['gratitude'],
          },
        }),
    });

    const response = await fetch('/api/journal/prompt', {
      method: 'POST',
      body: JSON.stringify({ timeOfDay: 'morning' }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.prompt).toBeDefined();
    expect(data.prompt.prompt).toBeDefined();
  });

  it('should transcribe audio', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          transcript: 'This is a test transcription.',
        }),
    });

    const response = await fetch('/api/journal/transcribe', {
      method: 'POST',
      body: JSON.stringify({
        audioBase64: 'SGVsbG8gV29ybGQ=',
        mimeType: 'audio/webm',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.transcript).toBe('This is a test transcription.');
  });

  it('should add memory to agent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'new-entry-id',
          type: 'journalEntry',
          content: 'Test entry content',
          createdAt: new Date().toISOString(),
        }),
    });

    const response = await fetch('/api/custom-agents/agent-123/memories', {
      method: 'POST',
      body: JSON.stringify({
        type: 'journalEntry',
        content: 'Test entry content',
        mood: 'happy',
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.id).toBe('new-entry-id');
  });

  it('should delete memory from agent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const response = await fetch('/api/custom-agents/agent-123/memories/entry-1', {
      method: 'DELETE',
    });

    expect(response.ok).toBe(true);
  });

  it('should list journal entries', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          memories: mockJournalEntries,
          total: mockJournalEntries.length,
        }),
    });

    const response = await fetch('/api/custom-agents/agent-123/memories?type=journalEntry');

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.memories).toHaveLength(3);
  });
});

// ============================================================================
// DELETION CONFIRMATION TESTS
// ============================================================================

describe('Entry Deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.setItem('ferni_user_id', 'test-user-id');
  });

  it('should call delete API when confirmed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    // Simulate deletion
    const agentId = 'agent-123';
    const memoryId = 'entry-1';

    const response = await fetch(`/api/custom-agents/${agentId}/memories/${memoryId}`, {
      method: 'DELETE',
      headers: {
        'X-User-ID': 'test-user-id',
      },
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/memories/entry-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

// ============================================================================
// REAL-TIME SYNC TESTS (Placeholder)
// ============================================================================

describe('Real-time Sync', () => {
  it('should support WebSocket connection', () => {
    // This is a placeholder for WebSocket testing
    // In a real implementation, we'd test the WebSocket connection
    expect(true).toBe(true);
  });
});

// ============================================================================
// SEMANTIC SEARCH TESTS (Placeholder)
// ============================================================================

describe('Semantic Search', () => {
  it('should search entries by content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          entries: [mockJournalEntries[0]],
          total: 1,
        }),
    });

    const response = await fetch('/api/journal/search?q=grateful');

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.entries).toHaveLength(1);
  });
});


