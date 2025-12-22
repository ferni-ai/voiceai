/**
 * Books Domain Tools Tests
 * Run with: npx vitest run src/tools/domains/books/__tests__/books.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted to ensure mock functions are available before vi.mock executes
const {
  mockSearchBooks,
  mockGetBookDetails,
  mockGetBookRecommendations,
  mockGetPopularBooks,
  mockAddToReadingList,
  mockGetReadingList,
  mockUpdateReadingStatus,
  mockMarkBookAsRead,
  mockRemoveFromReadingList,
  mockGetReadingStats,
} = vi.hoisted(() => ({
  mockSearchBooks: vi.fn(),
  mockGetBookDetails: vi.fn(),
  mockGetBookRecommendations: vi.fn(),
  mockGetPopularBooks: vi.fn(),
  mockAddToReadingList: vi.fn(),
  mockGetReadingList: vi.fn(),
  mockUpdateReadingStatus: vi.fn(),
  mockMarkBookAsRead: vi.fn(),
  mockRemoveFromReadingList: vi.fn(),
  mockGetReadingStats: vi.fn(),
}));

// Standard mocks
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock the Google Books service
vi.mock('../../../../services/books/google-books.js', () => ({
  searchBooks: mockSearchBooks,
  getBookDetails: mockGetBookDetails,
  getBookRecommendations: mockGetBookRecommendations,
  getPopularBooks: mockGetPopularBooks,
}));

// Mock the Reading List Store
vi.mock('../../../../services/books/reading-list-store.js', () => ({
  addToReadingList: mockAddToReadingList,
  getReadingList: mockGetReadingList,
  updateReadingStatus: mockUpdateReadingStatus,
  markBookAsRead: mockMarkBookAsRead,
  removeFromReadingList: mockRemoveFromReadingList,
  getReadingStats: mockGetReadingStats,
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
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

describe('Books Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all book tool definitions', async () => {
      expect(toolDefinitions.length).toBe(10);
    });

    it('should have correct tool IDs', () => {
      const ids = toolDefinitions.map((t) => t.id);
      // Discovery tools
      expect(ids).toContain('searchBooks');
      expect(ids).toContain('getBookRecommendations');
      expect(ids).toContain('getBookDetails');
      expect(ids).toContain('getPopularBooks');
      // Reading list tools
      expect(ids).toContain('addToReadingList');
      expect(ids).toContain('getReadingList');
      expect(ids).toContain('updateReadingProgress');
      expect(ids).toContain('markBookRead');
      expect(ids).toContain('removeFromReadingList');
      expect(ids).toContain('getReadingStats');
    });

    it('should have correct domain assignment', () => {
      toolDefinitions.forEach((def) => {
        expect(def.domain).toBe('books');
      });
    });
  });

  // ========================================================================
  // DISCOVERY TOOLS
  // ========================================================================

  describe('searchBooks', () => {
    it('should search for books and return formatted results', async () => {
      mockSearchBooks.mockResolvedValue({
        found: true,
        books: [
          {
            title: 'Clean Code',
            authors: ['Robert C. Martin'],
            averageRating: 4.5,
            pageCount: 464,
          },
          { title: 'The Pragmatic Programmer', authors: ['David Thomas'], pageCount: 352 },
        ],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchBooks')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'programming', limit: 5 });

      expect(mockSearchBooks).toHaveBeenCalledWith('programming', { limit: 5 });
      expect(result).toContain('Clean Code');
      expect(result).toContain('Robert C. Martin');
      expect(result).toContain('4.5/5 stars');
      expect(result).toContain('464 pages');
    });

    it('should handle no results gracefully', async () => {
      mockSearchBooks.mockResolvedValue({
        found: false,
        books: [],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchBooks')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'xyznonexistent' });

      expect(result).toContain("Couldn't find");
    });
  });

  describe('getBookRecommendations', () => {
    it('should get recommendations based on interests', async () => {
      mockGetBookRecommendations.mockResolvedValue({
        found: true,
        books: [{ title: 'Atomic Habits', authors: ['James Clear'], averageRating: 4.7 }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getBookRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        interests: ['habits', 'productivity'],
      });

      expect(result).toContain('Atomic Habits');
      expect(result).toContain('habits');
      expect(result).toContain('productivity');
    });

    it('should include genre in intro when provided', async () => {
      mockGetBookRecommendations.mockResolvedValue({
        found: true,
        books: [{ title: 'Self Help Book', authors: ['Author'] }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getBookRecommendations')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        interests: ['mindfulness'],
        genre: 'self_help',
      });

      expect(result).toContain('self help');
    });
  });

  describe('getBookDetails', () => {
    it('should get book details', async () => {
      mockGetBookDetails.mockResolvedValue({
        found: true,
        book: {
          title: 'Detailed Book',
          authors: ['Famous Author'],
          averageRating: 4.8,
          ratingsCount: 500,
          pageCount: 300,
          description: 'A very detailed description of the book.',
          categories: ['Self-Help', 'Psychology'],
          previewLink: 'https://books.google.com/preview',
        },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getBookDetails')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ bookId: 'book123' });

      expect(result).toContain('Detailed Book');
      expect(result).toContain('Famous Author');
      expect(result).toContain('4.8/5');
      expect(result).toContain('300');
      expect(result).toContain('Self-Help');
    });

    it('should handle book not found', async () => {
      mockGetBookDetails.mockResolvedValue({
        found: false,
        book: null,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getBookDetails')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ bookId: 'nonexistent' });

      expect(result).toContain("Couldn't find");
    });
  });

  describe('getPopularBooks', () => {
    it('should get popular books', async () => {
      mockGetPopularBooks.mockResolvedValue({
        found: true,
        books: [{ title: 'Bestseller', authors: ['Famous Writer'] }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPopularBooks')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Popular');
      expect(result).toContain('Bestseller');
    });

    it('should filter by genre when provided', async () => {
      mockGetPopularBooks.mockResolvedValue({
        found: true,
        books: [{ title: 'Mystery Novel', authors: ['Mystery Author'] }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getPopularBooks')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ genre: 'mystery' });

      expect(result).toContain('mystery');
    });
  });

  // ========================================================================
  // READING LIST TOOLS
  // ========================================================================

  describe('addToReadingList', () => {
    it('should add book to reading list', async () => {
      mockAddToReadingList.mockResolvedValue({
        success: true,
        entry: { title: 'New Book', status: 'want_to_read' },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'addToReadingList')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        bookId: 'google_123',
        title: 'New Book',
        authors: ['Author'],
        priority: 'high',
      });

      expect(mockAddToReadingList).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ bookId: 'google_123', title: 'New Book' }),
        expect.objectContaining({ priority: 'high' })
      );
      expect(result).toContain('Added');
      expect(result).toContain('New Book');
      expect(result).toContain('high priority');
    });

    it('should handle errors gracefully', async () => {
      mockAddToReadingList.mockResolvedValue({
        success: false,
        error: 'Database not available',
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'addToReadingList')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        bookId: 'book1',
        title: 'Book',
        authors: ['Author'],
      });

      expect(result).toContain('Database not available');
    });
  });

  describe('getReadingList', () => {
    it('should get reading list with stats', async () => {
      mockGetReadingList.mockResolvedValue({
        success: true,
        list: {
          entries: [
            { title: 'Book 1', authors: ['A'], status: 'reading', currentPage: 50, pageCount: 200 },
            { title: 'Book 2', authors: ['B'], status: 'want_to_read' },
          ],
          stats: { total: 2, reading: 1, completed: 0 },
        },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getReadingList')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Book 1');
      expect(result).toContain('reading');
      expect(result).toContain('25%'); // 50/200
      expect(result).toContain('Total: 2');
    });

    it('should filter by status when provided', async () => {
      mockGetReadingList.mockResolvedValue({
        success: true,
        list: {
          entries: [{ title: 'Reading Book', authors: ['A'], status: 'reading' }],
          stats: { total: 1, reading: 1, completed: 0 },
        },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getReadingList')!;
      const tool = toolDef.create(mockContext);
      await tool.execute({ status: 'reading' });

      expect(mockGetReadingList).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ status: 'reading' })
      );
    });

    it('should handle empty reading list', async () => {
      mockGetReadingList.mockResolvedValue({
        success: true,
        list: { entries: [], stats: { total: 0, reading: 0, completed: 0 } },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getReadingList')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('empty');
    });
  });

  describe('markBookRead', () => {
    it('should mark book as completed with rating', async () => {
      mockMarkBookAsRead.mockResolvedValue({
        success: true,
        entry: { title: 'Finished Book', status: 'completed', rating: 5 },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'markBookRead')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ entryId: 'entry123', rating: 5 });

      expect(mockMarkBookAsRead).toHaveBeenCalledWith('test-user-123', 'entry123', 5);
      expect(result).toContain('completed');
      expect(result).toContain('5/5 stars');
    });
  });

  describe('removeFromReadingList', () => {
    it('should remove book from reading list', async () => {
      mockRemoveFromReadingList.mockResolvedValue({ success: true });

      const toolDef = toolDefinitions.find((t) => t.id === 'removeFromReadingList')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ entryId: 'entry123' });

      expect(mockRemoveFromReadingList).toHaveBeenCalledWith('test-user-123', 'entry123');
      expect(result).toContain('Removed');
    });
  });

  describe('getReadingStats', () => {
    it('should get reading statistics', async () => {
      mockGetReadingStats.mockResolvedValue({
        success: true,
        stats: {
          totalBooks: 10,
          booksReading: 2,
          booksCompleted: 5,
          booksWantToRead: 3,
          pagesRead: 1500,
          averageRating: 4.2,
        },
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'getReadingStats')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toContain('Reading Stats');
      expect(result).toContain('10');
      expect(result).toContain('Currently reading: 2');
      expect(result).toContain('Completed: 5');
      expect(result).toContain('1,500');
      expect(result).toContain('4.2/5');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text in results', async () => {
      mockSearchBooks.mockResolvedValue({
        found: true,
        books: [{ title: 'Real Book', authors: ['Real Author'] }],
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'searchBooks')!;
      const tool = toolDef.create(mockContext);
      const result = await tool.execute({ query: 'test' });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
      expect(result).not.toContain('undefined');
    });
  });
});
