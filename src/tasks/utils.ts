/**
 * Task Utility Functions
 *
 * Common utilities used across task files.
 */

/**
 * Select a random element from an array.
 * Provides a cleaner alternative to repeated Math.floor(Math.random() * arr.length) patterns.
 *
 * @param array - Array to select from (must not be empty)
 * @returns A random element from the array
 * @throws Error if array is empty
 *
 * @example
 * const greetings = ['Hello', 'Hi', 'Hey'];
 * const greeting = randomChoice(greetings); // 'Hi'
 */
export function randomChoice<T>(array: readonly T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Select multiple unique random elements from an array.
 *
 * @param array - Array to select from
 * @param count - Number of elements to select
 * @returns Array of randomly selected unique elements
 *
 * @example
 * const items = ['a', 'b', 'c', 'd', 'e'];
 * const selected = randomSample(items, 3); // ['c', 'a', 'e']
 */
export function randomSample<T>(array: readonly T[], count: number): T[] {
  if (count > array.length) {
    throw new Error(`Cannot select ${count} items from array of length ${array.length}`);
  }

  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Clamp a value between min and max bounds.
 *
 * @param value - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values.
 *
 * @param start - Start value
 * @param end - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp(t, 0, 1);
}
