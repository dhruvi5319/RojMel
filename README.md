# Rojmel — રોજમેળ

Daily sales, credit customers and billing for a petrol pump, replacing the
paper books. Built for one pump in India: works on a phone at the forecourt and
on a desktop in the office, in English or Gujarati.

*Rojmel* is the Gujarati name for the daily cash book — *roj*, daily, and *mel*,
to tally. It is the ledger this app replaces, so it seemed the right thing to
call it.

## The look

Warm paper ground, terracotta accent, Caprasimo headings — from the Claude
Design project *Rojmel petrol pump mockups*. Every page lives behind one of five
doors — **Today**, **Customers**, **Stock**, **Expense**, **More** — and a single date
in the header governs the whole day. Wording favours what the pump says over
what an accountant says: bills rather than invoices, still owed rather than
outstanding, money handed over rather than handover.

## Who uses it

| Role | Who | What they can do |
| --- | --- | --- |
| **Owner** | Father, brother | Everything, including purchase cost and margin. Only an owner approves the day. |
| **Manager** | The manager | Billing, customers, prices, expenses, staff, bank deposits. **Cannot see purchase cost or margin.** |
| **Counter** | Shared device at the pump | Fillers pick their name and record meter readings and udhaar slips. Sees no money beyond the slip being written. |

**Who can do what** (under More) shows this split read straight off the RLS
policies, so everyone can see the rules they work under. **Audit trail**
(owner only) shows the approvals and reopenings recorded in `audit_log`.

The permission split is enforced by Postgres row level security, not by hiding
buttons — a manager who called the API directly still could not read a purchase
rate.

## What it tracks

Petrol and diesel by the litre, CNG by the kilogram. Four ways money arrives at
the end of a shift — **cash**, **ATM** (the card machine), **UPI** and the
**BPCL card** — each reconciled against what the meters say was sold.

CNG has its own page under **Stock → CNG**. It comes on its own truck, weighed
in kilograms — the same unit the dispensers sell in — so its stock control is
plain arithmetic: what the trucks brought, less what was sold. There is no tank
to dip. Its opening and closing readings are entered with the shift, beside the
nozzles, so the day still tallies as one day.

The work divides the way it does at the pump. The **fillers** do the day as it
happens; the **manager** checks it and hands it over; the **owner** looks it
over and closes the day, which only he can do. Today's rhythm tags each step
with whose job it is, so neither the manager nor the owner is presented with
somebody else's work as if it were theirs — though both can edit anything.

A filler starts and finishes their own shift on the counter device, because
they are the one who hands the money over. Their figures stay theirs to correct
until an owner or manager presses **Agree these figures** on the shift — after
that only the office can reopen it.

The pump runs **two shifts**, day and night. Every udhaar slip says which one
it was written in — on the filler's own screen and in the office — because the
money log reconciles each shift separately, and a slip belonging to no shift
would make that shift look short by exactly its own amount.

Stock is dipped every shift by whoever is there. **A delivery is the owner's to
record**: it is the one entry that adds stock and it comes with a depot invoice
worth several lakh rupees. The manager reads every delivery — she cannot check a
day against stock she cannot see — but does not write one.

The delivery form is laid out in the order a BPCL tax invoice reads, so the
owner copies it straight across: quantity in **kilolitres**, the rate per KL,
the total value **as printed** (5 KL at 81,326.69/KL comes to 406,633.45, while
the invoice says 406,633.46 — the depot bills a rate carried further than it
prints, so the amount is copied, not recalculated), the delivery charge, VAT at
a rate that differs by product, and CESS — which is charged on the value, the
delivery charge *and* the VAT. The form totals it as you type so it can be held
against the paper before saving, and the arithmetic is checked against a real
invoice, to the paisa, in the test suite.

Neither tax rate is ever assumed — VAT differs by product on the same invoice
and both rates move — so nothing is filled in for you. Each box does show what
you typed last time for that fuel, as a hint. CNG is taxed through the very same
function, so the gas and the diesel can never disagree about how a cess works.

A delivery is a **tanker**, not a tankful: one trip
from the depot carries petrol and diesel in different compartments, so the
tanker number, seal and date are typed once and a line is added for each of our
tanks it decanted into. Each line keeps the ordered quantity, the challan
quantity and what actually went into the tank apart, so a short delivery is
visible rather than argued about, alongside the tanker's own dip at rest,
density, temperature and the water check. VAT on the purchase sits with the
cost, where only an owner can read it.

**Today's rate** sits at the top of the Today screen, because pump prices move
daily and every other figure is priced off it. Setting it is three taps, and the
app warns when a fuel is still on yesterday's price. The shift screen shows the
rate rather than asking for it.

**Everything is audited.** A database trigger records every insert, update and
delete — who, when, which record, and for a change, what the value was before.
Only an owner can read it, under More → Audit trail.

**Getting a bill out of the app.** A bill opens on its own page at
`/invoices/<id>/print` — no header, no tabs, A4, white — and the print sheet
opens with it, which is where a phone keeps *Save as PDF* and *Share*. A
customer's whole account history downloads as a CSV from their page, which is
what an accountant asks for.

**Money log** (Today → Money log) is the manager's book page. For every shift
it shows what each fuel sold — closing minus opening, times that day's rate —
beside the five ways the money arrived: cash, ATM, UPI, BPCL card and udhaar.
The two totals must meet. Where they don't, the difference is recorded against
that shift with a note, so the question "who was short, and why" has an answer
a month later.

**Calendar** (Today → Calendar) is every day the pump has traded. The month is
laid out with what each day sold, ringed for today, coloured for approved,
waiting, or out of balance — pick a date and that day's accounts open. The date
in the header is a date control too, so any day is one tap away from any dated
page.

## How the money works

The nozzle meter counts every litre that leaves the pump, whoever paid and
however they paid. A credit sale is therefore **not** extra sales on top of the
meter — it is the slice of metered sales that went out on udhaar:

```
cash/UPI/card expected from the fillers = meter sales − credit sales
```

Credit sales are never added to meter sales anywhere in the code. Test fuel is
poured back into the tank, so it is subtracted from litres sold but not from
stock. CNG sells in kilograms but its rupees join the same sum.

Of the four collection modes only **cash** reaches the cash box — ATM, UPI and
the BPCL card all settle to the bank, so none of them moves cash in hand.

Cash in hand is tracked the same way:

```
opening cash + cash collected + cash received from customers
             − cash expenses − cash paid to staff − bank deposits
```

## Setting it up

### 1. Create the Supabase project

Create a free project at [supabase.com](https://supabase.com). Choose the
**Mumbai (ap-south-1)** region so the pump is not talking to a server on the
other side of the world.

### 2. Run the migrations

In the Supabase SQL editor, run the files in `supabase/migrations` **in order**:

| File | What it does |
| --- | --- |
| `0001_schema.sql` | Tables |
| `0002_rls.sql` | Row level security — the role split |
| `0003_logic.sql` | Balances, stock, day summary, invoicing |
| `0004_grants_and_locks.sql` | Grants, and locking an approved day |
| `0005_timezone.sql` | Indian time, so the business day rolls at midnight IST |
| `0006_nozzle_state.sql` | Meter readings that fill themselves in |
| `0007_cash_position.sql` | Running cash position |
| `0008_reports.sql` | Reporting aggregates |

### 3. Make the first super admin

The super admin creates pumps and nothing else. Create one login for yourself
in **Authentication → Users → Add user** (tick **Auto Confirm User**), then in
the SQL editor:

```sql
insert into platform_admins (user_id, full_name)
select id, 'Your name' from auth.users where email = 'you@example.com';
```

This account belongs to no pump. It cannot read a day's takings, a customer
balance or a purchase rate — `admin_create_pump()` and `admin_list_pumps()`
are the only two things the database lets it do.

### 4. Point the app at the project

```bash
cp .env.local.example .env.local     # then paste in your URL and keys
npm install
npm run dev
```

The URL and anon key come from Supabase → Settings → API. **Also set
`SUPABASE_SERVICE_ROLE_KEY`** from the same page: creating a login goes
through Supabase's admin API, which needs it. It is read only on the server and
must never be given a `NEXT_PUBLIC_` prefix, because it bypasses every row
level security policy. Until the URL and anon key are filled in the app shows a
setup page rather than a network error.

### 5. Create the pump, from the app

Sign in as the super admin and you land on `/admin`. **Add a pump and its
owner** — the pump's details, and the owner's name, email and a first password
to tell them. That is the last time the super admin is needed:

- the **owner** adds and removes the office accounts under
  **More → Who can sign in** — a second owner, the manager, and the one login
  for the shared counter device. Managers change; this is why it is his to do
  and not an administrator's.
- the **owner or manager** adds the **fillers** under **Expense → Staff**.
  Fillers have no login at all: they pick their name on the counter device.
- **everyone** changes their own password under **More → My login**.

Nobody can sign themselves up, at any point.

### 6. First things to do in the app

1. **Settings** — check the pump details, fuels, rates, tanks and nozzles.
2. **Staff** — add the fillers. Give them a 4-digit counter PIN if you want one.
3. **Customers** — add each transport company, and put what they *already owe*
   in **Opening balance**, so the app starts from where the book left off.

## Signing in

Five kinds of login, and **fillers do not have one**.

| Who | Signs in as | Lands on |
| --- | --- | --- |
| Super admin | their own email, in `platform_admins` | `/admin` — makes pumps, sees nothing inside one |
| Owner | their own email | the pump, everything |
| Manager | their own email | the pump, all but the six owner-only things |
| Counter device | one shared login per pump | `/counter`, and cannot leave it |
| Filler | — | taps their name on the counter device |

The counter device is a login *for the device*, not for a person: sign it in
once on the phone or tablet at the nozzle and leave it signed in. It opens on
the shift being worked — the day runs 7am to 7pm, the night 7pm to 7am, and the
clock decides which, so nobody is asked. A shift has several fillers and any one
of them reads the meter, so the device does not ask who is holding it before it
will show anything. It asks only where the answer matters: an udhaar slip goes
against whoever served the lorry.

The pump's working day rolls at **7am**, with the day shift. At 2am the people
on the forecourt are still working last evening's night shift, and what they
sell belongs to that day's book rather than to the date the clock has just
rolled over to. Give a filler a 4-digit PIN under
**Staff** if you want the name to be confirmed before it is used; without one it
is a single tap, which is usually what you want with a queue at the pump.

A counter login cannot reach the office pages at all. Type `/moneylog` into the
device and it goes straight back to the counter screen, so there is nothing to
find by poking around.

Passwords: the super admin sets the owner's first one, the owner sets everyone
else's, and **everyone changes their own under More → My login**. Nobody can
sign themselves up.

### The seeded logins, for local development

`supabase/setup/create_pump.sql` and the test suites use one password for all of
them — **`pumpbook123`**. It is a development convenience and has no business in
a real pump.

| Email | Role |
| --- | --- |
| `super@test.in` | super admin (no pump) |
| `father@test.in` | owner |
| `brother@test.in` | owner |
| `manager@test.in` | manager |
| `counter@test.in` | counter device |

## The daily rhythm

- **During the day** — the counter device records meter readings per shift and
  writes udhaar slips. Or the manager enters them from the office.
- **End of shift** — each filler's cash, UPI and card handover goes in. The app
  says immediately whether they are square.
- **Evening** — the manager opens **Day close**, counts the cash, and sends the
  day to the owner. Cash expected vs cash counted is right there.
- **Owner approves** — this locks the day. Nobody but an owner can change a
  figure afterwards, and reopening is recorded with a reason.
- **Monthly** — **Invoices → Raise invoice** bundles a customer's unbilled slips
  for the period into one numbered bill (`RP/2026-27/0001`), ready to print.

## Running it locally

With Docker running:

```bash
supabase start                             # applies every migration
node supabase/test/api-check.mjs           # exercises the whole data layer
```

`.env.local` in this checkout already points at that local stack.

## Tests

The money and the permission split are tested, because they are the parts that
must not be wrong.

```bash
npm run test:db      # 51 assertions against a throwaway Postgres
npm run test:api     # the same, through the real Supabase API
npm run test:e2e     # 37 checks driving the actual UI in a browser
```

`test:e2e` needs the app running (`npm run dev`, or a production build on
`BASE_URL`). It creates, edits and deletes a record on every page and checks
the change shows immediately **and** survives a reload — the two ways a save
can appear to work and not.

`test:db` rebuilds a throwaway database from the migrations and checks the
arithmetic by hand-worked example, the role boundaries, and the day lock.
`test:api` repeats it through PostgREST with real logins, and also checks every
embedded join the pages rely on.

## Where things live

```
src/app/(app)/      the back office: dashboard, shifts, credit, customers,
                    invoices, payments, stock, expenses, staff, bank, day,
                    reports, settings
src/app/counter/    the shared device at the pump
src/lib/i18n/       English and Gujarati; a missing translation is a build error
src/lib/format.ts   rupees in lakh/crore grouping, litres, Indian dates
supabase/migrations the schema, RLS and business logic
```

## Notes

- **Rates are never overwritten.** Changing a price adds a new row with its own
  effective time, so a slip written last Tuesday keeps last Tuesday's price.
- **Cancelling an invoice releases its slips** so they can go on a corrected
  bill instead of disappearing from the customer's next one.
- **Every entry can be corrected.** Expenses, deposits, payments, credit slips,
  deliveries and staff payments each open an edit form from the pencil on their
  row. A slip already on an invoice is frozen until that invoice is cancelled.
- **A refused change says so.** Row level security answers a forbidden update by
  changing nothing rather than raising an error, so every update and delete asks
  for its rows back and reports when none came — an approved day, or a
  permission the person does not have, never passes silently as "Saved".
- **The app needs internet.** It was built that way deliberately; offline-first
  sync would be a later phase.
