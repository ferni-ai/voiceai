/**
 * Daily Report Email Template
 *
 * Beautiful HTML email template for daily admin reports.
 */

import type { DailyReportData, CallerRecord } from './daily-report.js';
import { formatDuration, formatChange } from './daily-report.js';

// ============================================================================
// HTML TEMPLATE
// ============================================================================

export function generateDailyReportHTML(data: DailyReportData): string {
  const formattedDate = new Date(data.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ferni Daily Report - ${data.date}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #4a6741 0%, #3d5a35 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .header p {
      color: rgba(255, 255, 255, 0.85);
      margin: 8px 0 0 0;
      font-size: 14px;
    }
    .content {
      padding: 24px;
    }
    .summary-grid {
      display: table;
      width: 100%;
      border-collapse: separate;
      border-spacing: 12px 0;
      margin-bottom: 24px;
    }
    .summary-card {
      display: table-cell;
      background: #f8faf7;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      width: 33%;
    }
    .summary-value {
      font-size: 32px;
      font-weight: 700;
      color: #4a6741;
      margin: 0;
    }
    .summary-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .summary-change {
      font-size: 11px;
      margin-top: 4px;
    }
    .change-positive { color: #22c55e; }
    .change-negative { color: #ef4444; }
    .change-neutral { color: #666; }
    .section {
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #333;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #4a6741;
    }
    .calls-table {
      width: 100%;
      border-collapse: collapse;
    }
    .calls-table th {
      text-align: left;
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .calls-table td {
      padding: 12px 0;
      border-bottom: 1px solid #f5f5f5;
      font-size: 14px;
    }
    .calls-table tr:last-child td {
      border-bottom: none;
    }
    .direction-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .direction-inbound {
      background: #dcfce7;
      color: #166534;
    }
    .direction-outbound {
      background: #dbeafe;
      color: #1e40af;
    }
    .persona-bar {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .persona-name {
      width: 80px;
      font-size: 14px;
      font-weight: 500;
    }
    .persona-bar-container {
      flex: 1;
      height: 20px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
      margin: 0 12px;
    }
    .persona-bar-fill {
      height: 100%;
      border-radius: 4px;
    }
    .persona-stats {
      font-size: 12px;
      color: #666;
      width: 80px;
      text-align: right;
    }
    .footer {
      background: #f8f9fa;
      padding: 16px 24px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .no-data {
      color: #999;
      font-style: italic;
      text-align: center;
      padding: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Ferni Daily Report</h1>
      <p>${formattedDate}</p>
    </div>

    <div class="content">
      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <p class="summary-value">${data.visitors.unique}</p>
          <p class="summary-label">Unique Visitors</p>
          <p class="summary-change ${getChangeClass(data.comparison.visitorsChange)}">
            ${formatChange(data.comparison.visitorsChange)} vs yesterday
          </p>
        </div>
        <div class="summary-card">
          <p class="summary-value">${data.visitors.totalSessions}</p>
          <p class="summary-label">Sessions</p>
          <p class="summary-change ${getChangeClass(data.comparison.sessionsChange)}">
            ${formatChange(data.comparison.sessionsChange)} vs yesterday
          </p>
        </div>
        <div class="summary-card">
          <p class="summary-value">${data.callers.total}</p>
          <p class="summary-label">Phone Calls</p>
          <p class="summary-change ${getChangeClass(data.comparison.callersChange)}">
            ${formatChange(data.comparison.callersChange)} vs yesterday
          </p>
        </div>
      </div>

      <!-- Phone Calls Section -->
      <div class="section">
        <h2 class="section-title">📱 Phone Calls</h2>
        ${generateCallsTable(data.callers.calls)}
      </div>

      <!-- Persona Usage Section -->
      <div class="section">
        <h2 class="section-title">👥 Persona Usage</h2>
        ${generatePersonaBars(data.personas)}
      </div>

      <!-- Session Stats -->
      <div class="section">
        <h2 class="section-title">⏱️ Session Stats</h2>
        <p style="margin: 0; font-size: 14px; color: #333;">
          Average session duration: <strong>${data.visitors.avgSessionDuration} minutes</strong>
        </p>
        ${data.callers.total > 0 ? `
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #333;">
          Average call duration: <strong>${formatDuration(data.callers.avgDuration)}</strong>
        </p>
        ` : ''}
      </div>
    </div>

    <div class="footer">
      <p>This report was automatically generated by Ferni.</p>
      <p>Report period: ${data.date} 12:00 AM - 11:59 PM PT</p>
    </div>
  </div>
</body>
</html>
`;
}

// ============================================================================
// PLAIN TEXT VERSION
// ============================================================================

export function generateDailyReportPlainText(data: DailyReportData): string {
  const formattedDate = new Date(data.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let text = `
FERNI DAILY REPORT
${formattedDate}
${'='.repeat(50)}

📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Unique Visitors: ${data.visitors.unique} (${formatChange(data.comparison.visitorsChange)})
Total Sessions: ${data.visitors.totalSessions} (${formatChange(data.comparison.sessionsChange)})
Phone Calls: ${data.callers.total} (${formatChange(data.comparison.callersChange)})

`;

  if (data.callers.calls.length > 0) {
    text += `📱 PHONE CALLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    for (const call of data.callers.calls) {
      const time = call.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      text += `${call.phoneNumber} | ${call.direction.toUpperCase()} | ${formatDuration(call.duration)} | ${call.outcome} | ${time}\n`;
    }
    text += '\n';
  } else {
    text += `📱 PHONE CALLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No phone calls recorded.

`;
  }

  text += `👥 PERSONA USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  for (const persona of data.personas) {
    text += `${persona.personaName}: ${persona.sessions} sessions (${persona.percentage}%)\n`;
  }

  text += `
⏱️ SESSION STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avg Session Duration: ${data.visitors.avgSessionDuration} min
${data.callers.total > 0 ? `Avg Call Duration: ${formatDuration(data.callers.avgDuration)}` : ''}

---
This report was automatically generated by Ferni.
Report period: ${data.date} 12:00 AM - 11:59 PM PT
`;

  return text.trim();
}

// ============================================================================
// HELPERS
// ============================================================================

function getChangeClass(change: number): string {
  if (change > 0) return 'change-positive';
  if (change < 0) return 'change-negative';
  return 'change-neutral';
}

function generateCallsTable(calls: CallerRecord[]): string {
  if (calls.length === 0) {
    return '<p class="no-data">No phone calls recorded for this period.</p>';
  }

  let html = `
    <table class="calls-table">
      <thead>
        <tr>
          <th>Phone</th>
          <th>Direction</th>
          <th>Duration</th>
          <th>Outcome</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const call of calls) {
    const time = call.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const directionClass = call.direction === 'inbound' ? 'direction-inbound' : 'direction-outbound';

    html += `
        <tr>
          <td>${call.phoneNumber}</td>
          <td><span class="direction-badge ${directionClass}">${call.direction}</span></td>
          <td>${formatDuration(call.duration)}</td>
          <td>${call.outcome}</td>
          <td>${time}</td>
        </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  return html;
}

function generatePersonaBars(personas: { personaId: string; personaName: string; sessions: number; percentage: number }[]): string {
  if (personas.length === 0) {
    return '<p class="no-data">No persona usage recorded for this period.</p>';
  }

  const colors: Record<string, string> = {
    ferni: '#4a6741',
    maya: '#a67a6a',
    peter: '#3a6b73',
    alex: '#5a6b8a',
    jordan: '#c4856a',
    nayan: '#8a7a6a',
  };

  let html = '';
  for (const persona of personas) {
    const color = colors[persona.personaId] || '#888';
    html += `
      <div class="persona-bar">
        <span class="persona-name">${persona.personaName}</span>
        <div class="persona-bar-container">
          <div class="persona-bar-fill" style="width: ${persona.percentage}%; background: ${color};"></div>
        </div>
        <span class="persona-stats">${persona.sessions} (${persona.percentage}%)</span>
      </div>
    `;
  }

  return html;
}
