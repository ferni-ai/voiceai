/**
 * The identity context's light public entry: persona ids and display names, with nothing
 * else behind them. `personas/index.ts` also loads the audio stack and a session registry,
 * so a module that only asks "is this a team persona, and what is it called" imports this
 * instead (#4154). personas/index.ts re-exports it, so this list is the one place these
 * names are published.
 */
export {
  ALIAS_TO_CANONICAL,
  ALL_CANONICAL_IDS,
  assertCanonical,
  CANONICAL_IDS,
  CANONICAL_TO_FRONTEND,
  DISPLAY_NAMES,
  fromFrontend,
  FRONTEND_TO_CANONICAL,
  isCanonicalId,
  isKnownId,
  isSamePersona,
  isValidPersonaId,
  livePersonaId,
  toCanonical,
  toFrontend,
  validateAndLog,
  type CanonicalPersonaId,
  type FrontendPersonaId,
} from '../persona-ids.js';
