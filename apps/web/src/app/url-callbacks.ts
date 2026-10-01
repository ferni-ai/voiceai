/**
 * URL Callbacks
 *
 * Handles redirects back into the app: garden payments, ?garden=true,
 * calendar and LinkedIn OAuth.
 */

import { appState } from '../state/app.state.js';
import { handleLinkedInCallback } from '../services/linkedin.service.js';
import { ferniFundUI } from '../ui/ferni-fund.ui.js';
import { toast } from '../ui/whisper.ui.js';

/**
 * Act on redirect paths and query params, then clean up the URL.
 */
export function handleUrlCallbacks(): void {
  // 🌱 Handle garden payment result routes (Stripe redirects here)
  const gardenPathname = window.location.pathname;
  if (gardenPathname === '/garden/success') {
    // Show thank you message for successful payment
    // Wait a moment for UI to initialize
    setTimeout(() => {
      ferniFundUI.showThankYou({
        conversationsSponsored: 1,
        message: 'Thank you for planting a seed!',
      });
      // Clean up the URL without reload
      window.history.replaceState({}, '', '/');
    }, 500);
  } else if (gardenPathname === '/garden/cancel') {
    // Payment was cancelled - just redirect to home
    window.history.replaceState({}, '', '/');
  }

  // 🌱 Handle ?garden=true query param from landing page CTA
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('garden') === 'true') {
    // Wait for UI to initialize, then open Ferni Fund modal
    setTimeout(() => {
      const userId = appState.get('deviceId');
      if (userId) {
        void ferniFundUI.open(userId);
      }
      // Clean up the URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }, 800);
  }

  // 📅 Handle Calendar OAuth callback
  const calendarStatus = urlParams.get('calendar');
  const calendarResult = urlParams.get('status');
  const calendarError = urlParams.get('calendar_error');
  if (calendarStatus && calendarResult === 'connected') {
    setTimeout(() => {
      const providerName =
        calendarStatus === 'google'
          ? 'Google Calendar'
          : calendarStatus === 'apple'
            ? 'Apple Calendar'
            : calendarStatus === 'outlook'
              ? 'Outlook Calendar'
              : 'Calendar';
      toast.success(`${providerName} connected!`);
      // Clean up the URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }, 500);
  } else if (calendarError) {
    setTimeout(() => {
      toast.error("Couldn't connect calendar. Try again?");
      // Clean up the URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }, 500);
  }

  // 💼 Handle LinkedIn OAuth callback
  handleLinkedInCallback();
}
