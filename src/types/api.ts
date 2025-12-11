/**
 * API Types
 *
 * Standardized types for API requests and responses.
 * These ensure consistency across all endpoints.
 *
 * Philosophy: Every API response should be predictable and self-documenting.
 *
 * @module types/api
 */

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Standard success response envelope
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

/**
 * Standard error response envelope
 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    /** Field-level validation errors */
    fieldErrors?: Record<string, string[]>;
  };
  meta?: ApiMeta;
}

/**
 * Combined API response type
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Response metadata
 */
export interface ApiMeta {
  /** Unique request identifier for tracing */
  requestId?: string;
  /** Response timestamp */
  timestamp?: Date;
  /** Response time in milliseconds */
  durationMs?: number;
  /** API version */
  version?: string;
  /** Deprecation warning if applicable */
  deprecationWarning?: string;
}

// ============================================================================
// PAGINATION TYPES
// ============================================================================

/**
 * Pagination parameters for list endpoints
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  pageSize?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
}

/**
 * Pagination metadata in response
 */
export interface PaginationMeta {
  /** Current page number */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Has next page */
  hasNext: boolean;
  /** Has previous page */
  hasPrev: boolean;
  /** Next page cursor (for cursor pagination) */
  nextCursor?: string;
  /** Previous page cursor (for cursor pagination) */
  prevCursor?: string;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ============================================================================
// SORTING & FILTERING TYPES
// ============================================================================

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort parameter
 */
export interface SortParam<T extends string = string> {
  field: T;
  direction: SortDirection;
}

/**
 * Filter operator
 */
export type FilterOperator =
  | 'eq' // equals
  | 'ne' // not equals
  | 'gt' // greater than
  | 'gte' // greater than or equal
  | 'lt' // less than
  | 'lte' // less than or equal
  | 'in' // in array
  | 'nin' // not in array
  | 'contains' // contains string
  | 'startsWith' // starts with string
  | 'endsWith'; // ends with string

/**
 * Filter parameter
 */
export interface FilterParam<T extends string = string> {
  field: T;
  operator: FilterOperator;
  value: unknown;
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

/**
 * List query parameters
 */
export interface ListQueryParams<TSortFields extends string = string> {
  pagination?: PaginationParams;
  sort?: Array<SortParam<TSortFields>>;
  filters?: FilterParam[];
  /** Search query string */
  search?: string;
}

/**
 * Batch operation request
 */
export interface BatchRequest<T> {
  items: T[];
  /** Whether to continue on errors */
  continueOnError?: boolean;
}

/**
 * Batch operation response
 */
export interface BatchResponse<T, E = unknown> {
  /** Successfully processed items */
  succeeded: Array<{ index: number; result: T }>;
  /** Failed items */
  failed: Array<{ index: number; error: E }>;
  /** Summary */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Standard API error codes
 */
export const API_ERROR_CODES = {
  // 4xx Client Errors
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // 5xx Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Domain-specific
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  SESSION_LIMIT_REACHED: 'SESSION_LIMIT_REACHED',
  PERSONA_UNAVAILABLE: 'PERSONA_UNAVAILABLE',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

/**
 * HTTP status codes with semantic names
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a success response
 */
export function apiSuccess<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
  return {
    success: true,
    data,
    meta: meta ?? { timestamp: new Date() },
  };
}

/**
 * Create an error response
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  meta?: ApiMeta
): ApiError {
  return {
    success: false,
    error: { code, message, details },
    meta: meta ?? { timestamp: new Date() },
  };
}

/**
 * Create a validation error response
 */
export function validationError(
  fieldErrors: Record<string, string[]>,
  message = 'Validation failed',
  meta?: ApiMeta
): ApiError {
  return {
    success: false,
    error: {
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message,
      fieldErrors,
    },
    meta: meta ?? { timestamp: new Date() },
  };
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  items: T[],
  params: PaginationParams,
  totalItems: number
): ApiSuccess<PaginatedResponse<T>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const totalPages = Math.ceil(totalItems / pageSize);

  return apiSuccess({
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if response is a success
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.success === true;
}

/**
 * Check if response is an error
 */
export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return response.success === false;
}

// ============================================================================
// SPECIFIC API TYPES
// ============================================================================

/**
 * User profile response
 */
export interface UserProfileResponse {
  id: string;
  name?: string;
  preferredName?: string;
  relationshipStage: string;
  totalConversations: number;
  memberSince: Date;
  subscription: {
    tier: 'free' | 'friend' | 'partner';
    status: string;
  };
}

/**
 * Session start request
 */
export interface SessionStartRequest {
  userId?: string;
  personaId?: string;
  deviceType?: 'web' | 'mobile' | 'voice';
  metadata?: Record<string, unknown>;
}

/**
 * Session start response
 */
export interface SessionStartResponse {
  sessionId: string;
  roomId?: string;
  token?: string;
  personaId: string;
  userId: string;
  expiresAt?: Date;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: Record<
    string,
    {
      status: 'up' | 'down' | 'degraded';
      latencyMs?: number;
      lastCheck: Date;
    }
  >;
}

/**
 * Agent list response
 */
export interface AgentListResponse {
  agents: Array<{
    id: string;
    name: string;
    description: string;
    available: boolean;
    tier: 'free' | 'friend' | 'partner';
  }>;
}
