/**
 * API Response Validator
 *
 * Validates HTTP API responses against expected patterns.
 */

import type {
  ApiExpectation,
  FieldMatcher,
  E2ETestContext,
} from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ApiValidationResult {
  /** Whether validation passed */
  passed: boolean;

  /** HTTP status code received */
  statusCode: number;

  /** Response body (parsed if JSON) */
  body: unknown;

  /** Response headers */
  headers: Record<string, string>;

  /** Validation errors */
  errors: string[];

  /** Duration of the API call in ms */
  durationMs: number;
}

export interface ApiCallOptions {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /** API path (will be appended to baseUrl) */
  path: string;

  /** Request body (will be JSON stringified) */
  body?: Record<string, unknown>;

  /** Request headers */
  headers?: Record<string, string>;

  /** Timeout in ms */
  timeout?: number;
}

// ============================================================================
// API Caller
// ============================================================================

/**
 * Make an API call and return the response.
 */
export async function callApi(
  ctx: E2ETestContext,
  options: ApiCallOptions
): Promise<{
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  durationMs: number;
}> {
  const { method, path, body, headers: customHeaders, timeout = 30000 } = options;
  const url = `${ctx.apiBaseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  // Add auth token if available
  if (ctx.authToken) {
    headers['Authorization'] = `Bearer ${ctx.authToken}`;
  }

  // Add test user header
  headers['X-Test-User-Id'] = ctx.userId;

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;

    // Parse response body
    let responseBody: unknown;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
    }

    // Extract headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      statusCode: response.status,
      body: responseBody,
      headers: responseHeaders,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    ctx.log.error('API call failed', { url, method, error: errorMessage });

    return {
      statusCode: 0,
      body: { error: errorMessage },
      headers: {},
      durationMs,
    };
  }
}

// ============================================================================
// API Validation
// ============================================================================

/**
 * Validate an API response against expectations.
 */
export async function validateApiResponse(
  ctx: E2ETestContext,
  options: ApiCallOptions,
  expectation: ApiExpectation = {}
): Promise<ApiValidationResult> {
  const response = await callApi(ctx, options);
  const errors: string[] = [];

  // Validate status code
  if (expectation.statusCode !== undefined) {
    if (response.statusCode !== expectation.statusCode) {
      errors.push(
        `Status code mismatch: expected ${expectation.statusCode}, got ${response.statusCode}`
      );
    }
  } else {
    // Default: expect 2xx success
    if (response.statusCode < 200 || response.statusCode >= 300) {
      errors.push(`Unexpected status code: ${response.statusCode}`);
    }
  }

  // Validate JSON response
  if (expectation.isJson) {
    if (typeof response.body !== 'object' || response.body === null) {
      errors.push('Expected JSON response but got non-object');
    }
  }

  // Validate body matchers
  if (expectation.bodyMatchers && typeof response.body === 'object' && response.body !== null) {
    const bodyErrors = validateFieldMatchers(
      response.body as Record<string, unknown>,
      expectation.bodyMatchers,
      'body'
    );
    errors.push(...bodyErrors);
  }

  // Validate headers
  if (expectation.headers) {
    for (const [key, expectedValue] of Object.entries(expectation.headers)) {
      const actualValue = response.headers[key.toLowerCase()];
      if (actualValue !== expectedValue) {
        errors.push(
          `Header "${key}" mismatch: expected "${expectedValue}", got "${actualValue}"`
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    statusCode: response.statusCode,
    body: response.body,
    headers: response.headers,
    errors,
    durationMs: response.durationMs,
  };
}

// ============================================================================
// Field Matchers
// ============================================================================

/**
 * Validate field matchers against an object.
 */
export function validateFieldMatchers(
  obj: Record<string, unknown>,
  matchers: Record<string, FieldMatcher>,
  prefix = ''
): string[] {
  const errors: string[] = [];

  for (const [field, matcher] of Object.entries(matchers)) {
    const path = prefix ? `${prefix}.${field}` : field;
    const value = getNestedValue(obj, field);
    const matcherErrors = validateFieldMatcher(value, matcher, path);
    errors.push(...matcherErrors);
  }

  return errors;
}

/**
 * Validate a single field against a matcher.
 */
function validateFieldMatcher(
  value: unknown,
  matcher: FieldMatcher,
  path: string
): string[] {
  switch (matcher.type) {
    case 'exists':
      if (value === undefined) {
        return [`Field "${path}" does not exist`];
      }
      break;

    case 'equals':
      if (value !== matcher.value) {
        return [`Field "${path}": expected ${JSON.stringify(matcher.value)}, got ${JSON.stringify(value)}`];
      }
      break;

    case 'contains':
      if (typeof value !== 'string' || !value.includes(matcher.value)) {
        return [`Field "${path}": expected to contain "${matcher.value}", got ${JSON.stringify(value)}`];
      }
      break;

    case 'matches':
      if (typeof value !== 'string' || !new RegExp(matcher.pattern).test(value)) {
        return [`Field "${path}": expected to match pattern "${matcher.pattern}", got ${JSON.stringify(value)}`];
      }
      break;

    case 'isArray':
      if (!Array.isArray(value)) {
        return [`Field "${path}": expected array, got ${typeof value}`];
      }
      if (matcher.minLength !== undefined && value.length < matcher.minLength) {
        return [`Field "${path}": expected array with at least ${matcher.minLength} items, got ${value.length}`];
      }
      break;

    case 'isNumber':
      if (typeof value !== 'number') {
        return [`Field "${path}": expected number, got ${typeof value}`];
      }
      if (matcher.min !== undefined && value < matcher.min) {
        return [`Field "${path}": expected >= ${matcher.min}, got ${value}`];
      }
      if (matcher.max !== undefined && value > matcher.max) {
        return [`Field "${path}": expected <= ${matcher.max}, got ${value}`];
      }
      break;

    case 'isString':
      if (typeof value !== 'string') {
        return [`Field "${path}": expected string, got ${typeof value}`];
      }
      if (matcher.minLength !== undefined && value.length < matcher.minLength) {
        return [`Field "${path}": expected string with at least ${matcher.minLength} chars, got ${value.length}`];
      }
      break;

    case 'isTimestamp':
      // Accept ISO strings, numbers, or Date-like objects
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        !(typeof value === 'object' && value !== null && 'seconds' in value)
      ) {
        return [`Field "${path}": expected timestamp, got ${typeof value}`];
      }
      break;
  }

  return [];
}

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Quick check if an API call succeeds (2xx status).
 */
export async function apiCallSucceeds(
  ctx: E2ETestContext,
  options: ApiCallOptions
): Promise<boolean> {
  const response = await callApi(ctx, options);
  return response.statusCode >= 200 && response.statusCode < 300;
}
