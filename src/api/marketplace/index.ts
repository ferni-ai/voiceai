/**
 * Marketplace API Routes
 *
 * Unified handler for all marketplace-related API endpoints:
 * - Publisher portal (submit, update, list, analytics, delete)
 * - Browse catalog (list, search, details)
 * - Install/Uninstall management
 * - Usage tracking and billing
 *
 * Uses custom HTTP handler pattern (returns boolean) to match ui-server.js
 *
 * @module MarketplaceRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { handlePublisherRoutes } from './publisher-routes.js';
import { handleBrowseRoutes } from './browse-routes.js';
import { handleInstallRoutes } from './install-routes.js';
import { handleUsageRoutes, handlePaymentRoutes } from './billing-routes.js';

/**
 * Handle all marketplace API routes
 * Returns true if the request was handled, false otherwise
 */
export async function handleMarketplaceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/marketplace/* routes
  if (!pathname.startsWith('/api/marketplace/')) {
    return false;
  }

  const method = req.method || 'GET';

  // Publisher routes (includes /api/marketplace/review/status/:id)
  if (
    pathname.startsWith('/api/marketplace/publisher') ||
    pathname.startsWith('/api/marketplace/review/status')
  ) {
    return handlePublisherRoutes(req, res, pathname, method);
  }

  // Registry route - returns full marketplace catalog for frontend
  if (pathname === '/api/marketplace/registry') {
    return handleBrowseRoutes(req, res, pathname, method);
  }

  // Browse routes
  if (pathname.startsWith('/api/marketplace/browse')) {
    return handleBrowseRoutes(req, res, pathname, method);
  }

  // Install routes
  if (pathname.startsWith('/api/marketplace/install')) {
    return handleInstallRoutes(req, res, pathname, method);
  }

  // Usage/billing routes
  if (
    pathname.startsWith('/api/marketplace/usage') ||
    pathname.startsWith('/api/marketplace/quota') ||
    pathname.startsWith('/api/marketplace/billing')
  ) {
    return handleUsageRoutes(req, res, pathname, method);
  }

  // Payment/webhook routes
  if (
    pathname === '/api/marketplace/webhook' ||
    pathname === '/api/marketplace/checkout' ||
    pathname.startsWith('/api/marketplace/payment')
  ) {
    return handlePaymentRoutes(req, res, pathname, method);
  }

  // Reviews routes
  if (pathname.startsWith('/api/marketplace/reviews')) {
    const { handleReviewsRoutes } = await import('../routes/marketplace-reviews.js');
    return handleReviewsRoutes(req, res, pathname);
  }

  return false;
}

/**
 * Check if a path is a marketplace route (for preflight checks)
 */
export function isMarketplaceRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/api/marketplace/') &&
    (pathname === '/api/marketplace/registry' ||
      pathname.startsWith('/api/marketplace/publisher') ||
      pathname.startsWith('/api/marketplace/review') ||
      pathname.startsWith('/api/marketplace/browse') ||
      pathname.startsWith('/api/marketplace/install') ||
      pathname.startsWith('/api/marketplace/usage') ||
      pathname.startsWith('/api/marketplace/quota') ||
      pathname.startsWith('/api/marketplace/billing') ||
      pathname.startsWith('/api/marketplace/payment') ||
      pathname.startsWith('/api/marketplace/reviews') ||
      pathname === '/api/marketplace/webhook' ||
      pathname === '/api/marketplace/checkout')
  );
}

/**
 * Check if a path is an admin marketplace route
 */
export function isMarketplaceAdminRoute(pathname: string): boolean {
  return pathname.startsWith('/api/admin/marketplace');
}

// Re-export helpers for external use
export * from './helpers.js';

