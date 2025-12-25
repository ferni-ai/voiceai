/**
 * Calendar Component
 *
 * Calendar view for journal history with date filtering.
 *
 * @module voice-journal/calendar
 */

import { getModal, getEntries, getCalendarMonth, setCalendarMonth, getFilterDate, setFilterDate } from './state.js';
import { renderEntries } from './entries.js';

// ============================================================================
// MONTH NAMES
// ============================================================================

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// ============================================================================
// CALENDAR NAVIGATION
// ============================================================================

export function navigatePrevMonth(): void {
  const calendarMonth = getCalendarMonth();
  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  renderCalendar();
}

export function navigateNextMonth(): void {
  const calendarMonth = getCalendarMonth();
  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  renderCalendar();
}

// ============================================================================
// DATE FILTERING
// ============================================================================

/**
 * Filter entries by a specific date or clear filter
 */
export function filterEntriesByDate(dateStr: string | null): void {
  setFilterDate(dateStr);
  renderCalendar();
  renderEntries();
}

// ============================================================================
// CALENDAR RENDERING
// ============================================================================

export function renderCalendar(): void {
  const modal = getModal();
  const entries = getEntries();
  const calendarMonth = getCalendarMonth();
  const container = modal?.querySelector('#journal-calendar');
  if (!container) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();

  // Get entries by date for this month
  const entriesByDate = new Map<string, number>();
  entries.forEach((entry) => {
    const date = new Date(entry.createdAt);
    if (date.getMonth() === month && date.getFullYear() === year) {
      const key = date.getDate().toString();
      entriesByDate.set(key, (entriesByDate.get(key) || 0) + 1);
    }
  });

  let calendarHtml = `
    <div class="calendar-header">
      <button class="calendar-nav" data-action="prev-month" aria-label="Previous month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <span class="calendar-title">${MONTH_NAMES[month]} ${year}</span>
      <button class="calendar-nav" data-action="next-month" aria-label="Next month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
    <div class="calendar-grid">
      <div class="calendar-day-name">S</div>
      <div class="calendar-day-name">M</div>
      <div class="calendar-day-name">T</div>
      <div class="calendar-day-name">W</div>
      <div class="calendar-day-name">T</div>
      <div class="calendar-day-name">F</div>
      <div class="calendar-day-name">S</div>
  `;

  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    calendarHtml += '<div class="calendar-day calendar-day--empty"></div>';
  }

  // Get current filter
  const filterDate = getFilterDate();

  // Days of month
  const today = new Date();
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const hasEntry = entriesByDate.has(day.toString());
    const entryCount = entriesByDate.get(day.toString()) || 0;
    const isToday =
      day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const dateKey = `${year}-${month + 1}-${day}`;
    const isSelected = filterDate === dateKey;

    calendarHtml += `
      <div class="calendar-day ${hasEntry ? 'calendar-day--has-entry' : ''} ${isToday ? 'calendar-day--today' : ''} ${isSelected ? 'calendar-day--selected' : ''}" 
           data-date="${dateKey}"
           title="${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}${hasEntry ? ' - Click to filter' : ''}"
           ${hasEntry ? 'role="button" tabindex="0"' : ''}>
        ${day}
        ${hasEntry ? `<span class="calendar-dot"></span>` : ''}
      </div>
    `;
  }

  calendarHtml += '</div>';

  // Add filter indicator
  if (filterDate) {
    const [fYear, fMonth, fDay] = filterDate.split('-').map(Number);
    const filterDateFormatted = new Date(fYear, fMonth - 1, fDay).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    calendarHtml += `
      <div class="calendar-filter-active">
        <span>Showing entries from ${filterDateFormatted}</span>
        <button class="calendar-clear-filter" data-action="clear-filter" aria-label="Clear filter">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Clear
        </button>
      </div>
    `;
  }

  container.innerHTML = calendarHtml;
}

