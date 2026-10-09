/**
 * Per-minute request budgets for /api/waitlist routes, in separate buckets.
 *
 * Anonymous sign-ups get a tight limit against spam. The access check runs on
 * every app load; when it shared the sign-up budget, users who reloaded a few
 * times were told they were on the waitlist.
 */
export function waitlistRateLimit(pathname: string): { maxRequests: number; keyPrefix: string } {
  if (pathname === '/api/waitlist') return { maxRequests: 5, keyPrefix: 'waitlist:signup' };
  if (pathname === '/api/waitlist/check') return { maxRequests: 60, keyPrefix: 'waitlist:check' };
  return { maxRequests: 20, keyPrefix: 'waitlist:other' };
}
