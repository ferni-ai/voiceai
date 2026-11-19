/**
 * What a reply never-lower file reached and must not: a model client, a network connection,
 * fetch. A module of its own with no imports, so each test file's gemini-config stub (a vi.mock
 * factory, per file) and the shared grid count into the same object.
 */
export const reached = { 'model clients': 0, connections: 0, fetches: 0 };

/** Marks the stubbed client, so the grid refuses a file whose stub is missing. */
export const STUBBED_CLIENT = Symbol('never-lower stubbed model client');
