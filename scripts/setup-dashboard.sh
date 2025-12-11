#!/bin/bash
# Setup Cloud Monitoring Dashboard for Ferni
# Shows real-time user activity and infrastructure metrics
# Run once: chmod +x scripts/setup-dashboard.sh && ./scripts/setup-dashboard.sh

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}"

echo "📊 Creating Cloud Monitoring Dashboard for $PROJECT_ID"

# Create the dashboard JSON
cat > /tmp/ferni-dashboard.json << 'EOF'
{
  "displayName": "Ferni Voice AI - User Activity",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Active Instances (Concurrent Users)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/instance_count\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_MAX"
                  }
                }
              },
              "plotType": "LINE"
            }],
            "yAxis": {"label": "Instances"}
          }
        }
      },
      {
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Count (User Sessions)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE"
                  }
                }
              },
              "plotType": "STACKED_BAR"
            }],
            "yAxis": {"label": "Requests/sec"}
          }
        }
      },
      {
        "yPos": 4,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Response Latency (p50/p95/p99)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_50"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "p50"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_95"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "p95"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_99"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "p99"
              }
            ],
            "yAxis": {"label": "Latency (ms)"}
          }
        }
      },
      {
        "xPos": 4,
        "yPos": 4,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "Error Rate by Response Code",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "groupByFields": ["metric.labels.response_code_class"]
                  }
                }
              },
              "plotType": "STACKED_BAR"
            }],
            "yAxis": {"label": "Requests/sec"}
          }
        }
      },
      {
        "xPos": 8,
        "yPos": 4,
        "width": 4,
        "height": 4,
        "widget": {
          "title": "CPU & Memory Usage",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/cpu/utilizations\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_95"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "CPU %"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_95"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "Memory %"
              }
            ],
            "yAxis": {"label": "Utilization %"}
          }
        }
      },
      {
        "yPos": 8,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Billable Instance Time (Cost Driver)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/billable_instance_time\"",
                  "aggregation": {
                    "alignmentPeriod": "3600s",
                    "perSeriesAligner": "ALIGN_SUM"
                  }
                }
              },
              "plotType": "STACKED_BAR"
            }],
            "yAxis": {"label": "Instance-seconds/hour"}
          }
        }
      },
      {
        "xPos": 6,
        "yPos": 8,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Startup Latency (Cold Starts)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/startup_latencies\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_99"
                  }
                }
              },
              "plotType": "LINE"
            }],
            "yAxis": {"label": "Startup time (ms)"}
          }
        }
      },
      {
        "yPos": 12,
        "width": 12,
        "height": 2,
        "widget": {
          "title": "Quick Stats",
          "scorecard": {
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/instance_count\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_MAX"
                }
              }
            },
            "sparkChartView": {
              "sparkChartType": "SPARK_LINE"
            }
          }
        }
      }
    ]
  }
}
EOF

# Create the dashboard
echo "Creating dashboard..."
gcloud monitoring dashboards create --config-from-file=/tmp/ferni-dashboard.json 2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Dashboard created!"
  echo ""
  echo "📊 View it here:"
  echo "   https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
  echo ""
else
  echo "⚠️  Dashboard creation had issues. It may already exist."
  echo "   Check: https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
fi

rm /tmp/ferni-dashboard.json
