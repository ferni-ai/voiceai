# Firestore indexes (project johnb-2025)
`firestore.indexes.json` declares what voiceai needs. The same project also hosts
another product (~118 live composite indexes: leads, pipeline, prospects,
clients, ...) that is NOT in this file.

## Never prune

Do NOT run `firebase deploy --only firestore:indexes --force`. `--force` deletes
every live index missing from the file, which removes the other product's
indexes (and voiceai's vector indexes if they ever drift out of the file).
Without `--force` it only prompts; answer no.

## Diff live vs declared (read-only)

```bash
gcloud firestore indexes composite list --project=johnb-2025 --format=json > /tmp/live.json
# declared, not live = queries fail FAILED_PRECONDITION (or index still CREATING)
# live, not declared = the other product's, or voiceai drift (grep src/ for the collection)
```

Compare (collectionGroup from `name`, queryScope, fields); ignore the trailing
`__name__` field and `density`. `state` must be `READY`, not `CREATING`.

## Apply one declared index

```bash
gcloud firestore indexes composite create --project=johnb-2025 \
  --collection-group=family_checkin_calls --query-scope=COLLECTION \
  --field-config=field-path=scheduleId,order=ascending \
  --field-config=field-path=callStartedAt,order=descending
```

Vector index: `--field-config=field-path=embedding,vector-config='{"dimension":768,"flat":"{}"}'`.
Field exemptions (`fieldOverrides` with `"indexes": []`):
`gcloud firestore indexes fields update <field> --collection-group=<name> --disable-indexes --project=johnb-2025`.

## Rules of thumb

- Declare the collection name the code queries (grep `.collection('x')` / `collectionGroup('x')`).
- Removing a declaration never deletes the live index; only `--force` or `gcloud ... delete` does.
- `src/tests/firestore-indexes-file.test.ts` guards vector indexes and name drift.
