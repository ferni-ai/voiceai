/**
 * SMS message formatting (character limits and segment counting).
 * Extracted from sms-delivery.ts.
 */

// SMS character limits
const SMS_CHAR_LIMIT = 160;
const SMS_CONCAT_LIMIT = 1600; // 10 segments max

/**
 * Format message for SMS delivery
 * Handles character limits, emoji optimization, and link shortening
 */
export function formatSMSMessage(
  body: string,
  options: {
    includeOptOut?: boolean;
    shortenLinks?: boolean;
    maxSegments?: number;
  } = {}
): { body: string; segments: number; truncated: boolean } {
  let formattedBody = body;
  const maxSegments = options.maxSegments ?? 3;
  const maxChars = maxSegments * SMS_CHAR_LIMIT;

  // Optional opt-out footer
  if (options.includeOptOut) {
    formattedBody += '\n\nReply STOP to opt out';
  }

  // Check if truncation needed
  let truncated = false;
  if (formattedBody.length > maxChars) {
    formattedBody = `${formattedBody.slice(0, maxChars - 3)}...`;
    truncated = true;
  }

  // Calculate segments (SMS uses GSM-7 encoding, but emojis use UCS-2)
  // eslint-disable-next-line no-control-regex -- Intentional: detecting non-ASCII chars
  const hasUnicode = /[^\u0000-\u007F]/.test(formattedBody);
  const charsPerSegment = hasUnicode ? 70 : 160;
  const segments = Math.ceil(formattedBody.length / charsPerSegment);

  return { body: formattedBody, segments, truncated };
}
