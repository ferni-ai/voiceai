/**
 * Safely extract a string parameter from Express req.params.
 * Express 5+ allows params to be strings or string arrays (for wildcard routes).
 * This helper ensures we get a string or undefined, never an array.
 *
 * @param value - The parameter value from req.params
 * @returns The string value, or undefined if the value is an array or missing
 */
export function paramString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}
