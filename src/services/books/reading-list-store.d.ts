/**
 * Reading List Store
 *
 * Firestore persistence for user reading lists.
 * Allows users to save books for later, track reading progress,
 * and organize their reading goals.
 */
export type ReadingStatus = 'want_to_read' | 'reading' | 'completed' | 'abandoned';
export interface ReadingListEntry {
    id: string;
    userId: string;
    bookId: string;
    title: string;
    authors: string[];
    imageUrl?: string;
    pageCount?: number;
    status: ReadingStatus;
    currentPage?: number;
    startDate?: string;
    finishDate?: string;
    rating?: number;
    notes?: string;
    highlights?: string[];
    listName: string;
    priority?: 'high' | 'medium' | 'low';
    createdAt: string;
    updatedAt: string;
}
export interface ReadingList {
    entries: ReadingListEntry[];
    stats: {
        total: number;
        wantToRead: number;
        reading: number;
        completed: number;
    };
}
export interface ReadingListResult {
    success: boolean;
    entry?: ReadingListEntry;
    error?: string;
}
export interface ReadingListQueryResult {
    success: boolean;
    list?: ReadingList;
    error?: string;
}
/**
 * Add a book to the user's reading list.
 */
export declare function addToReadingList(userId: string, book: {
    bookId: string;
    title: string;
    authors: string[];
    imageUrl?: string;
    pageCount?: number;
}, options?: {
    listName?: string;
    priority?: 'high' | 'medium' | 'low';
    notes?: string;
}): Promise<ReadingListResult>;
/**
 * Update reading status or progress.
 */
export declare function updateReadingStatus(userId: string, entryId: string, update: {
    status?: ReadingStatus;
    currentPage?: number;
    rating?: number;
    notes?: string;
}): Promise<ReadingListResult>;
/**
 * Mark a book as read.
 */
export declare function markBookAsRead(userId: string, entryId: string, rating?: number): Promise<ReadingListResult>;
/**
 * Remove a book from the reading list.
 */
export declare function removeFromReadingList(userId: string, entryId: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get user's reading list.
 */
export declare function getReadingList(userId: string, options?: {
    status?: ReadingStatus;
    listName?: string;
    limit?: number;
}): Promise<ReadingListQueryResult>;
/**
 * Get a specific entry by book ID.
 */
export declare function getReadingListEntry(userId: string, bookId: string): Promise<ReadingListResult>;
/**
 * Get reading progress statistics.
 */
export declare function getReadingStats(userId: string): Promise<{
    success: boolean;
    stats?: {
        totalBooks: number;
        booksCompleted: number;
        booksReading: number;
        booksWantToRead: number;
        pagesRead: number;
        averageRating: number;
        readingStreak: number;
    };
    error?: string;
}>;
/**
 * Check if reading list store is available.
 */
export declare function isReadingListStoreAvailable(): boolean;
//# sourceMappingURL=reading-list-store.d.ts.map