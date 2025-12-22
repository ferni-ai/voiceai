/**
 * Calendar Routes
 *
 * This module has been refactored into smaller, more maintainable files.
 * See `calendar-routes/` directory for the modular implementation.
 *
 * @deprecated Import from './calendar-routes/index.js' instead
 */

// Re-export from new modular structure for backward compatibility
export { handleCalendarRoutes, handleCalendarRoutes as default } from './calendar-routes/index.js';
