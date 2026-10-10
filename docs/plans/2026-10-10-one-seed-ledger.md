# One seed ledger, on the server

## Why

Seeds live in three ledgers that never sync (map, 2026-10-10):

- **Browser `ferni_cosmetics.seedBalance`** (`cosmetics.service.ts`): the balance people
  see and spend in the shop. Every web earn writes here only.
- **Browser `ferni_seed_balance`**: the roadmap panel's cache of the server balance.
- **Server `user_seeds/{uid}`**, written by three uncoordinated paths
  (`seeds-routes.ts`, `roadmap-routes.ts`, `engagement/seed-economy.ts`) with different
  starter balances (25 / 10 / 5) and `earnedFrom` shapes.

Results: a referral pays 25 on the server and 25 + 100 in the browser; a conversation
pays +1 on the server and +5 in the browser; gifting deducts on the server but not in
the browser; payment bonuses are awarded on the browser's word; cosmetics owned on one
device are missing on another.

## Decisions (user, 2026-10-10)

1. **Earn rules:** keep the app's rules, run by the server from facts it has.
2. **Existing balances:** one-time import of the browser balance, capped at 1000;
   balances of 10 000+ (the dev "unlock all") are ignored.
3. **Cosmetics:** ownership moves to the server.

## Shape

### The ledger (PR 1)

`src/services/seeds/ledger.ts`, the only writer of `user_seeds`:

```ts
applySeeds(uid, { delta, reason, key, meta? }): Promise<{ applied: boolean; balance: number }>
```

- One Firestore transaction. `key` is the idempotency key: the entry
  `user_seeds/{uid}/entries/{key}` records `{ delta, reason, balanceAfter, at, meta }`.
  If it exists, nothing changes and `applied: false` comes back with the balance.
- A missing account is created with **25** starter seeds (entry `starter`).
- A spend that would go below zero throws `InsufficientSeedsError`, writes nothing.
- `earnedFrom.<reason>` and `lifetimeEarned` / `lifetimeSpent` are kept in the same write.

Keys: `daily:<localDate>`, `streak:<days>:<streakStart>`, `referral:<referrer>:<newUser>`,
`stripe:<paymentIntentId>`, `stripe-sub:<subscriptionId>:founding`, `gift:<giftId>`,
`purchase:<itemId>`, `vote:<voteId>`, `import:local`.

The three existing server writers move onto it unchanged in behaviour, except the
starter balance, which becomes 25 everywhere.

### Earn rules on the server (PR 2)

| Rule | Amount | Trigger (server fact) | Key |
|---|---|---|---|
| Day's first conversation | +5 | session end (`cleanup-handler.ts`) | `daily:<date>` |
| Streak milestones 7/14/30/60/100 days | 25/50/100/200/500 | same, after the daily entry | `streak:<n>:<start>` |
| Referral | +25 referrer, +25 new user | `POST /api/seeds/referral` | `referral:<a>:<b>` |
| One-time gift (Seed Fund) | 10/25/75/200 by amount | Stripe `payment_intent.succeeded` | `stripe:<pi>` |
| Monthly gift, founding tier | +50 ($10+), +150 ($20+) | first Stripe `invoice.paid` | `stripe-sub:<sub>:founding` |

Dates are the person's local date: stored profile timezone, else UTC (`api/local-clock.ts`).
The +1-per-conversation server rule and the browser's +100 referral bonus go away.
`ferni:goal-achieved` has no dispatcher today, so goals earn nothing until one exists.

### Spending and cosmetics on the server (PR 3)

- The cosmetics catalog's ids and prices move to a shared module both sides import
  (or a server copy with a test that the two agree).
- `POST /api/seeds/purchase { itemId }`: deducts the server price and records
  `ownedCosmetics` in the same transaction (`purchase:<itemId>` makes a retry free).
- Gift and roadmap vote/suggest go through `applySeeds`.

### Import and the web switch (PR 4, behind `seedsServerLedger`)

- `POST /api/seeds/import-local { balance, owned[] }`, once per account (`import:local`):
  credits `min(balance, 1000)` (nothing if `balance >= 10000`), and grants owned items
  that exist in the catalog.
- With the flag on, the web reads balance and ownership from `GET /api/seeds`, sends
  the import once, stops all local earns, and buys through the server.

### Flip and cleanup (PR 5)

Flag on by default; then remove the browser ledger and the earn listeners.

## Verification

- Ledger: idempotency (same key twice = one change), no negative balance, starter 25,
  concurrent applies (emulator) end at the right balance.
- Earns: each rule awards once per key, from its server trigger, with no web involvement.
- Import: capped, once, dev balances ignored.
- E2E (signed-in walk): balance shown equals the server's after a conversation,
  a purchase, and a gift; a second device sees the same balance and items.
