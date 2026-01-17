/**
 * Theme Tools Tests
 *
 * Tests for the theme preference tools in the settings domain.
 *
 * @module tools/domains/settings/__tests__/theme-tools
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger first
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock user events service
const mockBroadcastUserEvent = vi.fn();
const mockPersistThemePreference = vi.fn();
const mockGetThemePreference = vi.fn();

vi.mock('../../../../services/user-events/index.js', () => ({
  broadcastUserEvent: (userId: string, eventType: string, data: unknown) =>
    mockBroadcastUserEvent(userId, eventType, data),
  persistThemePreference: (userId: string, theme: string) =>
    mockPersistThemePreference(userId, theme),
  getThemePreference: (userId: string) => mockGetThemePreference(userId),
}));

// Import after mocks
import type { ToolContext, Tool } from '../../../registry/types.js';
import { themeToolDefinitions } from '../theme-tools.js';

// Test context factory
function createMockContext(userId = 'test-user-123'): ToolContext {
  return {
    userId,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Theme Tools', () => {
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    // Default mock implementations
    mockBroadcastUserEvent.mockResolvedValue(undefined);
    mockPersistThemePreference.mockResolvedValue(undefined);
    mockGetThemePreference.mockResolvedValue('auto');
  });

  describe('Tool Loading', () => {
    it('should load all theme tool definitions', () => {
      expect(themeToolDefinitions.length).toBe(2);
    });

    it('should have correct tool IDs', () => {
      const toolIds = themeToolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('setTheme');
      expect(toolIds).toContain('getCurrentTheme');
    });

    it('should have settings domain', () => {
      themeToolDefinitions.forEach((t) => {
        expect(t.domain).toBe('settings');
      });
    });

    it('should have proper tags', () => {
      const setThemeDef = themeToolDefinitions.find((t) => t.id === 'setTheme');
      expect(setThemeDef?.tags).toContain('theme');
      expect(setThemeDef?.tags).toContain('dark-mode');
    });
  });

  describe('setTheme Tool', () => {
    let setThemeTool: Tool;

    beforeEach(() => {
      const def = themeToolDefinitions.find((t) => t.id === 'setTheme');
      setThemeTool = def!.create(mockContext);
    });

    describe('Theme Parsing - Direct Aliases', () => {
      it.each([
        ['dark', 'dark'],
        ['dark mode', 'dark'],
        ['night', 'dark'],
        ['night mode', 'dark'],
        ['dim', 'dark'],
      ])('should parse "%s" as dark theme', async (input, expected) => {
        const result = await setThemeTool.execute({ theme: input });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: expected,
          source: 'voice',
        });
        expect(result).toContain('dark mode');
      });

      it.each([
        ['light', 'light'],
        ['light mode', 'light'],
        ['day', 'light'],
        ['day mode', 'light'],
        ['bright', 'light'],
        ['brighter', 'light'],
        ['lighter', 'light'],
      ])('should parse "%s" as light theme', async (input, expected) => {
        const result = await setThemeTool.execute({ theme: input });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: expected,
          source: 'voice',
        });
        expect(result).toContain('light mode');
      });

      it.each([
        ['auto', 'auto'],
        ['automatic', 'auto'],
        ['system', 'auto'],
        ['system theme', 'auto'],
        ['default', 'auto'],
      ])('should parse "%s" as auto theme', async (input, expected) => {
        const result = await setThemeTool.execute({ theme: input });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: expected,
          source: 'voice',
        });
        expect(result).toContain('system settings');
      });
    });

    describe('Theme Parsing - Fuzzy Matching', () => {
      it.each([
        'make it darker',
        'I want dark theme',
        'switch to night mode please',
        'enable dark',
      ])('should fuzzy match "%s" as dark theme', async (input) => {
        const result = await setThemeTool.execute({ theme: input });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: 'dark',
          source: 'voice',
        });
        expect(result).toContain('dark mode');
      });

      it.each([
        'make it lighter',
        'I want light theme',
        'switch to day mode',
        'too bright',
      ])('should fuzzy match "%s" as light theme', async (input) => {
        const result = await setThemeTool.execute({ theme: input });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: 'light',
          source: 'voice',
        });
        expect(result).toContain('light mode');
      });

      it.each([
        'use automatic theme',
        'follow system preference',
        'auto mode',
      ])('should fuzzy match "%s" as auto theme', async (input) => {
        const result = await setThemeTool.execute({ theme: input });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: 'auto',
          source: 'voice',
        });
        expect(result).toContain('system settings');
      });
    });

    describe('Theme Parsing - Unknown Input', () => {
      it('should default to auto for unrecognized input', async () => {
        const result = await setThemeTool.execute({ theme: 'purple mode' });

        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: 'auto',
          source: 'voice',
        });
        expect(result).toContain('system settings');
      });
    });

    describe('Broadcasting and Persistence', () => {
      it('should broadcast theme change event', async () => {
        await setThemeTool.execute({ theme: 'dark' });

        expect(mockBroadcastUserEvent).toHaveBeenCalledTimes(1);
        expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
          theme: 'dark',
          source: 'voice',
        });
      });

      it('should persist theme preference', async () => {
        await setThemeTool.execute({ theme: 'dark' });

        expect(mockPersistThemePreference).toHaveBeenCalledWith('test-user-123', 'dark');
      });

      it('should not broadcast without userId', async () => {
        const noUserContext = createMockContext(undefined as unknown as string);
        noUserContext.userId = undefined as unknown as string;
        const def = themeToolDefinitions.find((t) => t.id === 'setTheme');
        const tool = def!.create(noUserContext);

        await tool.execute({ theme: 'dark' });

        expect(mockBroadcastUserEvent).not.toHaveBeenCalled();
        expect(mockPersistThemePreference).not.toHaveBeenCalled();
      });
    });

    describe('Response Messages', () => {
      it('should return human-friendly confirmation for dark mode', async () => {
        const result = await setThemeTool.execute({ theme: 'dark' });

        expect(result).toContain('dark mode');
        expect(result).toContain('Easier on the eyes');
      });

      it('should return human-friendly confirmation for light mode', async () => {
        const result = await setThemeTool.execute({ theme: 'light' });

        expect(result).toContain('light mode');
        expect(result).toContain('bright');
      });

      it('should return human-friendly confirmation for auto mode', async () => {
        const result = await setThemeTool.execute({ theme: 'auto' });

        expect(result).toContain('system settings');
        expect(result).toContain('device');
      });
    });

    describe('Error Handling', () => {
      it('should handle broadcast errors gracefully', async () => {
        mockBroadcastUserEvent.mockRejectedValue(new Error('Redis unavailable'));

        const result = await setThemeTool.execute({ theme: 'dark' });

        expect(result).toContain('trouble switching');
        expect(result).toContain('settings menu');
      });

      it('should handle persistence errors gracefully', async () => {
        mockPersistThemePreference.mockRejectedValue(new Error('Firestore unavailable'));

        const result = await setThemeTool.execute({ theme: 'dark' });

        expect(result).toContain('trouble switching');
      });
    });
  });

  describe('getCurrentTheme Tool', () => {
    let getCurrentThemeTool: Tool;

    beforeEach(() => {
      const def = themeToolDefinitions.find((t) => t.id === 'getCurrentTheme');
      getCurrentThemeTool = def!.create(mockContext);
    });

    describe('Theme Retrieval', () => {
      it('should return current theme as dark', async () => {
        mockGetThemePreference.mockResolvedValue('dark');

        const result = await getCurrentThemeTool.execute({});

        expect(mockGetThemePreference).toHaveBeenCalledWith('test-user-123');
        expect(result).toContain('dark mode');
      });

      it('should return current theme as light', async () => {
        mockGetThemePreference.mockResolvedValue('light');

        const result = await getCurrentThemeTool.execute({});

        expect(result).toContain('light mode');
      });

      it('should return current theme as auto', async () => {
        mockGetThemePreference.mockResolvedValue('auto');

        const result = await getCurrentThemeTool.execute({});

        expect(result).toContain('auto');
        expect(result).toContain('system');
      });
    });

    describe('Response Messages', () => {
      it('should ask if user wants to change theme', async () => {
        mockGetThemePreference.mockResolvedValue('dark');

        const result = await getCurrentThemeTool.execute({});

        expect(result).toContain('change');
      });
    });

    describe('Default Behavior', () => {
      it('should default to auto when no userId', async () => {
        const noUserContext = createMockContext(undefined as unknown as string);
        noUserContext.userId = undefined as unknown as string;
        const def = themeToolDefinitions.find((t) => t.id === 'getCurrentTheme');
        const tool = def!.create(noUserContext);

        const result = await tool.execute({});

        expect(mockGetThemePreference).not.toHaveBeenCalled();
        expect(result).toContain('auto');
      });
    });

    describe('Error Handling', () => {
      it('should handle retrieval errors gracefully', async () => {
        mockGetThemePreference.mockRejectedValue(new Error('Firestore unavailable'));

        const result = await getCurrentThemeTool.execute({});

        expect(result).toContain("not sure");
        expect(result).toContain('settings menu');
      });
    });
  });

  describe('Case Insensitivity', () => {
    let setThemeTool: Tool;

    beforeEach(() => {
      const def = themeToolDefinitions.find((t) => t.id === 'setTheme');
      setThemeTool = def!.create(mockContext);
    });

    it.each([
      'DARK',
      'Dark',
      'DaRk',
      'DARK MODE',
      'Dark Mode',
    ])('should handle case variations: "%s"', async (input) => {
      await setThemeTool.execute({ theme: input });

      expect(mockBroadcastUserEvent).toHaveBeenCalledWith('test-user-123', 'theme_change', {
        theme: 'dark',
        source: 'voice',
      });
    });
  });

  describe('Whitespace Handling', () => {
    let setThemeTool: Tool;

    beforeEach(() => {
      const def = themeToolDefinitions.find((t) => t.id === 'setTheme');
      setThemeTool = def!.create(mockContext);
    });

    it.each([
      '  dark  ',
      '\tdark\n',
      '   light mode   ',
    ])('should trim whitespace: "%s"', async (input) => {
      await setThemeTool.execute({ theme: input });

      expect(mockBroadcastUserEvent).toHaveBeenCalled();
    });
  });
});
