/**
 * Rich Email Templates
 *
 * Beautiful HTML email templates with Ferni branding for personalized outreach.
 * Supports various occasions with warm, human-feeling designs.
 *
 * @module services/contacts/rich-email-templates
 */

import type { OutreachOccasion, OutreachTone } from './types.js';

// ============================================================================
// BRAND COLORS (from design-system)
// ============================================================================

const COLORS = {
  // Primary brand colors
  ferni: '#4a6741', // Sage green
  background: '#FFFDFB', // Paper cream
  text: '#2C2520', // Natural ink
  textMuted: '#70605a',

  // Accent colors
  warmGold: '#c4a96a',
  softCoral: '#c4856a',
  calmTeal: '#3a6b73',

  // Occasion-specific
  christmas: '#c4856a', // Warm coral
  newYear: '#c4a96a', // Gold
  birthday: '#a67a6a', // Rose terracotta
  thanksgiving: '#b8956a', // Warm amber
};

// ============================================================================
// BASE TEMPLATE
// ============================================================================

function baseTemplate(
  content: string,
  options: {
    accentColor?: string;
    previewText?: string;
  } = {}
): string {
  const { accentColor = COLORS.ferni, previewText = '' } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Message from Ferni</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: ${COLORS.background};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: ${COLORS.text};
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 4px 24px rgba(44, 37, 32, 0.08);
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: ${accentColor};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    .logo-text {
      color: white;
      font-size: 20px;
      font-weight: 600;
    }
    .greeting {
      font-size: 28px;
      font-weight: 600;
      color: ${COLORS.text};
      margin: 0 0 8px;
      line-height: 1.3;
    }
    .occasion {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${accentColor};
      font-weight: 500;
    }
    .message {
      font-size: 18px;
      color: ${COLORS.text};
      margin: 24px 0;
      white-space: pre-line;
    }
    .signature {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid rgba(44, 37, 32, 0.1);
    }
    .signature-name {
      font-weight: 600;
      color: ${COLORS.text};
    }
    .signature-note {
      font-size: 14px;
      color: ${COLORS.textMuted};
      margin-top: 4px;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      font-size: 13px;
      color: ${COLORS.textMuted};
    }
    .footer a {
      color: ${accentColor};
      text-decoration: none;
    }
    .decoration {
      text-align: center;
      font-size: 36px;
      margin: 24px 0;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1614;
      }
      .card {
        background: #2a2420;
      }
      .greeting, .message, .signature-name {
        color: #faf6f0;
      }
      .signature {
        border-top-color: rgba(255, 255, 255, 0.1);
      }
    }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ''}
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
}

// ============================================================================
// OCCASION TEMPLATES
// ============================================================================

interface TemplateParams {
  recipientName: string;
  senderName: string;
  message: string;
  personalNote?: string;
}

export function christmasTemplate(params: TemplateParams): string {
  const { recipientName, senderName, message, personalNote } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Season's Greetings</p>
        <h1 class="greeting">Merry Christmas, ${recipientName}</h1>
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">With warmth,<br>${senderName}</p>
        <p class="signature-note">Sent with care via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>Wishing you peace, joy, and wonderful moments with loved ones.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.christmas,
    previewText: `Merry Christmas from ${senderName}`,
  });
}

export function newYearTemplate(params: TemplateParams): string {
  const { recipientName, senderName, message, personalNote } = params;
  const year = new Date().getFullYear() + 1;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">New Year Wishes</p>
        <h1 class="greeting">Happy ${year}, ${recipientName}</h1>
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">Here's to new beginnings,<br>${senderName}</p>
        <p class="signature-note">Sent with hope via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>May this year bring you joy, growth, and wonderful surprises.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.newYear,
    previewText: `Happy New Year from ${senderName}`,
  });
}

export function birthdayTemplate(params: TemplateParams & { age?: number }): string {
  const { recipientName, senderName, message, personalNote, age } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Birthday Wishes</p>
        <h1 class="greeting">Happy Birthday, ${recipientName}</h1>
        ${age ? `<p style="font-size: 16px; color: ${COLORS.textMuted};">Celebrating ${age} amazing years</p>` : ''}
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">Wishing you the best,<br>${senderName}</p>
        <p class="signature-note">Sent with warmth via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>May your special day be filled with love, laughter, and all your favorites.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.birthday,
    previewText: `Happy Birthday from ${senderName}`,
  });
}

export function thanksgivingTemplate(params: TemplateParams): string {
  const { recipientName, senderName, message, personalNote } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Thanksgiving Greetings</p>
        <h1 class="greeting">Happy Thanksgiving, ${recipientName}</h1>
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">With gratitude,<br>${senderName}</p>
        <p class="signature-note">Sent with thankfulness via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>Grateful for you and the warmth you bring to my life.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.thanksgiving,
    previewText: `Happy Thanksgiving from ${senderName}`,
  });
}

export function checkInTemplate(params: TemplateParams): string {
  const { recipientName, senderName, message, personalNote } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Thinking of You</p>
        <h1 class="greeting">Hey ${recipientName},</h1>
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">Talk soon,<br>${senderName}</p>
        <p class="signature-note">Sent with care via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>Just a note to say you're on my mind.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.ferni,
    previewText: `A note from ${senderName}`,
  });
}

export function sympathyTemplate(params: TemplateParams): string {
  const { recipientName, senderName, message, personalNote } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Thinking of You</p>
        <h1 class="greeting">${recipientName},</h1>
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">With love and support,<br>${senderName}</p>
        <p class="signature-note">Sent with compassion via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>I'm here for you, always.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.calmTeal,
    previewText: `Thinking of you - ${senderName}`,
  });
}

export function congratulationsTemplate(params: TemplateParams & { achievement?: string }): string {
  const { recipientName, senderName, message, personalNote, achievement } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Congratulations</p>
        <h1 class="greeting">Amazing news, ${recipientName}</h1>
        ${achievement ? `<p style="font-size: 16px; color: ${COLORS.warmGold}; font-weight: 500;">${escapeHtml(achievement)}</p>` : ''}
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">So proud of you,<br>${senderName}</p>
        <p class="signature-note">Sent with excitement via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>You deserve every bit of this success.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.warmGold,
    previewText: `Congratulations from ${senderName}`,
  });
}

export function anniversaryTemplate(params: TemplateParams & { years?: number }): string {
  const { recipientName, senderName, message, personalNote, years } = params;

  const content = `
    <div class="card">
      <div class="header">
        <div class="logo"><span class="logo-text">F</span></div>
        <p class="occasion">Anniversary Wishes</p>
        <h1 class="greeting">Happy Anniversary, ${recipientName}</h1>
        ${years ? `<p style="font-size: 16px; color: ${COLORS.softCoral}; font-weight: 500;">Celebrating ${years} wonderful years</p>` : ''}
      </div>
      
      <div class="message">${escapeHtml(message)}</div>
      
      ${personalNote ? `<p style="font-style: italic; color: ${COLORS.textMuted};">${escapeHtml(personalNote)}</p>` : ''}
      
      <div class="signature">
        <p class="signature-name">With love,<br>${senderName}</p>
        <p class="signature-note">Sent with joy via Ferni</p>
      </div>
    </div>
    
    <div class="footer">
      <p>Here's to love, partnership, and many more years together.</p>
    </div>`;

  return baseTemplate(content, {
    accentColor: COLORS.softCoral,
    previewText: `Happy Anniversary from ${senderName}`,
  });
}

// ============================================================================
// TEMPLATE SELECTOR
// ============================================================================

export function getTemplateForOccasion(
  occasion: OutreachOccasion,
  params: TemplateParams & { age?: number; years?: number; achievement?: string }
): string {
  switch (occasion) {
    case 'christmas':
      return christmasTemplate(params);
    case 'new_year':
      return newYearTemplate(params);
    case 'birthday':
      return birthdayTemplate(params);
    case 'thanksgiving':
      return thanksgivingTemplate(params);
    case 'check_in':
    case 'thinking_of_you':
      return checkInTemplate(params);
    case 'sympathy':
    case 'memorial':
      return sympathyTemplate(params);
    case 'congratulations':
      return congratulationsTemplate(params);
    case 'anniversary':
      return anniversaryTemplate(params);
    default:
      return checkInTemplate(params);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Generate plain text version from HTML template (for email fallback)
 */
export function generatePlainTextVersion(message: string, senderName: string): string {
  return `${message}\n\n---\nSent with love via Ferni\n- ${senderName}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emailTemplates = {
  christmas: christmasTemplate,
  newYear: newYearTemplate,
  birthday: birthdayTemplate,
  thanksgiving: thanksgivingTemplate,
  checkIn: checkInTemplate,
  sympathy: sympathyTemplate,
  congratulations: congratulationsTemplate,
  anniversary: anniversaryTemplate,
  getForOccasion: getTemplateForOccasion,
  generatePlainText: generatePlainTextVersion,
};

export default emailTemplates;
