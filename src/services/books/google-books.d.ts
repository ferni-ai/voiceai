/**
 * Google Books API Service
 *
 * Provides book discovery using the Google Books API.
 * Works without API key (limited quota) or with key (higher quota).
 *
 * API Documentation: https://developers.google.com/books/docs/v1/using
 */
export interface Book {
    id: string;
    title: string;
    subtitle?: string;
    authors: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories: string[];
    averageRating?: number;
    ratingsCount?: number;
    imageUrl?: string;
    previewLink?: string;
    infoLink: string;
    isbn10?: string;
    isbn13?: string;
    language: string;
}
export interface BookSearchResult {
    found: boolean;
    books: Book[];
    totalItems?: number;
    error?: string;
}
export interface BookDetailsResult {
    found: boolean;
    book?: Book;
    error?: string;
}
export type BookGenre = 'fiction' | 'nonfiction' | 'mystery' | 'romance' | 'science_fiction' | 'fantasy' | 'biography' | 'history' | 'science' | 'self_help' | 'business' | 'philosophy' | 'psychology' | 'poetry' | 'cooking' | 'travel' | 'art' | 'health' | 'religion' | 'children';
/**
 * Search for books.
 */
export declare function searchBooks(query: string, options?: {
    limit?: number;
    startIndex?: number;
    orderBy?: 'relevance' | 'newest';
    printType?: 'all' | 'books' | 'magazines';
    langRestrict?: string;
}): Promise<BookSearchResult>;
/**
 * Get book details by ID.
 */
export declare function getBookDetails(bookId: string): Promise<BookDetailsResult>;
/**
 * Search books by author.
 */
export declare function searchBooksByAuthor(author: string, limit?: number): Promise<BookSearchResult>;
/**
 * Search books by genre/category.
 */
export declare function searchBooksByGenre(genre: BookGenre, limit?: number): Promise<BookSearchResult>;
/**
 * Get book recommendations based on interests.
 */
export declare function getBookRecommendations(interests: string[], options?: {
    limit?: number;
    genre?: BookGenre;
}): Promise<BookSearchResult>;
/**
 * Search for bestsellers or popular books.
 */
export declare function getPopularBooks(genre?: BookGenre, limit?: number): Promise<BookSearchResult>;
/**
 * Check if Google Books API is available.
 */
export declare function isGoogleBooksApiAvailable(): Promise<boolean>;
/**
 * Check if API key is configured.
 */
export declare function isApiKeyConfigured(): boolean;
//# sourceMappingURL=google-books.d.ts.map