/**
 * The production readers behind the call sheet's ports. Existing readers only: the sheet's
 * store, the shared call-start forgotten read, the caller card's strict MINOR_CARE hold, and
 * the crisis checks the greeting date uses (on this call, and CRISIS_QUIET_DAYS lately).
 *
 * @module agents/multi-agent/call-sheet/wiring
 */
import { hadRecentCrisis } from '../../../intelligence/pondering/index.js';
import {
  firestoreForgottenStore,
  forgetGenerationSeen,
} from '../../../memory/adapters/firestore/forgotten-store.js';
import { forgottenInProcess } from '../../../memory/index.js';
import { sharedHeldStrict } from '../../../services/outreach/minor-care-shared-hold.js';
import { crisisRiskThisCall } from '../../../services/safety/index.js';
import { readPersonModel } from '../../../services/stores/person-model-store.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { minorHeld, userHeld } from '../../../utils/minor-care.js';
import type { CallSheetPorts } from './ports.js';

/** How long the strict hold read may take; late means held. */
const HOLD_READ_MS = 400;

export function callSheetPorts(): CallSheetPorts {
  return {
    async sheet(userId) {
      const db = getFirestoreDb();
      return db ? readPersonModel(db, userId) : null;
    },
    async forgotten(userId) {
      const state = await firestoreForgottenStore(getFirestoreDb()).readForgotten(userId);
      const topics = state.topics && [...state.topics, ...forgottenInProcess(userId)];
      return { topics, generation: state.generation };
    },
    minorCare: async (userId) =>
      userHeld(userId) || sharedHeldStrict(userId, process.env, HOLD_READ_MS),
    async recentCrisis(userId) {
      const db = getFirestoreDb();
      return db ? hadRecentCrisis(db, userId) : true;
    },
    heldNow: (sessionId) => crisisRiskThisCall(sessionId) || minorHeld(sessionId),
    generationSeen: forgetGenerationSeen,
  };
}
