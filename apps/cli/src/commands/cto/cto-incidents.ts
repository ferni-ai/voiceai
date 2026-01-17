#!/usr/bin/env npx tsx
/**
 * CTO Incidents - Incident tracking, postmortems
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface Incident {
  id: string;
  title: string;
  status: 'active' | 'investigating' | 'resolved' | 'postmortem';
  severity: 'sev1' | 'sev2' | 'sev3';
  startTime: string;
  endTime?: string;
  impact: string;
  rootCause?: string;
  timeline: Array<{ time: string; action: string }>;
}

async function fetchIncidents(): Promise<Incident[]> {
  return [
    {
      id: 'INC-042',
      title: 'Voice agent high latency',
      status: 'resolved',
      severity: 'sev2',
      startTime: '2025-01-15T14:30:00Z',
      endTime: '2025-01-15T15:45:00Z',
      impact: '15% of calls affected',
      rootCause: 'Memory leak in TTS service',
      timeline: [
        { time: '14:30', action: 'Alert triggered - p95 latency > 500ms' },
        { time: '14:35', action: 'On-call acknowledged' },
        { time: '14:50', action: 'Root cause identified - memory leak' },
        { time: '15:15', action: 'Fix deployed' },
        { time: '15:45', action: 'Incident resolved' },
      ],
    },
    {
      id: 'INC-041',
      title: 'GitHub Actions billing blocked',
      status: 'postmortem',
      severity: 'sev3',
      startTime: '2025-01-17T10:00:00Z',
      endTime: '2025-01-17T12:00:00Z',
      impact: 'CI/CD pipeline blocked',
      rootCause: 'Exceeded GitHub Actions minutes',
      timeline: [
        { time: '10:00', action: 'CI jobs failing' },
        { time: '10:15', action: 'Identified billing issue' },
        { time: '11:00', action: 'Set up self-hosted runner' },
        { time: '12:00', action: 'Pipeline restored' },
      ],
    },
  ];
}

function renderStatus(status: Incident['status']): string {
  switch (status) {
    case 'active': return `${colors.red}🔴 ACTIVE${colors.reset}`;
    case 'investigating': return `${colors.yellow}🟡 INVESTIGATING${colors.reset}`;
    case 'resolved': return `${colors.green}🟢 RESOLVED${colors.reset}`;
    case 'postmortem': return `${colors.blue}📝 POSTMORTEM${colors.reset}`;
  }
}

function renderSeverity(severity: Incident['severity']): string {
  switch (severity) {
    case 'sev1': return `${colors.red}SEV1${colors.reset}`;
    case 'sev2': return `${colors.yellow}SEV2${colors.reset}`;
    case 'sev3': return `${colors.blue}SEV3${colors.reset}`;
  }
}

export async function ctoIncidents(options: { active?: boolean; create?: boolean; postmortem?: string }): Promise<void> {
  if (options.create) {
    console.log(`
${colors.bold}${colors.red}🚨 CREATE NEW INCIDENT${colors.reset}

${colors.yellow}Interactive mode would prompt for:${colors.reset}
  - Title
  - Severity (sev1/sev2/sev3)
  - Initial impact assessment
  - On-call assignment

${colors.dim}This would create an incident in PagerDuty/Slack${colors.reset}
`);
    return;
  }

  if (options.postmortem) {
    const incident = (await fetchIncidents()).find(i => i.id === options.postmortem);
    if (!incident) {
      console.log(`${colors.red}Incident ${options.postmortem} not found${colors.reset}`);
      return;
    }

    console.log(`
${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           INCIDENT POSTMORTEM - ${incident.id}                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Title:${colors.reset} ${incident.title}
${colors.bold}Severity:${colors.reset} ${renderSeverity(incident.severity)}
${colors.bold}Duration:${colors.reset} ${incident.startTime} → ${incident.endTime}
${colors.bold}Impact:${colors.reset} ${incident.impact}

${colors.bold}Root Cause:${colors.reset}
${incident.rootCause}

${colors.bold}Timeline:${colors.reset}
${incident.timeline.map(t => `  ${colors.cyan}${t.time}${colors.reset} - ${t.action}`).join('\n')}

${colors.bold}Action Items:${colors.reset}
  [ ] Add monitoring for this failure mode
  [ ] Document runbook
  [ ] Review and merge prevention fix

${colors.dim}Export with: ferni cto incidents --postmortem ${incident.id} --export${colors.reset}
`);
    return;
  }

  let incidents = await fetchIncidents();

  if (options.active) {
    incidents = incidents.filter(i => i.status === 'active' || i.status === 'investigating');
  }

  console.log(`
${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           CTO INCIDENTS - TRACKING                         ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${options.active ? `${colors.dim}Showing active incidents only${colors.reset}` : ''}

`);

  if (incidents.length === 0) {
    console.log(`${colors.green}✓ No active incidents${colors.reset}\n`);
  }

  for (const incident of incidents) {
    console.log(`${colors.bold}${incident.id}${colors.reset} ${incident.title}
  ${renderStatus(incident.status)} | ${renderSeverity(incident.severity)}
  ${colors.dim}Started: ${incident.startTime}${incident.endTime ? ` | Resolved: ${incident.endTime}` : ''}${colors.reset}
  Impact: ${incident.impact}
`);
  }

  console.log(`
${colors.dim}Commands:${colors.reset}
  ferni cto incidents --active           # Active incidents only
  ferni cto incidents --create           # Create new incident
  ferni cto incidents --postmortem INC-042  # View postmortem
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const postmortemIdx = args.findIndex((a) => a === '--postmortem');
  ctoIncidents({
    active: args.includes('--active'),
    create: args.includes('--create'),
    postmortem: postmortemIdx >= 0 ? args[postmortemIdx + 1] : undefined,
  }).catch(console.error);
}
