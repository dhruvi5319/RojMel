# Rojmel — રોજમેળ

Daily sales, credit customers and billing for a petrol pump, replacing the
paper books. Built for one pump in India: works on a phone at the forecourt and
on a desktop in the office, in English or Gujarati.

*Rojmel* is the Gujarati name for the daily cash book — *roj*, daily, and *mel*,
to tally. It is the ledger this app replaces, so it seemed the right thing to
call it.

## The look

Warm paper ground, terracotta accent, Caprasimo headings — from the Claude
Design project *Rojmel petrol pump mockups*. Every page lives behind one of four
doors — **Today**, **Udhaar**, **Pump**, **More** — and a single date in the
header governs the whole day.

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

## How the money works

The nozzle meter counts every litre that leaves the pump, whoever paid and
however they paid. A credit sale is therefore **not** extra sales on top of the
meter — it is the slice of metered sales that went out on udhaar:

```
cash/UPI/card expected from the fillers = meter sales − credit sales
```

Credit sales are never added to meter sales anywhere in the code. Test fuel is
poured back into the tank, so it is subtracted from litres sold but not from
stock.

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

### 3. Create the logins

In Supabase, **Authentication → Users → Add user**, one per person — your
father, your brother, the manager, and one for the shared counter device
(e.g. `counter@yourpump.in`). Tick **Auto Confirm User**.

### 4. Create the pump

Open `supabase/setup/create_pump.sql`, change the values at the top to your
pump's real details and those email addresses, then run the whole file in the
SQL editor. It creates the station, links each person to their role, and sets
up petrol/diesel with two tanks and four nozzles as a starting point — all
editable afterwards under Settings.

### 5. Point the app at the project

```bash
cp .env.local.example .env.local     # then paste in your URL and anon key
npm install
npm run dev
```

The values come from Supabase → Settings → API. Until they are filled in the
app shows a setup page rather than a network error.

### 6. First things to do in the app

1. **Settings** — check the pump details, fuels, rates, tanks and nozzles.
2. **Staff** — add the fillers. Give them a 4-digit counter PIN if you want one.
3. **Customers** — add each transport company, and put what they *already owe*
   in **Opening balance**, so the app starts from where the book left off.

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
