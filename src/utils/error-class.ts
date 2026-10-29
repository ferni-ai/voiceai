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

/** The numeric HTTP `status` an error carries, if any: safe to log, unlike its message. */
export function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** `errorClass`, plus ` <status>` when the error carries one: for a message that must not quote the error. */
export function errorSummary(error: unknown): string {
  const status = errorStatus(error);
  return status === undefined ? errorClass(error) : `${errorClass(error)} ${status}`;
}

/** What a log line may carry of an error: its class and numeric status, never its message. */
export function errorFields(error: unknown): { error: string; status: number | undefined } {
  return { error: errorClass(error), status: errorStatus(error) };
}
