Vendored verbatim from PR #2958 (feat/activity-ledger-core) at 0579e472a: src/services/activity/{activity,activity-parse,activity-change}.ts.
recall.test.mjs replays the recall eval's seeded ledger docs through this applyChange/toActivity, and
switches to src/services/activity/ itself once #2958 is on main. Delete this folder then.
