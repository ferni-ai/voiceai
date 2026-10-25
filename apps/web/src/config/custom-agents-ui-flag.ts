/**
 * Custom agents ("My Creations", the Digital Twin wizard). Off by default.
 *
 * The 2026-10-18 marketplace audit found nobody can finish the journey: there
 * is no way to start a voice call with a custom agent, the library voices are
 * made-up ids the server now refuses, the preview clips don't exist and the
 * clone flow is gated off. 12 agents from 5 people, 0 calls in 30 days. While
 * off, the My Creations tab and the journal panel's "Create" buttons are not
 * drawn and the creation wizard opens nothing, so no one walks into a dead end.
 * Agents people already made stay in the journal panel. Turn it on with
 * `VITE_CUSTOM_AGENTS_UI=true` once a custom agent can be called.
 */
export function isCustomAgentsUiOn(): boolean {
  return import.meta.env.VITE_CUSTOM_AGENTS_UI === 'true';
}
