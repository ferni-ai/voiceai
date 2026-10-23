/**
 * What Ferni remembers: the facts live recall uses, shown in the Ferni Knows
 * panel, with the correction modal to forget or fix one.
 *
 * "What I've Learned" listed persona memories and profile items, and its
 * forget button deleted from a store recall never reads, so a forgotten
 * fact came back on the next call. These come from /api/memories/remembered
 * (src/api/routes/remembered.ts): what is listed is what Ferni will
 * remember, and what is forgotten or corrected is gone from the next call.
 *
 * Off by default; build with VITE_MEMORY_CONTROL=true. It also opens from the
 * first call: seeing what is remembered about you is not an unlockable.
 *
 * @module ui/memory/remembered
 */
import { t } from '../../i18n/index.js';
import { apiDelete, apiGet, apiPatch } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';
import { toast } from '../whisper.ui.js';
import { closeFerniKnowsPanel, openFerniKnowsPanel, type KnowledgeItem } from './ferni-knows.ui.js';
import { memoryViewEnabled } from './known.js';
import { openCorrectionModal, type CorrectionSubmission } from './memory-correction.ui.js';

const log = createLogger('Remembered');

/** On with VITE_MEMORY_CONTROL, or with the memory view (known.ts), which it opens instead. */
export function memoryControlEnabled(): boolean {
  return import.meta.env.VITE_MEMORY_CONTROL === 'true' || memoryViewEnabled();
}

/** A fact as the server lists it (memory-control.ts RememberedFact). */
export interface RememberedFact {
  id: string;
  subject: string;
  detail: string;
  learnedAt?: string;
  earlier?: boolean;
  fromYou?: boolean;
}

const PREFERENCE =
  /\b(?:like|likes|love|loves|prefer|prefers|favou?rite|enjoy|enjoys|hate|hates)\b/i;
const GOAL = /\b(?:goal|plan|plans|wants? to|hoping|training for|saving for)\b/i;

/** One fact as a Ferni Knows item: in the caller's words, and marked when it is how things were. */
export function toKnowledgeItem(f: RememberedFact): KnowledgeItem {
  const self = f.subject === 'you';
  const text = self ? f.detail : `${f.subject}: ${f.detail}`;
  const learned = f.learnedAt ? new Date(f.learnedAt) : new Date(0);
  return {
    id: f.id,
    category: PREFERENCE.test(f.detail)
      ? 'preferences'
      : GOAL.test(f.detail)
        ? 'goals'
        : self
          ? 'about_you'
          : 'relationships',
    content: f.earlier ? `${text} (${t('ferniKnows.earlier')})` : text,
    // Only facts recall uses are listed, so each is one Ferni is sure enough to bring up.
    confidence: f.fromYou ? 1 : 0.9,
    source: 'explicit',
    learnedAt: learned,
    updatedAt: learned,
    ...(!self && { relatedEntity: f.subject }),
  };
}

/** What a correction asks of the server: forget the fact, correct it, or nothing yet. */
export function correctionRequest(
  s: CorrectionSubmission,
  current: string
): { method: 'DELETE' } | { method: 'PATCH'; value: string } | null {
  const value = s.correctedContent?.trim() ?? '';
  if (s.correctionType === 'delete') return { method: 'DELETE' };
  // "Was true, not any more" with nothing new to say: forget it.
  if (s.correctionType === 'outdated' && (!value || value === current)) return { method: 'DELETE' };
  if (!value || value === current) return null;
  return { method: 'PATCH', value };
}

async function load(): Promise<RememberedFact[] | null> {
  const res = await apiGet<{ facts?: RememberedFact[] }>('/api/memories/remembered');
  if (!res.ok) {
    log.warn({ status: res.status }, 'Remembered facts not loaded');
    return null;
  }
  return res.data?.facts ?? [];
}

/** What a done change says; a code or password typed as the fix was forgotten, not kept. */
export function doneToast(method: 'DELETE' | 'PATCH', data?: unknown): string {
  const status = typeof data === 'object' && data !== null && 'status' in data ? data.status : null;
  if (status === 'not-kept') return 'app.credentialNotKept';
  return method === 'DELETE' ? 'app.memoryRemoved' : 'app.memoryCorrected';
}

/** Open the panel with what Ferni remembers; the correct button opens the correction modal. */
export async function showRemembered(): Promise<void> {
  if (memoryViewEnabled()) {
    const { openMemoryView } = await import('./known-view.ui.js');
    return openMemoryView();
  }
  const facts = await load();
  if (!facts) {
    toast.error(t('app.couldNotLoadMemories'));
    return;
  }
  openFerniKnowsPanel(facts.map(toKnowledgeItem), (id) => {
    const fact = facts.find((f) => f.id === id);
    if (!fact) return;
    const item = toKnowledgeItem(fact);
    openCorrectionModal(
      {
        id,
        content: fact.detail,
        category: item.category,
        confidence: item.confidence,
        learnedAt: item.learnedAt,
        source: 'explicit',
      },
      async (submission) => {
        const req = correctionRequest(submission, fact.detail);
        if (!req) return;
        const url = `/api/memories/remembered/${encodeURIComponent(id)}`;
        const res =
          req.method === 'DELETE'
            ? await apiDelete(url)
            : await apiPatch(url, { value: req.value });
        if (res.ok) toast.success(t(doneToast(req.method, res.data)));
        else toast.error(t(res.status === 404 ? 'app.memoryNotFound' : 'app.couldNotRemoveMemory'));
        // Re-read either way, so the list shows what the server actually has.
        closeFerniKnowsPanel();
        await showRemembered();
      }
    );
  });
}
