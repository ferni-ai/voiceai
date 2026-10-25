/**
 * Language Tools Tests
 *
 * Tests for the language preference tools in the settings domain.
 *
 * @module tools/domains/settings/__tests__/language-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mock language service
const mockSetSessionLanguage = vi.fn();
const mockGetLanguageConfig = vi.fn();
const mockParseLanguageName = vi.fn();
const mockPersistUserLanguagePreference = vi.fn();
const mockGetSupportedLanguagesList = vi.fn();
const mockGetSessionLanguageState = vi.fn();

vi.mock('../../../../services/language/index.js', async () => {
  // The truthfulness helpers are the production ones, not stand-ins.
  const actual = await vi.importActual<
    typeof import('../../../../services/language/live-capability.js')
  >('../../../../services/language/live-capability.js');
  return {
    canSpeakLanguageLive: actual.canSpeakLanguageLive,
    languageNotLiveMessage: actual.languageNotLiveMessage,
    currentCallLanguageMessage: actual.currentCallLanguageMessage,
    parseLanguageName: (lang: string) => mockParseLanguageName(lang),
    setSessionLanguage: (sessionId: string, lang: string, userId?: string) =>
      mockSetSessionLanguage(sessionId, lang, userId),
    getLanguageConfig: (lang: string) => mockGetLanguageConfig(lang),
    persistUserLanguagePreference: (userId: string, lang: string) =>
      mockPersistUserLanguagePreference(userId, lang),
    getSupportedLanguagesList: () => mockGetSupportedLanguagesList(),
    getSessionLanguageState: (sessionId: string) => mockGetSessionLanguageState(sessionId),
  };
});

// Import after mocks
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';
import { getToolDefinitions, languageToolDefinitions } from '../index.js';

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

describe('Language Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();

    // Default mock implementations
    mockGetLanguageConfig.mockReturnValue({
      spokenLanguage: 'es',
      sttLanguage: 'es-ES',
      ttsLanguage: 'es',
      displayName: 'Spanish',
      nativeName: 'Español',
      fullySupported: true,
    });

    mockGetSupportedLanguagesList.mockReturnValue([
      { code: 'en-US', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'ja', name: 'Japanese' },
    ]);

    mockSetSessionLanguage.mockReturnValue({
      spokenLanguage: 'es',
      displayName: 'Spanish',
      nativeName: 'Español',
      fullySupported: true,
    });

    mockPersistUserLanguagePreference.mockResolvedValue(undefined);
  });

  describe('Tool Loading', () => {
    it('should load all language tool definitions', async () => {
      // getToolDefinitions() returns ALL settings tools (language + theme = 5)
      expect(toolDefinitions.length).toBe(5);
      // languageToolDefinitions is just the language tools (3)
      expect(languageToolDefinitions.length).toBe(3);
    });

    it('should have correct tool IDs', async () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('setSpokenLanguage');
      expect(toolIds).toContain('listSupportedLanguages');
      expect(toolIds).toContain('getCurrentLanguage');
    });

    it('should have settings domain', async () => {
      toolDefinitions.forEach((t) => {
        expect(t.domain).toBe('settings');
      });
    });
  });

  describe('setSpokenLanguage Tool', () => {
    let setLanguageTool: Tool;

    beforeEach(() => {
      const def = toolDefinitions.find((t) => t.id === 'setSpokenLanguage');
      setLanguageTool = def!.create(mockContext);
    });

    it('Spanish: remembers the preference but never claims a switch calls cannot do', async () => {
      mockParseLanguageName.mockReturnValue('es');

      const result = await setLanguageTool.execute({ language: 'Spanish' });

      expect(mockParseLanguageName).toHaveBeenCalledWith('Spanish');
      expect(mockSetSessionLanguage).toHaveBeenCalledWith('test-user-123', 'es', 'test-user-123');
      expect(mockPersistUserLanguagePreference).toHaveBeenCalledWith('test-user-123', 'es');
      expect(result).not.toMatch(/now speak|switched to Spanish|language switched/i);
      expect(result).toMatch(/only talk in English on calls/);
      expect(result).toMatch(/noted you'd like Spanish/);
      expect(result).toMatch(/Spanish words or phrases/);
    });

    it('English: confirmation unchanged', async () => {
      mockParseLanguageName.mockReturnValue('en');
      mockSetSessionLanguage.mockReturnValue({
        spokenLanguage: 'en',
        displayName: 'English',
        nativeName: 'English',
        fullySupported: true,
      });

      const result = await setLanguageTool.execute({ language: 'English' });

      expect(result).toBe(
        "Language switched to English (English). I'll now speak to you in English."
      );
      expect(mockPersistUserLanguagePreference).toHaveBeenCalledWith('test-user-123', 'en');
    });

    it('should handle unrecognized language gracefully', async () => {
      mockParseLanguageName.mockReturnValue(null);

      const result = await setLanguageTool.execute({ language: 'Klingon' });

      expect(result).toContain("I'm not sure which language");
      expect(result).toContain('Klingon');
      expect(mockSetSessionLanguage).not.toHaveBeenCalled();
    });

    it('should persist language preference for authenticated users', async () => {
      mockParseLanguageName.mockReturnValue('fr');

      await setLanguageTool.execute({ language: 'French' });

      // Note: persistence is fire-and-forget, so we just check it was called
      expect(mockPersistUserLanguagePreference).toHaveBeenCalledWith('test-user-123', 'fr');
    });

    it('limited-support languages get the same honest answer, not a switch', async () => {
      mockParseLanguageName.mockReturnValue('zh');
      mockSetSessionLanguage.mockReturnValue({
        spokenLanguage: 'zh',
        displayName: 'Chinese',
        nativeName: '中文',
        fullySupported: false,
      });
      mockGetLanguageConfig.mockReturnValue({
        spokenLanguage: 'zh',
        displayName: 'Chinese',
        nativeName: '中文',
        fullySupported: false,
      });

      const result = await setLanguageTool.execute({ language: 'Chinese' });

      expect(result).not.toMatch(/switched/i);
      expect(result).toMatch(/noted you'd like Chinese/);
    });
  });

  describe('listSupportedLanguages Tool', () => {
    let listLanguagesTool: Tool;

    beforeEach(() => {
      const def = toolDefinitions.find((t) => t.id === 'listSupportedLanguages');
      listLanguagesTool = def!.create(mockContext);
    });

    it('should list all supported languages', async () => {
      const result = await listLanguagesTool.execute({});

      expect(result).toContain('English');
      expect(result).toContain('Spanish');
      expect(result).toContain('French');
      expect(result).toContain('Japanese');
    });

    it('says calls are English-only instead of offering to switch', async () => {
      const result = await listLanguagesTool.execute({});

      expect(result).toContain('only talk in English');
      expect(result).not.toMatch(/I'll switch|I can speak many/i);
    });
  });

  describe('getCurrentLanguage Tool', () => {
    let getCurrentLanguageTool: Tool;

    beforeEach(() => {
      const def = toolDefinitions.find((t) => t.id === 'getCurrentLanguage');
      getCurrentLanguageTool = def!.create(mockContext);
    });

    it('should return current language when session state exists', async () => {
      mockGetSessionLanguageState.mockReturnValue({
        currentLanguage: 'es',
        preferredLanguage: 'es',
        autoDetected: false,
      });

      const result = await getCurrentLanguageTool.execute({});

      expect(result).toContain('Spanish');
      expect(result).not.toMatch(/speaking (in )?Spanish/i);
      expect(result).toMatch(/speaking English/);
    });

    it('should indicate auto-detection when applicable', async () => {
      mockGetSessionLanguageState.mockReturnValue({
        currentLanguage: 'ja',
        preferredLanguage: 'en',
        autoDetected: true,
      });
      mockGetLanguageConfig.mockReturnValue({
        displayName: 'Japanese',
        nativeName: '日本語',
        fullySupported: true,
      });

      const result = await getCurrentLanguageTool.execute({});

      expect(result).toContain('Japanese');
      expect(result).toContain('detected');
    });

    it('should default to English when no session state', async () => {
      mockGetSessionLanguageState.mockReturnValue(null);

      const result = await getCurrentLanguageTool.execute({});

      expect(result).toContain('English');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully in setSpokenLanguage', async () => {
      const def = toolDefinitions.find((t) => t.id === 'setSpokenLanguage');
      const tool = def!.create(mockContext);

      mockParseLanguageName.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await tool.execute({ language: 'Spanish' });

      expect(result).toContain('trouble switching');
      expect(result).toContain('English');
    });

    it('should provide fallback in listSupportedLanguages on error', async () => {
      const def = toolDefinitions.find((t) => t.id === 'listSupportedLanguages');
      const tool = def!.create(mockContext);

      mockGetSupportedLanguagesList.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const result = await tool.execute({});

      // Should return hardcoded fallback list
      expect(result).toContain('English');
      expect(result).toContain('Spanish');
    });
  });
});
