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

**Three fuels, two units.** `fuel_types.unit` is `L` or `kg`. Petrol and diesel
live in tanks with dips and arrive by tanker; CNG comes on its own truck and is
weighed in kilograms — the same unit the dispensers sell in, so it needs no
conversion and has no tank, no dip, no decanting. Its sales still fold into
`day_summary`, because the pump's day must tally as one day whatever the fuel
was measured in. CNG lives at `/cng` under Stock; its readings are entered with
the shift, beside the nozzles, and a truck may come twice in a day.

**The money log is the book.** `/moneylog` puts the two halves of the manager's
page side by side, per shift: what the meters say left the pump, fuel by fuel,
priced at that day's rate — against the five ways money arrives. The totals must
meet, and the difference belongs to the **shift**, not the day, because that is
the shift whose filler has to explain it. `v_shift_fuel_sales` and
`v_shift_money` do the arithmetic; `record_shift_variance()` writes the agreed
figure onto the shift with a note, recomputed in SQL so it cannot drift.

**Four ways money arrives.** cash · ATM (the card machine) · UPI · BPCL card — and **udhaar** is the fifth
way value leaves the pump, so `sold = cash + ATM + UPI + BPCL + udhaar`.
The BPCL card is a prepaid card BPCL issues to a customer, so the fuel is paid
for — it is a collection, never udhaar — but it settles to the bank and never
reaches the cash box. Only `cash_amount` does.

**Two shifts: day and night.** `src/lib/shifts.ts` names them once, and the
shift opener, the counter device and every slip form offer the same two — a
third name typed on one screen would be a shift the money log could never
reconcile. `ensure_day_shifts()` opens a day's pair; `shiftLabel()` turns the
stored name ('Day') into what the screen says ('Day shift', 'દિવસ શિફ્ટ').

**Every slip names its shift.** The udhaar written in front of a filler belongs
to their half of the day, so both slip forms require a shift and open it if the
day has not got to it yet — there is no blank option. A slip left off a shift
makes that shift look short by exactly the amount written during it, so
`attach_slip_to_shift()` falls back to the day's last shift rather than to
nothing. `v_unattached_udhaar` still exists for slips written before this rule.

**A filler answers for cash, and only cash.** The card machine and the UPI
account are the pump's, not the person's, so `shift_collections` rows with a
`staff_id` carry `cash_amount` alone — a check constraint says so. The other
modes go on the shift's own row, the one with no filler against it, entered on
the money log. Both rows are counted together.

**Test fuel goes back in the tank.** `litres = closing − opening − test`, and
test litres are not deducted from stock.

**The manager must never see purchase cost or margin.** Cost lives in
`fuel_purchase_costs`, which has an owner-only RLS policy, and margin comes only
from `margin_report()`, which raises for anyone else. Keep them there — do not
denormalise a rate onto `fuel_purchases`, `fuel_prices` or any view.

**Money is computed in Postgres, never in the client.** Amounts are generated
columns or SQL functions. The client formats; it does not calculate what is owed.

**A delivery is a tanker, not a tankful.** One trip from the depot brings
petrol and diesel in different compartments. The compartments are never logged;
what each of our own tanks received is. So `fuel_deliveries` is the trip — date,
tanker number, seal, who received it, typed once — and a `fuel_purchases` row
hangs off it per tank. A tanker with nothing decanted off it is deleted with its
last line.

**Stock follows what reached the tank.** A delivery line keeps three quantities
apart — `ordered_litres` indented, `invoice_litres` on the challan, and `litres`
actually decanted. Only the last moves stock. The tanker's own dip is taken once
with the product at rest, before decanting. The date lives on the trip and a
trigger mirrors it onto every line, because the stock arithmetic reads it there
— the trip is the authority, so the two can never disagree.

**The rate is set once, for the pump, on Today.** Every figure downstream is
priced off it — litres times rate is the day's sale, and the day's sale minus
udhaar is the cash the fillers owe. So the shift form *shows* the rate and never
asks for it: two nozzles disagreeing would make a filler look short for someone
else's typo. `v_fuel_rates` carries the rate in force and whether it was set
today.

**The equipment is the owner's; the price is the manager's.** `fuel_types`,
`tanks`, `nozzles` and `cng_dispensers` are owner-write, back-office-read, and
a trigger refuses to delete one that has already priced a sale — retire it with
`is_active`. `fuel_prices` stays writable by the manager, because pump prices
move daily.

**Every write is audited by a trigger, not by the app.** `audit_write()` is
attached to every business table, so a new screen cannot forget to log. Updates
store only the fields that moved, as `[was, now]`; PINs are redacted; only an
owner can read `v_audit` back.

**Rates are append-only.** Changing a price inserts a new `fuel_prices` row with
its own `effective_from`. Never update an existing rate. `created_by` defaults to
`auth.uid()` in the database, so the history page can always say who set it
without a screen having to remember to pass it.

**Every UPDATE and DELETE must prove it changed something.** Postgres row level
security answers a forbidden write by matching no rows and returning 204, not by
raising. Chain `.select('id')` and pass the result through `changed()` in
`src/lib/actions.ts`; without it the app reports "Saved" while nothing happened.
The same applies to the day lock, which refuses writes via a trigger.

## The design

The look comes from the Claude Design project *Rojmel petrol pump mockups*
(`RojMel App - All Screens.dc.html`) and its "organic" design system. Tokens in
`src/app/globals.css` are copied from that system's `styles.css` — warm ground,
terracotta accent, olive for anything settled or tallied, Caprasimo headings on
Figtree body. Retune colour there, not in components.

The shell groups all pages behind a few doors — **Today, Customers, Stock,
Expense, More** (`src/lib/nav.ts`). A door is named for what is behind it, not
for the trade's word for it, and never shares its name with a page inside it —
hence "All customers", "Petrol & diesel", "Running costs" as the pills. The mockups proposed four, but "Pump" had become a
junk drawer holding both the fuel and the money going out, and nobody hunting
for the bank deposit looks under Pump. Each door's contents must match its name;
if one starts holding two ideas, split it rather than widening the label.

One date control in the header governs every dated page — arrows for yesterday
and tomorrow, and the label itself is a date input so any day is one tap away.
Individual pages must not grow their own date picker. `/daybook` lays the month
out as a calendar over `v_day_book`; picking a date opens that day's money log.

The `PROPOSAL` badges from the design review are gone from the running app — it
is in daily use and the word means nothing to a pump owner.

## Paper

A bill is the only thing in here a customer ever sees. `BillDocument` is shared
by the screen and by `/invoices/[id]/print`, so glass and paper can never
disagree; the print route has no app shell and opens the print sheet itself.
Anything printable needs `print-plain`, and `@media print` forces white — the
warm ground is for phones, not for a customer's toner. A bill carries the amount
in words and a line to sign, as an Indian bill is expected to.

## Words

This is read by people who are not fluent in English, and Gujarati is a toggle
rather than a translation of jargon. Prefer what the pump actually says:
**bill** not invoice, **still owed** not outstanding, **money handed over** not
handover, **to collect** not counter sales, **less than expected** not short
collection, **account history** not ledger, **change history** not audit trail,
**should be in tank** not book stock, **running costs** not operating expenses.
Local words that are already the plainest available — udhaar, challan, dip —
stay.

## Conventions

- Business dates are Indian — `today_ist()` in SQL, `todayIST()` in TS. The
  database timezone is `Asia/Kolkata` (migration 0005).
- `station_id` defaults to `auth_station_id()`; inserts should omit it.
- Every user-facing string goes through `src/lib/i18n/dict.ts`. `gu` is typed
  against `en`, so a missing Gujarati string fails the build.
- Server components fetch; mutations are server actions returning `FormState`.

## Tests

`supabase/test/run.sh` globs `supabase/migrations/*.sql` — never list them by
hand, or a new migration silently goes untested.

```bash
npm run test:db    # schema, RLS, arithmetic — throwaway Postgres
npm run test:api   # the same through the real API (needs `supabase start`)
npm run test:e2e   # drives the real UI; needs the app running
```

Any change to the money rules above needs an assertion in `test:db` and
`test:api`. Any new create/edit/delete needs one in `test:e2e`, which asserts a
change shows without a reload *and* survives one.
