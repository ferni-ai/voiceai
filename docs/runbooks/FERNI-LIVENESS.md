# Ferni liveness: is Ferni answering callers?

On 2026-10-11 every agent built since #886 joined calls and never replied
(a runtime file pruned from the image, `ERR_MODULE_NOT_FOUND`). Only a smoke
call caught it. `scripts/ops/ferni-liveness.mjs` reads the agents' Cloud
Logging lines (read-only) and fails when callers go unanswered.

```bash
node scripts/ops/ferni-liveness.mjs                    # both agents, last 60 min
node scripts/ops/ferni-liveness.mjs --env prod --minutes 1440 --json
```

Exit 0 healthy, 1 alarm, 2 logs unreadable. Alarms (per agent):

| Alarm                                                                                  | Default                                                   |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| a call with >= 2 caller turns and no reply                                             | any                                                       |
| uncaught exceptions                                                                    | > 2 (`--max-uncaught`)                                    |
| a runtime module failed to load (`ERR_MODULE_NOT_FOUND`, `Cannot find module/package`) | any                                                       |
| reply rate (replies / caller turns)                                                    | < 0.5 with >= 5 turns (`--min-reply-rate`, `--min-turns`) |

Healthy baseline, 24 h to 2026-10-11 21:40Z: prod 0.875 (63/72), dev 0.80
(294/367). Caller turns count every committed fragment, so 1.0 is not the
norm; a broken build drops it toward 0 and trips the silent-call alarm first.
`version` is the deployment's pod-template hash from the hostname: it changes
with every `lk agent deploy`.

## Running it on a schedule (needs Seth: none of this exists yet)

The script needs only `gcloud` and `roles/logging.viewer` on `johnb-2025`.

### Option A: GitHub Action (`.github/workflows/ferni-liveness.yml`, every 30 min)

Hosted minutes are frozen until Nov 1, so it is off until switched on.

1. Create a read-only service account and key:
   ```bash
   gcloud iam service-accounts create ferni-liveness --project=johnb-2025 \
     --display-name="Ferni liveness (logs read-only)"
   gcloud projects add-iam-policy-binding johnb-2025 \
     --member=serviceAccount:ferni-liveness@johnb-2025.iam.gserviceaccount.com \
     --role=roles/logging.viewer
   gcloud iam service-accounts keys create /tmp/ferni-liveness.json \
     --iam-account=ferni-liveness@johnb-2025.iam.gserviceaccount.com
   gh secret set FERNI_LIVENESS_SA_KEY < /tmp/ferni-liveness.json && rm /tmp/ferni-liveness.json
   ```
2. `gh variable set FERNI_LIVENESS --body on`
3. Alerts: a failed run posts to `SLACK_WEBHOOK_URL` (already a repo secret)
   and GitHub emails the workflow's owner.

About 1 minute per run, ~1,500 minutes a month at every 30 minutes; every
60 minutes halves that.

### Option B: Cloud Run job + Cloud Scheduler (no Actions minutes)

1. Same service account as step A.1 (no key needed).
2. A job image with node and gcloud running the script, e.g. from
   `gcr.io/google.com/cloudsdktool/google-cloud-cli:slim` plus node 22, copying
   `scripts/ops/ferni-liveness.mjs`:
   ```bash
   gcloud run jobs create ferni-liveness --project=johnb-2025 --region=us-central1 \
     --image=<image> --service-account=ferni-liveness@johnb-2025.iam.gserviceaccount.com \
     --command=node --args=/app/ferni-liveness.mjs,--minutes,30 --max-retries=0
   gcloud scheduler jobs create http ferni-liveness --project=johnb-2025 \
     --location=us-central1 --schedule='*/30 * * * *' \
     --uri=https://run.googleapis.com/v2/projects/johnb-2025/locations/us-central1/jobs/ferni-liveness:run \
     --http-method=POST --oauth-service-account-email=<scheduler invoker SA>
   ```
3. Alert on a failed execution: a Cloud Monitoring alert on
   `run.googleapis.com/job/completed_execution_count` with `result=failed`,
   notifying email or Slack.

### Faster, no code: log-based alerts for the crash shapes

The module-load and uncaught alarms are single lines, so a Cloud Monitoring
log-based alert fires within a minute of the first one, without waiting for a
scheduled run:

```
logName="projects/johnb-2025/logs/cloud-agents"
(textPayload:"ERR_MODULE_NOT_FOUND" OR textPayload:"UNCAUGHT_EXCEPTION")
```

The silent-call and reply-rate alarms need counts across lines, so they stay
with the script.
