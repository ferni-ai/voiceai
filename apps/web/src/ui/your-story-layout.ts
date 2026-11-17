/**
 * Your Story layout rules that depend on which visualizations had data.
 *
 * The dashboard draws every section's frame up front and removes a
 * visualization box when its data is missing (an empty frame would read as a
 * reading of zero). What is left behind must still read well:
 * - a section with nothing but its heading is removed (a heading over nothing
 *   looks broken, and it has no copy that says how it fills);
 * - a row left with one visualization lets it take the full width;
 * - list-like rows (Open Loops) stack, so their text has room to wrap.
 *
 * @module ui/your-story-layout
 */

const SECTION = '.your-story__section';
const SECTION_TITLE = 'your-story__section-title';
const ROW = '.your-story__viz-row';

/** Remove emptied rows, then sections holding nothing but their heading. */
export function pruneEmptySections(root: ParentNode): void {
  root.querySelectorAll(ROW).forEach((row) => {
    if (row.children.length === 0) row.remove();
  });
  root.querySelectorAll(SECTION).forEach((section) => {
    const hasContent = Array.from(section.children).some((child) => !child.classList.contains(SECTION_TITLE));
    if (!hasContent) section.remove();
  });
}

/** Row grid rules, injected inside the dashboard stylesheet where the old row rule was. */
export const STORY_ROW_STYLES = `
      .your-story__viz-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-md);
        margin-bottom: var(--space-md);
      }

      /* One visualization left in a row (its partner had no data): full width, not half */
      .your-story__viz-row > :only-child,
      .your-story__viz-row--stack > * {
        grid-column: 1 / -1;
      }
`;
