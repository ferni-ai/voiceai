/**
 * Write a generated file only when its content changed.
 *
 * Generators stamp their output with the build time ("Generated: <ISO>",
 * "timestamp": "<ISO>"), so every build rewrote ~13 tracked files that hadn't
 * really changed. The diff noise hid real drift and got regenerated files
 * committed by accident. Comparing with timestamps blanked keeps the stamp
 * meaning "when this content last changed".
 */
import fs from 'fs';

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/** The content with every ISO-8601 UTC timestamp blanked. */
export function withoutTimestamps(text) {
  return text.replace(ISO_TIMESTAMP, '<timestamp>');
}

/** @returns {boolean} whether the file was written */
export function writeIfChanged(path, content) {
  let current = null;
  try {
    current = fs.readFileSync(path, 'utf8');
  } catch {
    // missing: write it
  }
  if (current !== null && withoutTimestamps(current) === withoutTimestamps(String(content))) {
    return false;
  }
  fs.writeFileSync(path, content);
  return true;
}
