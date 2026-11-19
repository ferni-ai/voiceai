# CI for every site and package, and gates that can go red

Date: 2026-11-16. Owner: Seth. Status: proposed.

## Why

An audit on 2026-11-16 found three things that looked fine and weren't:

| Surface              | Looked like                              | Was                                                                                                                                                                                        |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blog                 | Blog Publish Check green on every deploy | No post since Oct 19 (ferni.ai) / Oct 26 (developers). Blog Drafts failed three Mondays running: the `ANTHROPIC_API_KEY` secret is empty and the judge said "no readable verdict" (#3927). |
| design.ferni.ai      | Design System nightly green              | Last deployed 2026-01-06, 41 content commits behind `apps/website/design-system-portal`. No workflow deploys it.                                                                           |
| npm                  | `publish` job in `design-system.yml`     | `@ferni/design-system` and `@ferni/react` were never published (npm 404); the job runs only on a manual dispatch or a `[publish]` commit.                                                  |
| marketplace.ferni.ai | Up (200)                                 | Deployed by hand (last 2026-10-12), no workflow; `/images/favicon.svg` and `/categories/` are 404.                                                                                         |

The shape is the same each time: a green signal that could not have gone red. "SOTA CI" here means closing that class first, then the usual best practice.

## Coverage today

Apps with **no** workflow at all: `apps/website/marketplace-portal`, `apps/website/design-system-portal`, `apps/marketing`, `apps/macos-menubar`, `apps/marketplace-agents`, `apps/shared`, `packages/shared-types`, `apps/ml-training`.

Reused, not duplicated: `deploy-developers.yml` (Firebase deploy via `FirebaseExtended/action-hosting-deploy`, pinned SHA, rollback step) is the template for site deploys; `website-checks.yml` (Playwright + visual) and `lighthouse-ci.yml` (Lighthouse + axe) are extended to the new sites, not copied.

## PRs (each ≤ ~400 reviewable lines, one concern)

1. **ci(marketplace): deploy marketplace.ferni.ai on merge, preview channel per PR.** Mirror `deploy-developers.yml` for site `ferni-marketplace` (paths: `apps/website/marketplace-portal/**`). Post-deploy smoke: the home page and every internal link return 200. Fix the favicon and `/categories/` 404s in the same PR so the smoke check starts green.
2. **ci(design-system): deploy design.ferni.ai from the portal on merge, preview per PR.** Site `ferni-design-system` from `apps/website/design-system-portal` (`_site`). Remove the hosting block in `design-system/firebase.json` that targets the same site, so no second build can overwrite it. Same smoke check.
3. **ci(design-system): publish the npm packages when their version changes on main.** Replace the `[publish]`-commit trigger: publish `@ferni/design-system` and `@ferni/react` when `package.json` `version` is not yet on npm, with `--provenance` (OIDC) and skip-if-exists. **Blocked on the owner** (below).
4. **ci: build and test checks for the apps with none.** One workflow, a job per app, path-filtered: `marketing`, `macos-menubar` (build on `macos-latest`), `marketplace-agents` (validate `registry.json` against the bundles), `shared`, `shared-types` (typecheck), `ml-training` (ruff + import check only).
5. **ci(sites): link check and freshness check across all four sites.** Weekly and after each deploy: `lychee` over ferni.ai, developers, marketplace, design. A **freshness check** fails when a site's source on main changed more than 2 days before its live `last-modified`, or when a scheduled workflow (Blog Drafts, Design System nightly) has not succeeded in its last two runs. This is the check that would have caught all three findings above.
6. **ci(lighthouse): gates that can fail.** `lighthouse-ci.yml` runs axe with `|| true` and fails only on critical. Make serious violations fail, add the marketplace and design sites, and set performance budgets per site. Mutation-test it: a page with a known violation must turn it red.

## Owner-only (cannot be done by an agent)

- Add the `ANTHROPIC_API_KEY` repo secret, then run Blog Drafts by hand (unblocks the blog now; #3927 makes a missing key visible).
- npm: confirm you own the `@ferni` org (it holds only `spell-mkr` today), then add an automation `NPM_TOKEN` secret, or set up npm trusted publishing for this repo. Publishing a version is public and permanent.
- Confirm the `FIREBASE_SERVICE_ACCOUNT` secret can deploy the `ferni-marketplace` and `ferni-design-system` sites (PR 1 and 2 check this on their preview channel first).

## Order and parallelism

PRs 1, 2, 4 and 5 touch separate files and can be built in parallel. PR 6 follows 1 and 2 (it covers their sites). PR 3 waits on the npm decision. The repo has 30 open PRs (limit 25), so these should land one at a time through the queue, each verified on its head.

## Done means

Each site redeploys on merge without a person, a stale site or a failing schedule turns a check red within a week, every new gate has been seen to fail, and the npm packages exist at their current versions.
