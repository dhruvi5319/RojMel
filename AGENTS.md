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

**A form that saved must get out of the way.** `ActionForm` closes whatever
disclosure it sits in — `Collapsible` or `EditableRow` provide the close through
`DisclosureContext` — about a second after a save, long enough to read "Saved".
A form still sitting open with its fields full reads as "nothing happened",
which is the one thing it must not say. `stayOpen` opts out, for a form that is
meant to be used again straight away.

**The shift has hours, and the clock decides which one.** The day runs 7am to
7pm and the night 7pm to 7am (`SHIFTS` in `src/lib/shifts.ts`). The counter
never asks which shift it is — it reads the clock — and everything written on
the device is tagged to that shift. The office still sees both on `/shifts`.

**The pump's working day rolls at 7am, not at midnight.** At 2am the forecourt
is still working the shift that started last evening, and what it sells belongs
to that day's book; without this a slip written at 2am lands on tomorrow and
splits one night's takings across two days so neither tallies. `pump_day()` in
SQL and `businessDateAt()` in TS, and they must agree. The counter's RLS asks
`pump_day()`, not `current_date` — pinning it to the calendar meant the device
could see its own shift and not write to it between midnight and 7am, and a
blocked insert says nothing. `credit_sales.business_date` and
`expenses.business_date` default to it too.

**A shift has several fillers, and the meter belongs to the shift.** Any one of
them reads it, so the counter does not ask who is holding the device before it
will show anything. It asks only where the answer matters: an udhaar slip goes
against whoever served the lorry, so that form asks "Who is serving?" at the
moment it counts. A filler works one shift and there is no way from their
screen into the other one.

**Nothing on the counter is written in the first person.** The device is
shared by everybody on the shift, so "My shift is finished" was a button
claiming the shift belonged to whoever happened to press it. It is *the* shift
— the shift is finished, the shift is running — and anyone standing there can
start it or close it. Same in the code: `finishShift`, not `closeMyShift`.

**The counter is three tabs, because it is three errands.** *Shift* — start it,
read the meters, see the hissab, finish it. *Who is on* — the fillers standing
there. *Udhaar* — the slips written during it.

**One reading per nozzle, taken at the start of the shift.** At 7am and again
at 7pm somebody from the shift coming on walks the forecourt and writes down
what every nozzle says. That one set of numbers is two things — the opening of
the shift starting and the closing of the shift ending — so
`record_meter_reading()` takes it once and writes both, and nobody is asked for
a closing figure that has already been written down next door.
`closing_reading` cannot be null and may not be below opening, so a shift that
has only just started carries closing = opening: nothing sold yet.
`v_shift_meters` is the walk, pumps first and then the CNG island.

**Who is on a shift is two facts, not one.** `staff.default_shift` is the
roster the office keeps; `shift_fillers` is who actually worked a given shift,
seeded from the roster by a trigger when the shift opens and then belonging to
the shift — changing the roster later does not rewrite who was standing there.
Somebody covering a colleague is added on the device and marked `covering`,
because that is decided on the forecourt at 6.55am, not in the office.

**The dip is per tank, not per nozzle.** Nozzles have meters; tanks have dips.

**The shift is the filler's until the office agrees it.** A filler opens and
closes their own shift on the counter (`close_shift`, `reopen_shift`) — they are
the one who handed the money over. Their readings and handover stay theirs to
correct while the shift is anything but `approved`; the counter's RLS reads that
status, not `open`. `approve_shift()` is the office's act and the line: past it
only an owner or manager can reopen. Approving is a shift, not a day — the day
lock in `day_closings` is separate and still applies on top.

**Accounts are made for people, never by them.** There is no sign-up, and
there must not be. The chain is: a **super admin** (`platform_admins`, outside
every station, deliberately not a `user_role`) creates a pump and its first
owner with `admin_create_pump()`; the **owner** adds and removes the office
accounts with `add_office_account()` / `set_account_active()`; the owner or
manager adds the **fillers**, who have no login at all and are `staff` rows.
Removing somebody sets `is_active` false — their name is on shifts, slips and
the audit trail — and `getSession()` refuses an inactive profile, so the login
stops working immediately. Everyone with an account changes their own password
on `/account`, which checks the current one first.

**The service key stays on the server.** Creating a login is Supabase's admin
API, so `SUPABASE_SERVICE_ROLE_KEY` is read only inside `src/lib/supabase/admin.ts`
and never given a `NEXT_PUBLIC_` prefix. It bypasses every RLS policy, so every
caller proves who is asking through the ordinary session client first, and the
station boundary is re-checked in the action. The station and profile rows go in
through SQL functions as the real user, so the audit trail names who did it —
only `auth.users` is touched with the key.

**An audited actor is a login, not one of a pump's people.** `audit_log.actor_id`
references `auth.users`, not `profiles`: the super admin has no profile, and
pointing it at `profiles` meant the one act they exist for failed on its own
audit trigger. `v_audit` says "Super admin" where there is no profile to name.

**Whose job is whose.** The fillers do the day as it happens — meters, slips,
the cash they hand over, and starting and finishing their own shift. The
manager checks it and hands it to the owner. The owner looks it over and
closes the day, and `approve_day()` refuses anyone else. Owner and manager can
both still edit anything; the split is about what each is *shown* first, so
neither sits waiting on a step that is not theirs. Today's rhythm tags each
step with whose it is, and the quick actions differ by role. Do not implement
this by hiding pages — every back-office page stays reachable through the tabs.

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

**The owner receives the tanker.** A delivery is the one entry that adds stock
and it arrives with a depot invoice worth several lakh, so `fuel_deliveries` and
`fuel_purchases` are owner-write and back-office-read (0029). The manager reads
every delivery — she cannot check a day against stock she cannot see — but gets
no form and no pencil. Dips are untouched: they are taken every shift, by
whoever is there.

**The depot's invoice reads in kilolitres, and has two taxes.** Modelled from a
real BPCL tax invoice (0030), and the arithmetic is asserted against it to the
paisa in `test:db`:

- The rate is printed **per kilolitre** (`rate_per_kl`), not per litre.
- **The basic amount is copied off the paper, never recomputed from the rate.**
  5 KL at the printed 81,326.69/KL is 406,633.45; the invoice says 406,633.46,
  because the depot bills a per-litre rate carried further than it prints.
- There is a `delivery_charge` (DLY/TAXABLE CHARGE) per product, taxed with it.
- **CESS is charged on the basic plus the delivery charge plus the VAT**, not on
  the basic alone. Getting that wrong understates a 20 KL load by ~₹2,000.
- VAT differs by product (13.7% petrol, 14.9% diesel), so it is per line.
- The invoice covers the whole tanker, so its number, date and rounding line sit
  on `fuel_deliveries`; only the amounts stay in the owner-only cost table.

`purchase_invoice_line()` does the arithmetic and `record_purchase_invoice()` is
the only way in. `src/lib/invoice.ts` mirrors it in TypeScript purely so the
owner can check the total against the paper before saving — Postgres remains the
authority, and the two must stay in step.

**No tax rate is ever assumed.** Both `vat_rate` and `cess_rate` are columns on
the line with no default: VAT differs by product on a single invoice and both
rates move when the state moves them. CNG goes through the same function
(`record_cng_invoice()`, 0031) so the gas and the liquid cannot drift apart.
`v_last_purchase_tax` shows what was typed last time per fuel **as a hint beside
an empty box, never as a default** — a rate that fills itself in is a rate
nobody checks. `test:db` runs the function through five different rate pairs,
including a load with no cess at all, to prove nothing is baked in.

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

On the counter device, never the first person. It is shared by everyone on the
shift, so "my", "mine" and "yours" all claim something for whoever is holding
it. The shift is *the* shift.

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
