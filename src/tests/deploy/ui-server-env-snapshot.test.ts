/**
 * The production web server's whole env and every Secret Manager mount, as the
 * deploy step builds them (ui-deploy-env.ts). The other deploy tests pin only
 * the keys they care about, so a dropped mount (LOG_HASH_SECRET) or a changed
 * value (an origin added to ALLOWED_ORIGINS) left them all green. Here any add,
 * drop or change fails until this list is updated on purpose, in the same PR.
 * Names and mappings only: secret values live in Secret Manager, never here.
 */
import { describe, expect, it } from 'vitest';
import { uiServerEnv, uiServerSecrets } from './ui-deploy-env.js';

const ENV = [
  'ALLOWED_ORIGINS=https://app.ferni.ai,https://ferni.ai,https://ferni-prod.web.app',
  'BUILD_SHA=$DEPLOY_SHA',
  'CALL_HOURS_GUARD=on',
  'COHORT_FLAGS=on',
  'DEPLOY_ENV=production',
  'EMAIL_FROM=$EMAIL_FROM',
  'EMAIL_PROVIDER=$EMAIL_PROVIDER',
  'FAMILY_CHECKIN_STOP=on',
  'FOLLOW_THROUGH_JOB=on',
  'GCLOUD_PROJECT=$GCP_PROJECT_ID',
  'GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID',
  'JOURNAL_ONE_STORE=on',
  'JOURNAL_TRANSCRIBE_VERTEX=on',
  'MEMORY_VIEW=on',
  'MINOR_CARE=on',
  'MINOR_CARE_OWNERS=on',
  'MINOR_CARE_SHARED_HOLD=on',
  'MORNING_BRIEF=on',
  'NODE_ENV=production',
  'ON_BEHALF_DNC_CHECK=on',
  'PONDERING=on',
  'PROACTIVE_CHANNELS=on',
  'PROMISES_PANEL=off',
  'SIP_TRUNK_ID=ST_AEE6NnKE84XP',
  'SMS_CRISIS_SCREEN=shadow',
  'TEAM_BY_NEED=on',
];

const SECRETS = [
  'ADMIN_API_KEYS=admin-api-key:latest',
  'ADMIN_KEY=admin-api-key:latest',
  'APNS_KEY_ID=apns-key-id:latest',
  'APNS_KEY_P8=apns-key-p8:latest',
  'APNS_TEAM_ID=apple-team-id:latest',
  'APNS_TOPIC=apns-topic:latest',
  'CARTESIA_API_KEY=cartesia-api-key:latest',
  'DATA_ENCRYPTION_KEY=data-encryption-key:latest',
  'DISPATCH_SIGNING_SECRET=dispatch-signing-secret:latest',
  'EVALOPS_ADMIN_KEY=evalops-admin-key:latest',
  'GITHUB_MARKETPLACE_TOKEN=github-marketplace-token:latest',
  'GOOGLE_CALENDAR_CLIENT_ID=google-calendar-client-id:latest',
  'GOOGLE_CALENDAR_CLIENT_SECRET=google-calendar-client-secret:latest',
  'IDENTIFIER_HASH_SECRET=identifier-hash-secret:latest',
  'LINKEDIN_CLIENT_ID=linkedin-client-id:latest',
  'LINKEDIN_CLIENT_SECRET=linkedin-client-secret:latest',
  'LIVEKIT_API_KEY=livekit-api-key:latest',
  'LIVEKIT_API_SECRET=livekit-api-secret:latest',
  'LIVEKIT_URL=livekit-url:latest',
  'LOG_HASH_SECRET=log-hash-secret:latest',
  'OWNER_EMAIL=owner-email:latest',
  'PROACTIVE_CHANNELS_USERS=proactive-channels-users:latest',
  'SENDGRID_API_KEY=sendgrid-api-key:latest',
  'SENDGRID_FROM_EMAIL=sendgrid-from-email:latest',
  'SENTRY_DSN=sentry-dsn:latest',
  'SIWA_KEY_ID=siwa-key-id:latest',
  'SIWA_KEY_P8=siwa-key-p8:latest',
  'SIWA_TEAM_ID=apple-team-id:latest',
  'TWILIO_ACCOUNT_SID=twilio-account-sid:latest',
  'TWILIO_AUTH_TOKEN=twilio-auth-token:latest',
  'TWILIO_PHONE_NUMBER=twilio-phone-number:latest',
  'TWITTER_CLIENT_ID=twitter-client-id:latest',
  'TWITTER_CLIENT_SECRET=twitter-client-secret:latest',
  'VAPID_PRIVATE_KEY=vapid-private-key:latest',
  'VAPID_PUBLIC_KEY=vapid-public-key:latest',
  'WAITLIST_APPROVAL_SECRET=waitlist-approval-secret:latest',
];

describe('john-bogle-ui env and secrets, in full', () => {
  it('the env is exactly this set of KEY=value', () => {
    expect([...uiServerEnv()].sort()).toEqual(ENV);
  });

  it('the Secret Manager mounts are exactly this set', () => {
    expect([...uiServerSecrets()].sort()).toEqual(SECRETS);
  });
});
