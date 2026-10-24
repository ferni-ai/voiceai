/**
 * An error as a log may carry it: its class, never its message. A JSON parse
 * error quotes the input it choked on, which on call start is the caller's
 * dispatch (names, reasons, scripts).
 *
 * @module utils/error-class
 */
export function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
