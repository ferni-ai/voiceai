#!/usr/bin/env npx tsx
/**
 * CTO Performance - System performance trends
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

interface PerformanceMetrics {
  period: string;
  services: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latency: { p50: number; p95: number; p99: number };
    errorRate: number;
    throughput: number;
    cpu: number;
    memory: number;
  }>;
  alerts: Array<{
    service: string;
    type: 'latency' | 'error' | 'resource';
    message: string;
    time: string;
  }>;
}

async function fetchPerformance(period: string, service?: string): Promise<PerformanceMetrics> {
  const services = [
    {
      name: 'voice-agent',
      status: 'healthy' as const,
      latency: { p50: 45, p95: 120, p99: 250 },
      errorRate: 0.1,
      throughput: 150,
      cpu: 35,
      memory: 68,
    },
    {
      name: 'api-server',
      status: 'healthy' as const,
      latency: { p50: 12, p95: 45, p99: 120 },
      errorRate: 0.05,
      throughput: 500,
      cpu: 25,
      memory: 45,
    },
    {
      name: 'tts-service',
      status: 'degraded' as const,
      latency: { p50: 85, p95: 200, p99: 450 },
      errorRate: 0.5,
      throughput: 100,
      cpu: 75,
      memory: 82,
    },
  ];

  return {
    period,
    services: service ? services.filter(s => s.name === service) : services,
    alerts: [
      {
        service: 'tts-service',
        type: 'latency',
        message: 'p95 latency exceeded 200ms threshold',
        time: '10 min ago',
      },
      {
        service: 'tts-service',
        type: 'resource',
        message: 'Memory usage at 82%',
        time: '5 min ago',
      },
    ],
  };
}

function renderStatus(status: 'healthy' | 'degraded' | 'down'): string {
  switch (status) {
    case 'healthy': return `${colors.green}● Healthy${colors.reset}`;
    case 'degraded': return `${colors.yellow}● Degraded${colors.reset}`;
    case 'down': return `${colors.red}● Down${colors.reset}`;
  }
}

function renderMetric(value: number, threshold: number, unit: string = ''): string {
  const color = value <= threshold ? colors.green : value <= threshold * 1.5 ? colors.yellow : colors.red;
  return `${color}${value}${unit}${colors.reset}`;
}

export async function ctoPerformance(options: { period?: string; service?: string; alerts?: boolean }): Promise<void> {
  const period = options.period || 'hour';
  const metrics = await fetchPerformance(period, options.service);

  console.log(`
${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           CTO PERFORMANCE - SYSTEM METRICS                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Period: Last ${period}${options.service ? ` | Service: ${options.service}` : ''}${colors.reset}

`);

  for (const svc of metrics.services) {
    console.log(`${colors.bold}${svc.name}${colors.reset} ${renderStatus(svc.status)}

  ${colors.bold}Latency${colors.reset}
    p50: ${renderMetric(svc.latency.p50, 50, 'ms')}  p95: ${renderMetric(svc.latency.p95, 150, 'ms')}  p99: ${renderMetric(svc.latency.p99, 300, 'ms')}

  ${colors.bold}Reliability${colors.reset}
    Error Rate: ${renderMetric(svc.errorRate, 0.5, '%')}  Throughput: ${svc.throughput} req/s

  ${colors.bold}Resources${colors.reset}
    CPU: ${renderMetric(svc.cpu, 70, '%')}  Memory: ${renderMetric(svc.memory, 80, '%')}
`);
  }

  if (options.alerts || metrics.alerts.length > 0) {
    console.log(`${colors.bold}${colors.yellow}⚠ Active Alerts${colors.reset}
`);
    for (const alert of metrics.alerts) {
      console.log(`  ${colors.yellow}●${colors.reset} [${alert.service}] ${alert.message}
    ${colors.dim}${alert.time}${colors.reset}
`);
    }
  }

  console.log(`
${colors.dim}Commands:${colors.reset}
  ferni cto performance --period week      # Change time period
  ferni cto performance --service api      # Filter by service
  ferni cto performance --alerts           # Show all alerts
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const periodIdx = args.findIndex((a) => a === '--period');
  const serviceIdx = args.findIndex((a) => a === '--service');
  ctoPerformance({
    period: periodIdx >= 0 ? args[periodIdx + 1] : undefined,
    service: serviceIdx >= 0 ? args[serviceIdx + 1] : undefined,
    alerts: args.includes('--alerts'),
  }).catch(console.error);
}
