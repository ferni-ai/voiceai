/**
 * Outreach Testing Handlers
 *
 * Handles all proactive outreach testing actions from the dev panel.
 * These test the full outreach flow: channels, triggers, and history.
 */

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DevPanel:Outreach');

/** What GET /api/user/contact sends for the signed-in user (src/api/user-routes.ts). */
interface ContactResponse {
  contactInfo?: { phone?: string; email?: string; verifiedPhone?: string | null } | null;
}

/**
 * The signed-in user's outreach channels, as a status line and whether it is an error.
 * It used to GET /api/outreach/contact, which only takes POST, so every check read
 * "No contact info configured" whatever was saved.
 */
async function checkContactConfig(): Promise<[string, boolean]> {
  let res: Response;
  try {
    res = await fetch('/api/user/contact');
  } catch (error) {
    log.warn({ error }, 'Contact check failed');
    return ['Contact check unavailable (network error)', true];
  }
  if (!res.ok) {
    log.warn({ status: res.status }, 'Contact check failed');
    return [`Contact check unavailable (HTTP ${res.status})`, true];
  }
  const { contactInfo } = (await res.json()) as ContactResponse;
  const phone = contactInfo?.verifiedPhone ?? contactInfo?.phone;
  const parts: string[] = [];
  if (phone) parts.push(`Phone: ${phone}${contactInfo?.verifiedPhone ? ' (verified)' : ''}`);
  if (contactInfo?.email) parts.push(`Email: ${contactInfo.email}`);
  return parts.length ? [parts.join(' | '), false] : ['No phone or email saved', true];
}

/**
 * Handle an outreach action from the dev panel
 *
 * @param action - The action identifier from the button's data attribute
 * @param getUserId - Function to get the current user ID
 */
export async function handleOutreachAction(action: string, getUserId: () => string): Promise<void> {
  const statusEl = document.getElementById('outreach-status-value');
  const setStatus = (text: string, isError = false) => {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = isError ? 'var(--color-error)' : 'var(--color-success)';
    }
  };

  // Helper to parse response and extract error message
  const parseResponse = async (res: Response): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = (await res.json()) as { success?: boolean; error?: string };
      return { success: data.success ?? res.ok, error: data.error };
    } catch {
      return { success: res.ok, error: res.ok ? undefined : 'Request failed' };
    }
  };

  const userId = getUserId();

  log.info({ action }, 'Outreach action triggered');
  setStatus('Processing...');

  try {
    switch (action) {
      // Check channel config first
      case 'check-config': {
        setStatus('Checking config...');
        setStatus(...(await checkContactConfig()));
        break;
      }

      // Test channels
      case 'test-sms': {
        setStatus('Sending test SMS...');
        const smsRes = await fetch('/api/outreach/test/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            channel: 'sms',
            message: 'Hey! This is a test message from Ferni dev panel.',
          }),
        });
        const smsResult = await parseResponse(smsRes);
        if (smsResult.success) {
          setStatus('SMS sent!');
        } else {
          const hint = smsResult.error?.includes('phone') ? ' (Set phone first)' : '';
          setStatus(`${smsResult.error || 'SMS failed'}${hint}`, true);
        }
        break;
      }

      case 'test-email': {
        setStatus('Sending test email...');
        const emailRes = await fetch('/api/outreach/test/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            channel: 'email',
            subject: 'Test from Ferni',
            message:
              'Hey! This is a test email from the Ferni dev panel. Just making sure everything is connected!',
          }),
        });
        const emailResult = await parseResponse(emailRes);
        if (emailResult.success) {
          setStatus('Email sent!');
        } else {
          const hint = emailResult.error?.includes('email') ? ' (Set email first)' : '';
          setStatus(`${emailResult.error || 'Email failed'}${hint}`, true);
        }
        break;
      }

      case 'test-call': {
        setStatus('Making test call...');
        const callRes = await fetch('/api/outreach/test/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            channel: 'call',
            message:
              'Hey! This is Ferni calling from the dev panel. Just a quick test to make sure calls are working!',
          }),
        });
        const callResult = await parseResponse(callRes);
        if (callResult.success) {
          setStatus('Call initiated!');
        } else {
          const hint = callResult.error?.includes('phone') ? ' (Set phone first)' : '';
          setStatus(`${callResult.error || 'Call failed'}${hint}`, true);
        }
        break;
      }

      // Trigger types
      case 'trigger-commitment': {
        const commitRes = await fetch('/api/outreach/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'commitment_check',
            priority: 'medium',
            reason: 'Dev panel test - commitment check',
            commitment: 'your morning workout',
          }),
        });
        setStatus(commitRes.ok ? 'Commitment trigger created!' : 'Failed', !commitRes.ok);
        break;
      }

      case 'trigger-emotional': {
        const emotionRes = await fetch('/api/outreach/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'emotional_support',
            priority: 'high',
            reason: 'Dev panel test - emotional support',
          }),
        });
        setStatus(emotionRes.ok ? 'Emotional trigger created!' : 'Failed', !emotionRes.ok);
        break;
      }

      case 'trigger-celebration': {
        const celebRes = await fetch('/api/outreach/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'celebration',
            priority: 'medium',
            reason: 'Dev panel test - celebration',
            milestone: 'completing an amazing day',
          }),
        });
        setStatus(celebRes.ok ? 'Celebration trigger created!' : 'Failed', !celebRes.ok);
        break;
      }

      case 'trigger-thinking': {
        const toyRes = await fetch('/api/outreach/thinking-of-you', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            trigger: 'random_kindness',
            reason: 'Dev panel test',
          }),
        });
        setStatus(toyRes.ok ? 'Thinking-of-you triggered!' : 'Failed', !toyRes.ok);
        break;
      }

      // View data
      case 'view-pending': {
        const pendingRes = await fetch(`/api/outreach/pending?userId=${userId}`);
        const pendingData = (await pendingRes.json()) as { count?: number };
        log.info({ pending: pendingData }, 'Pending outreach');
        // eslint-disable-next-line no-console
        console.log('[Pending Outreach]', pendingData);
        setStatus(`${pendingData.count || 0} pending (see console)`);
        break;
      }

      case 'view-history': {
        const historyRes = await fetch(`/api/outreach/history?userId=${userId}&limit=10`);
        const historyData = (await historyRes.json()) as { count?: number };
        log.info({ history: historyData }, 'Outreach history');
        // eslint-disable-next-line no-console
        console.log('[Outreach History]', historyData);
        setStatus(`${historyData.count || 0} in history (see console)`);
        break;
      }

      case 'view-context': {
        const contextRes = await fetch(`/api/outreach/context?userId=${userId}`);
        const contextData = await contextRes.json();
        log.info({ context: contextData }, 'User context');
        // eslint-disable-next-line no-console
        console.log('[User Context]', contextData);
        setStatus('Context loaded (see console)');
        break;
      }

      case 'view-timing': {
        const timingRes = await fetch(`/api/outreach/timing?userId=${userId}`);
        const timingData = await timingRes.json();
        log.info({ timing: timingData }, 'Timing patterns');
        // eslint-disable-next-line no-console
        console.log('[Timing Patterns]', timingData);
        setStatus('Timing loaded (see console)');
        break;
      }

      default:
        log.warn({ action }, 'Unknown outreach action');
        setStatus('Unknown action', true);
    }
  } catch (error) {
    log.error({ error, action }, 'Outreach action failed');
    setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, true);
  }
}
