/**
 * Books Domain Tools
 *
 * Tools for book discovery and reading list management.
 * Uses Google Books API for discovery and Firestore for reading lists.
 *
 * DOMAIN: books
 * TOOLS:
 *   Discovery: searchBooks, getBookRecommendations, getBookDetails
 *   Reading Lists: addToReadingList, getReadingList, markBookRead, removeFromReadingList
 *   Stats: getReadingStats
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import { getLogger } from '../../../utils/safe-logger.js';
// Import book services
import { searchBooks, getBookDetails, getBookRecommendations, getPopularBooks, } from '../../../services/books/google-books.js';
import { addToReadingList, getReadingList, updateReadingStatus, markBookAsRead, removeFromReadingList, getReadingStats, } from '../../../services/books/reading-list-store.js';
const log = getLogger();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function formatBookForSpeech(book) {
    const author = book.authors.join(', ');
    const rating = book.averageRating ? ` (${book.averageRating}/5 stars)` : '';
    const pages = book.pageCount ? ` - ${book.pageCount} pages` : '';
    return `"${book.title}" by ${author}${rating}${pages}`;
}
function formatBookList(books, limit = 5) {
    const limited = books.slice(0, limit);
    if (limited.length === 0)
        return 'No books found.';
    if (limited.length === 1) {
        const book = limited[0];
        return `I found ${formatBookForSpeech(book)}.`;
    }
    const formatted = limited.map((book, i) => `${i + 1}. ${formatBookForSpeech(book)}`);
    return `Here are some books:\n${formatted.join('\n')}`;
}
function formatReadingListEntry(entry) {
    const author = entry.authors.join(', ');
    const status = entry.status.replace('_', ' ');
    const progress = entry.currentPage && entry.pageCount
        ? ` (${Math.round((entry.currentPage / entry.pageCount) * 100)}% complete)`
        : '';
    return `"${entry.title}" by ${author} - ${status}${progress}`;
}
function formatReadingList(entries) {
    if (entries.length === 0)
        return 'Your reading list is empty.';
    const formatted = entries.map((entry, i) => `${i + 1}. ${formatReadingListEntry(entry)}`);
    return `Your reading list:\n${formatted.join('\n')}`;
}
// ============================================================================
// DISCOVERY TOOLS
// ============================================================================
const searchBooksTool = {
    id: 'searchBooks',
    name: 'Search Books',
    description: 'Search for books by title, author, or topic',
    domain: 'books',
    tags: ['books', 'discovery', 'search', 'reading'],
    create: (ctx) => {
        return llm.tool({
            description: 'Search for books by title, author, or topic. Returns book details including ratings and descriptions.',
            parameters: z.object({
                query: z.string().describe('Search query (title, author, or topic)'),
                limit: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe('Maximum number of results (default: 5)'),
            }),
            execute: async ({ query, limit = 5 }) => {
                log.info({ query, limit, userId: ctx.userId }, 'Searching books');
                try {
                    const result = await searchBooks(query, { limit });
                    if (!result.found || result.books.length === 0) {
                        return `Couldn't find books matching "${query}". Try a different search?`;
                    }
                    return formatBookList(result.books, limit);
                }
                catch (error) {
                    log.error({ error: String(error), query }, 'Book search failed');
                    return "Sorry, I couldn't search for books right now. Try again?";
                }
            },
        });
    },
};
const getBookRecommendationsTool = {
    id: 'getBookRecommendations',
    name: 'Get Book Recommendations',
    description: 'Get book recommendations based on interests or genre',
    domain: 'books',
    tags: ['books', 'recommendations', 'discovery', 'reading'],
    create: (ctx) => {
        return llm.tool({
            description: 'Get book recommendations based on interests or genre. Great for discovering new reads.',
            parameters: z.object({
                interests: z
                    .array(z.string())
                    .describe('List of interests or topics (e.g., ["psychology", "habits"])'),
                genre: z
                    .enum([
                    'fiction',
                    'nonfiction',
                    'mystery',
                    'romance',
                    'science_fiction',
                    'fantasy',
                    'biography',
                    'history',
                    'science',
                    'self_help',
                    'business',
                    'philosophy',
                    'psychology',
                    'poetry',
                    'cooking',
                    'travel',
                    'art',
                    'health',
                    'religion',
                    'children',
                ])
                    .optional()
                    .describe('Genre to filter by'),
                limit: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe('Maximum number of results (default: 5)'),
            }),
            execute: async ({ interests, genre, limit = 5 }) => {
                log.info({ interests, genre, limit, userId: ctx.userId }, 'Getting book recommendations');
                try {
                    const result = await getBookRecommendations(interests, {
                        limit,
                        genre: genre,
                    });
                    if (!result.found || result.books.length === 0) {
                        return `Couldn't find books matching your interests. Try different topics?`;
                    }
                    const genreText = genre ? ` ${genre.replace('_', ' ')}` : '';
                    const intro = `Based on your interest in ${interests.join(', ')}${genreText}:`;
                    return `${intro}\n${formatBookList(result.books, limit)}`;
                }
                catch (error) {
                    log.error({ error: String(error), interests }, 'Book recommendations failed');
                    return "Sorry, I couldn't get recommendations right now. Try again?";
                }
            },
        });
    },
};
const getBookDetailsTool = {
    id: 'getBookDetails',
    name: 'Get Book Details',
    description: 'Get detailed information about a specific book',
    domain: 'books',
    tags: ['books', 'details', 'info'],
    create: (_ctx) => {
        return llm.tool({
            description: 'Get detailed information about a specific book including description, page count, and preview link.',
            parameters: z.object({
                bookId: z.string().describe('The Google Books ID'),
            }),
            execute: async ({ bookId }) => {
                log.info({ bookId }, 'Getting book details');
                try {
                    const result = await getBookDetails(bookId);
                    if (!result.found || !result.book) {
                        return "Couldn't find that book. It might be unavailable.";
                    }
                    const book = result.book;
                    const authors = book.authors.join(', ');
                    const rating = book.averageRating
                        ? `Rating: ${book.averageRating}/5 (${book.ratingsCount} reviews)`
                        : '';
                    const pages = book.pageCount ? `Pages: ${book.pageCount}` : '';
                    const description = book.description
                        ? `\nDescription: ${book.description.slice(0, 300)}...`
                        : '';
                    const preview = book.previewLink ? `\nPreview: ${book.previewLink}` : '';
                    const details = [
                        `"${book.title}" by ${authors}`,
                        rating,
                        pages,
                        book.categories.length ? `Categories: ${book.categories.join(', ')}` : '',
                        description,
                        preview,
                    ]
                        .filter(Boolean)
                        .join('\n');
                    return details;
                }
                catch (error) {
                    log.error({ error: String(error), bookId }, 'Book details fetch failed');
                    return "Sorry, I couldn't get book details. Try again?";
                }
            },
        });
    },
};
const getPopularBooksTool = {
    id: 'getPopularBooks',
    name: 'Get Popular Books',
    description: 'Get popular/bestseller books, optionally by genre',
    domain: 'books',
    tags: ['books', 'popular', 'bestsellers', 'discovery'],
    create: (_ctx) => {
        return llm.tool({
            description: 'Get popular and bestselling books. Can filter by genre like fiction, nonfiction, mystery, romance, self_help, business, etc.',
            parameters: z.object({
                genre: z
                    .enum([
                    'fiction',
                    'nonfiction',
                    'mystery',
                    'romance',
                    'science_fiction',
                    'fantasy',
                    'biography',
                    'history',
                    'science',
                    'self_help',
                    'business',
                    'philosophy',
                    'psychology',
                ])
                    .optional()
                    .describe('Genre to filter by'),
                limit: z
                    .number()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe('Maximum number of results (default: 5)'),
            }),
            execute: async ({ genre, limit = 5 }) => {
                log.info({ genre, limit }, 'Getting popular books');
                try {
                    const result = await getPopularBooks(genre, limit);
                    if (!result.found || result.books.length === 0) {
                        return genre
                            ? `Couldn't find popular ${genre.replace('_', ' ')} books. Try a different genre?`
                            : "Couldn't find popular books right now.";
                    }
                    const genreText = genre ? ` ${genre.replace('_', ' ')}` : '';
                    const intro = `Popular${genreText} books:`;
                    return `${intro}\n${formatBookList(result.books, limit)}`;
                }
                catch (error) {
                    log.error({ error: String(error), genre }, 'Popular books fetch failed');
                    return "Sorry, I couldn't get popular books. Try again?";
                }
            },
        });
    },
};
// ============================================================================
// READING LIST TOOLS
// ============================================================================
const addToReadingListTool = {
    id: 'addToReadingList',
    name: 'Add to Reading List',
    description: 'Add a book to your reading list',
    domain: 'books',
    tags: ['books', 'reading-list', 'save'],
    create: (ctx) => {
        return llm.tool({
            description: "Add a book to the user's reading list for later. Can set priority and add notes.",
            parameters: z.object({
                bookId: z.string().describe('The Google Books ID'),
                title: z.string().describe('The book title'),
                authors: z.array(z.string()).describe('Book authors'),
                imageUrl: z.string().optional().describe('Book cover image URL'),
                pageCount: z.number().optional().describe('Number of pages'),
                priority: z.enum(['high', 'medium', 'low']).optional().describe('Reading priority'),
                notes: z.string().optional().describe('Personal notes about why to read this book'),
            }),
            execute: async ({ bookId, title, authors, imageUrl, pageCount, priority, notes }) => {
                log.info({ bookId, title, userId: ctx.userId }, 'Adding to reading list');
                try {
                    const result = await addToReadingList(ctx.userId, { bookId, title, authors, imageUrl, pageCount }, { priority, notes });
                    if (!result.success) {
                        return result.error || "Couldn't add to reading list.";
                    }
                    const priorityText = priority ? ` with ${priority} priority` : '';
                    return `Added "${title}" to your reading list${priorityText}!`;
                }
                catch (error) {
                    log.error({ error: String(error), bookId }, 'Add to reading list failed');
                    return "Sorry, I couldn't add that book. Try again?";
                }
            },
        });
    },
};
const getReadingListTool = {
    id: 'getReadingList',
    name: 'Get Reading List',
    description: 'View your reading list',
    domain: 'books',
    tags: ['books', 'reading-list', 'view'],
    create: (ctx) => {
        return llm.tool({
            description: "Get the user's reading list. Can filter by status (want_to_read, reading, completed).",
            parameters: z.object({
                status: z
                    .enum(['want_to_read', 'reading', 'completed', 'abandoned'])
                    .optional()
                    .describe('Filter by reading status'),
                limit: z.number().min(1).max(20).optional().describe('Maximum books to show (default: 10)'),
            }),
            execute: async ({ status, limit = 10 }) => {
                log.info({ status, limit, userId: ctx.userId }, 'Getting reading list');
                try {
                    const result = await getReadingList(ctx.userId, { status, limit });
                    if (!result.success || !result.list) {
                        return result.error || "Couldn't get your reading list.";
                    }
                    if (result.list.entries.length === 0) {
                        if (status) {
                            return `No books with status "${status.replace('_', ' ')}" in your reading list.`;
                        }
                        return 'Your reading list is empty. Want me to help you find some books?';
                    }
                    const statusText = status ? ` (${status.replace('_', ' ')})` : '';
                    const statsText = `\nTotal: ${result.list.stats.total} books | Reading: ${result.list.stats.reading} | Completed: ${result.list.stats.completed}`;
                    return `Your reading list${statusText}:\n${formatReadingList(result.list.entries)}${statsText}`;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Get reading list failed');
                    return "Sorry, I couldn't get your reading list. Try again?";
                }
            },
        });
    },
};
const updateReadingProgressTool = {
    id: 'updateReadingProgress',
    name: 'Update Reading Progress',
    description: 'Update reading progress or status for a book',
    domain: 'books',
    tags: ['books', 'reading-list', 'progress'],
    create: (ctx) => {
        return llm.tool({
            description: 'Update reading progress for a book in the reading list.',
            parameters: z.object({
                entryId: z.string().describe('The reading list entry ID'),
                status: z
                    .enum(['want_to_read', 'reading', 'completed', 'abandoned'])
                    .optional()
                    .describe('New reading status'),
                currentPage: z.number().optional().describe('Current page number'),
                notes: z.string().optional().describe('Add or update notes'),
            }),
            execute: async ({ entryId, status, currentPage, notes }) => {
                log.info({ entryId, status, currentPage, userId: ctx.userId }, 'Updating reading progress');
                try {
                    const result = await updateReadingStatus(ctx.userId, entryId, {
                        status,
                        currentPage,
                        notes,
                    });
                    if (!result.success) {
                        return result.error || "Couldn't update reading progress.";
                    }
                    const updates = [];
                    if (status)
                        updates.push(`status to "${status.replace('_', ' ')}"`);
                    if (currentPage)
                        updates.push(`progress to page ${currentPage}`);
                    if (notes)
                        updates.push('notes');
                    return `Updated ${updates.join(', ')} for "${result.entry?.title}"!`;
                }
                catch (error) {
                    log.error({ error: String(error), entryId }, 'Update reading progress failed');
                    return "Sorry, I couldn't update that. Try again?";
                }
            },
        });
    },
};
const markBookReadTool = {
    id: 'markBookRead',
    name: 'Mark Book Read',
    description: 'Mark a book as completed',
    domain: 'books',
    tags: ['books', 'reading-list', 'complete'],
    create: (ctx) => {
        return llm.tool({
            description: 'Mark a book in the reading list as completed. Optionally add a rating.',
            parameters: z.object({
                entryId: z.string().describe('The reading list entry ID'),
                rating: z.number().min(1).max(5).optional().describe('Rating from 1 to 5 stars'),
            }),
            execute: async ({ entryId, rating }) => {
                log.info({ entryId, rating, userId: ctx.userId }, 'Marking book as read');
                try {
                    const result = await markBookAsRead(ctx.userId, entryId, rating);
                    if (!result.success) {
                        return result.error || "Couldn't mark that book as read.";
                    }
                    const ratingText = rating ? ` and rated it ${rating}/5 stars` : '';
                    return `Marked "${result.entry?.title}" as completed${ratingText}! Nice work finishing it!`;
                }
                catch (error) {
                    log.error({ error: String(error), entryId }, 'Mark book read failed');
                    return "Sorry, I couldn't update that. Try again?";
                }
            },
        });
    },
};
const removeFromReadingListTool = {
    id: 'removeFromReadingList',
    name: 'Remove from Reading List',
    description: 'Remove a book from your reading list',
    domain: 'books',
    tags: ['books', 'reading-list', 'remove'],
    create: (ctx) => {
        return llm.tool({
            description: 'Remove a book from the reading list.',
            parameters: z.object({
                entryId: z.string().describe('The reading list entry ID'),
            }),
            execute: async ({ entryId }) => {
                log.info({ entryId, userId: ctx.userId }, 'Removing from reading list');
                try {
                    const result = await removeFromReadingList(ctx.userId, entryId);
                    if (!result.success) {
                        return result.error || "Couldn't remove that book.";
                    }
                    return 'Removed from your reading list.';
                }
                catch (error) {
                    log.error({ error: String(error), entryId }, 'Remove from reading list failed');
                    return "Sorry, I couldn't remove that. Try again?";
                }
            },
        });
    },
};
const getReadingStatsTool = {
    id: 'getReadingStats',
    name: 'Get Reading Stats',
    description: 'Get your reading statistics',
    domain: 'books',
    tags: ['books', 'reading-list', 'stats'],
    create: (ctx) => {
        return llm.tool({
            description: 'Get reading statistics including books read, pages read, and average rating.',
            parameters: z.object({}),
            execute: async () => {
                log.info({ userId: ctx.userId }, 'Getting reading stats');
                try {
                    const result = await getReadingStats(ctx.userId);
                    if (!result.success || !result.stats) {
                        return result.error || "Couldn't get reading stats.";
                    }
                    const stats = result.stats;
                    const lines = [
                        'Your Reading Stats:',
                        `Books in library: ${stats.totalBooks}`,
                        `Currently reading: ${stats.booksReading}`,
                        `Completed: ${stats.booksCompleted}`,
                        `Want to read: ${stats.booksWantToRead}`,
                        `Pages read: ${stats.pagesRead.toLocaleString()}`,
                    ];
                    if (stats.averageRating > 0) {
                        lines.push(`Average rating: ${stats.averageRating}/5`);
                    }
                    return lines.join('\n');
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Get reading stats failed');
                    return "Sorry, I couldn't get your stats. Try again?";
                }
            },
        });
    },
};
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
const bookTools = [
    // Discovery
    searchBooksTool,
    getBookRecommendationsTool,
    getBookDetailsTool,
    getPopularBooksTool,
    // Reading List
    addToReadingListTool,
    getReadingListTool,
    updateReadingProgressTool,
    markBookReadTool,
    removeFromReadingListTool,
    getReadingStatsTool,
];
export const { getToolDefinitions, domain, definitions } = createDomainExport('books', bookTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map