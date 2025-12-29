/**
 * Result Types - Self-Documenting Operation Outcomes
 *
 * Standardized result types for async operations. Use these instead of
 * inline `{ success: boolean; error?: string }` definitions.
 *
 * Benefits:
 * - Consistent error handling across the codebase
 * - IDE autocomplete shows all possible properties
 * - JSDoc appears in hover tooltips
 * - Single source of truth for result shapes
 *
 * @example
 * // Instead of inline types:
 * async function save(): Promise<{ success: boolean; error?: string }> { ... }
 *
 * // Use named types:
 * async function save(): Promise<OperationResult> { ... }
 */

// ============================================================================
// CORE RESULT TYPES
// ============================================================================

/**
 * Basic operation result - success or failure with optional error message.
 * Use for simple operations like save, delete, disconnect.
 *
 * @example
 * async function disconnectProvider(): Promise<OperationResult> {
 *   try {
 *     await api.disconnect();
 *     return { success: true };
 *   } catch (e) {
 *     return { success: false, error: String(e) };
 *   }
 * }
 */
export interface OperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message when success is false */
  error?: string;
}

/**
 * Operation result with additional data payload.
 * Use when you need to return data alongside success status.
 *
 * @example
 * async function syncCalendar(): Promise<OperationResultWith<{ newEvents: number }>> {
 *   const count = await sync();
 *   return { success: true, data: { newEvents: count } };
 * }
 */
export interface OperationResultWith<T> extends OperationResult {
  /** Additional data returned on success */
  data?: T;
}

/**
 * Result that returns a single typed value on success.
 * Alias for OperationResultWith for semantic clarity.
 */
export type DataResult<T> = OperationResultWith<T>;

// ============================================================================
// SPECIALIZED RESULT TYPES
// ============================================================================

/**
 * Result for sync/refresh operations that count affected items.
 *
 * @example
 * async function refreshContacts(): Promise<SyncResult> {
 *   const { added, updated } = await doSync();
 *   return { success: true, count: added + updated };
 * }
 */
export interface SyncResult extends OperationResult {
  /** Number of items synced/affected */
  count?: number;
  /** Timestamp of the sync */
  syncedAt?: string;
}

/**
 * Result for validation operations.
 *
 * @example
 * function validateEmail(email: string): ValidationResult {
 *   if (!email.includes('@')) {
 *     return { valid: false, errors: ['Invalid email format'] };
 *   }
 *   return { valid: true };
 * }
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation error messages */
  errors?: string[];
  /** List of validation warnings (non-blocking) */
  warnings?: string[];
}

/**
 * Result for connection/authentication operations.
 *
 * @example
 * async function connectProvider(): Promise<ConnectionResult> {
 *   const token = await authenticate();
 *   return { success: true, connected: true, expiresAt: token.exp };
 * }
 */
export interface ConnectionResult extends OperationResult {
  /** Whether currently connected */
  connected: boolean;
  /** When the connection/token expires */
  expiresAt?: string;
  /** Provider-specific connection ID */
  connectionId?: string;
}

/**
 * Result for purchase/transaction operations.
 *
 * @example
 * async function purchaseSubscription(): Promise<PurchaseResult> {
 *   const txn = await processPurchase();
 *   return { success: true, transactionId: txn.id };
 * }
 */
export interface PurchaseResult extends OperationResult {
  /** Transaction identifier */
  transactionId?: string;
  /** Receipt data for verification */
  receipt?: string;
  /** Whether this was a restoration vs new purchase */
  restored?: boolean;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an operation succeeded.
 * Narrows the type to exclude error properties.
 *
 * @example
 * const result = await saveData();
 * if (isSuccess(result)) {
 *   console.log('Saved!'); // result.error is undefined here
 * } else {
 *   console.error(result.error); // result.error is string here
 * }
 */
export function isSuccess<T extends OperationResult>(result: T): result is T & { success: true; error: undefined } {
  return result.success === true;
}

/**
 * Type guard to check if an operation failed.
 *
 * @example
 * const result = await saveData();
 * if (isFailure(result)) {
 *   showError(result.error ?? 'Unknown error');
 * }
 */
export function isFailure<T extends OperationResult>(result: T): result is T & { success: false } {
  return result.success === false;
}

/**
 * Type guard for validation results.
 */
export function isValid(result: ValidationResult): result is ValidationResult & { valid: true } {
  return result.valid === true;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a success result.
 *
 * @example
 * return success(); // { success: true }
 * return success({ count: 5 }); // { success: true, data: { count: 5 } }
 */
export function success(): OperationResult;
export function success<T>(data: T): OperationResultWith<T>;
export function success<T>(data?: T): OperationResult | OperationResultWith<T> {
  if (data !== undefined) {
    return { success: true, data };
  }
  return { success: true };
}

/**
 * Create a failure result.
 *
 * @example
 * return failure('Network error');
 * return failure(error); // Accepts Error objects
 */
export function failure(error: string | Error): OperationResult {
  return {
    success: false,
    error: typeof error === 'string' ? error : error.message,
  };
}
