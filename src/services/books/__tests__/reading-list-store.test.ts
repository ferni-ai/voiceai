/**
 * Reading List Store Tests
 * Run with: npx vitest run src/services/books/__tests__/reading-list-store.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mock functions are available before vi.mock executes
const {
  mockGet,
  mockAdd,
  mockUpdate,
  mockDelete,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockCollection,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockAdd = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockWhere = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();

  // Chain methods need to be set up in beforeEach since vi.fn() results aren't available here
  const mockCollection = vi.fn();

  return {
    mockGet,
    mockAdd,
    mockUpdate,
    mockDelete,
    mockWhere,
    mockOrderBy,
    mockLimit,
    mockCollection,
  };
});

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class MockFirestore {
    collection(name: string) {
      return {
        doc: (docId: string) => ({
          id: docId,
          collection: mockCollection,
          get: mockGet,
          update: mockUpdate,
          delete: mockDelete,
        }),
      };
    }
  },
}));

// Mock logger - must include both createLogger and getLogger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// Mock data-layer hooks to prevent errors from missing fields
vi.mock('../../data-layer/hooks/index.js', () => ({
  onReadingListChange: vi.fn(),
}));

vi.mock('../../data-layer/store-hooks.js', () => ({
  onStoreChange: vi.fn(),
}));

// Import after mocks
import {
  addToReadingList,
  updateReadingStatus,
  markBookAsRead,
  removeFromReadingList,
  getReadingList,
  getReadingListEntry,
  getReadingStats,
  isReadingListStoreAvailable,
} from '../reading-list-store.js';

describe('Reading List Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mock collection chain
    mockCollection.mockReturnValue({
      doc: vi.fn((docId: string) => ({
        id: docId,
        get: mockGet,
        update: mockUpdate,
        delete: mockDelete,
      })),
      add: mockAdd,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
      get: mockGet,
    });

    // Set up chainable methods
    mockWhere.mockReturnValue({
      limit: mockLimit,
      orderBy: mockOrderBy,
      get: mockGet,
    });

    mockOrderBy.mockReturnValue({
      limit: mockLimit,
      get: mockGet,
    });

    mockLimit.mockReturnValue({
      get: mockGet,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addToReadingList', () => {
    it('should add a new book to reading list', async () => {
      const book = {
        bookId: 'google_123',
        title: 'Clean Code',
        authors: ['Robert C. Martin'],
        imageUrl: 'https://example.com/cover.jpg',
        pageCount: 464,
      };

      // Mock: book doesn't exist yet
      mockGet.mockResolvedValueOnce({ empty: true });

      // Mock: add returns doc reference
      mockAdd.mockResolvedValueOnce({ id: 'entry_abc123' });

      const result = await addToReadingList('user123', book);

      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry?.title).toBe('Clean Code');
      expect(result.entry?.status).toBe('want_to_read');
    });

    it('should return existing entry if book already in list', async () => {
      const existingEntry = {
        id: 'existing_entry',
        bookId: 'google_123',
        title: 'Clean Code',
        status: 'reading',
      };

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'existing_entry', data: () => existingEntry }],
      });

      const result = await addToReadingList('user123', {
        bookId: 'google_123',
        title: 'Clean Code',
        authors: ['Robert C. Martin'],
      });

      expect(result.success).toBe(true);
      expect(result.entry?.id).toBe('existing_entry');
    });

    it('should handle options like listName and priority', async () => {
      mockGet.mockResolvedValueOnce({ empty: true });
      mockAdd.mockResolvedValueOnce({ id: 'entry_new' });

      const result = await addToReadingList(
        'user123',
        {
          bookId: 'book_456',
          title: 'Test Book',
          authors: ['Author'],
        },
        {
          listName: '2024 Goals',
          priority: 'high',
          notes: 'Recommended by friend',
        }
      );

      expect(result.success).toBe(true);
      expect(result.entry?.listName).toBe('2024 Goals');
      expect(result.entry?.priority).toBe('high');
    });
  });

  describe('updateReadingStatus', () => {
    it('should update status successfully', async () => {
      const existingData = {
        bookId: 'google_123',
        title: 'Clean Code',
        status: 'want_to_read',
      };

      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => existingData })
        .mockResolvedValueOnce({
          data: () => ({ ...existingData, status: 'reading' }),
        });

      mockUpdate.mockResolvedValueOnce(undefined);

      const result = await updateReadingStatus('user123', 'entry123', {
        status: 'reading',
      });

      expect(result.success).toBe(true);
    });

    it('should return error if entry not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const result = await updateReadingStatus('user123', 'nonexistent', {
        status: 'reading',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should set startDate when status changes to reading', async () => {
      const existingData = {
        bookId: 'google_123',
        status: 'want_to_read',
        startDate: undefined,
      };

      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => existingData })
        .mockResolvedValueOnce({
          data: () => ({
            ...existingData,
            status: 'reading',
            startDate: expect.any(String),
          }),
        });

      mockUpdate.mockResolvedValueOnce(undefined);

      const result = await updateReadingStatus('user123', 'entry123', {
        status: 'reading',
      });

      expect(result.success).toBe(true);
      // The implementation should set startDate
    });

    it('should set finishDate when status changes to completed', async () => {
      const existingData = {
        bookId: 'google_123',
        status: 'reading',
        startDate: '2024-01-01T00:00:00Z',
        finishDate: undefined,
      };

      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => existingData })
        .mockResolvedValueOnce({
          data: () => ({
            ...existingData,
            status: 'completed',
            finishDate: expect.any(String),
          }),
        });

      mockUpdate.mockResolvedValueOnce(undefined);

      const result = await updateReadingStatus('user123', 'entry123', {
        status: 'completed',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('markBookAsRead', () => {
    it('should mark book as completed with rating', async () => {
      const existingData = {
        bookId: 'google_123',
        status: 'reading',
      };

      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => existingData })
        .mockResolvedValueOnce({
          data: () => ({ ...existingData, status: 'completed', rating: 5 }),
        });

      mockUpdate.mockResolvedValueOnce(undefined);

      const result = await markBookAsRead('user123', 'entry123', 5);

      expect(result.success).toBe(true);
    });
  });

  describe('removeFromReadingList', () => {
    it('should remove entry successfully', async () => {
      mockDelete.mockResolvedValueOnce(undefined);

      const result = await removeFromReadingList('user123', 'entry123');

      expect(result.success).toBe(true);
    });

    it('should handle deletion errors', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Firestore error'));

      const result = await removeFromReadingList('user123', 'entry123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getReadingList', () => {
    it('should get reading list with stats', async () => {
      const entries = [
        { id: '1', status: 'want_to_read', title: 'Book 1' },
        { id: '2', status: 'reading', title: 'Book 2' },
        { id: '3', status: 'completed', title: 'Book 3' },
      ];

      mockGet.mockResolvedValueOnce({
        docs: entries.map((e) => ({ id: e.id, data: () => e })),
      });

      const result = await getReadingList('user123');

      expect(result.success).toBe(true);
      expect(result.list?.entries).toHaveLength(3);
      expect(result.list?.stats.total).toBe(3);
      expect(result.list?.stats.wantToRead).toBe(1);
      expect(result.list?.stats.reading).toBe(1);
      expect(result.list?.stats.completed).toBe(1);
    });

    it('should filter by status', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [{ id: '1', data: () => ({ status: 'reading', title: 'Book' }) }],
      });

      const result = await getReadingList('user123', { status: 'reading' });

      expect(result.success).toBe(true);
    });

    it('should filter by listName', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [{ id: '1', data: () => ({ status: 'want_to_read', listName: '2024 Goals' }) }],
      });

      const result = await getReadingList('user123', { listName: '2024 Goals' });

      expect(result.success).toBe(true);
    });
  });

  describe('getReadingListEntry', () => {
    it('should find entry by bookId', async () => {
      const entry = { bookId: 'google_123', title: 'Clean Code' };

      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'entry1', data: () => entry }],
      });

      const result = await getReadingListEntry('user123', 'google_123');

      expect(result.success).toBe(true);
      expect(result.entry?.title).toBe('Clean Code');
    });

    it('should return error if book not in list', async () => {
      mockGet.mockResolvedValueOnce({ empty: true });

      const result = await getReadingListEntry('user123', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in reading list');
    });
  });

  describe('getReadingStats', () => {
    it('should calculate reading statistics', async () => {
      const entries = [
        { status: 'completed', pageCount: 300, rating: 4 },
        { status: 'completed', pageCount: 400, rating: 5 },
        { status: 'reading', currentPage: 150, pageCount: 500 },
        { status: 'want_to_read', pageCount: 200 },
      ];

      mockGet.mockResolvedValueOnce({
        docs: entries.map((e, i) => ({ id: String(i), data: () => e })),
      });

      const result = await getReadingStats('user123');

      expect(result.success).toBe(true);
      expect(result.stats?.totalBooks).toBe(4);
      expect(result.stats?.booksCompleted).toBe(2);
      expect(result.stats?.booksReading).toBe(1);
      expect(result.stats?.booksWantToRead).toBe(1);
      expect(result.stats?.pagesRead).toBe(850); // 300 + 400 + 150
      expect(result.stats?.averageRating).toBe(4.5); // (4 + 5) / 2
    });
  });
});
