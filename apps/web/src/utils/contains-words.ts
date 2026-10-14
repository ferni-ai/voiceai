/**
 * Whether `phrase` appears in `text` as whole words, case-insensitively.
 *
 * Substring matching misreads people: "therapist" contains "api", so a plain
 * `includes` told a user "You've mentioned 'api'". A match must start and end
 * at a non-letter, non-digit character (or the ends of the text).
 */
export function containsWords(text: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(
    text.toLowerCase()
  );
}
