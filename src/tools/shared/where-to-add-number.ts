/**
 * Where a person adds and verifies the number Ferni texts or calls.
 *
 * Ferni only texts or calls the verified phone on the account, so when there is
 * none the reply names the exact place to add one: the "How I reach you" row at
 * the top of the web menu (menu.items.howIReachYou in apps/web en-US.json).
 * "Add one in Settings" named no row anyone could find.
 * where-to-add-number.test.ts keeps this in step with the menu label.
 */
export const WHERE_TO_ADD_NUMBER = 'You can add your number in the menu, under How I reach you.';
