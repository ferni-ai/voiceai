/**
 * API Utilities
 * 
 * Centralized helper for making authenticated API calls.
 * Handles userId injection for all backend requests.
 */

import { createLogger } from './logger.js';

const log = createLogger('API');

/**
 * Get the current user ID from localStorage.
 */
export function getUserId(): string | null {
  try {
    return localStorage.getItem('ferni_user_id');
  } catch {
    return null;
  }
}

/**
 * Get device ID from localStorage.
 */
export function getDeviceId(): string | null {
  try {
    return localStorage.getItem('ferni_device_id');
  } catch {
    return null;
  }
}

/**
 * Build standard headers for API requests.
 * Includes user authentication via X-User-Id header.
 */
export function getApiHeaders(includeJson = true): HeadersInit {
  const headers: HeadersInit = {};
  
  // Add user ID for authentication
  const userId = getUserId();
  if (userId) {
    headers['X-User-Id'] = userId;
  }
  
  // Add device ID for tracking
  const deviceId = getDeviceId();
  if (deviceId) {
    headers['X-Device-Id'] = deviceId;
  }
  
  // Add JSON content type if needed
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  
  return headers;
}

/**
 * Make an authenticated GET request.
 */
export async function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string>
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const url = new URL(path, window.location.origin);
    
    // Add query params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    
    // Always include userId in query for compatibility
    const userId = getUserId();
    if (userId && !url.searchParams.has('userId')) {
      url.searchParams.set('userId', userId);
    }
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getApiHeaders(false),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('API GET failed', { path, status: response.status, error: errorData });
      return { 
        ok: false, 
        error: errorData.error || `HTTP ${response.status}`,
        status: response.status 
      };
    }
    
    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err) {
    log.error('API GET error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

/**
 * Make an authenticated POST request.
 */
export async function apiPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const userId = getUserId();
    
    // Ensure userId is in body if not already present
    const finalBody = body && typeof body === 'object' && !Array.isArray(body)
      ? { userId, ...body }
      : body;
    
    const response = await fetch(path, {
      method: 'POST',
      headers: getApiHeaders(true),
      body: JSON.stringify(finalBody),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('API POST failed', { path, status: response.status, error: errorData });
      return { 
        ok: false, 
        error: errorData.error || `HTTP ${response.status}`,
        status: response.status 
      };
    }
    
    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err) {
    log.error('API POST error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

/**
 * Make an authenticated DELETE request.
 */
export async function apiDelete<T = unknown>(
  path: string,
  params?: Record<string, string>
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const url = new URL(path, window.location.origin);
    
    // Add query params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    
    // Always include userId in query
    const userId = getUserId();
    if (userId && !url.searchParams.has('userId')) {
      url.searchParams.set('userId', userId);
    }
    
    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: getApiHeaders(false),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.warn('API DELETE failed', { path, status: response.status, error: errorData });
      return { 
        ok: false, 
        error: errorData.error || `HTTP ${response.status}`,
        status: response.status 
      };
    }
    
    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err) {
    log.error('API DELETE error', { path, error: err });
    return { ok: false, error: String(err), status: 0 };
  }
}

export default {
  getUserId,
  getDeviceId,
  getApiHeaders,
  get: apiGet,
  post: apiPost,
  delete: apiDelete,
};

