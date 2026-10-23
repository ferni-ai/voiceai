/**
 * How each env name that prod sets, and that the flag manifest did not list when it was written, is
 * classified. Behaviour names are also in FLAG_MANIFEST; the others are not.
 * Every persona voice id the code reads is here as config too, set on prod or not, so the boot
 * line can print it and the secrets parity check can compare it (env-classification.test.ts).
 *
 * - secret: credentials, tokens, account, client and trunk ids, phone numbers and user ids. Shown as `<set>` only.
 * - config: an identifier, project, or model name that does not switch behaviour.
 * - behavior: changes what a caller hears or what the agent does, including which provider or pipeline runs. Listed in FLAG_MANIFEST.
 * - unread: set on prod, but no code under src/ reads it. A candidate to remove from prod.
 *
 * Checked by env-classification.test.ts: every behaviour name is in FLAG_MANIFEST.
 *
 * @module config/env-classification
 */
export type EnvClass = 'secret' | 'config' | 'behavior' | 'unread';

export const ENV_CLASSIFICATION: Readonly<Record<string, EnvClass>> = {
  ADAPTIVE_DELIVERY: 'unread',
  AGENT_NAME: 'config',
  ALEX_CHEN_VOICE_ID: 'config',
  ALPHA_VANTAGE_API_KEY: 'secret',
  ALPHA_VANTAGE_KEY: 'unread',
  ARRIVAL_GROUNDED: 'unread',
  CARTESIA_API_KEY: 'secret',
  CARTESIA_MODEL: 'config',
  CASCADE_TURN_DETECTION: 'behavior',
  COMM_SPECIALIST_VOICE_ID: 'config',
  DIRECTED_SPEECH: 'behavior',
  EVENT_PLANNER_VOICE_ID: 'config',
  FERNI_VOICE_ID: 'config',
  FINNHUB_API_KEY: 'secret',
  GENERIC_ADVISOR_VOICE_ID: 'config',
  GOOGLE_API_KEY: 'secret',
  GOOGLE_APPLICATION_CREDENTIALS: 'secret',
  GOOGLE_CLOUD_LOCATION: 'config',
  GOOGLE_CLOUD_PROJECT: 'config',
  JACK_BOGLE_VOICE_ID: 'config',
  JACK_B_VOICE_ID: 'config',
  JOEL_DICKSON_VOICE_ID: 'config',
  JOHN_BOGLE_VOICE_ID: 'config',
  JORDAN_TAYLOR_VOICE_ID: 'config',
  LOGS_ENABLE_GCP: 'unread',
  MAYA_SANTOS_VOICE_ID: 'config',
  MEMORY_STORE_TYPE: 'behavior',
  NATIVE_AUDIO_PROJECT: 'config',
  NAYAN_PATEL_VOICE_ID: 'config',
  NAYAN_VOICE_ID: 'config',
  NEWSDATA_API_KEY: 'secret',
  NODE_ENV: 'config',
  OPENAI_API_KEY: 'secret',
  PERSONA_ID: 'config',
  PETER_JOHN_VOICE_ID: 'config',
  PETER_LYNCH_VOICE_ID: 'config',
  PORT: 'config',
  POST_TTS_ENHANCEMENT_ENABLED: 'unread',
  PROMPT_MODE: 'behavior',
  REACTION_SIDETRACK: 'behavior',
  SENDGRID_API_KEY: 'secret',
  SIP_DOMAIN: 'config',
  SIP_TRUNK_ID: 'secret',
  SKIP_PREWARM_GENERATEREPLY: 'behavior',
  SPEECH_DIRECTOR: 'behavior',
  SPEECH_DIRECTOR_LAUGHTER: 'behavior',
  SPEND_SAVE_VOICE_ID: 'config',
  SPOTIFY_CLIENT_ID: 'secret',
  SPOTIFY_CLIENT_SECRET: 'secret',
  SPOTIFY_REFRESH_TOKEN: 'secret',
  TEAM_BY_NEED: 'behavior',
  TTS_PROVIDER: 'behavior',
  TURN_RECEIPT_OWNER_UIDS: 'secret',
  TWILIO_ACCOUNT_SID: 'secret',
  TWILIO_AUTH_TOKEN: 'secret',
  TWILIO_PHONE_NUMBER: 'secret',
  USE_FTIS: 'unread',
  USE_KYUTAI_STT: 'unread',
  USE_OPENAI_REALTIME: 'unread',
  VOICE_PIPELINE: 'behavior',
  WELLNESS_COACH_VOICE_ID: 'config',
};
