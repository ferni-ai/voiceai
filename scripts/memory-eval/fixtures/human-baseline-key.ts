/** The Friend Recall Test page's questions (ids as on the page) with the benchmark's categories and gold answers. */
import { RunDays, type MemoryCategory } from '../longmem-lib.js';

export const HUMAN_DAYS = new RunDays('2026-10-11'); // the page's "today"
/** Question id on the page -> benchmark category and gold answer. */
export const HUMAN_KEY: Record<string, { category: MemoryCategory; ask: string; gold: string }> = {
  'maya-dog': {
    category: 'single-session',
    ask: 'What kind of dog does Maya have?',
    gold: 'a golden retriever (named Biscuit)',
  },
  'maya-hospitals': {
    category: 'multi-session',
    ask: 'Which hospital before, and where now?',
    gold: "St. Mary's before, Denver Health now",
  },
  'maya-surgery-date': {
    category: 'temporal',
    ask: "What date was Biscuit's surgery?",
    gold: HUMAN_DAYS.weekdayBefore(6, 'Friday'),
  },
  'maya-work-now': {
    category: 'knowledge-update',
    ask: 'Where does Maya work these days?',
    gold: "Denver Health (not St. Mary's any more)",
  },
  'maya-sister': {
    category: 'abstention',
    ask: "What is Maya's sister's name?",
    gold: 'never said',
  },
  'maya-remark': {
    category: 'unprompted',
    ask: 'Ugh, another run of night shifts this week.',
    gold: 'her new job at Denver Health (or that its night shifts were meant to be better)',
  },
  'eli-company-now': {
    category: 'knowledge-update',
    ask: 'Which company does Eli work for now?',
    gold: 'Northwind (which acquired Lumen Labs)',
  },
  'eli-bakery': {
    category: 'single-session',
    ask: 'What was the bakery called?',
    gold: 'Rise and Grind',
  },
  'eli-acquirer': {
    category: 'multi-session',
    ask: 'Who bought the startup Eli joined?',
    gold: 'Northwind bought Lumen Labs',
  },
  'eli-still-bakery': {
    category: 'knowledge-update',
    ask: 'Is Eli still working at the bakery?',
    gold: 'no: he left Rise and Grind for Lumen Labs, which Northwind bought',
  },
  'eli-remark': {
    category: 'unprompted',
    ask: 'Big day, I shipped my first feature at work!',
    gold: 'his developer job (Lumen Labs, now Northwind) or his switch from baking',
  },
  'ruth-marcus': {
    category: 'single-session',
    ask: 'Which university is Marcus at?',
    gold: 'Purdue',
  },
  'ruth-book-now': {
    category: 'knowledge-update',
    ask: "What is Ruth's book club reading now?",
    gold: 'The Covenant of Water (not Lessons in Chemistry)',
  },
  'ruth-walt': {
    category: 'multi-session',
    ask: "How is Ruth's husband recovering?",
    gold: "well: Walt's hip replacement went well and he's walking with a cane",
  },
  'ruth-aerobics': {
    category: 'single-session',
    ask: 'What day does Ruth go to water aerobics?',
    gold: 'Tuesdays',
  },
  'ruth-brother-joan': {
    category: 'false-premise',
    ask: "How is Ruth's brother Joan doing?",
    gold: 'Joan is her sister, not her brother',
  },
  'ruth-daughter': {
    category: 'abstention',
    ask: "What is Ruth's daughter's name?",
    gold: 'never said',
  },
};
