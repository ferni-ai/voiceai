/**
 * The TwiML a family check-in call plays when it goes out through Twilio
 * instead of LiveKit SIP (no SIP trunk configured). Polly reads every word as
 * written, so: no exclamation marks, the opening line asks the only question,
 * and the goodbye names the sponsor, not the family member on the line.
 *
 * @module services/family/family-checkin-twiml
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function checkinTwiml(openingLine: string, sponsorName: string, gatherUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">${escapeXml(openingLine)}</Say>
  <Gather input="speech" timeout="5" action="${escapeXml(gatherUrl)}">
    <Say voice="Polly.Joanna">Take your time.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I'll let ${escapeXml(sponsorName)} know I called. Take care.</Say>
</Response>`;
}
