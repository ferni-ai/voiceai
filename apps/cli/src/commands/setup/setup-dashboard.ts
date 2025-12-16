#!/usr/bin/env npx tsx
/**
 * Setup Cloud Monitoring Dashboard
 *
 * Creates a Cloud Monitoring dashboard showing real-time user activity
 * and infrastructure metrics.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/setup/setup-dashboard.ts
 *   ferni setup dashboard
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..');

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function exec(cmd: string, options: { silent?: boolean } = {}): string {
  try {
    return execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (!options.silent) {
      throw error;
    }
    return '';
  }
}

function getProjectId(): string {
  let projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    projectId = exec('gcloud config get-value project 2>/dev/null', { silent: true }).trim();
  }
  return projectId;
}

// Dashboard configuration
const dashboardConfig = {
  displayName: 'Ferni Voice AI - User Activity',
  mosaicLayout: {
    columns: 12,
    tiles: [
      {
        width: 6,
        height: 4,
        widget: {
          title: 'Active Instances (Concurrent Users)',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/instance_count"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_MAX',
                    },
                  },
                },
                plotType: 'LINE',
              },
            ],
            yAxis: { label: 'Instances' },
          },
        },
      },
      {
        xPos: 6,
        width: 6,
        height: 4,
        widget: {
          title: 'Request Count (User Sessions)',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_RATE',
                    },
                  },
                },
                plotType: 'STACKED_BAR',
              },
            ],
            yAxis: { label: 'Requests/sec' },
          },
        },
      },
      {
        yPos: 4,
        width: 4,
        height: 4,
        widget: {
          title: 'Response Latency (p50/p95/p99)',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_latencies"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_PERCENTILE_50',
                    },
                  },
                },
                plotType: 'LINE',
                legendTemplate: 'p50',
              },
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_latencies"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_PERCENTILE_95',
                    },
                  },
                },
                plotType: 'LINE',
                legendTemplate: 'p95',
              },
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_latencies"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_PERCENTILE_99',
                    },
                  },
                },
                plotType: 'LINE',
                legendTemplate: 'p99',
              },
            ],
            yAxis: { label: 'Latency (ms)' },
          },
        },
      },
      {
        xPos: 4,
        yPos: 4,
        width: 4,
        height: 4,
        widget: {
          title: 'Error Rate by Response Code',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_RATE',
                      groupByFields: ['metric.labels.response_code_class'],
                    },
                  },
                },
                plotType: 'STACKED_BAR',
              },
            ],
            yAxis: { label: 'Requests/sec' },
          },
        },
      },
      {
        xPos: 8,
        yPos: 4,
        width: 4,
        height: 4,
        widget: {
          title: 'CPU & Memory Usage',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/cpu/utilizations"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_PERCENTILE_95',
                    },
                  },
                },
                plotType: 'LINE',
                legendTemplate: 'CPU %',
              },
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/memory/utilizations"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_PERCENTILE_95',
                    },
                  },
                },
                plotType: 'LINE',
                legendTemplate: 'Memory %',
              },
            ],
            yAxis: { label: 'Utilization %' },
          },
        },
      },
      {
        yPos: 8,
        width: 6,
        height: 4,
        widget: {
          title: 'Billable Instance Time (Cost Driver)',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/billable_instance_time"',
                    aggregation: {
                      alignmentPeriod: '3600s',
                      perSeriesAligner: 'ALIGN_SUM',
                    },
                  },
                },
                plotType: 'STACKED_BAR',
              },
            ],
            yAxis: { label: 'Instance-seconds/hour' },
          },
        },
      },
      {
        xPos: 6,
        yPos: 8,
        width: 6,
        height: 4,
        widget: {
          title: 'Startup Latency (Cold Starts)',
          xyChart: {
            dataSets: [
              {
                timeSeriesQuery: {
                  timeSeriesFilter: {
                    filter:
                      'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/startup_latencies"',
                    aggregation: {
                      alignmentPeriod: '60s',
                      perSeriesAligner: 'ALIGN_PERCENTILE_99',
                    },
                  },
                },
                plotType: 'LINE',
              },
            ],
            yAxis: { label: 'Startup time (ms)' },
          },
        },
      },
      {
        yPos: 12,
        width: 12,
        height: 2,
        widget: {
          title: 'Quick Stats',
          scorecard: {
            timeSeriesQuery: {
              timeSeriesFilter: {
                filter:
                  'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/instance_count"',
                aggregation: {
                  alignmentPeriod: '60s',
                  perSeriesAligner: 'ALIGN_MAX',
                },
              },
            },
            sparkChartView: {
              sparkChartType: 'SPARK_LINE',
            },
          },
        },
      },
    ],
  },
};

export async function setupDashboard(): Promise<boolean> {
  const projectId = getProjectId();

  console.log(`${colors.cyan}📊 Creating Cloud Monitoring Dashboard for ${projectId}${colors.reset}\n`);

  // Write dashboard config to temp file
  const tempFile = '/tmp/ferni-dashboard.json';
  writeFileSync(tempFile, JSON.stringify(dashboardConfig, null, 2));

  // Create the dashboard
  console.log('Creating dashboard...');
  try {
    exec(`gcloud monitoring dashboards create --config-from-file=${tempFile}`, { silent: true });
    console.log(`
${colors.green}✅ Dashboard created!${colors.reset}

📊 View it here:
   https://console.cloud.google.com/monitoring/dashboards?project=${projectId}
`);
  } catch {
    console.log(`${colors.yellow}⚠️  Dashboard creation had issues. It may already exist.${colors.reset}`);
    console.log(`   Check: https://console.cloud.google.com/monitoring/dashboards?project=${projectId}`);
  }

  // Cleanup
  try {
    unlinkSync(tempFile);
  } catch {
    // Ignore cleanup errors
  }

  return true;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDashboard()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      process.exit(1);
    });
}
