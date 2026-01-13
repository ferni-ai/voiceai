/**
 * Google Books API Service
 *
 * Provides book discovery using the Google Books API.
 * Works without API key (limited quota) or with key (higher quota).
 *
 * API Documentation: https://developers.google.com/books/docs/v1/using
 */
import { CircuitOpenError, getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getSlidingWindowLimiter } from '../../utils/rate-limiter.js';
const log = createLogger({ module: 'GoogleBooks' });
// Circuit breaker for Google Books API
const booksCircuitBreaker = getCircuitBreaker('google-books-api', {
    failureThreshold: 5,
    resetTimeout: 15000,
    successThreshold: 1,
});
// Rate limiter for Google Books API
// Without API key: 1,000 requests/day. With key: 10,000/day.
// Conservative: 15 requests per minute (~21,600/day potential, but respects burst limits)
const booksRateLimiter = getSlidingWindowLimiter('google-books-api', 15, 60000);
// ============================================================================
// CONFIGURATION
// ============================================================================
const GOOGLE_BOOKS_API_BASE = 'https://www.googleapis.com/books/v1';
function getApiKey() {
    return process.env.GOOGLE_BOOKS_API_KEY;
}
/**
 * Transform API response item to Book type.
 */
function transformToBook(item) {
    const info = item.volumeInfo;
    // Extract ISBNs
    let isbn10;
    let isbn13;
    for (const id of info.industryIdentifiers || []) {
        if (id.type === 'ISBN_10')
            isbn10 = id.identifier;
        if (id.type === 'ISBN_13')
            isbn13 = id.identifier;
    }
    return {
        id: item.id,
        title: info.title,
        subtitle: info.subtitle,
        authors: info.authors || ['Unknown Author'],
        publisher: info.publisher,
        publishedDate: info.publishedDate,
        description: info.description,
        pageCount: info.pageCount,
        categories: info.categories || [],
        averageRating: info.averageRating,
        ratingsCount: info.ratingsCount,
        imageUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:'),
        previewLink: info.previewLink,
        infoLink: info.infoLink || `https://books.google.com/books?id=${item.id}`,
        isbn10,
        isbn13,
        language: info.language || 'en',
    };
}
// ============================================================================
// GOOGLE BOOKS API
// ============================================================================
/**
 * Search for books.
 */
export async function searchBooks(query, options = {}) {
    const { limit = 10, startIndex = 0, orderBy = 'relevance', printType = 'books', langRestrict, } = options;
    if (!booksCircuitBreaker.canRequest()) {
        log.warn({ query }, 'Google Books circuit breaker is OPEN');
        return { found: false, books: [], error: 'Service temporarily unavailable' };
    }
    // Check rate limiter
    if (!booksRateLimiter.tryRequest()) {
        const waitTime = booksRateLimiter.getResetTime();
        log.warn({ query, waitTimeMs: waitTime }, 'Google Books rate limit exceeded');
        return { found: false, books: [], error: 'Rate limit exceeded. Please try again shortly.' };
    }
    const params = new URLSearchParams({
        q: query,
        maxResults: String(Math.min(limit, 40)), // API max is 40
        startIndex: String(startIndex),
        orderBy,
        printType,
    });
    if (langRestrict) {
        params.set('langRestrict', langRestrict);
    }
    const apiKey = getApiKey();
    if (apiKey) {
        params.set('key', apiKey);
    }
    const url = `${GOOGLE_BOOKS_API_BASE}/volumes?${params}`;
    log.info({ query, limit }, 'Searching books');
    try {
        const data = await booksCircuitBreaker.execute(async () => {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                throw new Error(`Google Books API error: ${response.status}`);
            }
            return (await response.json());
        });
        if (data.error) {
            return { found: false, books: [], error: data.error.message };
        }
        if (!data.items || data.items.length === 0) {
            return {
                found: false,
                books: [],
                error: `Couldn't find books matching "${query}"`,
            };
        }
        const books = data.items.map(transformToBook);
        log.info({ query, resultCount: books.length, totalItems: data.totalItems }, 'Book search complete');
        return {
            found: true,
            books,
            totalItems: data.totalItems,
        };
    }
    catch (error) {
        if (error instanceof CircuitOpenError) {
            return { found: false, books: [], error: 'Service temporarily unavailable' };
        }
        log.error({ error, query }, 'Book search failed');
        return { found: false, books: [], error: 'Search failed' };
    }
}
/**
 * Get book details by ID.
 */
export async function getBookDetails(bookId) {
    if (!booksCircuitBreaker.canRequest()) {
        return { found: false, error: 'Service temporarily unavailable' };
    }
    // Check rate limiter
    if (!booksRateLimiter.tryRequest()) {
        const waitTime = booksRateLimiter.getResetTime();
        log.warn({ bookId, waitTimeMs: waitTime }, 'Google Books rate limit exceeded');
        return { found: false, error: 'Rate limit exceeded. Please try again shortly.' };
    }
    const params = new URLSearchParams();
    const apiKey = getApiKey();
    if (apiKey) {
        params.set('key', apiKey);
    }
    const url = `${GOOGLE_BOOKS_API_BASE}/volumes/${bookId}?${params}`;
    log.info({ bookId }, 'Fetching book details');
    try {
        const data = await booksCircuitBreaker.execute(async () => {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Google Books API error: ${response.status}`);
            }
            return await response.json();
        });
        if (!data) {
            return { found: false, error: 'Book not found' };
        }
        const book = transformToBook(data);
        log.info({ bookId, title: book.title }, 'Book details fetched');
        return { found: true, book };
    }
    catch (error) {
        if (error instanceof CircuitOpenError) {
            return { found: false, error: 'Service temporarily unavailable' };
        }
        log.error({ error, bookId }, 'Book details fetch failed');
        return { found: false, error: 'Failed to fetch book details' };
    }
}
/**
 * Search books by author.
 */
export async function searchBooksByAuthor(author, limit = 10) {
    return searchBooks(`inauthor:${author}`, { limit });
}
/**
 * Search books by genre/category.
 */
export async function searchBooksByGenre(genre, limit = 10) {
    const genreQueries = {
        fiction: 'subject:fiction',
        nonfiction: 'subject:nonfiction',
        mystery: 'subject:mystery',
        romance: 'subject:romance',
        science_fiction: 'subject:science fiction',
        fantasy: 'subject:fantasy',
        biography: 'subject:biography',
        history: 'subject:history',
        science: 'subject:science',
        self_help: 'subject:self-help',
        business: 'subject:business',
        philosophy: 'subject:philosophy',
        psychology: 'subject:psychology',
        poetry: 'subject:poetry',
        cooking: 'subject:cooking',
        travel: 'subject:travel',
        art: 'subject:art',
        health: 'subject:health',
        religion: 'subject:religion',
        children: 'subject:juvenile fiction',
    };
    return searchBooks(genreQueries[genre], { limit, orderBy: 'relevance' });
}
/**
 * Get book recommendations based on interests.
 */
export async function getBookRecommendations(interests, options = {}) {
    const { limit = 5, genre } = options;
    // Build query from interests
    let query = interests.slice(0, 3).join(' ');
    if (genre) {
        query = `subject:${genre.replace('_', ' ')} ${query}`;
    }
    return searchBooks(query, { limit });
}
/**
 * Search for bestsellers or popular books.
 */
export async function getPopularBooks(genre, limit = 10) {
    // Google Books doesn't have a "bestseller" endpoint, so we search for well-rated books
    let query = 'bestseller OR award winning';
    if (genre) {
        query = `subject:${genre.replace('_', ' ')} ${query}`;
    }
    return searchBooks(query, { limit, orderBy: 'relevance' });
}
// ============================================================================
// HEALTH CHECK
// ============================================================================
/**
 * Check if Google Books API is available.
 */
export async function isGoogleBooksApiAvailable() {
    try {
        const params = new URLSearchParams({ q: 'test', maxResults: '1' });
        const apiKey = getApiKey();
        if (apiKey) {
            params.set('key', apiKey);
        }
        const response = await fetch(`${GOOGLE_BOOKS_API_BASE}/volumes?${params}`, {
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * Check if API key is configured.
 */
export function isApiKeyConfigured() {
    return !!getApiKey();
}
//# sourceMappingURL=google-books.js.map