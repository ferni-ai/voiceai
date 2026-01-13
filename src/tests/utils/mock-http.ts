/**
 * Mock HTTP Request/Response utilities for testing route handlers
 */

import type { IncomingMessage, ServerResponse } from 'http';

export interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  on: (event: string, callback: (data?: unknown) => void) => MockRequest;
}

export interface MockResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead: (code: number, headers?: Record<string, string>) => MockResponse;
  end: (body?: string) => void;
  setHeader: (name: string, value: string) => MockResponse;
  write: (chunk: string) => boolean;
  getHeader: (name: string) => string | undefined;
}

/**
 * Creates a mock HTTP request for testing route handlers
 */
export function createMockRequest(
  method: string,
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: string;
  } = {}
): MockRequest {
  const { headers = {}, body = '' } = options;

  const request: MockRequest = {
    method,
    url,
    headers: {
      host: 'localhost:3002',
      ...headers,
    },
    on: (event: string, callback: (data?: unknown) => void) => {
      if (event === 'data') {
        if (body) {
          // Simulate async data event
          setImmediate(() => callback(Buffer.from(body)));
        }
      } else if (event === 'end') {
        // Simulate async end event
        setImmediate(() => callback());
      }
      return request;
    },
  };

  return request;
}

/**
 * Creates a mock HTTP response for testing route handlers
 */
export function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    body: '',
    headers: {} as Record<string, string>,
    writeHead: (code: number, headers?: Record<string, string>) => {
      response.statusCode = code;
      if (headers) {
        Object.assign(response.headers, headers);
      }
      return response;
    },
    end: (body?: string) => {
      if (body) response.body = body;
    },
    setHeader: (name: string, value: string) => {
      response.headers[name.toLowerCase()] = value;
      return response;
    },
    write: (chunk: string) => {
      response.body += chunk;
      return true;
    },
    getHeader: (name: string) => {
      return response.headers[name.toLowerCase()];
    },
  };
  return response;
}

/**
 * Cast mock request to IncomingMessage for route handler compatibility
 */
export function asMockIncomingMessage(mock: MockRequest): IncomingMessage {
  return mock as unknown as IncomingMessage;
}

/**
 * Cast mock response to ServerResponse for route handler compatibility
 */
export function asMockServerResponse(mock: MockResponse): ServerResponse {
  return mock as unknown as ServerResponse;
}
