#!/usr/bin/env npx tsx
/**
 * CLI Authentication Service
 *
 * Manages Firebase authentication for CLI commands.
 * Stores tokens in ~/.ferni/auth.json for reuse across sessions.
 *
 * Flow:
 * 1. User runs `ferni auth login`
 * 2. Opens browser to app.ferni.ai/cli-auth
 * 3. User authenticates with Firebase
 * 4. Redirect to localhost callback with token
 * 5. Token stored in ~/.ferni/auth.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { URL } from 'url';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthToken {
  userId: string;
  email: string;
  displayName?: string;
  firebaseToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

export interface CLIAuthConfig {
  tokenPath: string;
  apiBaseUrl: string;
  appUrl: string;
  callbackPort: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: CLIAuthConfig = {
  tokenPath: path.join(os.homedir(), '.ferni', 'auth.json'),
  apiBaseUrl: process.env.FERNI_API_URL || 'https://app.ferni.ai',
  appUrl: process.env.FERNI_APP_URL || 'https://app.ferni.ai',
  callbackPort: 9876,
};

// ============================================================================
// TOKEN STORAGE
// ============================================================================

/**
 * Get the directory for Ferni CLI config
 */
function getConfigDir(): string {
  return path.dirname(DEFAULT_CONFIG.tokenPath);
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read stored auth token from disk
 */
export function readStoredToken(): AuthToken | null {
  try {
    if (!fs.existsSync(DEFAULT_CONFIG.tokenPath)) {
      return null;
    }
    const content = fs.readFileSync(DEFAULT_CONFIG.tokenPath, 'utf-8');
    return JSON.parse(content) as AuthToken;
  } catch {
    return null;
  }
}

/**
 * Store auth token to disk
 */
export function storeToken(token: AuthToken): void {
  ensureConfigDir();
  fs.writeFileSync(DEFAULT_CONFIG.tokenPath, JSON.stringify(token, null, 2), {
    mode: 0o600, // Owner read/write only
  });
}

/**
 * Delete stored auth token
 */
export function clearStoredToken(): void {
  try {
    if (fs.existsSync(DEFAULT_CONFIG.tokenPath)) {
      fs.unlinkSync(DEFAULT_CONFIG.tokenPath);
    }
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

/**
 * Check if a token is expired (with 5 minute buffer)
 */
export function isTokenExpired(token: AuthToken): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() > token.expiresAt - bufferMs;
}

/**
 * Check if user is authenticated with valid token
 */
export function isAuthenticated(): boolean {
  const token = readStoredToken();
  if (!token) return false;
  return !isTokenExpired(token);
}

/**
 * Get current user info if authenticated
 */
export function getCurrentUser(): { userId: string; email: string; displayName?: string } | null {
  const token = readStoredToken();
  if (!token || isTokenExpired(token)) return null;
  return {
    userId: token.userId,
    email: token.email,
    displayName: token.displayName,
  };
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Refresh an expired token using the refresh token
 */
export async function refreshToken(token: AuthToken): Promise<AuthToken | null> {
  try {
    const response = await fetch(`${DEFAULT_CONFIG.apiBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: token.refreshToken,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      token: string;
      refreshToken: string;
      expiresIn: number;
      user: { uid: string; email: string; displayName?: string };
    };

    const newToken: AuthToken = {
      userId: data.user.uid,
      email: data.user.email,
      displayName: data.user.displayName,
      firebaseToken: data.token,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };

    storeToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

// ============================================================================
// GET AUTH TOKEN (WITH AUTO-REFRESH)
// ============================================================================

/**
 * Get a valid auth token, refreshing if needed
 * Returns null if not authenticated or refresh fails
 */
export async function getAuthToken(): Promise<string | null> {
  const token = readStoredToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    const refreshed = await refreshToken(token);
    if (!refreshed) {
      clearStoredToken();
      return null;
    }
    return refreshed.firebaseToken;
  }

  return token.firebaseToken;
}

/**
 * Get auth headers for API requests
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated. Run `ferni auth login` first.');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// OAUTH CALLBACK SERVER
// ============================================================================

/**
 * Start a local server to receive OAuth callback
 */
export function startCallbackServer(): Promise<AuthToken> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${DEFAULT_CONFIG.callbackPort}`);

      // Handle the callback
      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const refreshTokenParam = url.searchParams.get('refreshToken');
        const userId = url.searchParams.get('userId');
        const email = url.searchParams.get('email');
        const displayName = url.searchParams.get('displayName');
        const expiresIn = url.searchParams.get('expiresIn');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Authentication Failed</title></head>
              <body style="font-family: system-ui; text-align: center; padding: 40px;">
                <h1>Authentication Failed</h1>
                <p>${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(error));
          return;
        }

        if (!token || !refreshTokenParam || !userId || !email) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Authentication Failed</title></head>
              <body style="font-family: system-ui; text-align: center; padding: 40px;">
                <h1>Authentication Failed</h1>
                <p>Missing required parameters.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('Missing required parameters'));
          return;
        }

        // Success!
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Authenticated!</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 40px; background: #f0fdf4;">
              <h1 style="color: #166534;">Successfully Authenticated!</h1>
              <p>Welcome, ${displayName || email}!</p>
              <p>You can close this window and return to the terminal.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </body>
          </html>
        `);

        const authToken: AuthToken = {
          userId,
          email,
          displayName: displayName || undefined,
          firebaseToken: token,
          refreshToken: refreshTokenParam,
          expiresAt: Date.now() + (parseInt(expiresIn || '3600', 10) * 1000),
        };

        server.close();
        resolve(authToken);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(DEFAULT_CONFIG.callbackPort, '127.0.0.1', () => {
      // Server is ready
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out. Please try again.'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Get the login URL for browser authentication
 */
export function getLoginUrl(): string {
  const callbackUrl = `http://localhost:${DEFAULT_CONFIG.callbackPort}/callback`;
  return `${DEFAULT_CONFIG.appUrl}/cli-auth?callback=${encodeURIComponent(callbackUrl)}`;
}

// ============================================================================
// LOGOUT
// ============================================================================

/**
 * Log out the current user
 */
export async function logout(): Promise<void> {
  const token = readStoredToken();
  if (token) {
    // Optionally revoke the token on the server
    try {
      await fetch(`${DEFAULT_CONFIG.apiBaseUrl}/api/auth/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.firebaseToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      // Ignore errors - token will be cleared locally regardless
    }
  }
  clearStoredToken();
}

// ============================================================================
// API CLIENT HELPER
// ============================================================================

/**
 * Make an authenticated API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${DEFAULT_CONFIG.apiBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    clearStoredToken();
    throw new Error('Session expired. Please run `ferni auth login` again.');
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Upload a file to the API
 */
export async function apiUpload<T>(
  endpoint: string,
  file: Buffer,
  filename: string,
  contentType: string
): Promise<T> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated. Run `ferni auth login` first.');
  }

  const formData = new FormData();
  formData.append('file', new Blob([file], { type: contentType }), filename);

  const response = await fetch(`${DEFAULT_CONFIG.apiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (response.status === 401) {
    clearStoredToken();
    throw new Error('Session expired. Please run `ferni auth login` again.');
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed (${response.status}): ${error}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cliAuth = {
  isAuthenticated,
  getCurrentUser,
  getAuthToken,
  getAuthHeaders,
  getLoginUrl,
  startCallbackServer,
  storeToken,
  logout,
  apiRequest,
  apiUpload,
};

export default cliAuth;
