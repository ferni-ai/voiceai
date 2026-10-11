/**
 * Morning call detection for the Early Bird moment.
 *
 * Early Bird is earned, not handed out on page load: a call has to start in
 * the user's local morning and finish, and the moment plays at most once a day.
 */

const MORNING_CALL_DATE_KEY = 'ferni-morning-stretch-date';
const MORNING_START_HOUR = 5;
const MORNING_END_HOUR = 12;

export function shouldCelebrateMorningCall(
  callStartedAt: Date | null,
  lastCelebratedDate: string | null,
  now: Date = new Date()
): boolean {
  if (!callStartedAt) return false;
  const hour = callStartedAt.getHours();
  if (hour < MORNING_START_HOUR || hour >= MORNING_END_HOUR) return false;
  return lastCelebratedDate !== now.toDateString();
}

function readLastDate(): string | null {
  try {
    return localStorage.getItem(MORNING_CALL_DATE_KEY);
  } catch {
    return null; // Storage unavailable: still celebrate, just not deduplicated across reloads
  }
}

function writeLastDate(date: string): void {
  try {
    localStorage.setItem(MORNING_CALL_DATE_KEY, date);
  } catch {
    // Storage unavailable
  }
}

/**
 * Calls `onMorningCall` when a conversation that started in the morning ends.
 * Returns a function that stops watching.
 */
export function watchMorningCalls(onMorningCall: () => void): () => void {
  let startedAt: Date | null = null;
  const onStart = (): void => {
    startedAt = new Date();
  };
  const onEnd = (): void => {
    const callStartedAt = startedAt;
    startedAt = null;
    const now = new Date();
    if (!shouldCelebrateMorningCall(callStartedAt, readLastDate(), now)) return;
    writeLastDate(now.toDateString());
    onMorningCall();
  };
  window.addEventListener('ferni:conversation-start', onStart);
  window.addEventListener('ferni:conversation-end', onEnd);
  return () => {
    window.removeEventListener('ferni:conversation-start', onStart);
    window.removeEventListener('ferni:conversation-end', onEnd);
  };
}
