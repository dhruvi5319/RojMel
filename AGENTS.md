<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rojmel

A petrol pump's daily book: shift meter readings, credit (udhaar) customers,
monthly billing, stock, expenses, staff and bank deposits. Next.js + Supabase.
Real software for a family business, not a demo — see README.md.

## Rules that must not be broken

**Credit sales are already inside meter sales.** The nozzle meter counts every
litre that leaves the pump. A credit sale is the slice of that which went out on
udhaar, so `cash expected = meter sales − credit sales`. Never add the two.

**Test fuel goes back in the tank.** `litres = closing − opening − test`, and
test litres are not deducted from stock.

**The manager must never see purchase cost or margin.** Cost lives in
`fuel_purchase_costs`, which has an owner-only RLS policy, and margin comes only
from `margin_report()`, which raises for anyone else. Keep them there — do not
denormalise a rate onto `fuel_purchases`, `fuel_prices` or any view.

**Money is computed in Postgres, never in the client.** Amounts are generated
columns or SQL functions. The client formats; it does not calculate what is owed.

**Rates are append-only.** Changing a price inserts a new `fuel_prices` row with
its own `effective_from`. Never update an existing rate.

**Every UPDATE and DELETE must prove it changed something.** Postgres row level
security answers a forbidden write by matching no rows and returning 204, not by
raising. Chain `.select('id')` and pass the result through `changed()` in
`src/lib/actions.ts`; without it the app reports "Saved" while nothing happened.
The same applies to the day lock, which refuses writes via a trigger.

## Conventions

- Business dates are Indian — `today_ist()` in SQL, `todayIST()` in TS. The
  database timezone is `Asia/Kolkata` (migration 0005).
- `station_id` defaults to `auth_station_id()`; inserts should omit it.
- Every user-facing string goes through `src/lib/i18n/dict.ts`. `gu` is typed
  against `en`, so a missing Gujarati string fails the build.
- Server components fetch; mutations are server actions returning `FormState`.

## Tests

```bash
npm run test:db    # schema, RLS, arithmetic — throwaway Postgres
npm run test:api   # the same through the real API (needs `supabase start`)
npm run test:e2e   # drives the real UI; needs the app running
```

Any change to the money rules above needs an assertion in `test:db` and
`test:api`. Any new create/edit/delete needs one in `test:e2e`, which asserts a
change shows without a reload *and* survives one.
