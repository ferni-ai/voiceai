/**
 * The owner's approval for a consumer blog post (plain Node, for
 * blog-approval.yml). A drafted ferni.ai post that passed the gates and the
 * editorial judge opens labelled blog-needs-approval, with auto-merge off.
 * It publishes only when a repo admin adds the blog-approved label: this arms
 * auto-merge, pinned to the head commit the admin approved, so a later push
 * can't ride on the approval. A label added by anyone else is taken off again
 * and arms nothing.
 *
 *   node scripts/blog/approval.mjs <event.json>
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const APPROVED = 'blog-approved';
export const NEEDS_APPROVAL = 'blog-needs-approval';

/** Whether this labelled event approves a drafted post, and why not. */
export function approvalDecision(event, permission) {
  const pr = event.pull_request;
  const repo = event.repository?.full_name;
  const no = (reason) => ({ arm: false, reason });
  if (event.action !== 'labeled' || event.label?.name !== APPROVED)
    return no(`not the ${APPROVED} label`);
  if (!pr || pr.state !== 'open' || pr.draft) return no('the PR is not open and ready for review');
  if (pr.head?.repo?.full_name !== repo || !pr.head.ref.startsWith('blog/draft-'))
    return no('the PR is not a drafted blog post from this repo');
  if (!pr.labels?.some((l) => l.name === NEEDS_APPROVAL))
    return no(`the PR has no ${NEEDS_APPROVAL} label (it did not pass the judge)`);
  const login = event.sender?.login ?? 'someone';
  const unlabel = (reason) => ({ ...no(reason), unlabel: true });
  if (event.sender?.type === 'Bot') return unlabel(`${login} is a bot`);
  if (permission !== 'admin')
    return unlabel(
      `${login} is not a repo admin (${permission ?? 'unknown'}), so the label is ignored`
    );
  return { arm: true, reason: `${login} approved ${pr.head.sha.slice(0, 7)}` };
}

/** Looks up the labeler's permission and arms auto-merge when the decision says so. */
export function runApproval(event, gh) {
  const repo = event.repository.full_name;
  let permission;
  try {
    const url = `repos/${repo}/collaborators/${encodeURIComponent(event.sender.login)}/permission`;
    permission = JSON.parse(gh(['api', url])).permission;
  } catch {
    permission = undefined;
  }
  const decision = approvalDecision(event, permission);
  const { number, head } = event.pull_request ?? {};
  if (decision.arm) {
    // The repo uses a merge queue, so no merge method flag.
    gh(['pr', 'merge', String(number), '--auto', '--repo', repo, '--match-head-commit', head.sha]);
  } else if (decision.unlabel) {
    gh(['api', '-X', 'DELETE', `repos/${repo}/issues/${number}/labels/${APPROVED}`]);
  }
  return decision;
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf-8' });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const event = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  const decision = runApproval(event, gh);
  const pr = `#${event.pull_request?.number}`;
  console.log(
    decision.arm
      ? `Armed auto-merge on ${pr}: ${decision.reason}`
      : `Not armed on ${pr}: ${decision.reason}`
  );
}
