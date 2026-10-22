/**
 * A stable, opaque id for a pondered item, so the iPhone app can name one
 * (GET /api/home -> note.id, and `from=note:<id>` on the token request) without
 * the server storing a second copy. The id is a hash of the same key that marks
 * the item raised (pondering-reader.ts surfacedKey), so it holds for as long as
 * the item does and says nothing about its words.
 *
 * @module intelligence/pondering/note-id
 */
import { createHash } from 'crypto';
import { surfacedKey } from './pondering-reader.js';

export function ponderedNoteId(item: { basis: string; text: string }): string {
  return createHash('sha256').update(surfacedKey(item)).digest('hex').slice(0, 16);
}
