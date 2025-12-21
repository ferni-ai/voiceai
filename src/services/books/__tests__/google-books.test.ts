/**
 * Google Books Service Tests
 * Run with: npx vitest run src/services/books/__tests__/google-books.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mock logger is available before vi.mock executes
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

vi.mock('../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: () => ({
    canRequest: () => true,
    execute: async <T>(fn: () => Promise<T>) => fn(),
  }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock('../../../utils/rate-limiter.js', () => ({
  getSlidingWindowLimiter: () => ({
    tryRequest: () => true,
    getResetTime: () => 60000,
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import {
  searchBooks,
  getBookDetails,
  searchBooksByAuthor,
  searchBooksByGenre,
  getBookRecommendations,
  getPopularBooks,
  isGoogleBooksApiAvailable,
  isApiKeyConfigured,
  type Book,
  type BookSearchResult,
} from '../google-books.js';

describe('Google Books Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchBooks', () => {
    it('should search for books successfully', async () => {
      const mockResponse = {
        totalItems: 100,
        items: [
          {
            id: 'book1',
            volumeInfo: {
              title: 'Clean Code',
              subtitle: 'A Handbook of Agile Software Craftsmanship',
              authors: ['Robert C. Martin'],
              publisher: 'Prentice Hall',
              publishedDate: '2008-08-01',
              description: 'A handbook for agile software development',
              pageCount: 464,
              categories: ['Computers'],
              averageRating: 4.5,
              ratingsCount: 1000,
              imageLinks: {
                thumbnail: 'http://books.google.com/thumb1.jpg',
              },
              previewLink: 'http://books.google.com/preview1',
              infoLink: 'http://books.google.com/info1',
              language: 'en',
              industryIdentifiers: [
                { type: 'ISBN_10', identifier: '0132350882' },
                { type: 'ISBN_13', identifier: '9780132350884' },
              ],
            },
          },
          {
            id: 'book2',
            volumeInfo: {
              title: 'The Pragmatic Programmer',
              authors: ['David Thomas', 'Andrew Hunt'],
              publisher: 'Addison-Wesley',
              publishedDate: '2019-09-13',
              pageCount: 352,
              categories: ['Computers'],
              language: 'en',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchBooks('clean code programming');

      expect(result.found).toBe(true);
      expect(result.books).toHaveLength(2);
      expect(result.books[0].title).toBe('Clean Code');
      expect(result.books[0].authors).toContain('Robert C. Martin');
      expect(result.books[0].isbn10).toBe('0132350882');
      expect(result.books[0].isbn13).toBe('9780132350884');
      expect(result.totalItems).toBe(100);
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalItems: 0 }),
      });

      const result = await searchBooks('nonexistent book xyz123');

      expect(result.found).toBe(false);
      expect(result.books).toHaveLength(0);
      expect(result.error).toContain("Couldn't find");
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await searchBooks('test');

      expect(result.found).toBe(false);
      expect(result.error).toBe('Search failed');
    });

    it('should respect limit and orderBy parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 50,
          items: [
            {
              id: 'b1',
              volumeInfo: { title: 'Book', authors: ['Author'], language: 'en' },
            },
          ],
        }),
      });

      await searchBooks('javascript', { limit: 5, orderBy: 'newest' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maxResults=5'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('orderBy=newest'),
        expect.any(Object)
      );
    });

    it('should convert http thumbnail URLs to https', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 1,
          items: [
            {
              id: 'b1',
              volumeInfo: {
                title: 'Book',
                authors: ['Author'],
                language: 'en',
                imageLinks: {
                  thumbnail: 'http://books.google.com/thumb.jpg',
                },
              },
            },
          ],
        }),
      });

      const result = await searchBooks('test');

      expect(result.books[0].imageUrl).toBe('https://books.google.com/thumb.jpg');
    });
  });

  describe('getBookDetails', () => {
    it('should get book details successfully', async () => {
      const mockResponse = {
        id: 'book123',
        volumeInfo: {
          title: 'Detailed Book',
          authors: ['Famous Author'],
          description: 'A very detailed description',
          pageCount: 300,
          averageRating: 4.8,
          ratingsCount: 500,
          language: 'en',
          infoLink: 'http://books.google.com/info',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getBookDetails('book123');

      expect(result.found).toBe(true);
      expect(result.book).toBeDefined();
      expect(result.book!.title).toBe('Detailed Book');
      expect(result.book!.averageRating).toBe(4.8);
    });

    it('should handle book not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getBookDetails('nonexistent');

      expect(result.found).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('searchBooksByAuthor', () => {
    it('should search books by author', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 10,
          items: [
            {
              id: 'b1',
              volumeInfo: {
                title: "Author's Book",
                authors: ['Stephen King'],
                language: 'en',
              },
            },
          ],
        }),
      });

      const result = await searchBooksByAuthor('Stephen King');

      expect(result.found).toBe(true);
      // URL encoding uses + for spaces and %3A for colons
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('inauthor%3AStephen+King'),
        expect.any(Object)
      );
    });
  });

  describe('searchBooksByGenre', () => {
    it('should search books by genre', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 20,
          items: [
            {
              id: 'mystery1',
              volumeInfo: {
                title: 'Mystery Novel',
                authors: ['Author'],
                categories: ['Mystery'],
                language: 'en',
              },
            },
          ],
        }),
      });

      const result = await searchBooksByGenre('mystery');

      expect(result.found).toBe(true);
      // URL encoding uses %3A for colons
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('subject%3Amystery'),
        expect.any(Object)
      );
    });
  });

  describe('getBookRecommendations', () => {
    it('should get recommendations based on interests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 5,
          items: [
            {
              id: 'rec1',
              volumeInfo: {
                title: 'Recommended Book',
                authors: ['Author'],
                language: 'en',
              },
            },
          ],
        }),
      });

      const result = await getBookRecommendations(['productivity', 'habits']);

      expect(result.found).toBe(true);
    });

    it('should include genre filter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 5,
          items: [
            {
              id: 'rec1',
              volumeInfo: { title: 'Book', authors: ['A'], language: 'en' },
            },
          ],
        }),
      });

      await getBookRecommendations(['mindfulness'], { genre: 'self_help' });

      // URL encoding uses %3A for colons and + for spaces
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('subject%3Aself+help'),
        expect.any(Object)
      );
    });
  });

  describe('getPopularBooks', () => {
    it('should get popular books', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 10,
          items: [
            {
              id: 'pop1',
              volumeInfo: { title: 'Bestseller', authors: ['Famous'], language: 'en' },
            },
          ],
        }),
      });

      const result = await getPopularBooks();

      expect(result.found).toBe(true);
    });

    it('should filter by genre when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 10,
          items: [
            {
              id: 'fic1',
              volumeInfo: { title: 'Fiction Book', authors: ['Author'], language: 'en' },
            },
          ],
        }),
      });

      await getPopularBooks('fiction');

      // URL encoding uses %3A for colons
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('subject%3Afiction'),
        expect.any(Object)
      );
    });
  });

  describe('isGoogleBooksApiAvailable', () => {
    it('should return true when API is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await isGoogleBooksApiAvailable();

      expect(result).toBe(true);
    });

    it('should return false when API is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await isGoogleBooksApiAvailable();

      expect(result).toBe(false);
    });
  });
});
